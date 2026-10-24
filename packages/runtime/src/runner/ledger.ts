import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ledgerRelPath } from '../config/paths.js';
import type { AssemblyFile } from '../config/schemas.js';
import type { MissionSummary, SlotRecord } from '../domain/mission.js';

export interface LedgerEntry {
  summary: MissionSummary;
  assembly: AssemblyFile;
  slots: SlotRecord[];
}

export type LedgerContent = Record<string, LedgerEntry>;

/**
 * `missions/active.json`: the active Missions, rewritten on every notable event so that a
 * restart can show what was interrupted. Writes are queued so they never interleave.
 */
export class Ledger {
  readonly path: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(home: string) {
    this.path = join(home, ledgerRelPath());
  }

  async read(): Promise<LedgerContent> {
    try {
      const text = await readFile(this.path, 'utf8');
      const parsed: unknown = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? (parsed as LedgerContent) : {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  /** Replaces the whole file atomically. */
  write(content: LedgerContent): Promise<void> {
    this.queue = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp-${randomBytes(4).toString('hex')}`;
      await writeFile(tmp, JSON.stringify(content, null, 2), 'utf8');
      await rename(tmp, this.path);
    });
    return this.queue;
  }

  /** Resolves when every queued write has landed. */
  flush(): Promise<void> {
    return this.queue;
  }

  async remove(): Promise<void> {
    await rm(this.path, { force: true });
  }
}
