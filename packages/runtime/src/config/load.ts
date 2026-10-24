import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { etagOf } from './etag.js';
import { ASSEMBLIES_DIR, HANGAR_DIR, PROFILE_FILE, PROJECTS_DIR } from './paths.js';
import {
  assemblyFileSchema,
  issuesFromZod,
  profileFileSchema,
  type AssemblyFile,
  type Issue,
  type ProfileFile,
  type UnitFile,
} from './schemas.js';
import { parseUnitMarkdown } from './unit-markdown.js';
import { validateAssembly } from './validate-assembly.js';

export interface LoadedUnit {
  name: string;
  path: string;
  text: string;
  etag: string;
  unit: UnitFile | null;
  issues: Issue[];
}

export type AssemblyStatus = 'valid' | 'invalid' | 'unparseable';

export interface LoadedAssembly {
  name: string;
  path: string;
  text: string;
  etag: string;
  assembly: AssemblyFile | null;
  status: AssemblyStatus;
  issues: { errors: Issue[]; warnings: Issue[] };
}

export interface LoadedProject {
  name: string;
  path: string;
  profilePath: string;
  text: string;
  etag: string;
  profile: ProfileFile | null;
  issues: Issue[];
  assemblies: LoadedAssembly[];
}

export interface LoadedConfig {
  home: string;
  units: LoadedUnit[];
  projects: LoadedProject[];
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function listFiles(dir: string, ext: string): Promise<string[]> {
  if (!(await isDirectory(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && extname(e.name) === ext)
    .map((e) => e.name)
    .sort();
}

async function listDirectories(dir: string): Promise<string[]> {
  if (!(await isDirectory(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function nameMismatch(expected: string, actual: unknown): Issue | null {
  if (actual === expected) return null;
  return {
    code: 'name_mismatch',
    message: `The "name" field (${String(actual)}) must equal the file basename (${expected})`,
    path: 'name',
  };
}

function parseYamlObject(text: string): { value: unknown; error?: string } {
  try {
    const value = parseYaml(text);
    if (value === null || value === undefined) return { value: {} };
    if (typeof value !== 'object') return { value, error: 'The document is not a YAML mapping' };
    return { value };
  } catch (error) {
    return { value: null, error: String(error) };
  }
}

export async function loadUnit(path: string): Promise<LoadedUnit> {
  const name = basename(path, '.md');
  const text = await readFile(path, 'utf8');
  const parsed = parseUnitMarkdown(text);
  const issues = [...parsed.issues];
  const mismatch = parsed.unit ? nameMismatch(name, parsed.unit.name) : null;
  if (mismatch) issues.push(mismatch);
  return {
    name,
    path,
    text,
    etag: etagOf(text),
    unit: issues.length === 0 ? parsed.unit : null,
    issues,
  };
}

export async function loadUnits(home: string): Promise<LoadedUnit[]> {
  const dir = join(home, HANGAR_DIR);
  const files = await listFiles(dir, '.md');
  return Promise.all(files.map((file) => loadUnit(join(dir, file))));
}

export function parseAssemblyText(
  name: string,
  text: string,
  unitNames: readonly string[],
): Omit<LoadedAssembly, 'name' | 'path' | 'text' | 'etag'> {
  const yaml = parseYamlObject(text);
  if (yaml.error !== undefined) {
    return {
      assembly: null,
      status: 'unparseable',
      issues: { errors: [{ code: 'invalid_yaml', message: yaml.error }], warnings: [] },
    };
  }
  const parsed = assemblyFileSchema.safeParse(yaml.value);
  if (!parsed.success) {
    return {
      assembly: null,
      status: 'unparseable',
      issues: { errors: issuesFromZod(parsed.error), warnings: [] },
    };
  }
  const errors: Issue[] = [];
  const mismatch = nameMismatch(name, parsed.data.name);
  if (mismatch) errors.push(mismatch);
  const validation = validateAssembly(
    parsed.data,
    unitNames.map((n) => ({ name: n })),
  );
  errors.push(...validation.errors);
  return {
    assembly: parsed.data,
    status: errors.length === 0 ? 'valid' : 'invalid',
    issues: { errors, warnings: validation.warnings },
  };
}

export async function loadAssembly(
  path: string,
  unitNames: readonly string[],
): Promise<LoadedAssembly> {
  const name = basename(path, '.yaml');
  const text = await readFile(path, 'utf8');
  return { name, path, text, etag: etagOf(text), ...parseAssemblyText(name, text, unitNames) };
}

export function parseProfileText(
  name: string,
  text: string,
): { profile: ProfileFile | null; issues: Issue[] } {
  const yaml = parseYamlObject(text);
  if (yaml.error !== undefined) {
    return { profile: null, issues: [{ code: 'invalid_yaml', message: yaml.error }] };
  }
  const parsed = profileFileSchema.safeParse(yaml.value);
  if (!parsed.success) return { profile: null, issues: issuesFromZod(parsed.error) };
  const mismatch = nameMismatch(name, parsed.data.name);
  if (mismatch) return { profile: null, issues: [mismatch] };
  return { profile: parsed.data, issues: [] };
}

export async function loadProject(
  home: string,
  name: string,
  unitNames: readonly string[],
): Promise<LoadedProject> {
  const path = join(home, PROJECTS_DIR, name);
  const profilePath = join(path, PROFILE_FILE);
  let text = '';
  let issues: Issue[];
  let profile: ProfileFile | null = null;
  try {
    text = await readFile(profilePath, 'utf8');
    ({ profile, issues } = parseProfileText(name, text));
  } catch {
    issues = [{ code: 'missing_profile', message: `${PROFILE_FILE} is missing` }];
  }
  const assembliesDir = join(path, ASSEMBLIES_DIR);
  const files = await listFiles(assembliesDir, '.yaml');
  const assemblies = await Promise.all(
    files.map((file) => loadAssembly(join(assembliesDir, file), unitNames)),
  );
  return { name, path, profilePath, text, etag: etagOf(text), profile, issues, assemblies };
}

/** Reads the whole `SUPTRON_HOME`. Never throws for a broken file: every problem is an Issue. */
export async function loadConfig(home: string): Promise<LoadedConfig> {
  const units = await loadUnits(home);
  const unitNames = units.filter((u) => u.unit).map((u) => u.name);
  const projectNames = await listDirectories(join(home, PROJECTS_DIR));
  const projects = await Promise.all(projectNames.map((n) => loadProject(home, n, unitNames)));
  return { home, units, projects };
}
