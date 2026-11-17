import type { LoadedConfig } from './load.js';

export interface AssemblyUsage {
  project: string;
  assembly: string;
}

/** What a Slot names Units with, as a file and as a resolved snapshot both have it. */
interface UnitPlaces {
  unit: string;
  subPilots?: readonly { unit: string }[] | undefined;
  sideSlots?:
    readonly { unit: string; subPilots?: readonly { unit: string }[] | undefined }[] | undefined;
}

/** Every Unit a Slot places: its own, its Sub-pilots', its Side Slots' and their Sub-pilots'. */
export function unitsOfSlot(slot: UnitPlaces): string[] {
  return [
    slot.unit,
    ...(slot.subPilots ?? []).map((sub) => sub.unit),
    ...(slot.sideSlots ?? []).flatMap((side) => [
      side.unit,
      ...(side.subPilots ?? []).map((sub) => sub.unit),
    ]),
  ];
}

/** The Assemblies (valid or not, as long as they parsed) that place `unitName` anywhere in a Slot. */
export function findUnitUsage(config: LoadedConfig, unitName: string): AssemblyUsage[] {
  const usage: AssemblyUsage[] = [];
  for (const project of config.projects) {
    for (const assembly of project.assemblies) {
      if (assembly.assembly?.slots.some((slot) => unitsOfSlot(slot).includes(unitName))) {
        usage.push({ project: project.name, assembly: assembly.name });
      }
    }
  }
  return usage;
}
