import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  Element.prototype.scrollTo ??= () => {};
});
import { useFakeHome } from './fake-server';
import { renderApp } from './render';

describe('Hangar', () => {
  it('lists the Units with model and Done Condition summary', async () => {
    const home = useFakeHome();
    renderApp('/hangar', home.live);
    const rows = await screen.findAllByTestId('unit-row');
    expect(rows).toHaveLength(6);
    const prReviewer = rows.find((r) => within(r).queryByRole('link', { name: 'pr-reviewer' }))!;
    expect(prReviewer).toHaveTextContent('no open PR comments · CI green');
    expect(prReviewer).toHaveTextContent('opus');
    const analyst = rows.find((r) => within(r).queryByRole('link', { name: 'analyst' }))!;
    expect(analyst).toHaveTextContent('may ask');
    expect(screen.getByRole('link', { name: /New Unit/ })).toHaveAttribute('href', '/hangar/new');
  });

  it('refuses to delete a used Unit and lists the Assemblies', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    renderApp('/hangar', home.live);
    await user.click(await screen.findByRole('button', { name: 'Delete analyst' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const refusal = await screen.findByTestId('in-use-refusal');
    expect(refusal).toHaveTextContent('my-app / feature');
    expect(home.units.has('analyst')).toBe(true);
    expect(home.requestsTo('DELETE', '/api/units/analyst')).toHaveLength(1);
  });

  it('duplicates a Unit under a new name and opens it', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    const { router } = renderApp('/hangar', home.live);
    await user.click(await screen.findByRole('button', { name: 'Duplicate tester' }));
    const input = await screen.findByLabelText('Name');
    await user.clear(input);
    await user.type(input, 'tester-two');
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/hangar/tester-two'));
    expect(home.requestsTo('POST', '/api/units/tester/duplicate')[0]?.body).toEqual({
      newName: 'tester-two',
    });
    expect(home.units.get('tester-two')?.model).toBe('sonnet');
  });

  it('shows a name conflict inline when duplicating', async () => {
    const home = useFakeHome();
    const user = userEvent.setup();
    renderApp('/hangar', home.live);
    await user.click(await screen.findByRole('button', { name: 'Duplicate tester' }));
    const input = await screen.findByLabelText('Name');
    await user.clear(input);
    await user.type(input, 'analyst');
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already taken');
  });
});
