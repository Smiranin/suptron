import type { LoadedConfig } from './load.js';

export interface AssemblyUsage {
  project: string;
  assembly: string;
}

/** The Assemblies (valid or not, as long as they parsed) that place `unitName` in a Slot. */
export function findUnitUsage(config: LoadedConfig, unitName: string): AssemblyUsage[] {
  const usage: AssemblyUsage[] = [];
  for (const project of config.projects) {
    for (const assembly of project.assemblies) {
      if (assembly.assembly?.slots.some((slot) => slot.unit === unitName)) {
        usage.push({ project: project.name, assembly: assembly.name });
      }
    }
  }
  return usage;
}
