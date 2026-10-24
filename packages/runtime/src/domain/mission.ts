import type { AssemblyFile } from '../config/schemas.js';
import type { CheckResult } from './check.js';
import type { Cost } from './cost.js';
import type { PullRequestRef } from './host.js';
import type { Question, TranscriptSection } from './transcript.js';

export type MissionState =
  'running' | 'waiting_for_owner' | 'needs_attention' | 'stopped' | 'completed';

export const ACTIVE_MISSION_STATES: readonly MissionState[] = [
  'running',
  'waiting_for_owner',
  'needs_attention',
];

export function isActiveState(state: MissionState): boolean {
  return ACTIVE_MISSION_STATES.includes(state);
}

export type NeedsAttentionCause =
  'attempt_limit' | 'loop_limit' | 'last_exit_condition_failed' | 'ci_timeout' | 'engine_error';

/** The Core's cost is recorded under this pseudo-Slot. */
export const CORE_SLOT_NAME = 'core';

/**
 * How the Commander hands over the Task: a file or folder on disk, or text typed at start. Text is
 * written to the Mission folder, so every Mission has a Task location on disk.
 */
export type MissionTask = { kind: 'path'; path: string } | { kind: 'text'; text: string };

export interface MissionSummary {
  id: string;
  projectName: string;
  assemblyName: string;
  /** The Task folder or file: the given path, or the Mission folder for a text Task. */
  taskPath: string;
  /** The display name of the Task: the file or folder name, or the first line of the text. */
  taskTitle: string;
  workItemId?: string;
  state: MissionState;
  currentSlot: string | null;
  /** The Checkout's current branch, read at start and refreshed after every Slot. */
  branch: string | null;
  checkoutPath: string;
  startedAt: string;
  cost: Cost & { estimated: true };
  pr?: PullRequestRef;
  note?: 'interrupted';
}

export interface SlotRecord {
  name: string;
  attempts: number;
  loops: number;
  lastOutput?: string;
  cost: Cost;
  checkResults: CheckResult[];
}

export interface PendingQuestion {
  id: string;
  slot: string;
  questions: Question[];
}

export interface MissionAttention {
  cause: NeedsAttentionCause;
  reason: string;
  slot: string;
  failedChecks: CheckResult[];
}

export interface MissionResult {
  report: string;
  pr: PullRequestRef | null;
  exitSlot: string;
}

/** Everything a freshly opened Mission page needs. */
export interface MissionDetail {
  summary: MissionSummary;
  /** The Assembly document at start, for drawing the clock. */
  assembly: AssemblyFile;
  /** Assembly order, then the `core` pseudo-Slot. */
  slots: SlotRecord[];
  transcript: TranscriptSection[];
  /** True for Missions recovered from the ledger after a restart. */
  transcriptLost: boolean;
  pendingQuestion?: PendingQuestion;
  attention?: MissionAttention;
  result?: MissionResult;
  /** The last event applied to this detail. */
  seq: number;
}
