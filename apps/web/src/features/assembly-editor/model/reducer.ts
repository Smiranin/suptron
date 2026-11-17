import {
  slotAndSideSlotNames,
  uniqueSlotName,
  type AssemblyFile,
  type Check,
  type CoreDirectivesFile,
  type SideSlotFile,
  type SlotFile,
  type SubPilotFile,
} from '@suptron/runtime/browser';

/** The two lists of work a Slot carries besides its own Pilot. */
export type AttachedList = 'subPilots' | 'sideSlots';

/** Names a Side Slot may not take besides those of Slots and Side Slots. */
const RESERVED_NAMES = ['core'];

export type Command =
  | { type: 'addSlot'; unit: string; index: number }
  | { type: 'moveSlot'; name: string; toIndex: number }
  | { type: 'removeSlot'; name: string }
  | { type: 'renameSlot'; name: string; newName: string }
  | { type: 'patchSlot'; name: string; patch: Partial<Omit<SlotFile, 'name' | 'unit'>> }
  | { type: 'setLoop'; name: string; loop: LoopPatch | null }
  | { type: 'patchCore'; patch: Partial<CoreDirectivesFile> }
  | { type: 'setTitle'; title: string }
  | { type: 'replaceDoc'; doc: AssemblyFile }
  | { type: 'addAttached'; slot: string; list: AttachedList; unit: string }
  | {
      type: 'patchAttached';
      slot: string;
      list: 'subPilots';
      index: number;
      patch: Partial<Omit<SubPilotFile, 'unit'>>;
    }
  | {
      type: 'patchAttached';
      slot: string;
      list: 'sideSlots';
      index: number;
      patch: Partial<Omit<SideSlotFile, 'unit'>>;
    }
  | { type: 'moveAttached'; slot: string; list: AttachedList; index: number; toIndex: number }
  | { type: 'removeAttached'; slot: string; list: AttachedList; index: number };

/** The Loop rule as the editor sets it; an empty Accept Condition is dropped from the file. */
export interface LoopPatch {
  target: string;
  /** undefined: the Core Directives' default Loop limit applies and the file states none. */
  limit?: number | undefined;
  acceptCondition?: Check[];
}

/** Drops keys whose value is `undefined`, so a patch can remove a Slot override. */
function compact<T extends object>(value: T): T {
  const out = {} as Record<string, unknown>;
  for (const [key, v] of Object.entries(value)) if (v !== undefined) out[key] = v;
  return out as T;
}

/** The last Slot is always an Exit Point; a Slot that stops being last keeps its flag (FR-40). */
function enforceLastExit(slots: SlotFile[]): SlotFile[] {
  if (slots.length === 0) return slots;
  const last = slots[slots.length - 1]!;
  if (last.exitPoint === true) return slots;
  return [...slots.slice(0, -1), { ...last, exitPoint: true }];
}

function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

/**
 * Rewrites the Slot Outputs a Slot or a Side Slot reads with `rewrite`; a context left empty is
 * dropped from the file.
 */
function withSlotOutputs<T extends Pick<SlotFile, 'context'>>(
  holder: T,
  rewrite: (names: string[]) => string[],
): T {
  const current = holder.context?.slotOutputs;
  if (!current) return holder;
  const slotOutputs = rewrite(current);
  const context = compact({
    ...holder.context,
    slotOutputs: slotOutputs.length > 0 ? slotOutputs : undefined,
  });
  // `context` is optional on every holder, so leaving it out keeps the holder's type.
  return Object.keys(context).length > 0
    ? { ...holder, context }
    : (without(holder, 'context') as T);
}

/** Applies `rewrite` to the Slot Outputs read by a Slot and by each of its Side Slots. */
function rewriteSlotOutputs(slot: SlotFile, rewrite: (names: string[]) => string[]): SlotFile {
  const next = withSlotOutputs(slot, rewrite);
  if (!next.sideSlots) return next;
  return { ...next, sideSlots: next.sideSlots.map((side) => withSlotOutputs(side, rewrite)) };
}

function stripReferences(slots: SlotFile[], name: string): SlotFile[] {
  return slots.map((slot) => {
    const next = slot.loop?.target === name ? without(slot, 'loop') : slot;
    return rewriteSlotOutputs(next, (names) => names.filter((n) => n !== name));
  });
}

function renameReferences(slots: SlotFile[], name: string, newName: string): SlotFile[] {
  return slots.map((slot) => {
    const next =
      slot.loop?.target === name ? { ...slot, loop: { ...slot.loop, target: newName } } : slot;
    return rewriteSlotOutputs(next, (names) => names.map((n) => (n === name ? newName : n)));
  });
}

/** Replaces one list of a Slot; an empty list is dropped from the file. */
function withAttached(slot: SlotFile, list: AttachedList, items: readonly object[]): SlotFile {
  return items.length > 0 ? { ...slot, [list]: items } : without(slot, list);
}

