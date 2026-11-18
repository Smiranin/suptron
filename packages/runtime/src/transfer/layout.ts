import { sep } from 'node:path';
import {
  ASSEMBLIES_DIR,
  HANGAR_DIR,
  PROFILE_FILE,
  PROJECTS_DIR,
  assemblyRelPath,
  profileRelPath,
  unitRelPath,
} from '../config/paths.js';
import { NAME_PATTERN } from '../config/schemas.js';
import type { ElementRef } from './types.js';

const UNIT_EXTENSION = '.md';
const ASSEMBLY_EXTENSION = '.yaml';

/** A relative path of the configuration home with `/` as the separator on every system. */
function posix(relPath: string): string {
  return relPath.split(sep).join('/');
}

/** The name of `file` without `extension`, or null when it has another extension or breaks the name rule. */
function nameOfFile(file: string | undefined, extension: string): string | null {
  if (!file?.endsWith(extension)) return null;
  const name = file.slice(0, -extension.length);
  return NAME_PATTERN.test(name) ? name : null;
}

/**
 * Classifies a POSIX path relative to the configuration home as a Unit, a Profile or an Assembly,
 * or returns null for anything else an Export may not hold.
 */
export function elementOfPath(path: string): ElementRef | null {
  const ref = refOfSegments(path.split('/'));
  // Rebuilding the path rules out every spelling other than the canonical one.
  return ref && pathOfElement(ref) === path ? ref : null;
}

/** The element the segments of a path name, judged by their position only. */
function refOfSegments(segments: readonly string[]): ElementRef | null {
  const [top, second, third, fourth] = segments;
  if (top === HANGAR_DIR && segments.length === 2) {
    const name = nameOfFile(second, UNIT_EXTENSION);
    return name ? { kind: 'unit', name } : null;
  }
  if (top !== PROJECTS_DIR || second === undefined || !NAME_PATTERN.test(second)) return null;
  if (segments.length === 3 && third === PROFILE_FILE) {
    return { kind: 'profile', name: second, project: second };
  }
  if (segments.length === 4 && third === ASSEMBLIES_DIR) {
    const name = nameOfFile(fourth, ASSEMBLY_EXTENSION);
    return name ? { kind: 'assembly', name, project: second } : null;
  }
  return null;
}

/** The Project an Assembly belongs to; every Assembly reference names one. */
function projectOfAssembly(ref: ElementRef): string {
  if (ref.project === undefined) throw new Error(`The Assembly ${ref.name} names no Project`);
  return ref.project;
}

/** The POSIX path of an element relative to the configuration home. */
export function pathOfElement(ref: ElementRef): string {
  switch (ref.kind) {
    case 'unit':
      return posix(unitRelPath(ref.name));
    case 'profile':
      return posix(profileRelPath(ref.project ?? ref.name));
    case 'assembly':
      return posix(assemblyRelPath(projectOfAssembly(ref), ref.name));
  }
}
