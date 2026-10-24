import type { Check, CheckResult } from '../domain/check.js';
import type { Cost } from '../domain/cost.js';
import type { PullRequestRef } from '../domain/host.js';
import type {
  MissionState,
  MissionSummary,
  NeedsAttentionCause,
  SlotRecord,
} from '../domain/mission.js';
import type { Answers, Question } from '../domain/transcript.js';

export type AgentPayload =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolCallId: string; output: string; isError: boolean }
  | { type: 'error'; message: string };

/**
 * Every event of a Mission. `seq` is monotonic per Mission from 1 and is assigned by the
 * MissionRegistry at emission; `missionId` names the Mission on every event.
 */
export type MissionEvent =
  | { type: 'mission.started'; missionId: string; seq: number; mission: MissionSummary }
  | {
      type: 'mission.state';
      missionId: string;
      seq: number;
      state: MissionState;
      cause?: NeedsAttentionCause;
      reason?: string;
      slot?: string;
      failedChecks?: CheckResult[];
    }
  | {
      type: 'slot.started';
      missionId: string;
      seq: number;
      slot: string;
      attempt: number;
      loopIteration?: number;
      loopFrom?: string;
      note?: string;
    }
  | { type: 'slot.done'; missionId: string; seq: number; slot: string; output: string }
  | {
      type: 'agent.text';
      missionId: string;
      seq: number;
      slot: string;
      payload: Extract<AgentPayload, { type: 'text' }>;
    }
  | {
      type: 'agent.tool_call';
      missionId: string;
      seq: number;
      slot: string;
      payload: Extract<AgentPayload, { type: 'tool_call' }>;
    }
  | {
      type: 'agent.tool_result';
      missionId: string;
      seq: number;
      slot: string;
      payload: Extract<AgentPayload, { type: 'tool_result' }>;
    }
  | {
      type: 'agent.error';
      missionId: string;
      seq: number;
      slot: string;
      payload: Extract<AgentPayload, { type: 'error' }>;
    }
  | {
      type: 'check.evaluated';
      missionId: string;
      seq: number;
      slot: string;
      check: Check;
      holds: boolean;
      detail: string;
    }
  | {
      type: 'question.asked';
      missionId: string;
      seq: number;
      slot: string;
      questionId: string;
      questions: Question[];
    }
  | {
      type: 'question.answered';
      missionId: string;
      seq: number;
      slot: string;
      questionId: string;
      answers: Answers;
    }
  | {
      type: 'cost.updated';
      missionId: string;
      seq: number;
      slot: string;
      cost: Cost;
      missionTotal: Cost;
    }
  | {
      type: 'mission.completed';
      missionId: string;
      seq: number;
      report: string;
      pr: PullRequestRef | null;
      exitSlot: string;
      slots: SlotRecord[];
      cost: Cost;
    }
  | { type: 'mission.stopped'; missionId: string; seq: number; note?: 'interrupted' }
  | { type: 'mission.dismissed'; missionId: string; seq: number };

export type MissionEventType = MissionEvent['type'];

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** A MissionEvent before the registry stamps its `seq`. */
export type MissionEventInput = DistributiveOmit<MissionEvent, 'seq'>;

/** Event types the global stream forwards (everything but the per-Slot agent and Check traffic). */
export const GLOBAL_STREAM_EVENT_TYPES: ReadonlySet<MissionEventType> = new Set<MissionEventType>([
  'mission.started',
  'mission.state',
  'slot.started',
  'slot.done',
  'question.asked',
  'question.answered',
  'cost.updated',
  'mission.completed',
  'mission.stopped',
  'mission.dismissed',
]);

export function isGlobalStreamEvent(event: MissionEvent): boolean {
  return GLOBAL_STREAM_EVENT_TYPES.has(event.type);
}
