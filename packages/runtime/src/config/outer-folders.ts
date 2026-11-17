import { isAbsolute, resolve } from 'node:path';
import { canonicalPath, isInside } from '../laws/paths.js';
import type { Issue } from './schemas.js';

export const INVALID_OUTER_FOLDER = 'invalid_outer_folder';

/**
 * Checks the Outer Folders of a Profile against the configuration home: each must be absolute and
 * neither be the home, lie inside it, nor contain it. Node only, because the home is known only
 * on the server. Each Issue carries the path `outerFolders.N` of its entry.
 */
export function validateOuterFolders(folders: readonly string[], configHome: string): Issue[] {
  const home = canonicalPath(configHome);
  const issues: Issue[] = [];
  folders.forEach((folder, index) => {
    const path = `outerFolders.${index}`;
    const fail = (message: string) =>
      issues.push({ code: INVALID_OUTER_FOLDER, message: `${path}: ${message}`, path });
    if (!isAbsolute(folder)) {
      fail('An Outer Folder must be an absolute path');
      return;
    }
    const target = canonicalPath(resolve(folder));
    if (isInside(target, home)) {
      fail('An Outer Folder may not be the configuration home or lie inside it');
    } else if (isInside(home, target)) {
      fail('An Outer Folder may not contain the configuration home');
    }
  });
  return issues;
}
