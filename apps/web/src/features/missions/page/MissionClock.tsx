import type { AssemblyFile } from '@suptron/runtime/browser';
import { cn } from '@suptron/ui/lib/utils';
import { AlertTriangle, MessageCircleQuestion } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CostLabel } from '../../../components/cost-label';
import { STATE_LABELS } from '../../../components/state-badge';
import {
  ClockView,
  layoutClock,
  useViewportSize,
  type AttachedPlate,
  type Viewport,
} from '../../clock';
import type { PanelSelection } from '../model/types';
import {
  loopBadge,
  type CorePiece,
  type LoopPiece,
  type MissionPicture,
  type SlotPiece,
} from '../picture';

const HIGHLIGHT_MS = 1500;

/** The content of a Slot's card on the clock: name, Unit, state, counters and cost. */
export function MissionSlotCard({ slot }: { slot: SlotPiece }) {
  const { name, unit, state, current, marker, attempts, skipped, cost } = slot;
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
        {skipped > 0 && (
          <span
            data-testid="skipped-counter"
            title="Passed by in a later Slot's Loop: its Slot Output is from before those rounds"
          >
            Skipped {skipped}×
          </span>
        )}
        <CostLabel cost={cost} />
      </div>
    </div>
  );
}

/** The content of the clock's centre: the Core with the state of the Mission and its own cost. */
export function MissionCoreContent({ core }: { core: CorePiece }) {
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
function useRecentlyFired(loops: readonly LoopPiece[]): Set<string> {
  const latest = Math.max(0, ...loops.map((l) => l.firedAt ?? 0));
  // `now` lags behind a fresh `firedAt` until the timer catches up, which is exactly the highlight window.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (latest === 0) return;
    const timer = setTimeout(() => setNow(Date.now()), HIGHLIGHT_MS + 50);
    return () => clearTimeout(timer);
  }, [latest]);
  return new Set(
    loops
      .filter((l) => l.firedAt !== undefined && now - l.firedAt < HIGHLIGHT_MS)
      .map((l) => l.ref.slot),
  );
}

/** The status a plate shows: none for a Sub-pilot or Side Slot that was not started yet. */
function plateStatus(slot: SlotPiece | undefined, plate: AttachedPlate): string | undefined {
  const status =
    plate.kind === 'sideSlot'
      ? slot?.sideSlots.find((s) => s.name === plate.name)?.status
      : slot?.subPilots.find((s) => s.unit === plate.name)?.status;
  return status === 'idle' ? undefined : status;
}

/** Whether a plate is the element the page has selected. */
function plateSelected(selection: PanelSelection, plate: AttachedPlate): boolean {
  return plate.kind === 'sideSlot'
    ? selection.kind === 'sideSlot' && selection.name === plate.name
    : selection.kind === 'subPilot' &&
        selection.slot === plate.slot &&
        selection.unit === plate.name;
}

export interface MissionClockProps {
  /** Only for `layoutClock`: the geometry of the clock is computed from the Assembly. */
  assembly: AssemblyFile;
  picture: MissionPicture;
  selection: PanelSelection;
  onSelect(selection: PanelSelection): void;
  /** Tests pass a fixed viewport; the page measures with ResizeObserver. */
  viewport?: Viewport;
}

/** The read-only clock of a Mission: draws the picture of the Mission with the editor's layout. */
export function MissionClock({
  assembly,
  picture,
  selection,
  onSelect,
  viewport: fixed,
}: MissionClockProps) {
  const layout = useMemo(() => layoutClock(assembly), [assembly]);
  const slots = useMemo(() => new Map(picture.slots.map((s) => [s.name, s])), [picture.slots]);
  const loops = useMemo(
    () => picture.slots.flatMap((s) => (s.loop ? [s.loop] : [])),
    [picture.slots],
  );
  const fired = useRecentlyFired(loops);
  const { ref, viewport } = useViewportSize(fixed);
  const selected =
    selection.kind === 'slot' ? selection.name : selection.kind === 'mission' ? 'core' : null;
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
        core={<MissionCoreContent core={picture.core} />}
        card={(position) => {
          const slot = slots.get(position.name);
          return slot && <MissionSlotCard slot={slot} />;
        }}
        cardProps={(name) => ({
          'data-state': slots.get(name)?.state,
          'data-current': slots.get(name)?.current ? 'true' : undefined,
          className: 'cursor-pointer',
          role: 'button',
          'aria-label': `Slot ${name}`,
        })}
        loops={Object.fromEntries(
          loops.map((loop) => [
            loop.ref.slot,
            {
              badge: loopBadge(loop.iterations, loop.limit),
              highlighted: fired.has(loop.ref.slot),
            },
          ]),
        )}
        exits={Object.fromEntries(
          layout.exits.map((exit) => [
            exit.slot,
            { label: 'exit', highlighted: slots.get(exit.slot)?.exitPoint?.lit === true },
          ]),
        )}
        onSlotClick={(name) => onSelect({ kind: 'slot', name })}
        onCoreClick={() => onSelect({ kind: 'mission' })}
        plate={(plate) => ({
          status: plateStatus(slots.get(plate.slot), plate),
          selected: plateSelected(selection, plate),
        })}
        onPlateClick={(plate) =>
          onSelect(
            plate.kind === 'sideSlot'
              ? { kind: 'sideSlot', name: plate.name }
              : { kind: 'subPilot', slot: plate.slot, unit: plate.name },
          )
        }
        animateCards={false}
      />
    </div>
  );
}
