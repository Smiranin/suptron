import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  Element.prototype.scrollTo ??= () => {};
});
import { useFakeHome } from './fake-server';
import { renderApp } from './render';

describe('Projects overview', () => {
  it('shows every Assembly with a Launch button on valid ones and the reason on invalid ones', async () => {
    const home = useFakeHome();
    renderApp('/projects', home.live);
    const items = await screen.findAllByTestId('assembly-item');
    expect(items).toHaveLength(4);
    // each Project shows its kind next to its name, and its path or "No folder" (FR-20)
    const cards = screen.getAllByTestId('project-card');
    expect(cards.map((c) => within(c).getByTestId('project-kind').textContent)).toEqual([
      'Repository',
      'Folder',
      'No folder',
    ]);
    expect(cards[1]).toHaveTextContent('/notes');
    expect(cards[2]).toHaveTextContent('No folder');
    const feature = items.find((i) => within(i).queryByRole('link', { name: 'feature' }))!;
    expect(within(feature).getByTestId('launch-button')).toBeInTheDocument();
    expect(feature).toHaveTextContent('Valid');
    const broken = items.find((i) => within(i).queryByRole('link', { name: 'broken' }))!;
    expect(within(broken).queryByTestId('launch-button')).not.toBeInTheDocument();
    expect(within(broken).getByTestId('launch-reason')).toHaveTextContent('loops to a later Slot');
    expect(screen.getByRole('link', { name: 'feature' })).toHaveAttribute(
      'href',
      '/projects/my-app/assemblies/feature',
    );
  });

  it('creates a Project with the full Profile and navigates to it', async () => {
    const home = useFakeHome();
    home.existingPaths.set('/repos/other', 'dir');
    home.repositories.set('/repos/other', {
      remoteUrl: 'git@github.com:me/other.git',
      headBranch: 'develop',
    });
    const user = userEvent.setup();
    const { router } = renderApp('/projects', home.live);
    await user.click(await screen.findByRole('button', { name: /New Project/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Title/), 'Other');
    // the ID follows the title and cannot be typed
    expect(within(dialog).getByLabelText('ID')).toHaveValue('other');
    expect(within(dialog).getByLabelText('ID')).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/^Repository path/), '/repos/other');
    // The remote and protected branch are read from git once the path resolves to a repository.
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Protected branch')).toHaveValue('develop'),
    );
    expect(within(dialog).getByLabelText('Remote')).toHaveValue('origin');
    // the Git conventions start empty and folded away; only what is typed is written
    expect(within(dialog).queryByLabelText('Branch name template')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Git conventions (optional)' }));
    const branch = within(dialog).getByLabelText('Branch name template');
    expect(branch).toHaveValue('');
    expect(branch).toHaveAttribute('placeholder', 'feature/{work_item_id}-{task_slug}');
    await user.type(branch, 'feat/{{task_slug}');
    await user.click(within(dialog).getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/other'));
    const post = home.requestsTo('POST', '/api/projects')[0]!;
    expect(post.body).toEqual({
      profile: {
        name: 'other',
        title: 'Other',
        workspace: {
          kind: 'repository',
          path: '/repos/other',
          remote: 'origin',
          protectedBranch: 'develop',
          host: 'github',
          git: {
            branchNameTemplate: 'feat/{task_slug}',
            pullRequestTemplate: '',
            labels: [],
            reviewers: [],
          },
          ciWaitTimeoutMinutes: 30,
        },
        knowledgeSources: [],
        engine: 'claude-code',
      },
    });
  });

  it('creates a Project without a folder: no git fields, a text Knowledge Source, no path checks', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    const { router } = renderApp('/projects', home.live);
    await user.click(await screen.findByRole('button', { name: /New Project/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Title/), 'Trips');
    await user.click(within(dialog).getByRole('combobox', { name: 'Project type' }));
    await user.click(await screen.findByRole('option', { name: 'No folder' }));
    // a new Project changes its type without a confirmation
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(dialog).getByTestId('workspace-fields')).toHaveAttribute('data-kind', 'none');
    expect(within(dialog).queryByLabelText(/^Repository path/)).toBeNull();
    expect(within(dialog).queryByLabelText('Protected branch')).toBeNull();
    expect(within(dialog).queryByLabelText(/^Branch name template/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: /Add Knowledge Source/ }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Knowledge Source 1 type' }));
    await user.click(await screen.findByRole('option', { name: 'Text' }));
    await user.type(within(dialog).getByLabelText('Knowledge Source 1 title'), 'Airlines');
    await user.type(within(dialog).getByLabelText('Knowledge Source 1'), 'Prefer direct flights.');
    await user.click(within(dialog).getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/trips'));
    expect(home.requestsTo('POST', '/api/projects')[0]!.body).toEqual({
      profile: {
        name: 'trips',
        title: 'Trips',
        workspace: { kind: 'none' },
        knowledgeSources: [{ text: 'Prefer direct flights.', title: 'Airlines' }],
        engine: 'claude-code',
      },
    });
  });
});

describe('New Project dialog', () => {
  it('keeps Create enabled and reveals every missing required field when pressed', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    renderApp('/projects', home.live);
    await user.click(await screen.findByRole('button', { name: /New Project/ }));
    const dialog = await screen.findByRole('dialog');
    // required fields carry the mark
    expect(within(dialog).getByText('Title').closest('label')).toHaveTextContent('Title*');
    expect(within(dialog).getByText('Repository path').closest('label')).toHaveTextContent(
      'Repository path*',
    );
    const create = within(dialog).getByRole('button', { name: 'Create Project' });
    expect(create).toBeEnabled();
    await user.click(create);
    await waitFor(() =>
      expect(within(dialog).getByText('A title is required')).toBeInTheDocument(),
    );
    expect(within(dialog).getByText('A repository path is required')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Title/)).toHaveFocus();
    expect(home.requestsTo('POST', '/api/projects')).toHaveLength(0);
  });

  it('explains an ID that cannot be made from the title, and a taken one', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    renderApp('/projects', home.live);
    await user.click(await screen.findByRole('button', { name: /New Project/ }));
    const dialog = await screen.findByRole('dialog');
    const title = within(dialog).getByLabelText(/^Title/);
    await user.type(title, 'Проект');
    expect(within(dialog).getByLabelText('ID')).toHaveValue('');
    expect(within(dialog).getByText('The ID needs Latin letters or digits')).toBeInTheDocument();
    await user.clear(title);
    await user.type(title, 'My App');
    expect(within(dialog).getByText('The ID "my-app" is already taken')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Create Project' }));
    expect(home.requestsTo('POST', '/api/projects')).toHaveLength(0);
  });

  it('closes at once while untouched, ignores clicks outside, and asks before discarding typed input', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    renderApp('/projects', home.live);
    await user.click(await screen.findByRole('button', { name: /New Project/ }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /New Project/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Title/), 'Other');
    // A pointer down outside the dialog (the backdrop) must not close it. fireEvent, because the
    // dialog sets pointer-events: none on the body, which user-event refuses to click through.
    fireEvent.pointerDown(document.body, { pointerType: 'mouse', button: 0 });
    fireEvent.pointerUp(document.body, { pointerType: 'mouse', button: 0 });
    fireEvent.click(document.body);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Discard the new Project?');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(within(screen.getByRole('dialog')).getByLabelText(/^Title/)).toHaveValue('Other');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Project page', () => {
  it('opens the Git conventions when the Profile states one', async () => {
    const home = useFakeHome();
    renderApp('/projects/my-app', home.live);
    const form = await screen.findByRole('form', { name: 'Project Profile' });
    expect(within(form).getByLabelText('Branch name template')).toHaveValue(
      'feature/{work_item_id}-{task_slug}',
    );
  });

  it('refuses to save while a Knowledge Source does not exist and saves once it does', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    renderApp('/projects/my-app', home.live);
    await user.click(await screen.findByRole('button', { name: /Add Knowledge Source/ }));
    const field = screen.getByLabelText('Knowledge Source 2');
    await user.type(field, 'docs/missing');
    await waitFor(() =>
      expect(screen.getAllByTestId('path-status').at(-1)).toHaveTextContent('does not exist'),
    );
    // Save stays enabled; pressing it explains the refusal instead of sending anything
    await user.click(screen.getByTestId('save-button'));
    expect(
      await screen.findByText('A path does not exist; fix it before saving'),
    ).toBeInTheDocument();
    expect(home.requestsTo('PUT', '/api/projects/my-app/profile')).toHaveLength(0);
    await user.clear(field);
    await user.type(field, 'docs/adr');
    await waitFor(() =>
      expect(screen.getAllByTestId('path-status').at(-1)).toHaveTextContent('Found folder'),
    );
    await waitFor(() => expect(screen.getByTestId('save-button')).toBeEnabled());
    await user.click(screen.getByTestId('save-button'));
    await waitFor(() =>
      expect(home.requestsTo('PUT', '/api/projects/my-app/profile')).toHaveLength(1),
    );
    const put = home.requestsTo('PUT', '/api/projects/my-app/profile')[0]!;
    expect(put.headers['if-match']).toBeDefined();
    expect((put.body as { knowledgeSources: unknown[] }).knowledgeSources).toEqual([
      { path: 'README.md' },
      { path: 'docs/adr' },
    ]);
  });

  it('changes the kind of an existing Project after a confirmation and warns about Assemblies that became invalid', async () => {
    const home = useFakeHome();
    // the relative Knowledge Source README.md resolves against the new folder once the kind changes
    home.existingPaths.set('/notes/README.md', 'file');
    const user = userEvent.setup();
    renderApp('/projects/my-app', home.live);
    const form = await screen.findByRole('form', { name: 'Project Profile' });
    expect(within(form).getByLabelText(/^Repository path/)).toHaveValue('/repos/my-app');
    await user.click(within(form).getByRole('combobox', { name: 'Project type' }));
    await user.click(await screen.findByRole('option', { name: 'Folder' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('The fields of the Repository type are dropped');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(within(form).getByTestId('workspace-fields')).toHaveAttribute('data-kind', 'repository');
    await user.click(within(form).getByRole('combobox', { name: 'Project type' }));
    await user.click(await screen.findByRole('option', { name: 'Folder' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Change type' }),
    );
    await waitFor(() =>
      expect(within(form).getByTestId('workspace-fields')).toHaveAttribute('data-kind', 'folder'),
    );
    expect(within(form).queryByLabelText('Protected branch')).toBeNull();
    await user.type(within(form).getByLabelText(/^Folder path/), '/notes');
    // two debounced path checks (the folder, then the Knowledge Source against it) run first
    await waitFor(() => expect(screen.getByTestId('save-button')).toBeEnabled(), {
      timeout: 3000,
    });
    await user.click(screen.getByTestId('save-button'));
    await waitFor(() =>
      expect(home.requestsTo('PUT', '/api/projects/my-app/profile')).toHaveLength(1),
    );
    const put = home.requestsTo('PUT', '/api/projects/my-app/profile')[0]!;
    expect((put.body as { workspace: unknown }).workspace).toEqual({
      kind: 'folder',
      path: '/notes',
    });
    // `feature` uses host Checks a folder cannot run: the save says so (FR-3)
    expect(await screen.findByText('1 Assembly is now invalid')).toBeInTheDocument();
    await waitFor(() =>
      expect(home.projectItem('my-app', home.projects.get('my-app')!).assemblies).toEqual([
        expect.objectContaining({ name: 'feature', status: 'invalid' }),
        expect.objectContaining({ name: 'broken', status: 'invalid' }),
      ]),
    );
  });

  it('refuses to delete an Assembly with active Missions and shows the count', async () => {
    const home = useFakeHome();
    home.startMission({
      project: 'my-app',
      assembly: 'feature',
      task: { kind: 'path', path: '/tasks/my-task' },
      checkoutPath: '/repos/my-app',
    });
    const user = userEvent.setup();
    renderApp('/projects/my-app', home.live);
    const rows = await screen.findAllByTestId('assembly-row');
    expect(rows.find((r) => within(r).queryByRole('link', { name: 'feature' }))).toHaveTextContent(
      '1 active Mission',
    );
    await user.click(screen.getByRole('button', { name: 'Delete feature' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByTestId('active-missions-refusal')).toHaveTextContent(
      '1 active Mission uses it',
    );
    expect(home.projects.get('my-app')!.assemblies.has('feature')).toBe(true);
    expect(screen.getByTestId('active-missions-note')).toHaveTextContent(
      '1 active Mission uses a snapshot of this Project Profile',
    );
  });

  it('navigates to the editor for a new Assembly name', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    const { router } = renderApp('/projects/my-app', home.live);
    await user.click(await screen.findByRole('button', { name: /New Assembly/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Title/), 'Hot fix');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/projects/my-app/assemblies/hot-fix'),
    );
    // the title waits in the URL until the Assembly is first saved
    expect(router.state.location.search).toEqual({ title: 'Hot fix' });
  });

  it('shows a taken Assembly ID while typing and does not navigate', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    const { router } = renderApp('/projects/my-app', home.live);
    await user.click(await screen.findByRole('button', { name: /New Assembly/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Title/), 'Feature');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'The ID "feature" is already taken',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(router.state.location.pathname).toBe('/projects/my-app');
  });
});
