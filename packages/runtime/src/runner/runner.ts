import { evaluateCondition, type CheckContext } from '../checks/runners.js';
import type { MissionSnapshot, ResolvedSlot } from '../config/snapshot.js';
import type { CoreAgent, Feedback, KnowledgeSourceRef } from '../core-agent/index.js';
import type { CheckResult } from '../domain/check.js';
import { addCost, ZERO_COST, type Cost } from '../domain/cost.js';
import {
  CORE_SLOT_NAME,
  type MissionAttention,
  type MissionResult,
  type MissionState,
  type MissionSummary,
  type NeedsAttentionCause,
  type PendingQuestion,
  type SlotRecord,
} from '../domain/mission.js';
import type { Answers } from '../domain/transcript.js';
import type { AgentHandle, Engine } from '../engine/index.js';
import type { MissionEventInput } from '../events/mission-event.js';
import { buildGuard, type Workspace } from '../workspace/workspace.js';
import { buildContextBundle } from './context.js';

export interface RunnerDeps {
  engine: Engine;
  workspace: Workspace;
  core: CoreAgent;
  emit: (event: MissionEventInput) => void;
  /** Tuning knobs for tests and the Commander's environment. */
  ciPollIntervalMs?: number;
  ciNoneGraceMs?: number;
  /** Overrides the Workspace's CI wait timeout (tests). */
  ciWaitTimeoutMs?: number;
}

export interface MissionMeta {
  id: string;
  projectName: string;
  assemblyName: string;
  taskPath: string;
  taskTitle: string;
  taskDocuments: string[];
  workItemId?: string;
  configHome: string;
  /** Rendered once at start; null when the Workspace has none. */
  gitConventions: string | null;
  knowledgeSources: KnowledgeSourceRef[];
  startedAt: string;
}

type Control = { kind: 'stop' } | { kind: 'retry'; note?: string };

interface QueuedQuestion extends PendingQuestion {
  respond(answers: Answers): void;
  dismiss(): void;
}

type SlotExecution =
  { kind: 'output'; output: string } | { kind: 'interrupted' } | { kind: 'error'; message: string };

class Deferred<T> {
  resolve!: (value: T) => void;
  readonly promise = new Promise<T>((resolve) => {
    this.resolve = resolve;
  });
}

class StopRequested extends Error {
  constructor() {
    super('stop requested');
  }
}

/**
 * The deterministic state machine of one Mission. The Core is consulted only for text (prompts,
 * explanations, the report) and for `llm_judgment` Checks; every transition is plain code.
 */
export class Runner {
  state: MissionState = 'running';
  readonly summary: MissionSummary;
  readonly records = new Map<string, SlotRecord>();
  pendingQuestion: PendingQuestion | undefined;
  attention: MissionAttention | undefined;
  result: MissionResult | undefined;

  private stopRequested = false;
  private control: Deferred<Control> | null = null;
  private currentHandle: AgentHandle | null = null;
  /**
   * Questions the Pilot asked and the Commander has not answered, oldest first. A Pilot may ask
   * several in one turn (parallel tool calls); they are shown one at a time, and the Pilot resumes
   * when every one of them is answered, so none may be dropped.
   */
  private questions: QueuedQuestion[] = [];
  private checkAbort: AbortController | null = null;
  private readonly sessions = new Map<string, string>();
  private readonly slotOutputs = new Map<string, string>();
  private finished: Promise<void> | null = null;
  private totalCost: Cost = ZERO_COST;

  constructor(
    private readonly snapshot: MissionSnapshot,
    private readonly meta: MissionMeta,
    private readonly deps: RunnerDeps,
  ) {
    this.summary = {
      id: meta.id,
      projectName: meta.projectName,
      assemblyName: meta.assemblyName,
      taskPath: meta.taskPath,
      taskTitle: meta.taskTitle,
      ...(meta.workItemId !== undefined && { workItemId: meta.workItemId }),
      state: 'running',
      currentSlot: null,
      workspace: { ...deps.workspace.summary },
      startedAt: meta.startedAt,
      cost: { ...ZERO_COST, estimated: true },
    };
    for (const slot of snapshot.assembly.slots) {
      this.records.set(slot.name, {
        name: slot.name,
        attempts: 0,
        loops: 0,
        cost: ZERO_COST,
        checkResults: [],
      });
    }
    this.records.set(CORE_SLOT_NAME, {
      name: CORE_SLOT_NAME,
      attempts: 0,
      loops: 0,
      cost: ZERO_COST,
      checkResults: [],
    });
  }

