import type { AssemblyFile } from '@suptron/runtime/browser';
import { cn } from '@suptron/ui/lib/utils';
import { CornerDownLeft } from 'lucide-react';
import {
  useCallback,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { polarToCartesian } from '../../../lib/geometry';
import { ClockView } from '../../clock/ClockView';
import type { ClockViewportState } from '../../clock/use-clock-viewport';
import { summarizeCondition } from '@suptron/runtime/browser';
import { CARD_HEIGHT, CARD_WIDTH, type ClockLayout, type Viewport } from '../model/layout';
import type { Command } from '../model/reducer';
import { cardSummary, type UnitIndex } from '../model/selectors';
import type { EditorIssues } from '../model/validate';
import { ContextChords } from './ContextChords';
import { PlusControls } from './PlusControl';
import { SlotCardContent } from './SlotCardContent';
import { useLoopDrag } from './useLoopDrag';
import { useRingDrag } from './useRingDrag';

export interface ClockCanvasProps {
  doc: AssemblyFile;
  layout: ClockLayout;
  viewport: Viewport;
  units: UnitIndex;
  issues: EditorIssues;
  selected: string | 'core' | null;
  dispatch: (cmd: Command) => void;
  onSelect: (selected: string | 'core' | null) => void;
  onOpenInspector: () => void;
  onPlus: (index: number) => void;
  /** The canvas element and the viewport state, owned by the page so the palette drop can use them too. */
  container: RefObject<HTMLDivElement | null>;
  viewportState: RefObject<ClockViewportState | null>;
  /** Receives the viewport state on every render (the page stores it in `viewportState`). */
  onViewportState: (state: ClockViewportState) => void;
  /** The gap a palette drag would drop into, highlighted on its "+" control. */
  paletteGap: number | null;
}

/** The editor's clock: the shared ClockView plus reordering, Loop drags, palette drops and "+" controls. */
export function ClockCanvas(props: ClockCanvasProps) {
  const {
    doc,
    layout,
    viewport,
    units,
    issues,
    selected,
    dispatch,
    onSelect,
    onOpenInspector,
    onPlus,
    container,
    viewportState,
    paletteGap,
    onViewportState,
  } = props;
  const [hoveredLoop, setHoveredLoop] = useState<string | null>(null);

  const onMove = useCallback(
    (name: string, toIndex: number) => dispatch({ type: 'moveSlot', name, toIndex }),
    [dispatch],
  );
  const onCardClick = useCallback(
    (name: string, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.detail >= 2) return;
      onSelect(name);
    },
    [onSelect],
  );
  const ring = useRingDrag(layout, container, viewportState, onMove, onCardClick);
  const loop = useLoopDrag(layout, container, viewportState, (from, target) =>
    dispatch({ type: 'setLoop', name: from, loop: { target, limit: 0 } }),
  );

  const summaries = useMemo(
    () =>
      new Map(
        doc.slots.map((slot) => [
          slot.name,
          cardSummary(doc, slot, units, issues.bySlot.has(slot.name)),
        ]),
      ),
    [doc, units, issues],
  );
  const hoveredPair = useMemo(() => {
    if (!hoveredLoop) return new Set<string>();
    const slot = doc.slots.find((s) => s.name === hoveredLoop);
    return new Set(slot?.loop ? [slot.name, slot.loop.target] : []);
  }, [doc.slots, hoveredLoop]);

  const loops = useMemo(() => {
    const out: Record<string, { highlighted?: boolean }> = {};
    for (const l of layout.loops) out[l.from] = { highlighted: hoveredLoop === l.from };
    return out;
  }, [layout.loops, hoveredLoop]);
  const exits = useMemo(() => {
    const out: Record<string, { label: string }> = {};
    for (const slot of doc.slots) {
      const summary = summarizeCondition(slot.exitCondition ?? []);
      out[slot.name] = { label: summary || 'when done' };
    }
    return out;
  }, [doc.slots]);

  const ghostPath = useMemo(() => {
    if (!loop.ghost) return null;
    const from = layout.slots.find((s) => s.name === loop.ghost!.from);
    if (!from) return null;
    return `M ${from.position.x} ${from.position.y} L ${loop.ghost.pointer.x} ${loop.ghost.pointer.y}`;
  }, [layout.slots, loop.ghost]);

  const cardProps = useCallback(
    (name: string) => {
      const handlers = ring.cardHandlers(name);
      const dragging = ring.active?.name === name;
      const dropState = loop.ghost
        ? loop.ghost.over === name
          ? loop.ghost.droppable
            ? 'ok'
            : 'no'
          : loop.ghost.droppable ||
              layout.slots.find((s) => s.name === name)!.index <
                layout.slots.find((s) => s.name === loop.ghost!.from)!.index
            ? 'candidate'
            : 'blocked'
        : undefined;
      const style = dragging
        ? (() => {
            const p = polarToCartesian(layout.center, layout.radius, ring.active!.angle);
            return { left: p.x - CARD_WIDTH / 2, top: p.y - CARD_HEIGHT / 2, zIndex: 10 };
          })()
        : undefined;
      return {
        ...handlers,
        style,
        'data-dragging': dragging ? 'true' : undefined,
        'data-drop': dropState,
        'data-loop-hover': hoveredPair.has(name) ? 'true' : undefined,
        className: cn(
          'cursor-grab active:cursor-grabbing',
          dragging && 'transition-none shadow-lg',
          dropState === 'ok' && 'border-warning ring-warning/40 ring-4',
          dropState === 'blocked' && 'opacity-40',
          dropState === 'no' && 'border-destructive',
          hoveredPair.has(name) && 'border-warning',
        ),
      } as React.HTMLAttributes<HTMLDivElement>;
    },
    [hoveredPair, layout, loop.ghost, ring],
  );

  return (
    <div ref={container} className="relative size-full" data-testid="editor-canvas">
      <ClockView
        layout={layout}
        viewport={viewport}
        selected={selected}
        onSlotDoubleClick={(name) => {
          onSelect(name);
          onOpenInspector();
        }}
        onCoreClick={() => onSelect('core')}
        onLoopHover={setHoveredLoop}
        loops={loops}
        exits={exits}
        viewportRef={onViewportState}
        animateCards={!ring.active}
        cardProps={cardProps}
        card={(slot) => {
          const summary = summaries.get(slot.name)!;
          const handle = loop.handleHandlers(slot.name);
          return (
            <>
              <SlotCardContent summary={summary} />
              <button
                type="button"
                data-failure-handle=""
                data-testid="failure-handle"
                data-slot={slot.name}
                aria-label={`On failure of ${slot.name}: drag to an earlier Slot to create a Loop`}
                title="On failure: drag to an earlier Slot to create a Loop"
                className="bg-background text-warning hover:bg-warning hover:text-background absolute -right-3 top-1/2 flex size-6 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full border shadow-sm"
                {...handle}
              >
                <CornerDownLeft className="size-3.5" aria-hidden="true" />
              </button>
            </>
          );
        }}
        overlays={
          <>
            <ContextChords
              layout={layout}
              doc={doc}
              selected={typeof selected === 'string' && selected !== 'core' ? selected : null}
            />
            {ghostPath && (
              <path
                d={ghostPath}
                data-testid="loop-ghost"
                className={cn(
                  'fill-none',
                  loop.ghost?.droppable ? 'stroke-warning' : 'stroke-muted-foreground',
                )}
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            )}
          </>
        }
        htmlOverlays={<PlusControls layout={layout} highlighted={paletteGap} onClick={onPlus} />}
        emptyHint="Drag a Unit from the palette onto the ring, or press + to add the first Slot."
      />
    </div>
  );
}
