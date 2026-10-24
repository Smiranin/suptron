import {
  loadConfig,
  type LoadedAssembly,
  type LoadedConfig,
  type LoadedProject,
  type LoadedUnit,
} from '@suptron/runtime';

/** Reads `SUPTRON_HOME` on demand; nothing is cached, so hand edits show up on the next request. */
export class ConfigService {
  constructor(readonly home: string) {}

  load(): Promise<LoadedConfig> {
    return loadConfig(this.home);
  }

  async unit(name: string): Promise<{ config: LoadedConfig; unit: LoadedUnit | undefined }> {
    const config = await this.load();
    return { config, unit: config.units.find((u) => u.name === name) };
  }

  async project(
    name: string,
  ): Promise<{ config: LoadedConfig; project: LoadedProject | undefined }> {
    const config = await this.load();
    return { config, project: config.projects.find((p) => p.name === name) };
  }

  async assembly(
    project: string,
    name: string,
  ): Promise<{
    config: LoadedConfig;
    project: LoadedProject | undefined;
    assembly: LoadedAssembly | undefined;
  }> {
    const found = await this.project(project);
    return { ...found, assembly: found.project?.assemblies.find((a) => a.name === name) };
  }
}
