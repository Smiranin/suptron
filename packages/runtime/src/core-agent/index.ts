import { z } from 'zod';
import type { ResolvedSlot } from '../config/snapshot.js';
import type { CheckResult } from '../domain/check.js';
import type { Cost } from '../domain/cost.js';
import type { PullRequestRef } from '../domain/host.js';
import type { NeedsAttentionCause, SlotRecord } from '../domain/mission.js';
import type { AgentEvent, AgentHandle, Engine, GuardContext } from '../engine/index.js';

/** A Knowledge Source as the Core receives it: a path to read, or a text given verbatim. */
export type KnowledgeSourceRef =
  { kind: 'path'; path: string; title?: string } | { kind: 'text'; text: string; title?: string };

export interface ContextBundle {
  taskDocuments: string[];
  knowledgeSources: KnowledgeSourceRef[];
  /** The Workspace's own fragment: where the Pilot works and where results go (SPEC FR-15). */
  workspace: string;
  /** The Git conventions rendered with the Mission's values; null when the Slot does not read them. */
  gitConventions: string | null;
  slotOutputs: { slotName: string; output: string }[];
}

export type Feedback =
  | {
      kind: 'loop';
      fromSlot: string;
      output: string;
      failedChecks: CheckResult[];
      /** Present on a round granted at the Loop limit: what the granter wants done. */
      note?: string;
      noteFrom?: 'commander' | 'core';
    }
  | {
      kind: 'attempt';
      failedChecks: CheckResult[];
      note?: string;
      /** Who wrote the note: the Commander at a Retry, or the Core in a Resolution. */
      noteFrom?: 'commander' | 'core';
    };

/** What the Core answers when asked to stand in for the Commander. */
export interface AttentionDecision {
  decision: 'retry' | 'accept' | 'commander';
  reason: string;
  /** What the Pilot's next Attempt is told to do; expected with `retry`. */
  note?: string;
}

/**
 * The five fixed points at which the Runner consults the Core. It never decides structure; at
 * `resolveAttention` it decides, within the limits the Runner enforces, what the Commander would.
 * It can read the Task folder and the Workspace in every call; its instructions say when it does.
 */
export interface CoreAgent {
  composeSlotPrompt(input: {
    slot: ResolvedSlot;
    bundle: ContextBundle;
    feedback?: Feedback;
  }): Promise<string>;
  judge(input: {
    criterion: string;
    slotOutput: string;
    /** The Workspace's change summary; null when it has none (SPEC FR-14). */
    diffSummary: string | null;
  }): Promise<{ holds: boolean; reason: string }>;
  explainNeedsAttention(input: {
    cause: NeedsAttentionCause;
    slot: ResolvedSlot;
    failedChecks: CheckResult[];
  }): Promise<string>;
  resolveAttention(input: {
    cause: NeedsAttentionCause;
    slot: ResolvedSlot;
    failedChecks: CheckResult[];
    /** What happened besides the failed Checks: the Engine's error text, the Handover's Status. */
    detail?: string;
    /** What the Pilot handed over; absent when the Attempt ended without an output. */
    slotOutput?: string;
    /** False when the Runner would refuse `accept`: a failed Check is not a judgment, or the cause forbids it. */
    mayAccept: boolean;
    /** False at the final word: the Resolutions of the Slot are used up, `retry` is refused. */
    mayRetry: boolean;
    /** Resolutions left on this Slot, this one included; 0 at the final word. */
    resolutionsLeft: number;
  }): Promise<AttentionDecision>;
  finalReport(input: {
    slots: SlotRecord[];
    pr?: PullRequestRef;
    /** The Workspace fragment, so the report says where the result is (SPEC FR-16). */
    workspace: string;
  }): Promise<string>;
  /** Interrupts a call in flight (Stop). */
  interrupt(): Promise<void>;
}

export class CoreAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoreAgentError';
  }
}

const composeSchema = z.object({ prompt: z.string() });
const judgeSchema = z.object({ holds: z.boolean(), reason: z.string() });
const explainSchema = z.object({ reason: z.string() });
const resolveSchema = z.object({
  decision: z.enum(['retry', 'accept', 'commander']),
  reason: z.string(),
  note: z.string().optional(),
});
const reportSchema = z.object({ report: z.string() });

