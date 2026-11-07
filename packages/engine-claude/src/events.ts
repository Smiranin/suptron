import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ActivityPhase, AgentEvent, Cost } from '@suptron/runtime';

/** The content block shapes we read; structural so the Anthropic SDK types are not imported. */
interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

/** The structured-output pseudo tool is the Core's answer, not a tool call worth showing. */
const STRUCTURED_OUTPUT_TOOL = 'StructuredOutput';

function blocksOf(content: unknown): ContentBlock[] {
  return Array.isArray(content) ? (content as ContentBlock[]) : [];
}

/** Tool results arrive as a string or as text blocks; both become one string. */
export function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as ContentBlock[])
      .map((block) =>
        block.type === 'text' && typeof block.text === 'string'
          ? block.text
          : JSON.stringify(block),
      )
      .join('\n');
  }
  if (content === undefined || content === null) return '';
  return JSON.stringify(content);
}

/** Sums the per-model usage of a result into one Cost; cache tokens count as input tokens. */
export function costOfResult(result: SDKResultMessage): Cost {
  const perModel = Object.values(result.modelUsage ?? {});
  if (perModel.length > 0) {
    return perModel.reduce<Cost>(
      (sum, usage) => ({
        usd: sum.usd,
        inputTokens:
          sum.inputTokens +
          usage.inputTokens +
          (usage.cacheCreationInputTokens ?? 0) +
          (usage.cacheReadInputTokens ?? 0),
        outputTokens: sum.outputTokens + usage.outputTokens,
      }),
      { usd: result.total_cost_usd ?? 0, inputTokens: 0, outputTokens: 0 },
    );
  }
  const usage = (result.usage ?? {}) as unknown as Partial<Record<string, number>>;
  return {
    usd: result.total_cost_usd ?? 0,
    inputTokens:
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0),
    outputTokens: usage.output_tokens ?? 0,
  };
}

/** The streaming frames we read for signs of life; structural, like `ContentBlock`. */
interface StreamFrame {
  type: string;
  content_block?: { type: string; name?: string };
  delta?: { type: string };
}

/** The phase a streaming frame reveals, or null for frames that say nothing about it. */
function activityOf(frame: StreamFrame): Extract<AgentEvent, { type: 'activity' }> | null {
  if (frame.type === 'content_block_start' && frame.content_block) {
    const block = frame.content_block;
    if (block.type === 'thinking' || block.type === 'redacted_thinking') {
      return { type: 'activity', phase: 'thinking' };
    }
    if (block.type === 'text') return { type: 'activity', phase: 'writing' };
    if (block.type === 'tool_use') {
      return {
        type: 'activity',
        phase: 'tool',
        ...(block.name !== undefined && { detail: block.name }),
      };
    }
    return null;
  }
  if (frame.type === 'content_block_delta' && frame.delta) {
    const phase: ActivityPhase | null =
      frame.delta.type === 'thinking_delta'
        ? 'thinking'
        : frame.delta.type === 'text_delta'
          ? 'writing'
          : frame.delta.type === 'input_json_delta'
            ? 'tool'
            : null;
    return phase === null ? null : { type: 'activity', phase };
  }
  return null;
}

/** Maps one SDK message to zero or more AgentEvents. Messages we do not show yield nothing. */
export function sdkMessageToEvents(message: SDKMessage): AgentEvent[] {
  switch (message.type) {
    case 'stream_event': {
      // Only with `includePartialMessages`: a frame per content block and per delta.
      const activity = activityOf(message.event as unknown as StreamFrame);
      return activity ? [activity] : [];
    }
    case 'system': {
      // The CLI estimates thinking progress while the model thinks (no stream frame yet).
      return message.subtype === 'thinking_tokens' ? [{ type: 'activity', phase: 'thinking' }] : [];
    }
    case 'assistant': {
      const events: AgentEvent[] = [];
      for (const block of blocksOf(message.message.content)) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text !== '') {
          events.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use' && block.name !== STRUCTURED_OUTPUT_TOOL) {
          events.push({
            type: 'tool_call',
            id: block.id ?? '',
            name: block.name ?? '',
            input: block.input,
          });
        }
      }
      return events;
    }
    case 'user': {
      const events: AgentEvent[] = [];
      for (const block of blocksOf(message.message.content)) {
        if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
          events.push({
            type: 'tool_result',
            toolCallId: block.tool_use_id,
            output: stringifyToolResult(block.content),
            isError: block.is_error === true,
          });
        }
      }
      return events;
    }
    case 'result': {
      if (message.subtype === 'success') {
        return [
          {
            type: 'result',
            output: message.result,
            ...(message.structured_output !== undefined && {
              structured: message.structured_output,
            }),
            cost: costOfResult(message),
            sessionId: message.session_id,
          },
        ];
      }
      const detail = message.errors.length > 0 ? message.errors.join('; ') : message.subtype;
      return [{ type: 'error', message: `Engine error (${message.subtype}): ${detail}` }];
    }
    default:
      return [];
  }
}
