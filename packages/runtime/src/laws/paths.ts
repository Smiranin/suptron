import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { GuardContext } from '../engine/index.js';

export type PathMode = 'read' | 'write' | 'create';

export interface PathVerdict {
  allowed: boolean;
  reason?: string;
}

/**
 * Resolves symlinks of the deepest existing ancestor, so `/var/x` and `/private/var/x` (macOS) or a
 * symlinked Checkout compare equal even for a file that does not exist yet.
 */
export function canonicalPath(path: string): string {
  const absolute = resolve(path);
  let existing = absolute;
  const rest: string[] = [];
  for (;;) {
    try {
      const real = realpathSync(existing);
      return rest.length > 0 ? resolve(real, ...rest.reverse()) : real;
    } catch {
      const parent = dirname(existing);
      if (parent === existing) return absolute;
      rest.push(existing.slice(parent.length + 1));
      existing = parent;
    }
  }
}

function isInside(target: string, root: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** True when any directory on the way from `root` to `target` is a `.git` directory. */
function isGitInternal(target: string, root: string): boolean {
  return relative(root, target).split(sep).includes('.git');
}

/**
 * Denies any access to the configuration home, writes to the Commander's Task documents (a Slot's
 * own files next to them, such as OUTLINE.md, may be rewritten), writes outside the write roots
 * and the Task location, and writes to `.git` internals wherever a `.git` directory sits under a
 * write root.
 *
 * The Task location and the write roots are decided before the configuration home, because
 * both may live inside it: a text Task is stored in the Mission folder, and a Workspace of
 * kind `none` works in that same folder.
 */
export function evaluatePath(path: string, mode: PathMode, ctx: GuardContext): PathVerdict {
  const target = canonicalPath(isAbsolute(path) ? path : resolve(ctx.cwd, path));
  if (isInside(target, canonicalPath(ctx.taskPath))) {
    if (mode !== 'read' && ctx.taskDocuments.some((doc) => canonicalPath(doc) === target)) {
      return {
        allowed: false,
        reason: "The Commander's Task documents are never modified; write a new file next to them",
      };
    }
    return { allowed: true };
  }
  const root = ctx.writeRoots.map(canonicalPath).find((r) => isInside(target, r));
  if (root !== undefined) {
    if (mode !== 'read' && isGitInternal(target, root)) {
      return { allowed: false, reason: 'Writes to .git internals are forbidden' };
    }
    return { allowed: true };
  }
  if (isInside(target, canonicalPath(ctx.configHome))) {
    return { allowed: false, reason: 'Agents may not touch the Suptron configuration home' };
  }
  if (mode === 'read') return { allowed: true };
  return { allowed: false, reason: outsideWriteReason(ctx) };
}

/** Names the Task folder so a Slot that wanted a scratch file (run 4: `/tmp`) knows where it goes. */
export function outsideWriteReason(ctx: GuardContext): string {
  return `Writes are allowed only inside the Workspace and the Task folder; keep working files in ${ctx.taskPath}`;
}
