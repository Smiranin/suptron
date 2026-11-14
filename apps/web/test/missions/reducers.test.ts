import type { MissionEvent, MissionSummary } from '@suptron/runtime/browser';
import { describe, expect, it } from 'vitest';
import {
  applyMissionsListEvent,
  groupMissions,
  initMissionPage,
  initialMissionsListState,
  liveRow,
  missionDecorations,
  missionTitle,
  needsYouCount,
  reduceMissionPage,
  replaceMissions,
  sectionsOf,
  taskName,
  type MissionPageState,
  type ReadyMissionState,
} from '../../src/features/missions/model';
import {
  attentionDetail,
  completedDetail,
  runningDetail,
  stoppedDetail,
  waitingDetail,
} from '../fixtures/missions';

function ready(state: MissionPageState): ReadyMissionState {
  if (state.status !== 'ready') throw new Error(`expected ready, got ${state.status}`);
  return state;
}

/** Applies a list of events, stamping seq from `from` upward. */
type EventBody = MissionEvent extends infer E
  ? E extends { seq: number }
    ? Omit<E, 'seq' | 'missionId'>
    : never
  : never;

function play(
  state: MissionPageState,
  events: EventBody[],
  from: number,
  missionId = 'm-running',
): MissionPageState {
  let next = state;
  events.forEach((event, index) => {
    next = reduceMissionPage(next, {
      type: 'event',
      event: { ...event, missionId, seq: from + index } as MissionEvent,
      now: 1000 + index,
    });
  });
  return next;
}

describe('missions list reducer', () => {
  const started = (
    id: string,
    state: MissionSummary['state'],
    startedAt: string,
  ): MissionSummary => ({
    ...runningDetail(id).summary,
    state,
    startedAt,
  });

  it('adds, patches, removes and groups newest first', () => {
    let state = replaceMissions(initialMissionsListState, [
      started('a', 'running', '2026-10-23T09:00:00Z'),
    ]);
    state = applyMissionsListEvent(state, {
      type: 'mission.started',
      missionId: 'b',
      seq: 1,
      mission: started('b', 'running', '2026-10-23T10:00:00Z'),
    });
    state = applyMissionsListEvent(state, {
      type: 'mission.started',
      missionId: 'c',
      seq: 1,
      mission: started('c', 'completed', '2026-10-23T08:00:00Z'),
    });
    state = applyMissionsListEvent(state, {
      type: 'mission.state',
      missionId: 'a',
      seq: 2,
      state: 'waiting_for_owner',
      slot: 'analyst',
    });
    state = applyMissionsListEvent(state, {
      type: 'slot.started',
      missionId: 'b',
      seq: 2,
      slot: 'tester',
      attempt: 1,
    });
    state = applyMissionsListEvent(state, {
      type: 'cost.updated',
      missionId: 'b',
      seq: 3,
      slot: 'tester',
      cost: { usd: 1, inputTokens: 1, outputTokens: 1 },
      missionTotal: { usd: 2, inputTokens: 2, outputTokens: 2 },
    });
    expect(groupMissions(state).needsYou.map((m) => m.id)).toEqual(['a']);
    expect(groupMissions(state).running.map((m) => m.id)).toEqual(['b']);
    expect(groupMissions(state).finished.map((m) => m.id)).toEqual(['c']);
    expect(state.missions.b).toMatchObject({
      currentSlot: 'tester',
      cost: { usd: 2, estimated: true },
    });
    expect(needsYouCount(state)).toBe(1);
    state = applyMissionsListEvent(state, {
      type: 'mission.started',
      missionId: 'd',
      seq: 1,
      mission: started('d', 'needs_attention', '2026-10-23T11:00:00Z'),
    });
    expect(groupMissions(state).needsYou.map((m) => m.id)).toEqual(['d', 'a']);
    state = applyMissionsListEvent(state, {
      type: 'mission.stopped',
      missionId: 'b',
      seq: 4,
      note: 'interrupted',
    });
    expect(state.missions.b).toMatchObject({
      state: 'stopped',
      currentSlot: null,
      note: 'interrupted',
    });
    state = applyMissionsListEvent(state, {
      type: 'mission.completed',
      missionId: 'a',
      seq: 3,
      report: 'r',
      pr: { number: 1, url: 'u' },
      exitSlot: 'x',
      slots: [],
      cost: { usd: 3, inputTokens: 0, outputTokens: 0 },
    });
    expect(state.missions.a).toMatchObject({
      state: 'completed',
      pr: { number: 1 },
      cost: { usd: 3 },
    });
    state = applyMissionsListEvent(state, { type: 'mission.dismissed', missionId: 'c', seq: 9 });
    expect(state.missions.c).toBeUndefined();
    expect(
      applyMissionsListEvent(state, {
        type: 'mission.state',
        missionId: 'zz',
        seq: 1,
        state: 'running',
      }),
    ).toBe(state);
  });

  it('names Tasks and Missions', () => {
    expect(taskName({ taskTitle: 'my-task', workItemId: 'ABC-1' })).toBe('my-task (ABC-1)');
    expect(missionTitle({ assemblyName: 'feature', taskTitle: 'Add login' })).toBe(
      'feature · Add login',
    );
  });
});

