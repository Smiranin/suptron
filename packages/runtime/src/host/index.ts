import type { CiStatus, MergeStatus, PullRequestRef } from '../domain/host.js';
import type { HealthStatus } from '../engine/index.js';

export type { CiStatus, MergeStatus, PullRequestRef } from '../domain/host.js';

export interface CreateDraftPullRequestArgs {
  checkoutPath: string;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
  labels?: string[];
  reviewers?: string[];
}

export interface FindPullRequestArgs {
  checkoutPath: string;
  branch: string;
}

export interface RepoHost {
  createDraftPullRequest(args: CreateDraftPullRequestArgs): Promise<PullRequestRef>;
  findPullRequest(args: FindPullRequestArgs): Promise<PullRequestRef | null>;
  getCiStatus(pr: PullRequestRef, checkoutPath: string): Promise<CiStatus>;
  countUnresolvedReviewThreads(pr: PullRequestRef, checkoutPath: string): Promise<number>;
  getMergeStatus(pr: PullRequestRef, checkoutPath: string): Promise<MergeStatus>;
  healthCheck(): Promise<HealthStatus>;
}
