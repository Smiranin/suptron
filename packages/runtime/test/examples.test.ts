import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/index.js';
import {
  briefAssembly,
  briefUnits,
  noneProfile,
  primaryAssembly,
  primaryUnits,
} from '../src/testing/index.js';

/** `examples/suptron-home` is the SPEC's test configuration as files; it must stay loadable and equal to the builders. */
describe('examples/suptron-home', () => {
  it('loads with zero issues and matches the primary and the research scenarios', async () => {
    const home = fileURLToPath(new URL('../../../examples/suptron-home', import.meta.url));
    const config = await loadConfig(home);
    expect(config.units.flatMap((u) => u.issues)).toEqual([]);
    expect(config.units.map((u) => u.unit)).toEqual(
      [...primaryUnits(), ...briefUnits()].sort((a, b) => a.name.localeCompare(b.name)),
    );
    const myApp = config.projects.find((p) => p.name === 'my-app')!;
    expect(myApp.issues).toEqual([]);
    expect(myApp.profile?.workspace).toMatchObject({
      kind: 'repository',
      path: '/absolute/path/to/your/repository',
    });
    expect(myApp.assemblies[0]?.status).toBe('valid');
    expect(myApp.assemblies[0]?.assembly).toEqual(primaryAssembly());
    const research = config.projects.find((p) => p.name === 'research')!;
    expect(research.issues).toEqual([]);
    expect(research.profile).toEqual(noneProfile());
    expect(research.assemblies.map((a) => [a.name, a.status])).toEqual([['brief', 'valid']]);
    expect(research.assemblies[0]?.assembly).toEqual(briefAssembly());
  });
});
