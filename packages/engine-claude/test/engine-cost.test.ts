import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent, AgentSpec } from '@suptron/runtime';
import { describe, expect, it, vi } from 'vitest';

/** The totals the stubbed SDK reports, one `result` per query, in call order. */
const totals: number[] = [];

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: () => {
    const usd = totals.shift() ?? 0;
    const messages: SDKMessage[] = [
      {
        type: 'result',
        subtype: 'success',
        session_id: 'core-session',
        result: 'done',
        total_cost_usd: usd,
        modelUsage: {
          opus: {
            inputTokens: usd * 1000,
            outputTokens: usd * 100,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
          },
        },
      } as unknown as SDKMessage,
    ];
    const iterable = (async function* () {
      yield* messages;
    })();
    return Object.assign(iterable, { interrupt: async () => undefined });
  },
}));

vi.mock('../src/shim.js', () => ({
  installShims: async () => ({ env: {} }),
  guardEnv: () => ({}),
}));

const { ClaudeEngine } = await import('../src/claude-engine.js');

function spec(resumeSessionId?: string): AgentSpec {
  return {
    role: 'core',
    label: 'core',
    model: 'opus',
    systemPrompt: { rules: '', instructions: 'Judge.' },
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
    ...(resumeSessionId !== undefined && { resumeSessionId }),
  };
}

async function runCall(engine: InstanceType<typeof ClaudeEngine>, resume?: string) {
  const handle = engine.createAgent(spec(resume));
  handle.send('go');
  const events: AgentEvent[] = [];
  for await (const event of handle.events()) events.push(event);
  const result = events.find((e) => e.type === 'result');
  if (result?.type !== 'result') throw new Error('no result');
  return result;
}

describe('ClaudeEngine cost of a resumed session', () => {
  it('reports the delta of the running total across the handles of one session', async () => {
    totals.push(1.0, 1.5);
    const engine = new ClaudeEngine();
    const first = await runCall(engine);
    expect(first.cost.usd).toBe(1.0);
    expect(first.cost.inputTokens).toBe(1000);
    const second = await runCall(engine, first.sessionId);
    expect(second.cost.usd).toBe(0.5);
    expect(second.cost.inputTokens).toBe(500);
    expect(second.cost.outputTokens).toBe(50);
  });
});
