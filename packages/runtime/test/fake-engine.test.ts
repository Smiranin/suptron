import { describe, expect, it } from 'vitest';
import type { AgentEvent, AgentSpec } from '../src/engine/index.js';
import { FakeEngine, handedOver } from '../src/testing/index.js';

const spec: AgentSpec = {
  role: 'pilot',
  label: 'analyst',
  model: 'sonnet',
  systemPrompt: { rules: '', instructions: '' },
  cwd: '/tmp',
  additionalDirectories: [],
  allowQuestions: true,
  guard: {
    cwd: '/tmp',
    writeRoots: ['/tmp'],
    protectedBranch: 'main',
    taskPath: '/tmp',
    taskDocuments: ['/tmp/task.md'],
    configHome: '/tmp',
  },
};

describe('FakeEngine', () => {
  it('blocks a question until it is answered and records the answer', async () => {
    const engine = new FakeEngine();
    engine.script('pilot', 'analyst', [
      { question: [{ question: 'Which DB?', header: 'DB', options: [], multiSelect: false }] },
      { result: { output: 'done' } },
    ]);
    const handle = engine.createAgent(spec);
    handle.send('go');
    const events: AgentEvent[] = [];
    let answered = false;
    for await (const event of handle.events()) {
      events.push(event);
      if (event.type === 'question') {
        await new Promise((r) => setTimeout(r, 10));
        expect(events.at(-1)?.type).toBe('question');
        answered = true;
        event.respond({ 'Which DB?': 'Postgres' });
      }
    }
    expect(answered).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'result', output: handedOver('done') });
    expect(engine.calls[0]?.answers).toEqual([{ 'Which DB?': 'Postgres' }]);
  });

  it('ends without a result when interrupted while waiting', async () => {
    const engine = new FakeEngine();
    engine.script('pilot', 'analyst', [
      { question: [{ question: 'q', header: 'h', options: [], multiSelect: false }] },
      { result: { output: 'never' } },
    ]);
    const handle = engine.createAgent(spec);
    handle.send('go');
    const events: AgentEvent[] = [];
    for await (const event of handle.events()) {
      events.push(event);
      if (event.type === 'question') void handle.interrupt();
    }
    expect(events.map((e) => e.type)).toEqual(['session', 'question']);
    expect(engine.calls[0]?.interrupted).toBe(true);
  });

  it('reuses a resumed session id', async () => {
    const engine = new FakeEngine();
    const id = await sessionIdOf(engine.createAgent(spec));
    expect(await sessionIdOf(engine.createAgent({ ...spec, resumeSessionId: id }))).toBe(id);
  });
});

/** Runs a handle through one empty turn and returns the session id its result reports. */
async function sessionIdOf(handle: ReturnType<FakeEngine['createAgent']>): Promise<string> {
  handle.send('go');
  for await (const event of handle.events()) {
    if (event.type === 'result') return event.sessionId;
  }
  throw new Error('no result');
}
