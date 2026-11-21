import {
  executionId,
  isActiveState,
  type Cost,
  type ExecutionKey,
  type MissionState,
  type MissionSummary,
  type NeedsAttentionCause,
  type TranscriptSection,
} from '@suptron/runtime/browser';
import type { MissionsListState, ReadyMissionState } from './types';

export const CAUSE_LABELS: Record<NeedsAttentionCause, string> = {
  handover_not_done: 'Handover not done',
  attempt_limit: 'Attempt limit reached',
  loop_limit: 'Loop limit reached',
  last_exit_condition_failed: 'Last Exit Condition failed',
  ci_timeout: 'CI timed out',
  engine_error: 'Engine error',
};

export function needsYou(state: MissionState): boolean {
  return state === 'waiting_for_owner' || state === 'needs_attention';
}

/** At work, or going on by itself when the usage limit resets: nothing for the Commander to do. */
export function inProgress(state: MissionState): boolean {
  return state === 'running' || state === 'waiting_for_usage';
}

/** A Slot is under way: the Mission runs, waits for an answer or waits for usage. */
export function slotUnderWay(state: MissionState): boolean {
  return inProgress(state) || state === 'waiting_for_owner';
}

/** "15:00", or "Mon 15:00" when the moment is not today: when a usage limit resets. */
export function formatResetTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (at.toDateString() === now.toDateString()) return time;
  return `${at.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

export interface MissionGroups {
  needsYou: MissionSummary[];
  running: MissionSummary[];
  finished: MissionSummary[];
}

function newestFirst(a: MissionSummary, b: MissionSummary): number {
  return b.startedAt.localeCompare(a.startedAt);
}

export function groupMissions(state: MissionsListState): MissionGroups {
  const all = Object.values(state.missions).sort(newestFirst);
  return {
    needsYou: all.filter((m) => needsYou(m.state)),
    running: all.filter((m) => inProgress(m.state)),
    finished: all.filter((m) => !isActiveState(m.state)),
  };
}

export function needsYouCount(state: MissionsListState): number {
  return Object.values(state.missions).filter((m) => needsYou(m.state)).length;
}

/** The Task title, plus the Work Item ID when given. */
export function taskName(summary: Pick<MissionSummary, 'taskTitle' | 'workItemId'>): string {
  return summary.workItemId ? `${summary.taskTitle} (${summary.workItemId})` : summary.taskTitle;
}

export function missionTitle(
  summary: Pick<MissionSummary, 'assemblyName' | 'taskTitle' | 'workItemId'>,
): string {
  return `${summary.assemblyName} · ${taskName(summary)}`;
}

export function sectionsOf(state: ReadyMissionState, slot: string): TranscriptSection[] {
  return state.sections.filter((s) => s.execution.slot === slot);
}

export function currentExecution(state: ReadyMissionState): ExecutionKey | null {
  return state.current;
}

export function isCurrentSection(state: ReadyMissionState, section: TranscriptSection): boolean {
  return state.current !== null && executionId(state.current) === executionId(section.execution);
}

export function totalCost(state: ReadyMissionState): Cost {
  return state.summary.cost;
}

/** Two minutes without any event: the Commander should know the Pilot may be stuck. */
export const SILENCE_AFTER_MS = 120_000;

export interface LiveRow {
  text: string;
  /** True when nothing arrived for `SILENCE_AFTER_MS`: the row warns instead of reassuring. */
  stale: boolean;
}

function seconds(ms: number): string {
  return `${Math.max(0, Math.floor(ms / 1000))} s`;
}

/**
 * The live row under the current Slot's transcript while the Mission runs: what the Pilot is
 * doing and for how long, or a warning when nothing has arrived for two minutes. Null when the
 * Mission is not running (waiting for the Commander, Needs Attention, finished).
 */
export function liveRow(state: ReadyMissionState, now: number): LiveRow | null {
  if (state.summary.state !== 'running') return null;
  const silence = now - state.lastEventAt;
  if (silence >= SILENCE_AFTER_MS) {
    return { text: `No activity for ${Math.floor(silence / 60_000)} min`, stale: true };
  }
  const activity = state.activity;
  if (activity === undefined) return { text: `Working… ${seconds(silence)}`, stale: false };
  const elapsed = seconds(now - activity.since);
  switch (activity.phase) {
    case 'thinking':
      return { text: `Thinking… ${elapsed}`, stale: false };
    case 'writing':
      return { text: `Writing… ${elapsed}`, stale: false };
    case 'tool':
      return {
        text: activity.detail
          ? `Running ${activity.detail}… ${elapsed}`
          : `Running a tool… ${elapsed}`,
        stale: false,
      };
  }
}
