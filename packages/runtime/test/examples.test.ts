import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/index.js';
import { primaryAssembly, primaryUnits } from '../src/testing/index.js';

/** `examples/suptron-home` is the SPEC's test configuration as files; it must stay loadable and equal to the builders. */
describe('examples/suptron-home', () => {
  it('loads with zero issues and matches the primary scenario', async () => {
    const home = fileURLToPath(new URL('../../../examples/suptron-home', import.meta.url));
    const config = await loadConfig(home);
    expect(config.units.flatMap((u) => u.issues)).toEqual([]);
    expect(config.units.map((u) => u.unit)).toEqual(
      [...primaryUnits()].sort((a, b) => a.name.localeCompare(b.name)),
    );
    const project = config.projects[0]!;
    expect(project.issues).toEqual([]);
    expect(project.profile?.repository.path).toBe('/absolute/path/to/your/repository');
    expect(project.assemblies[0]?.status).toBe('valid');
    expect(project.assemblies[0]?.assembly).toEqual(primaryAssembly());
  });
});
