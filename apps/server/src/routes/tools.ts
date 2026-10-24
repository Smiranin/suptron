import { stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { fail } from '../errors.js';
import { openInEditor } from '../open-in-editor.js';

const openSchema = z.object({ path: z.string().min(1) });

export function registerToolRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.post('/api/open', async (request, reply) => {
    const body = openSchema.safeParse(request.body);
    if (!body.success) return fail(reply, 400, { reason: 'invalid_path' });
    const home = resolve(ctx.config.home);
    const target = resolve(body.data.path);
    if (target !== home && !target.startsWith(home + sep)) {
      return fail(reply, 400, {
        reason: 'outside_home',
        message: 'Only files inside SUPTRON_HOME can be opened',
      });
    }
    try {
      await (ctx.openInEditor ?? openInEditor)(target);
      return reply.status(204).send();
    } catch (error) {
      return fail(reply, 500, {
        reason: 'editor_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get<{ Querystring: { path?: string; remote?: string } }>(
    '/api/git/remote-defaults',
    async (request, reply) => {
      const path = request.query.path?.trim();
      if (!path) return fail(reply, 400, { reason: 'missing_path' });
      const remote = request.query.remote?.trim() || 'origin';
      try {
        const probe = await ctx.git.listCheckouts(path);
        if (probe.length === 0) return fail(reply, 404, { reason: 'not_a_repository' });
      } catch {
        return fail(reply, 404, { reason: 'not_a_repository' });
      }
      const defaults = await ctx.git.readRemoteDefaults(path, remote);
      return { remote, remoteUrl: defaults.remoteUrl, headBranch: defaults.headBranch };
    },
  );

  app.get<{ Querystring: { path?: string; base?: string } }>(
    '/api/fs/stat',
    async (request, reply) => {
      const raw = request.query.path?.trim();
      if (!raw) return fail(reply, 400, { reason: 'missing_path' });
      const base = request.query.base?.trim();
      const target = isAbsolute(raw) ? raw : base ? resolve(base, raw) : null;
      if (!target) return { exists: false };
      try {
        const info = await stat(target);
        return { exists: true, kind: info.isDirectory() ? 'dir' : 'file', path: target };
      } catch {
        return { exists: false, path: target };
      }
    },
  );
}
