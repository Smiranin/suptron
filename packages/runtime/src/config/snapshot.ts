import { DEFAULTS } from './defaults.js';
import type {
  AssemblyFile,
  Check,
  CoreDirectivesFile,
  LoopRule,
  MemoryMode,
  ProfileFile,
  SideSlotFile,
  SlotContextFile,
  SubPilotFile,
  UnitFile,
} from './schemas.js';
import { sideSlotName } from './slot-names.js';
import { unitsOfSlot } from './usage.js';

export interface ResolvedContext {
  taskDocuments: boolean;
  knowledgeSources: boolean;
  gitConventions: boolean;
  slotOutputs: string[];
}

/** A Sub-pilot with its Unit merged: what the Engine is given as a named agent of the Pilot. */
export interface ResolvedSubPilot {
  unit: string;
  title: string;
  model: string;
  rules: string;
  instructions: string;
  required: boolean;
}

/** A Side Slot with its Unit merged; it has no Done Condition, Loop or Exit Point. */
export interface ResolvedSideSlot {
  name: string;
  unit: string;
  model: string;
  rules: string;
  instructions: string;
  context: ResolvedContext;
  subPilots: ResolvedSubPilot[];
}

/** A Slot with every Unit field merged and every default applied. */
export interface ResolvedSlot {
  name: string;
  unit: string;
  model: string;
  rules: string;
  instructions: string;
  doneCondition: Check[];
  mayAskCommander: boolean;
  attemptLimit: number;
  memoryMode: MemoryMode;
  context: ResolvedContext;
  /** The Loop rule with its limit resolved against the Core Directives. */
  loop?: LoopRule & { limit: number };
  /** Done once, the Slot is passed by when a later Slot's Loop brings the Mission through it again. */
  skipWhenDone: boolean;
  exitPoint: boolean;
  exitCondition: Check[];
  subPilots: ResolvedSubPilot[];
  sideSlots: ResolvedSideSlot[];
}

export type CoreDirectives = Required<CoreDirectivesFile>;

export interface MissionSnapshot {
  profile: ProfileFile;
  assembly: { name: string; core: CoreDirectives; slots: ResolvedSlot[] };
  /** The Assembly document as it was at start, for the Mission page. */
  document: AssemblyFile;
}

export type MayAskToggles = Readonly<Record<string, boolean>>;

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** A Unit's text with the placement's addition after it, when there is one. */
function withAddition(base: string, addition: string | undefined): string {
  const extra = addition?.trim();
  return extra ? `${base.trim()}\n\n${extra}` : base;
}

function resolveContext(context: SlotContextFile | undefined): ResolvedContext {
  return {
    taskDocuments: context?.taskDocuments ?? DEFAULTS.slot.context.taskDocuments,
    knowledgeSources: context?.knowledgeSources ?? DEFAULTS.slot.context.knowledgeSources,
    gitConventions: context?.gitConventions ?? DEFAULTS.slot.context.gitConventions,
    slotOutputs: [...(context?.slotOutputs ?? [])],
  };
}

/** The Sub-pilots whose Unit exists, merged with it; an unknown Unit is validation's to report. */
function resolveSubPilots(
  list: readonly SubPilotFile[] | undefined,
  unitOf: (name: string) => UnitFile | undefined,
): ResolvedSubPilot[] {
  return (list ?? []).flatMap((sub) => {
    const unit = unitOf(sub.unit);
    if (!unit) return [];
    return [
      {
        unit: sub.unit,
        title: unit.title ?? unit.name,
        model: sub.model ?? unit.model,
        rules: unit.rules,
        instructions: withAddition(unit.instructions, sub.instructions),
        required: sub.required ?? false,
      },
    ];
  });
}

/** The Side Slots whose Unit exists, merged with it; an unknown Unit is validation's to report. */
function resolveSideSlots(
  list: readonly SideSlotFile[] | undefined,
  unitOf: (name: string) => UnitFile | undefined,
): ResolvedSideSlot[] {
  return (list ?? []).flatMap((side) => {
    const unit = unitOf(side.unit);
    if (!unit) return [];
    return [
      {
        name: sideSlotName(side),
        unit: side.unit,
        model: side.model ?? unit.model,
        rules: withAddition(unit.rules, side.rules),
        instructions: withAddition(unit.instructions, side.instructions),
        context: resolveContext(side.context),
        subPilots: resolveSubPilots(side.subPilots, unitOf),
      },
    ];
  });
}

/**
 * Resolves one Slot against its Unit: Slot override beats Unit value beats DEFAULTS. `units`
 * resolves the Sub-pilots and Side Slots; each required Sub-pilot puts a `sub_pilot_returned`
 * Check first in the Done Condition, so a missing one fails before any other Check runs.
 */
