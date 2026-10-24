import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { angleOf, distance } from '../../../lib/geometry';
import type { ClockViewportState } from '../../clock/use-clock-viewport';
import { CARD_HEIGHT, insertionIndexAt, type ClockLayout } from '../model/layout';
import { pointerToClock } from './drag-context';

export interface PaletteDrop {
  /** The Unit being dragged and the gap it would land in (null while away from the ring). */
  dragging: { unit: string; gap: number | null } | null;
  itemHandlers(unit: string): {
    onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
    onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
    onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
    onPointerCancel(event: ReactPointerEvent<HTMLElement>): void;
  };
}

/** The gap a point would drop into: null when the pointer is not near the ring. */
export function gapAt(layout: ClockLayout, point: { x: number; y: number }): number | null {
  const d = distance(layout.center, point);
  if (d < layout.radius * 0.5 || d > layout.radius + CARD_HEIGHT) return null;
  return insertionIndexAt(layout, angleOf(layout.center, point));
}

/** Dragging a Unit from the palette onto the ring inserts a Slot at the nearest gap (FR-26). */
export function usePaletteDrop(
  layout: ClockLayout,
  container: RefObject<HTMLElement | null>,
  viewport: RefObject<ClockViewportState | null>,
  onDrop: (unit: string, index: number) => void,
): PaletteDrop {
  const [dragging, setDragging] = useState<PaletteDrop['dragging']>(null);
  const drag = useRef<{ unit: string; pointerId: number; gap: number | null } | null>(null);

  const onPointerDown = useCallback((unit: string, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    drag.current = { unit, pointerId: event.pointerId, gap: null };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({ unit, gap: null });
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const point = pointerToClock(event, container, viewport);
      const gap = point ? gapAt(layout, point) : null;
      current.gap = gap;
      setDragging({ unit: current.unit, gap });
    },
    [container, layout, viewport],
  );

  const finish = useCallback(
    (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      setDragging(null);
      if (!cancelled && current.gap !== null) onDrop(current.unit, current.gap);
    },
    [onDrop],
  );

  const itemHandlers = useCallback(
    (unit: string) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => onPointerDown(unit, event),
      onPointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finish(event, false),
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finish(event, true),
    }),
    [finish, onPointerDown, onPointerMove],
  );

  return { dragging, itemHandlers };
}
