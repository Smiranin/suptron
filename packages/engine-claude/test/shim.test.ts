import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exec, tempRepo, type TempRepo } from '@suptron/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findExecutable,
  guardEnv,
  guardFromEnv,
  installShims,
  type ShimInstall,
} from '../src/shim.js';

describe('git/gh shims', () => {
  let shims: ShimInstall;
  let repo: TempRepo;
  let home: string;

  beforeAll(async () => {
    shims = await installShims();
    repo = await tempRepo();
    home = await mkdtemp(join(tmpdir(), 'suptron-home-'));
  }, 60_000);

  afterAll(async () => {
    await repo.cleanup();
    await rm(home, { recursive: true, force: true });
  });

  const guard = (protectedBranch: string | null = 'main') => ({
    cwd: repo.clonePath,
    writeRoots: [repo.clonePath, join(home, 'missions', 'm1')],
    protectedBranch,
    taskPath: join(home, 'task'),
    configHome: home,
  });
  const env = (protectedBranch: string | null = 'main') => ({
    ...process.env,
    ...shims.env,
    ...guardEnv(guard(protectedBranch)),
  });

  it('round-trips the GuardContext through the environment', () => {
    expect(guardFromEnv(guardEnv(guard()))).toEqual(guard());
    expect(guardFromEnv(guardEnv(guard(null)))).toEqual(guard(null));
    expect(guardFromEnv({})).toBeNull();
  });

  it('resolves the real binaries outside the shim directory', () => {
    expect(shims.env.SUPTRON_REAL_GIT).not.toBe('');
    expect(shims.env.SUPTRON_REAL_GIT.startsWith(shims.dir)).toBe(false);
    expect(findExecutable('git', shims.env.PATH)).toBe(join(shims.dir, 'git'));
  });

  it('denies a branch deletion with a readable reason', async () => {
    const result = await exec(join(shims.dir, 'git'), ['branch', '-D', 'x'], {
      cwd: repo.clonePath,
      env: env(),
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('denied by the Laws');
  });

  it('denies a commit while the Checkout is on the protected branch', async () => {
    const result = await exec(join(shims.dir, 'git'), ['commit', '--allow-empty', '-m', 'x'], {
      cwd: repo.clonePath,
      env: env(),
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('protected branch');
  });

  it('allows a commit on the protected branch when the Workspace has none', async () => {
    const result = await exec(join(shims.dir, 'git'), ['commit', '--allow-empty', '-m', 'x'], {
      cwd: repo.clonePath,
      env: env(null),
    });
    expect(result.code).toBe(0);
    const forced = await exec(join(shims.dir, 'git'), ['push', '--force'], {
      cwd: repo.clonePath,
      env: env(null),
    });
    expect(forced.code).toBe(1);
    expect(forced.stderr).toContain('denied by the Laws');
  });

  it('execs the real git for an allowed command', async () => {
    const result = await exec(join(shims.dir, 'git'), ['--version'], {
      cwd: repo.clonePath,
      env: env(),
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^git version/);
    const branch = await exec(join(shims.dir, 'git'), ['checkout', '-q', '-b', 'feature/x'], {
      cwd: repo.clonePath,
      env: env(),
    });
    expect(branch.code).toBe(0);
  });

  it('is transparent without a guard context', async () => {
    const result = await exec(join(shims.dir, 'git'), ['status', '--short'], {
      cwd: repo.clonePath,
      env: { ...process.env, ...shims.env },
    });
    expect(result.code).toBe(0);
  });
});
