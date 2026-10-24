import type { RefObject } from 'react';
import type { Point } from '../../../lib/geometry';
import type { ClockViewportState } from '../../clock/use-clock-viewport';

/**
 * Converts a pointer event to clock coordinates. In jsdom the container rect is all zeros, so
 * clientX/clientY are read as container-relative there; the geometry depends only on the injected
 * viewport and the pointer position, never on layout the browser would have to compute.
 */
export function pointerToClock(
  event: { clientX: number; clientY: number },
  container: RefObject<HTMLElement | null>,
  viewport: RefObject<ClockViewportState | null>,
): Point | null {
  const state = viewport.current;
  if (!state) return null;
  const rect = container.current?.getBoundingClientRect();
  const local = { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  return state.toClock(local);
}
