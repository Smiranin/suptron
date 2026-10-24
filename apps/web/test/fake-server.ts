import {
  DEFAULTS,
  assemblyFileSchema,
  profileFileSchema,
  resolveCore,
  resolveSlot,
  unitFileSchema,
  validateAssembly,
  type AssemblyFile,
  type Issue,
  type MissionDetail,
  type MissionEvent,
  type MissionSummary,
  type MissionTask,
  type ProfileFile,
  type SlotRecord,
  type UnitFile,
} from '@suptron/runtime/browser';
import { http, HttpResponse, type HttpHandler } from 'msw';
import { setupServer } from 'msw/node';
import { FakeLiveEvents } from '../src/features/missions/live/LiveEvents';
import { invalidAssembly, primaryAssembly, primaryProfile, primaryUnits } from './fixtures/primary';

/** Content hash stand-in: deterministic and distinct for distinct documents. */
export function etagOf(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return `etag-${hash.toString(16)}-${text.length}`;
}

export interface FakeAssembly {
  doc: AssemblyFile | null;
  text?: string;
}

export interface FakeProject {
  profile: ProfileFile;
  assemblies: Map<string, FakeAssembly>;
  checkouts: { path: string; branch: string | null; isMainWorktree: boolean }[];
  checkoutsError?: string;
}

export interface RecordedRequest {
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

/**
 * An in-memory SUPTRON_HOME behind msw handlers that implement the HTTP contract (ETags, 412, 428,
 * 409 in_use / active_missions / name_taken, activeMissions) plus the Missions section.
 */
export class FakeHome {
  units = new Map<string, UnitFile>();
  projects = new Map<string, FakeProject>();
  missions = new Map<string, MissionDetail>();
  models: { id: string; displayName: string }[] = [
    { id: 'sonnet', displayName: 'Claude Sonnet' },
    { id: 'opus', displayName: 'Claude Opus' },
  ];
  /** Paths the fake file system knows; `GET /api/fs/stat` answers from this set. */
  existingPaths = new Map<string, 'file' | 'dir'>();
  repositories = new Map<string, { remoteUrl: string; headBranch: string }>();
  requests: RecordedRequest[] = [];
  opened: string[] = [];
  live = new FakeLiveEvents();
  readonly home = '/home/me/.suptron';
  nextMissionId = 1;

  static primary(): FakeHome {
    const home = new FakeHome();
    for (const unit of primaryUnits()) home.units.set(unit.name, unit);
    const profile = primaryProfile();
    home.projects.set('my-app', {
      profile,
      assemblies: new Map([
        ['feature', { doc: primaryAssembly() }],
        ['broken', { doc: invalidAssembly() }],
      ]),
      checkouts: [
        { path: '/repos/my-app', branch: 'main', isMainWorktree: true },
        { path: '/repos/my-app-wt', branch: 'feature/other', isMainWorktree: false },
      ],
    });
    home.existingPaths.set('/repos/my-app', 'dir');
    home.existingPaths.set('/repos/my-app/README.md', 'file');
    home.existingPaths.set('/repos/my-app/docs/adr', 'dir');
    home.existingPaths.set('/tasks/my-task', 'dir');
    home.existingPaths.set('/tasks/my-task/SPEC.md', 'file');
    home.repositories.set('/repos/my-app', {
      remoteUrl: 'git@github.com:me/my-app.git',
      headBranch: 'main',
    });
    return home;
  }

  unitPath(name: string): string {
    return `${this.home}/hangar/${name}.md`;
  }

  profilePath(project: string): string {
    return `${this.home}/projects/${project}/profile.yaml`;
  }

  assemblyPath(project: string, assembly: string): string {
    return `${this.home}/projects/${project}/assemblies/${assembly}.yaml`;
  }

  requestsTo(method: string, pattern: string | RegExp): RecordedRequest[] {
    return this.requests.filter(
      (r) =>
        r.method === method &&
        (typeof pattern === 'string' ? r.url.endsWith(pattern) : pattern.test(r.url)),
    );
  }

