import type { FastifyReply } from 'fastify';
import type { Issue } from '@suptron/runtime';

/** Sends a JSON error body with the given status and returns the reply for `return`. */
export function fail(
  reply: FastifyReply,
  status: number,
  body: Record<string, unknown>,
): FastifyReply {
  return reply.status(status).send(body);
}

export function notFound(reply: FastifyReply, what: string): FastifyReply {
  return fail(reply, 404, { reason: 'not_found', message: `${what} not found` });
}

export function badRequest(reply: FastifyReply, issues: Issue[]): FastifyReply {
  return fail(reply, 400, { issues });
}
