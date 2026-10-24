import { findUnitUsage, type LoadedConfig, type MissionRegistry } from '@suptron/runtime';

export interface UnitUsage {
  assemblies: { project: string; assembly: string }[];
  activeMissions: number;
}

/** Combines configuration usage with the active Missions holding a snapshot. */
export class UsageService {
  constructor(private readonly registry: MissionRegistry) {}

  unit(config: LoadedConfig, unitName: string): UnitUsage {
    return {
      assemblies: findUnitUsage(config, unitName),
      activeMissions: this.registry.countActiveMissions({ unit: unitName }),
    };
  }

  assembly(project: string, assembly: string): number {
    return this.registry.countActiveMissions({ project, assembly });
  }

  project(project: string): number {
    return this.registry.countActiveMissions({ project });
  }
}
