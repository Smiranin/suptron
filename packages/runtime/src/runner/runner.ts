import { evaluateCondition, type CheckContext } from '../checks/runners.js';
import type { MissionSnapshot, ResolvedSlot } from '../config/snapshot.js';
import type {
  AttentionDecision,
  CoreAgent,
  Feedback,
  KnowledgeSourceRef,
} from '../core-agent/index.js';
import type { CheckResult } from '../domain/check.js';
import { addCost, ZERO_COST, type Cost } from '../domain/cost.js';
import { readHandoverStatus, withHandover, type HandoverStatus } from '../domain/handover.js';
import {
  CORE_SLOT_NAME,
  type MissionAttention,
  type MissionResult,
  type MissionState,
  type MissionSummary,
  type NeedsAttentionCause,
  type PendingQuestion,
  type Resolution,
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
  /** Overrides `USAGE_RESET_MARGIN_MS` (tests). */
  usageResetMarginMs?: number;
  /** Called when what a Resume needs changed without an event saying so. */
  onProgress?: () => void;
}

/** Why the work went back to a Loop target: the looping Slot, the round and who granted it. */
interface LoopEntry {
  from: string;
  iteration: number;
  grantedBy?: 'commander' | 'core';
}

/**
 * Where a Mission stands, as plain data for the ledger: everything the Runner needs besides the
 * snapshot and the Slot records to go on after a Stop or a restart.
 */
export interface RunnerProgress {
  /** The Slot the Mission stands at; a Resume runs it again. */
  slot: string;
  /** What that Slot was given: the findings of a Loop or of its previous Attempt. */
  feedback?: Feedback;
  loopEntry?: LoopEntry;
  attempts: Record<string, number>;
  loopCounts: Record<string, number>;
  resolutionsUsed: Record<string, number>;
  keepResolutions: string[];
  /** The Engine sessions of the Slots that ended an Attempt. */
  sessions: Record<string, string>;
  /** The session of the Attempt under way; a Resume continues it. */
  openSession?: { slot: string; sessionId: string };
  slotOutputs: Record<string, string>;
}

/** What a resumed Runner starts from. */
export interface RunnerRestore {
  progress: RunnerProgress;
  records: SlotRecord[];
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

/** What the Commander answers in Needs Attention; a Retry may also come from the Core. */
type Control = { kind: 'stop' } | { kind: 'retry'; note?: string; from: 'commander' | 'core' };

/** What `decide` returns: the Commander's answer, or the Core counting the Slot as done. */
type Decision = Control | { kind: 'accept' };

/** The causes at which the Core may accept the result as it is; the others have nothing to accept. */
type AcceptableCause = Extract<
  NeedsAttentionCause,
  'handover_not_done' | 'attempt_limit' | 'loop_limit'
>;

/** What `decide` knows besides the failed Checks. */
interface DecisionContext {
  /** The Engine's error text, or what the Handover said. */
  detail?: string;
  /** The Slot Output of the Attempt, when it ended with one. */
  output?: string;
}

/** A second Engine error in a row is the Commander's: one more blind Attempt would not help. */
const ENGINE_ERRORS_BEFORE_COMMANDER = 2;

/** Waited past the stated reset: a call made on the very second is refused once more. */
export const USAGE_RESET_MARGIN_MS = 60_000;

/** What a Pilot is told when its turn goes on in the same session after the usage limit reset. */
export const USAGE_CONTINUE_PROMPT =
  'The usage limit interrupted you and has reset. Go on with the work from where you stopped, and end as your instructions say.';

/** The first transcript line of the Slot a Resume runs again. */
export const RESUME_NOTE =
  'The Commander resumed the Mission: the previous Attempt at this Slot was interrupted.';

interface QueuedQuestion extends PendingQuestion {
  respond(answers: Answers): void;
  dismiss(): void;
}

type SlotExecution =
  { kind: 'output'; output: string } | { kind: 'interrupted' } | { kind: 'error'; message: string };

/** One turn of a Pilot: the prompt and the session it continues, if any. */
interface PilotRun {
  prompt: string;
  resume: string | undefined;
  /** True for the turn that goes on after a usage limit instead of starting the Attempt. */
  continued: boolean;
}

type PilotOutcome =
  | SlotExecution
  | { kind: 'usage_limit'; resetsAt: string; sessionId: string | undefined }
  | { kind: 'session_lost'; message: string };

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
 * The deterministic state machine of one Mission. The Core is consulted for text (prompts,
 * explanations, the report), for `llm_judgment` Checks and, where the Mission would wait for the
 * Commander (a Handover that is not `done` included), for a Resolution; every transition, and what
 * a Resolution may be, is plain code.
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
  /** Resolved by the timer at the reset of the usage limit, or by Stop. */
  private usageWait: Deferred<void> | null = null;
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
  /** Resolutions per Slot since the Slot was last entered or the Commander last decided on it. */
  private readonly resolutionsUsed = new Map<string, number>();
  /** Looping Slots with a granted round under way: their next entry does not renew their Resolutions. */
  private readonly keepResolutions = new Set<string>();
  private engineErrorStreak = 0;
  /** Attempts per Slot since the Slot was last entered. */
  private readonly attempts = new Map<string, number>();
  /** Rounds per looping Slot over the whole Mission, granted ones included. */
  private readonly loopCounts = new Map<string, number>();
  /** The Slot the Mission stands at. */
  private index = 0;
  private feedback: Feedback | undefined;
  private loopEntry: LoopEntry | undefined;
  /** The session of the Attempt under way, or of the one a Stop or a restart interrupted. */
  private openSession: { slot: string; sessionId: string } | undefined;
  /** True until the first Slot of a resumed Mission has started. */
  private resumed = false;

