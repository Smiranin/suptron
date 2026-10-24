import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Viewport } from './layout';

/** Measures an element with ResizeObserver; tests pass a fixed viewport instead. */
export function useViewportSize(fixed?: Viewport): {
  ref: RefObject<HTMLDivElement | null>;
  viewport: Viewport;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<Viewport>({ width: 0, height: 0 });
  useEffect(() => {
    if (fixed || !ref.current || typeof ResizeObserver === 'undefined') return;
    const element = ref.current;
    const update = () => setMeasured({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fixed]);
  return { ref, viewport: fixed ?? measured };
}
