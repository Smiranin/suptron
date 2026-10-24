import { randomUUID } from 'node:crypto';
import {
  query,
  type Options,
  type PermissionResult,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentEvent,
  AgentHandle,
  AgentSpec,
  Answers,
  Engine,
  HealthStatus,
  ModelInfo,
  Question,
} from '@suptron/runtime';
import { AsyncQueue, Deferred, withTimeout } from './async-queue.js';
import { sdkMessageToEvents } from './events.js';
import { lawsHooks } from './hooks.js';
import { guardEnv, installShims } from './shim.js';

export const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'sonnet', displayName: 'Claude Sonnet' },
  { id: 'opus', displayName: 'Claude Opus' },
  { id: 'haiku', displayName: 'Claude Haiku' },
];

const ASK_USER_QUESTION = 'AskUserQuestion';
/** The Core answers in one or two turns; a few more cover structured-output retries. */
const CORE_MAX_TURNS = 6;
const HEALTH_TIMEOUT_MS = 60_000;
const MODELS_TIMEOUT_MS = 20_000;

export interface ClaudeEngineOptions {
  /** Passed through to the SDK; the bundled binary is used when omitted. */
  pathToClaudeCodeExecutable?: string;
  /** Replaces `process.env` as the base environment of every agent (tests). */
  env?: NodeJS.ProcessEnv;
}

