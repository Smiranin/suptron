import { Button } from '@suptron/ui/components/button';
import { cn } from '@suptron/ui/lib/utils';
import { Maximize2 } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { ClockLayout, SlotPosition, Viewport } from './layout';
import {
  ArrowMarkers,
  CardShell,
  CoreCircle,
  ExitArrow,
  ForwardArrows,
  LoopChord,
  Ring,
  StartMarker,
} from './primitives';
import { useClockViewport, type ClockViewportState } from './use-clock-viewport';

export interface ClockViewProps {
  layout: ClockLayout;
  viewport: Viewport;
  /** Content of the centre circle. */
  core?: ReactNode;
  card(slot: SlotPosition): ReactNode;
  /** Editor drag handlers, data-state attributes, per card. */
  cardProps?(name: string): HTMLAttributes<HTMLDivElement>;
  /** Keyed by the looping Slot; default badge "max N". */
  loops?: Record<string, { badge?: ReactNode; highlighted?: boolean }>;
  /** Keyed by the Exit Point Slot. */
  exits?: Record<string, { label: string; highlighted?: boolean }>;
  /** Extra SVG inside the transformed container (editor only). */
  overlays?: ReactNode;
  /** Extra HTML inside the transformed container (ghost cards, plus controls). */
  htmlOverlays?: ReactNode;
  onSlotClick?(name: string, event: React.MouseEvent<HTMLDivElement>): void;
  onSlotDoubleClick?(name: string): void;
  onCoreClick?(): void;
  onLoopHover?(from: string | null): void;
  selected?: string | 'core' | null;
  /** When the parent needs the viewport state (drags convert pointer positions with `toClock`). */
  viewportRef?: (state: ClockViewportState) => void;
  emptyHint?: ReactNode;
  className?: string;
  animateCards?: boolean;
}

/**
 * The shared clock: one transformed container holding the SVG layer (ring, arrows, chords) and the
 * HTML card layer, so both share the clock coordinate system and never drift under zoom.
 */
export function ClockView(props: ClockViewProps) {
  const { layout, viewport } = props;
  const state = useClockViewport(layout, viewport);
  props.viewportRef?.(state);
  return (
    <div
      data-testid="clock-canvas"
      className={cn(
        'bg-muted/40 relative size-full overflow-hidden',
        state.spaceHeld && 'cursor-grab',
        props.className,
      )}
      {...state.wheelHandlers}
      {...state.panHandlers}
      data-clock-background=""
    >
      <div
        data-testid="clock-transform"
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: layout.box.width, height: layout.box.height, transform: state.transform }}
      >
        <svg
          width={layout.box.width}
          height={layout.box.height}
          viewBox={`0 0 ${layout.box.width} ${layout.box.height}`}
          className="absolute top-0 left-0 overflow-visible"
          data-clock-background=""
        >
          <ArrowMarkers />
          <Ring layout={layout} />
          <ForwardArrows layout={layout} />
          {layout.loops.map((loop) => (
            <LoopChord
              key={`${loop.from}-${loop.to}`}
              loop={loop}
              badge={props.loops?.[loop.from]?.badge}
              highlighted={props.loops?.[loop.from]?.highlighted}
              onPointerEnter={() => props.onLoopHover?.(loop.from)}
              onPointerLeave={() => props.onLoopHover?.(null)}
            />
          ))}
          {layout.exits.map((exit) => (
            <ExitArrow
              key={exit.slot}
              exit={exit}
              label={props.exits?.[exit.slot]?.label ?? 'when done'}
              highlighted={props.exits?.[exit.slot]?.highlighted}
            />
          ))}
          <StartMarker layout={layout} />
          {props.overlays}
          <CoreCircle
            layout={layout}
            selected={props.selected === 'core'}
            onClick={props.onCoreClick}
          >
            {props.core}
          </CoreCircle>
        </svg>
        {layout.slots.map((slot) => (
          <CardShell
            key={slot.name}
            name={slot.name}
            position={slot.position}
            selected={props.selected === slot.name}
            animate={props.animateCards}
            onClick={(event) => props.onSlotClick?.(slot.name, event)}
            onDoubleClick={() => props.onSlotDoubleClick?.(slot.name)}
            {...props.cardProps?.(slot.name)}
          >
            {props.card(slot)}
          </CardShell>
        ))}
        {props.htmlOverlays}
      </div>
      {layout.slots.length === 0 && props.emptyHint && (
        <div className="text-muted-foreground pointer-events-none absolute inset-x-0 top-6 flex justify-center text-sm">
          {props.emptyHint}
        </div>
      )}
      <div className="absolute right-3 bottom-3 flex items-center gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          {Math.round(state.scale * 100)}%
        </span>
        <Button type="button" size="sm" variant="outline" onClick={state.fit} aria-label="Fit">
          <Maximize2 aria-hidden="true" /> Fit
        </Button>
      </div>
    </div>
  );
}
