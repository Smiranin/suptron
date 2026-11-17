import type { AssemblyFile, SideSlotFile } from './schemas.js';

/** `base`, or `base-2`, `base-3`, ... until the name is free. */
export function uniqueSlotName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The name a Side Slot goes by: its own, or its Unit's when it has none. */
export function sideSlotName(side: Pick<SideSlotFile, 'name' | 'unit'>): string {
  return side.name ?? side.unit;
}

/** Every name a Slot or a Side Slot of the Assembly goes by, in Assembly order. */
export function slotAndSideSlotNames(assembly: Pick<AssemblyFile, 'slots'>): string[] {
  return assembly.slots.flatMap((slot) => [slot.name, ...(slot.sideSlots ?? []).map(sideSlotName)]);
}

/** A reference to a Slot; `from` is the Slot or the Side Slot that holds it. */
export interface SlotReference {
  from: string;
  kind: 'loop' | 'slotOutput';
}

/** Every Loop target and `context.slotOutputs` entry, of a Slot or a Side Slot, that points at `name`. */
export function referencesToSlot(assembly: AssemblyFile, name: string): SlotReference[] {
  const refs: SlotReference[] = [];
  for (const slot of assembly.slots) {
    if (slot.name !== name) {
      if (slot.loop?.target === name) refs.push({ from: slot.name, kind: 'loop' });
      if ((slot.context?.slotOutputs ?? []).includes(name)) {
        refs.push({ from: slot.name, kind: 'slotOutput' });
      }
    }
    for (const side of slot.sideSlots ?? []) {
      if ((side.context?.slotOutputs ?? []).includes(name)) {
        refs.push({ from: sideSlotName(side), kind: 'slotOutput' });
      }
    }
  }
  return refs;
}
