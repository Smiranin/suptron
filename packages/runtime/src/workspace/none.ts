import type { PullRequestRef } from '../domain/host.js';
import { capabilitiesOf, type Capability, type WorkspaceSummary } from './kinds.js';
import type { Workspace } from './workspace.js';

/** No folder of its own: the Mission folder is the working directory and the one write root. */
export class NoneWorkspace implements Workspace {
  readonly kind = 'none';
  readonly capabilities: ReadonlySet<Capability> = capabilitiesOf({ kind: 'none' });
  readonly cwd: string;
  readonly writeRoots: readonly string[];
  readonly protectedBranch = null;
  /** Never busy: any number of Missions may run on such a Project (SPEC FR-10). */
  readonly busyKey = null;
  readonly summary: WorkspaceSummary = { kind: 'none', path: null, branch: null };
  readonly repository = null;
  readonly host = null;

  constructor(missionDir: string) {
    this.cwd = missionDir;
    this.writeRoots = [missionDir];
  }

  get fragment(): string {
    return `No Workspace. The working directory is the Mission folder ${this.cwd}; write results next to the Task.`;
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
