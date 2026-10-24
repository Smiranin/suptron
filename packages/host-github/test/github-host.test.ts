import { readFile } from 'node:fs/promises';
import type { ExecFn, ExecResult } from '@suptron/runtime';
import { describe, expect, it } from 'vitest';
import {
  GitHubHost,
  parsePullRequestUrl,
  reduceChecks,
  REVIEW_THREADS_QUERY,
} from '../src/index.js';

type Canned =
  | Partial<ExecResult>
  | ((args: readonly string[]) => Partial<ExecResult> | Promise<Partial<ExecResult>>);

interface Recorded {
  program: string;
  args: readonly string[];
  cwd: string | undefined;
}

/** An ExecFn that records every call and answers from a queue of canned results. */
function fakeExec(queue: Canned[]): { run: ExecFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const run: ExecFn = async (program, args, options) => {
    calls.push({ program, args, cwd: options?.cwd });
    const next = queue.shift();
    if (next === undefined) throw new Error(`unexpected call: ${program} ${args.join(' ')}`);
    const partial = typeof next === 'function' ? await next(args) : next;
    return { code: 0, stdout: '', stderr: '', timedOut: false, aborted: false, ...partial };
  };
  return { run, calls };
}

const pr = { number: 12, url: 'https://github.com/o/r/pull/12' };

describe('createDraftPullRequest', () => {
  it('builds the gh argv, writes the body file and parses the URL', async () => {
    let body = '';
    const { run, calls } = fakeExec([
      async (args) => {
        body = await readFile(args[args.indexOf('--body-file') + 1]!, 'utf8');
        return {
          stdout:
            'Creating draft pull request for feature/x into main in o/r\n\nhttps://github.com/o/r/pull/12\n',
        };
      },
    ]);
    const host = new GitHubHost(run);
    const ref = await host.createDraftPullRequest({
      checkoutPath: '/work/repo',
      branch: 'feature/x',
      baseBranch: 'main',
      title: 'Add login',
      body: '## Add login\n',
      labels: ['feature'],
      reviewers: ['alice'],
    });
    expect(ref).toEqual(pr);
    expect(body).toBe('## Add login\n');
    const call = calls[0]!;
    expect(call.program).toBe('gh');
    expect(call.cwd).toBe('/work/repo');
    const bodyFile = call.args[call.args.indexOf('--body-file') + 1];
    expect(call.args).toEqual([
      'pr',
      'create',
      '--draft',
      '--base',
      'main',
      '--head',
      'feature/x',
      '--title',
      'Add login',
      '--body-file',
      bodyFile,
      '--label',
      'feature',
      '--reviewer',
      'alice',
    ]);
  });

  it('throws with gh output when creation fails', async () => {
    const { run } = fakeExec([{ code: 1, stderr: 'a pull request already exists' }]);
    await expect(
      new GitHubHost(run).createDraftPullRequest({
        checkoutPath: '/w',
        branch: 'b',
        baseBranch: 'main',
        title: 't',
        body: '',
      }),
    ).rejects.toThrow(/already exists/);
  });
});

describe('parsePullRequestUrl', () => {
  it('takes the last URL line', () => {
    expect(parsePullRequestUrl('noise\nhttps://github.com/o/r/pull/7\n')).toEqual({
      number: 7,
      url: 'https://github.com/o/r/pull/7',
    });
    expect(() => parsePullRequestUrl('nothing here')).toThrow(/did not print/);
  });
});

describe('findPullRequest', () => {
  it('returns the PR of the branch', async () => {
    const { run, calls } = fakeExec([{ stdout: JSON.stringify(pr) }]);
    const found = await new GitHubHost(run).findPullRequest({
      checkoutPath: '/w',
      branch: 'feature/x',
    });
    expect(found).toEqual(pr);
    expect(calls[0]).toEqual({
      program: 'gh',
      args: ['pr', 'view', 'feature/x', '--json', 'number,url'],
      cwd: '/w',
    });
  });

  it('returns null when there is no PR and throws on other errors', async () => {
    const { run } = fakeExec([
      { code: 1, stderr: 'no pull requests found for branch "feature/x"' },
      { code: 1, stderr: 'HTTP 401: Bad credentials' },
    ]);
    const host = new GitHubHost(run);
    expect(await host.findPullRequest({ checkoutPath: '/w', branch: 'feature/x' })).toBeNull();
    await expect(host.findPullRequest({ checkoutPath: '/w', branch: 'feature/x' })).rejects.toThrow(
      /401/,
    );
  });
});

