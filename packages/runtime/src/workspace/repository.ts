import type { RepositoryWorkspaceFile } from '../config/schemas.js';
import type { CiStatus, PullRequestRef } from '../domain/host.js';
import type { GitClient } from '../git/types.js';
import type { RepoHost } from '../host/index.js';
import { renderGitConventions, type MissionValues } from '../templates/index.js';
import { capabilitiesOf, type Capability, type WorkspaceSummary } from './kinds.js';
import type { HostFacet, RepositoryFacet, Workspace } from './workspace.js';

const MS_PER_MINUTE = 60_000;

/** One Checkout of a git repository, with the Git conventions, the diff and the host behind it. */
export class RepositoryWorkspace implements Workspace {
  readonly kind = 'repository';
  readonly capabilities: ReadonlySet<Capability>;
  readonly cwd: string;
  readonly writeRoots: readonly string[];
  readonly protectedBranch: string;
  readonly busyKey: string;
  readonly repository: RepositoryFacet;
  readonly host: HostFacet | null;
  private branch: string | null;

  constructor(
    private readonly file: RepositoryWorkspaceFile,
    readonly checkoutPath: string,
    busyKey: string,
    branch: string | null,
    private readonly git: GitClient,
    host: RepoHost,
  ) {
    this.capabilities = capabilitiesOf(file);
    this.cwd = checkoutPath;
    this.writeRoots = [checkoutPath];
    this.protectedBranch = file.protectedBranch;
    this.busyKey = busyKey;
    this.branch = branch;
    this.repository = {
      checkoutPath,
      protectedBranch: file.protectedBranch,
      currentBranch: () => git.currentBranch(checkoutPath),
    };
    this.host = this.capabilities.has('host') ? this.hostFacet(host) : null;
  }

  get summary(): WorkspaceSummary {
    return { kind: 'repository', path: this.checkoutPath, branch: this.branch };
  }

  get fragment(): string {
    const branch = this.branch ?? '(detached HEAD)';
    return `Checkout: ${this.checkoutPath} on branch ${branch}. Protected branch: ${this.protectedBranch}; never commit to it.`;
  }

  gitConventions(values: MissionValues): string {
    return renderGitConventions(this.file, values);
  }

  async refresh(): Promise<void> {
    try {
      this.branch = await this.git.currentBranch(this.checkoutPath);
    } catch {
      // keep the last known branch
    }
  }

  changeSummary(): Promise<string | null> {
    return this.git.diffSummary(this.checkoutPath, this.protectedBranch);
  }

  async pullRequest(): Promise<PullRequestRef | null> {
    if (!this.host) return null;
    try {
      return await this.host.findPullRequest();
    } catch {
      return null;
    }
  }

  private hostFacet(host: RepoHost): HostFacet {
    const checkoutPath = this.checkoutPath;
    return {
      ciWaitTimeoutMs: this.file.ciWaitTimeoutMinutes * MS_PER_MINUTE,
      findPullRequest: async (): Promise<PullRequestRef | null> => {
        const branch = await this.git.currentBranch(checkoutPath);
        return branch === null ? null : host.findPullRequest({ checkoutPath, branch });
      },
      ciStatus: (pr: PullRequestRef): Promise<CiStatus> => host.getCiStatus(pr, checkoutPath),
      unresolvedThreads: (pr: PullRequestRef): Promise<number> =>
        host.countUnresolvedReviewThreads(pr, checkoutPath),
    };
  }
}
