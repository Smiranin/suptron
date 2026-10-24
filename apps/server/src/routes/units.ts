import {
  issuesFromZod,
  nameSchema,
  parseUnitMarkdown,
  serializeUnit,
  unitFileSchema,
  unitRelPath,
  type LoadedUnit,
} from '@suptron/runtime';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { badRequest, fail, notFound } from '../errors.js';
import { checkPrecondition, putWithPreconditions } from './put-semantics.js';

const duplicateSchema = z.object({ newName: nameSchema });

function item(unit: LoadedUnit) {
  return { name: unit.name, unit: unit.unit, etag: unit.etag, issues: unit.issues };
}

const parseCurrent = (text: string) => parseUnitMarkdown(text).unit;

export function registerUnitRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/api/units', async () => {
    const config = await ctx.config.load();
    return { items: config.units.map(item) };
  });

  app.get<{ Params: { name: string } }>('/api/units/:name', async (request, reply) => {
    const { config, unit } = await ctx.config.unit(request.params.name);
    if (!unit) return notFound(reply, 'Unit');
    return { ...item(unit), usage: ctx.usage.unit(config, unit.name) };
  });

  app.put<{ Params: { name: string } }>('/api/units/:name', async (request, reply) => {
    const parsed = unitFileSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, issuesFromZod(parsed.error));
    const unit = parsed.data;
    const text = serializeUnit(unit);
    const oldName = request.params.name;
    if (unit.name !== oldName) {
      const { config, unit: existing } = await ctx.config.unit(oldName);
      if (!existing) return notFound(reply, 'Unit');
      const usedBy = ctx.usage.unit(config, oldName).assemblies;
      if (usedBy.length > 0) return fail(reply, 409, { reason: 'in_use', usedBy });
      if (config.units.some((u) => u.name === unit.name))
        return fail(reply, 409, { reason: 'name_taken' });
      if (
        !(await checkPrecondition(ctx.writer, unitRelPath(oldName), request, reply, parseCurrent))
      )
        return reply;
      const written = await ctx.writer.writeIfMatch(unitRelPath(unit.name), text, { create: true });
      if (!written.ok) return fail(reply, 409, { reason: 'name_taken' });
      await ctx.writer.delete(unitRelPath(oldName));
      return reply.status(200).send({ unit, etag: written.etag });
    }
    const outcome = await putWithPreconditions(
      ctx.writer,
      unitRelPath(unit.name),
      text,
      request,
      reply,
      parseCurrent,
    );
    if (!outcome) return reply;
    return reply.status(outcome.status).send({ unit, etag: outcome.etag });
  });

  app.delete<{ Params: { name: string } }>('/api/units/:name', async (request, reply) => {
    const { config, unit } = await ctx.config.unit(request.params.name);
    if (!unit) return notFound(reply, 'Unit');
    const usedBy = ctx.usage.unit(config, unit.name).assemblies;
    if (usedBy.length > 0) return fail(reply, 409, { reason: 'in_use', usedBy });
    await ctx.writer.delete(unitRelPath(unit.name));
    return reply.status(204).send();
  });

  app.post<{ Params: { name: string } }>('/api/units/:name/duplicate', async (request, reply) => {
    const body = duplicateSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, issuesFromZod(body.error));
    const { config, unit } = await ctx.config.unit(request.params.name);
    if (!unit?.unit) return notFound(reply, 'Unit');
    if (config.units.some((u) => u.name === body.data.newName))
      return fail(reply, 409, { reason: 'name_taken' });
    const copy = { ...unit.unit, name: body.data.newName };
    const written = await ctx.writer.writeIfMatch(unitRelPath(copy.name), serializeUnit(copy), {
      create: true,
    });
    if (!written.ok) return fail(reply, 409, { reason: 'name_taken' });
    return reply.status(201).send({ unit: copy, etag: written.etag });
  });
}
