import type { Cost } from '../domain/cost.js';
import type { Answers, Question } from '../domain/transcript.js';

export interface ModelInfo {
  id: string;
  displayName: string;
}

export type HealthStatus = { ok: true } | { ok: false; reason: string };

/** What the Laws hook and the PATH shims need to evaluate a command or a path. */
export interface GuardContext {
  protectedBranch: string;
  checkoutPath: string;
  taskPath: string;
  configHome: string;
}

export type JsonSchema = Record<string, unknown>;

export interface AgentSpec {
  role: 'pilot' | 'core';
  /** The Slot name for a Pilot, `core` for the Core; used by fakes and transcripts. */
  label: string;
  model: string;
  /** 'pilot' appends to the Claude Code preset; 'core' is a custom prompt with no file tools. */
  systemPrompt: { rules: string; instructions: string };
  /** The Checkout for 'pilot'; the Task folder for 'core'. */
  cwd: string;
  additionalDirectories: string[];
  /** false removes AskUserQuestion from the agent. */
  allowQuestions: boolean;
  /** Persistent Memory Mode: continue this session. */
  resumeSessionId?: string;
  guard: GuardContext;
  /** Structured output for Core calls. */
  outputSchema?: JsonSchema;
}

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolCallId: string; output: string; isError: boolean }
  | {
      type: 'question';
      id: string;
      questions: Question[];
      respond(answers: Answers): void;
      dismiss(): void;
    }
  | { type: 'result'; output: string; structured?: unknown; cost: Cost; sessionId: string }
  | { type: 'error'; message: string };

export interface AgentHandle {
  readonly sessionId: Promise<string>;
  /** One user turn; the handle supports exactly one turn per Slot execution. */
  send(prompt: string): void;
  events(): AsyncIterable<AgentEvent>;
  interrupt(): Promise<void>;
  close(): Promise<void>;
}

export interface Engine {
  listModels(): Promise<ModelInfo[]>;
  healthCheck(): Promise<HealthStatus>;
  createAgent(spec: AgentSpec): AgentHandle;
}
