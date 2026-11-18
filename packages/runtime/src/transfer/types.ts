// Browser-safe: the contract of Export and Import shared by the server and the web.
// Type-only; nothing here may import a `node:` module (re-exported from browser.ts).
import type { Issue } from '../config/schemas.js';

/** One file of an Export: a POSIX path relative to the configuration home and its text. */
export interface TransferFile {
  path: string;
  text: string;
}

export interface ExportSelection {
  units: string[];
  projects: string[];
}

export interface ExportContents {
  units: { name: string; title?: string }[];
  /** `units`: names of Hangar Units placed by the Project's Assemblies. */
  projects: { name: string; title?: string; units: string[] }[];
}

export type ElementKind = 'unit' | 'profile' | 'assembly';

/** A Unit (`name`), a Profile (`name` and `project` are the Project) or an Assembly of `project`. */
export interface ElementRef {
  kind: ElementKind;
  name: string;
  project?: string;
}

/** The machine-bound paths of one Profile. */
export interface ProjectPaths {
  /** `null` for the Workspace kind `none`. */
  workspace: string | null;
  outerFolders: string[];
  /** Knowledge Sources given as absolute paths; `index` is the position in the Profile's list. */
  knowledgeSources: { index: number; path: string }[];
}

export interface ImportChoices {
  /** Paths of different elements the Commander chose to replace. */
  replace: string[];
  /** Edited paths, by Project name. A Project that is absent keeps the paths of the file. */
  paths: Record<string, ProjectPaths>;
}

export type ImportStatus = 'new' | 'same' | 'different';
export type ImportAction = 'add' | 'replace' | 'keep' | 'none';

export interface ImportElement extends ElementRef {
  path: string;
  title?: string;
  status: ImportStatus;
  /** new → add; same → none; different → replace when chosen, else keep. */
  action: ImportAction;
  /** Problems of the version that will exist after the Import. */
  issues: { errors: Issue[]; warnings: Issue[] };
  /** Profiles only: present when the Profile will be written and can be parsed. */
  paths?: ProjectPaths;
}

export interface ImportPreview {
  elements: ImportElement[];
}

export interface ImportWrite {
  path: string;
  text: string;
  action: 'add' | 'replace';
}

export interface ImportSummary {
  added: ElementRef[];
  replaced: ElementRef[];
}
