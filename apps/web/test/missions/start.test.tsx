import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LaunchButton } from '../../src/features/missions/start/LaunchButton';
import { useFakeHome } from '../fake-server';
import { renderInApp } from './render-in-app';

describe('Start Mission dialog', () => {
  it('lists Checkouts with the busy one disabled, validates the Task path, starts with the toggles and prefills next time', async () => {
    const home = useFakeHome();
    home.startMission({
      project: 'my-app',
      assembly: 'feature',
      task: { kind: 'path', path: '/tasks/my-task' },
      checkoutPath: '/repos/my-app-wt',
    });
    const user = userEvent.setup();
    const { router } = renderInApp(<LaunchButton project="my-app" assembly="feature" />, home.live);
    await user.click(await screen.findByTestId('launch-button'));
    const dialog = await screen.findByRole('dialog');
    const trigger = within(dialog).getByRole('combobox', { name: 'Checkout' });
    await user.click(trigger);
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('/repos/my-app (main)');
    expect(options[1]).toHaveTextContent('busy: feature · my-task');
    expect(options[1]).toHaveAttribute('aria-disabled', 'true');
    await user.click(options[0]!);

    const task = within(dialog).getByLabelText('Task location');
    await user.type(task, '/tasks/nope');
    expect(await within(dialog).findByText('Path does not exist')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Start/ })).toBeDisabled();
    await user.clear(task);
    await user.type(task, '/tasks/my-task');
    expect(await within(dialog).findByText('Found folder')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Work Item ID/), 'ABC-9');

    await user.click(within(dialog).getByRole('button', { name: /Advanced/ }));
    const toggles = within(dialog).getByTestId('advanced-toggles');
    expect(
      within(toggles).getByRole('switch', { name: 'analyst may ask the Commander' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      within(toggles).getByRole('switch', { name: 'tester may ask the Commander' }),
    ).toHaveAttribute('aria-checked', 'false');
    await user.click(within(toggles).getByRole('switch', { name: 'tester may ask the Commander' }));
    expect(within(toggles).getByTestId('toggle-changed')).toBeInTheDocument();
    await user.click(within(toggles).getByRole('switch', { name: 'tester may ask the Commander' }));
    expect(within(toggles).queryByTestId('toggle-changed')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: /Start/ }));
    await waitFor(() => expect(home.requestsTo('POST', '/api/missions')).toHaveLength(1));
    expect(home.requestsTo('POST', '/api/missions')[0]!.body).toEqual({
      project: 'my-app',
      assembly: 'feature',
      task: { kind: 'path', path: '/tasks/my-task' },
      workItemId: 'ABC-9',
      checkoutPath: '/repos/my-app',
      mayAskCommander: {
        analyst: true,
        implementer: false,
        reviewer: false,
        tester: false,
        publisher: false,
        'pr-reviewer': false,
      },
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/missions/m2'));
    expect(JSON.parse(window.localStorage.getItem('suptron.startMission.my-app')!)).toEqual({
      checkoutPath: '/repos/my-app',
      taskPath: '/tasks/my-task',
    });

    // second opening: the Task path is prefilled, the Checkout is skipped because it is now busy
    await router.navigate({ to: '/' });
    await user.click(await screen.findByTestId('launch-button'));
    const again = await screen.findByRole('dialog');
    expect(within(again).getByLabelText('Task location')).toHaveValue('/tasks/my-task');
    await within(again).findByText('Found folder');
    expect(within(again).getByRole('combobox', { name: 'Checkout' })).not.toHaveTextContent(
      '/repos/my-app',
    );
    expect(within(again).getByRole('button', { name: /Start/ })).toBeDisabled();
  });

  it('shows a busy-Checkout refusal at the Checkout field and refetches', async () => {
    const home = useFakeHome();
    window.localStorage.setItem(
      'suptron.startMission.my-app',
      JSON.stringify({ checkoutPath: '/repos/my-app', taskPath: '/tasks/my-task' }),
    );
    const user = userEvent.setup();
    renderInApp(<LaunchButton project="my-app" assembly="feature" />, home.live);
    await user.click(await screen.findByTestId('launch-button'));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: 'Checkout' })).toHaveTextContent(
        '/repos/my-app (main)',
      ),
    );
    await within(dialog).findByText('Found folder');
    // someone else takes the Checkout between the listing and Start
    home.startMission({
      project: 'my-app',
      assembly: 'feature',
      task: { kind: 'path', path: '/tasks/my-task' },
      checkoutPath: '/repos/my-app',
    });
    await user.click(within(dialog).getByRole('button', { name: /Start/ }));
    expect(
      await within(dialog).findByText('This Checkout is busy with another Mission'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: 'Checkout' }));
    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-disabled', 'true');
  });

  it('starts from Task text and keeps the last Task path prefilled', async () => {
    const home = useFakeHome();
    window.localStorage.setItem(
      'suptron.startMission.my-app',
      JSON.stringify({ checkoutPath: '/repos/my-app', taskPath: '/tasks/my-task' }),
    );
    const user = userEvent.setup();
    const { router } = renderInApp(<LaunchButton project="my-app" assembly="feature" />, home.live);
    await user.click(await screen.findByTestId('launch-button'));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Found folder');
    await user.click(within(dialog).getByRole('tab', { name: 'Text' }));
    expect(within(dialog).getByRole('button', { name: /Start/ })).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText('Task text'),
      '# Add login{enter}{enter}Users sign in with email.',
    );
    await user.click(within(dialog).getByRole('button', { name: /Start/ }));
    await waitFor(() => expect(home.requestsTo('POST', '/api/missions')).toHaveLength(1));
    expect(home.requestsTo('POST', '/api/missions')[0]!.body).toMatchObject({
      task: { kind: 'text', text: '# Add login\n\nUsers sign in with email.' },
      checkoutPath: '/repos/my-app',
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/missions/m1'));
    expect(home.missions.get('m1')!.summary.taskTitle).toBe('Add login');
    expect(JSON.parse(window.localStorage.getItem('suptron.startMission.my-app')!)).toEqual({
      checkoutPath: '/repos/my-app',
      taskPath: '/tasks/my-task',
    });
  });

  it('shows a Checkouts read error in place of the list', async () => {
    const home = useFakeHome();
    home.projects.get('my-app')!.checkoutsError = 'not a git repository';
    const user = userEvent.setup();
    renderInApp(<LaunchButton project="my-app" assembly="feature" />, home.live);
    await user.click(await screen.findByTestId('launch-button'));
    expect(await screen.findByText(/The Checkouts cannot be read/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start/ })).toBeDisabled();
  });
});
