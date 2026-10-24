import { DEFAULTS } from './defaults.js';
import type {
  AssemblyFile,
  Check,
  CoreDirectivesFile,
  LoopRule,
  MemoryMode,
  ProfileFile,
  UnitFile,
} from './schemas.js';

export interface ResolvedContext {
  taskDocuments: boolean;
  knowledgeSources: boolean;
  checkout: boolean;
  gitConventions: boolean;
  slotOutputs: string[];
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
  loop?: LoopRule;
  exitPoint: boolean;
  exitCondition: Check[];
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

/** Resolves one Slot against its Unit: Slot override beats Unit value beats DEFAULTS. */
export function resolveSlot(
  slot: AssemblyFile['slots'][number],
  unit: UnitFile,
  core: CoreDirectives,
  isLast: boolean,
  toggles: MayAskToggles = {},
): ResolvedSlot {
  const additional = slot.instructions?.trim();
  const resolved: ResolvedSlot = {
    name: slot.name,
    unit: slot.unit,
    model: slot.model ?? unit.model,
    rules: unit.rules,
    instructions: additional ? `${unit.instructions.trim()}\n\n${additional}` : unit.instructions,
    doneCondition: [...(slot.doneCondition ?? unit.doneCondition)],
    mayAskCommander: toggles[slot.name] ?? slot.mayAskCommander ?? unit.mayAskCommander,
    attemptLimit: slot.attemptLimit ?? core.defaultAttemptLimit,
    memoryMode: slot.memoryMode ?? DEFAULTS.slot.memoryMode,
    context: {
      taskDocuments: slot.context?.taskDocuments ?? DEFAULTS.slot.context.taskDocuments,
      knowledgeSources: slot.context?.knowledgeSources ?? DEFAULTS.slot.context.knowledgeSources,
      checkout: slot.context?.checkout ?? DEFAULTS.slot.context.checkout,
      gitConventions: slot.context?.gitConventions ?? DEFAULTS.slot.context.gitConventions,
      slotOutputs: [...(slot.context?.slotOutputs ?? [])],
    },
    exitPoint: isLast ? true : (slot.exitPoint ?? DEFAULTS.slot.exitPoint),
    exitCondition: [...(slot.exitCondition ?? [])],
  };
  if (slot.loop) {
    resolved.loop = { target: slot.loop.target, limit: slot.loop.limit ?? core.defaultLoopLimit };
  }
  return resolved;
}

export function resolveCore(core: CoreDirectivesFile): CoreDirectives {
  return {
    model: core.model,
    defaultAttemptLimit: core.defaultAttemptLimit ?? DEFAULTS.core.defaultAttemptLimit,
    defaultLoopLimit: core.defaultLoopLimit ?? DEFAULTS.core.defaultLoopLimit,
    instructions: core.instructions ?? DEFAULTS.core.instructions,
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
    return resolveSlot(slot, unit, core, index === assembly.slots.length - 1, toggles);
  });
  return deepFreeze(
    structuredClone({
      profile,
      assembly: { name: assembly.name, core, slots },
      document: assembly,
    }),
  );
}
