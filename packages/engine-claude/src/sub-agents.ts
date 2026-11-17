import type { AgentDefinition, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent, AgentMarker, SubAgentSpec } from '@suptron/runtime';

/** The sub-agent tool of Claude Code. */
export const AGENT_TOOL = 'Agent';
export const ASK_USER_QUESTION = 'AskUserQuestion';
/** What Claude Code runs when an `Agent` call names no `subagent_type`. */
const DEFAULT_SUBAGENT_TYPE = 'general-purpose';

/** A Sub-pilot neither nests agents nor reaches the Commander; it answers to its Pilot only. */
export const SUB_PILOT_DISALLOWED_TOOLS: readonly string[] = [AGENT_TOOL, ASK_USER_QUESTION];

/**
 * Appended to a Sub-pilot's own system text: who reads its final message and that it cannot
 * ask anybody anything.
 */
export const SUB_PILOT_PROMPT = `## You are a Sub-pilot

A Pilot called you for one part of its work; the Pilot alone reads what you write and
answers for it. Nobody else is watching and you cannot ask anybody anything: where you
would wait for an answer, decide yourself and say so. Do your part, then end with a short
report of what you did and what is left: that last message is what the Pilot receives.`;

/** The system text of a Sub-pilot: its Rules, its Instructions and what being one means. */
export function subAgentSystemText(sub: SubAgentSpec): string {
  return [sub.systemPrompt.rules.trim(), sub.systemPrompt.instructions.trim(), SUB_PILOT_PROMPT]
    .filter((part) => part !== '')
    .join('\n\n');
}

/** The SDK's agent definitions, keyed by the name the Pilot calls each Sub-pilot by. */
export function agentDefinitions(
  subAgents: readonly SubAgentSpec[],
): Record<string, AgentDefinition> {
  return Object.fromEntries(
    subAgents.map((sub) => [
      sub.name,
      {
        description: sub.description,
        prompt: subAgentSystemText(sub),
        model: sub.model,
        disallowedTools: [...SUB_PILOT_DISALLOWED_TOOLS],
      },
    ]),
  );
}

/**
 * Appended to a Pilot's system text when it has Sub-pilots: who they are, how to call them, and
 * which ones every Attempt must call.
 */
export function subPilotsPrompt(subAgents: readonly SubAgentSpec[]): string {
  const lines = subAgents.map(
    (sub) =>
      `- \`${sub.name}\`: ${sub.description}${sub.required ? ' (required: call it in every Attempt and wait for its return)' : ''}`,
  );
  return `## Your Sub-pilots

You may hand parts of your work to these agents with the ${AGENT_TOOL} tool, giving the
name as \`subagent_type\`. Call several in one message to have them work at the same time,
and wait for each to return. You answer for what they do.

${lines.join('\n')}`;
}

/**
 * Follows the agents a Pilot calls through the SDK messages of its session: an `Agent` tool call
 * of the Pilot is a call, its top-level result is the return, and every message whose
 * `parent_tool_use_id` names a call came from inside that agent. A call made inside a called
 * agent is attributed to the outermost one.
 */
export class SubAgentTracker {
  private readonly calls = new Map<string, AgentMarker>();

  /** The events of one SDK message, marked and completed with the calls and returns they show. */
  track(message: SDKMessage, events: readonly AgentEvent[]): AgentEvent[] {
    const parentId = 'parent_tool_use_id' in message ? message.parent_tool_use_id : null;
    const parent = parentId ? this.calls.get(parentId) : undefined;
    const out: AgentEvent[] = [];
    for (const event of events) {
      if (parent) {
        if (event.type === 'tool_call' && event.name === AGENT_TOOL) {
          this.calls.set(event.id, parent);
        }
        out.push(
          event.type === 'text' || event.type === 'tool_call' || event.type === 'tool_result'
            ? { ...event, agent: parent }
            : event,
        );
        continue;
      }
      out.push(event);
      if (event.type === 'tool_call' && event.name === AGENT_TOOL) {
        const name = calledName(event.input);
        this.calls.set(event.id, { name, callId: event.id });
        out.push({ type: 'sub_agent_called', callId: event.id, name });
      } else if (event.type === 'tool_result') {
        const call = this.calls.get(event.toolCallId);
        if (call?.callId === event.toolCallId) {
          out.push({
            type: 'sub_agent_returned',
            callId: call.callId,
            name: call.name,
            isError: event.isError,
          });
        }
      }
    }
    return out;
  }
}

/** The agent an `Agent` tool call names, or Claude Code's default one. */
function calledName(input: unknown): string {
  const type =
    input !== null && typeof input === 'object'
      ? (input as Record<string, unknown>).subagent_type
      : undefined;
  return typeof type === 'string' && type !== '' ? type : DEFAULT_SUBAGENT_TYPE;
}
