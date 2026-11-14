import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SESSION_COST_KEEP_MS, SessionCostLedger } from '../src/session-costs.js';

const total = (usd: number) => ({ usd, inputTokens: usd * 1000, outputTokens: usd * 100 });

describe('SessionCostLedger', () => {
  it('charges a new session its whole total', () => {
    const ledger = new SessionCostLedger();
    expect(ledger.costOfCall(undefined, 's1', total(1))).toEqual(total(1));
  });

  it('charges a resumed session only what the SDK added since the last call', () => {
    const ledger = new SessionCostLedger();
    ledger.costOfCall(undefined, 's1', total(1));
    expect(ledger.costOfCall('s1', 's1', total(1.5))).toEqual(total(0.5));
    expect(ledger.costOfCall('s1', 's1', total(1.5))).toEqual(total(0));
  });

  it('charges the running total once more when the resumed session is unknown', () => {
    // A ledger without a file after a restart, or a session forgotten for its age.
    const ledger = new SessionCostLedger();
    expect(ledger.costOfCall('old', 'old', total(2))).toEqual(total(2));
  });

  it('never reports a negative cost when the total shrinks', () => {
    const ledger = new SessionCostLedger();
    ledger.costOfCall(undefined, 's1', total(3));
    expect(ledger.costOfCall('s1', 's1', total(2))).toEqual(total(0));
  });

  it('keeps the totals of different sessions apart', () => {
    const ledger = new SessionCostLedger();
    ledger.costOfCall(undefined, 'a', total(1));
    ledger.costOfCall(undefined, 'b', total(4));
    expect(ledger.costOfCall('a', 'a', total(2))).toEqual(total(1));
    expect(ledger.costOfCall('b', 'b', total(5))).toEqual(total(1));
  });

  it('keeps the totals in a file, so a session resumed after a restart owes only the difference', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'suptron-costs-'));
    const path = join(dir, 'missions', 'session-costs.json');
    try {
      const before = new SessionCostLedger(path);
      await before.load();
      before.costOfCall(undefined, 's1', total(1));
      await before.flush();

      const after = new SessionCostLedger(path);
      await after.load();
      expect(after.costOfCall('s1', 's1', total(1.5))).toEqual(total(0.5));
      await after.flush();
      expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ s1: total(1.5) });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('forgets sessions nobody called for a long time and survives an unreadable file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'suptron-costs-'));
    const path = join(dir, 'session-costs.json');
    const now = new Date('2026-11-13T12:00:00.000Z');
    const old = new Date(now.getTime() - SESSION_COST_KEEP_MS - 1).toISOString();
    try {
      await writeFile(
        path,
        JSON.stringify({
          old: { ...total(2), at: old },
          fresh: { ...total(2), at: now.toISOString() },
        }),
      );
      const ledger = new SessionCostLedger(path, () => now);
      await ledger.load();
      expect(ledger.costOfCall('old', 'old', total(3))).toEqual(total(3));
      expect(ledger.costOfCall('fresh', 'fresh', total(3))).toEqual(total(1));
      await ledger.flush();
      expect(Object.keys(JSON.parse(await readFile(path, 'utf8')) as object).sort()).toEqual([
        'fresh',
        'old',
      ]);

      await writeFile(path, 'not json');
      const broken = new SessionCostLedger(path, () => now);
      await broken.load();
      expect(broken.costOfCall('fresh', 'fresh', total(3))).toEqual(total(3));
      await broken.flush();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