describe('mission page reducer', () => {
  it('initialises from a detail and follows the current Slot', () => {
    const state = ready(initMissionPage(runningDetail()));
    expect(state.panel).toMatchObject({
      selection: { kind: 'slot', name: 'implementer' },
      follow: true,
      tab: 'main',
    });
    expect(state.current).toEqual({
      slot: 'implementer',
      attempt: 1,
      loopIteration: 1,
      loopFrom: 'reviewer',
    });
    expect(sectionsOf(state, 'implementer')).toHaveLength(2);
    const decorations = missionDecorations(state);
    expect(decorations.slots.implementer).toMatchObject({
      state: 'running',
      current: true,
      attempts: 2,
    });
    expect(decorations.slots.analyst!.state).toBe('done');
    expect(decorations.slots.reviewer!.state).toBe('failed');
    expect(decorations.slots.tester!.state).toBe('pending');
    expect(decorations.loops.reviewer).toEqual({ iterations: 1, limit: 3 });
    expect(decorations.exitLit).toBeNull();
  });

  it('the clock centre shows the cost of the Core itself, the header the Mission total', () => {
    const state = ready(
      play(
        initMissionPage(runningDetail()),
        [
          {
            type: 'cost.updated',
            slot: 'core',
            cost: { usd: 0.5, inputTokens: 500, outputTokens: 50 },
            missionTotal: { usd: 9, inputTokens: 9000, outputTokens: 900 },
          },
        ],
        12,
      ),
    );
    expect(missionDecorations(state).core.cost).toEqual({
      usd: 0.5,
      inputTokens: 500,
      outputTokens: 50,
    });
    expect(state.summary.cost).toMatchObject({ usd: 9, estimated: true });
  });

  it('reviewer fails three times: the chord shows 3 of 3, then Needs Attention with the Attention tab and the reviewer failed', () => {
    let state: MissionPageState = initMissionPage(runningDetail());
    const loop = (iteration: number): EventBody[] => [
      { type: 'slot.done', slot: 'implementer', output: 'ok' },
      { type: 'slot.started', slot: 'reviewer', attempt: 1 },
      {
        type: 'check.evaluated',
        slot: 'reviewer',
        check: { kind: 'llm_judgment', criterion: 'c' },
        holds: false,
        detail: 'no',
      },
      {
        type: 'slot.started',
        slot: 'implementer',
        attempt: 1,
        loopIteration: iteration,
        loopFrom: 'reviewer',
      },
    ];
    state = play(state, [...loop(2), ...loop(3)], 12);
    let r = ready(state);
    expect(missionDecorations(r).loops.reviewer).toMatchObject({
      iterations: 3,
      limit: 3,
      firedAt: expect.any(Number),
    });
    expect(r.panel.selection).toEqual({ kind: 'slot', name: 'implementer' });
    state = play(
      state,
      [
        { type: 'slot.done', slot: 'implementer', output: 'ok' },
        { type: 'slot.started', slot: 'reviewer', attempt: 1 },
        {
          type: 'check.evaluated',
          slot: 'reviewer',
          check: { kind: 'llm_judgment', criterion: 'c' },
          holds: false,
          detail: 'no',
        },
        {
          type: 'mission.state',
          state: 'needs_attention',
          cause: 'loop_limit',
          reason: 'Stuck.',
          slot: 'reviewer',
          failedChecks: [],
        },
      ],
      20,
    );
    r = ready(state);
    expect(r.summary.state).toBe('needs_attention');
    expect(r.attention).toMatchObject({ cause: 'loop_limit', slot: 'reviewer' });
    expect(r.panel.tab).toBe('attention');
    expect(missionDecorations(r).slots.reviewer).toMatchObject({
      state: 'failed',
      marker: 'attention',
    });
    // Retry: running again, Attempt 2 with the note, the tab back to main
    state = play(
      state,
      [
        { type: 'mission.state', state: 'running' },
        { type: 'slot.started', slot: 'reviewer', attempt: 2, note: 'look again' },
      ],
      24,
    );
    r = ready(state);
    expect(r.attention).toBeUndefined();
    expect(r.panel.tab).toBe('main');
    expect(r.sections.at(-1)?.entries[0]).toMatchObject({ kind: 'note', text: 'look again' });
    expect(missionDecorations(r).slots.reviewer!.state).toBe('running');
  });

  it('ignores events with seq <= state.seq and merges tool results into their calls', () => {
    const state = initMissionPage(runningDetail());
    expect(
      reduceMissionPage(state, {
        type: 'event',
        event: {
          type: 'agent.text',
          missionId: 'm-running',
          seq: 11,
          slot: 'implementer',
          payload: { type: 'text', text: 'late' },
        },
      }),
    ).toBe(state);
    const next = ready(
      play(
        state,
        [
          {
            type: 'agent.tool_call',
            slot: 'implementer',
            payload: { type: 'tool_call', id: 'tc', name: 'Bash', input: { command: 'pnpm test' } },
          },
          {
            type: 'agent.tool_result',
            slot: 'implementer',
            payload: { type: 'tool_result', toolCallId: 'tc', output: 'ok', isError: false },
          },
        ],
        12,
      ),
    );
    const entries = next.sections.at(-1)!.entries;
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      kind: 'tool_call',
      name: 'Bash',
      result: { output: 'ok', isError: false },
    });
    expect(next.seq).toBe(13);
  });

  it('init after a reconnect replaces sections without duplicates and keeps a pinned selection', () => {
    let state = reduceMissionPage(initMissionPage(runningDetail()), {
      type: 'selectSlot',
      name: 'analyst',
    });
    state = play(
      state,
      [{ type: 'agent.text', slot: 'implementer', payload: { type: 'text', text: 'more' } }],
      12,
    );
    const refreshed = runningDetail();
    refreshed.transcript
      .at(-1)!
      .entries.push({ id: 'm-running:12', at: 'x', kind: 'text', text: 'more' });
    refreshed.seq = 12;
    const next = ready(reduceMissionPage(state, { type: 'init', detail: refreshed }));
    expect(next.sections.at(-1)!.entries).toHaveLength(2);
    expect(next.panel).toMatchObject({
      selection: { kind: 'slot', name: 'analyst' },
      follow: false,
    });
  });

  it('a pinned selection does not move on slot.started; Back to current resumes following', () => {
    let state = reduceMissionPage(initMissionPage(runningDetail()), {
      type: 'selectSlot',
      name: 'analyst',
    });
    state = play(
      state,
      [
        { type: 'slot.done', slot: 'implementer', output: 'ok' },
        { type: 'slot.started', slot: 'tester', attempt: 1 },
      ],
      12,
    );
    expect(ready(state).panel.selection).toEqual({ kind: 'slot', name: 'analyst' });
    state = reduceMissionPage(state, { type: 'backToCurrent' });
    expect(ready(state).panel).toMatchObject({
      selection: { kind: 'slot', name: 'tester' },
      follow: true,
    });
    state = play(
      state,
      [
        { type: 'slot.done', slot: 'tester', output: 'ok' },
        { type: 'slot.started', slot: 'publisher', attempt: 1 },
      ],
      14,
    );
    expect(ready(state).panel.selection).toEqual({ kind: 'slot', name: 'publisher' });
  });

  it('a question opens the Question tab; the answer clears it and the transcript holds both', () => {
    const questions = [{ question: 'Which DB?', header: 'DB', options: [], multiSelect: false }];
    let state = play(
      initMissionPage(runningDetail()),
      [
        { type: 'question.asked', slot: 'implementer', questionId: 'q1', questions },
        { type: 'mission.state', state: 'waiting_for_owner', slot: 'implementer' },
      ],
      12,
    );
    let r = ready(state);
    expect(r.pendingQuestion).toMatchObject({ id: 'q1', slot: 'implementer' });
    expect(r.panel.tab).toBe('question');
    expect(missionDecorations(r).slots.implementer!.marker).toBe('waiting');
    state = play(
      state,
      [
        {
          type: 'question.answered',
          slot: 'implementer',
          questionId: 'q1',
          answers: { 'Which DB?': 'Postgres' },
        },
        { type: 'mission.state', state: 'running' },
      ],
      14,
    );
    r = ready(state);
    expect(r.pendingQuestion).toBeUndefined();
    expect(r.panel.tab).toBe('main');
    expect(r.sections.at(-1)!.entries.map((e) => e.kind)).toEqual(['text', 'question', 'answer']);
    // The answer sends the Commander to the Slot that asked, following it again.
    expect(r.panel).toMatchObject({
      selection: { kind: 'slot', name: 'implementer' },
      follow: true,
    });
  });

  it('an answer selects the asking Slot even when another one was pinned', () => {
    let state: MissionPageState = initMissionPage(waitingDetail());
    state = reduceMissionPage(state, { type: 'selectSlot', name: 'analyst' });
    expect(ready(state).panel.follow).toBe(false);
    state = play(
      state,
      [
        {
          type: 'question.answered',
          slot: 'implementer',
          questionId: ready(state).pendingQuestion!.id,
          answers: { q: 'a' },
        },
      ],
      ready(state).seq + 1,
      'm-waiting',
    );
    expect(ready(state).panel).toMatchObject({
      selection: { kind: 'slot', name: 'implementer' },
      follow: true,
      tab: 'main',
    });
  });

  it('the live row follows the activity of the current Slot and any entry resets it', () => {
    const detail = runningDetail();
    let state: MissionPageState = initMissionPage(detail, undefined, 1000);
    expect(liveRow(ready(state), 5000)).toEqual({ text: 'Working… 4 s', stale: false });
    state = play(
      state,
      [
        {
          type: 'agent.activity',
          slot: 'implementer',
          payload: { type: 'activity', phase: 'thinking' },
        },
      ],
      12,
    );
    // play() stamps now = 1000 + index: the phase began at 1000.
    expect(ready(state).activity).toMatchObject({
      slot: 'implementer',
      phase: 'thinking',
      since: 1000,
    });
    expect(liveRow(ready(state), 25_000)).toEqual({ text: 'Thinking… 24 s', stale: false });
    state = play(
      state,
      [
        {
          type: 'agent.activity',
          slot: 'implementer',
          payload: { type: 'activity', phase: 'thinking' },
        },
        {
          type: 'agent.activity',
          slot: 'implementer',
          payload: { type: 'activity', phase: 'tool', detail: 'Read' },
        },
      ],
      13,
    );
    expect(ready(state).activity).toMatchObject({ phase: 'tool', detail: 'Read', since: 1001 });
    expect(liveRow(ready(state), 3001)).toEqual({ text: 'Running Read… 2 s', stale: false });
    state = play(
      state,
      [{ type: 'agent.text', slot: 'implementer', payload: { type: 'text', text: 'Read it.' } }],
      15,
    );
    expect(ready(state).activity).toBeUndefined();
    expect(ready(state).lastEventAt).toBe(1000);
    expect(ready(state).sections.at(-1)!.entries.at(-1)).toMatchObject({
      kind: 'text',
      text: 'Read it.',
    });
  });

  it('the live row warns after two minutes of silence and hides when the Mission is not running', () => {
    const state = ready(initMissionPage(runningDetail(), undefined, 1000));
    expect(liveRow(state, 1000 + 119_999)).toEqual({ text: 'Working… 119 s', stale: false });
    expect(liveRow(state, 1000 + 120_000)).toEqual({ text: 'No activity for 2 min', stale: true });
    expect(liveRow(state, 1000 + 185_000)).toEqual({ text: 'No activity for 3 min', stale: true });
    expect(liveRow(ready(initMissionPage(waitingDetail())), Date.now())).toBeNull();
    expect(liveRow(ready(initMissionPage(completedDetail())), Date.now())).toBeNull();
  });

  it('Completed selects the Mission view and lights the Exit arrow; Stopped shows the note', () => {
    const completed = ready(
      play(
        initMissionPage(runningDetail()),
        [
          {
            type: 'mission.completed',
            report: 'done',
            pr: null,
            exitSlot: 'pr-reviewer',
            slots: [],
            cost: { usd: 9, inputTokens: 1, outputTokens: 1 },
          },
        ],
        12,
      ),
    );
    expect(completed.panel).toMatchObject({ selection: { kind: 'mission' }, follow: false });
    expect(completed.result).toEqual({ report: 'done', pr: null, exitSlot: 'pr-reviewer' });
    expect(missionDecorations(completed).exitLit).toBe('pr-reviewer');
    expect(missionDecorations(ready(initMissionPage(completedDetail()))).exitLit).toBe(
      'pr-reviewer',
    );
    const stopped = ready(
      play(
        initMissionPage(waitingDetail()),
        [{ type: 'mission.stopped', note: 'interrupted' }],
        5,
        'm-waiting',
      ),
    );
    expect(stopped.summary).toMatchObject({ state: 'stopped', note: 'interrupted' });
    expect(stopped.pendingQuestion).toBeUndefined();
    expect(ready(initMissionPage(stoppedDetail())).panel.selection).toEqual({
      kind: 'slot',
      name: 'implementer',
    });
    expect(ready(initMissionPage(attentionDetail())).panel.tab).toBe('attention');
  });

  it('Waiting for usage carries the reset time, counts as in progress and ends with it', () => {
    const resetsAt = '2026-10-23T15:00:00.000Z';
    const waiting = ready(
      play(
        initMissionPage(runningDetail()),
        [{ type: 'mission.state', state: 'waiting_for_usage', resetsAt }],
        12,
      ),
    );
    expect(waiting.summary).toMatchObject({ state: 'waiting_for_usage', usageResetsAt: resetsAt });
    // The Slot is still under way: the clock keeps it lit, the live row says nothing.
    expect(missionDecorations(waiting).slots.implementer).toMatchObject({ state: 'running' });
    expect(liveRow(waiting, 2000)).toBeNull();
    const running = ready(play(waiting, [{ type: 'mission.state', state: 'running' }], 13));
    expect(running.summary.state).toBe('running');
    expect(running.summary.usageResetsAt).toBeUndefined();

    let list = replaceMissions(initialMissionsListState, [runningDetail().summary]);
    list = applyMissionsListEvent(list, {
      type: 'mission.state',
      missionId: 'm-running',
      seq: 12,
      state: 'waiting_for_usage',
      resetsAt,
    });
    expect(groupMissions(list).running.map((m) => m.usageResetsAt)).toEqual([resetsAt]);
    expect(needsYouCount(list)).toBe(0);
    list = applyMissionsListEvent(list, {
      type: 'mission.stopped',
      missionId: 'm-running',
      seq: 13,
    });
    expect(list.missions['m-running']!.usageResetsAt).toBeUndefined();
  });

  it('a Stopped Mission can be resumed; the Resume replaces the summary and the Slot runs again', () => {
    const stopped = ready(
      play(
        initMissionPage(runningDetail()),
        [{ type: 'mission.stopped', note: 'interrupted' }],
        12,
      ),
    );
    expect(stopped.resumable).toBe(true);
    const mission: MissionSummary = { ...runningDetail().summary, state: 'running' };
    const resumed = ready(
      play(
        stopped,
        [
          { type: 'mission.resumed', mission },
          { type: 'slot.started', slot: 'implementer', attempt: 3, note: 'Resumed.' },
        ],
        13,
      ),
    );
    expect(resumed.resumable).toBe(false);
    expect(resumed.summary).toMatchObject({ state: 'running', currentSlot: 'implementer' });
    expect(resumed.summary.note).toBeUndefined();
    expect(resumed.sections.at(-1)).toMatchObject({
      execution: { slot: 'implementer', attempt: 3 },
      entries: [{ kind: 'note', text: 'Resumed.' }],
    });

    let list = replaceMissions(initialMissionsListState, [stopped.summary]);
    list = applyMissionsListEvent(list, {
      type: 'mission.resumed',
      missionId: 'm-running',
      seq: 13,
      mission,
    });
    expect(groupMissions(list).running).toHaveLength(1);
    expect(groupMissions(list).finished).toHaveLength(0);
  });

  it('a round of a later Loop renews the count of the Loops inside it; a Slot passed by is counted', () => {
    const state = ready(
      play(
        initMissionPage(runningDetail()),
        [
          {
            type: 'slot.started',
            slot: 'implementer',
            attempt: 1,
            loopIteration: 1,
            loopFrom: 'tester',
          },
          { type: 'slot.skipped', slot: 'reviewer', loopFrom: 'tester' },
        ],
        12,
      ),
    );
    // The fixture's reviewer had looped once; the tester's round is new work for it.
    expect(state.slots.reviewer).toMatchObject({ loops: 0, skipped: 1 });
    expect(state.slots.tester).toMatchObject({ loops: 1 });
    expect(missionDecorations(state).slots.reviewer).toMatchObject({ skipped: 1 });
    expect(missionDecorations(state).slots.tester).toMatchObject({ skipped: 0 });
  });

  it('absent and connection actions', () => {
    let state: MissionPageState = { status: 'loading', connection: 'connecting' };
    state = reduceMissionPage(state, { type: 'connection', status: 'closed' });
    expect(state.connection).toBe('closed');
    state = reduceMissionPage(state, { type: 'absent' });
    expect(state.status).toBe('absent');
    const ready1 = reduceMissionPage(state, { type: 'init', detail: runningDetail() });
    expect(ready1.status).toBe('ready');
    expect(ready1.connection).toBe('closed');
  });
});

describe('mission page reducer: Resolutions of the Core', () => {
  it('writes the Resolution into the running Attempt and onto the Slot record', () => {
    const resolution = {
      cause: 'attempt_limit' as const,
      decision: 'retry' as const,
      reason: 'One entry is left.',
      note: 'Drop the unsourced entry.',
      failedChecks: [],
    };
    const state = ready(
      play(
        initMissionPage(runningDetail()),
        [{ type: 'core.resolved', slot: 'implementer', resolution }],
        12,
      ),
    );
    expect(state.summary.state).toBe('running');
    expect(state.attention).toBeUndefined();
    expect(state.sections.at(-1)!.entries.at(-1)).toMatchObject({
      kind: 'note',
      text: 'The Core decided on one more Attempt: One entry is left.\n\nNote to the Pilot: Drop the unsourced entry.',
    });
    expect(state.slots.implementer?.resolutions).toEqual([resolution]);
  });
});
