import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { primaryAssembly, primaryProfile } from '@suptron/runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testServer, type TestServer } from './helpers.js';

describe('Projects, Profiles, Assemblies and tools routes', () => {
  let s: TestServer;
  beforeEach(async () => {
    s = await testServer();
  });
  afterEach(() => s.cleanup());

  it('lists Projects with their Assemblies and creates a Project', async () => {
    const list = await s.app.inject({ method: 'GET', url: '/api/projects' });
    expect(list.json().items[0]).toMatchObject({
      name: 'my-app',
      assemblies: [{ name: 'feature', status: 'valid', activeMissions: 0 }],
      activeMissions: 0,
    });
    const profile = primaryProfile(s.repo.clonePath, 'second');
    const created = await s.app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { profile },
    });
    expect(created.statusCode).toBe(201);
    expect((await stat(join(s.home, 'projects', 'second', 'assemblies'))).isDirectory()).toBe(true);
    expect(await readFile(join(s.home, 'projects', 'second', 'profile.yaml'), 'utf8')).toContain(
      'name: second',
    );
    expect(
      (await s.app.inject({ method: 'POST', url: '/api/projects', payload: { profile } }))
        .statusCode,
    ).toBe(409);
    const one = await s.app.inject({ method: 'GET', url: '/api/projects/second' });
    expect(one.json().profile.name).toBe('second');

    const etag = one.json().etag as string;
    const renamed = await s.app.inject({
      method: 'PUT',
      url: '/api/projects/second/profile',
      payload: { ...profile, name: 'third' },
      headers: { 'if-match': etag },
    });
    expect(renamed.statusCode).toBe(200);
    expect((await s.app.inject({ method: 'GET', url: '/api/projects/third' })).statusCode).toBe(
      200,
    );
    expect((await s.app.inject({ method: 'GET', url: '/api/projects/second' })).statusCode).toBe(
      404,
    );
    expect((await s.app.inject({ method: 'DELETE', url: '/api/projects/third' })).statusCode).toBe(
      204,
    );
  });

  it('validates an Assembly on PUT and exposes unparseable files', async () => {
    const doc = primaryAssembly();
    const broken = {
      ...doc,
      slots: [
        { name: 'a', unit: 'analyst', loop: { target: 'b', limit: 3 } },
        { name: 'b', unit: 'tester' },
      ],
    };
    const res = await s.app.inject({
      method: 'PUT',
      url: '/api/projects/my-app/assemblies/feature?force=1',
      payload: broken,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0]).toMatchObject({ code: 'loop_target_not_earlier', slotName: 'a' });

    const get = await s.app.inject({
      method: 'GET',
      url: '/api/projects/my-app/assemblies/feature',
    });
    expect(get.json()).toMatchObject({ status: 'valid', activeMissions: 0 });
    const etag = get.json().etag as string;
    const ok = await s.app.inject({
      method: 'PUT',
      url: '/api/projects/my-app/assemblies/feature',
      payload: doc,
      headers: { 'if-match': etag },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().warnings.map((w: { slotName: string }) => w.slotName)).toEqual([
      'implementer',
      'publisher',
    ]);

    await writeFile(
      join(s.home, 'projects', 'my-app', 'assemblies', 'feature.yaml'),
      'name: [broken',
    );
    const bad = await s.app.inject({
      method: 'GET',
      url: '/api/projects/my-app/assemblies/feature',
    });
    expect(bad.json().status).toBe('unparseable');
    expect(bad.json().text).toBe('name: [broken');
    expect(bad.json().assembly).toBeNull();

    const dup = await s.app.inject({
      method: 'POST',
      url: '/api/projects/my-app/assemblies/feature/duplicate',
      payload: { newName: 'copy' },
    });
    expect(dup.statusCode).toBe(404);
    await writeFile(
      join(s.home, 'projects', 'my-app', 'assemblies', 'feature.yaml'),
      (await s.app.inject({ method: 'GET', url: '/api/units' })) && '',
    );
    const created = await s.app.inject({
      method: 'PUT',
      url: '/api/projects/my-app/assemblies/feature?force=1',
      payload: doc,
    });
    expect(created.statusCode).toBe(200);
    const dup2 = await s.app.inject({
      method: 'POST',
      url: '/api/projects/my-app/assemblies/feature/duplicate',
      payload: { newName: 'copy' },
    });
    expect(dup2.statusCode).toBe(201);
    expect(
      (await s.app.inject({ method: 'GET', url: '/api/projects/my-app' }))
        .json()
        .assemblies.map((a: { name: string }) => a.name),
    ).toEqual(['copy', 'feature']);
    expect(
      (await s.app.inject({ method: 'DELETE', url: '/api/projects/my-app/assemblies/copy' }))
        .statusCode,
    ).toBe(204);
  });

  it('refuses to delete an Assembly or a Project with an active Mission', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    s.engine.script('pilot', 'analyst', [{ wait: gate }, { result: { output: 'ok' } }]);
    const start = await s.app.inject({
      method: 'POST',
      url: '/api/missions',
      payload: s.startBody(),
    });
    expect(start.statusCode).toBe(201);
    const del = await s.app.inject({
      method: 'DELETE',
      url: '/api/projects/my-app/assemblies/feature',
    });
    expect(del.json()).toEqual({ reason: 'active_missions', count: 1 });
    expect((await s.app.inject({ method: 'DELETE', url: '/api/projects/my-app' })).statusCode).toBe(
      409,
    );
    expect(
      (await s.app.inject({ method: 'GET', url: '/api/units/analyst' })).json().usage
        .activeMissions,
    ).toBe(1);
    const get = await s.app.inject({
      method: 'GET',
      url: '/api/projects/my-app/assemblies/feature',
    });
    expect(get.json().activeMissions).toBe(1);
    release();
  });

  it('lists Checkouts, reads git defaults, stats paths and opens files in the editor', async () => {
    const checkouts = await s.app.inject({ method: 'GET', url: '/api/projects/my-app/checkouts' });
    expect(checkouts.json()).toEqual([
      { path: expect.any(String), branch: 'main', isMainWorktree: true, busyMissionId: null },
    ]);
    const defaults = await s.app.inject({
      method: 'GET',
      url: `/api/git/remote-defaults?path=${encodeURIComponent(s.repo.clonePath)}`,
    });
    expect(defaults.json()).toEqual({
      remote: 'origin',
      remoteUrl: s.repo.remotePath,
      headBranch: 'main',
    });
    expect(
      (
        await s.app.inject({
          method: 'GET',
          url: `/api/git/remote-defaults?path=${encodeURIComponent(s.taskDir)}`,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await s.app.inject({
          method: 'GET',
          url: `/api/fs/stat?path=${encodeURIComponent(s.taskDir)}`,
        })
      ).json(),
    ).toMatchObject({ exists: true, kind: 'dir' });
    expect(
      (
        await s.app.inject({
          method: 'GET',
          url: `/api/fs/stat?path=README.md&base=${encodeURIComponent(s.repo.clonePath)}`,
        })
      ).json(),
    ).toMatchObject({ exists: true, kind: 'file' });
    expect(
      (await s.app.inject({ method: 'GET', url: '/api/fs/stat?path=/nope/nope' })).json(),
    ).toMatchObject({ exists: false });
    const unitPath = join(s.home, 'hangar', 'analyst.md');
    expect(
      (await s.app.inject({ method: 'POST', url: '/api/open', payload: { path: unitPath } }))
        .statusCode,
    ).toBe(204);
    expect(s.opened).toEqual([unitPath]);
    expect(
      (await s.app.inject({ method: 'POST', url: '/api/open', payload: { path: '/etc/hosts' } }))
        .statusCode,
    ).toBe(400);
    const health = await s.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json()).toMatchObject({
      engine: { ok: true },
      host: { ok: true },
      configHome: s.home,
    });
    expect((await s.app.inject({ method: 'GET', url: '/api/models' })).json()).toHaveLength(2);
  });
});