export const CORE_PREAMBLE = `You are the Core of a Suptron Mission: the orchestrating agent of an Assembly of Slots.
You are consulted at fixed points only. You never edit files, never run commands, never reorder, skip or add
Slots, and never declare a Mission completed; plain code decides structure. You are the Commander's deputy: where
a Mission would wait for them, you are asked first and decide what they would, within the limits the call states.
You answer every call with the JSON object the call asks for and nothing else.

You trust what a Pilot hands over: a Slot Output whose Handover says Status "done" is not yours to verify. You can
read everything the Pilots can (the Task folder, the Workspace, the Knowledge Sources) with Read, Glob and Grep.
Read only in a resolveAttention call, to see what is really open or failed before you decide, and in a judge
call, where the Commander asked for a check of the result. Never read while composing a prompt, explaining a
Needs Attention or writing the report: there you work from what the call gives you.

Calls:
- composeSlotPrompt: write the complete prompt for a Slot's Pilot from the Slot's instructions, the context
  bundle (paths the Pilot can read itself, texts given verbatim, the Workspace fragment), the Git conventions
  when given, and any feedback. Return { "prompt": string }.
- judge: decide whether a criterion holds for the result of a Slot: its Slot Output, the files it produced and,
  when given, a change summary of the Workspace. Return { "holds": boolean, "reason": string }.
- explainNeedsAttention: explain in two or three sentences why the Mission needs the Commander and what to do. Return { "reason": string }.
- resolveAttention: decide in the Commander's place whether a Slot gets one more Attempt with your note, its
  result is accepted with open points, or the Mission goes to the Commander. Return { "decision": "retry" | "accept" | "commander", "reason": string, "note"?: string }.
- finalReport: write a Markdown report of the Mission for the Commander. Return { "report": string }.`;

/** The instruction at the head of each Core call; the call's input follows it as JSON. */
export const CORE_CALL_INSTRUCTIONS: Readonly<Record<string, string>> = {
  composeSlotPrompt:
    'Compose the prompt for this Slot. Include the Slot instructions verbatim, list the paths of the Task documents and of the Knowledge Sources given as paths, quote a Knowledge Source given as text under its title, state the Workspace fragment so the Pilot knows where it works and where results go, quote the Git conventions when they are given (never mention them otherwise), include every Slot Output given, and when feedback is present put it under a heading that names its source (Loop feedback from <Slot>, or the previous Attempt) with the failed Checks and the note, named after its author (the Commander note, or the Core note).',
  judge:
    'Judge the criterion. When it is about files (a document, the content, the code), read the files it names, or the ones the Slot Output lists as produced, and judge on what they hold: the Slot Output and the change summary tell you where to look, they are not the evidence. When it is about what the Slot Output itself states (the verdict of a review), judge on the Slot Output. A null change summary means the Workspace keeps none. Be strict: holds is true only when the criterion is clearly satisfied; the reason names the file and the place of what fails.',
  explainNeedsAttention:
    'Explain why this Mission needs the Commander and what they can do (Retry with a note, or Stop).',
  resolveAttention:
    'The Mission reached a point where it would wait for the Commander. Decide as they would. With the cause handover_not_done the Pilot itself handed over with Status "open" or "failed", or without a Status line (detail says which): read the Handover in slotOutput and, where it helps, the files it names, to see what is really open and whether a further Attempt can close it. "retry" (only when mayRetry is true): the Pilot gets one more Attempt with your note; the note tells the Pilot exactly what to do about every open point and every failed Check, and where there are alternative fixes it picks one. "accept" (only when mayAccept is true): the result goes on although points are open or Checks did not hold; choose it only when the remaining gap is minor against the Task and another Attempt is unlikely to close it, and name the gap in the reason, which goes to the final report as an open point. After an accepted Handover the Done Condition of the Slot still runs. "commander": the Mission waits for the Commander; choose it when the fix would change what the Task asks for or leave the limits its documents state, when it would need the Pilot to break its Rules (delete, commit, push, write where it may not), or when an Engine error is about access, credentials or a usage limit. With the cause loop_limit a retry grants one more round: the Loop target works again with your note and the last findings, then this Slot runs once more; a round without a concrete fix in the note changes nothing, so grant it only when you can name the fix. Prefer retry while a concrete fix exists. When mayRetry is false your Resolutions on this Slot are used up and this is your final word: accept the result as it is, or send the Mission to the Commander. The reason is two or three sentences for the Commander; for "commander" it also says what they can do (Retry with a note, or Stop).',
  finalReport:
    'Write the final report: what was produced and where it is (the Workspace fragment names the place; the Pull Request when there is one), how it was verified, and costs. Add a part "Open points": what the Handover at the end of each Slot Output lists as open, and for every accepted resolution its reason and its failed Checks; write "none" when there are none. When a Slot record carries resolutions, add a part "Decisions the Core took": per resolution the Slot, the decision and its reason.',
};

