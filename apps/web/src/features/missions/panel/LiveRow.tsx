import { cn } from '@suptron/ui/lib/utils';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { liveRow } from '../model/selectors';
import type { ReadyMissionState } from '../model/types';

/** A clock that ticks once a second while mounted, for the elapsed-time labels. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** The sign of life under the current Slot's transcript (plan F of the interview scenario). */
export function LiveRow({ state }: { state: ReadyMissionState }) {
  const now = useNow();
  const row = liveRow(state, now);
  if (row === null) return null;
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-xs',
        row.stale ? 'text-warning' : 'text-muted-foreground',
      )}
      data-testid="live-row"
      data-stale={row.stale ? 'true' : undefined}
      role="status"
    >
      {row.stale ? (
        <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
      )}
      <span className="tabular-nums">{row.text}</span>
    </div>
  );
}
