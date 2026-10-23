import { useEffect, useSyncExternalStore } from 'react';

export type Appearance = 'system' | 'light' | 'dark';

export const nextAppearance: Record<Appearance, Appearance> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const storageKey = 'suptron-appearance';
const listeners = new Set<() => void>();

function initialAppearance(): Appearance {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Appearance still works when browser storage is unavailable.
  }
  return 'system';
}

let current: Appearance = initialAppearance();

export function toggleAppearance() {
  current = nextAppearance[current];
  try {
    window.localStorage.setItem(storageKey, current);
  } catch {
    // Keep the selected appearance for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => current);
}

/** Applies the chosen appearance to the document and follows the system setting while it is `system`. */
export function useSyncAppearance() {
  const appearance = useAppearance();
  useEffect(() => {
    const system = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = appearance === 'dark' || (appearance === 'system' && system?.matches);
      document.documentElement.classList.toggle('dark', Boolean(dark));
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    if (appearance !== 'system') return;
    system?.addEventListener('change', apply);
    return () => system?.removeEventListener('change', apply);
  }, [appearance]);
}
