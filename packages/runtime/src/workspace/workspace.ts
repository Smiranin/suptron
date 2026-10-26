import type { ProfileFile } from '../config/schemas.js';
import type { CiStatus, PullRequestRef } from '../domain/host.js';
import type { GuardContext } from '../engine/index.js';
import type { GitClient } from '../git/types.js';
import type { RepoHost } from '../host/index.js';
import type { MissionValues } from '../templates/index.js';
import type { Capability, WorkspaceKind, WorkspaceSummary } from './kinds.js';

export type { WorkspaceSummary } from './kinds.js';

/** The host side of a `repository` Workspace, for the `pr_*` and `ci_green` Checks. */
export interface HostFacet {
  ciWaitTimeoutMs: number;
  /** The Pull Request of the current branch; null when there is none or HEAD is detached. */
  findPullRequest(): Promise<PullRequestRef | null>;
  ciStatus(pr: PullRequestRef): Promise<CiStatus>;
  unresolvedThreads(pr: PullRequestRef): Promise<number>;
}

/** The git side of a `repository` Workspace. */
export interface RepositoryFacet {
  checkoutPath: string;
  protectedBranch: string;
  currentBranch(): Promise<string | null>;
}

/**
 * Where a Mission works, resolved from the Profile at start (ADR-0005). The Runner, the Checks,
 * the Laws and the report ask the instance and never the kind: the kind is switched on exactly
 * once, in `openWorkspace`.
 */
export interface Workspace {
  readonly kind: WorkspaceKind;
  readonly capabilities: ReadonlySet<Capability>;
  /** The Engine's working directory (SPEC FR-12). */
  readonly cwd: string;
  /** The Laws allow writes here, plus the Task location (SPEC FR-13). */
  readonly writeRoots: readonly string[];
  /** For the Laws on commands; null when the Workspace knows no protected branch. */
  readonly protectedBranch: string | null;
  /** Two active Missions never share a non-null key (SPEC FR-10). */
  readonly busyKey: string | null;
  /** The Workspace's own context fragment, always in the Core's bundle (SPEC FR-15). */
  readonly fragment: string;
  /** For the screens; refreshed by `refresh()` (SPEC FR-18). */
  readonly summary: WorkspaceSummary;
  readonly repository: RepositoryFacet | null;
  readonly host: HostFacet | null;
  /** The rendered Git conventions for a repository, null otherwise. */
  gitConventions(values: MissionValues): string | null;
  /** Re-reads what may have changed during a Slot (the branch); a no-op otherwise. */
  refresh(): Promise<void>;
  /** The diff against the protected branch for the Core's judgment, null otherwise (SPEC FR-14). */
  changeSummary(): Promise<string | null>;
  /** The Pull Request of the current branch through the host facet; null otherwise or on error (SPEC FR-16). */
  pullRequest(): Promise<PullRequestRef | null>;
}

export interface OpenWorkspaceInput {
  /** The Mission folder, created before the Workspace is opened; the working directory of kind `none`. */
  missionDir: string;
  checkoutPath?: string;
}

export interface OpenWorkspaceDeps {
  git: GitClient;
  host: RepoHost;
}

export type WorkspaceIssueField = 'checkoutPath' | 'workspace';

/** The start input does not fit the Profile's Workspace (a missing or foreign Checkout, a missing folder). */
export class WorkspaceOpenError extends Error {
  constructor(readonly issues: { field: WorkspaceIssueField; message: string }[]) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
    this.name = 'WorkspaceOpenError';
  }
}

export type OpenWorkspace = (
  profile: ProfileFile,
  input: OpenWorkspaceInput,
  deps: OpenWorkspaceDeps,
) => Promise<Workspace>;

export interface GuardLocations {
  /** Defaults to the Workspace's working directory; the Core runs in the Task folder instead. */
  cwd?: string;
  taskPath: string;
  configHome: string;
}

/** The Laws' view of a Workspace: its working directory, write roots and protected branch. */
export function buildGuard(workspace: Workspace, locations: GuardLocations): GuardContext {
  return {
    cwd: locations.cwd ?? workspace.cwd,
    writeRoots: [...workspace.writeRoots],
    protectedBranch: workspace.protectedBranch,
    taskPath: locations.taskPath,
    configHome: locations.configHome,
  };
}
