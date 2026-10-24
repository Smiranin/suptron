import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { Point } from '../../../lib/geometry';
import type { ClockViewportState } from '../../clock/use-clock-viewport';
import { CARD_HEIGHT, CARD_WIDTH, type ClockLayout } from '../model/layout';
import { pointerToClock } from './drag-context';

export interface LoopDrag {
  /** The source Slot, the pointer in clock coordinates and the card under it. */
  ghost: { from: string; pointer: Point; over: string | null; droppable: boolean } | null;
  handleHandlers(name: string): {
    onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
    onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
    onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
    onPointerCancel(event: ReactPointerEvent<HTMLElement>): void;
  };
}

/** The card whose box contains the point, if any. */
export function cardAt(layout: ClockLayout, point: Point): string | null {
  for (const slot of layout.slots) {
    if (
      Math.abs(point.x - slot.position.x) <= CARD_WIDTH / 2 &&
      Math.abs(point.y - slot.position.y) <= CARD_HEIGHT / 2
    ) {
      return slot.name;
    }
  }
  return null;
}

/** Dragging from a card's failure handle to an earlier card creates a Loop (FR-23). */
export function useLoopDrag(
  layout: ClockLayout,
  container: RefObject<HTMLElement | null>,
  viewport: RefObject<ClockViewportState | null>,
  onLoop: (from: string, target: string) => void,
): LoopDrag {
  const [ghost, setGhost] = useState<LoopDrag['ghost']>(null);
  const drag = useRef<{ from: string; pointerId: number } | null>(null);

  const isEarlier = useCallback(
    (from: string, target: string | null) => {
      if (!target) return false;
      const a = layout.slots.find((s) => s.name === from);
      const b = layout.slots.find((s) => s.name === target);
      return !!a && !!b && b.index < a.index;
    },
    [layout],
  );

  const onPointerDown = useCallback(
    (name: string, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      drag.current = { from: name, pointerId: event.pointerId };
      event.currentTarget.setPointerCapture(event.pointerId);
      const slot = layout.slots.find((s) => s.name === name);
      setGhost({
        from: name,
        pointer: slot?.position ?? layout.center,
        over: null,
        droppable: false,
      });
    },
    [layout],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const point = pointerToClock(event, container, viewport);
      if (!point) return;
      const over = cardAt(layout, point);
      setGhost({
        from: current.from,
        pointer: point,
        over,
        droppable: isEarlier(current.from, over),
      });
    },
    [container, isEarlier, layout, viewport],
  );

  const finish = useCallback(
    (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture?.(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      const point = cancelled ? null : pointerToClock(event, container, viewport);
      const over = point ? cardAt(layout, point) : null;
      setGhost(null);
      if (over && isEarlier(current.from, over)) onLoop(current.from, over);
    },
    [container, isEarlier, layout, onLoop, viewport],
  );

  const handleHandlers = useCallback(
    (name: string) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => onPointerDown(name, event),
      onPointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finish(event, false),
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finish(event, true),
    }),
    [finish, onPointerDown, onPointerMove],
  );

  return { ghost, handleHandlers };
}
