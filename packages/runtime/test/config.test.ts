import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ConfigWriter,
  DEFAULTS,
  assemblyFileSchema,
  buildSnapshot,
  defaultMemoryMode,
  findUnitUsage,
  loadConfig,
  parseUnitMarkdown,
  profileFileSchema,
  referencesToSlot,
  serializeAssembly,
  serializeProfile,
  serializeUnit,
  uniqueSlotName,
  validateAssembly,
  type AssemblyFile,
  type UnitFile,
} from '../src/index.js';
import {
  briefAssembly,
  briefUnits,
  folderProfile,
  noneProfile,
  primaryAssembly,
  primaryProfile,
  primaryUnits,
  writePrimaryHome,
} from '../src/testing/index.js';
import { capabilitiesOf, missingCapabilities, type Capability } from '../src/workspace/kinds.js';

const units = primaryUnits();
const ALL: ReadonlySet<Capability> = new Set<Capability>(['files', 'git', 'host']);
const NONE: ReadonlySet<Capability> = new Set();
const NO_HOST: ReadonlySet<Capability> = new Set<Capability>(['files', 'git']);

function assembly(overrides: Partial<AssemblyFile> = {}): AssemblyFile {
  return { ...primaryAssembly(), ...overrides };
}

describe('validateAssembly', () => {
  it('accepts the primary scenario', () => {
    const result = validateAssembly(primaryAssembly(), units, ALL);
    expect(result.errors).toEqual([]);
  });

  it.each([
    ['unknown_unit', { slots: [{ name: 'a', unit: 'nope' }] }],
    [
      'duplicate_slot_name',
      {
        slots: [
          { name: 'a', unit: 'analyst' },
          { name: 'a', unit: 'tester' },
        ],
      },
    ],
    ['no_slots', { slots: [] }],
    [
      'loop_target_not_earlier',
      { slots: [{ name: 'a', unit: 'analyst', loop: { target: 'a', limit: 3 } }] },
    ],
    [
      'loop_target_not_earlier',
      {
        slots: [
          { name: 'a', unit: 'analyst', loop: { target: 'b', limit: 3 } },
          { name: 'b', unit: 'tester' },
        ],
      },
    ],
    [
      'loop_target_missing',
      { slots: [{ name: 'a', unit: 'analyst', loop: { target: 'zz', limit: 3 } }] },
    ],
    [
      'context_reference_not_earlier',
      {
        slots: [
          { name: 'a', unit: 'analyst', context: { slotOutputs: ['b'] } },
          { name: 'b', unit: 'tester' },
        ],
      },
    ],
    [
      'context_reference_missing',
      { slots: [{ name: 'a', unit: 'analyst', context: { slotOutputs: ['zz'] } }] },
    ],
    [
      'exit_condition_required',
      {
        slots: [
          { name: 'a', unit: 'analyst', exitPoint: true },
          { name: 'b', unit: 'tester' },
        ],
      },
    ],
    ['last_slot_not_exit_point', { slots: [{ name: 'a', unit: 'analyst', exitPoint: false }] }],
  ] as [string, Partial<AssemblyFile>][])('reports %s', (code, overrides) => {
    const result = validateAssembly(assembly(overrides), units, ALL);
    expect(result.errors.map((e) => e.code)).toContain(code);
  });

  it('warns about an unread Slot Output', () => {
    const result = validateAssembly(primaryAssembly(), units, ALL);
    expect(result.warnings.map((w) => w.slotName)).toEqual(['implementer', 'publisher']);
  });

  it('rejects host Checks and Git conventions the Workspace does not provide', () => {
    const none = validateAssembly(primaryAssembly(), units, NONE);
    const codes = none.errors.map((e) => [e.code, e.slotName, e.path]);
    expect(codes).toContainEqual(['check_unavailable', 'publisher', 'doneCondition[0]']);
    expect(codes).toContainEqual(['check_unavailable', 'pr-reviewer', 'doneCondition[0]']);
    expect(codes).toContainEqual(['check_unavailable', 'pr-reviewer', 'doneCondition[1]']);
    expect(codes).toContainEqual([
      'context_source_unavailable',
      'implementer',
      'context.gitConventions',
    ]);
    expect(none.errors.find((e) => e.slotName === 'publisher')?.message).toBe(
      'Slot "publisher" uses the Check "Pull Request exists", which needs a host this Project\'s Workspace does not provide',
    );
    // command and llm_judgment need nothing (the reviewer only loses its Git conventions)
    expect(codes.some(([code, slot]) => code === 'check_unavailable' && slot === 'reviewer')).toBe(
      false,
    );
    expect(codes.some(([, slot]) => slot === 'tester')).toBe(false);
    // a repository without a host keeps the Git conventions but loses the host Checks
    const noHost = validateAssembly(primaryAssembly(), units, NO_HOST);
    expect(noHost.errors.map((e) => e.code)).toEqual([
      'check_unavailable',
      'check_unavailable',
      'check_unavailable',
    ]);
    // an Exit Condition and a Slot override are judged too; the Unit default is replaced by the override
    const overridden = assembly({
      slots: [
        {
          name: 'publisher',
          unit: 'publisher',
          doneCondition: [{ kind: 'command', command: 'true' }],
        },
        { name: 'tester', unit: 'tester', exitPoint: true, exitCondition: [{ kind: 'ci_green' }] },
      ],
    });
    expect(validateAssembly(overridden, units, NONE).errors).toEqual([
      expect.objectContaining({
        code: 'check_unavailable',
        slotName: 'tester',
        path: 'exitCondition[0]',
      }),
    ]);
    // null capabilities (invalid Profile): the capability rules are skipped
    expect(validateAssembly(primaryAssembly(), units, null).errors).toEqual([]);
    expect(validateAssembly(briefAssembly(), briefUnits(), NONE).errors).toEqual([]);
  });
});

