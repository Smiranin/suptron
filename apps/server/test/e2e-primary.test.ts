import {
  coreCallName,
  defaultCoreScript,
  type MissionDetail,
  type MissionEvent,
} from '@suptron/runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testServer, type TestServer } from './helpers.js';

/** The primary scenario of the SPEC through HTTP: a Loop from reviewer, one from pr-reviewer, Completed with a PR. */
describe('Primary scenario end to end', () => {
  let s: TestServer;
  beforeEach(async () => {
    s = await testServer();
  });
  afterEach(() => s.cleanup());

  it('walks the feature Assembly to a draft Pull Request and a report', async () => {
    const branch = 'feature/ABC-7-suptron-task';
    s.engine.script('pilot', 'analyst', [
      { text: 'Reading the SPEC.' },
      {
        question: [
          {
            question: 'Which database?',
            header: 'DB',
            options: [
              { label: 'Postgres', description: '' },
              { label: 'SQLite', description: '' },
            ],
            multiSelect: false,
          },
        ],
      },
      { shell: 'true' },
      { result: { output: 'Decisions: Postgres.' } },
    ]);
    s.engine.script('pilot', 'implementer', (call) => [
      {
        text:
          call.index === 0 ? 'Creating the branch and implementing.' : 'Addressing the feedback.',
      },
      {
        shell:
          call.index === 0
            ? `git checkout -q -b ${branch} && echo one > one.txt && git add one.txt && git commit -q -m one`
            : `echo ${call.index} > more${call.index}.txt && git add . && git commit -q -m more${call.index}`,
      },
      { result: { output: `Implemented round ${call.index + 1}.` } },
    ]);
    s.engine.pilot('reviewer', 'Review done.');
    s.engine.pilot('tester', 'Tests added.');
    s.engine.pilot('publisher', 'Opened the draft PR.', [{ shell: 'git push -q -u origin HEAD' }]);
    s.engine.pilot('pr-reviewer', 'Commented on the PR.');
    let judgeCalls = 0;
    s.engine.script('core', 'core', (call) => {
      const name = coreCallName(call.prompt);
      if (name === 'judge') {
        judgeCalls += 1;
        return [
          {
            result: {
              structured: {
                holds: judgeCalls > 1,
                reason: judgeCalls > 1 ? 'No blocking findings.' : 'One blocking finding.',
              },
            },
          },
        ];
      }
      if (name === 'finalReport')
        return [{ result: { structured: { report: '# Mission report\n\nDone.' } } }];
      return defaultCoreScript(call);
    });
    // The publisher's `gh pr create` is simulated by seeding the FakeHost when the publisher starts.
    s.registry.events.on('slot.started', (event: MissionEvent) => {
      if (event.type === 'slot.started' && event.slot === 'publisher') {
        s.host.seedPullRequest(branch, { ci: 'success', unresolvedThreads: 1 });
      }
      if (
        event.type === 'slot.started' &&
        event.slot === 'implementer' &&
        event.loopFrom === 'pr-reviewer'
      ) {
        s.host.setUnresolvedThreads(s.host.byBranch(branch)!.number, 0);
      }
    });

    const started = await s.app.inject({
      method: 'POST',
      url: '/api/missions',
      payload: s.startBody({ workItemId: 'ABC-7', mayAskCommander: { analyst: true } }),
    });
    expect(started.statusCode).toBe(201);
    const id = started.json().id as string;
    await s.waitForState(id, 'waiting_for_owner');
    const pending = (
      (await s.app.inject({ method: 'GET', url: `/api/missions/${id}` })).json() as MissionDetail
    ).pendingQuestion!;
    await s.app.inject({
      method: 'POST',
      url: `/api/missions/${id}/answer`,
      payload: { questionId: pending.id, answers: { 'Which database?': 'Postgres' } },
    });
    await s.waitFor(
      (es) => es.some((e) => e.missionId === id && e.type === 'mission.completed'),
      20_000,
    );

    const detail = (
      await s.app.inject({ method: 'GET', url: `/api/missions/${id}` })
    ).json() as MissionDetail;
    expect(detail.summary.state).toBe('completed');
    expect(detail.summary.branch).toBe(branch);
    expect(detail.result).toMatchObject({
      exitSlot: 'pr-reviewer',
      report: '# Mission report\n\nDone.',
    });
    expect(detail.result?.pr?.url).toContain('/pull/');
    expect(detail.summary.pr).toEqual(detail.result?.pr);
    const order = s.events
      .filter(
        (e): e is Extract<MissionEvent, { type: 'slot.started' }> =>
          e.missionId === id && e.type === 'slot.started',
      )
      .map((e) => `${e.slot}${e.loopFrom ? `<${e.loopFrom}` : ''}`);
    expect(order).toEqual([
      'analyst',
      'implementer',
      'reviewer',
      'implementer<reviewer',
      'reviewer',
      'tester',
      'publisher',
      'pr-reviewer',
      'implementer<pr-reviewer',
      'reviewer',
      'tester',
      'publisher',
      'pr-reviewer',
    ]);
    expect(detail.slots.find((sl) => sl.name === 'implementer')?.attempts).toBe(3);
    expect(detail.slots.find((sl) => sl.name === 'pr-reviewer')?.loops).toBe(1);
    expect(new Set(s.engine.callsFor('pilot', 'implementer').map((c) => c.sessionId)).size).toBe(1);
    const log = await s.repo.git(['log', '--oneline', 'origin/' + branch]);
    expect(log.split('\n').filter(Boolean)).toHaveLength(4);
  });
});
