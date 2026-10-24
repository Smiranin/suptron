import { cn } from '@suptron/ui/lib/utils';
import { AlertTriangle, MessageCircleQuestion } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CostLabel } from '../../../components/cost-label';
import { STATE_LABELS } from '../../../components/state-badge';
import { ClockView, layoutClock, useViewportSize, type Viewport } from '../../clock';
import { missionDecorations, type MissionDecorations } from '../model/selectors';
import type { ReadyMissionState } from '../model/types';

const HIGHLIGHT_MS = 1500;

export function MissionSlotCard({
  name,
  unit,
  decoration,
}: {
  name: string;
  unit: string;
  decoration: MissionDecorations['slots'][string];
}) {
  const { state, current, marker, attempts, cost } = decoration;
  return (
    <div
      className="flex size-full flex-col justify-between"
      data-state={state}
      data-current={current ? 'true' : undefined}
      data-marker={marker}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{name}</div>
          {unit !== name && <div className="text-muted-foreground truncate text-xs">{unit}</div>}
        </div>
        {marker === 'waiting' && (
          <MessageCircleQuestion
            aria-label="Waiting for you"
            className="text-warning size-4 shrink-0"
          />
        )}
        {marker === 'attention' && (
          <AlertTriangle
            aria-label="Needs attention"
            className="text-destructive size-4 shrink-0"
          />
        )}
      </div>
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 font-semibold capitalize',
            state === 'running' && 'bg-success/15 text-success animate-pulse',
            state === 'done' && 'bg-success/15 text-success',
            state === 'failed' && 'bg-destructive/15 text-destructive',
            state === 'pending' && 'bg-muted',
          )}
        >
          {state}
        </span>
        {attempts > 1 && <span data-testid="attempt-counter">Attempt {attempts}</span>}
        <CostLabel cost={cost} />
      </div>
    </div>
  );
}

export function MissionCoreContent({ core }: { core: MissionDecorations['core'] }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2">
      <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
        Core
      </span>
      <span className="text-sm font-semibold" data-testid="core-state">
        {STATE_LABELS[core.state]}
      </span>
      <CostLabel cost={core.cost} className="text-xs" />
    </div>
  );
}

/** Which Loops fired within the last moment, so their chords light up once; re-rendered when the highlight ends. */
function useRecentlyFired(loops: MissionDecorations['loops']): Set<string> {
  const latest = Math.max(0, ...Object.values(loops).map((l) => l.firedAt ?? 0));
  // `now` lags behind a fresh `firedAt` until the timer catches up, which is exactly the highlight window.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (latest === 0) return;
    const timer = setTimeout(() => setNow(Date.now()), HIGHLIGHT_MS + 50);
    return () => clearTimeout(timer);
  }, [latest]);
  return new Set(
    Object.entries(loops)
      .filter(([, l]) => l.firedAt !== undefined && now - l.firedAt < HIGHLIGHT_MS)
      .map(([name]) => name),
  );
}

export interface MissionClockProps {
  state: ReadyMissionState;
  onSelectSlot(name: string): void;
  onSelectMission(): void;
  /** Tests pass a fixed viewport; the page measures with ResizeObserver. */
  viewport?: Viewport;
}

/** The read-only clock of a Mission: the editor's layout with per-Slot state, counters and cost (FR-15 to FR-18). */
export function MissionClock({
  state,
  onSelectSlot,
  onSelectMission,
  viewport: fixed,
}: MissionClockProps) {
  const layout = useMemo(() => layoutClock(state.assembly), [state.assembly]);
  const decorations = useMemo(() => missionDecorations(state), [state]);
  const fired = useRecentlyFired(decorations.loops);
  const { ref, viewport } = useViewportSize(fixed);
  const units = useMemo(
    () => new Map(state.assembly.slots.map((s) => [s.name, s.unit])),
    [state.assembly],
  );
  const selected = state.panel.selection.kind === 'slot' ? state.panel.selection.name : 'core';
  return (
    <div
      ref={ref}
      className="border-border h-full min-h-[420px] overflow-hidden rounded-xl border"
      data-testid="mission-clock"
    >
      <ClockView
        layout={layout}
        viewport={viewport}
        selected={selected}
        core={<MissionCoreContent core={decorations.core} />}
        card={(slot) => (
          <MissionSlotCard
            name={slot.name}
            unit={units.get(slot.name) ?? slot.name}
            decoration={decorations.slots[slot.name]!}
          />
        )}
        cardProps={(name) => ({
          'data-state': decorations.slots[name]?.state,
          'data-current': decorations.slots[name]?.current ? 'true' : undefined,
          className: 'cursor-pointer',
          role: 'button',
          'aria-label': `Slot ${name}`,
        })}
        loops={Object.fromEntries(
          Object.entries(decorations.loops).map(([from, loop]) => [
            from,
            { badge: `${loop.iterations} / ${loop.limit}`, highlighted: fired.has(from) },
          ]),
        )}
        exits={Object.fromEntries(
          layout.exits.map((exit) => [
            exit.slot,
            { label: 'exit', highlighted: decorations.exitLit === exit.slot },
          ]),
        )}
        onSlotClick={(name) => onSelectSlot(name)}
        onCoreClick={onSelectMission}
        animateCards={false}
      />
    </div>
  );
}