describe('capabilities', () => {
  it('derives them from the Workspace kind and the host', () => {
    expect([...capabilitiesOf({ kind: 'none' })]).toEqual([]);
    expect([...capabilitiesOf({ kind: 'folder', path: '/x' })]).toEqual(['files']);
    expect([...capabilitiesOf(primaryProfile('/repo').workspace)]).toEqual([
      'files',
      'git',
      'host',
    ]);
    expect([
      ...capabilitiesOf({ ...primaryProfile('/repo').workspace, host: 'none' } as never),
    ]).toEqual(['files', 'git']);
    expect(missingCapabilities(['host'], NO_HOST)).toEqual(['host']);
    expect(missingCapabilities(['git'], NO_HOST)).toEqual([]);
  });
});

describe('buildSnapshot', () => {
  it('merges Slot overrides over Unit values over defaults', () => {
    const doc = assembly({
      slots: [
        { name: 'analyst', unit: 'analyst' },
        {
          name: 'reviewer',
          unit: 'reviewer',
          model: 'sonnet',
          instructions: 'Also check the docs.',
          doneCondition: [{ kind: 'command', command: 'pnpm lint' }],
          attemptLimit: 5,
          loop: {
            target: 'analyst',
            limit: 2,
            acceptCondition: [{ kind: 'llm_judgment', criterion: 'Nothing blocking remains.' }],
          },
        },
      ],
    });
    const snapshot = buildSnapshot(primaryProfile('/repo'), doc, primaryUnits(), {
      analyst: false,
    });
    const [analyst, reviewer] = snapshot.assembly.slots;
    expect(analyst!.mayAskCommander).toBe(false);
    expect(analyst!.attemptLimit).toBe(2);
    expect(analyst!.memoryMode).toBe('fresh');
    expect(analyst!.context).toEqual({ ...DEFAULTS.slot.context, slotOutputs: [] });
    expect(analyst!.exitPoint).toBe(false);
    expect(reviewer!.model).toBe('sonnet');
    expect(reviewer!.instructions).toMatch(/^Review the diff[\s\S]*Also check the docs\.$/);
    expect(reviewer!.doneCondition).toEqual([{ kind: 'command', command: 'pnpm lint' }]);
    expect(reviewer!.attemptLimit).toBe(5);
    expect(reviewer!.loop).toEqual({
      target: 'analyst',
      limit: 2,
      acceptCondition: [{ kind: 'llm_judgment', criterion: 'Nothing blocking remains.' }],
    });
    expect(reviewer!.exitPoint).toBe(true);
    expect(Object.isFrozen(snapshot.assembly.slots)).toBe(true);
  });
});