  activeMissions(filter: { unit?: string; project?: string; assembly?: string }): number {
    let count = 0;
    for (const mission of this.missions.values()) {
      const { summary } = mission;
      if (summary.state === 'completed' || summary.state === 'stopped') continue;
      if (filter.project !== undefined && summary.projectName !== filter.project) continue;
      if (filter.assembly !== undefined && summary.assemblyName !== filter.assembly) continue;
      if (filter.unit !== undefined && !mission.assembly.slots.some((s) => s.unit === filter.unit))
        continue;
      count += 1;
    }
    return count;
  }

  unitUsage(name: string): { project: string; assembly: string }[] {
    const used: { project: string; assembly: string }[] = [];
    for (const [project, entry] of this.projects) {
      for (const [assembly, a] of entry.assemblies) {
        if (a.doc?.slots.some((s) => s.unit === name)) used.push({ project, assembly });
      }
    }
    return used;
  }

  assemblyStatus(project: string, name: string, a: FakeAssembly) {
    if (!a.doc) {
      return {
        status: 'unparseable' as const,
        issues: {
          errors: [{ code: 'invalid_yaml', message: 'bad yaml' }],
          warnings: [] as Issue[],
        },
      };
    }
    const validation = validateAssembly(a.doc, [...this.units.values()]);
    return {
      status: validation.errors.length === 0 ? ('valid' as const) : ('invalid' as const),
      issues: validation,
    };
  }

  projectItem(name: string, p: FakeProject) {
    return {
      name,
      profile: p.profile,
      etag: etagOf(p.profile),
      issues: [],
      assemblies: [...p.assemblies.entries()].map(([assembly, a]) => ({
        name: assembly,
        ...this.assemblyStatus(name, assembly, a),
        activeMissions: this.activeMissions({ project: name, assembly }),
      })),
      activeMissions: this.activeMissions({ project: name }),
    };
  }

