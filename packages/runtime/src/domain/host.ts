export interface PullRequestRef {
  number: number;
  url: string;
}

export type CiStatus = 'pending' | 'success' | 'failure' | 'none';

/** Whether the Pull Request merges into its base without conflicts; `unknown` while the host computes it. */
export type MergeStatus = 'mergeable' | 'conflicting' | 'unknown';