export interface EngineCoreAgentOptions {
  model: string;
  instructions: string;
  /** The Task folder. */
  cwd: string;
  /** What the Core can read besides the Task folder: the Workspace. */
  readDirectories: string[];
  guard: GuardContext;
  onCost?: (cost: Cost) => void;
  onEvent?: (event: AgentEvent) => void;
}

/** One persistent Core session per Mission, every call typed with a JSON schema. */
export class EngineCoreAgent implements CoreAgent {
  private sessionId: string | undefined;
  private current: AgentHandle | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly options: EngineCoreAgentOptions,
  ) {}

  async composeSlotPrompt(input: {
    slot: ResolvedSlot;
    bundle: ContextBundle;
    feedback?: Feedback;
  }): Promise<string> {
    return (await this.call('composeSlotPrompt', input, composeSchema)).prompt;
  }

  async judge(input: { criterion: string; slotOutput: string; diffSummary: string | null }) {
    return this.call('judge', input, judgeSchema);
  }

  async explainNeedsAttention(input: {
    cause: NeedsAttentionCause;
    slot: ResolvedSlot;
    failedChecks: CheckResult[];
  }): Promise<string> {
    return (await this.call('explainNeedsAttention', input, explainSchema)).reason;
  }

  async resolveAttention(input: {
    cause: NeedsAttentionCause;
    slot: ResolvedSlot;
    failedChecks: CheckResult[];
    detail?: string;
    slotOutput?: string;
    mayAccept: boolean;
    mayRetry: boolean;
    resolutionsLeft: number;
  }): Promise<AttentionDecision> {
    const { decision, reason, note } = await this.call('resolveAttention', input, resolveSchema);
    return { decision, reason, ...(note !== undefined && { note }) };
  }

  async finalReport(input: {
    slots: SlotRecord[];
    pr?: PullRequestRef;
    workspace: string;
  }): Promise<string> {
    return (await this.call('finalReport', input, reportSchema)).report;
  }

  async interrupt(): Promise<void> {
    await this.current?.interrupt();
  }

  private async call<T>(name: string, input: unknown, schema: z.ZodType<T>): Promise<T> {
    const handle = this.engine.createAgent({
      role: 'core',
      label: 'core',
      model: this.options.model,
      systemPrompt: { rules: CORE_PREAMBLE, instructions: this.options.instructions },
      cwd: this.options.cwd,
      additionalDirectories: this.options.readDirectories,
      allowQuestions: false,
      ...(this.sessionId !== undefined && { resumeSessionId: this.sessionId }),
      guard: this.options.guard,
      outputSchema: z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>,
    });
    this.current = handle;
    handle.send(formatCorePrompt(name, input));
    let result: Extract<AgentEvent, { type: 'result' }> | null = null;
    let error: string | null = null;
    try {
      for await (const event of handle.events()) {
        this.options.onEvent?.(event);
        if (event.type === 'result') result = event;
        else if (event.type === 'error') error = event.message;
        else if (event.type === 'question') event.dismiss();
      }
    } finally {
      this.current = null;
      await handle.close();
    }
    if (!result)
      throw new CoreAgentError(error ?? `The Core ended the ${name} call without a result`);
    this.sessionId = result.sessionId;
    this.options.onCost?.(result.cost);
    const raw = result.structured ?? tryParseJson(result.output);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new CoreAgentError(
        `The Core returned a malformed ${name} output: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const fence = /```(?:json)?\n([\s\S]*?)\n```/.exec(text);
    if (fence) {
      try {
        return JSON.parse(fence[1]!);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

/** `# Core call: <name>` on the first line, the instruction, then the input as a JSON block. */
export function formatCorePrompt(name: string, input: unknown): string {
  return `# Core call: ${name}\n\n${CORE_CALL_INSTRUCTIONS[name] ?? ''}\n\nInput:\n\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\`\n`;
}
