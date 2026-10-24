import { basename } from 'node:path';
import {
  coreCallName,
  defaultCoreScript,
  type MissionDetail,
  type MissionEvent,
} from '@suptron/runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testServer, type TestServer } from './helpers.js';

async function readSse(
  url: string,
  count: number,
  timeoutMs = 5000,
): Promise<{ ids: string[]; events: string[]; data: MissionEvent[] }> {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const ids: string[] = [];
  const names: string[] = [];
  const data: MissionEvent[] = [];
  const deadline = Date.now() + timeoutMs;
  while (
    data.length + names.filter((n) => n === 'resync').length < count &&
    Date.now() < deadline
  ) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (block.startsWith(':')) continue;
      let name = 'message';
      let payload = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('id: ')) ids.push(line.slice(4));
        else if (line.startsWith('event: ')) name = line.slice(7);
        else if (line.startsWith('data: ')) payload = line.slice(6);
      }
      names.push(name);
      if (name === 'message') data.push(JSON.parse(payload));
    }
  }
  controller.abort();
  return { ids, events: names, data };
}

describe('Missions routes', () => {
  let s: TestServer;
  beforeEach(async () => {
    s = await testServer();
  });
  afterEach(() => s.cleanup());

  it('validates the start request and refuses a busy Checkout', async () => {
    const bad = await s.app.inject({
      method: 'POST',
      url: '/api/missions',
      payload: s.startBody({ task: { kind: 'path', path: '/nope' }, assembly: 'missing' }),
    });
    expect(bad.statusCode).toBe(400);
    expect(
      bad
        .json()
        .issues.map((i: { field: string }) => i.field)
        .sort(),
    ).toEqual(['assembly', 'taskPath']);
    const emptyText = await s.app.inject({
      method: 'POST',
      url: '/api/missions',
      payload: s.startBody({ task: { kind: 'text', text: '   ' } }),
    });
    expect(emptyText.statusCode).toBe(400);
    expect(emptyText.json().issues).toEqual([
      { field: 'taskText', message: 'The Task text is empty' },
    ]);
    const malformed = await s.app.inject({
      method: 'POST',
      url: '/api/missions',
      payload: s.startBody({ task: { kind: 'text' } }),
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().issues[0].field).toBe('taskText');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    s.engine.script('pilot', 'analyst', [{ wait: gate }, { result: { output: 'ok' } }]);
    const first = await s.app.inject({
      method: 'POST',
      url: '/api/missions',
      payload: s.startBody({ workItemId: 'ABC-1' }),
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      state: 'running',
      taskPath: s.taskDir,
      taskTitle: basename(s.taskDir),
      workItemId: 'ABC-1',
      branch: 'main',
      cost: { estimated: true },
    });
    const busy = await s.app.inject({
      method: 'POST',
      url: '/api/missions',
      payload: s.startBody(),
    });
    expect(busy.statusCode).toBe(409);
    expect(busy.json()).toEqual({ reason: 'checkout_busy', missionId: first.json().id });
    const checkouts = await s.app.inject({ method: 'GET', url: '/api/projects/my-app/checkouts' });
    expect(checkouts.json()[0].busyMissionId).toBe(first.json().id);
    expect(
      (await s.app.inject({ method: 'DELETE', url: `/api/missions/${first.json().id}` })).json(),
    ).toMatchObject({ reason: 'not_finished' });
    release();
  });

  it('builds the Mission detail with transcript sections after a Loop and a Retry', async () => {
    let judgeCalls = 0;
    s.engine.script('core', 'core', (call) => {
      if (coreCallName(call.prompt) === 'judge') {
        judgeCalls += 1;
        return [
          {
            result: {
              structured: {
                holds: judgeCalls > 1,
                reason: judgeCalls > 1 ? 'Clean.' : 'Blocking finding.',
              },
            },
          },
        ];
      }
      return defaultCoreScript(call);
    });
    s.engine.script('pilot', 'tester', (call) =>
      call.index === 0
        ? [{ error: 'engine exploded' }]
        : [{ text: 'testing' }, { result: { output: 'tests pass' } }],
    );
    s.engine.pilot('implementer', 'implemented', [
      { toolCall: { name: 'Write', input: { file_path: 'a.ts' } }, result: { output: 'ok' } },
    ]);
    s.host.seedPullRequest('main', { ci: 'success', unresolvedThreads: 0 });
    const start = await s.app.inject({
      method: 'POST',
      url: '/api/missions',
      payload: s.startBody(),
    });
    const id = start.json().id as string;
    await s.waitForState(id, 'needs_attention');
    let detail = (
      await s.app.inject({ method: 'GET', url: `/api/missions/${id}` })
    ).json() as MissionDetail;
    expect(detail.summary.state).toBe('needs_attention');
    expect(detail.attention).toMatchObject({ cause: 'engine_error', slot: 'tester' });
    expect(detail.result).toBeUndefined();
    expect(
      detail.transcript.map((t) => [t.execution.slot, t.execution.attempt, t.execution.loopFrom]),
    ).toEqual([
      ['analyst', 1, undefined],
      ['implementer', 1, undefined],
      ['reviewer', 1, undefined],
      ['implementer', 1, 'reviewer'],
      ['reviewer', 1, undefined],
      ['tester', 1, undefined],
    ]);
    const implementerSection = detail.transcript[1]!;
    expect(implementerSection.entries.map((e) => e.kind)).toEqual(['text', 'tool_call', 'check']);
    expect(implementerSection.entries[1]).toMatchObject({
      kind: 'tool_call',
      name: 'Write',
      result: { output: 'ok', isError: false },
    });
    expect(detail.transcript[4]!.entries.find((e) => e.kind === 'check')).toMatchObject({
      holds: true,
      detail: 'Clean.',
    });
    expect(detail.transcript[5]!.entries.map((e) => e.kind)).toEqual(['error']);

    const retry = await s.app.inject({
      method: 'POST',
      url: `/api/missions/${id}/retry`,
      payload: { note: 'please try again' },
    });
    expect(retry.statusCode).toBe(204);
    await s.waitFor((es) => es.some((e) => e.type === 'mission.completed'));
    detail = (
      await s.app.inject({ method: 'GET', url: `/api/missions/${id}` })
    ).json() as MissionDetail;
    expect(detail.summary.state).toBe('completed');
    expect(detail.attention).toBeUndefined();
    expect(detail.result).toMatchObject({ exitSlot: 'pr-reviewer', pr: { number: 1 } });
    const retried = detail.transcript[6]!;
    expect(retried.execution).toEqual({ slot: 'tester', attempt: 2 });
    expect(retried.entries[0]).toMatchObject({ kind: 'note', text: 'please try again' });
    expect(detail.slots.map((sl) => sl.name)).toEqual([
      'analyst',
      'implementer',
      'reviewer',
      'tester',
      'publisher',
      'pr-reviewer',
      'core',
    ]);
    expect(detail.slots.find((sl) => sl.name === 'reviewer')?.loops).toBe(1);
    expect(detail.seq).toBe(s.events.filter((e) => e.missionId === id).length);
    expect(
      (await s.app.inject({ method: 'POST', url: `/api/missions/${id}/retry` })).statusCode,
    ).toBe(409);
    expect((await s.app.inject({ method: 'GET', url: '/api/missions' })).json()).toHaveLength(1);
    expect((await s.app.inject({ method: 'DELETE', url: `/api/missions/${id}` })).statusCode).toBe(
      204,
    );
    expect((await s.app.inject({ method: 'GET', url: '/api/missions' })).json()).toEqual([]);
    expect((await s.app.inject({ method: 'GET', url: `/api/missions/${id}` })).statusCode).toBe(
      404,
    );
    expect(s.events.at(-1)).toMatchObject({ type: 'mission.dismissed', missionId: id });
  });

  it('answers a Human Checkpoint and records it in the transcript', async () => {
    s.engine.script('pilot', 'analyst', [
      {
        question: [
          {
            question: 'Which DB?',
            header: 'DB',
            options: [{ label: 'Postgres', description: 'pg' }],
            multiSelect: false,
          },
        ],
      },
      { result: { output: 'analysis' } },
    ]);
    const id = (
      await s.app.inject({ method: 'POST', url: '/api/missions', payload: s.startBody() })
    ).json().id as string;
    await s.waitForState(id, 'waiting_for_owner');
    const detail = (
      await s.app.inject({ method: 'GET', url: `/api/missions/${id}` })
    ).json() as MissionDetail;
    expect(detail.pendingQuestion).toMatchObject({ slot: 'analyst' });
    const wrong = await s.app.inject({
      method: 'POST',
      url: `/api/missions/${id}/answer`,
      payload: { questionId: 'x', answers: {} },
    });
    expect(wrong.statusCode).toBe(409);
    const ok = await s.app.inject({
      method: 'POST',
      url: `/api/missions/${id}/answer`,
      payload: { questionId: detail.pendingQuestion!.id, answers: { 'Which DB?': 'Postgres' } },
    });
    expect(ok.statusCode).toBe(204);
    await s.waitFor((es) => es.some((e) => e.type === 'slot.done' && e.slot === 'analyst'));
    const after = (
      await s.app.inject({ method: 'GET', url: `/api/missions/${id}` })
    ).json() as MissionDetail;
    expect(after.pendingQuestion).toBeUndefined();
    expect(after.transcript[0]!.entries.map((e) => e.kind)).toEqual(['question', 'answer']);
    expect(
      (await s.app.inject({ method: 'POST', url: `/api/missions/${id}/stop` })).statusCode,
    ).toBe(204);
    expect(
      (await s.app.inject({ method: 'GET', url: `/api/missions/${id}` })).json().summary.state,
    ).toBe('stopped');
  });

  it('streams events over SSE with replay, resync and the global filter', async () => {
    const address = await s.app.listen({ host: '127.0.0.1', port: 0 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    s.engine.script('pilot', 'reviewer', [{ wait: gate }, { result: { output: 'ok' } }]);
    const id = (
      await s.app.inject({ method: 'POST', url: '/api/missions', payload: s.startBody() })
    ).json().id as string;
    await s.waitFor((es) => es.some((e) => e.type === 'slot.started' && e.slot === 'reviewer'));
    const soFar = s.events.filter((e) => e.missionId === id).length;
    const replay = await readSse(`${address}/api/events?mission=${id}&after=2`, soFar - 2);
    expect(replay.data.map((e) => e.seq)).toEqual(
      s.events.filter((e) => e.missionId === id && e.seq > 2).map((e) => e.seq),
    );
    expect(replay.ids[0]).toBe('3');
    const resync = await readSse(`${address}/api/events?mission=${id}&after=0`, 1);
    expect(resync.events[0]).toBe('message');
    s.context.events.publish({
      type: 'mission.state',
      missionId: 'ghost',
      seq: 50,
      state: 'running',
    });
    const gap = await readSse(`${address}/api/events?mission=ghost&after=10`, 1);
    expect(gap.events[0]).toBe('resync');

    const livePromise = readSse(`${address}/api/events`, 3);
    await new Promise((r) => setTimeout(r, 50));
    release();
    const live = await livePromise;
    expect(
      live.data.every((e) => !e.type.startsWith('agent.') && e.type !== 'check.evaluated'),
    ).toBe(true);
    expect(
      live.data.some(
        (e) => e.type === 'slot.done' || e.type === 'slot.started' || e.type === 'cost.updated',
      ),
    ).toBe(true);
  });

  it('exposes interrupted Missions recovered from the ledger', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    s.engine.script('pilot', 'analyst', [{ wait: gate }, { result: { output: 'ok' } }]);
    const id = (
      await s.app.inject({ method: 'POST', url: '/api/missions', payload: s.startBody() })
    ).json().id as string;
    await s.waitFor((es) => es.some((e) => e.type === 'slot.started'));
    await s.registry.flush();
    const { MissionRegistry, RealGitClient } = await import('@suptron/runtime');
    const { buildApp } = await import('../src/app.js');
    const restarted = new MissionRegistry({
      home: s.home,
      engine: s.engine,
      host: s.host,
      git: new RealGitClient(),
    });
    await restarted.recoverInterrupted();
    const second = await buildApp({
      home: s.home,
      registry: restarted,
      engine: s.engine,
      host: s.host,
      git: new RealGitClient(),
    });
    const list = await second.app.inject({ method: 'GET', url: '/api/missions' });
    expect(list.json()).toEqual([
      expect.objectContaining({ id, state: 'stopped', note: 'interrupted', currentSlot: null }),
    ]);
    const detail = (
      await second.app.inject({ method: 'GET', url: `/api/missions/${id}` })
    ).json() as MissionDetail;
    expect(detail).toMatchObject({ transcriptLost: true, transcript: [], seq: 0 });
    expect(detail.assembly.name).toBe('feature');
    expect(detail.slots.map((sl) => sl.name)).toContain('core');
    expect(
      (await second.app.inject({ method: 'DELETE', url: `/api/missions/${id}` })).statusCode,
    ).toBe(204);
    await second.app.close();
    release();
  });
});
