import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  briefAssembly,
  briefUnits,
  folderProfile,
  noneProfile,
  serializeAssembly,
  serializeProfile,
  serializeUnit,
  type AssemblyFile,
  type ImportChoices,
  type ImportElement,
  type ProfileFile,
  type TransferFile,
  type UnitFile,
} from '@suptron/runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testServer, type TestServer } from './helpers.js';

/** A valid Unit with the given name. */
function unit(name: string, instructions = `Do the ${name} work.`): UnitFile {
  return {
    name,
    model: 'sonnet',
    mayAskCommander: false,
    doneCondition: [],
    rules: 'Stay in the Workspace.',
    instructions,
  };
}

/** The brief Assembly whose researcher also calls a Sub-pilot and starts a Side Slot. */
function briefWithHelpers(): AssemblyFile {
  const assembly = briefAssembly();
  const [researcher, writer] = assembly.slots;
  return {
    ...assembly,
    slots: [
      {
        ...researcher!,
        subPilots: [{ unit: 'fact-checker' }],
        sideSlots: [{ unit: 'archivist', subPilots: [{ unit: 'indexer' }] }],
      },
      writer!,
    ],
  };
}

const NO_CHOICES: ImportChoices = { replace: [], paths: {} };

/** A Unit as an Export holds it. */
function unitFile(u: UnitFile): TransferFile {
  return { path: `hangar/${u.name}.md`, text: serializeUnit(u) };
}

/** A Profile as an Export holds it. */
function profileFile(profile: ProfileFile): TransferFile {
  return { path: `projects/${profile.name}/profile.yaml`, text: serializeProfile(profile) };
}

/** An Assembly of `project` as an Export holds it. */
function assemblyFile(project: string, assembly: AssemblyFile): TransferFile {
  return {
    path: `projects/${project}/assemblies/${assembly.name}.yaml`,
    text: serializeAssembly(assembly),
  };
}

/** The file with Windows line endings. */
function crlf(file: TransferFile): TransferFile {
  return { ...file, text: file.text.replaceAll('\n', '\r\n') };
}

/** Every file under `dir` with its bytes, by path relative to `dir`. */
async function readTree(dir: string): Promise<Record<string, string>> {
  const tree: Record<string, string> = {};
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    const path = join(entry.parentPath, entry.name);
    tree[relative(dir, path)] = entry.isFile() ? await readFile(path, 'utf8') : '<dir>';
  }
  return tree;
}

