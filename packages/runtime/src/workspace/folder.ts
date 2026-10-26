import type { PullRequestRef } from '../domain/host.js';
import { capabilitiesOf, type Capability, type WorkspaceSummary } from './kinds.js';
import type { Workspace } from './workspace.js';

/** A fixed directory; git inside it is ignored. Busy while one Mission works in it. */
export class FolderWorkspace implements Workspace {
  readonly kind = 'folder';
  readonly capabilities: ReadonlySet<Capability>;
  readonly cwd: string;
  readonly writeRoots: readonly string[];
  readonly protectedBranch = null;
  readonly busyKey: string;
  readonly summary: WorkspaceSummary;
  readonly repository = null;
  readonly host = null;

  /** `busyKey` is the folder's realpath, so a symlink and its target count as one folder. */
  constructor(path: string, busyKey: string) {
    this.capabilities = capabilitiesOf({ kind: 'folder', path });
    this.cwd = path;
    this.writeRoots = [path];
    this.busyKey = busyKey;
    this.summary = { kind: 'folder', path, branch: null };
  }

  get fragment(): string {
    return `Workspace folder: ${this.cwd}. Work and write results inside it.`;
  }

  gitConventions(): string | null {
    return null;
  }

  async refresh(): Promise<void> {}

  async changeSummary(): Promise<string | null> {
    return null;
  }

  async pullRequest(): Promise<PullRequestRef | null> {
    return null;
  }
}
