import {
  DEFAULTS,
  uniqueSlotName,
  type AssemblyFile,
  type CoreDirectivesFile,
  type SlotFile,
} from '@suptron/runtime/browser';

export type Command =
  | { type: 'addSlot'; unit: string; index: number }
  | { type: 'moveSlot'; name: string; toIndex: number }
  | { type: 'removeSlot'; name: string }
  | { type: 'renameSlot'; name: string; newName: string }
  | { type: 'patchSlot'; name: string; patch: Partial<Omit<SlotFile, 'name' | 'unit'>> }
  | { type: 'setLoop'; name: string; loop: { target: string; limit: number } | null }
  | { type: 'patchCore'; patch: Partial<CoreDirectivesFile> }
  | { type: 'replaceDoc'; doc: AssemblyFile };

export interface ReduceContext {
  defaultLoopLimit: number;
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

function stripReferences(slots: SlotFile[], name: string): SlotFile[] {
  return slots.map((slot) => {
    let next: SlotFile = slot;
    if (next.loop?.target === name) next = without(next, 'loop');
    if (next.context?.slotOutputs?.includes(name)) {
      const slotOutputs = next.context.slotOutputs.filter((n) => n !== name);
      const context = compact({
        ...next.context,
        slotOutputs: slotOutputs.length > 0 ? slotOutputs : undefined,
      });
      next = Object.keys(context).length > 0 ? { ...next, context } : without(next, 'context');
    }
    return next;
  });
}

function renameReferences(slots: SlotFile[], name: string, newName: string): SlotFile[] {
  return slots.map((slot) => {
    let next = slot;
    if (next.loop?.target === name) next = { ...next, loop: { ...next.loop, target: newName } };
    if (next.context?.slotOutputs?.includes(name)) {
      next = {
        ...next,
        context: {
          ...next.context,
          slotOutputs: next.context.slotOutputs.map((n) => (n === name ? newName : n)),
        },
      };
    }
    return next;
  });
}

/** Loops and context references that point forward after a move are invalid; keep them so validation reports them (the editor never silently deletes data on reorder). */
export function reduce(doc: AssemblyFile, cmd: Command, ctx: ReduceContext): AssemblyFile {
  switch (cmd.type) {
    case 'replaceDoc':
      return cmd.doc;
    case 'patchCore':
      return { ...doc, core: compact({ ...doc.core, ...cmd.patch }) };
    case 'addSlot': {
      const name = uniqueSlotName(
        cmd.unit,
        doc.slots.map((s) => s.name),
      );
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
      if (doc.slots.some((s) => s.name === newName)) return doc;
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
        return {
          ...s,
          loop: {
            target: cmd.loop.target,
            limit: cmd.loop.limit || ctx.defaultLoopLimit || DEFAULTS.loopLimit,
          },
        };
      });
      return { ...doc, slots };
    }
    default:
      return doc;
  }
}
