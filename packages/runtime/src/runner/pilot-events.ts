import type { ResolvedSubPilot } from '../config/snapshot.js';
import type { SubPilotActivity } from '../domain/mission.js';
import type { AgentEvent, SubAgentSpec } from '../engine/index.js';
import type { MissionEventInput } from '../events/mission-event.js';

type SubAgentEvent = Extract<AgentEvent, { type: 'sub_agent_called' | 'sub_agent_returned' }>;

/** Where a Pilot's events are filed: the Mission, the Slot or Side Slot, and its Attempt. */
export interface PilotEventTarget {
  missionId: string;
  slot: string;
  attempt: number;
}

/** The Sub-pilots as the Engine is given them: named after their Unit. */
export function subAgentSpecs(subPilots: readonly ResolvedSubPilot[]): SubAgentSpec[] {
  return subPilots.map((sub) => ({
    name: sub.unit,
    description: sub.title,
    model: sub.model,
    systemPrompt: { rules: sub.rules, instructions: sub.instructions },
    required: sub.required,
  }));
}

/**
 * What one Attempt's Pilot did with its Sub-pilots, counted from the Engine's neutral events. A
 * call of an agent that is not a Sub-pilot (one of the Engine's general agents) is not counted,
 * and neither is a return that ended in an error.
 */
export class SubPilotLog {
  private readonly activity = new Map<string, SubPilotActivity>();

  constructor(private readonly subPilots: readonly ResolvedSubPilot[]) {
    for (const sub of subPilots) {
      this.activity.set(sub.unit, { unit: sub.unit, calls: 0, returns: 0 });
    }
  }

  /** Counts a call or a return; false when the agent is not a Sub-pilot of this Pilot. */
  record(event: SubAgentEvent): boolean {
    const entry = this.activity.get(event.name);
    if (!entry) return false;
    if (event.type === 'sub_agent_called') entry.calls += 1;
    else if (!event.isError) entry.returns += 1;
    return true;
  }

  /** Every Sub-pilot in the Slot's order with its counts, as a SlotRecord keeps them. */
  activities(): SubPilotActivity[] {
    return [...this.activity.values()].map((entry) => ({ ...entry }));
  }

  /** The Sub-pilots that returned without an error at least once. */
  returned(): ReadonlySet<string> {
    return new Set([...this.activity.values()].filter((e) => e.returns > 0).map((e) => e.unit));
  }

  /** The required Sub-pilots that did not return. */
  missingRequired(): string[] {
    const returned = this.returned();
    return this.subPilots
      .filter((sub) => sub.required && !returned.has(sub.unit))
      .map((s) => s.unit);
  }
}

/**
 * The Mission event of an Engine event that is only reported: what the Pilot writes and does,
 * signs of life, and its Sub-pilots' calls and returns (counted in `log`). Null for an event the
 * caller acts on (error, question, session, usage limit, result) and for an agent that is not a
 * Sub-pilot.
 */
export function reportedEvent(
  event: AgentEvent,
  target: PilotEventTarget,
  log: SubPilotLog,
): MissionEventInput | null {
  const { missionId, slot, attempt } = target;
  switch (event.type) {
    case 'text':
      return { type: 'agent.text', missionId, slot, payload: event };
    case 'activity':
      return { type: 'agent.activity', missionId, slot, payload: event };
    case 'tool_call':
      return { type: 'agent.tool_call', missionId, slot, payload: event };
    case 'tool_result':
      return { type: 'agent.tool_result', missionId, slot, payload: event };
    case 'sub_agent_called':
      if (!log.record(event)) return null;
      return {
        type: 'agent.sub_pilot_called',
        missionId,
        slot,
        attempt,
        subPilot: event.name,
        callId: event.callId,
      };
    case 'sub_agent_returned':
      if (!log.record(event)) return null;
      return {
        type: 'agent.sub_pilot_returned',
        missionId,
        slot,
        attempt,
        subPilot: event.name,
        callId: event.callId,
        isError: event.isError,
      };
    default:
      return null;
  }
}
