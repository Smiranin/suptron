import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../context.js';

export function registerHealthRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/api/health', async () => {
    const [engine, host] = await Promise.all([ctx.engine.healthCheck(), ctx.host.healthCheck()]);
    return { engine, host, configHome: ctx.config.home };
  });

  app.get('/api/models', async () => ctx.engine.listModels());
}
