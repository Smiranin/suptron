import {
  parseAssemblyText,
  parseProfileText,
  parseUnitText,
  type LoadedConfig,
} from '../config/load.js';
import { validateOuterFolders } from '../config/outer-folders.js';
import type { Issue, ProfileFile, UnitFile } from '../config/schemas.js';
import { serializeProfile } from '../config/serialize.js';
import { capabilitiesOf, type Capability } from '../workspace/kinds.js';
import { hasMissingProfile } from './export.js';
import { elementOfPath, pathOfElement } from './layout.js';
import { projectPathsOf, samePaths, sameShape, withProjectPaths } from './project-paths.js';
import type {
  ElementRef,
  ImportAction,
  ImportChoices,
  ImportElement,
  ImportPreview,
  ImportStatus,
  ImportWrite,
  ProjectPaths,
  TransferFile,
} from './types.js';

export type ImportPlan =
  { ok: true; preview: ImportPreview; writes: ImportWrite[] } | { ok: false; issues: Issue[] };

/** One file of the Export with what the configuration home has at its path. */
interface PlannedElement {
  ref: ElementRef;
  path: string;
  status: ImportStatus;
  action: ImportAction;
  /** The text written for `add` and `replace`. */
  written?: string;
  /** Profiles only: the paths shown for editing. */
  paths?: ProjectPaths;
}

/** Line endings are not part of an element's content: CRLF counts as LF and is written as LF. */
function normalize(text: string): string {
  return text.replaceAll('\r\n', '\n');
}

/** The text of every Unit, Profile and Assembly file the configuration home has, by Export path. */
function homeTexts(config: LoadedConfig): Map<string, string> {
  const texts = new Map<string, string>();
  for (const unit of config.units)
    texts.set(pathOfElement({ kind: 'unit', name: unit.name }), unit.text);
  for (const project of config.projects) {
    const name = project.name;
    if (!hasMissingProfile(project)) {
      texts.set(pathOfElement({ kind: 'profile', name, project: name }), project.text);
    }
    for (const assembly of project.assemblies) {
      texts.set(
        pathOfElement({ kind: 'assembly', name: assembly.name, project: name }),
        assembly.text,
      );
    }
  }
  return texts;
}

/**
 * The element of every file, or the reasons the file set is not an Export: no files, a file
 * outside the layout, a path given twice.
 */
function classify(
  files: readonly TransferFile[],
):
  | { ok: true; entries: { file: TransferFile; ref: ElementRef }[] }
  | { ok: false; issues: Issue[] } {
  if (files.length === 0) {
    return {
      ok: false,
      issues: [{ code: 'empty_export', message: 'The file holds nothing to import' }],
    };
  }
  const entries: { file: TransferFile; ref: ElementRef }[] = [];
  const outside: Issue[] = [];
  for (const file of files) {
    const ref = elementOfPath(file.path);
    if (ref) entries.push({ file, ref });
    else {
      outside.push({
        code: 'outside_layout',
        message: `"${file.path}" is not part of an Export`,
        path: file.path,
      });
    }
  }
  const duplicates: Issue[] = [];
  const seen = new Set<string>();
  for (const { path } of files) {
    if (seen.has(path)) {
      duplicates.push({
        code: 'duplicate_path',
        message: `"${path}" appears more than once`,
        path,
      });
    }
    seen.add(path);
  }
  const issues = [...outside, ...duplicates];
  return issues.length > 0 ? { ok: false, issues } : { ok: true, entries };
}

/** Orders two strings by their code units, the same on every system and locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Units by name, then each Project by name: its Profile followed by its Assemblies by name. */
function compareRefs(a: ElementRef, b: ElementRef): number {
  const group = (ref: ElementRef) => (ref.kind === 'unit' ? '' : `${ref.project}`);
  const rank = (ref: ElementRef) => (ref.kind === 'assembly' ? 1 : 0);
  return compareText(group(a), group(b)) || rank(a) - rank(b) || compareText(a.name, b.name);
}

/** What happens to a file of the Export, before its paths are edited. */
function planElement(
  file: TransferFile,
  ref: ElementRef,
  local: string | undefined,
  replace: ReadonlySet<string>,
): PlannedElement {
  const text = normalize(file.text);
  if (local === undefined)
    return { ref, path: file.path, status: 'new', action: 'add', written: text };
  if (normalize(local) === text) return { ref, path: file.path, status: 'same', action: 'none' };
  return replace.has(file.path)
    ? { ref, path: file.path, status: 'different', action: 'replace', written: text }
    : { ref, path: file.path, status: 'different', action: 'keep' };
}

/**
 * Applies the edited paths of `choices` to the Profiles that will be written and sets the paths
 * each of them shows. Returns an `invalid_paths` Issue for every Project whose edit cannot apply.
 */
