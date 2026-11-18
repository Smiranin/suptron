import { useEffect, useState } from 'react';

export const PATH_DEBOUNCE_MS = 250;

/** `value` once it has stopped changing for `delay` milliseconds. */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
