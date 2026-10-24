import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useFakeHome } from '../fake-server';
import {
  attentionDetail,
  completedDetail,
  interruptedDetail,
  runningDetail,
  waitingDetail,
} from '../fixtures/missions';
import { renderApp } from '../render';

const card = (name: string) => screen.getByRole('button', { name: `Slot ${name}` });

describe('Mission page', () => {
  it('draws the running fixture: six cards, the current implementer, the reviewer chord 1 / 3, the title', async () => {
    const home = useFakeHome();
    home.seedMissions(runningDetail());
    renderApp('/missions/m-running', home.live);
    expect(await screen.findByTestId('mission-page')).toBeInTheDocument();
    expect(screen.getAllByTestId('slot-card')).toHaveLength(6);
    expect(card('implementer')).toHaveAttribute('data-state', 'running');
    expect(card('implementer')).toHaveAttribute('data-current', 'true');
    expect(within(card('implementer')).getByTestId('attempt-counter')).toHaveTextContent(
      'Attempt 2',
    );
    expect(card('analyst')).toHaveAttribute('data-state', 'done');
    expect(within(card('analyst')).queryByTestId('attempt-counter')).toBeNull();
    const chord = screen.getAllByTestId('loop-chord').find((c) => c.dataset.from === 'reviewer')!;
    expect(chord).toHaveTextContent('1 / 3');
    expect(screen.getByTestId('core-state')).toHaveTextContent('Running');
    expect(document.title).toBe('feature · my-task · Suptron');
    expect(screen.getByTestId('tab-main')).toHaveTextContent('implementer');
    const sections = screen.getAllByTestId('execution-section');
    expect(sections.map((s) => s.textContent)).toEqual([
      expect.stringContaining('Attempt 1'),
      expect.stringContaining('Loop 1 from reviewer'),
    ]);
    expect(sections[0]).toHaveAttribute('data-open', 'false');
    expect(sections[1]).toHaveAttribute('data-open', 'true');
    expect(screen.getByText('Addressing the review feedback.')).toBeInTheDocument();
  });

  it('pins a Slot, resumes following, appends live text and expands a tool call', async () => {
    const home = useFakeHome();
    const detail = runningDetail();
    detail.transcript[0]!.dropped = 50;
    home.seedMissions(detail);
    const user = userEvent.setup();
    renderApp('/missions/m-running', home.live);
    await screen.findByTestId('mission-page');
    await user.click(card('analyst'));
    expect(screen.getByTestId('tab-main')).toHaveTextContent('analyst');
    expect(screen.getByTestId('back-to-current')).toBeInTheDocument();
    const section = screen.getByTestId('execution-section');
    expect(section).toHaveAttribute('data-open', 'false');
    await user.click(within(section).getByRole('button', { name: /Attempt 1/ }));
    expect(screen.getByTestId('dropped-note')).toHaveTextContent('50 earlier entries were dropped');
    const toolRow = screen.getByRole('button', { name: /Read/ });
    await user.click(toolRow);
    expect(screen.getByTestId('tool-input')).toHaveTextContent('/tasks/my-task/SPEC.md');
    expect(screen.getByTestId('tool-result')).toHaveTextContent('# My task');

    home.emit({
      type: 'slot.done',
      missionId: 'm-running',
      seq: 12,
      slot: 'implementer',
      output: 'ok',
    });
    home.emit({
      type: 'slot.started',
      missionId: 'm-running',
      seq: 13,
      slot: 'tester',
      attempt: 1,
    });
    await waitFor(() => expect(card('tester')).toHaveAttribute('data-state', 'running'));
    expect(screen.getByTestId('tab-main')).toHaveTextContent('analyst');
    await user.click(screen.getByTestId('back-to-current'));
    expect(screen.getByTestId('tab-main')).toHaveTextContent('tester');
    home.emit({
      type: 'agent.text',
      missionId: 'm-running',
      seq: 14,
      slot: 'tester',
      payload: { type: 'text', text: 'Running the tests now.' },
    });
    expect(await screen.findByText('Running the tests now.')).toBeInTheDocument();
    home.emit({ type: 'slot.done', missionId: 'm-running', seq: 15, slot: 'tester', output: 'ok' });
    home.emit({
      type: 'slot.started',
      missionId: 'm-running',
      seq: 16,
      slot: 'publisher',
      attempt: 1,
    });
    await waitFor(() => expect(screen.getByTestId('tab-main')).toHaveTextContent('publisher'));
  });

  it('shows the Attention tab and runs a Retry with a note', async () => {
    const home = useFakeHome();
    home.seedMissions(attentionDetail());
    const user = userEvent.setup();
    renderApp('/missions/m-attention', home.live);
    await screen.findByTestId('mission-page');
    expect(card('reviewer')).toHaveAttribute('data-state', 'failed');
    expect(within(card('reviewer')).getByLabelText('Needs attention')).toBeInTheDocument();
    expect(screen.getByTestId('mission-banners')).toHaveTextContent(
      'Needs attention: Loop limit reached on reviewer',
    );
    const tab = await screen.findByTestId('attention-tab');
    expect(tab).toHaveTextContent('Loop limit reached');
    expect(tab).toHaveTextContent('The reviewer keeps finding the same blocking issue');
    expect(within(tab).getAllByTestId('failed-check')).toHaveLength(2);
    expect(within(tab).getAllByTestId('failed-check')[1]).toHaveTextContent('pnpm lint');
    await user.type(within(tab).getByLabelText(/Note to the agent/), 'Focus on the validation.');
    await user.click(within(tab).getByRole('button', { name: /Retry/ }));
    await waitFor(() =>
      expect(home.requestsTo('POST', '/api/missions/m-attention/retry')).toHaveLength(1),
    );
    expect(home.requestsTo('POST', '/api/missions/m-attention/retry')[0]!.body).toEqual({
      note: 'Focus on the validation.',
    });
    await waitFor(() => expect(screen.queryByTestId('attention-tab')).toBeNull());
    expect(screen.queryByTestId('tab-attention')).toBeNull();
    const sections = screen.getAllByTestId('execution-section');
    const latest = sections.at(-1)!;
    expect(latest).toHaveTextContent('Attempt 3');
    expect(latest).toHaveAttribute('data-open', 'true');
    expect(within(latest).getByText('Focus on the validation.')).toBeInTheDocument();
    expect(card('reviewer')).toHaveAttribute('data-state', 'running');
    expect(screen.queryByText(/Needs attention:/)).toBeNull();
  });

  it('answers a Human Checkpoint from the Question tab', async () => {
    const home = useFakeHome();
    home.seedMissions(waitingDetail());
    const user = userEvent.setup();
    renderApp('/missions/m-waiting', home.live);
    await screen.findByTestId('mission-page');
    expect(screen.getByTestId('mission-banners')).toHaveTextContent(
      'Waiting for your answer on analyst',
    );
    expect(within(card('analyst')).getByLabelText('Waiting for you')).toBeInTheDocument();
    const tab = await screen.findByTestId('question-tab');
    expect(tab).toHaveTextContent('Which database?');
    expect(within(tab).getByRole('button', { name: 'Answer' })).toBeDisabled();
    await user.click(within(tab).getByRole('radio', { name: /SQLite/ }));
    await user.click(within(tab).getByRole('button', { name: 'Answer' }));
    await waitFor(() =>
      expect(home.requestsTo('POST', '/api/missions/m-waiting/answer')).toHaveLength(1),
    );
    expect(home.requestsTo('POST', '/api/missions/m-waiting/answer')[0]!.body).toEqual({
      questionId: 'q-1',
      answers: { 'Which database?': 'SQLite' },
    });
    await waitFor(() => expect(screen.queryByTestId('question-tab')).toBeNull());
    expect(screen.queryByText(/Waiting for your answer/)).toBeNull();
    const section = screen.getByTestId('execution-section');
    expect(within(section).getByText('Database')).toBeInTheDocument();
    expect(within(section).getByText('SQLite')).toBeInTheDocument();
  });

  it('shows the Completed layout and Stops from the header', async () => {
    const home = useFakeHome();
    home.seedMissions(completedDetail(), runningDetail());
    const user = userEvent.setup();
    const { router } = renderApp('/missions/m-completed', home.live);
    await screen.findByTestId('mission-page');
    const exit = screen.getAllByTestId('exit-arrow').find((e) => e.dataset.slot === 'pr-reviewer')!;
    expect(exit).toHaveAttribute('data-highlighted', 'true');
    expect(within(screen.getByTestId('mission-header')).getByTestId('pr-link')).toHaveAttribute(
      'href',
      'https://github.com/me/my-app/pull/42',
    );
    const view = screen.getByTestId('mission-level-view');
    expect(within(view).getByTestId('final-report')).toHaveTextContent(
      'The login form was built and verified.',
    );
    const rows = within(view).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.getAttribute('data-slot'))).toEqual([
      'analyst',
      'implementer',
      'reviewer',
      'tester',
      'publisher',
      'pr-reviewer',
      'core',
    ]);
    expect(rows[2]).toHaveTextContent('reviewer21');
    expect(screen.queryByRole('button', { name: /Stop/ })).toBeNull();
    await user.click(card('implementer'));
    expect(screen.getByTestId('tab-main')).toHaveTextContent('implementer');

    await router.navigate({ to: '/missions/$id', params: { id: 'm-running' } });
    await screen.findByText('Addressing the review feedback.');
    await user.click(screen.getByRole('button', { name: /Stop/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('cannot be resumed');
    await user.click(within(dialog).getByRole('button', { name: 'Stop Mission' }));
    await waitFor(() =>
      expect(home.requestsTo('POST', '/api/missions/m-running/stop')).toHaveLength(1),
    );
    await waitFor(() => expect(screen.getByTestId('mission-banners')).toHaveTextContent('Stopped'));
    expect(screen.queryByRole('button', { name: /Stop/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Dismiss/ })).toBeInTheDocument();
  });

  it('handles absence, the lost transcript, connection loss, resync and Dismiss', async () => {
    const home = useFakeHome();
    home.seedMissions(interruptedDetail(), runningDetail());
    const user = userEvent.setup();
    const { router } = renderApp('/missions/nope', home.live);
    expect(await screen.findByText('This Mission is gone')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Missions' })).toHaveAttribute(
      'href',
      '/missions',
    );

    await router.navigate({ to: '/missions/$id', params: { id: 'm-interrupted' } });
    expect(await screen.findByTestId('transcript-lost')).toBeInTheDocument();
    expect(screen.getByTestId('mission-banners')).toHaveTextContent('interrupted');

    await router.navigate({ to: '/missions/$id', params: { id: 'm-running' } });
    await screen.findByText('Addressing the review feedback.');
    const fetches = () => home.requestsTo('GET', '/api/missions/m-running').length;
    const before = fetches();
    home.live.setStatus('closed', 'm-running');
    expect(await screen.findByText('Connection lost, reconnecting')).toBeInTheDocument();
    // while disconnected the server moved on; the reopen refetch shows it without duplicates
    home.missions
      .get('m-running')!
      .transcript.at(-1)!
      .entries.push({ id: 'm-running:12', at: 'x', kind: 'text', text: 'Missed while offline.' });
    home.missions.get('m-running')!.seq = 12;
    home.live.setStatus('open', 'm-running');
    expect(await screen.findByText('Missed while offline.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Connection lost, reconnecting')).toBeNull());
    expect(fetches()).toBe(before + 1);
    expect(screen.getAllByText('Addressing the review feedback.')).toHaveLength(1);
    home.live.resync('m-running');
    await waitFor(() => expect(fetches()).toBe(before + 2));

    home.live.emit({ type: 'mission.dismissed', missionId: 'm-running', seq: 99 });
    expect(await screen.findByText('This Mission is gone')).toBeInTheDocument();

    await router.navigate({ to: '/missions/$id', params: { id: 'm-interrupted' } });
    await screen.findByTestId('transcript-lost');
    await user.click(screen.getByRole('button', { name: /Dismiss/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/missions'));
    expect(await screen.findByRole('heading', { name: 'Missions' })).toBeInTheDocument();
    expect(screen.queryByText('Stopped · interrupted')).toBeNull();
  });
});
