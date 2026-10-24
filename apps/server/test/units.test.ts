import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serializeUnit, type UnitFile } from '@suptron/runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testServer, type TestServer } from './helpers.js';

describe('Units routes', () => {
  let s: TestServer;
  beforeEach(async () => {
    s = await testServer();
  });
  afterEach(() => s.cleanup());

  const newUnit: UnitFile = {
    name: 'docs-writer',
    model: 'sonnet',
    mayAskCommander: false,
    doneCondition: [{ kind: 'llm_judgment', criterion: 'Docs are complete.' }],
    rules: 'Only touch docs.',
    instructions: 'Write the docs.',
  };

  it('lists Units with etags and reports usage', async () => {
    const list = await s.app.inject({ method: 'GET', url: '/api/units' });
    expect(list.statusCode).toBe(200);
    const items = list.json().items as { name: string; etag: string; issues: unknown[] }[];
    expect(items.map((i) => i.name)).toContain('analyst');
    expect(items[0]?.etag).toMatch(/^[a-f0-9]{64}$/);
    const one = await s.app.inject({ method: 'GET', url: '/api/units/implementer' });
    expect(one.json().usage).toEqual({
      assemblies: [{ project: 'my-app', assembly: 'feature' }],
      activeMissions: 0,
    });
    expect((await s.app.inject({ method: 'GET', url: '/api/units/nope' })).statusCode).toBe(404);
  });

  it('creates, updates with preconditions, forces and detects hand edits', async () => {
    const created = await s.app.inject({
      method: 'PUT',
      url: '/api/units/docs-writer',
      payload: newUnit,
    });
    expect(created.statusCode).toBe(201);
    const path = join(s.home, 'hangar', 'docs-writer.md');
    expect(await readFile(path, 'utf8')).toBe(serializeUnit(newUnit));
    const etag = created.json().etag as string;

    const noMatch = await s.app.inject({
      method: 'PUT',
      url: '/api/units/docs-writer',
      payload: newUnit,
    });
    expect(noMatch.statusCode).toBe(428);

    const stale = await s.app.inject({
      method: 'PUT',
      url: '/api/units/docs-writer',
      payload: { ...newUnit, rules: 'x' },
      headers: { 'if-match': 'stale' },
    });
    expect(stale.statusCode).toBe(412);
    expect(stale.json().current.data.rules).toBe('Only touch docs.');
    expect(stale.json().current.etag).toBe(etag);

    const updated = await s.app.inject({
      method: 'PUT',
      url: '/api/units/docs-writer',
      payload: { ...newUnit, rules: 'x' },
      headers: { 'if-match': etag },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().etag).not.toBe(etag);

    const forced = await s.app.inject({
      method: 'PUT',
      url: '/api/units/docs-writer?force=1',
      payload: { ...newUnit, rules: 'y' },
    });
    expect(forced.statusCode).toBe(200);

    await writeFile(path, serializeUnit({ ...newUnit, rules: 'edited by hand' }));
    const after = await s.app.inject({ method: 'GET', url: '/api/units/docs-writer' });
    expect(after.json().unit.rules).toBe('edited by hand');
    expect(after.json().etag).not.toBe(forced.json().etag);

    const invalid = await s.app.inject({
      method: 'PUT',
      url: '/api/units/docs-writer?force=1',
      payload: { ...newUnit, model: '' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().issues[0].path).toBe('model');
  });

  it('refuses to delete or rename a used Unit, duplicates, and deletes an unused one', async () => {
    const del = await s.app.inject({ method: 'DELETE', url: '/api/units/analyst' });
    expect(del.statusCode).toBe(409);
    expect(del.json()).toEqual({
      reason: 'in_use',
      usedBy: [{ project: 'my-app', assembly: 'feature' }],
    });

    const rename = await s.app.inject({
      method: 'PUT',
      url: '/api/units/analyst?force=1',
      payload: { ...newUnit, name: 'analyst-2' },
    });
    expect(rename.statusCode).toBe(409);

    const dup = await s.app.inject({
      method: 'POST',
      url: '/api/units/analyst/duplicate',
      payload: { newName: 'analyst-copy' },
    });
    expect(dup.statusCode).toBe(201);
    expect(dup.json().unit).toMatchObject({ name: 'analyst-copy', model: 'sonnet' });
    expect(await readFile(join(s.home, 'hangar', 'analyst-copy.md'), 'utf8')).toContain(
      'name: analyst-copy',
    );
    const dupAgain = await s.app.inject({
      method: 'POST',
      url: '/api/units/analyst/duplicate',
      payload: { newName: 'analyst-copy' },
    });
    expect(dupAgain.statusCode).toBe(409);

    const etag = (await s.app.inject({ method: 'GET', url: '/api/units/analyst-copy' })).json()
      .etag as string;
    const renamed = await s.app.inject({
      method: 'PUT',
      url: '/api/units/analyst-copy',
      payload: { ...dup.json().unit, name: 'analyst-renamed' },
      headers: { 'if-match': etag },
    });
    expect(renamed.statusCode).toBe(200);
    expect((await s.app.inject({ method: 'GET', url: '/api/units/analyst-copy' })).statusCode).toBe(
      404,
    );
    expect(
      (await s.app.inject({ method: 'DELETE', url: '/api/units/analyst-renamed' })).statusCode,
    ).toBe(204);
    expect(
      (await s.app.inject({ method: 'GET', url: '/api/units/analyst-renamed' })).statusCode,
    ).toBe(404);
  });
});
