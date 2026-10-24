import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { costOfResult, sdkMessageToEvents } from '../src/events.js';

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
      sdkMessageToEvents(message({ type: 'system', subtype: 'init', cwd: '/', tools: [] })),
    ).toEqual([]);
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