/** Turns the AskUserQuestion tool input into the runtime's Question shape. */
export function parseQuestions(input: Record<string, unknown>): Question[] {
  const raw = Array.isArray(input.questions) ? (input.questions as Record<string, unknown>[]) : [];
  return raw.map((q) => ({
    question: String(q.question ?? ''),
    header: String(q.header ?? ''),
    multiSelect: q.multiSelect === true,
    options: (Array.isArray(q.options) ? (q.options as Record<string, unknown>[]) : []).map(
      (o) => ({
        label: String(o.label ?? ''),
        description: String(o.description ?? ''),
      }),
    ),
  }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class ClaudeAgentHandle implements AgentHandle {
  private readonly out = new AsyncQueue<AgentEvent>();
  private readonly prompt = new Deferred<string>();
  private readonly inputDone = new Deferred<void>();
  private readonly session = new Deferred<string>();
  private readonly abort = new AbortController();
  private active: Query | null = null;
  private started = false;
  private interrupted = false;
  private stderrTail = '';
  readonly sessionId: Promise<string>;

  constructor(
    private readonly spec: AgentSpec,
    private readonly engineOptions: ClaudeEngineOptions,
  ) {
    this.sessionId = this.session.promise;
  }

  send(prompt: string): void {
    this.prompt.resolve(prompt);
  }

  events(): AsyncIterable<AgentEvent> {
    if (!this.started) {
      this.started = true;
      void this.pump();
    }
    return this.out;
  }

  async interrupt(): Promise<void> {
    this.interrupted = true;
    try {
      await this.active?.interrupt();
    } catch {
      // The abort below is the fallback when the control request cannot be delivered.
    }
    this.finish();
  }

  async close(): Promise<void> {
    this.interrupted = true;
    this.finish();
  }

  private finish(): void {
    this.inputDone.resolve();
    this.abort.abort();
    this.out.close();
    if (!this.session.isSettled)
      this.session.reject(new Error('The agent ended before a session id was known'));
  }

  /** Streaming-input mode: exactly one user turn, then the iterable stays open until the result. */
  private async *input(): AsyncIterable<SDKUserMessage> {
    const text = await this.prompt.promise;
    yield { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null };
    await this.inputDone.promise;
  }

  private canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResult> => {
    if (toolName !== ASK_USER_QUESTION) return { behavior: 'allow', updatedInput: input };
    return new Promise<PermissionResult>((resolve) => {
      this.out.push({
        type: 'question',
        id: randomUUID(),
        questions: parseQuestions(input),
        respond: (answers: Answers) =>
          resolve({ behavior: 'allow', updatedInput: { ...input, answers } }),
        dismiss: () =>
          resolve({ behavior: 'deny', message: 'The Mission was stopped', interrupt: true }),
      });
    });
  };

  private async buildOptions(): Promise<Options> {
    const spec = this.spec;
    const shims = await installShims();
    const base = this.engineOptions.env ?? process.env;
    const env: Options['env'] = { ...base, ...shims.env, ...guardEnv(spec.guard) };
    const options: Options = {
      cwd: spec.cwd,
      model: spec.model,
      additionalDirectories: spec.additionalDirectories,
      env,
      abortController: this.abort,
      persistSession: true,
      settingSources: ['project'],
      hooks: { PreToolUse: lawsHooks(spec.guard, spec.cwd) },
      canUseTool: this.canUseTool,
      stderr: (data) => {
        this.stderrTail = (this.stderrTail + data).slice(-2000);
      },
      ...(spec.resumeSessionId !== undefined && { resume: spec.resumeSessionId }),
      ...(this.engineOptions.pathToClaudeCodeExecutable !== undefined && {
        pathToClaudeCodeExecutable: this.engineOptions.pathToClaudeCodeExecutable,
      }),
    };
    const systemText = `${spec.systemPrompt.rules.trim()}\n\n${spec.systemPrompt.instructions.trim()}`;
    if (spec.role === 'pilot') {
      options.systemPrompt = { type: 'preset', preset: 'claude_code', append: systemText };
      // Not bypassPermissions: that mode auto-approves before canUseTool is consulted, so a
      // Pilot's AskUserQuestion would never reach the Commander. acceptEdits auto-approves file
      // edits and routes everything else through canUseTool, which allows all but questions.
      options.permissionMode = 'acceptEdits';
      if (!spec.allowQuestions) options.disallowedTools = [ASK_USER_QUESTION];
    } else {
      options.systemPrompt = systemText;
      options.tools = [];
      options.disallowedTools = [ASK_USER_QUESTION];
      options.maxTurns = CORE_MAX_TURNS;
      if (spec.outputSchema)
        options.outputFormat = { type: 'json_schema', schema: spec.outputSchema };
    }
    return options;
  }

  private async pump(): Promise<void> {
    try {
      const options = await this.buildOptions();
      const active = query({ prompt: this.input(), options });
      this.active = active;
      for await (const message of active as AsyncIterable<SDKMessage>) {
        if (this.interrupted) break;
        if (
          'session_id' in message &&
          typeof message.session_id === 'string' &&
          message.session_id
        ) {
          this.session.resolve(message.session_id);
        }
        for (const event of sdkMessageToEvents(message)) this.out.push(event);
        if (message.type === 'result') break;
      }
    } catch (error) {
      if (!this.interrupted) {
        const tail = this.stderrTail.trim();
        this.out.push({
          type: 'error',
          message: `Engine failed: ${errorMessage(error)}${tail ? `\n${tail}` : ''}`,
        });
      }
    } finally {
      this.finish();
    }
  }
}

/** The Engine on the Claude Agent SDK; the only place the SDK is imported. */
export class ClaudeEngine implements Engine {
  constructor(private readonly options: ClaudeEngineOptions = {}) {}

  createAgent(spec: AgentSpec): AgentHandle {
    return new ClaudeAgentHandle(spec, this.options);
  }

  private baseOptions(abort: AbortController): Options {
    return {
      abortController: abort,
      persistSession: false,
      tools: [],
      permissionMode: 'default',
      ...(this.options.env !== undefined && { env: { ...this.options.env } }),
      ...(this.options.pathToClaudeCodeExecutable !== undefined && {
        pathToClaudeCodeExecutable: this.options.pathToClaudeCodeExecutable,
      }),
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    const abort = new AbortController();
    // A prompt that never arrives: the query only has to initialise to answer supportedModels().
    const silent: AsyncIterable<SDKUserMessage> = {
      [Symbol.asyncIterator]: () => ({
        next: () =>
          new Promise((resolve) =>
            abort.signal.addEventListener('abort', () => resolve({ value: undefined, done: true })),
          ),
      }),
    };
    try {
      const active = query({
        prompt: silent,
        options: { ...this.baseOptions(abort), maxTurns: 1 },
      });
      const models = await withTimeout(
        active.supportedModels(),
        MODELS_TIMEOUT_MS,
        'supportedModels',
      );
      const mapped = models
        .filter((m) => typeof m.value === 'string' && m.value !== '')
        .map((m) => ({ id: m.value, displayName: m.displayName || m.value }));
      return mapped.length > 0 ? mapped : FALLBACK_MODELS;
    } catch {
      return FALLBACK_MODELS;
    } finally {
      abort.abort();
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const abort = new AbortController();
    let stderrTail = '';
    const run = async (): Promise<HealthStatus> => {
      const active = query({
        prompt: 'Reply with the single word OK.',
        options: {
          ...this.baseOptions(abort),
          maxTurns: 1,
          systemPrompt: 'You are a connectivity check. Reply with the single word OK.',
          stderr: (data) => {
            stderrTail = (stderrTail + data).slice(-1000);
          },
        },
      });
      for await (const message of active as AsyncIterable<SDKMessage>) {
        if (message.type !== 'result') continue;
        if (message.subtype === 'success') return { ok: true };
        const detail = message.errors.length > 0 ? message.errors.join('; ') : message.subtype;
        return { ok: false, reason: detail };
      }
      return { ok: false, reason: 'The Engine ended without a result' };
    };
    try {
      return await withTimeout(run(), HEALTH_TIMEOUT_MS, 'Engine health check');
    } catch (error) {
      const tail = stderrTail.trim();
      return { ok: false, reason: `${errorMessage(error)}${tail ? `: ${tail}` : ''}` };
    } finally {
      abort.abort();
    }
  }
}
