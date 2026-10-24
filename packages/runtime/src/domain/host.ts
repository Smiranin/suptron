export interface PullRequestRef {
  number: number;
  url: string;
}

export type CiStatus = 'pending' | 'success' | 'failure' | 'none';