/** A new entry of a list; a Side Slot whose Unit's name is taken gets a free name of its own. */
function newAttached(doc: AssemblyFile, list: AttachedList, unit: string): object {
  if (list === 'subPilots') return { unit };
  const taken = [...slotAndSideSlotNames(doc), ...RESERVED_NAMES];
  const name = uniqueSlotName(unit, taken);
  return name === unit ? { unit } : { name, unit };
}

/** Loops and context references that point forward after a move are invalid; keep them so validation reports them (the editor never silently deletes data on reorder). */
export function reduce(doc: AssemblyFile, cmd: Command): AssemblyFile {
  switch (cmd.type) {
    case 'replaceDoc':
      return cmd.doc;
    case 'patchCore':
      return { ...doc, core: compact({ ...doc.core, ...cmd.patch }) };
    case 'setTitle':
      // An empty title is dropped from the file; lists then show the ID.
      return compact({ ...doc, title: cmd.title === '' ? undefined : cmd.title });
    case 'addSlot': {
      const name = uniqueSlotName(cmd.unit, [...slotAndSideSlotNames(doc), ...RESERVED_NAMES]);
      const index = Math.min(Math.max(0, cmd.index), doc.slots.length);
      const slots = [...doc.slots];
      slots.splice(index, 0, { name, unit: cmd.unit });
      return { ...doc, slots: enforceLastExit(slots) };
    }
    case 'moveSlot': {
      const from = doc.slots.findIndex((s) => s.name === cmd.name);
      if (from === -1) return doc;
      const to = Math.min(Math.max(0, cmd.toIndex), doc.slots.length - 1);
      if (from === to) return doc;
      const slots = [...doc.slots];
      const [slot] = slots.splice(from, 1);
      slots.splice(to, 0, slot!);
      return { ...doc, slots: enforceLastExit(slots) };
    }
    case 'removeSlot': {
      if (!doc.slots.some((s) => s.name === cmd.name)) return doc;
      const slots = stripReferences(
        doc.slots.filter((s) => s.name !== cmd.name),
        cmd.name,
      );
      return { ...doc, slots: enforceLastExit(slots) };
    }
    case 'renameSlot': {
      const newName = cmd.newName.trim();
      if (newName === '' || newName === cmd.name) return doc;
      if (slotAndSideSlotNames(doc).includes(newName)) return doc;
      const slots = renameReferences(
        doc.slots.map((s) => (s.name === cmd.name ? { ...s, name: newName } : s)),
        cmd.name,
        newName,
      );
      return { ...doc, slots };
    }
    case 'patchSlot': {
      const slots = doc.slots.map((s) =>
        s.name === cmd.name ? compact({ ...s, ...cmd.patch }) : s,
      );
      return { ...doc, slots: enforceLastExit(slots) };
    }
    case 'setLoop': {
      const slots = doc.slots.map((s) => {
        if (s.name !== cmd.name) return s;
        if (cmd.loop === null) return without(s, 'loop');
        const acceptCondition = cmd.loop.acceptCondition ?? [];
        return {
          ...s,
          loop: {
            target: cmd.loop.target,
            ...(cmd.loop.limit !== undefined && { limit: cmd.loop.limit }),
            ...(acceptCondition.length > 0 && { acceptCondition }),
          },
        };
      });
      return { ...doc, slots };
    }
    case 'addAttached':
    case 'patchAttached':
    case 'moveAttached':
    case 'removeAttached':
      return reduceAttached(doc, cmd);
    default:
      return doc;
  }
}

/** The commands on the Sub-pilots and Side Slots of one Slot. */
function reduceAttached(
  doc: AssemblyFile,
  cmd: Extract<
    Command,
    { type: 'addAttached' | 'patchAttached' | 'moveAttached' | 'removeAttached' }
  >,
): AssemblyFile {
  const slots = doc.slots.map((slot) => {
    if (slot.name !== cmd.slot) return slot;
    const items: object[] = [...(slot[cmd.list] ?? [])];
    switch (cmd.type) {
      case 'addAttached':
        items.push(newAttached(doc, cmd.list, cmd.unit));
        break;
      case 'patchAttached':
        if (!items[cmd.index]) return slot;
        items[cmd.index] = compact({ ...items[cmd.index], ...cmd.patch });
        break;
      case 'moveAttached': {
        const to = Math.min(Math.max(0, cmd.toIndex), items.length - 1);
        if (!items[cmd.index] || to === cmd.index) return slot;
        const [item] = items.splice(cmd.index, 1);
        items.splice(to, 0, item!);
        break;
      }
      case 'removeAttached':
        if (!items[cmd.index]) return slot;
        items.splice(cmd.index, 1);
        break;
    }
    return withAttached(slot, cmd.list, items);
  });
  return { ...doc, slots };
}
