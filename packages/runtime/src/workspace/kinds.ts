// Browser-safe: the kind → capabilities mapping the editors, the validator and the runtime share.
// Nothing here may import a `node:` module (re-exported from browser.ts).
import type { WorkspaceFile } from '../config/schemas.js';

export type WorkspaceKind = WorkspaceFile['kind'];

/** What a Workspace kind provides; Checks and context sources declare what they need. */
export type Capability = 'files' | 'git' | 'host';

export interface WorkspaceKindInfo {
  kind: WorkspaceKind;
  label: string;
  description: string;
}

/** The three kinds in the order the Profile form offers them. */
export const WORKSPACE_KINDS: readonly WorkspaceKindInfo[] = [
  {
    kind: 'none',
    label: 'No folder',
    description: 'The Mission works in its own Mission folder; nothing to pick at Launch.',
  },
  {
    kind: 'folder',
    label: 'Folder',
    description: 'A fixed directory; git inside it is ignored. One Mission at a time.',
  },
  {
    kind: 'repository',
    label: 'Repository',
    description: 'A git repository; a Mission runs in one of its Checkouts.',
  },
];

export function workspaceKindLabel(kind: WorkspaceKind): string {
  return WORKSPACE_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

/** none → {}, folder → {files}, repository → {files, git} plus host unless the host is `none` (SPEC FR-5). */
export function capabilitiesOf(workspace: WorkspaceFile): ReadonlySet<Capability> {
  switch (workspace.kind) {
    case 'none':
      return new Set();
    case 'folder':
      return new Set<Capability>(['files']);
    case 'repository':
      return new Set<Capability>(
        workspace.host === 'none' ? ['files', 'git'] : ['files', 'git', 'host'],
      );
  }
}

export type ContextSource = 'taskDocuments' | 'knowledgeSources' | 'gitConventions' | 'slotOutputs';

/** Only the Git conventions depend on the Workspace (SPEC FR-6). */
export const CONTEXT_SOURCE_REQUIREMENTS: Readonly<Record<ContextSource, readonly Capability[]>> = {
  taskDocuments: [],
  knowledgeSources: [],
  gitConventions: ['git'],
  slotOutputs: [],
};

export function missingCapabilities(
  required: readonly Capability[],
  provided: ReadonlySet<Capability>,
): Capability[] {
  return required.filter((c) => !provided.has(c));
}

/** How a missing capability reads in a validation message: "needs a host", "needs git". */
export function describeCapability(capability: Capability): string {
  switch (capability) {
    case 'files':
      return 'a folder';
    case 'git':
      return 'git';
    case 'host':
      return 'a host';
  }
}

/** What a Mission knows about its Workspace for the screens; refreshed after every Slot (FR-18). */
export interface WorkspaceSummary {
  kind: WorkspaceKind;
  /** The Checkout or the folder; null for kind `none`. */
  path: string | null;
  /** The Checkout's current branch; null otherwise or on a detached HEAD. */
  branch: string | null;
}
