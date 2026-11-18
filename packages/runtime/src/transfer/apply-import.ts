import { projectRelDir } from '../config/paths.js';
import type { ConfigWriter, WriteResult } from '../config/writer.js';
import { elementOfPath } from './layout.js';
import type { ElementRef, ImportSummary, ImportWrite } from './types.js';

/** An Import that could not be written; the configuration home was put back as it was, unless the message says otherwise. */
export class ImportFailedError extends Error {
  override readonly name = 'ImportFailedError';
}

/** A file written by the Import and its text before, `null` when it did not exist. */
interface WrittenFile {
  path: string;
  previous: string | null;
}

/** The element a write targets; the plan only writes paths of the Export layout. */
function refOf(write: ImportWrite): ElementRef {
  const ref = elementOfPath(write.path);
  if (!ref) throw new Error(`"${write.path}" is not part of an Export`);
  return ref;
}

/** The message of a caught error. */
function causeOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Why a write did not happen, in the Commander's words. */
function describeRefusal(result: Extract<WriteResult, { ok: false }>): string {
  return result.reason === 'exists'
    ? 'the file already exists'
    : `the write was refused (${result.reason})`;
}

/**
 * Writes the files of an Import plan in order: `add` creates, `replace` overwrites. A Project that
 * does not exist yet gets its folder first. When a write fails, every file already written is put
 * back, the Project folders created are removed, and an `ImportFailedError` is thrown.
 */
export async function applyImport(
  writer: ConfigWriter,
  writes: readonly ImportWrite[],
): Promise<ImportSummary> {
  const summary: ImportSummary = { added: [], replaced: [] };
  const written: WrittenFile[] = [];
  const createdProjects: string[] = [];
  let current: string | undefined;
  try {
    for (const write of writes) {
      current = write.path;
      const ref = refOf(write);
      const project = ref.kind === 'unit' ? undefined : ref.project;
      if (
        project &&
        !createdProjects.includes(project) &&
        !(await writer.exists(projectRelDir(project)))
      ) {
        await writer.createProject(project);
        createdProjects.push(project);
      }
      // The before-state is read right before the write, so a target that cannot be read also fails here.
      const previous = (await writer.read(write.path))?.text ?? null;
      const result = await writer.writeIfMatch(
        write.path,
        write.text,
        write.action === 'add' ? { create: true } : { force: true },
      );
      if (!result.ok) throw new Error(describeRefusal(result));
      written.push({ path: write.path, previous });
      (write.action === 'add' ? summary.added : summary.replaced).push(ref);
    }
  } catch (error) {
    const unrestored = await restore(writer, written, createdProjects);
    const message = `Writing "${current}" failed: ${causeOf(error)}.`;
    throw new ImportFailedError(
      unrestored.length === 0
        ? `${message} Nothing was changed.`
        : `${message} These could not be put back: ${unrestored.join(', ')}.`,
    );
  }
  return summary;
}

/**
 * Puts back every written file, newest first, and removes the Project folders the Import created.
 * Returns the paths that could not be put back.
 */
async function restore(
  writer: ConfigWriter,
  written: readonly WrittenFile[],
  createdProjects: readonly string[],
): Promise<string[]> {
  const unrestored: string[] = [];
  for (const file of [...written].reverse()) {
    try {
      if (file.previous === null) await writer.delete(file.path);
      else await writer.writeIfMatch(file.path, file.previous, { force: true });
    } catch (error) {
      unrestored.push(`${file.path} (${causeOf(error)})`);
    }
  }
  for (const project of createdProjects) {
    try {
      await writer.deleteProject(project);
    } catch (error) {
      unrestored.push(`${projectRelDir(project)} (${causeOf(error)})`);
    }
  }
  return unrestored;
}
