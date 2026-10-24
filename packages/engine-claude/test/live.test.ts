import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent } from '@suptron/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClaudeEngine } from '../src/claude-engine.js';

/** Runs a real agent; needs Engine credentials. `SUPTRON_LIVE=1 pnpm vitest run --project engine-claude`. */
describe.skipIf(process.env.SUPTRON_LIVE !== '1')('ClaudeEngine (live)', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'suptron-live-'));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('runs a pilot that creates a file, is denied a force push and reports cost', async () => {
    const engine = new ClaudeEngine();
    const handle = engine.createAgent({
      role: 'pilot',
      label: 'smoke',
      model: 'sonnet',
      systemPrompt: { rules: 'Be brief.', instructions: 'Do exactly what the user asks.' },
      cwd: dir,
      additionalDirectories: [],
      allowQuestions: false,
      guard: {
        protectedBranch: 'main',
        checkoutPath: dir,
        taskPath: join(dir, 'task'),
        configHome: join(dir, 'home'),
      },
    });
    handle.send(
      'Create a file named hello.txt containing "hello". Then run `git push --force` and report what happened. Reply with one sentence.',
    );
    const events: AgentEvent[] = [];
    for await (const event of handle.events()) events.push(event);
    const result = events.find((e) => e.type === 'result');
    expect(result?.type).toBe('result');
    if (result?.type === 'result') {
      expect(result.cost.usd).toBeGreaterThan(0);
      expect(result.sessionId).not.toBe('');
    }
    expect(await readFile(join(dir, 'hello.txt'), 'utf8')).toContain('hello');
    const denied = events.some(
      (e) => e.type === 'tool_result' && e.isError && /Laws/.test(e.output),
    );
    expect(denied).toBe(true);
  }, 300_000);

  it('routes AskUserQuestion to the Commander and continues with the answer', async () => {
    const engine = new ClaudeEngine();
    const handle = engine.createAgent({
      role: 'pilot',
      label: 'asker',
      model: 'sonnet',
      systemPrompt: { rules: 'Be brief.', instructions: 'Do exactly what the user asks.' },
      cwd: dir,
      additionalDirectories: [],
      allowQuestions: true,
      guard: {
        protectedBranch: 'main',
        checkoutPath: dir,
        taskPath: join(dir, 'task'),
        configHome: join(dir, 'home'),
      },
    });
    handle.send(
      'Use the AskUserQuestion tool to ask me which colour I prefer, red or blue, then reply with one sentence naming my answer.',
    );
    const events: AgentEvent[] = [];
    for await (const event of handle.events()) {
      events.push(event);
      if (event.type === 'question') {
        expect(event.questions).toHaveLength(1);
        expect(event.questions[0]?.options).toHaveLength(2);
        event.respond({ [event.questions[0]!.question]: 'blue' });
      }
    }
    expect(events.some((e) => e.type === 'question')).toBe(true);
    const result = events.find((e) => e.type === 'result');
    expect(result?.type).toBe('result');
    if (result?.type === 'result') expect(result.output.toLowerCase()).toContain('blue');
  }, 300_000);

  it('has no AskUserQuestion when questions are not allowed', async () => {
    const engine = new ClaudeEngine();
    const handle = engine.createAgent({
      role: 'pilot',
      label: 'mute',
      model: 'sonnet',
      systemPrompt: { rules: 'Be brief.', instructions: 'Do exactly what the user asks.' },
      cwd: dir,
      additionalDirectories: [],
      allowQuestions: false,
      guard: {
        protectedBranch: 'main',
        checkoutPath: dir,
        taskPath: join(dir, 'task'),
        configHome: join(dir, 'home'),
      },
    });
    handle.send(
      'Do you have a tool named AskUserQuestion available? Answer with exactly YES or NO and nothing else.',
    );
    const events: AgentEvent[] = [];
    for await (const event of handle.events()) events.push(event);
    expect(events.some((e) => e.type === 'question')).toBe(false);
    const result = events.find((e) => e.type === 'result');
    if (result?.type === 'result') expect(result.output.toUpperCase()).toContain('NO');
  }, 300_000);

  it('reports health and models', async () => {
    const engine = new ClaudeEngine();
    expect(await engine.healthCheck()).toEqual({ ok: true });
    expect((await engine.listModels()).length).toBeGreaterThan(0);
  }, 120_000);
});
