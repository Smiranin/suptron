import type { AssemblyFile } from '../config/schemas.js';
import type { CheckResult } from './check.js';
import type { Cost } from './cost.js';
import type { PullRequestRef } from './host.js';
import type { Question, TranscriptSection } from './transcript.js';
import type { WorkspaceSummary } from '../workspace/kinds.js';

export type MissionState =
  | 'running'
  | 'waiting_for_owner'
  /** The Engine refused a call by the usage limit; the Mission goes on by itself when it resets. */
  | 'waiting_for_usage'
  | 'needs_attention'
  | 'stopped'
  | 'completed';

export const ACTIVE_MISSION_STATES: readonly MissionState[] = [
  'running',
  'waiting_for_owner',
  'waiting_for_usage',
  'needs_attention',
];

export function isActiveState(state: MissionState): boolean {
  return ACTIVE_MISSION_STATES.includes(state);
}

export type NeedsAttentionCause =
  /** The Pilot handed over with Status `open` or `failed`, or without a Status line. */
  | 'handover_not_done'
  | 'attempt_limit'
  | 'loop_limit'
  | 'last_exit_condition_failed'
  | 'ci_timeout'
  | 'engine_error';

/**
 * A decision the Core took in the Commander's place at a point that would otherwise be a Needs
 * Attention: one more Attempt with the Core's note, or the result accepted with open points (the
 * `failedChecks`, and what the Pilot's Handover lists as open).
 */
export interface Resolution {
  cause: NeedsAttentionCause;
  decision: 'retry' | 'accept';
  reason: string;
  /** What the Pilot's next Attempt is told to do; `retry` only. */
  note?: string;
  failedChecks: CheckResult[];
}

/** The transcript line of a Resolution; the server's store and the web reducer both write it. */
export function resolutionNote(resolution: Resolution): string {
  const head =
    resolution.decision === 'accept'
      ? 'The Core accepted this Slot with open points'
      : 'The Core decided on one more Attempt';
  const note = resolution.note === undefined ? '' : `\n\nNote to the Pilot: ${resolution.note}`;
  return `${head}: ${resolution.reason}${note}`;
}

/** The Core's cost is recorded under this pseudo-Slot. */
export const CORE_SLOT_NAME = 'core';

/**
 * How the Commander hands over the Task: a file or folder on disk, or text typed at start. Text is
 * written to the Mission folder, so every Mission has a Task location on disk.
 */
export type MissionTask = { kind: 'path'; path: string } | { kind: 'text'; text: string };

/** Titles feed branch names and list rows, so they stay short. */
export const MISSION_TITLE_MAX_LENGTH = 80;

/**
 * The title of a Mission started without one: the Project and the Commander's local date
 * (`dojo-content-2026-11-12`). Two such Missions of one Project on one day share it; where the
 * title makes a branch name, the Commander gives a title.
 */
export function defaultMissionTitle(projectName: string, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${projectName}-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export interface MissionSummary {
  id: string;
  projectName: string;
  assemblyName: string;
  /** The Task folder or file: the given path, or the Mission folder for a text Task. */
  taskPath: string;
  /** The title given at start, or the Project name and the date; names what the Mission produces. */
  taskTitle: string;
  workItemId?: string;
  state: MissionState;
  currentSlot: string | null;
  /** Where the Mission works, read at start and refreshed after every Slot (FR-18). */
  workspace: WorkspaceSummary;
  startedAt: string;
  cost: Cost & { estimated: true };
  pr?: PullRequestRef;
  note?: 'interrupted';
  /** When the usage limit resets; present only in Waiting for usage. */
  usageResetsAt?: string;
}

export interface SlotRecord {
  name: string;
  attempts: number;
  /** Rounds of this Slot's Loop since a later Slot's Loop last brought the Mission back before it. */
  loops: number;
  /**
   * How often the Slot was passed by in the round of a later Slot's Loop (its `skipWhenDone`);
   * `lastOutput` then describes the work as it was before those rounds. Absent when never.
   */
  skipped?: number;
  lastOutput?: string;
  cost: Cost;
  checkResults: CheckResult[];
  /** In the order taken; absent when the Core took none on this Slot. */
  resolutions?: Resolution[];
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
  /** True for Missions recovered from the ledger after a restart, resumed or not. */
  transcriptLost: boolean;
  /** True for a Stopped Mission that holds what a Resume needs. */
  resumable: boolean;
  pendingQuestion?: PendingQuestion;
  attention?: MissionAttention;
  result?: MissionResult;
  /** The last event applied to this detail. */
  seq: number;
}
