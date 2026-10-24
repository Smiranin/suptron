import { describe, expect, it } from 'vitest';
import type { AgentEvent, AgentSpec } from '../src/engine/index.js';
import { FakeEngine } from '../src/testing/index.js';

const spec: AgentSpec = {
  role: 'pilot',
  label: 'analyst',
  model: 'sonnet',
  systemPrompt: { rules: '', instructions: '' },
  cwd: '/tmp',
  additionalDirectories: [],
  allowQuestions: true,
  guard: { protectedBranch: 'main', checkoutPath: '/tmp', taskPath: '/tmp', configHome: '/tmp' },
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
    expect(events.at(-1)).toMatchObject({ type: 'result', output: 'done' });
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
    expect(events.map((e) => e.type)).toEqual(['question']);
    expect(engine.calls[0]?.interrupted).toBe(true);
  });

  it('reuses a resumed session id', async () => {
    const engine = new FakeEngine();
    const first = engine.createAgent(spec);
    const id = await first.sessionId;
    const second = engine.createAgent({ ...spec, resumeSessionId: id });
    expect(await second.sessionId).toBe(id);
  });
});
