import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import type { Point } from '../../lib/geometry';
import { isEditableTarget } from '../../lib/keyboard';
import { MAX_SCALE, MIN_SCALE, type ClockLayout, type Viewport } from './layout';

export interface ClockViewportState {
  scale: number;
  translate: Point;
  transform: string;
  fit(): void;
  /** Converts a pointer position (clientX/Y relative to the container) into clock coordinates. */
  toClock(point: Point): Point;
  wheelHandlers: { onWheel(event: ReactWheelEvent<HTMLElement>): void };
  panHandlers: {
    onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
    onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
    onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
  };
  spaceHeld: boolean;
}

/**
 * Zoom and pan as one CSS transform on the clock container. Zooming keeps the clock centre where it
 * is on screen; panning drags empty space or anything while Space is held. Fit is applied on the
 * first non-empty viewport and on demand.
 */
export function useClockViewport(layout: ClockLayout, viewport: Viewport): ClockViewportState {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState<Point>({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const fitted = useRef(false);
  const drag = useRef<{ pointerId: number; last: Point } | null>(null);

  const fit = useCallback(() => {
    const next = layout.fit(viewport);
    setScale(next.scale);
    setTranslate(next.translate);
  }, [layout, viewport]);

  useEffect(() => {
    if (!fitted.current && viewport.width > 0 && viewport.height > 0) {
      fitted.current = true;
      fit();
    }
  }, [fit, viewport.width, viewport.height]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isEditableTarget(event.target)) {
        setSpaceHeld(true);
        event.preventDefault();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onWheel = useCallback(
    (event: ReactWheelEvent<HTMLElement>) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      setScale((current) => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current * factor));
        // Keep the clock centre fixed on screen: screenCenter = translate + center * scale.
        setTranslate((t) => ({
          x: t.x + layout.center.x * (current - next),
          y: t.y + layout.center.y * (current - next),
        }));
        return next;
      });
    },
    [layout.center.x, layout.center.y],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const onEmptySpace = (event.target as HTMLElement).dataset.clockBackground !== undefined;
      if (!onEmptySpace && !spaceHeld) return;
      if (event.button !== 0) return;
      drag.current = { pointerId: event.pointerId, last: { x: event.clientX, y: event.clientY } };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [spaceHeld],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.last.x;
    const dy = event.clientY - current.last.y;
    current.last = { x: event.clientX, y: event.clientY };
    setTranslate((t) => ({ x: t.x + dx, y: t.y + dy }));
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const toClock = useCallback(
    (point: Point): Point => ({
      x: (point.x - translate.x) / scale,
      y: (point.y - translate.y) / scale,
    }),
    [scale, translate.x, translate.y],
  );

  return useMemo(
    () => ({
      scale,
      translate,
      transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
      fit,
      toClock,
      wheelHandlers: { onWheel },
      panHandlers: { onPointerDown, onPointerMove, onPointerUp },
      spaceHeld,
    }),
    [scale, translate, fit, toClock, onWheel, onPointerDown, onPointerMove, onPointerUp, spaceHeld],
  );
}
