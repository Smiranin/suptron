import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/** Serves the built web application with an SPA fallback for non-API routes, when it exists. */
export async function registerStatic(app: FastifyInstance, distDir: string): Promise<boolean> {
  if (!existsSync(join(distDir, 'index.html'))) return false;
  await app.register(fastifyStatic, { root: distDir, wildcard: false, index: false });
  app.get('/', (_request, reply) => reply.sendFile('index.html'));
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({ reason: 'not_found' });
  });
  return true;
}
