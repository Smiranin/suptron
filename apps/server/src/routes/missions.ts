import {
  CheckoutBusyError,
  MissionStartError,
  MissionStateError,
  type MissionDetail,
  type StartIssueField,
} from '@suptron/runtime';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { fail, notFound } from '../errors.js';

const taskSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), path: z.string().min(1) }),
  z.object({ kind: z.literal('text'), text: z.string() }),
]);

const startSchema = z.object({
  project: z.string().min(1),
  assembly: z.string().min(1),
  task: taskSchema,
  workItemId: z.string().optional(),
  checkoutPath: z.string().min(1),
  mayAskCommander: z.record(z.string(), z.boolean()).optional(),
});

const retrySchema = z.object({ note: z.string().optional() });
const answerSchema = z.object({
  questionId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
});

function fieldOf(path: PropertyKey[]): StartIssueField {
  const head = String(path[0] ?? '');
  if (head === 'task') return path[1] === 'text' ? 'taskText' : 'taskPath';
  if (head === 'checkoutPath' || head === 'workItemId') return head;
  return 'assembly';
}

function stateError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof MissionStateError) {
    if (error.reason === 'not_found') return notFound(reply, 'Mission');
    return fail(reply, 409, { reason: error.reason, message: error.message });
  }
  throw error;
}

export function missionDetail(ctx: ServerContext, id: string): MissionDetail | undefined {
  const record = ctx.registry.get(id);
  if (!record) return undefined;
  return {
    summary: record.summary,
    assembly: record.assembly,
    slots: record.slots,
    transcript: record.transcriptLost ? [] : ctx.transcripts.sections(id),
    transcriptLost: record.transcriptLost,
    ...(record.pendingQuestion && { pendingQuestion: record.pendingQuestion }),
    ...(record.attention && { attention: record.attention }),
    ...(record.result && { result: record.result }),
    seq: record.seq,
  };
}

export function registerMissionRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/api/missions', async () => ctx.registry.list());

  app.post('/api/missions', async (request, reply) => {
    const parsed = startSchema.safeParse(request.body);
    if (!parsed.success) {
      return fail(reply, 400, {
        issues: parsed.error.issues.map((i) => ({ field: fieldOf(i.path), message: i.message })),
      });
    }
    try {
      const { workItemId, mayAskCommander, ...rest } = parsed.data;
      const summary = await ctx.registry.start({
        ...rest,
        ...(workItemId !== undefined && { workItemId }),
        ...(mayAskCommander !== undefined && { mayAskCommander }),
      });
      return reply.status(201).send(summary);
    } catch (error) {
      if (error instanceof MissionStartError) return fail(reply, 400, { issues: error.issues });
      if (error instanceof CheckoutBusyError) {
        return fail(reply, 409, { reason: 'checkout_busy', missionId: error.missionId });
      }
      throw error;
    }
  });

  app.get<{ Params: { id: string } }>('/api/missions/:id', async (request, reply) => {
    const detail = missionDetail(ctx, request.params.id);
    return detail ?? notFound(reply, 'Mission');
  });

  app.post<{ Params: { id: string } }>('/api/missions/:id/stop', async (request, reply) => {
    try {
      await ctx.registry.stop(request.params.id);
      return reply.status(204).send();
    } catch (error) {
      return stateError(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>('/api/missions/:id/retry', async (request, reply) => {
    const body = retrySchema.safeParse(request.body ?? {});
    if (!body.success)
      return fail(reply, 400, {
        issues: body.error.issues.map((i) => ({ field: 'note', message: i.message })),
      });
    try {
      ctx.registry.retry(request.params.id, body.data.note);
      return reply.status(204).send();
    } catch (error) {
      return stateError(reply, error);
    }
  });

  app.post<{ Params: { id: string } }>('/api/missions/:id/answer', async (request, reply) => {
    const body = answerSchema.safeParse(request.body);
    if (!body.success)
      return fail(reply, 400, {
        issues: body.error.issues.map((i) => ({
          field: String(i.path[0] ?? ''),
          message: i.message,
        })),
      });
    try {
      ctx.registry.answer(request.params.id, body.data.questionId, body.data.answers);
      return reply.status(204).send();
    } catch (error) {
      return stateError(reply, error);
    }
  });

  app.delete<{ Params: { id: string } }>('/api/missions/:id', async (request, reply) => {
    try {
      await ctx.registry.dismiss(request.params.id);
      return reply.status(204).send();
    } catch (error) {
      return stateError(reply, error);
    }
  });

  app.get('/api/events', ctx.events.handle);
}