describe('buildSnapshot memory default', () => {
  it('keeps the session of a Slot that may ask the Commander unless the file says otherwise', () => {
    const doc = assembly({
      slots: [
        { name: 'analyst', unit: 'analyst' },
        { name: 'analyst-fresh', unit: 'analyst', memoryMode: 'fresh' },
        { name: 'reviewer', unit: 'reviewer' },
      ],
    });
    const asks = buildSnapshot(primaryProfile('/repo'), doc, primaryUnits(), { analyst: true });
    const [analyst, analystFresh, reviewer] = asks.assembly.slots;
    expect(analyst!.mayAskCommander).toBe(true);
    expect(analyst!.memoryMode).toBe('persistent');
    expect(analystFresh!.memoryMode).toBe('fresh');
    expect(reviewer!.mayAskCommander).toBe(false);
    expect(reviewer!.memoryMode).toBe('fresh');
    expect(defaultMemoryMode(true)).toBe('persistent');
    expect(defaultMemoryMode(false)).toBe(DEFAULTS.slot.memoryMode);
  });
});

describe('unit markdown', () => {
  it('parses frontmatter and the two sections', () => {
    const parsed = parseUnitMarkdown(
      '---\nname: reviewer\nmodel: sonnet\n---\n## Rules\nNever edit.\n\n## Instructions\nReview.\n',
    );
    expect(parsed.unit).toEqual({
      name: 'reviewer',
      model: 'sonnet',
      mayAskCommander: false,
      doneCondition: [],
      rules: 'Never edit.',
      instructions: 'Review.',
    });
  });

  it('reports a missing section', () => {
    const parsed = parseUnitMarkdown('---\nname: x\nmodel: m\n---\n## Rules\nr\n');
    expect(parsed.unit).toBeNull();
    expect(parsed.issues[0]?.code).toBe('invalid_sections');
  });
});

