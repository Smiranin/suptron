import type { MissionEvent, MissionSummary } from '@suptron/runtime/browser';
import type { MissionsListState } from './types';

export const initialMissionsListState: MissionsListState = {
  missions: {},
  connection: 'connecting',
  loaded: false,
};

export function replaceMissions(
  state: MissionsListState,
  list: MissionSummary[],
): MissionsListState {
  return { ...state, loaded: true, missions: Object.fromEntries(list.map((m) => [m.id, m])) };
}

/** The only place the Missions list changes from events. */
export function applyMissionsListEvent(
  state: MissionsListState,
  event: MissionEvent,
): MissionsListState {
  if (event.type === 'mission.started') {
    return { ...state, missions: { ...state.missions, [event.missionId]: event.mission } };
  }
  if (event.type === 'mission.dismissed') {
    if (!(event.missionId in state.missions)) return state;
    const missions = { ...state.missions };
    delete missions[event.missionId];
    return { ...state, missions };
  }
  const current = state.missions[event.missionId];
  if (!current) return state;
  let next: MissionSummary;
  switch (event.type) {
    case 'mission.state':
      next = { ...current, state: event.state };
      break;
    case 'cost.updated':
      next = { ...current, cost: { ...event.missionTotal, estimated: true } };
      break;
    case 'slot.started':
      next = { ...current, currentSlot: event.slot };
      break;
    case 'mission.completed':
      next = {
        ...current,
        state: 'completed',
        currentSlot: null,
        cost: { ...event.cost, estimated: true },
        ...(event.pr && { pr: event.pr }),
      };
      break;
    case 'mission.stopped':
      next = {
        ...current,
        state: 'stopped',
        currentSlot: null,
        ...(event.note && { note: event.note }),
      };
      break;
    default:
      return state;
  }
  return { ...state, missions: { ...state.missions, [event.missionId]: next } };
}
