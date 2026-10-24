import type { AssemblyFile } from './schemas.js';

/** `base`, or `base-2`, `base-3`, ... until the name is free. */
export function uniqueSlotName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface SlotReference {
  from: string;
  kind: 'loop' | 'slotOutput';
}

/** Every Loop target and `context.slotOutputs` entry that points at `name`. */
export function referencesToSlot(assembly: AssemblyFile, name: string): SlotReference[] {
  const refs: SlotReference[] = [];
  for (const slot of assembly.slots) {
    if (slot.name === name) continue;
    if (slot.loop?.target === name) refs.push({ from: slot.name, kind: 'loop' });
    if ((slot.context?.slotOutputs ?? []).includes(name)) {
      refs.push({ from: slot.name, kind: 'slotOutput' });
    }
  }
  return refs;
}
