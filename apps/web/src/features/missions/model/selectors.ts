import {
  DEFAULTS,
  executionId,
  isActiveState,
  type Cost,
  type ExecutionKey,
  type MissionState,
  type MissionSummary,
  type NeedsAttentionCause,
  type TranscriptSection,
} from '@suptron/runtime/browser';
import type { MissionsListState, ReadyMissionState, SlotVisualState } from './types';

export const CAUSE_LABELS: Record<NeedsAttentionCause, string> = {
  attempt_limit: 'Attempt limit reached',
  loop_limit: 'Loop limit reached',
  last_exit_condition_failed: 'Last Exit Condition failed',
  ci_timeout: 'CI timed out',
  engine_error: 'Engine error',
};

export function needsYou(state: MissionState): boolean {
  return state === 'waiting_for_owner' || state === 'needs_attention';
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
    running: all.filter((m) => m.state === 'running'),
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

export interface MissionDecorations {
  slots: Record<
    string,
    {
      state: SlotVisualState;
      current: boolean;
      marker?: 'waiting' | 'attention';
      attempts: number;
      cost: Cost;
    }
  >;
  loops: Record<string, { iterations: number; limit: number; firedAt?: number }>;
  exitLit: string | null;
  core: { state: MissionState; cost: Cost };
}

/** Turns the page store into what the clock draws; the clock never sees Mission state directly. */
export function missionDecorations(state: ReadyMissionState): MissionDecorations {
  const active = state.summary.state === 'running' || state.summary.state === 'waiting_for_owner';
  const currentSlot = active ? (state.current?.slot ?? state.summary.currentSlot) : null;
  const slots: MissionDecorations['slots'] = {};
  for (const slot of state.assembly.slots) {
    const record = state.slots[slot.name];
    let visual = state.slotStatus[slot.name] ?? 'pending';
    if (currentSlot === slot.name && visual !== 'done') visual = 'running';
    if (state.attention?.slot === slot.name) visual = 'failed';
    const marker =
      state.pendingQuestion?.slot === slot.name
        ? 'waiting'
        : state.attention?.slot === slot.name
          ? 'attention'
          : undefined;
    slots[slot.name] = {
      state: visual,
      current:
        (state.current?.slot ?? state.summary.currentSlot) === slot.name &&
        state.summary.state !== 'completed',
      ...(marker && { marker }),
      attempts: record?.attempts ?? 0,
      cost: record?.cost ?? { usd: 0, inputTokens: 0, outputTokens: 0 },
    };
  }
  const loops: MissionDecorations['loops'] = {};
  for (const slot of state.assembly.slots) {
    if (!slot.loop) continue;
    const firedAt = state.loopFiredAt[slot.name];
    loops[slot.name] = {
      iterations: state.slots[slot.name]?.loops ?? 0,
      limit: slot.loop.limit ?? state.assembly.core.defaultLoopLimit ?? DEFAULTS.loopLimit,
      ...(firedAt !== undefined && { firedAt }),
    };
  }
  return {
    slots,
    loops,
    exitLit: state.result?.exitSlot ?? null,
    core: { state: state.summary.state, cost: state.summary.cost },
  };
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
