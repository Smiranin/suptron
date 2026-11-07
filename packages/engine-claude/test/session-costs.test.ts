import { describe, expect, it } from 'vitest';
import { SessionCostLedger } from '../src/session-costs.js';

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
    // After a server restart the ledger is empty: the known limit, documented in the README.
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
});