  /** Starts a Mission from the fixtures: a running summary on the first Slot. */
  startMission(body: {
    project: string;
    assembly: string;
    task: MissionTask;
    workItemId?: string;
    checkoutPath: string;
    mayAskCommander?: Record<string, boolean>;
  }): MissionDetail {
    const project = this.projects.get(body.project)!;
    const doc = project.assemblies.get(body.assembly)!.doc!;
    const id = `m${this.nextMissionId++}`;
    const checkout = project.checkouts.find((c) => c.path === body.checkoutPath);
    const { task } = body;
    const taskPath = task.kind === 'path' ? task.path : `/home/.suptron/missions/${id}`;
    const taskTitle =
      task.kind === 'path'
        ? task.path.replace(/\/+$/, '').split('/').pop() || task.path
        : task.text
            .trim()
            .split('\n')[0]!
            .replace(/^#+\s*/, '');
    const summary: MissionSummary = {
      id,
      projectName: body.project,
      assemblyName: body.assembly,
      taskPath,
      taskTitle,
      ...(body.workItemId && { workItemId: body.workItemId }),
      state: 'running',
      currentSlot: doc.slots[0]?.name ?? null,
      branch: checkout?.branch ?? null,
      checkoutPath: body.checkoutPath,
      startedAt: new Date().toISOString(),
      cost: { usd: 0, inputTokens: 0, outputTokens: 0, estimated: true },
    };
    const slots: SlotRecord[] = [
      ...doc.slots.map((s) => ({
        name: s.name,
        attempts: 0,
        loops: 0,
        cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
        checkResults: [],
      })),
      {
        name: 'core',
        attempts: 0,
        loops: 0,
        cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
        checkResults: [],
      },
    ];
    const detail: MissionDetail = {
      summary,
      assembly: doc,
      slots,
      transcript: [],
      transcriptLost: false,
      seq: 1,
    };
    this.missions.set(id, detail);
    this.live.emit({ type: 'mission.started', missionId: id, seq: 1, mission: summary });
    return detail;
  }

  /** Puts fixture details into the fake, as if the server knew them since start. */
  seedMissions(...details: MissionDetail[]): void {
    for (const detail of details) this.missions.set(detail.summary.id, structuredClone(detail));
  }

  /** The next sequence number of a Mission (the fake stamps events like the server does). */
  nextSeq(missionId: string): number {
    const detail = this.missions.get(missionId);
    if (!detail) throw new Error(`Unknown Mission ${missionId}`);
    detail.seq += 1;
    return detail.seq;
  }

  /** Pushes an event through the fake stream and applies the parts a refetch must reflect to the stored detail. */
  emit(event: MissionEvent): void {
    const detail = this.missions.get(event.missionId);
    if (detail) {
      detail.seq = Math.max(detail.seq, event.seq);
      if (event.type === 'mission.state') {
        detail.summary.state = event.state;
        if (event.state === 'needs_attention') {
          detail.attention = {
            cause: event.cause ?? 'engine_error',
            reason: event.reason ?? '',
            slot: event.slot ?? '',
            failedChecks: event.failedChecks ?? [],
          };
        }
        if (event.state === 'running') delete detail.attention;
      }
      if (event.type === 'mission.completed') {
        detail.summary.state = 'completed';
        detail.summary.currentSlot = null;
        detail.result = { report: event.report, pr: event.pr, exitSlot: event.exitSlot };
      }
      if (event.type === 'mission.stopped') {
        detail.summary.state = 'stopped';
        detail.summary.currentSlot = null;
        delete detail.pendingQuestion;
        delete detail.attention;
      }
      if (event.type === 'slot.started') {
        detail.summary.currentSlot = event.slot;
        const execution = {
          slot: event.slot,
          attempt: event.attempt,
          ...(event.loopIteration !== undefined && { loopIteration: event.loopIteration }),
          ...(event.loopFrom !== undefined && { loopFrom: event.loopFrom }),
        };
        const entries =
          event.note !== undefined
            ? [
                {
                  id: `${event.missionId}:${event.seq}`,
                  at: new Date().toISOString(),
                  kind: 'note' as const,
                  text: event.note,
                },
              ]
            : [];
        detail.transcript.push({ execution, entries, dropped: 0 });
      }
      if (event.type === 'agent.text') {
        detail.transcript.at(-1)?.entries.push({
          id: `${event.missionId}:${event.seq}`,
          at: new Date().toISOString(),
          kind: 'text',
          text: event.payload.text,
        });
      }
      if (event.type === 'question.asked') {
        detail.pendingQuestion = {
          id: event.questionId,
          slot: event.slot,
          questions: event.questions,
        };
        detail.transcript.at(-1)?.entries.push({
          id: `${event.missionId}:${event.seq}`,
          at: new Date().toISOString(),
          kind: 'question',
          questionId: event.questionId,
          questions: event.questions,
        });
      }
      if (event.type === 'question.answered') {
        delete detail.pendingQuestion;
        detail.transcript.at(-1)?.entries.push({
          id: `${event.missionId}:${event.seq}`,
          at: new Date().toISOString(),
          kind: 'answer',
          questionId: event.questionId,
          answers: event.answers,
        });
      }
    }
    this.live.emit(event);
  }

  effectiveMayAsk(project: string, assembly: string): Record<string, boolean> {
    const doc = this.projects.get(project)?.assemblies.get(assembly)?.doc;
    if (!doc) return {};
    const core = resolveCore(doc.core);
    const result: Record<string, boolean> = {};
    doc.slots.forEach((slot, index) => {
      const unit = this.units.get(slot.unit);
      result[slot.name] = unit
        ? resolveSlot(slot, unit, core, index === doc.slots.length - 1).mayAskCommander
        : (slot.mayAskCommander ?? DEFAULTS.unit.mayAskCommander);
    });
    return result;
  }
}

function json(body: unknown, status = 200) {
  return HttpResponse.json(body as Record<string, unknown>, { status });
}

function preconditions(
  request: Request,
  exists: boolean,
  currentEtag: string | null,
  current: () => unknown,
) {
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const ifMatch = request.headers.get('if-match');
  if (force) return { ok: true as const, status: 200 as const };
  if (ifMatch !== null) {
    if (!exists) return { ok: true as const, status: 201 as const };
    if (ifMatch !== currentEtag)
      return {
        ok: false as const,
        response: json({ current: { data: current(), etag: currentEtag } }, 412),
      };
    return { ok: true as const, status: 200 as const };
  }
  if (exists)
    return { ok: false as const, response: json({ reason: 'precondition_required' }, 428) };
  return { ok: true as const, status: 201 as const };
}

export function handlersFor(home: FakeHome): HttpHandler[] {
  const record = async (request: Request) => {
    let body: unknown;
    try {
      body = await request.clone().json();
    } catch {
      body = undefined;
    }
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => (headers[k] = v));
    home.requests.push({
      method: request.method,
      url: new URL(request.url).pathname + new URL(request.url).search,
      body,
      headers,
    });
    return body;
  };

