import {
  resolveCore,
  resolveSlot,
  type AssemblyFile,
  type UnitFile,
} from '@suptron/runtime/browser';

/** The effective "may ask the Commander" per Slot, with the server's precedence (Slot → Unit → default). */
export function effectiveMayAsk(
  assembly: AssemblyFile,
  units: readonly UnitFile[],
): Record<string, boolean> {
  const core = resolveCore(assembly.core);
  const byName = new Map(units.map((u) => [u.name, u]));
  const result: Record<string, boolean> = {};
  assembly.slots.forEach((slot, index) => {
    const unit = byName.get(slot.unit);
    result[slot.name] = unit
      ? resolveSlot(slot, unit, core, index === assembly.slots.length - 1).mayAskCommander
      : (slot.mayAskCommander ?? false);
  });
  return result;
}
