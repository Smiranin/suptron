import { accessSync, constants, mkdtempSync, rmSync } from 'node:fs';
import { chmod, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { GuardContext } from '@suptron/runtime';

export interface ShimEnv {
  PATH: string;
  SUPTRON_REAL_GIT: string;
  SUPTRON_REAL_GH: string;
}

export interface ShimInstall {
  dir: string;
  env: ShimEnv;
  cleanup(): Promise<void>;
}

const SHIM_PROGRAMS = ['git', 'gh'] as const;

/** Finds an executable on `searchPath`, skipping `exclude` (the shim directory itself). */
export function findExecutable(
  name: string,
  searchPath: string = process.env.PATH ?? '',
  exclude?: string,
): string | null {
  for (const entry of searchPath.split(delimiter)) {
    if (!entry || entry === exclude) continue;
    const candidate = join(entry, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not here
    }
  }
  return null;
}

let installation: Promise<ShimInstall> | null = null;

async function bundleShimMain(outfile: string): Promise<void> {
  await build({
    entryPoints: [fileURLToPath(new URL('./shim-main.ts', import.meta.url))],
    outfile,
    bundle: true,
    platform: 'node',
    // CommonJS: shell-quote and friends use dynamic require(), which an ESM bundle cannot serve.
    format: 'cjs',
    target: 'node22',
    logLevel: 'silent',
  });
}

async function createInstallation(): Promise<ShimInstall> {
  const dir = mkdtempSync(join(tmpdir(), 'suptron-shim-'));
  const bundle = join(dir, 'shim-main.cjs');
  await bundleShimMain(bundle);
  for (const program of SHIM_PROGRAMS) {
    const script = join(dir, program);
    await writeFile(script, `#!/bin/sh\nexec "${process.execPath}" "${bundle}" ${program} "$@"\n`);
    await chmod(script, 0o755);
  }
  const originalPath = process.env.PATH ?? '';
  const env: ShimEnv = {
    PATH: `${dir}${delimiter}${originalPath}`,
    SUPTRON_REAL_GIT: findExecutable('git', originalPath, dir) ?? '',
    SUPTRON_REAL_GH: findExecutable('gh', originalPath, dir) ?? '',
  };
  const remove = () => {
    rmSync(dir, { recursive: true, force: true });
  };
  process.once('exit', remove);
  return {
    dir,
    env,
    cleanup: async () => {
      process.off('exit', remove);
      remove();
      installation = null;
    },
  };
}

/**
 * Installs the `git`/`gh` shims once per process (the bundle is the expensive part) and returns
 * the PATH to prepend and the real binaries the shims exec. Per-Mission context travels in the
 * `SUPTRON_GUARD_*` variables, see `guardEnv()`.
 */
export function installShims(): Promise<ShimInstall> {
  installation ??= createInstallation().catch((error: unknown) => {
    installation = null;
    throw error;
  });
  return installation;
}

/** The environment variables the shims read to rebuild the GuardContext. */
export function guardEnv(ctx: GuardContext): Record<string, string> {
  return {
    SUPTRON_GUARD_PROTECTED_BRANCH: ctx.protectedBranch,
    SUPTRON_GUARD_CHECKOUT: ctx.checkoutPath,
    SUPTRON_GUARD_TASK: ctx.taskPath,
    SUPTRON_GUARD_CONFIG_HOME: ctx.configHome,
  };
}
