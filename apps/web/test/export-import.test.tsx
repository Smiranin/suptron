import type { ImportChoices, ImportElement, TransferFile } from '@suptron/runtime/browser';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { strToU8, strFromU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFakeHome, type FakeHome } from './fake-server';
import { renderApp } from './render';

const NO_ISSUES = { errors: [], warnings: [] };

/** The elements of the Export the Import tests pick. */
function previewElements(): ImportElement[] {
  return [
    {
      kind: 'unit',
      name: 'analyst',
      path: 'hangar/analyst.md',
      status: 'different',
      action: 'keep',
      issues: NO_ISSUES,
    },
    {
      kind: 'unit',
      name: 'newbie',
      path: 'hangar/newbie.md',
      status: 'new',
      action: 'add',
      issues: {
        errors: [
          { code: 'missing_frontmatter', message: 'The file must start with YAML frontmatter' },
        ],
        warnings: [],
      },
    },
    {
      kind: 'profile',
      name: 'side',
      project: 'side',
      path: 'projects/side/profile.yaml',
      status: 'new',
      action: 'add',
      issues: NO_ISSUES,
      paths: { workspace: '/old/side', outerFolders: [], knowledgeSources: [] },
    },
    {
      kind: 'assembly',
      name: 'flow',
      project: 'side',
      path: 'projects/side/assemblies/flow.yaml',
      status: 'same',
      action: 'none',
      issues: NO_ISSUES,
    },
  ];
}

const EXPORT_FILES: TransferFile[] = [
  { path: 'hangar/analyst.md', text: '---\nname: analyst\n---\n' },
  { path: 'hangar/newbie.md', text: 'no frontmatter' },
  { path: 'projects/side/profile.yaml', text: 'name: side\n' },
  { path: 'projects/side/assemblies/flow.yaml', text: 'name: flow\n' },
];

/** A zip File holding `entries`, as the file picker hands it over. */
function zipFile(entries: Zippable, name = 'suptron-export-2026-11-17.zip'): File {
  return new File([zipSync(entries) as Uint8Array<ArrayBuffer>], name, { type: 'application/zip' });
}

function exportZip(files: readonly TransferFile[] = EXPORT_FILES): File {
  return zipFile(Object.fromEntries(files.map((f) => [f.path, strToU8(f.text)])));
}

