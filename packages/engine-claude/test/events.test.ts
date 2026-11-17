import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { costOfResult, sdkMessageToEvents } from '../src/events.js';
import { SubAgentTracker } from '../src/sub-agents.js';

function message(partial: Record<string, unknown>): SDKMessage {
  return { uuid: 'u', session_id: 's1', ...partial } as unknown as SDKMessage;
}

describe('sdkMessageToEvents', () => {
  it('maps assistant text and tool_use blocks, dropping StructuredOutput', () => {
    const events = sdkMessageToEvents(
      message({
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            { type: 'text', text: 'Looking at the repo.' },
            { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } },
            { type: 'tool_use', id: 'toolu_2', name: 'StructuredOutput', input: { prompt: 'x' } },
          ],
        },
      }),
    );
    expect(events).toEqual([
      { type: 'text', text: 'Looking at the repo.' },
      { type: 'tool_call', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } },
    ]);
  });

  it('maps user tool_result blocks by tool_use_id and stringifies text blocks', () => {
    const events = sdkMessageToEvents(
      message({
        type: 'user',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: 'README.md\n',
              is_error: false,
            },
            {
              type: 'tool_result',
              tool_use_id: 'toolu_2',
              content: [{ type: 'text', text: 'boom' }],
              is_error: true,
            },
          ],
        },
      }),
    );
    expect(events).toEqual([
      { type: 'tool_result', toolCallId: 'toolu_1', output: 'README.md\n', isError: false },
      { type: 'tool_result', toolCallId: 'toolu_2', output: 'boom', isError: true },
    ]);
  });

  it('maps streaming frames and thinking estimates to activity events', () => {
    const frame = (event: Record<string, unknown>) =>
      sdkMessageToEvents(message({ type: 'stream_event', parent_tool_use_id: null, event }));
    expect(
      frame({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }),
    ).toEqual([{ type: 'activity', phase: 'thinking' }]);
    expect(
      frame({ type: 'content_block_start', index: 1, content_block: { type: 'text' } }),
    ).toEqual([{ type: 'activity', phase: 'writing' }]);
    expect(
      frame({
        type: 'content_block_start',
        index: 2,
        content_block: { type: 'tool_use', id: 't', name: 'Read', input: {} },
      }),
    ).toEqual([{ type: 'activity', phase: 'tool', detail: 'Read' }]);
    expect(
      frame({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'x' },
      }),
    ).toEqual([{ type: 'activity', phase: 'thinking' }]);
    expect(frame({ type: 'message_start', message: {} })).toEqual([]);
    expect(frame({ type: 'content_block_stop', index: 0 })).toEqual([]);
    expect(
      sdkMessageToEvents(
        message({
          type: 'system',
          subtype: 'thinking_tokens',
          estimated_tokens: 120,
          estimated_tokens_delta: 20,
        }),
      ),
    ).toEqual([{ type: 'activity', phase: 'thinking' }]);
  });

  it('ignores a plain user prompt and system messages', () => {
    expect(
      sdkMessageToEvents(
        message({
          type: 'user',
          parent_tool_use_id: null,
          message: { role: 'user', content: 'hi' },
        }),
      ),
    ).toEqual([]);
    expect(
      sdkMessageToEvents(message({ type: 'system', subtype: 'status', status: null })),
    ).toEqual([]);
  });

  it('names the session as soon as the query starts', () => {
    expect(
      sdkMessageToEvents(
        message({ type: 'system', subtype: 'init', cwd: '/', tools: [], session_id: 's-1' }),
      ),
    ).toEqual([{ type: 'session', sessionId: 's-1' }]);
  });

  it('reports a usage limit only for a refusal with a reset time', () => {
    const limit = (info: Record<string, unknown>) =>
      sdkMessageToEvents(message({ type: 'rate_limit_event', rate_limit_info: info }));
    expect(limit({ status: 'rejected', resetsAt: 1794647400, rateLimitType: 'five_hour' })).toEqual(
      [{ type: 'usage_limit', resetsAt: '2026-11-14T09:10:00.000Z' }],
    );
    expect(limit({ status: 'allowed', resetsAt: 1794647400 })).toEqual([]);
    expect(limit({ status: 'allowed_warning', resetsAt: 1794647400 })).toEqual([]);
    expect(limit({ status: 'rejected' })).toEqual([]);
  });

  it('marks the error of a session that does not exist any more', () => {
    const failed = (errors: string[]) =>
      sdkMessageToEvents(
        message({ type: 'result', subtype: 'error_during_execution', errors, session_id: 's' }),
      );
    expect(failed(['No conversation found with session ID: 1111'])).toEqual([
      {
        type: 'error',
        message:
          'Engine error (error_during_execution): No conversation found with session ID: 1111',
        sessionLost: true,
      },
    ]);
    expect(failed(['Something else'])).toEqual([
      { type: 'error', message: 'Engine error (error_during_execution): Something else' },
    ]);
  });

  it('maps a successful result with cost summed over modelUsage', () => {
    const result = message({
      type: 'result',
      subtype: 'success',
      result: 'done',
      structured_output: { prompt: 'p' },
      total_cost_usd: 0.42,
      usage: { input_tokens: 1, output_tokens: 1 },
      modelUsage: {
        'claude-sonnet': {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadInputTokens: 50,
          cacheCreationInputTokens: 10,
          costUSD: 0.3,
        },
        'claude-haiku': {
          inputTokens: 5,
          outputTokens: 2,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUSD: 0.12,
        },
      },
      session_id: 'sess-9',
    });
    expect(sdkMessageToEvents(result)).toEqual([
      {
        type: 'result',
        output: 'done',
        structured: { prompt: 'p' },
        cost: { usd: 0.42, inputTokens: 165, outputTokens: 22 },
        sessionId: 'sess-9',
      },
    ]);
  });

  it('falls back to usage when modelUsage is empty', () => {
    const result = message({
      type: 'result',
      subtype: 'success',
      result: '',
      total_cost_usd: 0.1,
      usage: {
        input_tokens: 7,
        output_tokens: 3,
        cache_read_input_tokens: 2,
        cache_creation_input_tokens: 1,
      },
      modelUsage: {},
    });
    expect(costOfResult(result as Extract<SDKMessage, { type: 'result' }>)).toEqual({
      usd: 0.1,
      inputTokens: 10,
      outputTokens: 3,
    });
  });

  it('maps an error result to an error event', () => {
    const events = sdkMessageToEvents(
      message({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: ['boom', 'again'],
        total_cost_usd: 0,
        usage: {},
        modelUsage: {},
      }),
    );
    expect(events).toEqual([
      { type: 'error', message: 'Engine error (error_during_execution): boom; again' },
    ]);
  });
});

