import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  exec as defaultExec,
  type CiStatus,
  type CreateDraftPullRequestArgs,
  type ExecFn,
  type ExecResult,
  type FindPullRequestArgs,
  type HealthStatus,
  type PullRequestRef,
  type RepoHost,
} from '@suptron/runtime';

export interface GitHubHostOptions {
  /** The `gh` binary; defaults to the one on PATH. */
  ghPath?: string;
}

const PR_URL = /https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/(\d+)/;
const TIMEOUT_MS = 60_000;

interface CheckRow {
  name?: string;
  state?: string;
  bucket?: 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel' | string;
}

interface ReviewThreadsPage {
  data?: {
    repository?: {
      pullRequest?: {
        reviewThreads?: {
          nodes?: { isResolved: boolean }[];
          pageInfo?: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    };
  };
}

export const REVIEW_THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        nodes { isResolved }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

function describeFailure(result: ExecResult): string {
  return result.stderr.trim() || result.stdout.trim() || `exit code ${String(result.code)}`;
}

/** Reduces the rows of `gh pr checks --json` to one status. */
export function reduceChecks(rows: readonly CheckRow[]): CiStatus {
  if (rows.length === 0) return 'none';
  if (rows.some((r) => r.bucket === 'fail' || r.bucket === 'cancel')) return 'failure';
  if (rows.some((r) => r.bucket === 'pending')) return 'pending';
  return 'success';
}

/** RepoHost on the GitHub CLI, so the Commander's existing `gh` authentication is used. */
export class GitHubHost implements RepoHost {
  private readonly gh: string;
  private readonly repoCache = new Map<string, { owner: string; name: string }>();

  constructor(
    private readonly run: ExecFn = defaultExec,
    options: GitHubHostOptions = {},
  ) {
    this.gh = options.ghPath ?? 'gh';
  }

  private exec(args: readonly string[], cwd?: string): Promise<ExecResult> {
    return this.run(this.gh, args, { ...(cwd !== undefined && { cwd }), timeoutMs: TIMEOUT_MS });
  }

  async createDraftPullRequest(args: CreateDraftPullRequestArgs): Promise<PullRequestRef> {
    const dir = await mkdtemp(join(tmpdir(), 'suptron-pr-'));
    const bodyFile = join(dir, 'body.md');
    try {
      await writeFile(bodyFile, args.body, 'utf8');
      const argv = [
        'pr',
        'create',
        '--draft',
        '--base',
        args.baseBranch,
        '--head',
        args.branch,
        '--title',
        args.title,
        '--body-file',
        bodyFile,
      ];
      for (const label of args.labels ?? []) argv.push('--label', label);
      for (const reviewer of args.reviewers ?? []) argv.push('--reviewer', reviewer);
      const result = await this.exec(argv, args.checkoutPath);
      if (result.code !== 0) {
        throw new Error(`gh pr create failed: ${describeFailure(result)}`);
      }
      return parsePullRequestUrl(result.stdout);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async findPullRequest(args: FindPullRequestArgs): Promise<PullRequestRef | null> {
    const result = await this.exec(
      ['pr', 'view', args.branch, '--json', 'number,url'],
      args.checkoutPath,
    );
    if (result.code !== 0) {
      if (/no pull requests found/i.test(result.stderr + result.stdout)) return null;
      throw new Error(`gh pr view failed: ${describeFailure(result)}`);
    }
    const parsed = JSON.parse(result.stdout) as { number: number; url: string };
    return { number: parsed.number, url: parsed.url };
  }

  async getCiStatus(pr: PullRequestRef, checkoutPath: string): Promise<CiStatus> {
    // `gh pr checks` exits 8 while checks are pending and 1 when some failed; the JSON is still there.
    const result = await this.exec(
      ['pr', 'checks', String(pr.number), '--json', 'name,state,bucket'],
      checkoutPath,
    );
    const stdout = result.stdout.trim();
    if (stdout === '') {
      if (result.code === 0 || /no checks reported/i.test(result.stderr)) return 'none';
      throw new Error(`gh pr checks failed: ${describeFailure(result)}`);
    }
    let rows: CheckRow[];
    try {
      rows = JSON.parse(stdout) as CheckRow[];
    } catch {
      throw new Error(`gh pr checks returned unexpected output: ${stdout.slice(0, 200)}`);
    }
    return reduceChecks(rows);
  }

  async countUnresolvedReviewThreads(pr: PullRequestRef, checkoutPath: string): Promise<number> {
    const { owner, name } = await this.repoOf(checkoutPath);
    let cursor: string | null = null;
    let unresolved = 0;
    for (;;) {
      const argv = [
        'api',
        'graphql',
        '-f',
        `query=${REVIEW_THREADS_QUERY}`,
        '-F',
        `owner=${owner}`,
        '-F',
        `name=${name}`,
        '-F',
        `number=${pr.number}`,
      ];
      if (cursor !== null) argv.push('-F', `cursor=${cursor}`);
      const result = await this.exec(argv, checkoutPath);
      if (result.code !== 0) {
        throw new Error(`gh api graphql failed: ${describeFailure(result)}`);
      }
      const page = JSON.parse(result.stdout) as ReviewThreadsPage;
      const threads = page.data?.repository?.pullRequest?.reviewThreads;
      if (!threads) throw new Error('gh api graphql returned no reviewThreads');
      unresolved += (threads.nodes ?? []).filter((t) => !t.isResolved).length;
      const info = threads.pageInfo;
      if (!info?.hasNextPage || !info.endCursor) return unresolved;
      cursor = info.endCursor;
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    let result: ExecResult;
    try {
      result = await this.exec(['auth', 'status']);
    } catch (error) {
      return { ok: false, reason: `gh is not available: ${String(error)}` };
    }
    if (result.code === 0) return { ok: true };
    return { ok: false, reason: `gh is not authenticated: ${describeFailure(result)}` };
  }

  private async repoOf(checkoutPath: string): Promise<{ owner: string; name: string }> {
    const cached = this.repoCache.get(checkoutPath);
    if (cached) return cached;
    const result = await this.exec(['repo', 'view', '--json', 'owner,name'], checkoutPath);
    if (result.code !== 0) throw new Error(`gh repo view failed: ${describeFailure(result)}`);
    const parsed = JSON.parse(result.stdout) as { owner: { login: string }; name: string };
    const repo = { owner: parsed.owner.login, name: parsed.name };
    this.repoCache.set(checkoutPath, repo);
    return repo;
  }
}

/** The PR URL is the last line `gh pr create` prints; the number is its last path segment. */
export function parsePullRequestUrl(stdout: string): PullRequestRef {
  const lines = stdout.trim().split('\n').reverse();
  for (const line of lines) {
    const match = PR_URL.exec(line.trim());
    if (match) return { number: Number(match[1]), url: match[0] };
  }
  throw new Error(`gh pr create did not print a Pull Request URL: ${stdout.trim().slice(0, 200)}`);
}