export function resolveSlot(
  slot: AssemblyFile['slots'][number],
  unit: UnitFile,
  core: CoreDirectives,
  isLast: boolean,
  units: readonly UnitFile[],
  toggles: MayAskToggles = {},
): ResolvedSlot {
  const byName = new Map(units.map((u) => [u.name, u]));
  const unitOf = (name: string) => byName.get(name);
  const mayAskCommander = toggles[slot.name] ?? slot.mayAskCommander ?? unit.mayAskCommander;
  const subPilots = resolveSubPilots(slot.subPilots, unitOf);
  const returned: Check[] = subPilots
    .filter((sub) => sub.required)
    .map((sub) => ({ kind: 'sub_pilot_returned', unit: sub.unit }));
  const resolved: ResolvedSlot = {
    name: slot.name,
    unit: slot.unit,
    model: slot.model ?? unit.model,
    rules: withAddition(unit.rules, slot.rules),
    instructions: withAddition(unit.instructions, slot.instructions),
    doneCondition: [...returned, ...(slot.doneCondition ?? unit.doneCondition)],
    mayAskCommander,
    attemptLimit: slot.attemptLimit ?? core.defaultAttemptLimit,
    memoryMode: slot.memoryMode ?? defaultMemoryMode(mayAskCommander),
    context: resolveContext(slot.context),
    subPilots,
    sideSlots: resolveSideSlots(slot.sideSlots, unitOf),
    skipWhenDone: slot.skipWhenDone ?? DEFAULTS.slot.skipWhenDone,
    exitPoint: isLast ? true : (slot.exitPoint ?? DEFAULTS.slot.exitPoint),
    exitCondition: [...(slot.exitCondition ?? [])],
  };
  if (slot.loop) {
    resolved.loop = {
      target: slot.loop.target,
      limit: slot.loop.limit ?? core.defaultLoopLimit,
      ...(slot.loop.acceptCondition &&
        slot.loop.acceptCondition.length > 0 && {
          acceptCondition: [...slot.loop.acceptCondition],
        }),
    };
  }
  return resolved;
}

/**
 * A Slot that may ask the Commander keeps its session by default: a second Attempt must never
 * restart an interview from zero (the planner of run 1). An explicit `memoryMode` still wins.
 */
export function defaultMemoryMode(mayAskCommander: boolean): MemoryMode {
  return mayAskCommander ? 'persistent' : DEFAULTS.slot.memoryMode;
}

export function resolveCore(core: CoreDirectivesFile): CoreDirectives {
  return {
    model: core.model,
    defaultAttemptLimit: core.defaultAttemptLimit ?? DEFAULTS.core.defaultAttemptLimit,
    defaultLoopLimit: core.defaultLoopLimit ?? DEFAULTS.core.defaultLoopLimit,
    resolutionLimit: core.resolutionLimit ?? DEFAULTS.core.resolutionLimit,
    instructions: core.instructions ?? DEFAULTS.core.instructions,
  };
}

/**
 * A snapshot as a ledger kept it: one written before Sub-pilots and Side Slots existed gets
 * empty lists, so it runs as it did.
 */
export function readStoredSnapshot(stored: MissionSnapshot): MissionSnapshot {
  return {
    ...stored,
    assembly: {
      ...stored.assembly,
      slots: stored.assembly.slots.map((slot) => ({
        ...slot,
        subPilots: slot.subPilots ?? [],
        sideSlots: slot.sideSlots ?? [],
      })),
    },
  };
}

/**
 * Builds the deep-frozen snapshot a Mission runs on. The Assembly must already be valid; an
 * unknown Unit here is a programming error, not a validation result.
 */
export function buildSnapshot(
  profile: ProfileFile,
  assembly: AssemblyFile,
  units: readonly UnitFile[],
  toggles: MayAskToggles = {},
): MissionSnapshot {
  const byName = new Map(units.map((u) => [u.name, u]));
  const core = resolveCore(assembly.core);
  const slots = assembly.slots.map((slot, index) => {
    const unit = byName.get(slot.unit);
    if (!unit) throw new SnapshotError(`Slot "${slot.name}" uses an unknown Unit "${slot.unit}"`);
    const unknown = unitsOfSlot(slot).find((name) => !byName.has(name));
    if (unknown !== undefined) {
      throw new SnapshotError(`Slot "${slot.name}" attaches an unknown Unit "${unknown}"`);
    }
    return resolveSlot(slot, unit, core, index === assembly.slots.length - 1, units, toggles);
  });
  return deepFreeze(
    structuredClone({
      profile,
      assembly: { name: assembly.name, core, slots },
      document: assembly,
    }),
  );
}
