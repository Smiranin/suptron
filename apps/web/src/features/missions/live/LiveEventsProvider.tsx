import { createContext, useContext, type ReactNode } from 'react';
import { EventSourceLiveEvents, type LiveEvents } from './LiveEvents';

const LiveEventsContext = createContext<LiveEvents | null>(null);

export function LiveEventsProvider({ live, children }: { live: LiveEvents; children: ReactNode }) {
  return <LiveEventsContext.Provider value={live}>{children}</LiveEventsContext.Provider>;
}

let fallback: LiveEvents | null = null;

export function useLiveEvents(): LiveEvents {
  const live = useContext(LiveEventsContext);
  if (live) return live;
  fallback ??= new EventSourceLiveEvents();
  return fallback;
}
