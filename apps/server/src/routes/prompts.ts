import {
  CORE_CALL_INSTRUCTIONS,
  CORE_PREAMBLE,
  issuesFromZod,
  withHandover,
} from '@suptron/runtime';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { badRequest } from '../errors.js';

/**
 * A Pilot is described by what its Slot resolves to (the editor resolves it, unsaved changes
 * included); the Core by the Assembly's additional instructions alone.
 */
const previewSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('pilot'),
    rules: z.string(),
    instructions: z.string(),
    allowQuestions: z.boolean(),
  }),
  z.object({ role: z.literal('core'), instructions: z.string() }),
]);

/** The prompts an agent receives, assembled by the same code a Mission uses. */
export function registerPromptRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.post('/api/prompts/preview', async (request, reply) => {
    const body = previewSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, issuesFromZod(body.error));
    if (body.data.role === 'pilot') {
      const { rules, instructions, allowQuestions } = body.data;
      return {
        system: ctx.engine.systemText({
          role: 'pilot',
          systemPrompt: { rules, instructions: withHandover(instructions) },
          allowQuestions,
        }),
      };
    }
    return {
      system: ctx.engine.systemText({
        role: 'core',
        systemPrompt: { rules: CORE_PREAMBLE, instructions: body.data.instructions },
        allowQuestions: false,
      }),
      calls: CORE_CALL_INSTRUCTIONS,
    };
  });
}
