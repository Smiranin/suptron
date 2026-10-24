import type { Cost } from '../domain/cost.js';
import type { Answers, Question } from '../domain/transcript.js';
import type {
  AgentEvent,
  AgentHandle,
  AgentSpec,
  Engine,
  HealthStatus,
  ModelInfo,
} from '../engine/index.js';
import { exec } from '../process/exec.js';

export type FakeStep =
  | { text: string }
  | { toolCall: { name: string; input: unknown }; result?: { output: string; isError?: boolean } }
  /** Runs a shell command in the agent's cwd (to make real commits in a temp repository). */
  | { shell: string }
  /** Asks the Commander and waits for the answer. */
  | { question: Question[] }
  | { result: { output?: string; structured?: unknown; cost?: Partial<Cost> } }
  | { error: string }
  | { delay: number }
  /** Holds the agent until the promise resolves (for Stop tests). */
  | { wait: Promise<unknown> };

export interface FakeCall {
  key: string;
  spec: AgentSpec;
  prompt: string;
  /** How many times this key was called before. */
  index: number;
  sessionId: string;
  answers: Answers[];
  interrupted: boolean;
  dismissed: boolean;
}

export type FakeScript = FakeStep[] | ((call: FakeCall) => FakeStep[]);

export const DEFAULT_FAKE_COST: Cost = { usd: 0.01, inputTokens: 100, outputTokens: 50 };

export function scriptKey(role: AgentSpec['role'], label: string): string {
  return `${role}:${label}`;
}

/** The name of the Core call, read from the first line of the Core prompt (`# Core call: judge`). */
export function coreCallName(prompt: string): string | null {
  const match = /^# Core call: (\w+)/.exec(prompt);
  return match ? match[1]! : null;
}

/** Returns the JSON payload of a Core prompt, which CoreAgent appends in a ```json block. */
export function coreCallInput(prompt: string): unknown {
  const match = /```json\n([\s\S]*?)\n```/.exec(prompt);
  return match ? JSON.parse(match[1]!) : null;
}

/** A Core that composes a trivial prompt, judges everything as holding, and reports briefly. */
export function defaultCoreScript(call: FakeCall): FakeStep[] {
  const name = coreCallName(call.prompt);
  const input = coreCallInput(call.prompt) as Record<string, unknown> | null;
  switch (name) {
    case 'composeSlotPrompt': {
      const slot = (input?.slot as { name?: string } | undefined)?.name ?? 'slot';
      return [{ result: { structured: { prompt: `Do the work of ${slot}.` } } }];
    }
    case 'judge':
      return [{ result: { structured: { holds: true, reason: 'Looks fine.' } } }];
    case 'explainNeedsAttention':
      return [
        {
          result: {
            structured: { reason: `The Mission needs attention: ${String(input?.cause)}.` },
          },
        },
      ];
    case 'finalReport':
      return [{ result: { structured: { report: 'All Slots completed.' } } }];
    default:
      return [{ error: `Unknown Core call in prompt: ${call.prompt.slice(0, 80)}` }];
  }
}

class Deferred<T> {
  resolve!: (value: T) => void;
  reject!: (error: unknown) => void;
  readonly promise = new Promise<T>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
}

class Interrupted extends Error {
  constructor() {
    super('interrupted');
  }
}

class FakeAgentHandle implements AgentHandle {
  private readonly session = new Deferred<string>();
  private prompt: string | null = null;
  private pending: Deferred<void> | null = null;
  private interrupted = false;
  private readonly abort = new AbortController();
  readonly sessionId: Promise<string>;

  constructor(
    private readonly engine: FakeEngine,
    private readonly spec: AgentSpec,
    private readonly sessionIdValue: string,
  ) {
    this.sessionId = this.session.promise;
    this.session.resolve(sessionIdValue);
  }

  send(prompt: string): void {
    this.prompt = prompt;
  }

  async interrupt(): Promise<void> {
    this.interrupted = true;
    this.abort.abort();
    this.pending?.reject(new Interrupted());
  }

  async close(): Promise<void> {}

