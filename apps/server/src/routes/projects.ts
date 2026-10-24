import {
  assemblyFileSchema,
  assemblyRelPath,
  issuesFromZod,
  nameSchema,
  parseAssemblyText,
  parseProfileText,
  profileFileSchema,
  profileRelPath,
  projectRelDir,
  serializeAssembly,
  serializeProfile,
  validateAssembly,
  type LoadedAssembly,
  type LoadedConfig,
  type LoadedProject,
} from '@suptron/runtime';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { badRequest, fail, notFound } from '../errors.js';
import { checkPrecondition, putWithPreconditions } from './put-semantics.js';

const duplicateSchema = z.object({ newName: nameSchema });
const createProjectSchema = z.object({ profile: profileFileSchema });

function unitNames(config: LoadedConfig): string[] {
  return config.units.flatMap((u) => (u.unit ? [u.name] : []));
}

export function registerProjectRoutes(app: FastifyInstance, ctx: ServerContext): void {
  const assemblyItem = (project: string, a: LoadedAssembly) => ({
    name: a.name,
    status: a.status,
    issues: a.issues,
    activeMissions: ctx.usage.assembly(project, a.name),
  });
  const projectItem = (p: LoadedProject) => ({
    name: p.name,
    profile: p.profile,
    etag: p.etag,
    issues: p.issues,
    assemblies: p.assemblies.map((a) => assemblyItem(p.name, a)),
    activeMissions: ctx.usage.project(p.name),
  });
  const parseProfile = (name: string) => (text: string) => parseProfileText(name, text).profile;

  app.get('/api/projects', async () => {
    const config = await ctx.config.load();
    return { items: config.projects.map(projectItem) };
  });

  app.post('/api/projects', async (request, reply) => {
    const body = createProjectSchema.safeParse(request.body);
    if (!body.success) return badRequest(reply, issuesFromZod(body.error));
    const profile = body.data.profile;
    const config = await ctx.config.load();
    if (config.projects.some((p) => p.name === profile.name))
      return fail(reply, 409, { reason: 'name_taken' });
    await ctx.writer.createProject(profile.name);
    const written = await ctx.writer.writeIfMatch(
      profileRelPath(profile.name),
      serializeProfile(profile),
      { create: true },
    );
    if (!written.ok) return fail(reply, 409, { reason: 'name_taken' });
    return reply.status(201).send({ profile, etag: written.etag });
  });

  app.get<{ Params: { project: string } }>('/api/projects/:project', async (request, reply) => {
    const { project } = await ctx.config.project(request.params.project);
    if (!project) return notFound(reply, 'Project');
    return projectItem(project);
  });

  app.put<{ Params: { project: string } }>(
    '/api/projects/:project/profile',
    async (request, reply) => {
      const parsed = profileFileSchema.safeParse(request.body);
      if (!parsed.success) return badRequest(reply, issuesFromZod(parsed.error));
      const profile = parsed.data;
      const oldName = request.params.project;
      const text = serializeProfile(profile);
      if (profile.name !== oldName) {
        const { config, project } = await ctx.config.project(oldName);
        if (!project) return notFound(reply, 'Project');
        const active = ctx.usage.project(oldName);
        if (active > 0) return fail(reply, 409, { reason: 'active_missions', count: active });
        if (config.projects.some((p) => p.name === profile.name))
          return fail(reply, 409, { reason: 'name_taken' });
        if (
          !(await checkPrecondition(
            ctx.writer,
            profileRelPath(oldName),
            request,
            reply,
            parseProfile(oldName),
          ))
        )
          return reply;
        await ctx.writer.rename(projectRelDir(oldName), projectRelDir(profile.name));
        const written = await ctx.writer.writeIfMatch(profileRelPath(profile.name), text, {
          force: true,
        });
        if (!written.ok) throw new Error(`Profile write failed: ${written.reason}`);
        return reply.status(200).send({ profile, etag: written.etag });
      }
      const outcome = await putWithPreconditions(
        ctx.writer,
        profileRelPath(profile.name),
        text,
        request,
        reply,
        parseProfile(profile.name),
      );
      if (!outcome) return reply;
      if (outcome.status === 201) await ctx.writer.createProject(profile.name);
      return reply.status(outcome.status).send({ profile, etag: outcome.etag });
    },
  );

  app.delete<{ Params: { project: string } }>('/api/projects/:project', async (request, reply) => {
    const { project } = await ctx.config.project(request.params.project);
    if (!project) return notFound(reply, 'Project');
    const active = ctx.usage.project(project.name);
    if (active > 0) return fail(reply, 409, { reason: 'active_missions', count: active });
    await ctx.writer.deleteProject(project.name);
    return reply.status(204).send();
  });

  app.get<{ Params: { project: string } }>(
    '/api/projects/:project/checkouts',
    async (request, reply) => {
      const { project } = await ctx.config.project(request.params.project);
      if (!project?.profile) return notFound(reply, 'Project');
      try {
        const checkouts = await ctx.registry.listCheckouts(project.name);
        return checkouts.map((c) => ({
          path: c.path,
          branch: c.branch,
          isMainWorktree: c.isMainWorktree,
          busyMissionId: c.busyMissionId,
        }));
      } catch (error) {
        return fail(reply, 500, {
          reason: 'checkouts_unavailable',
          message: String(error instanceof Error ? error.message : error),
        });
      }
    },
  );

  app.get<{ Params: { project: string; assembly: string } }>(
    '/api/projects/:project/assemblies/:assembly',
    async (request, reply) => {
      const { project, assembly } = await ctx.config.assembly(
        request.params.project,
        request.params.assembly,
      );
      if (!project) return notFound(reply, 'Project');
      if (!assembly) return notFound(reply, 'Assembly');
      return {
        name: assembly.name,
        assembly: assembly.assembly,
        ...(assembly.status === 'unparseable' && { text: assembly.text }),
        etag: assembly.etag,
        status: assembly.status,
        issues: assembly.issues,
        activeMissions: ctx.usage.assembly(project.name, assembly.name),
      };
    },
  );

  app.put<{ Params: { project: string; assembly: string } }>(
    '/api/projects/:project/assemblies/:assembly',
    async (request, reply) => {
      const parsed = assemblyFileSchema.safeParse(request.body);
      if (!parsed.success) return badRequest(reply, issuesFromZod(parsed.error));
      const assembly = parsed.data;
      const { config, project } = await ctx.config.project(request.params.project);
      if (!project) return notFound(reply, 'Project');
      const validation = validateAssembly(
        assembly,
        unitNames(config).map((name) => ({ name })),
      );
      if (validation.errors.length > 0) return badRequest(reply, validation.errors);
      const text = serializeAssembly(assembly);
      const oldName = request.params.assembly;
      const parseCurrent = (name: string) => (current: string) =>
        parseAssemblyText(name, current, unitNames(config)).assembly;
      if (assembly.name !== oldName) {
        const existing = project.assemblies.find((a) => a.name === oldName);
        if (!existing) return notFound(reply, 'Assembly');
        if (project.assemblies.some((a) => a.name === assembly.name))
          return fail(reply, 409, { reason: 'name_taken' });
        if (
          !(await checkPrecondition(
            ctx.writer,
            assemblyRelPath(project.name, oldName),
            request,
            reply,
            parseCurrent(oldName),
          ))
        )
          return reply;
        const written = await ctx.writer.writeIfMatch(
          assemblyRelPath(project.name, assembly.name),
          text,
          { create: true },
        );
        if (!written.ok) return fail(reply, 409, { reason: 'name_taken' });
        await ctx.writer.delete(assemblyRelPath(project.name, oldName));
        return reply
          .status(200)
          .send({ assembly, etag: written.etag, warnings: validation.warnings });
      }
      const outcome = await putWithPreconditions(
        ctx.writer,
        assemblyRelPath(project.name, assembly.name),
        text,
        request,
        reply,
        parseCurrent(assembly.name),
      );
      if (!outcome) return reply;
      return reply
        .status(outcome.status)
        .send({ assembly, etag: outcome.etag, warnings: validation.warnings });
    },
  );

  app.delete<{ Params: { project: string; assembly: string } }>(
    '/api/projects/:project/assemblies/:assembly',
    async (request, reply) => {
      const { project, assembly } = await ctx.config.assembly(
        request.params.project,
        request.params.assembly,
      );
      if (!project || !assembly) return notFound(reply, 'Assembly');
      const active = ctx.usage.assembly(project.name, assembly.name);
      if (active > 0) return fail(reply, 409, { reason: 'active_missions', count: active });
      await ctx.writer.delete(assemblyRelPath(project.name, assembly.name));
      return reply.status(204).send();
    },
  );

  app.post<{ Params: { project: string; assembly: string } }>(
    '/api/projects/:project/assemblies/:assembly/duplicate',
    async (request, reply) => {
      const body = duplicateSchema.safeParse(request.body);
      if (!body.success) return badRequest(reply, issuesFromZod(body.error));
      const { project, assembly } = await ctx.config.assembly(
        request.params.project,
        request.params.assembly,
      );
      if (!project || !assembly?.assembly) return notFound(reply, 'Assembly');
      if (project.assemblies.some((a) => a.name === body.data.newName))
        return fail(reply, 409, { reason: 'name_taken' });
      const copy = { ...assembly.assembly, name: body.data.newName };
      const written = await ctx.writer.writeIfMatch(
        assemblyRelPath(project.name, copy.name),
        serializeAssembly(copy),
        { create: true },
      );
      if (!written.ok) return fail(reply, 409, { reason: 'name_taken' });
      return reply.status(201).send({ assembly: copy, etag: written.etag });
    },
  );
}
