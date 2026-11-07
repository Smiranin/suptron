import type { AgentEvent, AgentSpec } from '@suptron/runtime';
import { describe, expect, it, vi } from 'vitest';

/**
 * The SDK call dies before its first message (a network drop, a CLI that fails to start):
 * the handle reports one `error` event and nothing is left rejected without a listener,
 * which would end the whole server process (run 5, 2026-11-04).
 */
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: () => {
    const iterable = (async function* () {
      await Promise.resolve();
      throw new Error('fetch failed');
      yield undefined as never;
    })();
    return Object.assign(iterable, { interrupt: async () => undefined });
  },
}));

vi.mock('../src/shim.js', () => ({
  installShims: async () => ({ env: {} }),
  guardEnv: () => ({}),
}));

const { ClaudeEngine } = await import('../src/claude-engine.js');

const spec: AgentSpec = {
  role: 'pilot',
  label: 'writer',
  model: 'sonnet',
  systemPrompt: { rules: '', instructions: 'Write.' },
  cwd: '/tmp/x',
  additionalDirectories: [],
  allowQuestions: false,
  guard: {
    cwd: '/tmp/x',
    writeRoots: ['/tmp/x'],
    protectedBranch: null,
    taskPath: '/tmp/x/task',
    taskDocuments: [],
    configHome: '/tmp/x/home',
  },
};

describe('ClaudeEngine when the call ends before its first message', () => {
  it('reports one error event and leaves no unhandled rejection behind', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const handle = new ClaudeEngine().createAgent(spec);
      handle.send('go');
      const events: AgentEvent[] = [];
      for await (const event of handle.events()) events.push(event);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(events).toEqual([{ type: 'error', message: 'Engine failed: fetch failed' }]);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
