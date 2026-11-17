import { describe, expect, it } from 'vitest';
import type { CoreAgent } from '../src/core-agent/index.js';
import type { MergeStatus, PullRequestRef } from '../src/domain/host.js';
import { runCheck, type CheckContext } from '../src/checks/runners.js';
import type { HostFacet, Workspace } from '../src/workspace/workspace.js';

const pr: PullRequestRef = { number: 7, url: 'https://github.test/o/r/pull/7' };

/** A Workspace on branch `feature/x` whose PR answers mergeability from a queue. */
function context(statuses: MergeStatus[], overrides: Partial<CheckContext> = {}): CheckContext {
  const host: HostFacet = {
    ciWaitTimeoutMs: 1000,
    findPullRequest: async () => pr,
    ciStatus: async () => 'none',
    unresolvedThreads: async () => 0,
    // The last status repeats, so a host that never answers stays `unknown`.
    mergeStatus: async () => (statuses.length > 1 ? statuses.shift()! : statuses[0]!),
  };
  const workspace = {
    host,
    repository: { currentBranch: async () => 'feature/x' },
  } as unknown as Workspace;
  return {
    workspace,
    core: {} as CoreAgent,
    slotOutput: '',
    subPilotsReturned: new Set(),
    ciPollIntervalMs: 1,
    mergeableWaitMs: 1000,
    ...overrides,
  };
}

describe('pr_mergeable', () => {
  const check = { kind: 'pr_mergeable' } as const;

  it('holds when the Pull Request merges without conflicts', async () => {
    const result = await runCheck(check, context(['mergeable']));
    expect(result).toMatchObject({ holds: true, detail: '#7 merges without conflicts' });
  });

  it('fails on a conflict, without a timeout', async () => {
    const result = await runCheck(check, context(['conflicting']));
    expect(result.holds).toBe(false);
    expect(result.timedOut).toBeUndefined();
    expect(result.detail).toBe('#7 has conflicts with its base branch');
  });

  it('waits while the host still computes mergeability', async () => {
    const result = await runCheck(check, context(['unknown', 'unknown', 'conflicting']));
    expect(result).toMatchObject({ holds: false, detail: '#7 has conflicts with its base branch' });
  });

  it('times out when the host never answers', async () => {
    const result = await runCheck(check, context(['unknown'], { mergeableWaitMs: 0 }));
    expect(result).toMatchObject({ holds: false, timedOut: true });
    expect(result.detail).toMatch(/still unknown/);
  });
});
