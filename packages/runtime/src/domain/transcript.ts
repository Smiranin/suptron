import type { Check } from '../config/schemas.js';

/** Identifies one execution of a Slot: an Attempt, possibly inside a Loop iteration. */
export interface ExecutionKey {
  slot: string;
  attempt: number;
  loopIteration?: number;
  loopFrom?: string;
  /** Who granted the round at the Loop limit; absent for a round inside the limit. */
  loopGrantedBy?: 'commander' | 'core';
}

const GRANTER_NAMES = { commander: 'the Commander', core: 'the Core' } as const;

/** The execution a `slot.started` event opens; the server's store and the web reducer both build it. */
export function executionKeyOf(event: ExecutionKey): ExecutionKey {
  return {
    slot: event.slot,
    attempt: event.attempt,
    ...(event.loopIteration !== undefined && { loopIteration: event.loopIteration }),
    ...(event.loopFrom !== undefined && { loopFrom: event.loopFrom }),
    ...(event.loopGrantedBy !== undefined && { loopGrantedBy: event.loopGrantedBy }),
  };
}

export function executionId(key: ExecutionKey): string {
  return `${key.slot}#${key.loopFrom ?? '-'}#${key.loopIteration ?? 0}#${key.attempt}`;
}

export function sectionTitle(key: ExecutionKey): string {
  if (key.loopFrom) {
    const granted = key.loopGrantedBy ? `, granted by ${GRANTER_NAMES[key.loopGrantedBy]}` : '';
    const loop = `Loop ${key.loopIteration ?? 1} from ${key.loopFrom}${granted}`;
    return key.attempt > 1 ? `${loop} · Attempt ${key.attempt}` : loop;
  }
  return `Attempt ${key.attempt}`;
}

export function sameExecution(a: ExecutionKey, b: ExecutionKey): boolean {
  return executionId(a) === executionId(b);
}

export interface QuestionOption {
  label: string;
  description: string;
}

/** One question of a Human Checkpoint, as the Pilot asked it. */
export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

/** Answers keyed by question text; a multiple choice joins the chosen labels with ", ". */
export type Answers = Record<string, string>;

export type TranscriptEntry = { id: string; at: string } & (
  | { kind: 'text'; text: string }
  | {
      kind: 'tool_call';
      toolCallId: string;
      name: string;
      input: unknown;
      result?: { output: string; isError: boolean };
    }
  | { kind: 'check'; check: Check; holds: boolean; detail: string }
  | { kind: 'question'; questionId: string; questions: Question[] }
  | { kind: 'answer'; questionId: string; answers: Answers }
  | { kind: 'note'; text: string }
  | { kind: 'error'; message: string }
);

export interface TranscriptSection {
  execution: ExecutionKey;
  entries: TranscriptEntry[];
  dropped: number;
}
