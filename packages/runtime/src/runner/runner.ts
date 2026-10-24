import { evaluateCondition, type CheckContext } from '../checks/runners.js';
import type { MissionSnapshot, ResolvedSlot } from '../config/snapshot.js';
import type { CoreAgent, Feedback } from '../core-agent/index.js';
import type { CheckResult } from '../domain/check.js';
import { addCost, ZERO_COST, type Cost } from '../domain/cost.js';
import type { PullRequestRef } from '../domain/host.js';
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
import type { AgentHandle, Engine, GuardContext } from '../engine/index.js';
import type { MissionEventInput } from '../events/mission-event.js';
import type { GitClient } from '../git/types.js';
import type { RepoHost } from '../host/index.js';
import { buildContextBundle } from './context.js';

export interface RunnerDeps {
  engine: Engine;
  host: RepoHost;
  git: GitClient;
  core: CoreAgent;
  emit: (event: MissionEventInput) => void;
  /** Tuning knobs for tests and the Commander's environment. */
  ciPollIntervalMs?: number;
  ciNoneGraceMs?: number;
  /** Overrides the Profile's CI wait timeout (tests). */
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
  checkoutPath: string;
  configHome: string;
  gitConventions: string;
  startedAt: string;
  branch: string | null;
}

type Control = { kind: 'stop' } | { kind: 'retry'; note?: string };

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
  private currentQuestion: { id: string; respond(answers: Answers): void; dismiss(): void } | null =
    null;
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
      branch: meta.branch,
      checkoutPath: meta.checkoutPath,
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
    this.currentQuestion?.dismiss();
    this.currentQuestion = null;
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
    if (!this.currentQuestion || this.currentQuestion.id !== questionId) {
      throw new MissionStateError('no_such_question', `No pending question ${questionId}`);
    }
    const question = this.currentQuestion;
    this.currentQuestion = null;
    this.pendingQuestion = undefined;
    question.respond(answers);
    this.deps.emit({
      type: 'question.answered',
      missionId: this.meta.id,
      slot: this.summary.currentSlot ?? '',
      questionId,
      answers,
    });
    this.setState('running');
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
      await this.refreshBranch();

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

      if (done.holds) {
        this.slotOutputs.set(slot.name, output);
        record.lastOutput = output;
        this.deps.emit({ type: 'slot.done', missionId: this.meta.id, slot: slot.name, output });
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

      const failed = done.results.filter((r) => !r.holds);
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

  private guard(): GuardContext {
    return {
      protectedBranch: this.snapshot.profile.repository.protectedBranch,
      checkoutPath: this.meta.checkoutPath,
      taskPath: this.meta.taskPath,
      configHome: this.meta.configHome,
    };
  }

  private async executeSlot(
    slot: ResolvedSlot,
    feedback: Feedback | undefined,
  ): Promise<SlotExecution> {
    const bundle = buildContextBundle(slot, this.snapshot, this.meta, this.slotOutputs);
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
      cwd: this.meta.checkoutPath,
      additionalDirectories: [this.meta.taskPath],
      allowQuestions: slot.mayAskCommander,
      ...(resume !== undefined && { resumeSessionId: resume }),
      guard: this.guard(),
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
            this.currentQuestion = { id: event.id, respond: event.respond, dismiss: event.dismiss };
            this.pendingQuestion = { id: event.id, slot: slot.name, questions: event.questions };
            this.deps.emit({
              type: 'question.asked',
              missionId: this.meta.id,
              slot: slot.name,
              questionId: event.id,
              questions: event.questions,
            });
            this.setState('waiting_for_owner', { slot: slot.name });
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
      this.currentQuestion = null;
      this.pendingQuestion = undefined;
      await handle.close().catch(() => undefined);
    }
    if (this.stopRequested) return { kind: 'interrupted' };
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
      checkoutPath: this.meta.checkoutPath,
      protectedBranch: this.snapshot.profile.repository.protectedBranch,
      host: this.deps.host,
      git: this.deps.git,
      core: this.deps.core,
      slotOutput: output,
      ciWaitTimeoutMs:
        this.deps.ciWaitTimeoutMs ?? this.snapshot.profile.ciWaitTimeoutMinutes * 60_000,
      signal: this.checkAbort.signal,
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
    const branch = this.summary.branch;
    let pr: PullRequestRef | null;
    try {
      pr = branch
        ? await this.deps.host.findPullRequest({ checkoutPath: this.meta.checkoutPath, branch })
        : null;
    } catch {
      pr = null;
    }
    let report: string;
    try {
      report = await this.deps.core.finalReport({ slots: this.slotRecords(), ...(pr && { pr }) });
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

  private async refreshBranch(): Promise<void> {
    try {
      this.summary.branch = await this.deps.git.currentBranch(this.meta.checkoutPath);
    } catch {
      // keep the last known branch
    }
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
