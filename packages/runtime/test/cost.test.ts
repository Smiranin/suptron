import { describe, expect, it } from 'vitest';
import { addCost, subtractCost, ZERO_COST } from '../src/domain/cost.js';

describe('Cost helpers', () => {
  it('adds every field', () => {
    expect(addCost({ usd: 1, inputTokens: 10, outputTokens: 2 }, ZERO_COST)).toEqual({
      usd: 1,
      inputTokens: 10,
      outputTokens: 2,
    });
  });

  it('subtracts every field and clamps at zero', () => {
    expect(
      subtractCost(
        { usd: 1.5, inputTokens: 1500, outputTokens: 10 },
        { usd: 1, inputTokens: 1000, outputTokens: 20 },
      ),
    ).toEqual({ usd: 0.5, inputTokens: 500, outputTokens: 0 });
  });
});
