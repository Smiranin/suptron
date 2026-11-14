import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentSpec } from '@suptron/runtime';
import { describe, expect, it, vi } from 'vitest';

/** The options of every stubbed query, in call order. */
const seen: Options[] = [];

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ options }: { options: Options }) => {
    seen.push(options);
    const iterable = (async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        session_id: 'session',
        result: 'done',
        total_cost_usd: 0,
        modelUsage: {},
      } as unknown as SDKMessage;
    })();
    return Object.assign(iterable, { interrupt: async () => undefined });
  },
}));

vi.mock('../src/shim.js', () => ({
  installShims: async () => ({ env: {} }),
  guardEnv: () => ({}),
}));

const { ClaudeEngine, CORE_TOOLS } = await import('../src/claude-engine.js');

function spec(role: AgentSpec['role'], additionalDirectories: string[]): AgentSpec {
  return {
    role,
    label: role === 'core' ? 'core' : 'writer',
    model: 'opus',
    systemPrompt: { rules: '', instructions: 'Work.' },
    cwd: '/tmp/x/task',
    additionalDirectories,
    allowQuestions: false,
    guard: {
      cwd: '/tmp/x/task',
      writeRoots: ['/tmp/x/workspace'],
      protectedBranch: null,
      taskPath: '/tmp/x/task',
      taskDocuments: [],
      configHome: '/tmp/x/home',
    },
  };
}

async function optionsOf(agent: AgentSpec): Promise<Options> {
  const handle = new ClaudeEngine().createAgent(agent);
  handle.send('go');
  for await (const event of handle.events()) void event;
  return seen.at(-1)!;
}

describe('ClaudeEngine options of the Core', () => {
  it('lets the Core read, and nothing else, in the Task folder and the Workspace', async () => {
    const options = await optionsOf(spec('core', ['/tmp/x/workspace']));
    expect(CORE_TOOLS).toEqual(['Read', 'Glob', 'Grep']);
    expect(options.tools).toEqual(CORE_TOOLS);
    expect(options.cwd).toBe('/tmp/x/task');
    expect(options.additionalDirectories).toEqual(['/tmp/x/workspace']);
    expect(options.disallowedTools).toEqual(['AskUserQuestion']);
    expect(options.permissionMode).toBeUndefined();
  });

  it('leaves a Pilot every tool of the Engine', async () => {
    const options = await optionsOf(spec('pilot', ['/tmp/x/task']));
    expect(options.tools).toBeUndefined();
    expect(options.permissionMode).toBe('acceptEdits');
  });
});
