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

function isGitInternal(target: string, checkoutPath: string): boolean {
  const rel = relative(checkoutPath, target);
  return rel === '.git' || rel.startsWith(`.git${sep}`);
}

/**
 * Denies any access to the configuration home, writes to existing Task documents (new files
 * only), writes outside the Checkout and the Task location, and writes to `.git` internals.
 *
 * The Task location is decided first: a Task given as text lives in the Mission folder inside the
 * configuration home, and the Pilot must still read it and may leave notes next to it.
 */
export function evaluatePath(path: string, mode: PathMode, ctx: GuardContext): PathVerdict {
  const checkoutPath = canonicalPath(ctx.checkoutPath);
  const target = canonicalPath(isAbsolute(path) ? path : resolve(ctx.checkoutPath, path));
  if (isInside(target, canonicalPath(ctx.taskPath))) {
    if (mode === 'write') {
      return {
        allowed: false,
        reason: 'Existing Task documents are never modified; create a new file instead',
      };
    }
    return { allowed: true };
  }
  if (isInside(target, canonicalPath(ctx.configHome))) {
    return { allowed: false, reason: 'Agents may not touch the Suptron configuration home' };
  }
  if (mode === 'read') return { allowed: true };
  if (!isInside(target, checkoutPath)) {
    return {
      allowed: false,
      reason: 'Writes are allowed only inside the Checkout and the Task location',
    };
  }
  if (isGitInternal(target, checkoutPath)) {
    return { allowed: false, reason: 'Writes to .git internals are forbidden' };
  }
  return { allowed: true };
}
