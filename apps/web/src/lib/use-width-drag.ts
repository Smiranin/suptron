import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Pointer handlers for a divider on the left edge of a right-side panel: dragging left widens it.
 * The width lives with the caller, which decides whether and where to remember it.
 */
export function useWidthDrag(
  width: number,
  onWidth: (width: number) => void,
  { min, max }: { min: number; max: number },
) {
  const drag = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [width],
  );
  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      onWidth(clampWidth(current.startWidth - (event.clientX - current.startX), min, max));
    },
    [onWidth, min, max],
  );
  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);
  return { onPointerDown, onPointerMove, onPointerUp };
}

export function clampWidth(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, width));
}
