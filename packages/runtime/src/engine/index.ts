import type { Cost } from '../domain/cost.js';
import type { Answers, Question } from '../domain/transcript.js';
import type { ActivityPhase } from '../events/mission-event.js';

export interface ModelInfo {
  id: string;
  displayName: string;
}

export type HealthStatus = { ok: true } | { ok: false; reason: string };

/** What the Laws hook and the PATH shims need to evaluate a command or a path. */
export interface GuardContext {
  /** Relative paths resolve against it: the Engine's working directory (the Workspace). */
  cwd: string;
  /** The Laws allow writes inside these roots and the Task location, nowhere else. */
  writeRoots: readonly string[];
  /** null when the Workspace knows no protected branch; the branch Laws are then skipped. */
  protectedBranch: string | null;
  taskPath: string;
  /**
   * The Commander's Task documents, absolute: the only files under the Task location the Laws
   * refuse to overwrite. Anything a Slot writes next to them stays editable (SPEC FR-27).
   */
  taskDocuments: readonly string[];
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
  /** The Workspace's working directory for 'pilot'; the Task folder for 'core'. */
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
  /** A sign of life while the model thinks, writes or calls a tool; never part of the transcript. */
  | { type: 'activity'; phase: ActivityPhase; detail?: string }
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
