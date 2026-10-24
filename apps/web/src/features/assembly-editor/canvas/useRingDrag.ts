import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { angleOf } from '../../../lib/geometry';
import type { ClockViewportState } from '../../clock/use-clock-viewport';
import { positionIndexAt, type ClockLayout } from '../model/layout';
import { pointerToClock } from './drag-context';

const DRAG_THRESHOLD = 4;

export interface RingDrag {
  /** The dragged Slot and the angle it currently follows. */
  active: { name: string; angle: number } | null;
  cardHandlers(name: string): {
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void;
    onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void;
    onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void;
    onPointerCancel(event: ReactPointerEvent<HTMLDivElement>): void;
  };
}

/** Dragging a card along the ring reorders live; a click without movement is a selection (FR-22). */
export function useRingDrag(
  layout: ClockLayout,
  container: RefObject<HTMLElement | null>,
  viewport: RefObject<ClockViewportState | null>,
  onMove: (name: string, toIndex: number) => void,
  onClick: (name: string, event: ReactPointerEvent<HTMLDivElement>) => void,
): RingDrag {
  const [active, setActive] = useState<{ name: string; angle: number } | null>(null);
  const drag = useRef<{
    name: string;
    pointerId: number;
    start: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  const onPointerDown = useCallback((name: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('[data-failure-handle]')) return;
    drag.current = {
      name,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (!current.moved) {
        const distance = Math.hypot(
          event.clientX - current.start.x,
          event.clientY - current.start.y,
        );
        if (distance < DRAG_THRESHOLD) return;
        current.moved = true;
      }
      const point = pointerToClock(event, container, viewport);
      if (!point) return;
      const angle = angleOf(layout.center, point);
      setActive({ name: current.name, angle });
      const slot = layout.slots.find((s) => s.name === current.name);
      const toIndex = positionIndexAt(layout, angle);
      if (slot && slot.index !== toIndex) onMove(current.name, toIndex);
    },
    [container, layout, onMove, viewport],
  );

  const finish = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      drag.current = null;
      setActive(null);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      if (!current.moved && !cancelled) onClick(current.name, event);
    },
    [onClick],
  );

  const cardHandlers = useCallback(
    (name: string) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => onPointerDown(name, event),
      onPointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => finish(event, false),
      onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => finish(event, true),
    }),
    [finish, onPointerDown, onPointerMove],
  );

  return { active, cardHandlers };
}
