import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RealGitClient } from '../src/git/index.js';
import { canonicalPath } from '../src/laws/paths.js';
import {
  FakeHost,
  folderProfile,
  noneProfile,
  primaryProfile,
  tempRepo,
  type TempRepo,
} from '../src/testing/index.js';
import { buildGuard, openWorkspace, WorkspaceOpenError } from '../src/workspace/index.js';

describe('openWorkspace', () => {
  let repo: TempRepo;
  let root: string;
  const deps = { git: new RealGitClient(), host: new FakeHost() };
  const missionDir = () => join(root, 'mission');

  beforeAll(async () => {
    repo = await tempRepo();
    root = await mkdtemp(join(tmpdir(), 'suptron-ws-'));
  });
  afterAll(async () => {
    await repo.cleanup();
    await rm(root, { recursive: true, force: true });
  });

  describe('repository', () => {
    it('opens a Checkout matched by realpath with the repository and host facets', async () => {
      const link = join(root, 'clone-link');
      await symlink(repo.clonePath, link);
      // git reports the Checkout by its realpath; the Workspace uses that path, not the symlink
      const clone = await realpath(repo.clonePath);
      const ws = await openWorkspace(
        primaryProfile(repo.clonePath),
        { missionDir: missionDir(), checkoutPath: link },
        deps,
      );
      expect(ws.kind).toBe('repository');
      expect([...ws.capabilities]).toEqual(['files', 'git', 'host']);
      expect(ws.cwd).toBe(clone);
      expect(ws.writeRoots).toEqual([clone]);
      expect(ws.protectedBranch).toBe('main');
      expect(ws.busyKey).toBe(canonicalPath(repo.clonePath));
      expect(ws.summary).toEqual({ kind: 'repository', path: clone, branch: 'main' });
      expect(ws.fragment).toContain(clone);
      expect(ws.fragment).toContain('main');
      expect(ws.repository?.checkoutPath).toBe(clone);
      expect(await ws.repository?.currentBranch()).toBe('main');
      expect(ws.host?.ciWaitTimeoutMs).toBe(30 * 60_000);
      expect(ws.gitConventions({ taskTitle: 'Add login', taskSlug: 'add-login' })).toContain(
        'Branch convention: feature/add-login',
      );
      expect(await ws.changeSummary()).toBe('(no changes)');
      expect(await ws.pullRequest()).toBeNull();
      // the branch follows a checkout after refresh()
      await repo.git(['checkout', '-q', '-b', 'feature/x']);
      expect(ws.summary.branch).toBe('main');
      await ws.refresh();
      expect(ws.summary.branch).toBe('feature/x');
      deps.host.seedPullRequest('feature/x');
      expect(await ws.pullRequest()).toMatchObject({ number: 1 });
      expect(
        buildGuard(ws, { taskPath: '/t', taskDocuments: ['/t/SPEC.md'], configHome: '/h' }),
      ).toEqual({
        cwd: clone,
        writeRoots: [clone],
        protectedBranch: 'main',
        taskPath: '/t',
        taskDocuments: ['/t/SPEC.md'],
        configHome: '/h',
      });
      await repo.git(['checkout', '-q', 'main']);
    });

    it('rejects a missing or foreign Checkout and reports an unreadable repository', async () => {
      const profile = primaryProfile(repo.clonePath);
      await expect(
        openWorkspace(profile, { missionDir: missionDir() }, deps),
      ).rejects.toMatchObject({ issues: [{ field: 'checkoutPath', message: 'Pick a Checkout' }] });
      await expect(
        openWorkspace(profile, { missionDir: missionDir(), checkoutPath: root }, deps),
      ).rejects.toMatchObject({ issues: [{ field: 'checkoutPath' }] });
      await expect(
        openWorkspace(
          primaryProfile('/nowhere'),
          { missionDir: missionDir(), checkoutPath: repo.clonePath },
          deps,
        ),
      ).rejects.toBeInstanceOf(WorkspaceOpenError);
    });

    it('has no host facet when the host is none', async () => {
      const profile = primaryProfile(repo.clonePath);
      if (profile.workspace.kind !== 'repository') throw new Error('unexpected kind');
      const ws = await openWorkspace(
        { ...profile, workspace: { ...profile.workspace, host: 'none' } },
        { missionDir: missionDir(), checkoutPath: repo.clonePath },
        deps,
      );
      expect([...ws.capabilities]).toEqual(['files', 'git']);
      expect(ws.host).toBeNull();
      expect(ws.repository).not.toBeNull();
      expect(await ws.pullRequest()).toBeNull();
    });
  });

  describe('folder', () => {
    it('opens an existing directory, keyed by its realpath, without git', async () => {
      const folder = await mkdtemp(join(root, 'notes-'));
      const link = join(root, 'notes-link');
      await symlink(folder, link);
      const ws = await openWorkspace(folderProfile(link), { missionDir: missionDir() }, deps);
      expect(ws.kind).toBe('folder');
      expect([...ws.capabilities]).toEqual(['files']);
      expect(ws.cwd).toBe(link);
      expect(ws.writeRoots).toEqual([link]);
      expect(ws.protectedBranch).toBeNull();
      expect(ws.busyKey).toBe(canonicalPath(folder));
      expect(ws.summary).toEqual({ kind: 'folder', path: link, branch: null });
      expect(ws.fragment).toContain(link);
      expect(ws.repository).toBeNull();
      expect(ws.host).toBeNull();
      expect(ws.gitConventions({ taskTitle: 't', taskSlug: 't' })).toBeNull();
      expect(await ws.changeSummary()).toBeNull();
      expect(await ws.pullRequest()).toBeNull();
      await ws.refresh();
    });

    it('rejects a missing directory and a Checkout', async () => {
      await expect(
        openWorkspace(folderProfile(join(root, 'missing')), { missionDir: missionDir() }, deps),
      ).rejects.toMatchObject({ issues: [{ field: 'workspace' }] });
      await expect(
        openWorkspace(
          folderProfile(root),
          { missionDir: missionDir(), checkoutPath: repo.clonePath },
          deps,
        ),
      ).rejects.toMatchObject({
        issues: [{ field: 'checkoutPath', message: expect.stringContaining('no Checkouts') }],
      });
    });
  });

  describe('none', () => {
    it('works in the Mission folder and is never busy', async () => {
      const ws = await openWorkspace(noneProfile(), { missionDir: missionDir() }, deps);
      expect(ws.kind).toBe('none');
      expect([...ws.capabilities]).toEqual([]);
      expect(ws.cwd).toBe(missionDir());
      expect(ws.writeRoots).toEqual([missionDir()]);
      expect(ws.busyKey).toBeNull();
      expect(ws.summary).toEqual({ kind: 'none', path: null, branch: null });
      expect(ws.fragment).toContain(missionDir());
      expect(ws.protectedBranch).toBeNull();
      expect(await ws.changeSummary()).toBeNull();
      expect(
        buildGuard(ws, { cwd: '/task', taskPath: '/task', taskDocuments: [], configHome: '/h' }),
      ).toMatchObject({
        cwd: '/task',
        writeRoots: [missionDir()],
        protectedBranch: null,
      });
      await expect(
        openWorkspace(noneProfile(), { missionDir: missionDir(), checkoutPath: '/x' }, deps),
      ).rejects.toMatchObject({ issues: [{ field: 'checkoutPath' }] });
    });
  });
});
