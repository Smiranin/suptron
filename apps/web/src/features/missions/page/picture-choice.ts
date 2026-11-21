import { useSyncExternalStore } from 'react';

/** Which picture of a Mission the Mission page shows. */
export type PictureChoice = 'universe' | 'clock';

const storageKey = 'suptron-mission-picture';
const listeners = new Set<() => void>();

/** The remembered choice; the Universe when nothing is stored. */
function storedChoice(): PictureChoice {
  try {
    if (window.localStorage.getItem(storageKey) === 'clock') return 'clock';
  } catch {
    // The page still works when browser storage is unavailable: it shows the default.
  }
  return 'universe';
}

let current: PictureChoice = storedChoice();

/** Shows `choice` on every Mission page from now on and remembers it in the browser. */
export function setPictureChoice(choice: PictureChoice): void {
  current = choice;
  try {
    window.localStorage.setItem(storageKey, choice);
  } catch {
    // The choice holds for this session when browser storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The picture the Commander chose last, shared by every Mission page. */
export function usePictureChoice(): PictureChoice {
  return useSyncExternalStore(subscribe, () => current);
}