  async *events(): AsyncIterable<AgentEvent> {
    if (this.prompt === null) throw new Error('FakeEngine: send() must be called before events()');
    const key = scriptKey(this.spec.role, this.spec.label);
    const call: FakeCall = {
      key,
      spec: this.spec,
      prompt: this.prompt,
      index: this.engine.calls.filter((c) => c.key === key).length,
      sessionId: this.sessionIdValue,
      answers: [],
      interrupted: false,
      dismissed: false,
    };
    this.engine.calls.push(call);
    const script = this.engine.scriptFor(this.spec);
    const steps = typeof script === 'function' ? script(call) : script;
    try {
      for (const step of steps) {
        if (this.interrupted) break;
        if ('text' in step) {
          yield { type: 'text', text: step.text };
        } else if ('toolCall' in step) {
          const id = `tool-${this.engine.nextId()}`;
          yield { type: 'tool_call', id, name: step.toolCall.name, input: step.toolCall.input };
          yield {
            type: 'tool_result',
            toolCallId: id,
            output: step.result?.output ?? '',
            isError: step.result?.isError ?? false,
          };
        } else if ('shell' in step) {
          const id = `tool-${this.engine.nextId()}`;
          yield { type: 'tool_call', id, name: 'Bash', input: { command: step.shell } };
          const result = await exec('sh', ['-c', step.shell], {
            cwd: this.spec.cwd,
            signal: this.abort.signal,
          });
          yield {
            type: 'tool_result',
            toolCallId: id,
            output: (result.stdout + result.stderr).trim(),
            isError: result.code !== 0,
          };
          if (result.code !== 0) {
            yield {
              type: 'error',
              message: `FakeEngine shell step failed: ${step.shell}\n${result.stderr}`,
            };
            return;
          }
        } else if ('question' in step) {
          const pending = new Deferred<void>();
          this.pending = pending;
          const id = `q-${this.engine.nextId()}`;
          yield {
            type: 'question',
            id,
            questions: step.question,
            respond: (answers) => {
              call.answers.push(answers);
              pending.resolve();
            },
            dismiss: () => {
              call.dismissed = true;
              pending.reject(new Interrupted());
            },
          };
          await pending.promise;
          this.pending = null;
        } else if ('result' in step) {
          yield {
            type: 'result',
            output: step.result.output ?? '',
            ...(step.result.structured !== undefined && { structured: step.result.structured }),
            cost: { ...DEFAULT_FAKE_COST, ...step.result.cost },
            sessionId: this.sessionIdValue,
          };
          return;
        } else if ('error' in step) {
          yield { type: 'error', message: step.error };
          return;
        } else if ('delay' in step) {
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, step.delay);
            this.abort.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(t);
                reject(new Interrupted());
              },
              { once: true },
            );
          });
        } else if ('wait' in step) {
          const pending = new Deferred<void>();
          this.pending = pending;
          void step.wait.then(
            () => pending.resolve(),
            (e) => pending.reject(e),
          );
          await pending.promise;
          this.pending = null;
        }
      }
    } catch (error) {
      if (error instanceof Interrupted) {
        call.interrupted = true;
        return;
      }
      throw error;
    }
    if (this.interrupted) call.interrupted = true;
  }
}

/**
 * A scripted Engine: a test registers a script per `role:label` and the handle plays it.
 * Every created agent, its prompt and its answers are recorded in `calls` for assertions.
 */
export class FakeEngine implements Engine {
  readonly calls: FakeCall[] = [];
  readonly scripts = new Map<string, FakeScript>();
  models: ModelInfo[] = [
    { id: 'sonnet', displayName: 'Claude Sonnet' },
    { id: 'opus', displayName: 'Claude Opus' },
  ];
  health: HealthStatus = { ok: true };
  private counter = 0;
  /** Scripts for Pilots without a registered script. */
  defaultPilotScript: FakeScript = (call) => [
    { text: `Working on ${call.spec.label}.` },
    { result: { output: `${call.spec.label} output` } },
  ];
  defaultCoreScript: FakeScript = defaultCoreScript;

  nextId(): number {
    return ++this.counter;
  }

  script(role: AgentSpec['role'], label: string, script: FakeScript): this {
    this.scripts.set(scriptKey(role, label), script);
    return this;
  }

  /** Convenience: a Pilot that emits one text and finishes with `output`. */
  pilot(label: string, output: string, extra: FakeStep[] = []): this {
    return this.script('pilot', label, [
      { text: `Working on ${label}.` },
      ...extra,
      { result: { output } },
    ]);
  }

  scriptFor(spec: AgentSpec): FakeScript {
    return (
      this.scripts.get(scriptKey(spec.role, spec.label)) ??
      (spec.role === 'core' ? this.defaultCoreScript : this.defaultPilotScript)
    );
  }

  callsFor(role: AgentSpec['role'], label: string): FakeCall[] {
    const key = scriptKey(role, label);
    return this.calls.filter((c) => c.key === key);
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.models;
  }

  async healthCheck(): Promise<HealthStatus> {
    return this.health;
  }

  createAgent(spec: AgentSpec): AgentHandle {
    const sessionId = spec.resumeSessionId ?? `fake-session-${this.nextId()}`;
    return new FakeAgentHandle(this, spec, sessionId);
  }
}