  constructor(
    private readonly snapshot: MissionSnapshot,
    private readonly meta: MissionMeta,
    private readonly deps: RunnerDeps,
    restore?: RunnerRestore,
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
    if (restore) this.restore(restore);
  }

  /** Takes over where a stopped or interrupted Runner of this Mission stood. */
  private restore({ progress, records }: RunnerRestore): void {
    for (const record of records) {
      if (!this.records.has(record.name)) continue;
      this.records.set(record.name, structuredClone(record));
      this.totalCost = addCost(this.totalCost, record.cost);
    }
    this.summary.cost = { ...this.totalCost, estimated: true };
    const index = this.snapshot.assembly.slots.findIndex((s) => s.name === progress.slot);
    this.index = index === -1 ? 0 : index;
    this.feedback = progress.feedback;
    this.loopEntry = progress.loopEntry;
    for (const [slot, count] of Object.entries(progress.attempts)) this.attempts.set(slot, count);
    for (const [slot, count] of Object.entries(progress.loopCounts))
      this.loopCounts.set(slot, count);
    for (const [slot, count] of Object.entries(progress.resolutionsUsed))
      this.resolutionsUsed.set(slot, count);
    for (const slot of progress.keepResolutions) this.keepResolutions.add(slot);
    for (const [slot, id] of Object.entries(progress.sessions)) this.sessions.set(slot, id);
    for (const [slot, output] of Object.entries(progress.slotOutputs))
      this.slotOutputs.set(slot, output);
    this.openSession = progress.openSession;
    this.resumed = true;
  }

