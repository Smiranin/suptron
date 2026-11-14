import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { subtractCost, ZERO_COST, type Cost } from '@suptron/runtime';

/** A session nobody called for this long is forgotten, or the file would grow for ever. */
export const SESSION_COST_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionTotal extends Cost {
  /** When the session was last called (ISO). */
  at: string;
}

/**
 * Turns the SDK's running totals into per-call costs.
 *
 * The `result` of a resumed session carries `total_cost_usd` and `modelUsage` for the whole
 * session so far, not for the call that just ended. The runtime adds every result it receives,
 * so a persistent session (the Core makes a dozen calls per Mission) would be charged once per
 * call for everything before it. The ledger remembers the last total per session and reports
 * the difference.
 *
 * Given a path, the totals are kept in that file, so a Mission resumed after a restart is not
 * charged the running totals of its sessions once more. Without a path they live in memory.
 */
export class SessionCostLedger {
  private readonly totals = new Map<string, SessionTotal>();
  private loading: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly path?: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Reads the file once; every agent awaits it before its first message. */
  load(): Promise<void> {
    this.loading ??= this.read();
    return this.loading;
  }

  private async read(): Promise<void> {
    if (this.path === undefined) return;
    let stored: Record<string, SessionTotal>;
    try {
      stored = JSON.parse(await readFile(this.path, 'utf8')) as Record<string, SessionTotal>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Costs are an estimate: an unreadable file costs one double count, not the Mission.
        console.error(`[suptron] session costs unreadable, starting empty: ${String(error)}`);
      }
      return;
    }
    const oldest = this.now().getTime() - SESSION_COST_KEEP_MS;
    for (const [sessionId, total] of Object.entries(stored)) {
      // A total a call reported while the file was read is newer than the stored one.
      if (Date.parse(total.at) >= oldest && !this.totals.has(sessionId)) {
        this.totals.set(sessionId, total);
      }
    }
  }

  /**
   * The cost of one call: `total` minus what the resumed session had already reported. A call
   * without `resumedSessionId` started a new session and owes everything. Stores `total` under
   * `sessionId` for the next call.
   */
  costOfCall(resumedSessionId: string | undefined, sessionId: string, total: Cost): Cost {
    const before =
      resumedSessionId === undefined ? ZERO_COST : (this.totals.get(resumedSessionId) ?? ZERO_COST);
    this.totals.set(sessionId, { ...total, at: this.now().toISOString() });
    this.save();
    return subtractCost(total, before);
  }

  /** Resolves when every queued write has landed (tests and shutdown). */
  flush(): Promise<void> {
    return this.queue;
  }

  /** Replaces the whole file atomically; writes are queued so they never interleave. */
  private save(): void {
    const path = this.path;
    if (path === undefined) return;
    this.queue = this.queue
      .then(async () => {
        await mkdir(dirname(path), { recursive: true });
        const tmp = `${path}.tmp-${randomBytes(4).toString('hex')}`;
        await writeFile(tmp, JSON.stringify(Object.fromEntries(this.totals), null, 2), 'utf8');
        await rename(tmp, path);
      })
      .catch((error: unknown) => console.error('[suptron] session costs write failed', error));
  }
}
