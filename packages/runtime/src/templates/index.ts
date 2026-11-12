import type { RepositoryWorkspaceFile } from '../config/schemas.js';

export interface MissionValues {
  workItemId?: string;
  taskTitle: string;
  taskSlug: string;
}

/** Lowercase ASCII words joined with `-`, at most 60 characters. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

const PLACEHOLDER = /\{(work_item_id|task_slug|task_title)\}/g;

/**
 * Renders `{work_item_id}`, `{task_slug}` and `{task_title}`. An empty Work Item ID disappears
 * together with one adjacent separator character (`-`, `_` or `/`).
 */
export function render(template: string, values: MissionValues): string {
  const workItemId = values.workItemId?.trim() ?? '';
  let text = template;
  if (workItemId === '') {
    // The separator after the placeholder goes first, then one before it, then the bare placeholder.
    text = text
      .replace(/\{work_item_id\}[-_/]/g, '')
      .replace(/[-_/]\{work_item_id\}/g, '')
      .replace(/\{work_item_id\}/g, '');
  }
  return text.replace(PLACEHOLDER, (_, key: string) => {
    switch (key) {
      case 'work_item_id':
        return workItemId;
      case 'task_slug':
        return values.taskSlug;
      default:
        return values.taskTitle;
    }
  });
}

/**
 * The Git conventions of a `repository` Workspace, rendered once at Mission start for the Slots
 * whose context includes them. Stated as conventions, never as instructions: what a Pilot does
 * with them is decided by its Unit.
 */
export function renderGitConventions(
  workspace: RepositoryWorkspaceFile,
  values: MissionValues,
): string {
  const branch = render(workspace.git.branchNameTemplate, values).trim();
  const prBody = render(workspace.git.pullRequestTemplate, values).trim();
  const lines = [`Protected branch: ${workspace.protectedBranch}`, `Remote: ${workspace.remote}`];
  if (branch) lines.push(`Branch convention: ${branch}`);
  if (workspace.git.labels.length > 0)
    lines.push(`Pull request labels: ${workspace.git.labels.join(', ')}`);
  if (workspace.git.reviewers.length > 0) {
    lines.push(`Pull request reviewers: ${workspace.git.reviewers.join(', ')}`);
  }
  if (prBody) lines.push('', 'Pull request convention:', '', prBody);
  return lines.join('\n');
}
