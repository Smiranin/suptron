import type { MissionSummary } from '@suptron/runtime/browser';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { missionsApi } from '../../api/missions';
import { createStore, useStore, type Store } from '../../lib/store';
import { useLiveEvents } from './live';
import type { LiveStatus } from './live/LiveEvents';
import {
  applyMissionsListEvent,
  initialMissionsListState,
  replaceMissions,
} from './model/missions-list-reducer';
import { groupMissions, needsYouCount } from './model/selectors';
import type { MissionsListState } from './model/types';

interface MissionsContextValue {
  store: Store<MissionsListState>;
  setPageTitle(title: string | null): void;
}

const MissionsContext = createContext<MissionsContextValue | null>(null);

/** App-wide: the Missions list store, fed by the global event stream, plus the tab title. */
export function MissionsProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createStore(initialMissionsListState));
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  useLiveMissions(store);
  const state = useStore(store);
  const count = needsYouCount(state);
  useEffect(() => {
    const prefix = count > 0 ? `(${count}) ` : '';
    document.title = pageTitle ? `${prefix}${pageTitle} · Suptron` : `${prefix}Suptron`;
  }, [count, pageTitle]);
  const value = useMemo(() => ({ store, setPageTitle }), [store]);
  return <MissionsContext.Provider value={value}>{children}</MissionsContext.Provider>;
}

/** Fetches the list once, subscribes globally, and refetches after a reconnect or a resync. */
function useLiveMissions(store: Store<MissionsListState>): void {
  const live = useLiveEvents();
  const wasClosed = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const refetch = () => {
      missionsApi
        .list()
        .then((list) => {
          if (!cancelled) store.setState((s) => replaceMissions(s, list));
        })
        .catch((error: unknown) => console.error('[suptron] missions list failed', error));
    };
    refetch();
    const unsubscribe = live.subscribe(
      {},
      {
        onEvent: (event) => store.setState((s) => applyMissionsListEvent(s, event)),
        onResync: refetch,
        onStatus: (status: LiveStatus) => {
          store.setState((s) => ({ ...s, connection: status }));
          if (status === 'closed') wasClosed.current = true;
          else if (status === 'open' && wasClosed.current) {
            wasClosed.current = false;
            refetch();
          }
        },
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [live, store]);
}

function useMissionsContext(): MissionsContextValue {
  const value = useContext(MissionsContext);
  if (!value) throw new Error('MissionsProvider is missing');
  return value;
}

export function useMissionsState(): MissionsListState {
  return useStore(useMissionsContext().store);
}

export function useMissions(): MissionSummary[] {
  const state = useMissionsState();
  return useMemo(() => Object.values(state.missions), [state.missions]);
}

export function useMissionGroups() {
  const state = useMissionsState();
  return useMemo(() => groupMissions(state), [state]);
}

export function useNeedsYouCount(): number {
  return needsYouCount(useMissionsState());
}

export function useMissionSummary(id: string | null | undefined): MissionSummary | undefined {
  const state = useMissionsState();
  return id ? state.missions[id] : undefined;
}

/** Sets the page part of the tab title while the component is mounted. */
export function usePageTitle(title: string | null): void {
  const { setPageTitle } = useMissionsContext();
  useEffect(() => {
    setPageTitle(title);
    return () => setPageTitle(null);
  }, [title, setPageTitle]);
}
