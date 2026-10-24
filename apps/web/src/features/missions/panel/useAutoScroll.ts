import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const BOTTOM_TOLERANCE = 8;

/** Sticks to the bottom while the Commander is there; scrolling up stops it; Follow resumes (FR-22). */
export function useAutoScroll(dependency: unknown): {
  ref: RefObject<HTMLDivElement | null>;
  following: boolean;
  follow(): void;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [following, setFollowing] = useState(true);
  const programmatic = useRef(false);

  const scrollToBottom = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    programmatic.current = true;
    element.scrollTop = element.scrollHeight;
    // The scroll event fires asynchronously; clear the flag after it had a chance to run.
    setTimeout(() => {
      programmatic.current = false;
    }, 0);
  }, []);

  useEffect(() => {
    if (following) scrollToBottom();
  }, [dependency, following, scrollToBottom]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onScroll = () => {
      if (programmatic.current) return;
      const atBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_TOLERANCE;
      setFollowing(atBottom);
    };
    element.addEventListener('scroll', onScroll);
    return () => element.removeEventListener('scroll', onScroll);
  }, []);

  return { ref, following, follow: () => setFollowing(true) };
}