describe('Export and Import routes', () => {
  let s: TestServer;
  beforeEach(async () => {
    s = await testServer({
      units: [
        ...briefUnits(),
        unit('fact-checker'),
        unit('archivist'),
        unit('indexer'),
        unit('loner'),
      ],
      projects: [{ profile: noneProfile(), assemblies: [briefWithHelpers()] }],
    });
  });
  afterEach(() => s.cleanup());

  const exportAll = async (server: TestServer = s): Promise<TransferFile[]> => {
    const contents = (
      await server.app.inject({ method: 'GET', url: '/api/export/contents' })
    ).json();
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/export',
      payload: {
        units: contents.units.map((u: { name: string }) => u.name),
        projects: contents.projects.map((p: { name: string }) => p.name),
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json().files;
  };
  const preview = (files: TransferFile[], choices: ImportChoices = NO_CHOICES) =>
    s.app.inject({ method: 'POST', url: '/api/import/preview', payload: { files, choices } });
  const apply = (files: TransferFile[], choices: ImportChoices = NO_CHOICES, server = s) =>
    server.app.inject({ method: 'POST', url: '/api/import/apply', payload: { files, choices } });
  const elementAt = async (
    files: TransferFile[],
    path: string,
    choices: ImportChoices = NO_CHOICES,
  ): Promise<ImportElement> => {
    const res = await preview(files, choices);
    expect(res.statusCode).toBe(200);
    const element = (res.json().elements as ImportElement[]).find((e) => e.path === path);
    expect(element).toBeDefined();
    return element!;
  };

  describe('Export', () => {
    it('lists every Unit, an invalid one too, and the Units each Project places', async () => {
      await writeFile(join(s.home, 'hangar', 'broken.md'), 'no frontmatter\n');
      const res = await s.app.inject({ method: 'GET', url: '/api/export/contents' });
      expect(res.statusCode).toBe(200);
      const contents = res.json();
      expect(contents.units.map((u: { name: string }) => u.name)).toContain('broken');
      expect(contents.units.find((u: { name: string }) => u.name === 'broken')).toEqual({
        name: 'broken',
      });
      expect(contents.projects.map((p: { name: string }) => p.name)).toEqual([
        'my-app',
        'research',
      ]);
      expect(contents.projects[1].units).toEqual([
        'archivist',
        'brief-writer',
        'fact-checker',
        'indexer',
        'researcher',
      ]);
    });

    it('returns the files of a selection exactly as they are on disk, and never a Mission', async () => {
      await writeFile(join(s.home, 'hangar', 'broken.md'), 'no frontmatter\r\n');
      await writeFile(join(s.home, 'projects', 'research', 'assemblies', 'odd.yaml'), ': : :\n');
      await mkdir(join(s.home, 'missions'), { recursive: true });
      await writeFile(join(s.home, 'missions', 'active.json'), '[]');
      const res = await s.app.inject({
        method: 'POST',
        url: '/api/export',
        payload: { units: ['broken', 'loner'], projects: ['research'] },
      });
      expect(res.statusCode).toBe(200);
      const files = res.json().files as TransferFile[];
      expect(files.map((f) => f.path)).toEqual([
        'hangar/broken.md',
        'hangar/loner.md',
        'projects/research/profile.yaml',
        'projects/research/assemblies/brief.yaml',
        'projects/research/assemblies/odd.yaml',
      ]);
      for (const file of files) {
        expect(file.text).toBe(await readFile(join(s.home, file.path), 'utf8'));
      }
      expect(files.every((f) => !f.path.startsWith('missions/'))).toBe(true);
    });

    it('refuses an unknown name and an empty selection', async () => {
      const unknown = await s.app.inject({
        method: 'POST',
        url: '/api/export',
        payload: { units: ['nope'], projects: ['ghost'] },
      });
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json().issues.map((i: { code: string }) => i.code)).toEqual([
        'unknown_unit',
        'unknown_project',
      ]);
      const empty = await s.app.inject({
        method: 'POST',
        url: '/api/export',
        payload: { units: [], projects: [] },
      });
      expect(empty.statusCode).toBe(400);
      expect(empty.json().issues[0].code).toBe('empty_selection');
    });
  });

  describe('Import preview', () => {
    it('marks elements new, same or different, and keeps a different one unless chosen', async () => {
      const files = [
        unitFile(unit('newcomer')),
        unitFile(unit('loner')),
        unitFile(unit('archivist', 'Archive differently.')),
      ];
      const res = await preview(files);
      expect(res.statusCode).toBe(200);
      expect(res.json().elements.map((e: ImportElement) => [e.name, e.status, e.action])).toEqual([
        ['archivist', 'different', 'keep'],
        ['loner', 'same', 'none'],
        ['newcomer', 'new', 'add'],
      ]);
      const chosen = await elementAt(files, 'hangar/archivist.md', {
        replace: ['hangar/archivist.md', 'hangar/loner.md'],
        paths: {},
      });
      expect(chosen.action).toBe('replace');
    });

    it('counts a CRLF copy of a Unit, a Profile and an Assembly as the same', async () => {
      const files = (await exportAll()).map(crlf);
      const res = await preview(files);
      expect(res.statusCode).toBe(200);
      const elements = res.json().elements as ImportElement[];
      expect(new Set(elements.map((e) => e.kind))).toEqual(
        new Set(['unit', 'profile', 'assembly']),
      );
      expect(elements.every((e) => e.status === 'same')).toBe(true);
    });

    it.each([
      ['notes/readme.txt', 'a file outside the layout'],
      ['hangar/Loud.md', 'a name with an uppercase letter'],
      ['missions/active.json', 'a Mission file'],
      ['export/hangar/loner.md', 'a wrapping folder'],
    ])('refuses %s (%s) and names it', async (path) => {
      const res = await preview([unitFile(unit('loner')), { path, text: 'x' }]);
      expect(res.statusCode).toBe(400);
      expect(res.json().issues).toEqual([
        { code: 'outside_layout', message: `"${path}" is not part of an Export`, path },
      ]);
    });

    it('refuses an empty Export and a path given twice', async () => {
      expect((await preview([])).json().issues[0].code).toBe('empty_export');
      const twice = await preview([unitFile(unit('loner')), unitFile(unit('loner'))]);
      expect(twice.statusCode).toBe(400);
      expect(twice.json().issues[0]).toMatchObject({
        code: 'duplicate_path',
        path: 'hangar/loner.md',
      });
    });

    it('validates an Assembly against the Units as they will be after the Import', async () => {
      const assembly: AssemblyFile = {
        ...briefAssembly('extra'),
        slots: [{ name: 'only', unit: 'stranger', exitPoint: true }],
      };
      const withoutUnit = [assemblyFile('research', assembly)];
      const missing = await elementAt(withoutUnit, 'projects/research/assemblies/extra.yaml');
      expect(missing.status).toBe('new');
      expect(missing.issues.errors.map((i) => i.code)).toContain('unknown_unit');
      const withUnit = [...withoutUnit, unitFile(unit('stranger'))];
      const found = await elementAt(withUnit, 'projects/research/assemblies/extra.yaml');
      expect(found.issues.errors).toEqual([]);
    });

    it('lists an invalid Unit with its problems and still adds it', async () => {
      const element = await elementAt(
        [{ path: 'hangar/broken.md', text: 'no frontmatter' }],
        'hangar/broken.md',
      );
      expect(element).toMatchObject({ status: 'new', action: 'add' });
      expect(element.issues.errors[0]?.code).toBe('missing_frontmatter');
    });

    it('shows the paths of a new Profile and takes the edited ones into account', async () => {
      const profile: ProfileFile = {
        ...folderProfile('/work/notes'),
        outerFolders: ['/shared/out'],
        knowledgeSources: [{ text: 'Be brief.' }, { path: '/docs/style.md' }, { path: 'rel.md' }],
      };
      const files = [profileFile(profile)];
      const path = 'projects/notes/profile.yaml';
      const fresh = await elementAt(files, path);
      expect(fresh.paths).toEqual({
        workspace: '/work/notes',
        outerFolders: ['/shared/out'],
        knowledgeSources: [{ index: 1, path: '/docs/style.md' }],
      });
      expect(fresh.issues.errors).toEqual([]);

      const edited = {
        workspace: '/home/me/notes',
        outerFolders: [join(s.home, 'inside')],
        knowledgeSources: [{ index: 1, path: '/home/me/style.md' }],
      };
      const changed = await elementAt(files, path, { replace: [], paths: { notes: edited } });
      expect(changed.paths).toEqual(edited);
      expect(changed.issues.errors.map((i) => i.code)).toEqual(['invalid_outer_folder']);
    });

    it('gives a kept Profile no paths and refuses paths that do not fit the Profile', async () => {
      const kept = await elementAt(
        [profileFile({ ...noneProfile(), title: 'Other' })],
        'projects/research/profile.yaml',
      );
      expect(kept.action).toBe('keep');
      expect(kept.paths).toBeUndefined();

      const files = [profileFile(folderProfile('/work/notes'))];
      const mismatched = await preview(files, {
        replace: [],
        paths: { notes: { workspace: '/a', outerFolders: ['/b'], knowledgeSources: [] } },
      });
      expect(mismatched.statusCode).toBe(400);
      expect(mismatched.json().issues[0].code).toBe('invalid_paths');
      const notInFile = await preview(files, {
        replace: [],
        paths: { research: { workspace: null, outerFolders: [], knowledgeSources: [] } },
      });
      expect(notInFile.json().issues[0].code).toBe('invalid_paths');
    });

    it('changes nothing in the configuration home', async () => {
      const before = await readTree(s.home);
      await preview([
        unitFile(unit('newcomer')),
        unitFile(unit('loner', 'Changed.')),
        profileFile(folderProfile('/work/notes')),
      ]);
      await preview([], NO_CHOICES);
      expect(await readTree(s.home)).toEqual(before);
    });
  });

  describe('Import apply', () => {
    it('adds new elements with LF line endings and reports them', async () => {
      const files = [
        crlf(unitFile(unit('newcomer'))),
        profileFile(folderProfile('/work/notes')),
        assemblyFile('notes', { ...briefAssembly('jot'), slots: [] }),
      ];
      const res = await apply(files);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        added: [
          { kind: 'unit', name: 'newcomer' },
          { kind: 'profile', name: 'notes', project: 'notes' },
          { kind: 'assembly', name: 'jot', project: 'notes' },
        ],
        replaced: [],
      });
      expect(await readFile(join(s.home, 'hangar', 'newcomer.md'), 'utf8')).toBe(
        serializeUnit(unit('newcomer')),
      );
      const projects = (await s.app.inject({ method: 'GET', url: '/api/projects' })).json().items;
      expect(projects.find((p: { name: string }) => p.name === 'notes')).toMatchObject({
        assemblies: [{ name: 'jot' }],
      });
    });

    it('replaces a different element only when chosen', async () => {
      const path = join(s.home, 'hangar', 'loner.md');
      const mine = await readFile(path, 'utf8');
      const files = [unitFile(unit('loner', 'Their version.'))];
      expect((await apply(files)).json()).toEqual({ added: [], replaced: [] });
      expect(await readFile(path, 'utf8')).toBe(mine);
      const replaced = await apply(files, { replace: ['hangar/loner.md'], paths: {} });
      expect(replaced.json().replaced).toEqual([{ kind: 'unit', name: 'loner' }]);
      expect(await readFile(path, 'utf8')).toBe(files[0]!.text);
    });

    it('writes the edited paths into the Profile', async () => {
      const files = [profileFile(folderProfile('/work/notes'))];
      const paths = { workspace: '/home/me/notes', outerFolders: [], knowledgeSources: [] };
      expect((await apply(files, { replace: [], paths: { notes: paths } })).statusCode).toBe(200);
      expect(await readFile(join(s.home, 'projects', 'notes', 'profile.yaml'), 'utf8')).toContain(
        'path: /home/me/notes',
      );
      const project = await s.app.inject({ method: 'GET', url: '/api/projects/notes' });
      expect(project.json().profile.workspace).toEqual({ kind: 'folder', path: '/home/me/notes' });
    });

    it('brings everything over to an empty system, after which every element is the same', async () => {
      const files = await exportAll();
      const target = await testServer();
      try {
        await rm(join(target.home, 'hangar'), { recursive: true });
        await rm(join(target.home, 'projects'), { recursive: true });
        const applied = await apply(files, NO_CHOICES, target);
        expect(applied.statusCode).toBe(200);
        expect(applied.json().added).toHaveLength(files.length);
        const again = await target.app.inject({
          method: 'POST',
          url: '/api/import/preview',
          payload: { files, choices: NO_CHOICES },
        });
        expect(again.json().elements.every((e: ImportElement) => e.status === 'same')).toBe(true);
      } finally {
        await target.cleanup();
      }
    });

    it('changes nothing for a file that is not an Export', async () => {
      const before = await readTree(s.home);
      const res = await apply([unitFile(unit('newcomer')), { path: 'notes.txt', text: 'x' }]);
      expect(res.statusCode).toBe(400);
      expect(await readTree(s.home)).toEqual(before);
    });

    it('puts everything back when a write fails part way', async () => {
      const lonerPath = join(s.home, 'hangar', 'loner.md');
      // The last target is a folder on disk, so writing it fails after the others were written.
      await mkdir(join(s.home, 'projects', 'research', 'assemblies', 'zz.yaml'));
      const before = await readTree(s.home);
      const res = await apply(
        [
          unitFile(unit('newcomer')),
          unitFile(unit('loner', 'Their version.')),
          profileFile(folderProfile('/work/notes')),
          assemblyFile('research', briefAssembly('zz')),
        ],
        { replace: ['hangar/loner.md'], paths: {} },
      );
      expect(res.statusCode).toBe(500);
      expect(res.json()).toMatchObject({ reason: 'import_failed' });
      expect(res.json().message).toContain('projects/research/assemblies/zz.yaml');
      expect(await readTree(s.home)).toEqual(before);
      expect(await readFile(lonerPath, 'utf8')).toBe(serializeUnit(unit('loner')));
      await expect(stat(join(s.home, 'projects', 'notes'))).rejects.toThrow();
    });
  });
});
