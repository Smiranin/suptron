import { isAbsolutePath, type ProfileFile } from '../config/schemas.js';
import type { ProjectPaths } from './types.js';

/** The machine-bound paths of a Profile: its Workspace, its Outer Folders, its absolute Knowledge Sources. */
export function projectPathsOf(profile: ProfileFile): ProjectPaths {
  return {
    workspace: profile.workspace.kind === 'none' ? null : profile.workspace.path,
    outerFolders: [...profile.outerFolders],
    knowledgeSources: profile.knowledgeSources.flatMap((source, index) =>
      'path' in source && isAbsolutePath(source.path) ? [{ index, path: source.path }] : [],
    ),
  };
}

/**
 * The Profile with its machine-bound paths replaced by `paths`. Only values change: no Outer
 * Folder or Knowledge Source is added or removed, and a Workspace without a path keeps none.
 */
export function withProjectPaths(profile: ProfileFile, paths: ProjectPaths): ProfileFile {
  const workspace =
    profile.workspace.kind === 'none' || paths.workspace === null
      ? profile.workspace
      : { ...profile.workspace, path: paths.workspace };
  const sourcePaths = new Map(paths.knowledgeSources.map((s) => [s.index, s.path]));
  return {
    ...profile,
    workspace,
    outerFolders: profile.outerFolders.map((folder, i) => paths.outerFolders[i] ?? folder),
    knowledgeSources: profile.knowledgeSources.map((source, index) => {
      const path = sourcePaths.get(index);
      return path !== undefined && 'path' in source ? { ...source, path } : source;
    }),
  };
}

/** True when `paths` has the same entries as `reference`: the same Outer Folder count, Knowledge Source indexes and Workspace presence. */
export function sameShape(paths: ProjectPaths, reference: ProjectPaths): boolean {
  const indexes = (p: ProjectPaths) =>
    p.knowledgeSources
      .map((s) => s.index)
      .sort((x, y) => x - y)
      .join(',');
  return (
    (paths.workspace === null) === (reference.workspace === null) &&
    paths.outerFolders.length === reference.outerFolders.length &&
    indexes(paths) === indexes(reference)
  );
}

/** True when both of the same shape hold the same values. */
export function samePaths(a: ProjectPaths, b: ProjectPaths): boolean {
  const sourcePaths = new Map(b.knowledgeSources.map((s) => [s.index, s.path]));
  return (
    a.workspace === b.workspace &&
    a.outerFolders.every((folder, i) => folder === b.outerFolders[i]) &&
    a.knowledgeSources.every((s) => sourcePaths.get(s.index) === s.path)
  );
}
