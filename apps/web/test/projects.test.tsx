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
    expect(items).toHaveLength(2);
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
    await user.type(within(dialog).getByLabelText('Name'), 'other');
    await user.type(within(dialog).getByLabelText('Repository path'), '/repos/other');
    // The remote and protected branch are read from git once the path resolves to a repository.
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Protected branch')).toHaveValue('develop'),
    );
    expect(within(dialog).getByLabelText('Remote')).toHaveValue('origin');
    await user.click(within(dialog).getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/other'));
    const post = home.requestsTo('POST', '/api/projects')[0]!;
    expect(post.body).toEqual({
      profile: {
        name: 'other',
        repository: { path: '/repos/other', remote: 'origin', protectedBranch: 'develop' },
        knowledgeSources: [],
        git: {
          branchNameTemplate: 'feature/{work_item_id}-{task_slug}',
          pullRequestTemplate: '## {task_title}\n\n### Summary\n\n### Testing\n',
          labels: [],
          reviewers: [],
        },
        host: 'github',
        engine: 'claude-code',
        ciWaitTimeoutMinutes: 30,
      },
    });
  });
});

describe('New Project dialog', () => {
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
    await user.type(within(dialog).getByLabelText('Name'), 'other');
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
    expect(within(screen.getByRole('dialog')).getByLabelText('Name')).toHaveValue('other');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Project page', () => {
  it('blocks Save while a Knowledge Source does not exist and saves once it does', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    renderApp('/projects/my-app', home.live);
    await user.click(await screen.findByRole('button', { name: /Add Knowledge Source/ }));
    const field = screen.getByLabelText('Knowledge Source 2');
    await user.type(field, 'docs/missing');
    await waitFor(() =>
      expect(screen.getAllByTestId('path-status').at(-1)).toHaveTextContent('does not exist'),
    );
    expect(screen.getByTestId('save-button')).toBeDisabled();
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
    expect((put.body as { knowledgeSources: string[] }).knowledgeSources).toEqual([
      'README.md',
      'docs/adr',
    ]);
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
    await user.type(within(dialog).getByLabelText('Name'), 'hotfix');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/projects/my-app/assemblies/hotfix'),
    );
  });
});