describe('Export & Import page', () => {
  describe('Export', () => {
    let blobs: Blob[];
    let downloads: string[];
    beforeEach(() => {
      blobs = [];
      downloads = [];
      URL.createObjectURL = vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:export';
      });
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloads.push(this.download);
      });
    });
    afterEach(() => vi.restoreAllMocks());

    const section = (title: 'Units' | 'Projects') => screen.findByRole('region', { name: title });

    it('opens with every Unit and every Project checked', async () => {
      const home = useFakeHome();
      renderApp('/export-import', home.live);
      const units = within(await section('Units')).getAllByRole('checkbox');
      const projects = within(await section('Projects')).getAllByRole('checkbox');
      expect(units).toHaveLength(home.units.size);
      expect(projects).toHaveLength(home.projects.size);
      for (const box of [...units, ...projects]) expect(box).toBeChecked();
    });

    it('checks the Units of a Project checked again, and lets a Unit be unchecked after', async () => {
      const home = useFakeHome();
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      const units = await section('Units');
      const projects = await section('Projects');
      const researcher = within(units).getByRole('checkbox', { name: 'researcher' });
      const research = within(projects).getByRole('checkbox', { name: 'research' });

      await user.click(research);
      expect(research).not.toBeChecked();
      await user.click(researcher);
      expect(researcher).not.toBeChecked();
      await user.click(research);
      expect(research).toBeChecked();
      expect(researcher).toBeChecked();
      expect(within(units).getByRole('checkbox', { name: 'brief-writer' })).toBeChecked();
      await user.click(researcher);
      expect(researcher).not.toBeChecked();
    });

    it('disables Export while nothing is checked', async () => {
      const home = useFakeHome();
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      for (const title of ['Units', 'Projects'] as const) {
        for (const box of within(await section(title)).getAllByRole('checkbox')) {
          await user.click(box);
        }
      }
      expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    });

    it('posts the selection and downloads a zip of the files the server returned', async () => {
      const home = useFakeHome();
      home.exportFiles = EXPORT_FILES;
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      await user.click(within(await section('Projects')).getByRole('checkbox', { name: 'my-app' }));
      await user.click(screen.getByRole('button', { name: 'Export' }));

      await waitFor(() => expect(downloads).toHaveLength(1));
      expect(home.requestsTo('POST', '/api/export')[0]?.body).toEqual({
        units: [...home.units.keys()],
        projects: ['notes', 'research'],
      });
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      expect(downloads[0]).toBe(
        `suptron-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`,
      );
      expect(blobs[0]?.type).toBe('application/zip');
      const entries = unzipSync(new Uint8Array(await blobs[0]!.arrayBuffer()));
      expect(
        Object.entries(entries).map(([path, bytes]) => ({ path, text: strFromU8(bytes) })),
      ).toEqual(EXPORT_FILES);
    });
  });

  describe('Import', () => {
    let home: FakeHome;
    beforeEach(() => {
      home = useFakeHome();
      home.importElements = previewElements();
    });

    const pick = async (user: ReturnType<typeof userEvent.setup>, file: File = exportZip()) => {
      await user.upload(await screen.findByLabelText('Export file'), file);
    };
    const row = (name: string) =>
      within(screen.getByTestId('import-preview')).getByRole('listitem', { name });
    const lastChoices = (url: string) =>
      (home.requestsTo('POST', url).at(-1)?.body as { choices: ImportChoices }).choices;

    it('shows every element of a picked Export with its status, problems and choice', async () => {
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      await pick(user);

      await screen.findByTestId('import-preview');
      expect(home.requestsTo('POST', '/api/import/preview')[0]?.body).toEqual({
        files: EXPORT_FILES,
        choices: { replace: [], paths: {} },
      });
      expect(within(row('analyst')).getByText('different')).toBeInTheDocument();
      expect(within(row('newbie')).getByText('new')).toBeInTheDocument();
      expect(within(row('side / flow')).getByText('same')).toBeInTheDocument();
      expect(within(row('newbie')).getByTestId('issue-error')).toHaveTextContent(
        'The file must start with YAML frontmatter',
      );
      expect(within(row('analyst')).getByRole('radio', { name: 'Keep mine' })).toBeChecked();
      expect(within(row('newbie')).queryByRole('radio')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
    });

    it('applies with Keep mine unless Replace is chosen', async () => {
      home.importResult = { added: [{ kind: 'unit', name: 'newbie' }], replaced: [] };
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      await pick(user);
      await screen.findByTestId('import-preview');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      await screen.findByTestId('import-summary');
      expect(lastChoices('/api/import/apply')).toEqual({ replace: [], paths: {} });
    });

    it('asks for a new preview when Replace is chosen and sends it on apply', async () => {
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      await pick(user);
      await screen.findByTestId('import-preview');
      await user.click(within(row('analyst')).getByRole('radio', { name: 'Replace' }));

      await waitFor(() =>
        expect(lastChoices('/api/import/preview').replace).toEqual(['hangar/analyst.md']),
      );
      await waitFor(() =>
        expect(within(row('analyst')).getByRole('radio', { name: 'Replace' })).toBeChecked(),
      );
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await waitFor(() =>
        expect(lastChoices('/api/import/apply').replace).toEqual(['hangar/analyst.md']),
      );
    });

    it('sends an edited Workspace path with the preview and on apply', async () => {
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      await pick(user);
      await screen.findByTestId('import-preview');
      const workspace = within(row('side Profile')).getByLabelText('Workspace path');
      expect(workspace).toHaveValue('/old/side');
      await user.clear(workspace);
      await user.type(workspace, '/new/side');

      const edited = { workspace: '/new/side', outerFolders: [], knowledgeSources: [] };
      await waitFor(() =>
        expect(lastChoices('/api/import/preview').paths).toEqual({ side: edited }),
      );
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      await waitFor(() => expect(lastChoices('/api/import/apply').paths).toEqual({ side: edited }));
    });

    it('lists what the Import added and replaced', async () => {
      home.importResult = {
        added: [
          { kind: 'unit', name: 'newbie' },
          { kind: 'profile', name: 'side', project: 'side' },
        ],
        replaced: [{ kind: 'unit', name: 'analyst' }],
      };
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      await pick(user);
      await screen.findByTestId('import-preview');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      const summary = await screen.findByTestId('import-summary');
      expect(within(summary).getByRole('region', { name: 'Added' })).toHaveTextContent(
        'newbieside Profile',
      );
      expect(within(summary).getByRole('region', { name: 'Replaced' })).toHaveTextContent(
        'analyst',
      );
      expect(screen.queryByTestId('import-preview')).not.toBeInTheDocument();
    });

    it('keeps the preview and shows the message when the Import fails', async () => {
      home.importResult = {
        failure: 'Writing "hangar/newbie.md" failed: disk full. Nothing was changed.',
      };
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      await pick(user);
      await screen.findByTestId('import-preview');
      await user.click(screen.getByRole('button', { name: 'Apply' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('disk full');
      expect(screen.getByTestId('import-preview')).toBeInTheDocument();
    });

    it('refuses a file that is not a zip without asking the server', async () => {
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      await pick(user, new File(['just text'], 'notes.zip', { type: 'application/zip' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('This file is not a zip archive');
      expect(home.requestsTo('POST', '/api/import/preview')).toHaveLength(0);
      expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
    });

    it('drops what an operating system added to the archive', async () => {
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      await pick(
        user,
        zipFile({
          'hangar/analyst.md': strToU8('---\nname: analyst\n---\n'),
          'hangar/.DS_Store': strToU8('junk'),
          '__MACOSX/hangar/._analyst.md': strToU8('junk'),
        }),
      );

      await screen.findByTestId('import-preview');
      expect(home.requestsTo('POST', '/api/import/preview')[0]?.body).toMatchObject({
        files: [{ path: 'hangar/analyst.md', text: '---\nname: analyst\n---\n' }],
      });
    });

    it('shows why the server refused the file', async () => {
      home.importRefusal = [
        { code: 'outside_layout', message: '"notes/readme.txt" is not part of an Export' },
      ];
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      await pick(user);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '"notes/readme.txt" is not part of an Export',
      );
      expect(screen.queryByTestId('import-preview')).not.toBeInTheDocument();
    });

    it('replaces the preview when another file is picked', async () => {
      const user = userEvent.setup();
      renderApp('/export-import', home.live);
      await pick(user);
      await screen.findByTestId('import-preview');
      await user.click(within(row('analyst')).getByRole('radio', { name: 'Replace' }));
      await waitFor(() => expect(lastChoices('/api/import/preview').replace).toHaveLength(1));

      home.importElements = previewElements().slice(0, 1);
      await pick(user, exportZip(EXPORT_FILES.slice(0, 1)));
      await waitFor(() =>
        expect(
          within(screen.getByTestId('import-preview')).getAllByTestId('import-element'),
        ).toHaveLength(1),
      );
      expect(lastChoices('/api/import/preview')).toEqual({ replace: [], paths: {} });
      expect(within(row('analyst')).getByRole('radio', { name: 'Keep mine' })).toBeChecked();
    });
  });
});
