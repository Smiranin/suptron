import { homedir } from 'node:os';
import { join } from 'node:path';

export const HANGAR_DIR = 'hangar';
export const PROJECTS_DIR = 'projects';
export const ASSEMBLIES_DIR = 'assemblies';
export const PROFILE_FILE = 'profile.yaml';
export const MISSIONS_DIR = 'missions';
export const LEDGER_FILE = 'active.json';
/** A Task given as text is stored under this name in the Mission folder. */
export const MISSION_TASK_FILE = 'task.md';

export function defaultConfigHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.SUPTRON_HOME && env.SUPTRON_HOME.trim() !== ''
    ? env.SUPTRON_HOME
    : join(homedir(), '.suptron');
}

export function unitRelPath(name: string): string {
  return join(HANGAR_DIR, `${name}.md`);
}

export function projectRelDir(project: string): string {
  return join(PROJECTS_DIR, project);
}

export function profileRelPath(project: string): string {
  return join(PROJECTS_DIR, project, PROFILE_FILE);
}

export function assemblyRelPath(project: string, assembly: string): string {
  return join(PROJECTS_DIR, project, ASSEMBLIES_DIR, `${assembly}.yaml`);
}

export function ledgerRelPath(): string {
  return join(MISSIONS_DIR, LEDGER_FILE);
}

/** The folder of one Mission; it holds the Task document when the Task was given as text. */
export function missionRelDir(id: string): string {
  return join(MISSIONS_DIR, id);
}

export function missionTaskRelPath(id: string): string {
  return join(missionRelDir(id), MISSION_TASK_FILE);
}