describe('SubAgentTracker', () => {
  /** Feeds SDK messages through `sdkMessageToEvents` and the tracker, as the Engine does. */
  function play(messages: Record<string, unknown>[]) {
    const tracker = new SubAgentTracker();
    return messages.flatMap((m) => {
      const sdk = message(m);
      return tracker.track(sdk, sdkMessageToEvents(sdk));
    });
  }
  const call = (id: string, subagentType?: string) => ({
    type: 'assistant',
    parent_tool_use_id: null,
    message: {
      content: [
        {
          type: 'tool_use',
          id,
          name: 'Agent',
          input: { prompt: 'Do it.', ...(subagentType && { subagent_type: subagentType }) },
        },
      ],
    },
  });
  const inside = (parent: string, text: string) => ({
    type: 'assistant',
    parent_tool_use_id: parent,
    message: {
      content: [
        { type: 'text', text },
        { type: 'tool_use', id: `${parent}-bash`, name: 'Bash', input: { command: 'ls' } },
      ],
    },
  });
  const insideResult = (parent: string) => ({
    type: 'user',
    parent_tool_use_id: parent,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: `${parent}-bash`, content: 'a.txt' }],
    },
  });
  const returned = (id: string, isError = false) => ({
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: id, content: 'Report.', is_error: isError }],
    },
  });

  it('turns one call into called, marked work and returned', () => {
    const marker = { name: 'unit-tests', callId: 'c1' };
    expect(
      play([
        call('c1', 'unit-tests'),
        inside('c1', 'Testing.'),
        insideResult('c1'),
        returned('c1'),
      ]),
    ).toEqual([
      {
        type: 'tool_call',
        id: 'c1',
        name: 'Agent',
        input: { prompt: 'Do it.', subagent_type: 'unit-tests' },
      },
      { type: 'sub_agent_called', callId: 'c1', name: 'unit-tests' },
      { type: 'text', text: 'Testing.', agent: marker },
      { type: 'tool_call', id: 'c1-bash', name: 'Bash', input: { command: 'ls' }, agent: marker },
      {
        type: 'tool_result',
        toolCallId: 'c1-bash',
        output: 'a.txt',
        isError: false,
        agent: marker,
      },
      { type: 'tool_result', toolCallId: 'c1', output: 'Report.', isError: false },
      { type: 'sub_agent_returned', callId: 'c1', name: 'unit-tests', isError: false },
    ]);
  });

  it('keeps two calls at once apart and reports an error return', () => {
    const events = play([
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            { type: 'tool_use', id: 'a', name: 'Agent', input: { subagent_type: 'unit-tests' } },
            { type: 'tool_use', id: 'b', name: 'Agent', input: { subagent_type: 'browser-tests' } },
          ],
        },
      },
      inside('b', 'Browser.'),
      inside('a', 'Unit.'),
      returned('b', true),
      returned('a'),
    ]);
    const neutral = events.filter((e) => e.type.startsWith('sub_agent'));
    expect(neutral).toEqual([
      { type: 'sub_agent_called', callId: 'a', name: 'unit-tests' },
      { type: 'sub_agent_called', callId: 'b', name: 'browser-tests' },
      { type: 'sub_agent_returned', callId: 'b', name: 'browser-tests', isError: true },
      { type: 'sub_agent_returned', callId: 'a', name: 'unit-tests', isError: false },
    ]);
    expect(events.find((e) => e.type === 'text' && e.text === 'Browser.')).toMatchObject({
      agent: { name: 'browser-tests', callId: 'b' },
    });
  });

  it("names a call without a type after the Engine's general agent and leaves other tools alone", () => {
    const events = play([
      call('g'),
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: { content: [{ type: 'tool_use', id: 't', name: 'Read', input: {} }] },
      },
      returned('t'),
      returned('g'),
    ]);
    expect(events.filter((e) => e.type.startsWith('sub_agent'))).toEqual([
      { type: 'sub_agent_called', callId: 'g', name: 'general-purpose' },
      { type: 'sub_agent_returned', callId: 'g', name: 'general-purpose', isError: false },
    ]);
  });

  it('attributes the work of a nested call to the outermost agent', () => {
    const events = play([
      call('outer', 'general-purpose'),
      {
        type: 'assistant',
        parent_tool_use_id: 'outer',
        message: { content: [{ type: 'tool_use', id: 'inner', name: 'Agent', input: {} }] },
      },
      inside('inner', 'Deep.'),
    ]);
    expect(events.find((e) => e.type === 'text')).toMatchObject({
      agent: { name: 'general-purpose', callId: 'outer' },
    });
    expect(events.filter((e) => e.type === 'sub_agent_called')).toHaveLength(1);
  });
});
