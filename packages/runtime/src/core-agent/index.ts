import { z } from 'zod';
import type { ResolvedSlot } from '../config/snapshot.js';
import type { CheckResult } from '../domain/check.js';
import type { Cost } from '../domain/cost.js';
import type { PullRequestRef } from '../domain/host.js';
import type { NeedsAttentionCause, SlotRecord } from '../domain/mission.js';
import type { AgentEvent, AgentHandle, Engine, GuardContext } from '../engine/index.js';

export interface ContextBundle {
  taskDocuments: string[];
  knowledgeSources: string[];
  checkoutPath: string | null;
  /** The Profile's Git conventions rendered with the Mission's values; null when the Slot does not read them. */
  gitConventions: string | null;
  slotOutputs: { slotName: string; output: string }[];
}

export type Feedback =
  | { kind: 'loop'; fromSlot: string; output: string; failedChecks: CheckResult[] }
  | { kind: 'attempt'; failedChecks: CheckResult[]; note?: string };

/** The four fixed points at which the Runner consults the Core. It never decides structure. */
export interface CoreAgent {
  composeSlotPrompt(input: {
    slot: ResolvedSlot;
    bundle: ContextBundle;
    feedback?: Feedback;
  }): Promise<string>;
  judge(input: {
    criterion: string;
    slotOutput: string;
    diffSummary: string;
  }): Promise<{ holds: boolean; reason: string }>;
  explainNeedsAttention(input: {
    cause: NeedsAttentionCause;
    slot: ResolvedSlot;
    failedChecks: CheckResult[];
  }): Promise<string>;
  finalReport(input: { slots: SlotRecord[]; pr?: PullRequestRef }): Promise<string>;
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
const reportSchema = z.object({ report: z.string() });

export const CORE_PREAMBLE = `You are the Core of a Suptron Mission: the orchestrating agent of an Assembly of Slots.
You are consulted at fixed points only. You never run tools, never edit files, never reorder, skip or add Slots,
and never declare a Mission completed; plain code decides structure. You answer every call with the JSON
object the call asks for and nothing else.

Calls:
- composeSlotPrompt: write the complete prompt for a Slot's Pilot from the Slot's instructions, the context
  bundle (paths the Pilot can read itself), the Git conventions when given, and any feedback. Return { "prompt": string }.
- judge: decide whether a criterion holds for a Slot Output and a diff summary. Return { "holds": boolean, "reason": string }.
- explainNeedsAttention: explain in two or three sentences why the Mission needs the Commander and what to do. Return { "reason": string }.
- finalReport: write a Markdown report of the Mission for the Commander. Return { "report": string }.`;

const CALL_INSTRUCTIONS: Record<string, string> = {
  composeSlotPrompt:
    'Compose the prompt for this Slot. Include the Slot instructions verbatim, list the paths of the Task documents and Knowledge Sources, quote the Git conventions when they are given (never mention them otherwise), include every Slot Output given, and when feedback is present put it under a heading that names its source (Loop feedback from <Slot>, or the previous Attempt) with the failed Checks and the Commander note.',
  judge:
    'Judge the criterion against the Slot Output and the diff summary. Be strict: holds is true only when the criterion is clearly satisfied.',
  explainNeedsAttention:
    'Explain why this Mission needs the Commander and what they can do (Retry with a note, or Stop).',
  finalReport:
    'Write the final report: what was built, how it was verified, the Pull Request if any, costs and open points.',
};

export interface EngineCoreAgentOptions {
  model: string;
  instructions: string;
  /** The Task folder. */
  cwd: string;
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

  async judge(input: { criterion: string; slotOutput: string; diffSummary: string }) {
    return this.call('judge', input, judgeSchema);
  }

  async explainNeedsAttention(input: {
    cause: NeedsAttentionCause;
    slot: ResolvedSlot;
    failedChecks: CheckResult[];
  }): Promise<string> {
    return (await this.call('explainNeedsAttention', input, explainSchema)).reason;
  }

  async finalReport(input: { slots: SlotRecord[]; pr?: PullRequestRef }): Promise<string> {
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
      additionalDirectories: [],
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
  return `# Core call: ${name}\n\n${CALL_INSTRUCTIONS[name] ?? ''}\n\nInput:\n\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\`\n`;
}
