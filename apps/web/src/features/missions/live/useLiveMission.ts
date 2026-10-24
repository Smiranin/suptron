import { useCallback, useEffect, useReducer, useRef, type Dispatch } from 'react';
import { missionsApi, NotFoundError } from '../../../api/missions';
import { initialMissionPageState, reduceMissionPage } from '../model/mission-reducer';
import type { MissionPageAction, MissionPageState } from '../model/types';
import { useLiveEvents } from './LiveEventsProvider';

/**
 * Fetches the Mission, subscribes after its `seq`, and re-initialises the store after a resync
 * or a reconnect so nothing missed is lost silently (SPEC FR-34, FR-35).
 */
export function useLiveMission(id: string): [MissionPageState, Dispatch<MissionPageAction>] {
  const live = useLiveEvents();
  const [state, dispatch] = useReducer(reduceMissionPage, initialMissionPageState);
  const wasClosed = useRef(false);

  const refetch = useCallback(
    (cancelled: () => boolean) =>
      missionsApi
        .get(id)
        .then((detail) => {
          if (!cancelled()) dispatch({ type: 'init', detail });
          return detail;
        })
        .catch((error: unknown) => {
          if (cancelled()) return null;
          if (error instanceof NotFoundError) dispatch({ type: 'absent' });
          else console.error('[suptron] mission fetch failed', error);
          return null;
        }),
    [id],
  );

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    const isCancelled = () => cancelled;
    void refetch(isCancelled).then((detail) => {
      if (cancelled || !detail) return;
      unsubscribe = live.subscribe(
        { missionId: id, after: detail.seq },
        {
          onEvent: (event) => {
            if (event.type === 'mission.dismissed') dispatch({ type: 'absent' });
            else dispatch({ type: 'event', event });
          },
          onResync: () => void refetch(isCancelled),
          onStatus: (status) => {
            dispatch({ type: 'connection', status });
            if (status === 'closed') wasClosed.current = true;
            else if (status === 'open' && wasClosed.current) {
              wasClosed.current = false;
              void refetch(isCancelled);
            }
          },
        },
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [id, live, refetch]);

  return [state, dispatch];
}
