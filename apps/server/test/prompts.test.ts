import { CORE_CALL_INSTRUCTIONS, CORE_PREAMBLE, HANDOVER_PROMPT } from '@suptron/runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testServer, type TestServer } from './helpers.js';

describe('Prompt preview route', () => {
  let s: TestServer;
  beforeEach(async () => {
    s = await testServer();
  });
  afterEach(() => s.cleanup());

  it("builds a Pilot's system text through the Engine, with how to hand over", async () => {
    const response = await s.app.inject({
      method: 'POST',
      url: '/api/prompts/preview',
      payload: {
        role: 'pilot',
        rules: 'Never push.',
        instructions: 'Plan.',
        allowQuestions: false,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ system: `Never push.\n\nPlan.\n\n${HANDOVER_PROMPT}` });
  });

  it('gives the Core its built-in preamble, the Assembly instructions and every call', async () => {
    const response = await s.app.inject({
      method: 'POST',
      url: '/api/prompts/preview',
      payload: { role: 'core', instructions: 'Be terse.' },
    });
    expect(response.json()).toEqual({
      system: `${CORE_PREAMBLE}\n\nBe terse.`,
      calls: CORE_CALL_INSTRUCTIONS,
    });
  });

  it('refuses a body of no known role', async () => {
    const response = await s.app.inject({
      method: 'POST',
      url: '/api/prompts/preview',
      payload: { role: 'judge' },
    });
    expect(response.statusCode).toBe(400);
  });
});
