import { subtractCost, ZERO_COST, type Cost } from '@suptron/runtime';

/**
 * Turns the SDK's running totals into per-call costs.
 *
 * The `result` of a resumed session carries `total_cost_usd` and `modelUsage` for the whole
 * session so far, not for the call that just ended. The runtime adds every result it receives,
 * so a persistent session (the Core makes a dozen calls per Mission) would be charged once per
 * call for everything before it. The ledger remembers the last total per session and reports
 * the difference.
 *
 * Known limit: the ledger lives in memory. After a server restart the first call of a recovered
 * session reports its running total once more.
 */
export class SessionCostLedger {
  private readonly totals = new Map<string, Cost>();

  /**
   * The cost of one call: `total` minus what the resumed session had already reported. A call
   * without `resumedSessionId` started a new session and owes everything. Stores `total` under
   * `sessionId` for the next call.
   */
  costOfCall(resumedSessionId: string | undefined, sessionId: string, total: Cost): Cost {
    const before =
      resumedSessionId === undefined ? ZERO_COST : (this.totals.get(resumedSessionId) ?? ZERO_COST);
    this.totals.set(sessionId, total);
    return subtractCost(total, before);
  }
}
