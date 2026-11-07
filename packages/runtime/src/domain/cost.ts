export interface Cost {
  usd: number;
  inputTokens: number;
  outputTokens: number;
}

export const ZERO_COST: Cost = Object.freeze({ usd: 0, inputTokens: 0, outputTokens: 0 });

export function addCost(a: Cost, b: Cost): Cost {
  return {
    usd: a.usd + b.usd,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/**
 * `a` minus `b`, never below zero per field: a running total that shrinks (a session recovered
 * after a restart, a provider that re-counts) must not produce a negative charge.
 */
export function subtractCost(a: Cost, b: Cost): Cost {
  return {
    usd: Math.max(0, a.usd - b.usd),
    inputTokens: Math.max(0, a.inputTokens - b.inputTokens),
    outputTokens: Math.max(0, a.outputTokens - b.outputTokens),
  };
}
