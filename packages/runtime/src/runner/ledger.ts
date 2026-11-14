import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ledgerRelPath } from '../config/paths.js';
import type { AssemblyFile } from '../config/schemas.js';
import type { MissionSnapshot } from '../config/snapshot.js';
import type { MissionSummary, SlotRecord } from '../domain/mission.js';
import type { MissionMeta, RunnerProgress } from './runner.js';

/**
 * What a Mission is for its whole life: fixed at start, so a Resume runs on the configuration
 * the Mission started with and not on the files as they are now.
 */
export interface MissionOrigin {
  snapshot: MissionSnapshot;
  meta: MissionMeta;
  /** The Core's working directory: the Task folder. */
  coreCwd: string;
  /** The Checkout of a repository Workspace: what reopens it. */
  checkoutPath?: string;
}

/** Everything a Resume needs: the origin, where the Runner stood and the Core's session. */
export interface ResumeState extends MissionOrigin {
  progress: RunnerProgress;
  coreSessionId?: string;
}

export interface LedgerEntry {
  summary: MissionSummary;
  assembly: AssemblyFile;
  slots: SlotRecord[];
  /** Absent in entries written before Missions could be resumed. */
  resume?: ResumeState;
}

export type LedgerContent = Record<string, LedgerEntry>;

/**
 * `missions/active.json`: the Missions that are not over (active, Stopped or interrupted),
 * rewritten on every notable event so that a restart can show what was interrupted and a Resume
 * can go on from it. Writes are queued so they never interleave.
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
