import type { TransferFile } from '@suptron/runtime/browser';
import { strToU8, unzipSync, zipSync } from 'fflate';

/** What operating systems leave in an archive they re-pack: never part of an Export. */
const OS_LEFTOVERS = {
  folders: ['__MACOSX'],
  files: ['.DS_Store', 'Thumbs.db', 'desktop.ini'],
} as const;

/** A chosen file that cannot be read as an Export archive; the message says why. */
export class ArchiveError extends Error {
  override readonly name = 'ArchiveError';
}

/** Packs the files of an Export into a zip, each at its path. */
export function packExport(files: readonly TransferFile[]): Uint8Array {
  return zipSync(Object.fromEntries(files.map((file) => [file.path, strToU8(file.text)])));
}

/** True for a folder entry or something an operating system added to the archive. */
function isLeftover(path: string): boolean {
  if (path.endsWith('/')) return true;
  const segments = path.split('/');
  const last = segments[segments.length - 1] ?? '';
  return (
    OS_LEFTOVERS.folders.some((folder) => segments[0] === folder) ||
    OS_LEFTOVERS.files.some((file) => file === last)
  );
}

/**
 * Unpacks a zip into the files of an Export. Folder entries and operating system leftovers are
 * dropped; everything else is passed on as it is, for the server to judge.
 */
export function unpackExport(bytes: Uint8Array): TransferFile[] {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    throw new ArchiveError('This file is not a zip archive', { cause: error });
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return Object.entries(entries).flatMap(([name, content]) => {
    const path = name.replaceAll('\\', '/');
    if (isLeftover(path)) return [];
    try {
      return [{ path, text: decoder.decode(content) }];
    } catch (error) {
      throw new ArchiveError(`"${path}" is not a UTF-8 text file`, { cause: error });
    }
  });
}