describe('getCiStatus', () => {
  const rows = (buckets: string[]) =>
    JSON.stringify(buckets.map((bucket, i) => ({ name: `c${i}`, state: 'X', bucket })));

  it('uses the exact argv', async () => {
    const { run, calls } = fakeExec([{ stdout: rows(['pass']) }]);
    await new GitHubHost(run).getCiStatus(pr, '/w');
    expect(calls[0]).toEqual({
      program: 'gh',
      args: ['pr', 'checks', '12', '--json', 'name,state,bucket'],
      cwd: '/w',
    });
  });

  it.each([
    ['none', { stdout: '[]' }],
    ['none', { code: 1, stdout: '', stderr: "no checks reported on the 'feature/x' branch" }],
    ['pending', { code: 8, stdout: rows(['pass', 'pending']) }],
    ['failure', { code: 1, stdout: rows(['pass', 'fail', 'pending']) }],
    ['success', { stdout: rows(['pass', 'skipping']) }],
  ] as [string, Partial<ExecResult>][])('reduces to %s', async (expected, result) => {
    const { run } = fakeExec([result]);
    expect(await new GitHubHost(run).getCiStatus(pr, '/w')).toBe(expected);
  });

  it('throws on an unexpected failure without output', async () => {
    const { run } = fakeExec([{ code: 4, stderr: 'HTTP 500' }]);
    await expect(new GitHubHost(run).getCiStatus(pr, '/w')).rejects.toThrow(/500/);
  });

  it('reduceChecks treats cancelled as failure', () => {
    expect(reduceChecks([{ bucket: 'cancel' }])).toBe('failure');
  });
});

describe('countUnresolvedReviewThreads', () => {
  const page = (resolved: boolean[], next: string | null) =>
    JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: resolved.map((isResolved) => ({ isResolved })),
              pageInfo: { hasNextPage: next !== null, endCursor: next },
            },
          },
        },
      },
    });

  it('paginates and caches the repository lookup', async () => {
    const { run, calls } = fakeExec([
      { stdout: JSON.stringify({ owner: { login: 'o' }, name: 'r' }) },
      { stdout: page([true, false], 'CURSOR1') },
      { stdout: page([false, false], null) },
      { stdout: page([true], null) },
    ]);
    const host = new GitHubHost(run);
    expect(await host.countUnresolvedReviewThreads(pr, '/w')).toBe(3);
    expect(calls[0]).toEqual({
      program: 'gh',
      args: ['repo', 'view', '--json', 'owner,name'],
      cwd: '/w',
    });
    expect(calls[1]).toEqual({
      program: 'gh',
      args: [
        'api',
        'graphql',
        '-f',
        `query=${REVIEW_THREADS_QUERY}`,
        '-F',
        'owner=o',
        '-F',
        'name=r',
        '-F',
        'number=12',
      ],
      cwd: '/w',
    });
    expect(calls[2]!.args.slice(-2)).toEqual(['-F', 'cursor=CURSOR1']);
    expect(await host.countUnresolvedReviewThreads(pr, '/w')).toBe(0);
    expect(calls.filter((c) => c.args[0] === 'repo')).toHaveLength(1);
  });
});

describe('healthCheck', () => {
  it('reports ok on gh auth status success', async () => {
    const { run, calls } = fakeExec([{ stdout: 'Logged in to github.com' }]);
    expect(await new GitHubHost(run).healthCheck()).toEqual({ ok: true });
    expect(calls[0]!.args).toEqual(['auth', 'status']);
  });

  it('reports the reason on failure or a missing gh', async () => {
    const { run } = fakeExec([
      { code: 1, stderr: 'You are not logged into any GitHub hosts.' },
      () => {
        throw new Error('spawn gh ENOENT');
      },
    ]);
    const host = new GitHubHost(run);
    expect(await host.healthCheck()).toEqual({
      ok: false,
      reason: 'gh is not authenticated: You are not logged into any GitHub hosts.',
    });
    const missing = await host.healthCheck();
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toMatch(/ENOENT/);
  });
});