  /** Slot records in Assembly order, then `core`. */
  slotRecords(): SlotRecord[] {
    return [...this.records.values()];
  }

  /** The Core's cost, reported by the Core client. */
  addCoreCost(cost: Cost): void {
    this.addCost(CORE_SLOT_NAME, cost);
  }

  run(): Promise<void> {
    if (!this.finished) {
      this.finished = this.execute().catch((error: unknown) => {
        if (!(error instanceof StopRequested)) {
          this.deps.emit({
            type: 'agent.error',
            missionId: this.meta.id,
            slot: this.summary.currentSlot ?? CORE_SLOT_NAME,
            payload: { type: 'error', message: `Runner failed: ${String(error)}` },
          });
        }
        this.finishStopped();
      });
    }
    return this.finished;
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'completed') return;
    this.stopRequested = true;
    for (const question of this.questions) question.dismiss();
    this.questions = [];
    this.checkAbort?.abort();
    await this.currentHandle?.interrupt();
    await this.deps.core.interrupt();
    this.control?.resolve({ kind: 'stop' });
    await this.finished;
  }

  retry(note?: string): void {
    if (this.state !== 'needs_attention' || !this.control) {
      throw new MissionStateError(
        'not_needs_attention',
        'Retry is possible only in Needs Attention',
      );
    }
    this.control.resolve(
      note !== undefined && note.trim() !== ''
        ? { kind: 'retry', note: note.trim() }
        : { kind: 'retry' },
    );
  }

  answer(questionId: string, answers: Answers): void {
    const question = this.questions[0];
    if (!question || question.id !== questionId) {
      throw new MissionStateError('no_such_question', `No pending question ${questionId}`);
    }
    this.questions.shift();
    this.pendingQuestion = undefined;
    question.respond(answers);
    this.deps.emit({
      type: 'question.answered',
      missionId: this.meta.id,
      slot: question.slot,
      questionId,
      answers,
    });
    const next = this.questions[0];
    if (next) this.present(next);
    else this.setState('running');
  }

  /** Shows one queued question to the Commander and waits for them. */
  private present(question: QueuedQuestion): void {
    this.pendingQuestion = { id: question.id, slot: question.slot, questions: question.questions };
    this.deps.emit({
      type: 'question.asked',
      missionId: this.meta.id,
      slot: question.slot,
      questionId: question.id,
      questions: question.questions,
    });
    this.setState('waiting_for_owner', { slot: question.slot });
  }

  // ---- the state machine ----

  private async execute(): Promise<void> {
    const slots = this.snapshot.assembly.slots;
    const attempts = new Map<string, number>();
    const loopCounts = new Map<string, number>();
    let index = 0;
    let feedback: Feedback | undefined;
    let loopEntry: { from: string; iteration: number } | undefined;
    let note: string | undefined;

    for (;;) {
      this.throwIfStopping();
      const slot = slots[index]!;
      const record = this.records.get(slot.name)!;
      const attempt = (attempts.get(slot.name) ?? 0) + 1;
      attempts.set(slot.name, attempt);
      record.attempts += 1;
      this.summary.currentSlot = slot.name;
      this.deps.emit({
        type: 'slot.started',
        missionId: this.meta.id,
        slot: slot.name,
        attempt,
        ...(loopEntry && { loopIteration: loopEntry.iteration, loopFrom: loopEntry.from }),
        ...(note !== undefined && { note }),
      });
      note = undefined;

      const execution = await this.executeSlot(slot, feedback);
      this.throwIfStopping();
      await this.refreshWorkspace();

      if (execution.kind === 'error') {
        const control = await this.needsAttention('engine_error', slot, [], execution.message);
        if (control.kind === 'retry') {
          feedback = {
            kind: 'attempt',
            failedChecks: [],
            ...(control.note !== undefined && { note: control.note }),
          };
          note = control.note;
          continue;
        }
        return this.finishStopped();
      }
      if (execution.kind === 'interrupted') throw new StopRequested();

      const output = execution.output;
      const done = await this.evaluate(slot, slot.doneCondition, output);
      this.throwIfStopping();
      record.checkResults = done.results;

      if (done.timedOut) {
        const control = await this.needsAttention('ci_timeout', slot, done.results);
        if (control.kind === 'stop') return this.finishStopped();
        feedback = {
          kind: 'attempt',
          failedChecks: done.results,
          ...(control.note !== undefined && { note: control.note }),
        };
        note = control.note;
        continue;
      }

      // At the Loop limit the Accept Condition may stand in for the Done Condition (plan B).
      const acceptance = done.holds
        ? undefined
        : await this.acceptAtLoopLimit(slot, output, loopCounts.get(slot.name) ?? 0);
      if (acceptance) record.checkResults = [...done.results, ...acceptance.results];

      if (done.holds || acceptance?.holds) {
        this.slotOutputs.set(slot.name, output);
        record.lastOutput = output;
        this.deps.emit({
          type: 'slot.done',
          missionId: this.meta.id,
          slot: slot.name,
          output,
          ...(acceptance?.holds && { acceptedAtLimit: true }),
        });
        if (slot.exitPoint) {
          const exit = await this.evaluate(slot, slot.exitCondition, output);
          this.throwIfStopping();
          if (exit.holds) return this.complete(slot);
          if (exit.timedOut || index === slots.length - 1) {
            const cause: NeedsAttentionCause = exit.timedOut
              ? 'ci_timeout'
              : 'last_exit_condition_failed';
            const control = await this.needsAttention(cause, slot, exit.results);
            if (control.kind === 'stop') return this.finishStopped();
            feedback = {
              kind: 'attempt',
              failedChecks: exit.results,
              ...(control.note !== undefined && { note: control.note }),
            };
            note = control.note;
            continue;
          }
        }
        index += 1;
        // A forward move starts the next Slot's Attempt count afresh (a Loop does the same for its target).
        attempts.set(slots[index]!.name, 0);
        feedback = undefined;
        loopEntry = undefined;
        continue;
      }

      const failed = [...done.results, ...(acceptance?.results ?? [])].filter((r) => !r.holds);
      if (slot.loop) {
        const count = (loopCounts.get(slot.name) ?? 0) + 1;
        if (count > slot.loop.limit) {
          const control = await this.needsAttention('loop_limit', slot, failed);
          if (control.kind === 'stop') return this.finishStopped();
          feedback = {
            kind: 'attempt',
            failedChecks: failed,
            ...(control.note !== undefined && { note: control.note }),
          };
          note = control.note;
          continue;
        }
        loopCounts.set(slot.name, count);
        record.loops = count;
        const targetIndex = slots.findIndex((s) => s.name === slot.loop!.target);
        feedback = { kind: 'loop', fromSlot: slot.name, output, failedChecks: failed };
        loopEntry = { from: slot.name, iteration: count };
        attempts.set(slot.loop.target, 0);
        index = targetIndex;
        continue;
      }

      if (attempt >= slot.attemptLimit) {
        const control = await this.needsAttention('attempt_limit', slot, failed);
        if (control.kind === 'stop') return this.finishStopped();
        feedback = {
          kind: 'attempt',
          failedChecks: failed,
          ...(control.note !== undefined && { note: control.note }),
        };
        note = control.note;
        continue;
      }
      feedback = { kind: 'attempt', failedChecks: failed };
    }
  }

  private throwIfStopping(): void {
    if (this.stopRequested) throw new StopRequested();
  }

  /**
   * Judges the Loop's Accept Condition when the Loop limit is exhausted and the Done Condition
   * failed; undefined when the Slot has no Loop, the limit is not reached yet, or the Loop has
   * no Accept Condition. A timed-out Check never accepts.
   */
  private async acceptAtLoopLimit(
    slot: ResolvedSlot,
    output: string,
    loops: number,
  ): Promise<{ holds: boolean; results: CheckResult[] } | undefined> {
    const condition = slot.loop?.acceptCondition;
    if (!slot.loop || !condition || condition.length === 0 || loops < slot.loop.limit) {
      return undefined;
    }
    const accept = await this.evaluate(slot, condition, output);
    this.throwIfStopping();
    return { holds: accept.holds && !accept.timedOut, results: accept.results };
  }

  private async executeSlot(
    slot: ResolvedSlot,
    feedback: Feedback | undefined,
  ): Promise<SlotExecution> {
    const bundle = buildContextBundle(
      slot,
      { ...this.meta, workspace: this.deps.workspace.fragment },
      this.slotOutputs,
    );
    let prompt: string;
    try {
      prompt = await this.deps.core.composeSlotPrompt({
        slot,
        bundle,
        ...(feedback && { feedback }),
      });
    } catch (error) {
      if (this.stopRequested) return { kind: 'interrupted' };
      return {
        kind: 'error',
        message: `The Core could not compose the prompt: ${errorMessage(error)}`,
      };
    }
    if (this.stopRequested) return { kind: 'interrupted' };

    const resume = slot.memoryMode === 'persistent' ? this.sessions.get(slot.name) : undefined;
    const handle = this.deps.engine.createAgent({
      role: 'pilot',
      label: slot.name,
      model: slot.model,
      systemPrompt: { rules: slot.rules, instructions: slot.instructions },
      cwd: this.deps.workspace.cwd,
      additionalDirectories: [this.meta.taskPath],
      allowQuestions: slot.mayAskCommander,
      ...(resume !== undefined && { resumeSessionId: resume }),
      guard: buildGuard(this.deps.workspace, {
        taskPath: this.meta.taskPath,
        taskDocuments: this.meta.taskDocuments,
        configHome: this.meta.configHome,
      }),
    });
    this.currentHandle = handle;
    let output: string | null = null;
    let error: string | null = null;
    try {
      handle.send(prompt);
      for await (const event of handle.events()) {
        switch (event.type) {
          case 'text':
            this.deps.emit({
              type: 'agent.text',
              missionId: this.meta.id,
              slot: slot.name,
              payload: event,
            });
            break;
          case 'activity':
            this.deps.emit({
              type: 'agent.activity',
              missionId: this.meta.id,
              slot: slot.name,
              payload: event,
            });
            break;
          case 'tool_call':
            this.deps.emit({
              type: 'agent.tool_call',
              missionId: this.meta.id,
              slot: slot.name,
              payload: event,
            });
            break;
          case 'tool_result':
            this.deps.emit({
              type: 'agent.tool_result',
              missionId: this.meta.id,
              slot: slot.name,
              payload: event,
            });
            break;
          case 'error':
            error = event.message;
            this.deps.emit({
              type: 'agent.error',
              missionId: this.meta.id,
              slot: slot.name,
              payload: event,
            });
            break;
          case 'question':
            if (this.stopRequested) {
              event.dismiss();
              break;
            }
            this.questions.push({
              id: event.id,
              slot: slot.name,
              questions: event.questions,
              respond: event.respond,
              dismiss: event.dismiss,
            });
            // A second question while one is pending waits its turn; the Commander sees one at a time.
            if (this.questions.length === 1) this.present(this.questions[0]!);
            break;
          case 'result':
            output = event.output;
            this.sessions.set(slot.name, event.sessionId);
            this.addCost(slot.name, event.cost);
            break;
        }
      }
    } catch (caught) {
      error = errorMessage(caught);
    } finally {
      this.currentHandle = null;
      this.questions = [];
      this.pendingQuestion = undefined;
      await handle.close().catch(() => undefined);
    }
    if (this.stopRequested) return { kind: 'interrupted' };
    // An empty result is never a Slot Output: judging it would only burn an Attempt on "nothing to judge".
    if (output !== null && output.trim() === '') {
      return { kind: 'error', message: 'The Pilot ended without any output' };
    }
    if (output !== null) return { kind: 'output', output };
    return { kind: 'error', message: error ?? 'The agent ended without a result' };
  }

  private async evaluate(
    slot: ResolvedSlot,
    condition: readonly CheckResult['check'][],
    output: string,
  ) {
    this.checkAbort = new AbortController();
    const ctx: CheckContext = {
      workspace: this.deps.workspace,
      core: this.deps.core,
      slotOutput: output,
      signal: this.checkAbort.signal,
      ...(this.deps.ciWaitTimeoutMs !== undefined && {
        ciWaitTimeoutMs: this.deps.ciWaitTimeoutMs,
      }),
      ...(this.deps.ciPollIntervalMs !== undefined && {
        ciPollIntervalMs: this.deps.ciPollIntervalMs,
      }),
      ...(this.deps.ciNoneGraceMs !== undefined && { ciNoneGraceMs: this.deps.ciNoneGraceMs }),
    };
    try {
      return await evaluateCondition(condition, ctx, (result) => {
        this.deps.emit({
          type: 'check.evaluated',
          missionId: this.meta.id,
          slot: slot.name,
          check: result.check,
          holds: result.holds,
          detail: result.detail,
        });
      });
    } catch (error) {
      if (this.stopRequested) throw new StopRequested();
      const failed: CheckResult = {
        check: condition[0] ?? { kind: 'command', command: '' },
        holds: false,
        detail: `Check failed to run: ${errorMessage(error)}`,
      };
      this.deps.emit({
        type: 'check.evaluated',
        missionId: this.meta.id,
        slot: slot.name,
        check: failed.check,
        holds: false,
        detail: failed.detail,
      });
      return { holds: false, results: [failed], timedOut: false };
    } finally {
      this.checkAbort = null;
    }
  }

  private async needsAttention(
    cause: NeedsAttentionCause,
    slot: ResolvedSlot,
    failedChecks: CheckResult[],
    detail?: string,
  ): Promise<Control> {
    let reason: string;
    try {
      reason = await this.deps.core.explainNeedsAttention({ cause, slot, failedChecks });
      if (detail) reason = `${reason}\n\n${detail}`;
    } catch (error) {
      reason = detail ?? `The Core could not explain the situation: ${errorMessage(error)}`;
    }
    this.throwIfStopping();
    this.attention = { cause, reason, slot: slot.name, failedChecks };
    this.control = new Deferred<Control>();
    this.setState('needs_attention', { cause, reason, slot: slot.name, failedChecks });
    const control = await this.control.promise;
    this.control = null;
    if (control.kind === 'retry') {
      this.attention = undefined;
      this.setState('running');
    }
    return control;
  }

  private async complete(exitSlot: ResolvedSlot): Promise<void> {
    const pr = await this.deps.workspace.pullRequest();
    let report: string;
    try {
      report = await this.deps.core.finalReport({
        slots: this.slotRecords(),
        ...(pr && { pr }),
        workspace: this.deps.workspace.fragment,
      });
    } catch (error) {
      report = `The Core could not write the report: ${errorMessage(error)}`;
    }
    this.throwIfStopping();
    this.result = { report, pr, exitSlot: exitSlot.name };
    if (pr) this.summary.pr = pr;
    this.summary.currentSlot = null;
    this.setState('completed');
    this.deps.emit({
      type: 'mission.completed',
      missionId: this.meta.id,
      report,
      pr,
      exitSlot: exitSlot.name,
      slots: this.slotRecords(),
      cost: this.totalCost,
    });
  }

  private finishStopped(): void {
    if (this.state === 'stopped' || this.state === 'completed') return;
    this.attention = undefined;
    this.pendingQuestion = undefined;
    this.summary.currentSlot = null;
    this.setState('stopped');
    this.deps.emit({ type: 'mission.stopped', missionId: this.meta.id });
  }

  private setState(
    state: MissionState,
    extra: {
      cause?: NeedsAttentionCause;
      reason?: string;
      slot?: string;
      failedChecks?: CheckResult[];
    } = {},
  ): void {
    this.state = state;
    this.summary.state = state;
    this.deps.emit({ type: 'mission.state', missionId: this.meta.id, state, ...extra });
  }

  private addCost(slotName: string, cost: Cost): void {
    const record = this.records.get(slotName);
    if (!record) return;
    record.cost = addCost(record.cost, cost);
    this.totalCost = addCost(this.totalCost, cost);
    this.summary.cost = { ...this.totalCost, estimated: true };
    this.deps.emit({
      type: 'cost.updated',
      missionId: this.meta.id,
      slot: slotName,
      cost: record.cost,
      missionTotal: this.totalCost,
    });
  }

  /** A Slot may have switched branches; the summary follows the Workspace (SPEC FR-18). */
  private async refreshWorkspace(): Promise<void> {
    await this.deps.workspace.refresh();
    this.summary.workspace = { ...this.deps.workspace.summary };
  }
}

export class MissionStateError extends Error {
  constructor(
    readonly reason: 'not_needs_attention' | 'no_such_question' | 'not_finished' | 'not_found',
    message: string,
  ) {
    super(message);
    this.name = 'MissionStateError';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
