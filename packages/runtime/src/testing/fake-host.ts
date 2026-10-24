import type { CiStatus, PullRequestRef } from '../domain/host.js';
import type { HealthStatus } from '../engine/index.js';
import type { CreateDraftPullRequestArgs, FindPullRequestArgs, RepoHost } from '../host/index.js';

export interface FakePullRequest extends PullRequestRef {
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
  labels: string[];
  reviewers: string[];
  ci: CiStatus;
  unresolvedThreads: number;
}

/** An in-memory RepoHost: tests create PRs, set CI status and thread counts between steps. */
export class FakeHost implements RepoHost {
  readonly pullRequests = new Map<number, FakePullRequest>();
  readonly calls: { method: string; args: unknown }[] = [];
  health: HealthStatus = { ok: true };
  private nextNumber = 1;

  seedPullRequest(branch: string, overrides: Partial<FakePullRequest> = {}): FakePullRequest {
    const number = overrides.number ?? this.nextNumber++;
    const pr: FakePullRequest = {
      number,
      url: `https://github.test/o/r/pull/${number}`,
      branch,
      baseBranch: 'main',
      title: '',
      body: '',
      labels: [],
      reviewers: [],
      ci: 'none',
      unresolvedThreads: 0,
      ...overrides,
    };
    this.pullRequests.set(number, pr);
    return pr;
  }

  byBranch(branch: string): FakePullRequest | null {
    for (const pr of this.pullRequests.values()) if (pr.branch === branch) return pr;
    return null;
  }

  setCiStatus(number: number, ci: CiStatus): void {
    const pr = this.pullRequests.get(number);
    if (!pr) throw new Error(`No PR #${number}`);
    pr.ci = ci;
  }

  setUnresolvedThreads(number: number, count: number): void {
    const pr = this.pullRequests.get(number);
    if (!pr) throw new Error(`No PR #${number}`);
    pr.unresolvedThreads = count;
  }

  async createDraftPullRequest(args: CreateDraftPullRequestArgs): Promise<PullRequestRef> {
    this.calls.push({ method: 'createDraftPullRequest', args });
    const pr = this.seedPullRequest(args.branch, {
      baseBranch: args.baseBranch,
      title: args.title,
      body: args.body,
      labels: args.labels ?? [],
      reviewers: args.reviewers ?? [],
    });
    return { number: pr.number, url: pr.url };
  }

  async findPullRequest(args: FindPullRequestArgs): Promise<PullRequestRef | null> {
    this.calls.push({ method: 'findPullRequest', args });
    const pr = this.byBranch(args.branch);
    return pr ? { number: pr.number, url: pr.url } : null;
  }

  async getCiStatus(ref: PullRequestRef): Promise<CiStatus> {
    this.calls.push({ method: 'getCiStatus', args: ref });
    return this.pullRequests.get(ref.number)?.ci ?? 'none';
  }

  async countUnresolvedReviewThreads(ref: PullRequestRef): Promise<number> {
    this.calls.push({ method: 'countUnresolvedReviewThreads', args: ref });
    return this.pullRequests.get(ref.number)?.unresolvedThreads ?? 0;
  }

  async healthCheck(): Promise<HealthStatus> {
    return this.health;
  }
}