  return [
    http.get('/api/health', () =>
      json({ engine: { ok: true }, host: { ok: true }, configHome: home.home }),
    ),
    http.get('/api/models', () => json(home.models)),

    http.get('/api/units', () =>
      json({
        items: [...home.units.entries()].map(([name, unit]) => ({
          name,
          unit,
          etag: etagOf(unit),
          issues: [],
        })),
      }),
    ),
    http.get('/api/units/:name', ({ params }) => {
      const name = String(params.name);
      const unit = home.units.get(name);
      if (!unit) return json({ reason: 'not_found' }, 404);
      return json({
        name,
        unit,
        etag: etagOf(unit),
        issues: [],
        usage: {
          assemblies: home.unitUsage(name),
          activeMissions: home.activeMissions({ unit: name }),
        },
      });
    }),
    http.put('/api/units/:name', async ({ params, request }) => {
      const body = await record(request);
      const parsed = unitFileSchema.safeParse(body);
      if (!parsed.success)
        return json(
          {
            issues: parsed.error.issues.map((i) => ({
              code: 'invalid_field',
              message: i.message,
              path: i.path.join('.'),
            })),
          },
          400,
        );
      const oldName = String(params.name);
      const unit = parsed.data;
      if (unit.name !== oldName) {
        if (!home.units.has(oldName)) return json({ reason: 'not_found' }, 404);
        const usedBy = home.unitUsage(oldName);
        if (usedBy.length > 0) return json({ reason: 'in_use', usedBy }, 409);
        if (home.units.has(unit.name)) return json({ reason: 'name_taken' }, 409);
        home.units.delete(oldName);
        home.units.set(unit.name, unit);
        return json({ unit, etag: etagOf(unit) });
      }
      const existing = home.units.get(oldName);
      const pre = preconditions(
        request,
        existing !== undefined,
        existing ? etagOf(existing) : null,
        () => existing,
      );
      if (!pre.ok) return pre.response;
      home.units.set(unit.name, unit);
      return json({ unit, etag: etagOf(unit) }, pre.status);
    }),
    http.delete('/api/units/:name', async ({ params, request }) => {
      await record(request);
      const name = String(params.name);
      if (!home.units.has(name)) return json({ reason: 'not_found' }, 404);
      const usedBy = home.unitUsage(name);
      if (usedBy.length > 0) return json({ reason: 'in_use', usedBy }, 409);
      home.units.delete(name);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('/api/units/:name/duplicate', async ({ params, request }) => {
      const body = (await record(request)) as { newName: string };
      const unit = home.units.get(String(params.name));
      if (!unit) return json({ reason: 'not_found' }, 404);
      if (home.units.has(body.newName)) return json({ reason: 'name_taken' }, 409);
      const copy = { ...unit, name: body.newName };
      home.units.set(copy.name, copy);
      return json({ unit: copy, etag: etagOf(copy) }, 201);
    }),

    http.get('/api/projects', () =>
      json({ items: [...home.projects.entries()].map(([name, p]) => home.projectItem(name, p)) }),
    ),
    http.post('/api/projects', async ({ request }) => {
      const body = (await record(request)) as { profile: unknown };
      const parsed = profileFileSchema.safeParse(body?.profile);
      if (!parsed.success)
        return json(
          {
            issues: parsed.error.issues.map((i) => ({
              code: 'invalid_field',
              message: i.message,
              path: i.path.join('.'),
            })),
          },
          400,
        );
      if (home.projects.has(parsed.data.name)) return json({ reason: 'name_taken' }, 409);
      home.projects.set(parsed.data.name, {
        profile: parsed.data,
        assemblies: new Map(),
        checkouts: [],
      });
      return json({ profile: parsed.data, etag: etagOf(parsed.data) }, 201);
    }),
    http.get('/api/projects/:project', ({ params }) => {
      const name = String(params.project);
      const p = home.projects.get(name);
      return p ? json(home.projectItem(name, p)) : json({ reason: 'not_found' }, 404);
    }),
    http.put('/api/projects/:project/profile', async ({ params, request }) => {
      const body = await record(request);
      const parsed = profileFileSchema.safeParse(body);
      if (!parsed.success)
        return json(
          {
            issues: parsed.error.issues.map((i) => ({
              code: 'invalid_field',
              message: i.message,
              path: i.path.join('.'),
            })),
          },
          400,
        );
      const oldName = String(params.project);
      const p = home.projects.get(oldName);
      if (parsed.data.name !== oldName) {
        if (!p) return json({ reason: 'not_found' }, 404);
        const active = home.activeMissions({ project: oldName });
        if (active > 0) return json({ reason: 'active_missions', count: active }, 409);
        if (home.projects.has(parsed.data.name)) return json({ reason: 'name_taken' }, 409);
        home.projects.delete(oldName);
        home.projects.set(parsed.data.name, { ...p, profile: parsed.data });
        return json({ profile: parsed.data, etag: etagOf(parsed.data) });
      }
      const pre = preconditions(
        request,
        p !== undefined,
        p ? etagOf(p.profile) : null,
        () => p?.profile,
      );
      if (!pre.ok) return pre.response;
      if (p) p.profile = parsed.data;
      else
        home.projects.set(parsed.data.name, {
          profile: parsed.data,
          assemblies: new Map(),
          checkouts: [],
        });
      return json({ profile: parsed.data, etag: etagOf(parsed.data) }, pre.status);
    }),
    http.delete('/api/projects/:project', async ({ params, request }) => {
      await record(request);
      const name = String(params.project);
      if (!home.projects.has(name)) return json({ reason: 'not_found' }, 404);
      const active = home.activeMissions({ project: name });
      if (active > 0) return json({ reason: 'active_missions', count: active }, 409);
      home.projects.delete(name);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/projects/:project/checkouts', ({ params }) => {
      const p = home.projects.get(String(params.project));
      if (!p) return json({ reason: 'not_found' }, 404);
      if (p.checkoutsError)
        return json({ reason: 'checkouts_unavailable', message: p.checkoutsError }, 500);
      return json(
        p.checkouts.map((c) => ({
          ...c,
          busyMissionId:
            [...home.missions.values()].find(
              (m) =>
                m.summary.checkoutPath === c.path &&
                m.summary.state !== 'completed' &&
                m.summary.state !== 'stopped',
            )?.summary.id ?? null,
        })),
      );
    }),
    http.get('/api/projects/:project/assemblies/:assembly', ({ params }) => {
      const project = String(params.project);
      const name = String(params.assembly);
      const a = home.projects.get(project)?.assemblies.get(name);
      if (!a) return json({ reason: 'not_found' }, 404);
      return json({
        name,
        assembly: a.doc,
        ...(a.doc === null && { text: a.text ?? 'name: [broken' }),
        etag: etagOf(a.doc ?? a.text),
        ...home.assemblyStatus(project, name, a),
        activeMissions: home.activeMissions({ project, assembly: name }),
      });
    }),
    http.put('/api/projects/:project/assemblies/:assembly', async ({ params, request }) => {
      const body = await record(request);
      const parsed = assemblyFileSchema.safeParse(body);
      if (!parsed.success)
        return json(
          {
            issues: parsed.error.issues.map((i) => ({
              code: 'invalid_field',
              message: i.message,
              path: i.path.join('.'),
            })),
          },
          400,
        );
      const project = String(params.project);
      const oldName = String(params.assembly);
      const p = home.projects.get(project);
      if (!p) return json({ reason: 'not_found' }, 404);
      const validation = validateAssembly(parsed.data, [...home.units.values()]);
      if (validation.errors.length > 0) return json({ issues: validation.errors }, 400);
      const doc = parsed.data;
      if (doc.name !== oldName) {
        if (!p.assemblies.has(oldName)) return json({ reason: 'not_found' }, 404);
        if (p.assemblies.has(doc.name)) return json({ reason: 'name_taken' }, 409);
        p.assemblies.delete(oldName);
        p.assemblies.set(doc.name, { doc });
        return json({ assembly: doc, etag: etagOf(doc), warnings: validation.warnings });
      }
      const existing = p.assemblies.get(oldName);
      const pre = preconditions(
        request,
        existing !== undefined,
        existing ? etagOf(existing.doc ?? existing.text) : null,
        () => existing?.doc,
      );
      if (!pre.ok) return pre.response;
      p.assemblies.set(doc.name, { doc });
      return json({ assembly: doc, etag: etagOf(doc), warnings: validation.warnings }, pre.status);
    }),
    http.delete('/api/projects/:project/assemblies/:assembly', async ({ params, request }) => {
      await record(request);
      const project = String(params.project);
      const name = String(params.assembly);
      const p = home.projects.get(project);
      if (!p?.assemblies.has(name)) return json({ reason: 'not_found' }, 404);
      const active = home.activeMissions({ project, assembly: name });
      if (active > 0) return json({ reason: 'active_missions', count: active }, 409);
      p.assemblies.delete(name);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(
      '/api/projects/:project/assemblies/:assembly/duplicate',
      async ({ params, request }) => {
        const body = (await record(request)) as { newName: string };
        const p = home.projects.get(String(params.project));
        const a = p?.assemblies.get(String(params.assembly));
        if (!p || !a?.doc) return json({ reason: 'not_found' }, 404);
        if (p.assemblies.has(body.newName)) return json({ reason: 'name_taken' }, 409);
        const copy = { ...a.doc, name: body.newName };
        p.assemblies.set(copy.name, { doc: copy });
        return json({ assembly: copy, etag: etagOf(copy) }, 201);
      },
    ),

    http.post('/api/open', async ({ request }) => {
      const body = (await record(request)) as { path: string };
      if (!body.path.startsWith(home.home)) return json({ reason: 'outside_home' }, 400);
      home.opened.push(body.path);
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('/api/git/remote-defaults', ({ request }) => {
      const path = new URL(request.url).searchParams.get('path') ?? '';
      const repo = home.repositories.get(path);
      return repo
        ? json({ remote: 'origin', remoteUrl: repo.remoteUrl, headBranch: repo.headBranch })
        : json({ reason: 'not_a_repository' }, 404);
    }),
    http.get('/api/fs/stat', ({ request }) => {
      const url = new URL(request.url);
      const raw = url.searchParams.get('path') ?? '';
      const base = url.searchParams.get('base');
      const path = raw.startsWith('/') ? raw : base ? `${base.replace(/\/$/, '')}/${raw}` : raw;
      const kind = home.existingPaths.get(path);
      return json(kind ? { exists: true, kind, path } : { exists: false, path });
    }),

    http.get('/api/missions', () => json([...home.missions.values()].map((m) => m.summary))),
    http.post('/api/missions', async ({ request }) => {
      const body = (await record(request)) as Parameters<FakeHome['startMission']>[0];
      const issues: { field: string; message: string }[] = [];
      const project = home.projects.get(body.project);
      if (!project?.assemblies.get(body.assembly)?.doc)
        issues.push({ field: 'assembly', message: 'Unknown Assembly' });
      if (body.task.kind === 'path' && !home.existingPaths.has(body.task.path))
        issues.push({
          field: 'taskPath',
          message: `The Task location does not exist: ${body.task.path}`,
        });
      if (body.task.kind === 'text' && body.task.text.trim() === '')
        issues.push({ field: 'taskText', message: 'The Task text is empty' });
      if (project && !project.checkouts.some((c) => c.path === body.checkoutPath))
        issues.push({ field: 'checkoutPath', message: 'Not a Checkout of the Project' });
      if (issues.length > 0) return json({ issues }, 400);
      const busy = [...home.missions.values()].find(
        (m) =>
          m.summary.checkoutPath === body.checkoutPath &&
          m.summary.state !== 'completed' &&
          m.summary.state !== 'stopped',
      );
      if (busy) return json({ reason: 'checkout_busy', missionId: busy.summary.id }, 409);
      return json(home.startMission(body).summary, 201);
    }),
    http.get('/api/missions/:id', async ({ params, request }) => {
      await record(request);
      const m = home.missions.get(String(params.id));
      return m ? json(m) : json({ reason: 'not_found' }, 404);
    }),
    http.post('/api/missions/:id/stop', async ({ params, request }) => {
      await record(request);
      const id = String(params.id);
      const m = home.missions.get(id);
      if (!m) return json({ reason: 'not_found' }, 404);
      if (m.summary.state !== 'completed' && m.summary.state !== 'stopped') {
        home.emit({
          type: 'mission.state',
          missionId: id,
          seq: home.nextSeq(id),
          state: 'stopped',
        });
        home.emit({ type: 'mission.stopped', missionId: id, seq: home.nextSeq(id) });
      }
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('/api/missions/:id/retry', async ({ params, request }) => {
      const body = ((await record(request)) ?? {}) as { note?: string };
      const id = String(params.id);
      const m = home.missions.get(id);
      if (!m) return json({ reason: 'not_found' }, 404);
      if (m.summary.state !== 'needs_attention' || !m.attention)
        return json({ reason: 'not_needs_attention' }, 409);
      const slot = m.attention.slot;
      const attempt = (m.slots.find((s) => s.name === slot)?.attempts ?? 0) + 1;
      home.emit({ type: 'mission.state', missionId: id, seq: home.nextSeq(id), state: 'running' });
      home.emit({
        type: 'slot.started',
        missionId: id,
        seq: home.nextSeq(id),
        slot,
        attempt,
        ...(body.note && { note: body.note }),
      });
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('/api/missions/:id/answer', async ({ params, request }) => {
      const body = (await record(request)) as {
        questionId: string;
        answers: Record<string, string>;
      };
      const id = String(params.id);
      const m = home.missions.get(id);
      if (!m) return json({ reason: 'not_found' }, 404);
      if (m.pendingQuestion?.id !== body.questionId)
        return json({ reason: 'no_such_question' }, 409);
      const slot = m.pendingQuestion.slot;
      home.emit({
        type: 'question.answered',
        missionId: id,
        seq: home.nextSeq(id),
        slot,
        questionId: body.questionId,
        answers: body.answers,
      });
      home.emit({ type: 'mission.state', missionId: id, seq: home.nextSeq(id), state: 'running' });
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete('/api/missions/:id', async ({ params, request }) => {
      await record(request);
      const id = String(params.id);
      const m = home.missions.get(id);
      if (!m) return json({ reason: 'not_found' }, 404);
      if (m.summary.state !== 'completed' && m.summary.state !== 'stopped')
        return json({ reason: 'not_finished' }, 409);
      home.missions.delete(id);
      home.live.emit({ type: 'mission.dismissed', missionId: id, seq: m.seq + 1 });
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}

export const mswServer = setupServer();

/** Installs the handlers of a fresh FakeHome for the current test. */
export function useFakeHome(home: FakeHome = FakeHome.primary()): FakeHome {
  mswServer.resetHandlers(...handlersFor(home));
  return home;
}