describe('serialize round-trips', () => {
  it('units', () => {
    for (const unit of primaryUnits()) {
      const parsed = parseUnitMarkdown(serializeUnit(unit));
      expect(parsed.unit).toEqual(unit);
    }
  });

  it('profile of every Workspace kind, with path and text Knowledge Sources', () => {
    const repository = primaryProfile('/repo');
    expect(profileFileSchema.parse(serializeProfileToObject(repository))).toEqual(repository);
    const text = serializeProfile(repository);
    expect(text).not.toContain('remote:');
    expect(text).not.toContain('host:');
    expect(text).not.toContain('engine:');
    const folder = {
      ...folderProfile('/notes'),
      knowledgeSources: [
        { path: 'conventions.md', title: 'Conventions' },
        { text: 'Write short sentences.' },
      ],
    };
    expect(profileFileSchema.parse(serializeProfileToObject(folder))).toEqual(folder);
    const none = noneProfile();
    expect(profileFileSchema.parse(serializeProfileToObject(none))).toEqual(none);
    const noHost = {
      ...repository,
      workspace: { ...repository.workspace, host: 'none' as const, ciWaitTimeoutMinutes: 5 },
    };
    expect(serializeProfile(noHost)).toContain('host: none');
    expect(profileFileSchema.parse(serializeProfileToObject(noHost))).toEqual(noHost);
  });

  it('rejects foreign fields of another kind and a relative path without a Workspace', () => {
    const stray = profileFileSchema.safeParse({
      name: 'x',
      workspace: { kind: 'folder', path: '/x', protectedBranch: 'main' },
    });
    expect(stray.success).toBe(false);
    const relative = profileFileSchema.safeParse({
      name: 'x',
      workspace: { kind: 'none' },
      knowledgeSources: [{ path: 'README.md' }],
    });
    expect(relative.success).toBe(false);
    if (!relative.success) {
      expect(relative.error.issues[0]?.path).toEqual(['knowledgeSources', 0, 'path']);
    }
    expect(
      profileFileSchema.safeParse({
        name: 'x',
        workspace: { kind: 'none' },
        knowledgeSources: [{ path: '/abs/README.md' }, { text: 't' }],
      }).success,
    ).toBe(true);
  });

  it('assembly with every optional field', async () => {
    const doc = assembly({
      slots: [
        {
          name: 'analyst',
          unit: 'analyst',
          mayAskCommander: true,
          context: { taskDocuments: false },
        },
        {
          name: 'reviewer',
          unit: 'reviewer',
          model: 'sonnet',
          instructions: 'x',
          memoryMode: 'persistent',
          context: { knowledgeSources: false, gitConventions: true, slotOutputs: ['analyst'] },
          doneCondition: [],
          attemptLimit: 1,
          loop: {
            target: 'analyst',
            limit: 2,
            acceptCondition: [{ kind: 'llm_judgment', criterion: 'nothing blocking' }],
          },
          exitPoint: true,
          exitCondition: [{ kind: 'llm_judgment', criterion: 'ok' }],
        },
      ],
    });
    const text = serializeAssembly(doc);
    const reparsed = assemblyFileSchema.parse(parse(text));
    expect(reparsed).toEqual(doc);
    expect(text).toContain('exitPoint: true');
    expect(text).toContain('acceptCondition');
    expect(text).not.toContain('memoryMode: fresh');
  });

  it('omits defaults and writes exitPoint on the last Slot', async () => {
    const text = serializeAssembly(primaryAssembly());
    expect(text).not.toContain('defaultAttemptLimit');
    expect(text.trim().endsWith('exitPoint: true')).toBe(true);
    expect(assemblyFileSchema.parse(parse(text))).toEqual(primaryAssembly());
  });
});

function serializeProfileToObject(profile: ReturnType<typeof primaryProfile>) {
  return parse(serializeProfile(profile));
}

describe('slot names and usage', () => {
  it('uniqueSlotName adds a numeric suffix', () => {
    expect(uniqueSlotName('reviewer', ['reviewer', 'reviewer-2'])).toBe('reviewer-3');
    expect(uniqueSlotName('tester', [])).toBe('tester');
  });

  it('referencesToSlot finds loops and slot outputs', () => {
    expect(referencesToSlot(primaryAssembly(), 'implementer')).toEqual([
      { from: 'reviewer', kind: 'loop' },
      { from: 'tester', kind: 'loop' },
      { from: 'pr-reviewer', kind: 'loop' },
    ]);
    expect(referencesToSlot(primaryAssembly(), 'analyst')).toEqual([
      { from: 'implementer', kind: 'slotOutput' },
    ]);
  });
});

