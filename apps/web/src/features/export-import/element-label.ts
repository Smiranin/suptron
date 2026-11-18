import type { ElementRef } from '@suptron/runtime/browser';

/** How an element reads in a list: `analyst`, `my-app Profile`, `my-app / feature`. */
export function elementLabel(ref: ElementRef): string {
  switch (ref.kind) {
    case 'unit':
      return ref.name;
    case 'profile':
      return `${ref.name} Profile`;
    case 'assembly':
      return `${ref.project} / ${ref.name}`;
  }
}
