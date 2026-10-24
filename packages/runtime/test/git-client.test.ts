import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RealGitClient, parseWorktreeList } from '../src/git/index.js';
import { tempRepo, type TempRepo } from '../src/testing/index.js';

describe('RealGitClient', () => {
  let repo: TempRepo;
  const git = new RealGitClient();
  beforeAll(async () => {
    repo = await tempRepo();
  });
  afterAll(() => repo.cleanup());

  it('lists the main worktree and an added worktree', async () => {
    const wt = join(repo.root, 'wt');
    await repo.git(['worktree', 'add', '-q', '-b', 'feature/wt', wt]);
    const checkouts = await git.listCheckouts(repo.clonePath);
    expect(checkouts).toHaveLength(2);
    expect(checkouts[0]).toMatchObject({ branch: 'main', isMainWorktree: true });
    expect(checkouts[1]).toMatchObject({ branch: 'feature/wt', isMainWorktree: false });
    expect(await git.currentBranch(wt)).toBe('feature/wt');
  });

  it('reports the current branch and null on detached HEAD', async () => {
    expect(await git.currentBranch(repo.clonePath)).toBe('main');
    const detached = join(repo.root, 'detached');
    await repo.git(['worktree', 'add', '-q', '--detach', detached]);
    expect(await git.currentBranch(detached)).toBeNull();
    const checkouts = await git.listCheckouts(repo.clonePath);
    const real = await realpath(detached);
    expect(checkouts.find((c) => c.path === real)?.branch).toBeNull();
  });

  it('reads the remote URL and head branch', async () => {
    const defaults = await git.readRemoteDefaults(repo.clonePath);
    expect(defaults.remoteUrl).toBe(repo.remotePath);
    expect(defaults.headBranch).toBe('main');
  });

  it('summarizes a diff', async () => {
    expect(await git.diffSummary(repo.clonePath, 'main')).toBe('(no changes)');
  });

  it('parses porcelain output', () => {
    const out =
      'worktree /a\nHEAD abc\nbranch refs/heads/main\n\nworktree /b\nHEAD def\ndetached\n\n';
    expect(parseWorktreeList(out)).toEqual([
      { path: '/a', branch: 'main', isMainWorktree: true },
      { path: '/b', branch: null, isMainWorktree: false },
    ]);
  });
});
