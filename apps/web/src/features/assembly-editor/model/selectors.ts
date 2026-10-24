import {
  DEFAULTS,
  resolveCore,
  resolveSlot,
  summarizeCondition,
  type AssemblyFile,
  type Check,
  type MemoryMode,
  type ResolvedSlot,
  type SlotFile,
  type UnitFile,
} from '@suptron/runtime/browser';

export type ValueSource = 'slot' | 'unit' | 'default';

export interface Effective<T> {
  value: T;
  source: ValueSource;
  /** What the Slot would inherit without an override. */
  inherited: T;
}

export interface EffectiveSlot {
  model: Effective<string>;
  instructions: Effective<string>;
  doneCondition: Effective<Check[]>;
  mayAskCommander: Effective<boolean>;
  memoryMode: Effective<MemoryMode>;
  attemptLimit: Effective<number>;
  resolved: ResolvedSlot | null;
}

export interface CardSummary {
  name: string;
  unitName: string;
  showUnit: boolean;
  model: string;
  mayAskCommander: boolean;
  persistent: boolean;
  doneSummary: string;
  loopBadge?: string;
  hasErrors: boolean;
}

export type UnitIndex = ReadonlyMap<string, UnitFile>;

export function unitIndex(units: readonly UnitFile[]): UnitIndex {
  return new Map(units.map((u) => [u.name, u]));
}

function pick<T>(slotValue: T | undefined, unitValue: T | undefined, fallback: T): Effective<T> {
  const inherited = unitValue !== undefined ? unitValue : fallback;
  if (slotValue !== undefined) return { value: slotValue, source: 'slot', inherited };
  return { value: inherited, source: unitValue !== undefined ? 'unit' : 'default', inherited };
}

/** Slot override → Unit value → DEFAULTS, with the source of each value for the inspector. */
export function effectiveSlot(doc: AssemblyFile, slot: SlotFile, units: UnitIndex): EffectiveSlot {
  const unit = units.get(slot.unit);
  const core = resolveCore(doc.core);
  const index = doc.slots.findIndex((s) => s.name === slot.name);
  return {
    model: pick(slot.model, unit?.model, ''),
    instructions: pick(slot.instructions, undefined, ''),
    doneCondition: pick(slot.doneCondition, unit?.doneCondition, []),
    mayAskCommander: pick(
      slot.mayAskCommander,
      unit?.mayAskCommander,
      DEFAULTS.unit.mayAskCommander,
    ),
    memoryMode: pick(slot.memoryMode, undefined, DEFAULTS.slot.memoryMode),
    attemptLimit: pick(slot.attemptLimit, undefined, core.defaultAttemptLimit),
    resolved: unit ? resolveSlot(slot, unit, core, index === doc.slots.length - 1) : null,
  };
}

export function cardSummary(
  doc: AssemblyFile,
  slot: SlotFile,
  units: UnitIndex,
  hasErrors: boolean,
): CardSummary {
  const effective = effectiveSlot(doc, slot, units);
  return {
    name: slot.name,
    unitName: slot.unit,
    showUnit: slot.unit !== slot.name,
    model: effective.model.value,
    mayAskCommander: effective.mayAskCommander.value,
    persistent: effective.memoryMode.value === 'persistent',
    doneSummary: summarizeCondition(effective.doneCondition.value),
    ...(slot.loop && {
      loopBadge: `↩ ${slot.loop.target}, max ${slot.loop.limit ?? resolveCore(doc.core).defaultLoopLimit}`,
    }),
    hasErrors,
  };
}

export function earlierSlots(doc: AssemblyFile, name: string): SlotFile[] {
  const index = doc.slots.findIndex((s) => s.name === name);
  return index <= 0 ? [] : doc.slots.slice(0, index);
}

export function slotIndex(doc: AssemblyFile, name: string): number {
  return doc.slots.findIndex((s) => s.name === name);
}

export function isLastSlot(doc: AssemblyFile, name: string): boolean {
  return doc.slots.length > 0 && doc.slots[doc.slots.length - 1]!.name === name;
}
