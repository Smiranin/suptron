import { MISSING_PROFILE, type LoadedConfig, type LoadedProject } from '../config/load.js';
import type { Issue } from '../config/schemas.js';
import { unitsOfSlot } from '../config/usage.js';
import { pathOfElement } from './layout.js';
import type { ExportContents, ExportSelection, TransferFile } from './types.js';

/** The names of Hangar Units the parsed Assemblies of a Project place, sorted. */
function unitsOfProject(project: LoadedProject, hangar: ReadonlySet<string>): string[] {
  const placed = new Set(
    project.assemblies.flatMap((a) => a.assembly?.slots.flatMap(unitsOfSlot) ?? []),
  );
  return [...placed].filter((name) => hangar.has(name)).sort();
}

/** Everything the Commander can choose for an Export: every Unit (invalid ones too) and every Project. */
export function listExportContents(config: LoadedConfig): ExportContents {
  const hangar = new Set(config.units.map((u) => u.name));
  return {
    units: config.units.map((u) => ({
      name: u.name,
      ...(u.unit?.title !== undefined && { title: u.unit.title }),
    })),
    projects: config.projects.map((p) => ({
      name: p.name,
      ...(p.profile?.title !== undefined && { title: p.profile.title }),
      units: unitsOfProject(p, hangar),
    })),
  };
}

/**
 * The files of an Export: the chosen Units, and each chosen Project's Profile (when the file
 * exists) and all its Assemblies, with their texts exactly as the configuration home keeps them.
 */
export function collectExport(
  config: LoadedConfig,
  selection: ExportSelection,
): { ok: true; files: TransferFile[] } | { ok: false; issues: Issue[] } {
  if (selection.units.length === 0 && selection.projects.length === 0) {
    return {
      ok: false,
      issues: [{ code: 'empty_selection', message: 'Nothing is chosen to export' }],
    };
  }
  const issues: Issue[] = [];
  const files: TransferFile[] = [];
  for (const name of selection.units) {
    const unit = config.units.find((u) => u.name === name);
    if (!unit) {
      issues.push({ code: 'unknown_unit', message: `The Hangar has no Unit "${name}"` });
      continue;
    }
    files.push({ path: pathOfElement({ kind: 'unit', name }), text: unit.text });
  }
  for (const name of selection.projects) {
    const project = config.projects.find((p) => p.name === name);
    if (!project) {
      issues.push({ code: 'unknown_project', message: `There is no Project "${name}"` });
      continue;
    }
    if (!hasMissingProfile(project)) {
      files.push({
        path: pathOfElement({ kind: 'profile', name, project: name }),
        text: project.text,
      });
    }
    for (const assembly of project.assemblies) {
      files.push({
        path: pathOfElement({ kind: 'assembly', name: assembly.name, project: name }),
        text: assembly.text,
      });
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, files };
}

/** True when the Project folder has no `profile.yaml`. */
export function hasMissingProfile(project: LoadedProject): boolean {
  return project.issues.some((issue) => issue.code === MISSING_PROFILE);
}