function applyPathChoices(elements: PlannedElement[], choices: ImportChoices): Issue[] {
  const issues: Issue[] = [];
  const editable = new Map<string, { element: PlannedElement; profile: ProfileFile }>();
  for (const element of elements) {
    if (element.ref.kind !== 'profile' || element.written === undefined) continue;
    const { profile } = parseProfileText(element.ref.name, element.written);
    if (profile) editable.set(element.ref.name, { element, profile });
  }
  for (const [project, paths] of Object.entries(choices.paths)) {
    const target = editable.get(project);
    if (!target) {
      issues.push({
        code: 'invalid_paths',
        message: `The paths of "${project}" cannot be edited: its Profile is not written or cannot be read`,
      });
    } else if (!sameShape(paths, projectPathsOf(target.profile))) {
      issues.push({
        code: 'invalid_paths',
        message: `The paths of "${project}" do not match the paths of its Profile`,
      });
    }
  }
  if (issues.length > 0) return issues;
  for (const [project, { element, profile }] of editable) {
    const filePaths = projectPathsOf(profile);
    const edited = choices.paths[project];
    element.paths = edited ?? filePaths;
    if (edited && !samePaths(edited, filePaths)) {
      element.written = serializeProfile(withProjectPaths(profile, edited));
    }
  }
  return [];
}

/** The configuration as it will be after the Import, validated element by element. */
class ResultingConfig {
  private readonly units: UnitFile[];
  private readonly capabilities = new Map<string, ReadonlySet<Capability> | null>();

  constructor(
    private readonly texts: ReadonlyMap<string, string>,
    private readonly home: string,
  ) {
    this.units = [...texts].flatMap(([path, text]) => {
      const ref = elementOfPath(path);
      if (ref?.kind !== 'unit') return [];
      const { unit } = parseUnitText(ref.name, text);
      return unit ? [unit] : [];
    });
  }

  /** The title and problems of the element at `ref` as it will be. */
  check(ref: ElementRef): { title?: string; issues: ImportElement['issues'] } {
    const text = this.texts.get(pathOfElement(ref)) ?? '';
    switch (ref.kind) {
      case 'unit': {
        const { unit, issues } = parseUnitText(ref.name, text);
        return { ...titleOf(unit?.title), issues: { errors: issues, warnings: [] } };
      }
      case 'profile': {
        const { profile, issues } = this.profile(ref.name, text);
        return { ...titleOf(profile?.title), issues: { errors: issues, warnings: [] } };
      }
      case 'assembly': {
        const parsed = parseAssemblyText(ref.name, text, this.units, this.capabilitiesOf(ref));
        return { ...titleOf(parsed.assembly?.title), issues: parsed.issues };
      }
    }
  }

  /** A Profile parsed and checked against the configuration home, as the loader does. */
  private profile(name: string, text: string): { profile: ProfileFile | null; issues: Issue[] } {
    const parsed = parseProfileText(name, text);
    if (!parsed.profile) return parsed;
    const outerIssues = validateOuterFolders(parsed.profile.outerFolders, this.home);
    return outerIssues.length > 0 ? { profile: null, issues: outerIssues } : parsed;
  }

  /** What the Workspace of an Assembly's Project will provide; null when its Profile is missing or invalid. */
  private capabilitiesOf(ref: ElementRef): ReadonlySet<Capability> | null {
    const project = ref.project ?? ref.name;
    if (!this.capabilities.has(project)) {
      const text = this.texts.get(pathOfElement({ kind: 'profile', name: project, project }));
      const profile = text === undefined ? null : this.profile(project, text).profile;
      this.capabilities.set(project, profile ? capabilitiesOf(profile.workspace) : null);
    }
    return this.capabilities.get(project) ?? null;
  }
}

/** `{ title }` when there is one, so an absent title stays absent. */
function titleOf(title: string | undefined): { title?: string } {
  return title === undefined ? {} : { title };
}

/**
 * Decides what an Import of `files` with `choices` does to the configuration home: refuses a file
 * set that is not an Export, marks every element new, same or different, lists the writes, and
 * validates every element as it will be afterwards. Writes nothing.
 */
export function planImport(
  config: LoadedConfig,
  files: readonly TransferFile[],
  choices: ImportChoices,
): ImportPlan {
  const classified = classify(files);
  if (!classified.ok) return classified;

  const local = homeTexts(config);
  const replace = new Set(choices.replace);
  const elements = classified.entries
    .map(({ file, ref }) => planElement(file, ref, local.get(file.path), replace))
    .sort((a, b) => compareRefs(a.ref, b.ref));
  const pathIssues = applyPathChoices(elements, choices);
  if (pathIssues.length > 0) return { ok: false, issues: pathIssues };

  const writes: ImportWrite[] = elements.flatMap((e) =>
    e.written !== undefined && (e.action === 'add' || e.action === 'replace')
      ? [{ path: e.path, text: e.written, action: e.action }]
      : [],
  );
  const resulting = new Map(local);
  for (const write of writes) resulting.set(write.path, write.text);
  const result = new ResultingConfig(resulting, config.home);

  const preview: ImportPreview = {
    elements: elements.map((e) => ({
      ...e.ref,
      path: e.path,
      ...result.check(e.ref),
      status: e.status,
      action: e.action,
      ...(e.paths && { paths: e.paths }),
    })),
  };
  return { ok: true, preview, writes };
}