  /** Where the Mission stands, for the ledger. */
  progress(): RunnerProgress {
    return structuredClone({
      slot: this.snapshot.assembly.slots[this.index]!.name,
      ...(this.feedback && { feedback: this.feedback }),
      ...(this.loopEntry && { loopEntry: this.loopEntry }),
      attempts: Object.fromEntries(this.attempts),
      loopCounts: Object.fromEntries(this.loopCounts),
      resolutionsUsed: Object.fromEntries(this.resolutionsUsed),
      keepResolutions: [...this.keepResolutions],
      sessions: Object.fromEntries(this.sessions),
      ...(this.openSession && { openSession: this.openSession }),
      slotOutputs: Object.fromEntries(this.slotOutputs),
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
    this.usageWait?.resolve();
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
        ? { kind: 'retry', note: note.trim(), from: 'commander' }
        : { kind: 'retry', from: 'commander' },
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
    let note: string | undefined = this.resumed ? RESUME_NOTE : undefined;

    /** The same Slot again, told what failed and what the Commander or the Core noted. */
    const retryWith = (
      control: Extract<Control, { kind: 'retry' }>,
      failedChecks: CheckResult[],
    ) => {
      this.feedback = {
        kind: 'attempt',
        failedChecks,
        ...(control.note !== undefined && { note: control.note, noteFrom: control.from }),
      };
      // The Core's note is in the transcript already, with its Resolution.
      note = control.from === 'commander' ? control.note : undefined;
    };

    /**
     * The work goes back to the Loop target with the looping Slot's findings. Inside the limit that
     * is plain code; at the limit it is one round granted by the Core or the Commander, with their
     * note. A granted round counts like any other, so the next failure is the limit again.
     */
    const loopBack = (
      slot: ResolvedSlot & { loop: NonNullable<ResolvedSlot['loop']> },
      iteration: number,
      output: string,
      failedChecks: CheckResult[],
      grant?: Extract<Control, { kind: 'retry' }>,
    ) => {
      this.loopCounts.set(slot.name, iteration);
      this.records.get(slot.name)!.loops = iteration;
      this.feedback = {
        kind: 'loop',
        fromSlot: slot.name,
        output,
        failedChecks,
        ...(grant?.note !== undefined && { note: grant.note, noteFrom: grant.from }),
      };
      this.loopEntry = { from: slot.name, iteration, ...(grant && { grantedBy: grant.from }) };
      note = grant?.from === 'commander' ? grant.note : undefined;
      // The granting Slot keeps its count of Resolutions, or the Core could grant rounds for ever.
      if (grant) this.keepResolutions.add(slot.name);
      this.enterSlot(slot.loop.target);
      this.index = slots.findIndex((s) => s.name === slot.loop.target);
    };

    for (;;) {
      this.throwIfStopping();
      const slot = slots[this.index]!;
      const record = this.records.get(slot.name)!;
      const attempt = (this.attempts.get(slot.name) ?? 0) + 1;
      this.attempts.set(slot.name, attempt);
      record.attempts += 1;
      this.summary.currentSlot = slot.name;
      const loopEntry = this.loopEntry;
      // The Slot a Resume starts with is told that its previous Attempt was interrupted.
      const interrupted = this.resumed;
      this.resumed = false;
      this.deps.emit({
        type: 'slot.started',
        missionId: this.meta.id,
        slot: slot.name,
        attempt,
        ...(loopEntry && { loopIteration: loopEntry.iteration, loopFrom: loopEntry.from }),
        ...(loopEntry?.grantedBy && { loopGrantedBy: loopEntry.grantedBy }),
        ...(note !== undefined && { note }),
      });
      note = undefined;

      const execution = await this.executeSlot(slot, this.feedback, interrupted);
      this.throwIfStopping();
      await this.refreshWorkspace();

      if (execution.kind === 'error') {
        this.engineErrorStreak += 1;
        const control = await this.decide('engine_error', slot, [], {
          detail: execution.message,
        });
        if (control.kind === 'stop') return this.finishStopped();
        retryWith(control, []);
        continue;
      }
      if (execution.kind === 'interrupted') throw new StopRequested();
      this.engineErrorStreak = 0;

      const output = execution.output;
      // A Handover that says `done` is trusted; anything else is the Core's to look at first.
      const status = readHandoverStatus(output);
      if (status !== 'done') {
        const decision = await this.decide('handover_not_done', slot, [], {
          detail: handoverDetail(status),
          output,
        });
        if (decision.kind === 'stop') return this.finishStopped();
        if (decision.kind === 'retry') {
          retryWith(decision, []);
          continue;
        }
        // Accepted with open points: the Done Condition still has to hold.
      }

      const done = await this.evaluate(slot, slot.doneCondition, output);
      this.throwIfStopping();
      record.checkResults = done.results;

      if (done.timedOut) {
        const control = await this.decide('ci_timeout', slot, done.results, { output });
        if (control.kind === 'stop') return this.finishStopped();
        retryWith(control, done.results);
        continue;
      }

      // At the Loop limit the Accept Condition may stand in for the Done Condition (plan B).
      const acceptance = done.holds
        ? undefined
        : await this.acceptAtLoopLimit(slot, output, this.loopCounts.get(slot.name) ?? 0);
      if (acceptance) record.checkResults = [...done.results, ...acceptance.results];

      if (!done.holds && !acceptance?.holds) {
        const failed = [...done.results, ...(acceptance?.results ?? [])].filter((r) => !r.holds);
        const loopCount = (this.loopCounts.get(slot.name) ?? 0) + 1;
        let limitCause: AcceptableCause | undefined;
        if (slot.loop) {
          if (loopCount > slot.loop.limit) limitCause = 'loop_limit';
        } else if (attempt >= slot.attemptLimit) {
          limitCause = 'attempt_limit';
        }

        if (limitCause === undefined) {
          if (hasLoop(slot)) loopBack(slot, loopCount, output, failed);
          else this.feedback = { kind: 'attempt', failedChecks: failed };
          continue;
        }

        const control = await this.decide(limitCause, slot, failed, { output });
        if (control.kind === 'stop') return this.finishStopped();
        if (control.kind === 'retry') {
          // Reviewing unchanged work again would find the same: at the Loop limit a Retry is a round.
          if (hasLoop(slot)) loopBack(slot, loopCount, output, failed, control);
          else retryWith(control, failed);
          continue;
        }
        // Accepted by the Core: the Slot is done with the failed Checks as open points.
      }

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
        if (exit.timedOut || this.index === slots.length - 1) {
          const cause: NeedsAttentionCause = exit.timedOut
            ? 'ci_timeout'
            : 'last_exit_condition_failed';
          const control = await this.decide(cause, slot, exit.results, { output });
          if (control.kind === 'stop') return this.finishStopped();
          retryWith(control, exit.results);
          continue;
        }
      }
      this.index += 1;
      // A forward move starts the next Slot afresh (a Loop does the same for its target).
      this.enterSlot(slots[this.index]!.name);
      this.feedback = undefined;
      this.loopEntry = undefined;
    }
  }

  /**
   * A Slot entered by a forward move or a Loop counts its Attempts and its Resolutions from zero;
   * a looping Slot reached again after a round it was granted keeps its Resolutions.
   */
  private enterSlot(name: string): void {
    this.attempts.set(name, 0);
    if (!this.keepResolutions.delete(name)) this.resolutionsUsed.delete(name);
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
    interrupted: boolean,
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
        ...(interrupted && { interrupted }),
      });
    } catch (error) {
      if (this.stopRequested) return { kind: 'interrupted' };
      return {
        kind: 'error',
        message: `The Core could not compose the prompt: ${errorMessage(error)}`,
      };
    }
    if (this.stopRequested) return { kind: 'interrupted' };

    // The sessions the Attempt may continue, best first; the last resort is a new one.
    const sessions: (string | undefined)[] = [];
    // After a Resume: the session of the interrupted Attempt, whatever the Memory Mode.
    if (interrupted && this.openSession?.slot === slot.name) {
      sessions.push(this.openSession.sessionId);
    }
    const kept = slot.memoryMode === 'persistent' ? this.sessions.get(slot.name) : undefined;
    if (kept !== undefined && !sessions.includes(kept)) sessions.push(kept);
    sessions.push(undefined);

    let run: PilotRun = { prompt, resume: sessions.shift(), continued: false };
    for (;;) {
      const outcome = await this.runPilot(slot, run);
      if (this.stopRequested) return { kind: 'interrupted' };
      if (outcome.kind === 'usage_limit') {
        await this.waitForUsage(outcome.resetsAt);
        if (outcome.sessionId !== undefined) {
          // Should the refused session be gone, the Attempt starts over as it was first tried.
          if (!run.continued) sessions.unshift(run.resume);
          run = { prompt: USAGE_CONTINUE_PROMPT, resume: outcome.sessionId, continued: true };
        }
        continue;
      }
      if (outcome.kind === 'session_lost') {
        if (sessions.length === 0) return { kind: 'error', message: outcome.message };
        if (this.sessions.get(slot.name) === run.resume) this.sessions.delete(slot.name);
        run = { prompt, resume: sessions.shift(), continued: false };
        continue;
      }
      // The Attempt ended by itself: nothing is left to continue.
      this.openSession = undefined;
      return outcome;
    }
  }

  /** One turn of the Slot's Pilot, from the prompt to its result, its error or a usage limit. */
  private async runPilot(slot: ResolvedSlot, run: PilotRun): Promise<PilotOutcome> {
    const handle = this.deps.engine.createAgent({
      role: 'pilot',
      label: slot.name,
      model: slot.model,
      systemPrompt: { rules: slot.rules, instructions: withHandover(slot.instructions) },
      cwd: this.deps.workspace.cwd,
      additionalDirectories: [this.meta.taskPath],
      allowQuestions: slot.mayAskCommander,
      ...(run.resume !== undefined && { resumeSessionId: run.resume }),
      guard: buildGuard(this.deps.workspace, {
        taskPath: this.meta.taskPath,
        taskDocuments: this.meta.taskDocuments,
        configHome: this.meta.configHome,
      }),
    });
    this.currentHandle = handle;
    let output: string | null = null;
    let error: string | null = null;
    let sessionLost = false;
    let sessionId: string | undefined;
    let usageResetsAt: string | null = null;
    try {
      handle.send(run.prompt);
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
            sessionLost = event.sessionLost === true;
            this.deps.emit({
              type: 'agent.error',
              missionId: this.meta.id,
              slot: slot.name,
              payload: { type: 'error', message: event.message },
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
          case 'session':
            sessionId = event.sessionId;
            this.openSession = { slot: slot.name, sessionId };
            this.deps.onProgress?.();
            break;
          case 'usage_limit':
            usageResetsAt = event.resetsAt;
            break;
          case 'result':
            output = event.output;
            this.sessions.set(slot.name, event.sessionId);
            this.addCost(slot.name, event.cost);
            break;
        }
        // Whatever the Engine says after the refusal is not the Pilot's work.
        if (usageResetsAt !== null) break;
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
    if (usageResetsAt !== null) return { kind: 'usage_limit', resetsAt: usageResetsAt, sessionId };
    // An empty result is never a Slot Output: judging it would only burn an Attempt on "nothing to judge".
    if (output !== null && output.trim() === '') {
      return { kind: 'error', message: 'The Pilot ended without any output' };
    }
    if (output !== null) return { kind: 'output', output };
    if (sessionLost && error !== null) return { kind: 'session_lost', message: error };
    return { kind: 'error', message: error ?? 'The agent ended without a result' };
  }

  /**
   * Waiting for usage: the Engine refused a call by the usage limit. Resolves a little after the
   * reset, so the caller makes the same call again; a Stop meanwhile ends the Mission. The wait
   * costs neither an Attempt nor a Resolution. The Core's client waits here too.
   */
  async waitForUsage(resetsAt: string): Promise<void> {
    this.throwIfStopping();
    const margin = this.deps.usageResetMarginMs ?? USAGE_RESET_MARGIN_MS;
    const delay = Math.max(Date.parse(resetsAt) - Date.now(), 0) + margin;
    const wait = new Deferred<void>();
    this.usageWait = wait;
    this.summary.usageResetsAt = resetsAt;
    this.setState('waiting_for_usage', { resetsAt });
    const timer = setTimeout(() => wait.resolve(), delay);
    try {
      await wait.promise;
    } finally {
      clearTimeout(timer);
      this.usageWait = null;
      delete this.summary.usageResetsAt;
    }
    this.throwIfStopping();
    this.setState('running');
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

  /**
   * A point the Mission cannot pass by plain code. The Core decides in the Commander's place while
   * the Slot has Resolutions left; when they are used up it has the final word (accept, or the
   * Commander) wherever an accept is possible. Otherwise, and whenever the Core says so, the
   * Commander decides. Plain code keeps what is never the Core's: accepting a Check that is not a
   * judgment, accepting an Exit Condition (that would declare the Mission completed), a second
   * Engine error in a row.
   */
  private decide(
    cause: AcceptableCause,
    slot: ResolvedSlot,
    failedChecks: CheckResult[],
    context?: DecisionContext,
  ): Promise<Decision>;
  private decide(
    cause: NeedsAttentionCause,
    slot: ResolvedSlot,
    failedChecks: CheckResult[],
    context?: DecisionContext,
  ): Promise<Control>;
  private async decide(
    cause: NeedsAttentionCause,
    slot: ResolvedSlot,
    failedChecks: CheckResult[],
    { detail, output }: DecisionContext = {},
  ): Promise<Decision> {
    const limit = this.snapshot.assembly.core.resolutionLimit;
    const used = this.resolutionsUsed.get(slot.name) ?? 0;
    const mayRetry = used < limit;
    const mayAccept =
      cause === 'handover_not_done' ||
      ((cause === 'attempt_limit' || cause === 'loop_limit') &&
        failedChecks.length > 0 &&
        failedChecks.every((result) => result.check.kind === 'llm_judgment'));
    const coreMayDecide =
      limit > 0 &&
      // Without a `retry` the Core is asked only where it has something to accept: the final word.
      (mayRetry || mayAccept) &&
      !(cause === 'engine_error' && this.engineErrorStreak >= ENGINE_ERRORS_BEFORE_COMMANDER);
    // What the Commander reads besides the Core's words, in the order it happened.
    const details: string[] = [];
    let reason: string | undefined;
    if (limit > 0 && !mayRetry)
      details.push(`The Core used its ${limit} Resolutions on this Slot.`);

    if (coreMayDecide) {
      let decision: AttentionDecision | undefined;
      try {
        decision = await this.deps.core.resolveAttention({
          cause,
          slot,
          failedChecks,
          ...(detail !== undefined && { detail }),
          ...(output !== undefined && { slotOutput: output }),
          mayAccept,
          mayRetry,
          resolutionsLeft: limit - used,
        });
      } catch (error) {
        details.push(`The Core could not decide: ${errorMessage(error)}`);
      }
      this.throwIfStopping();
      if (
        (decision?.decision === 'retry' && mayRetry) ||
        (decision?.decision === 'accept' && mayAccept)
      ) {
        const note = decision.note?.trim();
        const resolution: Resolution = {
          cause,
          decision: decision.decision,
          reason: decision.reason,
          ...(decision.decision === 'retry' && note && { note }),
          failedChecks,
        };
        // The final word is not counted: the limit is on Resolutions that may grant an Attempt.
        if (mayRetry) this.resolutionsUsed.set(slot.name, used + 1);
        const record = this.records.get(slot.name)!;
        record.resolutions = [...(record.resolutions ?? []), resolution];
        this.deps.emit({
          type: 'core.resolved',
          missionId: this.meta.id,
          slot: slot.name,
          resolution,
        });
        if (resolution.decision === 'accept') return { kind: 'accept' };
        return {
          kind: 'retry',
          from: 'core',
          ...(resolution.note !== undefined && { note: resolution.note }),
        };
      }
      if (decision) {
        reason = decision.reason;
        if (decision.decision === 'accept') {
          details.push('The Core would accept the Slot as it is; here only the Commander may.');
        }
        if (decision.decision === 'retry') {
          details.push('The Core would grant one more Attempt; here only the Commander may.');
        }
      }
    }

    if (detail !== undefined) details.push(detail);
    const control = await this.needsAttention(cause, slot, failedChecks, details, reason);
    if (control.kind === 'retry') {
      // The Commander's Retry is a fresh start for the Core on this Slot.
      this.resolutionsUsed.delete(slot.name);
      this.engineErrorStreak = 0;
    }
    return control;
  }

  /** Waits for the Commander. `reason` is the Core's when it already gave one; else it is asked. */
  private async needsAttention(
    cause: NeedsAttentionCause,
    slot: ResolvedSlot,
    failedChecks: CheckResult[],
    details: string[],
    reason?: string,
  ): Promise<Control> {
    if (reason === undefined) {
      try {
        reason = await this.deps.core.explainNeedsAttention({ cause, slot, failedChecks });
      } catch (error) {
        if (details.length === 0) {
          details = [`The Core could not explain the situation: ${errorMessage(error)}`];
        }
      }
    }
    reason = [...(reason === undefined ? [] : [reason]), ...details].join('\n\n');
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
      resetsAt?: string;
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
    readonly reason:
      | 'not_needs_attention'
      | 'no_such_question'
      | 'not_finished'
      | 'not_stopped'
      /** A Stopped Mission that cannot go on: its message says why. */
      | 'cannot_resume'
      | 'not_found',
    message: string,
  ) {
    super(message);
    this.name = 'MissionStateError';
  }
}

function hasLoop(
  slot: ResolvedSlot,
): slot is ResolvedSlot & { loop: NonNullable<ResolvedSlot['loop']> } {
  return slot.loop !== undefined && slot.loop !== null;
}

/** What the Core and the Commander are told about a Handover that is not `done`. */
function handoverDetail(status: HandoverStatus | null): string {
  return status === null
    ? 'The Slot Output ends without a Handover Status line.'
    : `The Pilot handed over with Status "${status}".`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
