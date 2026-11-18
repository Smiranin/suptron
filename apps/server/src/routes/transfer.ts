import {
  ImportFailedError,
  applyImport,
  collectExport,
  issuesFromZod,
  listExportContents,
  planImport,
} from '@suptron/runtime';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { badRequest, fail } from '../errors.js';

export const IMPORT_BODY_LIMIT_BYTES = 32 * 1024 * 1024;

const exportSelectionSchema = z.object({
  units: z.array(z.string()),
  projects: z.array(z.string()),
});

const projectPathsSchema = z.object({
  workspace: z.string().nullable(),
  outerFolders: z.array(z.string()),
  knowledgeSources: z.array(z.object({ index: z.number().int().nonnegative(), path: z.string() })),
});

const importBodySchema = z.object({
  files: z.array(z.object({ path: z.string(), text: z.string() })),
  choices: z.object({
    replace: z.array(z.string()),
    paths: z.record(z.string(), projectPathsSchema),
  }),
});

/** Export of chosen Units and Projects, and the preview and application of an Import. */
export function registerTransferRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/api/export/contents', async () => listExportContents(await ctx.config.load()));

  app.post('/api/export', async (request, reply) => {
    const body = exportSelectionSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, issuesFromZod(body.error));
    const collected = collectExport(await ctx.config.load(), body.data);
    if (!collected.ok) return badRequest(reply, collected.issues);
    return { files: collected.files };
  });

  app.post(
    '/api/import/preview',
    { bodyLimit: IMPORT_BODY_LIMIT_BYTES },
    async (request, reply) => {
      const body = importBodySchema.safeParse(request.body);
      if (!body.success) return badRequest(reply, issuesFromZod(body.error));
      const plan = planImport(await ctx.config.load(), body.data.files, body.data.choices);
      if (!plan.ok) return badRequest(reply, plan.issues);
      return plan.preview;
    },
  );

  app.post('/api/import/apply', { bodyLimit: IMPORT_BODY_LIMIT_BYTES }, async (request, reply) => {
    const body = importBodySchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, issuesFromZod(body.error));
    const plan = planImport(await ctx.config.load(), body.data.files, body.data.choices);
    if (!plan.ok) return badRequest(reply, plan.issues);
    try {
      return await applyImport(ctx.writer, plan.writes);
    } catch (error) {
      if (!(error instanceof ImportFailedError)) throw error;
      return fail(reply, 500, { reason: 'import_failed', message: error.message });
    }
  });
}
