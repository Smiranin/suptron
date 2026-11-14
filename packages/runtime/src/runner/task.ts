import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MISSION_TASK_FILE, missionRelDir, missionTaskRelPath } from '../config/paths.js';

/** The folder of one Mission, under `SUPTRON_HOME`. */
export function missionFolder(home: string, id: string): string {
  return join(home, missionRelDir(id));
}

/**
 * Creates `missions/<id>/` for a Mission of any kind (SPEC FR-11): the Task document of a text
 * Task lives there, a Pilot may leave notes there, and a Workspace of kind `none` works there.
 */
export async function createMissionFolder(home: string, id: string): Promise<string> {
  const dir = missionFolder(home, id);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Stores a text Task as `missions/<id>/task.md` and returns the Mission folder, which becomes
 * the Task location: the Pilot reads the document there and may leave notes next to it.
 */
export async function storeTaskText(home: string, id: string, text: string): Promise<string> {
  const dir = await createMissionFolder(home, id);
  const body = text.endsWith('\n') ? text : `${text}\n`;
  await writeFile(join(home, missionTaskRelPath(id)), body, 'utf8');
  return dir;
}

/** The document of a text Task inside its Mission folder. */
export function textTaskDocument(taskPath: string): string {
  return join(taskPath, MISSION_TASK_FILE);
}

/**
 * The files the Core lists for the Pilot: the file itself, or every regular file under the folder
 * (dot entries skipped, sorted). A folder without files is listed as is, so the Pilot still sees it.
 */
export async function listTaskDocuments(taskPath: string, isFile: boolean): Promise<string[]> {
  if (isFile) return [taskPath];
  const entries = await readdir(taskPath, { withFileTypes: true, recursive: true });
  const files = entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter(
      (file) =>
        !file
          .slice(taskPath.length)
          .split('/')
          .some((part) => part.startsWith('.')),
    )
    .sort();
  return files.length > 0 ? files : [taskPath];
}

/** Removes the Mission folder with everything a Pilot left there (on Dismiss or a failed start). */
export async function removeMissionFolder(home: string, id: string): Promise<void> {
  await rm(missionFolder(home, id), { recursive: true, force: true });
}
