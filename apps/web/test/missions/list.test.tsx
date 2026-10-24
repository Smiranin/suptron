import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useFakeHome } from '../fake-server';
import {
  completedDetail,
  interruptedDetail,
  runningDetail,
  waitingDetail,
} from '../fixtures/missions';
import { renderApp } from '../render';

describe('Missions list', () => {
  it('groups Missions, updates live, counts in the badge and the title, and dismisses', async () => {
    const home = useFakeHome();
    home.seedMissions(runningDetail(), waitingDetail(), completedDetail());
    renderApp('/missions', home.live);
    const needsYou = await screen.findByRole('region', { name: 'Needs you' });
    expect(within(needsYou).getByText('my-task (ABC-7)')).toBeInTheDocument();
    const running = screen.getByRole('region', { name: 'Running' });
    expect(within(running).getByTestId('current-slot')).toHaveTextContent('Slot: implementer');
    const finished = screen.getByRole('region', { name: 'Finished' });
    expect(within(finished).getByText('Completed')).toBeInTheDocument();
    expect(within(finished).queryByTestId('current-slot')).toBeNull();
    expect(screen.getByTestId('missions-badge')).toHaveTextContent('1');
    expect(document.title).toBe('(1) Missions · Suptron');

    // the running Mission asks the Commander: it moves to Needs you
    home.emit({
      type: 'mission.state',
      missionId: 'm-running',
      seq: 12,
      state: 'waiting_for_owner',
      slot: 'implementer',
    });
    await waitFor(() => expect(screen.getByTestId('missions-badge')).toHaveTextContent('2'));
    expect(
      within(screen.getByRole('region', { name: 'Needs you' })).getAllByTestId('mission-row'),
    ).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Running' })).toBeNull();
    expect(document.title).toBe('(2) Missions · Suptron');

    const user = userEvent.setup();
    await user.click(within(finished).getByRole('button', { name: /Dismiss/ }));
    await waitFor(() =>
      expect(home.requestsTo('DELETE', '/api/missions/m-completed')).toHaveLength(1),
    );
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Finished' })).toBeNull());
    expect(screen.getByRole('link', { name: /my-task \(ABC-7\)/ })).toHaveAttribute(
      'href',
      '/missions/m-waiting',
    );
  });

  it('shows the empty hint and the interrupted note', async () => {
    const home = useFakeHome();
    renderApp('/missions', home.live);
    expect(await screen.findByText('No Missions')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Projects' })).toHaveAttribute(
      'href',
      '/projects',
    );
    expect(document.title).toBe('Missions · Suptron');

    home.seedMissions(interruptedDetail());
    home.live.emit({
      type: 'mission.started',
      missionId: 'm-interrupted',
      seq: 1,
      mission: interruptedDetail().summary,
    });
    expect(await screen.findByText('Stopped · interrupted')).toBeInTheDocument();
    expect(screen.queryByTestId('current-slot')).toBeNull();
    home.live.setStatus('closed');
    expect(await screen.findByText('Connection lost, reconnecting')).toBeInTheDocument();
  });
});