describe('loadConfig and ConfigWriter', () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'suptron-home-'));
    await writePrimaryHome(home, '/repo');
  });
  afterEach(() => rm(home, { recursive: true, force: true }));

  it('loads the primary scenario with zero issues', async () => {
    const config = await loadConfig(home);
    expect(config.units.map((u) => u.name)).toEqual([
      'analyst',
      'implementer',
      'pr-reviewer',
      'publisher',
      'reviewer',
      'tester',
    ]);
    expect(config.units.every((u) => u.issues.length === 0 && u.unit)).toBe(true);
    const project = config.projects[0]!;
    expect(project.name).toBe('my-app');
    expect(project.issues).toEqual([]);
    expect(project.assemblies[0]).toMatchObject({ name: 'feature', status: 'valid' });
    expect(findUnitUsage(config, 'implementer')).toEqual([
      { project: 'my-app', assembly: 'feature' },
    ]);
  });

  it('reports a name mismatch, an invalid and an unparseable file', async () => {
    await writeFile(
      join(home, 'hangar', 'other.md'),
      serializeUnit({ ...primaryUnits()[0]!, name: 'analyst' }),
    );
    await writeFile(
      join(home, 'projects', 'my-app', 'assemblies', 'broken.yaml'),
      'name: broken\ncore: { model: opus }\nslots:\n  - name: a\n    unit: analyst\n    loop: { target: b }\n  - name: b\n    unit: tester\n',
    );
    await writeFile(join(home, 'projects', 'my-app', 'assemblies', 'bad.yaml'), 'name: [unclosed');
    const config = await loadConfig(home);
    expect(config.units.find((u) => u.name === 'other')?.issues[0]?.code).toBe('name_mismatch');
    const assemblies = config.projects[0]!.assemblies;
    expect(assemblies.find((a) => a.name === 'broken')?.status).toBe('invalid');
    expect(assemblies.find((a) => a.name === 'broken')?.issues.errors[0]?.code).toBe(
      'loop_target_not_earlier',
    );
    expect(assemblies.find((a) => a.name === 'bad')?.status).toBe('unparseable');
  });

  it('writes atomically with etag checks', async () => {
    const writer = new ConfigWriter(home);
    const rel = 'hangar/analyst.md';
    const current = (await writer.read(rel))!;
    const stale = await writer.writeIfMatch(rel, 'x', { etag: 'nope' });
    expect(stale).toMatchObject({ ok: false, reason: 'conflict' });
    expect(await readFile(join(home, rel), 'utf8')).toBe(current.text);
    const ok = await writer.writeIfMatch(rel, 'new text', { etag: current.etag });
    expect(ok).toEqual({ ok: true, etag: writer.etagOf('new text') });
    expect(await writer.writeIfMatch(rel, 'again', { create: true })).toMatchObject({
      ok: false,
      reason: 'exists',
    });
    expect(await writer.writeIfMatch('hangar/missing.md', 'x', { etag: 'e' })).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(await writer.writeIfMatch(rel, 'forced', { force: true })).toMatchObject({ ok: true });
    expect(() => writer.resolve('../outside')).toThrow();
    await writer.rename(rel, 'hangar/renamed.md');
    expect(await writer.read(rel)).toBeNull();
    expect((await writer.read('hangar/renamed.md'))?.text).toBe('forced');
  });
});

describe('templates', () => {
  it('renders placeholders and drops an empty work item with its separator', async () => {
    const { render, slugify, renderGitConventions } = await import('../src/templates/index.js');
    const values = { workItemId: 'ABC-12', taskTitle: 'Add Login', taskSlug: 'add-login' };
    expect(render('feature/{work_item_id}-{task_slug}', values)).toBe('feature/ABC-12-add-login');
    expect(render('feature/{work_item_id}-{task_slug}', { ...values, workItemId: '' })).toBe(
      'feature/add-login',
    );
    expect(
      render('{task_slug}/{work_item_id}', {
        taskTitle: values.taskTitle,
        taskSlug: values.taskSlug,
      }),
    ).toBe('add-login');
    expect(render('## {task_title}', values)).toBe('## Add Login');
    expect(slugify('Add  Login — v2!')).toBe('add-login-v2');
    const workspace = primaryProfile('/repo').workspace;
    if (workspace.kind !== 'repository') throw new Error('unexpected kind');
    const text = renderGitConventions(workspace, values);
    expect(text).toContain('Branch convention: feature/ABC-12-add-login');
    expect(text).not.toMatch(/suggest/i);
    expect(text).toContain('## Add Login');
  });
});

describe('UnitFile type', () => {
  it('is the parsed shape', () => {
    const unit: UnitFile = primaryUnits()[0]!;
    expect(unit.name).toBe('analyst');
  });
});
