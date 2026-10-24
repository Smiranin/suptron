export interface Checkout {
  path: string;
  /** null when HEAD is detached. */
  branch: string | null;
  isMainWorktree: boolean;
}

export interface RemoteDefaults {
  remoteUrl: string | null;
  headBranch: string | null;
}

/** Read-only by design: the system never writes to a repository. */
export interface GitClient {
  listCheckouts(repositoryPath: string): Promise<Checkout[]>;
  currentBranch(checkoutPath: string): Promise<string | null>;
  readRemoteDefaults(repositoryPath: string, remote?: string): Promise<RemoteDefaults>;
  /** `git diff --stat` of the working tree and HEAD against `baseBranch`, for the Core's judgment. */
  diffSummary(checkoutPath: string, baseBranch: string): Promise<string>;
}
