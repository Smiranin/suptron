import { spawn } from 'node:child_process';

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Written to stdin, then stdin is closed. */
  input?: string;
}

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
}

export type ExecFn = (
  program: string,
  args: readonly string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

const MAX_OUTPUT = 4 * 1024 * 1024;

/** Runs a program without a shell, captures its output and kills it on timeout or abort. */
export const exec: ExecFn = (program, args, options = {}) =>
  new Promise<ExecResult>((resolve, reject) => {
    const child = spawn(program, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    const append = (current: string, chunk: Buffer) =>
      current.length > MAX_OUTPUT ? current : current + chunk.toString('utf8');
    child.stdout.on('data', (chunk: Buffer) => (stdout = append(stdout, chunk)));
    child.stderr.on('data', (chunk: Buffer) => (stderr = append(stderr, chunk)));

    const timer =
      options.timeoutMs !== undefined
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, options.timeoutMs)
        : undefined;
    const onAbort = () => {
      aborted = true;
      child.kill('SIGKILL');
    };
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener('abort', onAbort, { once: true });

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    };
    child.on('error', (error) => {
      cleanup();
      reject(error);
    });
    child.on('close', (code) => {
      cleanup();
      resolve({ code, stdout, stderr, timedOut, aborted });
    });
    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
  });

export class ExecError extends Error {
  constructor(
    readonly program: string,
    readonly args: readonly string[],
    readonly result: ExecResult,
  ) {
    super(
      `${program} ${args.join(' ')} failed with code ${String(result.code)}: ${result.stderr.trim() || result.stdout.trim()}`,
    );
    this.name = 'ExecError';
  }
}

/** Like `exec` but rejects on a non-zero exit code. */
export async function execOk(
  program: string,
  args: readonly string[],
  options?: ExecOptions,
  run: ExecFn = exec,
): Promise<ExecResult> {
  const result = await run(program, args, options);
  if (result.code !== 0) throw new ExecError(program, args, result);
  return result;
}
