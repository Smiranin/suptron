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
