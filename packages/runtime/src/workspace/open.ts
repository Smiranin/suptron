import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ProfileFile, WorkspaceFile } from '../config/schemas.js';
import { canonicalPath } from '../laws/paths.js';
import { FolderWorkspace } from './folder.js';
import { NoneWorkspace } from './none.js';
import { RepositoryWorkspace } from './repository.js';
import {
  WorkspaceOpenError,
  type OpenWorkspaceDeps,
  type OpenWorkspaceInput,
  type Workspace,
} from './workspace.js';

/** The key two Missions must not share: a folder or Checkout reached through any symlink counts once. */
export function busyKeyOf(path: string): string {
  return canonicalPath(path);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function noCheckouts(workspace: WorkspaceFile, input: OpenWorkspaceInput): void {
  if (input.checkoutPath !== undefined) {
    throw new WorkspaceOpenError([
      {
        field: 'checkoutPath',
        message: `This Project has no Checkouts (its Workspace is ${describe(workspace)})`,
      },
    ]);
  }
}

function describe(workspace: WorkspaceFile): string {
  return workspace.kind === 'none' ? 'no folder' : `a ${workspace.kind}`;
}

async function openRepository(
  workspace: Extract<WorkspaceFile, { kind: 'repository' }>,
  input: OpenWorkspaceInput,
  deps: OpenWorkspaceDeps,
): Promise<RepositoryWorkspace> {
  if (input.checkoutPath === undefined || input.checkoutPath.trim() === '') {
    throw new WorkspaceOpenError([{ field: 'checkoutPath', message: 'Pick a Checkout' }]);
  }
  let checkouts;
  try {
    checkouts = await deps.git.listCheckouts(workspace.path);
  } catch (error) {
    throw new WorkspaceOpenError([
      { field: 'checkoutPath', message: `Cannot read the Checkouts: ${String(error)}` },
    ]);
  }
  const wanted = busyKeyOf(input.checkoutPath);
  const checkout = checkouts.find((c) => busyKeyOf(c.path) === wanted);
  if (!checkout) {
    throw new WorkspaceOpenError([
      {
        field: 'checkoutPath',
        message: `Not a Checkout of ${workspace.path}: ${input.checkoutPath}`,
      },
    ]);
  }
  return new RepositoryWorkspace(
    workspace,
    checkout.path,
    busyKeyOf(checkout.path),
    checkout.branch,
    deps.git,
    deps.host,
  );
}

async function openFolder(
  workspace: Extract<WorkspaceFile, { kind: 'folder' }>,
  input: OpenWorkspaceInput,
): Promise<FolderWorkspace> {
  noCheckouts(workspace, input);
  const path = resolve(workspace.path);
  if (!(await isDirectory(path))) {
    throw new WorkspaceOpenError([
      { field: 'workspace', message: `The Workspace folder does not exist: ${workspace.path}` },
    ]);
  }
  return new FolderWorkspace(path, busyKeyOf(path));
}

/**
 * Resolves the Profile's Workspace for one Mission: the only place in the runtime that switches
 * on the kind (SPEC NFR-1). Validates the start input for that kind and reports what does not
 * fit as `WorkspaceOpenError`.
 */
export async function openWorkspace(
  profile: ProfileFile,
  input: OpenWorkspaceInput,
  deps: OpenWorkspaceDeps,
): Promise<Workspace> {
  const workspace = profile.workspace;
  switch (workspace.kind) {
    case 'none':
      noCheckouts(workspace, input);
      return new NoneWorkspace(input.missionDir);
    case 'folder':
      return openFolder(workspace, input);
    case 'repository':
      return openRepository(workspace, input, deps);
  }
}
