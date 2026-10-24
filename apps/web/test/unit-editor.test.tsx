import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

// The router's scroll restoration calls scrollTo, which jsdom lacks.
beforeAll(() => {
  Element.prototype.scrollTo ??= () => {};
});
import { etagOf, useFakeHome } from './fake-server';
import { renderApp } from './render';

describe('Unit editor', () => {
  it('enables Save on edit, saves with If-Match on Cmd+S and is clean afterwards', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    renderApp('/hangar/reviewer', home.live);
    const rules = await screen.findByLabelText('Rules');
    expect(screen.getByTestId('save-button')).toBeDisabled();
    expect(screen.queryByTestId('unsaved-indicator')).not.toBeInTheDocument();
    const original = home.units.get('reviewer')!;
    await user.type(rules, ' Also check tests.');
    expect(await screen.findByTestId('unsaved-indicator')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('save-button')).toBeEnabled());
    await user.keyboard('{Meta>}s{/Meta}');
    await waitFor(() => expect(home.requestsTo('PUT', '/api/units/reviewer')).toHaveLength(1));
    const put = home.requestsTo('PUT', '/api/units/reviewer')[0]!;
    expect(put.headers['if-match']).toBe(etagOf(original));
    expect((put.body as { rules: string }).rules).toBe(
      'Never edit source files. Also check tests.',
    );
    await waitFor(() => expect(screen.queryByTestId('unsaved-indicator')).not.toBeInTheDocument());
    expect(screen.getByTestId('save-button')).toBeDisabled();
  });

  it('offers Reload and Overwrite on a conflict', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    renderApp('/hangar/reviewer', home.live);
    const rules = await screen.findByLabelText('Rules');
    await user.type(rules, ' Mine.');
    // Someone edits the file on disk after it was loaded: the etag no longer matches.
    home.units.set('reviewer', { ...home.units.get('reviewer')!, rules: 'Edited on disk.' });
    await user.click(screen.getByTestId('save-button'));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('The file changed on disk');
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.getByLabelText('Rules')).toHaveValue('Edited on disk.'));
    expect(screen.queryByTestId('unsaved-indicator')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Rules'), ' Again.');
    home.units.set('reviewer', { ...home.units.get('reviewer')!, rules: 'Edited twice.' });
    await user.click(screen.getByTestId('save-button'));
    await user.click(await screen.findByRole('button', { name: 'Overwrite' }));
    await waitFor(() =>
      expect(home.requestsTo('PUT', /\/api\/units\/reviewer\?force=1$/)).toHaveLength(1),
    );
    expect(home.units.get('reviewer')?.rules).toBe('Edited on disk. Again.');
  });

  it('asks before discarding unsaved changes on navigation', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    const { router } = renderApp('/hangar/reviewer', home.live);
    await user.type(await screen.findByLabelText('Instructions'), ' More.');
    await user.click(screen.getByRole('link', { name: 'Back to the Hangar' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Discard changes?');
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe('/hangar/reviewer');
    await user.click(screen.getByRole('link', { name: 'Back to the Hangar' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/hangar'));
  });

  it('disables the model select with a warning when the Engine reports no models', async () => {
    const home = useFakeHome();
    home.models = [];
    renderApp('/hangar/reviewer', home.live);
    const select = await screen.findByRole('combobox', { name: 'Model' });
    await waitFor(() => expect(select).toBeDisabled());
    expect(screen.getByRole('status')).toHaveTextContent('reported no models');
    expect(select).toHaveTextContent('opus');
  });

  it('adds an llm_judgment Check with its criterion and saves it', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    renderApp('/hangar/tester', home.live);
    const editor = await screen.findByTestId('check-list-editor');
    await user.click(within(editor).getByRole('combobox', { name: 'Check kind' }));
    await user.click(await screen.findByRole('option', { name: 'LLM judgment' }));
    await user.click(within(editor).getByRole('button', { name: 'Add check' }));
    const rows = within(editor).getAllByTestId('check-row');
    expect(rows).toHaveLength(2);
    await user.type(within(rows[1]!).getByLabelText('Criterion'), 'Tests cover the PLAN.');
    await user.click(screen.getByTestId('save-button'));
    await waitFor(() => expect(home.requestsTo('PUT', '/api/units/tester')).toHaveLength(1));
    expect(
      (home.requestsTo('PUT', '/api/units/tester')[0]!.body as { doneCondition: unknown[] })
        .doneCondition,
    ).toEqual([
      { kind: 'command', command: 'pnpm test' },
      { kind: 'llm_judgment', criterion: 'Tests cover the PLAN.' },
    ]);
  });

  it('creates a new Unit and navigates to it', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    const { router } = renderApp('/hangar/new', home.live);
    await user.type(await screen.findByLabelText('Name'), 'docs-writer');
    await user.click(screen.getByRole('combobox', { name: 'Model' }));
    await user.click(await screen.findByRole('option', { name: 'Claude Sonnet' }));
    await user.type(screen.getByLabelText('Rules'), 'Only docs.');
    await user.type(screen.getByLabelText('Instructions'), 'Write them.');
    await waitFor(() => expect(screen.getByTestId('save-button')).toBeEnabled());
    await user.click(screen.getByTestId('save-button'));
    await waitFor(() => expect(home.requestsTo('PUT', '/api/units/docs-writer')).toHaveLength(1));
    await waitFor(() => expect(router.state.location.pathname).toBe('/hangar/docs-writer'));
    const put = home.requestsTo('PUT', '/api/units/docs-writer')[0]!;
    expect(put.headers['if-match']).toBeUndefined();
    expect(put.body).toMatchObject({
      name: 'docs-writer',
      model: 'sonnet',
      rules: 'Only docs.',
      instructions: 'Write them.',
    });
    expect(home.units.has('docs-writer')).toBe(true);
  });
});
