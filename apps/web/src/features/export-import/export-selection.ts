import type { ExportContents, ExportSelection } from '@suptron/runtime/browser';

type ExportProject = ExportContents['projects'][number];

/** Everything checked: every Unit and every Project. */
export function initialSelection(contents: ExportContents): ExportSelection {
  return {
    units: contents.units.map((u) => u.name),
    projects: contents.projects.map((p) => p.name),
  };
}

/** `names` with `name` added or removed, keeping it once. */
function toggled(names: readonly string[], name: string, checked: boolean): string[] {
  const rest = names.filter((n) => n !== name);
  return checked ? [...rest, name] : rest;
}

/** Checks or unchecks one Unit and nothing else. */
export function toggleUnit(
  selection: ExportSelection,
  name: string,
  checked: boolean,
): ExportSelection {
  return { ...selection, units: toggled(selection.units, name, checked) };
}

/** Checking a Project also checks the Units it places; unchecking it leaves the Units as they are. */
export function toggleProject(
  selection: ExportSelection,
  project: ExportProject,
  checked: boolean,
): ExportSelection {
  const projects = toggled(selection.projects, project.name, checked);
  if (!checked) return { ...selection, projects };
  const units = [...new Set([...selection.units, ...project.units])];
  return { units, projects };
}
