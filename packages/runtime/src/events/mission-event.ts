import type { Check, CheckResult } from '../domain/check.js';
import type { Cost } from '../domain/cost.js';
import type { PullRequestRef } from '../domain/host.js';
import type {
  MissionResult,
  MissionState,
  MissionSummary,
  NeedsAttentionCause,
  Resolution,
  SideSlotStatus,
  SlotRecord,
} from '../domain/mission.js';
import type { AgentMarker, Answers, Question } from '../domain/transcript.js';

/** What the agent is doing between two transcript entries; `detail` names the tool when `phase` is 'tool'. */
export type ActivityPhase = 'thinking' | 'writing' | 'tool';

/** `agent` marks work done inside an agent the Pilot called. */
export type AgentPayload =
  | { type: 'text'; text: string; agent?: AgentMarker }
  | { type: 'activity'; phase: ActivityPhase; detail?: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown; agent?: AgentMarker }
  | {
      type: 'tool_result';
      toolCallId: string;
      output: string;
      isError: boolean;
      agent?: AgentMarker;
    }
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
      /** When the usage limit resets; with `waiting_for_usage` only. */
      resetsAt?: string;
    }
  /** The Commander resumed a Stopped Mission; `mission` replaces the summary (the note is gone). */
  | { type: 'mission.resumed'; missionId: string; seq: number; mission: MissionSummary }
  | {
      type: 'slot.started';
      missionId: string;
      seq: number;
      slot: string;
      attempt: number;
      loopIteration?: number;
      loopFrom?: string;
      /** Who granted this round at the Loop limit; absent for a round inside the limit. */
      loopGrantedBy?: 'commander' | 'core';
      note?: string;
    }
  | {
      type: 'slot.done';
      missionId: string;
      seq: number;
      slot: string;
      output: string;
      /** The Done Condition failed at the Loop limit but the Accept Condition held. */
      acceptedAtLimit?: true;
    }
  /**
   * The Mission passed a done Slot by on its way through the round of a later Slot's Loop
   * (`loopFrom`): the Slot did not run and keeps its last Slot Output.
   */
  | { type: 'slot.skipped'; missionId: string; seq: number; slot: string; loopFrom: string }
  /** The Core took a Resolution on this Slot instead of sending the Mission to Needs Attention. */
  | { type: 'core.resolved'; missionId: string; seq: number; slot: string; resolution: Resolution }
  /** A call of the Core has ended, by a result or by an error. Ephemeral, like `agent.activity`. */
  | { type: 'core.idle'; missionId: string; seq: number }
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
  /**
   * A sign of life between two transcript entries (the model thinks, writes or runs a tool), of a
   * Pilot or, with the slot `core`, of the Core while it composes a prompt or judges.
   * Ephemeral: not a transcript entry, not kept by the server's stores, not replayed.
   */
  | {
      type: 'agent.activity';
      missionId: string;
      seq: number;
      slot: string;
      payload: Extract<AgentPayload, { type: 'activity' }>;
    }
  /** The Slot's Pilot called one of its Sub-pilots in this Attempt. */
  | {
      type: 'agent.sub_pilot_called';
      missionId: string;
      seq: number;
      slot: string;
      attempt: number;
      subPilot: string;
      callId: string;
    }
  /** A Sub-pilot returned to the Pilot; `isError` when it ended in an error. */
  | {
      type: 'agent.sub_pilot_returned';
      missionId: string;
      seq: number;
      slot: string;
      attempt: number;
      subPilot: string;
      callId: string;
      isError: boolean;
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
  /** A Side Slot (`slot`) of the Slot `parent` joined its chain and waits for its turn. */
  | { type: 'side_slot.waiting'; missionId: string; seq: number; slot: string; parent: string }
  /** A Side Slot began a run; `attempt` counts its runs. Its Pilot's events carry its name. */
  | {
      type: 'side_slot.started';
      missionId: string;
      seq: number;
      slot: string;
      parent: string;
      attempt: number;
    }
  | {
      type: 'side_slot.ended';
      missionId: string;
      seq: number;
      slot: string;
      parent: string;
      attempt: number;
      status: Extract<SideSlotStatus, 'done' | 'failed' | 'interrupted'>;
      note?: string;
    }
  /** The Slot (`slot`) was done again while its Side Slots from an earlier time still ran. */
  | { type: 'side_slots.left_out'; missionId: string; seq: number; slot: string }
  /**
   * The Exit Condition held and the final report is written; the Mission stays Running until its
   * Side Slots have ended, then `mission.completed` follows with the same result.
   */
  | { type: 'mission.reported'; missionId: string; seq: number; result: MissionResult }
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
  'mission.resumed',
  'slot.started',
  'slot.done',
  'slot.skipped',
  'question.asked',
  'question.answered',
  'cost.updated',
  'side_slot.waiting',
  'side_slot.started',
  'side_slot.ended',
  'mission.reported',
  'mission.completed',
  'mission.stopped',
  'mission.dismissed',
]);

export function isGlobalStreamEvent(event: MissionEvent): boolean {
  return GLOBAL_STREAM_EVENT_TYPES.has(event.type);
}

/** Event types that are sent live and never stored or replayed: they mean nothing after the fact. */
const EPHEMERAL_EVENT_TYPES: ReadonlySet<MissionEventType> = new Set<MissionEventType>([
  'agent.activity',
  'core.idle',
]);

/** True for an event that is sent live and never stored or replayed. */
export function isEphemeralEvent(event: Pick<MissionEvent, 'type'>): boolean {
  return EPHEMERAL_EVENT_TYPES.has(event.type);
}
