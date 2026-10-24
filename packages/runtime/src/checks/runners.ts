import type { Check, CheckResult } from '../domain/check.js';
import type { CoreAgent } from '../core-agent/index.js';
import type { GitClient } from '../git/types.js';
import type { RepoHost } from '../host/index.js';
import { exec as defaultExec, type ExecFn } from '../process/exec.js';

export const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_CI_POLL_INTERVAL_MS = 15_000;
/** How long `ci_green` tolerates "no checks" before concluding the repository has no CI. */
export const DEFAULT_CI_NONE_GRACE_MS = 2 * 60 * 1000;

export interface CheckContext {
  checkoutPath: string;
  protectedBranch: string;
  host: RepoHost;
  git: GitClient;
  core: CoreAgent;
  slotOutput: string;
  ciWaitTimeoutMs: number;
  ciPollIntervalMs?: number;
  ciNoneGraceMs?: number;
  commandTimeoutMs?: number;
  signal?: AbortSignal;
  exec?: ExecFn;
}

export type CheckRunner = (check: Check, ctx: CheckContext) => Promise<CheckResult>;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', done);
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

function tail(text: string, lines = 40): string {
  const all = text.trim().split('\n');
  return all.slice(-lines).join('\n');
}

const runCommand: CheckRunner = async (check, ctx) => {
  if (check.kind !== 'command') throw new Error('wrong runner');
  const run = ctx.exec ?? defaultExec;
  const timeoutMs =
    check.timeoutSeconds !== undefined
      ? check.timeoutSeconds * 1000
      : (ctx.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS);
  const result = await run('sh', ['-c', check.command], {
    cwd: ctx.checkoutPath,
    timeoutMs,
    ...(ctx.signal && { signal: ctx.signal }),
  });
  const output = tail(`${result.stdout}\n${result.stderr}`);
  if (result.aborted) return { check, holds: false, detail: 'interrupted' };
  if (result.timedOut) {
    return { check, holds: false, detail: `Timed out after ${timeoutMs / 1000}s\n${output}` };
  }
  return {
    check,
    holds: result.code === 0,
    detail:
      result.code === 0
        ? `Exit code 0${output ? `\n${output}` : ''}`
        : `Exit code ${String(result.code)}\n${output}`,
  };
};

async function currentPullRequest(ctx: CheckContext) {
  const branch = await ctx.git.currentBranch(ctx.checkoutPath);
  if (branch === null) return { branch: null, pr: null };
  const pr = await ctx.host.findPullRequest({ checkoutPath: ctx.checkoutPath, branch });
  return { branch, pr };
}

const runPrExists: CheckRunner = async (check, ctx) => {
  const { branch, pr } = await currentPullRequest(ctx);
  if (branch === null) return { check, holds: false, detail: 'The Checkout is on a detached HEAD' };
  return pr
    ? { check, holds: true, detail: `Pull Request #${pr.number}: ${pr.url}` }
    : { check, holds: false, detail: `No Pull Request found for branch ${branch}` };
};

const runPrNoOpenComments: CheckRunner = async (check, ctx) => {
  const { branch, pr } = await currentPullRequest(ctx);
  if (!pr) {
    return {
      check,
      holds: false,
      detail: branch ? `No Pull Request found for branch ${branch}` : 'Detached HEAD',
    };
  }
  const count = await ctx.host.countUnresolvedReviewThreads(pr, ctx.checkoutPath);
  return count === 0
    ? { check, holds: true, detail: `No unresolved review threads on #${pr.number}` }
    : { check, holds: false, detail: `${count} unresolved review thread(s) on #${pr.number}` };
};

const runCiGreen: CheckRunner = async (check, ctx) => {
  const { branch, pr } = await currentPullRequest(ctx);
  if (!pr) {
    return {
      check,
      holds: false,
      detail: branch ? `No Pull Request found for branch ${branch}` : 'Detached HEAD',
    };
  }
  const interval = ctx.ciPollIntervalMs ?? DEFAULT_CI_POLL_INTERVAL_MS;
  const grace = ctx.ciNoneGraceMs ?? DEFAULT_CI_NONE_GRACE_MS;
  const started = Date.now();
  for (;;) {
    if (ctx.signal?.aborted) return { check, holds: false, detail: 'interrupted' };
    const status = await ctx.host.getCiStatus(pr, ctx.checkoutPath);
    const elapsed = Date.now() - started;
    if (status === 'success') return { check, holds: true, detail: `CI green on #${pr.number}` };
    if (status === 'failure') return { check, holds: false, detail: `CI failed on #${pr.number}` };
    if (status === 'none' && elapsed >= grace) {
      return { check, holds: true, detail: `No CI checks reported on #${pr.number}` };
    }
    if (elapsed >= ctx.ciWaitTimeoutMs) {
      return {
        check,
        holds: false,
        timedOut: true,
        detail: `CI still ${status} after ${Math.round(ctx.ciWaitTimeoutMs / 60000)} minutes on #${pr.number}`,
      };
    }
    await sleep(interval, ctx.signal);
  }
};

const runLlmJudgment: CheckRunner = async (check, ctx) => {
  if (check.kind !== 'llm_judgment') throw new Error('wrong runner');
  const diffSummary = await ctx.git.diffSummary(ctx.checkoutPath, ctx.protectedBranch);
  const verdict = await ctx.core.judge({
    criterion: check.criterion,
    slotOutput: ctx.slotOutput,
    diffSummary,
  });
  return { check, holds: verdict.holds, detail: verdict.reason };
};

export const CHECK_RUNNERS: Record<Check['kind'], CheckRunner> = {
  command: runCommand,
  pr_exists: runPrExists,
  pr_no_open_comments: runPrNoOpenComments,
  ci_green: runCiGreen,
  llm_judgment: runLlmJudgment,
};

export function runCheck(check: Check, ctx: CheckContext): Promise<CheckResult> {
  return CHECK_RUNNERS[check.kind](check, ctx);
}

export interface ConditionResult {
  holds: boolean;
  results: CheckResult[];
  timedOut: boolean;
}

/** Runs the Checks in order and stops at the first failure. An empty condition holds. */
export async function evaluateCondition(
  condition: readonly Check[],
  ctx: CheckContext,
  onResult?: (result: CheckResult) => void,
  run: (check: Check, ctx: CheckContext) => Promise<CheckResult> = runCheck,
): Promise<ConditionResult> {
  const results: CheckResult[] = [];
  for (const check of condition) {
    const result = await run(check, ctx);
    results.push(result);
    onResult?.(result);
    if (!result.holds) return { holds: false, results, timedOut: result.timedOut === true };
  }
  return { holds: true, results, timedOut: false };
}
