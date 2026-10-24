import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CheckoutBusyError,
  MissionRegistry,
  MissionStartError,
  MissionStateError,
  RealGitClient,
  type AssemblyFile,
  type Check,
  type MissionEvent,
  type MissionTask,
  type UnitFile,
} from '../src/index.js';
import {
  FakeEngine,
  FakeHost,
  coreCallInput,
  coreCallName,
  primaryProfile,
  tempRepo,
  writeHome,
  type FakeCall,
  type FakeStep,
  type TempRepo,
} from '../src/testing/index.js';

function unit(name: string, doneCondition: Check[] = [], extra: Partial<UnitFile> = {}): UnitFile {
  return {
    name,
    model: 'sonnet',
    mayAskCommander: false,
    doneCondition,
    rules: `Rules of ${name}`,
    instructions: `Instructions of ${name}`,
    ...extra,
  };
}

const PASS: Check = { kind: 'command', command: 'true' };
const FAIL: Check = { kind: 'command', command: 'false' };

interface Harness {
  repo: TempRepo;
  home: string;
  taskDir: string;
  engine: FakeEngine;
  host: FakeHost;
  registry: MissionRegistry;
  events: MissionEvent[];
  start(
    assembly?: string,
    overrides?: {
      checkoutPath?: string;
      toggles?: Record<string, boolean>;
      workItemId?: string;
      task?: MissionTask;
    },
  ): Promise<string>;
  waitFor(predicate: (events: MissionEvent[]) => boolean, timeoutMs?: number): Promise<void>;
  waitForState(id: string, state: string): Promise<void>;
  types(id?: string): string[];
}

async function harness(units: UnitFile[], assemblies: AssemblyFile[]): Promise<Harness> {
  const repo = await tempRepo();
  const home = await mkdtemp(join(tmpdir(), 'suptron-home-'));
  const taskDir = await mkdtemp(join(tmpdir(), 'suptron-task-'));
  await writeFile(join(taskDir, 'SPEC.md'), '# Add login\n');
  await writeHome(home, {
    units,
    projects: [{ profile: primaryProfile(repo.clonePath), assemblies }],
  });
  const engine = new FakeEngine();
  const host = new FakeHost();
  const registry = new MissionRegistry({
    home,
    engine,
    host,
    git: new RealGitClient(),
    ciPollIntervalMs: 5,
    ciNoneGraceMs: 0,
    ciWaitTimeoutMs: 300,
  });
  const events: MissionEvent[] = [];
  registry.events.onAny((e) => events.push(e));
  const waitFor = async (predicate: (events: MissionEvent[]) => boolean, timeoutMs = 10_000) => {
    const started = Date.now();
    while (!predicate(events)) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting. Events: ${events.map((e) => e.type).join(', ')}`);
      }
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  return {
    repo,
    home,
    taskDir,
    engine,
    host,
    registry,
    events,
    start: async (assembly = 'feature', overrides = {}) => {
      const summary = await registry.start({
        project: 'my-app',
        assembly,
        task: overrides.task ?? { kind: 'path', path: taskDir },
        checkoutPath: overrides.checkoutPath ?? repo.clonePath,
        ...(overrides.workItemId !== undefined && { workItemId: overrides.workItemId }),
        ...(overrides.toggles && { mayAskCommander: overrides.toggles }),
      });
      return summary.id;
    },
    waitFor,
    waitForState: (id, state) =>
      waitFor((es) =>
        es.some((e) => e.missionId === id && e.type === 'mission.state' && e.state === state),
      ),
    types: (id) => events.filter((e) => !id || e.missionId === id).map((e) => e.type),
  };
}

async function cleanup(h: Harness | undefined) {
  if (!h) return;
  await h.registry.flush();
  await Promise.all([
    h.repo.cleanup(),
    rm(h.home, { recursive: true, force: true }),
    rm(h.taskDir, { recursive: true, force: true }),
  ]);
}

function linear(slots: AssemblyFile['slots'], name = 'feature'): AssemblyFile {
  return {
    name,
    core: { model: 'opus', defaultAttemptLimit: 2, defaultLoopLimit: 3, instructions: '' },
    slots,
  };
}

const composeCalls = (engine: FakeEngine, slot: string): FakeCall[] =>
  engine
    .callsFor('core', 'core')
    .filter((c) => coreCallName(c.prompt) === 'composeSlotPrompt')
    .filter((c) => (coreCallInput(c.prompt) as { slot: { name: string } }).slot.name === slot);

describe('Runner scenarios', () => {
  let h: Harness | undefined;
  afterEach(() => cleanup(h));

  it('completes a linear three-Slot Assembly in order', async () => {
    h = await harness(
      [unit('a', [PASS]), unit('b', [PASS]), unit('c', [PASS])],
      [
        linear([
          { name: 'a', unit: 'a' },
          { name: 'b', unit: 'b' },
          { name: 'c', unit: 'c' },
        ]),
      ],
    );
    const id = await h.start();
    await h.waitFor((es) => es.some((e) => e.type === 'mission.completed'));
    const slotsStarted = h.events.filter((e) => e.type === 'slot.started').map((e) => e.slot);
    expect(slotsStarted).toEqual(['a', 'b', 'c']);
    const completed = h.events.find((e) => e.type === 'mission.completed')!;
    expect(completed).toMatchObject({
      type: 'mission.completed',
      exitSlot: 'c',
      pr: null,
      report: 'All Slots completed.',
    });
    expect(h.types(id)[0]).toBe('mission.started');
    expect(h.registry.get(id)?.summary.state).toBe('completed');
    expect(h.registry.get(id)?.result?.exitSlot).toBe('c');
    expect(h.events.map((e) => e.seq)).toEqual(h.events.map((_, i) => i + 1));
    // every Slot and the Core got a cost; the Mission total sums them
    const slots = h.registry.get(id)!.slots;
    expect(slots.map((s) => s.name)).toEqual(['a', 'b', 'c', 'core']);
    expect(slots.every((s) => s.cost.usd > 0)).toBe(true);
    expect(h.registry.get(id)!.summary.cost.usd).toBeCloseTo(
      slots.reduce((sum, s) => sum + s.cost.usd, 0),
    );
    expect(h.registry.isCheckoutBusy(h.repo.clonePath)).toBeNull();
    expect(h.registry.get(id)!.summary.taskTitle).toBe(basename(h.taskDir));
  });

  it('stores a text Task in the Mission folder, titles it from the first line, removes it on Dismiss', async () => {
    h = await harness([unit('a', [PASS])], [linear([{ name: 'a', unit: 'a' }])]);
    await expect(
      h.start('feature', { task: { kind: 'text', text: '  \n ' } }),
    ).rejects.toMatchObject({ issues: [{ field: 'taskText' }] });
    const text = '\n## Add login\n\nUsers sign in with email. See https://example.test/spec';
    const id = await h.start('feature', { task: { kind: 'text', text } });
    await h.waitFor((es) => es.some((e) => e.type === 'mission.completed'));
    const summary = h.registry.get(id)!.summary;
    expect(summary.taskPath).toBe(join(h.home, 'missions', id));
    expect(summary.taskTitle).toBe('Add login');
    expect(await readFile(join(summary.taskPath, 'task.md'), 'utf8')).toBe(`${text}\n`);
    const bundle = coreCallInput(composeCalls(h.engine, 'a')[0]!.prompt) as {
      bundle: { taskDocuments: string[] };
    };
    expect(bundle.bundle.taskDocuments).toEqual([join(summary.taskPath, 'task.md')]);
    await h.registry.dismiss(id);
    await expect(stat(summary.taskPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('retries a failing Done Condition with feedback and reaches Needs Attention at the limit; Retry with a note grants one Attempt', async () => {
    h = await harness([unit('a', [FAIL])], [linear([{ name: 'a', unit: 'a' }])]);
    const id = await h.start();
    await h.waitForState(id, 'needs_attention');
    expect(
      h.events
        .filter((e) => e.type === 'slot.started')
        .map((e) => (e.type === 'slot.started' ? e.attempt : 0)),
    ).toEqual([1, 2]);
    const second = composeCalls(h.engine, 'a')[1]!;
    const input = coreCallInput(second.prompt) as {
      feedback: { kind: string; failedChecks: unknown[] };
    };
    expect(input.feedback.kind).toBe('attempt');
    expect(input.feedback.failedChecks).toHaveLength(1);
    const state = h.events.find(
      (e) => e.type === 'mission.state' && e.state === 'needs_attention',
    )!;
    expect(state).toMatchObject({ cause: 'attempt_limit', slot: 'a' });
    expect(state.type === 'mission.state' && state.failedChecks?.[0]?.holds).toBe(false);
    expect(h.registry.get(id)?.attention?.cause).toBe('attempt_limit');

    h.registry.retry(id, 'try harder');
    await h.waitFor((es) => es.filter((e) => e.type === 'slot.started').length === 3);
    const third = h.events.filter((e) => e.type === 'slot.started')[2]!;
    expect(third).toMatchObject({ attempt: 3, note: 'try harder' });
    const thirdCompose = composeCalls(h.engine, 'a')[2]!;
    expect(
      (coreCallInput(thirdCompose.prompt) as { feedback: { note: string } }).feedback.note,
    ).toBe('try harder');
    await h.waitFor(
      (es) =>
        es.filter((e) => e.type === 'mission.state' && e.state === 'needs_attention').length === 2,
    );
    expect(h.registry.get(id)?.summary.state).toBe('needs_attention');
    await h.registry.stop(id);
    expect(h.registry.get(id)?.summary.state).toBe('stopped');
  });

  it('loops back with Loop feedback, resumes the persistent implementer, and hits the Loop limit', async () => {
    h = await harness(
      [
        unit('impl', [PASS]),
        unit('rev', [{ kind: 'llm_judgment', criterion: 'No blocking findings.' }]),
      ],
      [
        linear([
          { name: 'impl', unit: 'impl', memoryMode: 'persistent' },
          { name: 'rev', unit: 'rev', loop: { target: 'impl', limit: 3 } },
        ]),
      ],
    );
    h.engine.script('core', 'core', (call) => {
      if (coreCallName(call.prompt) === 'judge') {
        return [{ result: { structured: { holds: false, reason: 'Blocking finding remains.' } } }];
      }
      return h!.engine.defaultCoreScript instanceof Function
        ? h!.engine.defaultCoreScript(call)
        : [];
    });
    const id = await h.start();
    await h.waitForState(id, 'needs_attention');
    const started = h.events.filter((e) => e.type === 'slot.started');
    expect(
      started.map((e) =>
        e.type === 'slot.started' ? [e.slot, e.attempt, e.loopIteration, e.loopFrom] : [],
      ),
    ).toEqual([
      ['impl', 1, undefined, undefined],
      ['rev', 1, undefined, undefined],
      ['impl', 1, 1, 'rev'],
      ['rev', 1, undefined, undefined],
      ['impl', 1, 2, 'rev'],
      ['rev', 1, undefined, undefined],
      ['impl', 1, 3, 'rev'],
      ['rev', 1, undefined, undefined],
    ]);
    const state = h.events.find(
      (e) => e.type === 'mission.state' && e.state === 'needs_attention',
    )!;
    expect(state).toMatchObject({ cause: 'loop_limit', slot: 'rev' });
    const implCalls = h.engine.callsFor('pilot', 'impl');
    expect(implCalls).toHaveLength(4);
    expect(new Set(implCalls.map((c) => c.sessionId)).size).toBe(1);
    expect(implCalls[1]?.spec.resumeSessionId).toBe(implCalls[0]?.sessionId);
    const loopCompose = composeCalls(h.engine, 'impl')[1]!;
    const feedback = (
      coreCallInput(loopCompose.prompt) as {
        feedback: { kind: string; fromSlot: string; output: string };
      }
    ).feedback;
    expect(feedback).toMatchObject({ kind: 'loop', fromSlot: 'rev', output: 'rev output' });
    expect(h.registry.get(id)!.slots.find((s) => s.name === 'rev')?.loops).toBe(3);
    await h.registry.stop(id);
  });

  it('leaves early through an Exit Point whose Exit Condition holds', async () => {
    h = await harness(
      [unit('a', [PASS]), unit('b', [PASS])],
      [
        linear([
          { name: 'a', unit: 'a', exitPoint: true, exitCondition: [PASS] },
          { name: 'b', unit: 'b' },
        ]),
      ],
    );
    const id = await h.start();
    await h.waitFor((es) => es.some((e) => e.type === 'mission.completed'));
    expect(h.events.filter((e) => e.type === 'slot.started').map((e) => e.slot)).toEqual(['a']);
    expect(h.registry.get(id)?.result?.exitSlot).toBe('a');
  });

  it('continues past an Exit Point whose Exit Condition fails and reports the last Exit Condition failing', async () => {
    h = await harness(
      [unit('a', [PASS]), unit('b', [PASS])],
      [
        linear([
          { name: 'a', unit: 'a', exitPoint: true, exitCondition: [FAIL] },
          { name: 'b', unit: 'b', exitCondition: [FAIL] },
        ]),
      ],
    );
    const id = await h.start();
    await h.waitForState(id, 'needs_attention');
    expect(h.events.filter((e) => e.type === 'slot.started').map((e) => e.slot)).toEqual([
      'a',
      'b',
    ]);
    const state = h.events.find(
      (e) => e.type === 'mission.state' && e.state === 'needs_attention',
    )!;
    expect(state).toMatchObject({ cause: 'last_exit_condition_failed', slot: 'b' });
    await h.registry.stop(id);
  });

  it('gives a Slot Output only to Slots that name it', async () => {
    h = await harness(
      [unit('a', [PASS]), unit('b', [PASS]), unit('c', [PASS])],
      [
        linear([
          { name: 'a', unit: 'a' },
          { name: 'b', unit: 'b', context: { slotOutputs: ['a'], gitConventions: true } },
          { name: 'c', unit: 'c' },
        ]),
      ],
    );
    await h.start();
    await h.waitFor((es) => es.some((e) => e.type === 'mission.completed'));
    const bundleOf = (slot: string) =>
      (
        coreCallInput(composeCalls(h!.engine, slot)[0]!.prompt) as {
          bundle: {
            slotOutputs: unknown[];
            taskDocuments: string[];
            gitConventions: string | null;
          };
        }
      ).bundle;
    expect(bundleOf('b').slotOutputs).toEqual([{ slotName: 'a', output: 'a output' }]);
    expect(bundleOf('c').slotOutputs).toEqual([]);
    // the folder's files are listed, not the folder itself
    expect(bundleOf('b').taskDocuments).toEqual([join(h.taskDir, 'SPEC.md')]);
    expect(bundleOf('b').gitConventions).toContain('Branch convention: feature/');
    expect(bundleOf('c').gitConventions).toBeNull();
  });

  it('waits at a Human Checkpoint and records the answers', async () => {
    h = await harness(
      [unit('a', [PASS], { mayAskCommander: true }), unit('b', [PASS])],
      [
        linear([
          { name: 'a', unit: 'a' },
          { name: 'b', unit: 'b' },
        ]),
      ],
    );
    h.engine.script('pilot', 'a', [
      { text: 'thinking' },
      {
        question: [
          {
            question: 'Which DB?',
            header: 'DB',
            options: [{ label: 'Postgres', description: '' }],
            multiSelect: false,
          },
        ],
      },
      { result: { output: 'a done' } },
    ]);
    const id = await h.start();
    await h.waitForState(id, 'waiting_for_owner');
    const asked = h.events.find((e) => e.type === 'question.asked')!;
    expect(asked).toMatchObject({ slot: 'a' });
    expect(h.registry.get(id)?.pendingQuestion?.slot).toBe('a');
    expect(h.engine.callsFor('pilot', 'a')[0]?.spec.allowQuestions).toBe(true);
    const questionId = asked.type === 'question.asked' ? asked.questionId : '';
    expect(() => h!.registry.answer(id, 'wrong', {})).toThrow(MissionStateError);
    h.registry.answer(id, questionId, { 'Which DB?': 'Postgres' });
    await h.waitFor((es) => es.some((e) => e.type === 'mission.completed'));
    expect(h.events.find((e) => e.type === 'question.answered')).toMatchObject({
      slot: 'a',
      questionId,
      answers: { 'Which DB?': 'Postgres' },
    });
    expect(h.engine.callsFor('pilot', 'a')[0]?.answers).toEqual([{ 'Which DB?': 'Postgres' }]);
    expect(h.registry.get(id)?.pendingQuestion).toBeUndefined();
  });

  it('respects the per-Mission mayAskCommander toggles', async () => {
    h = await harness(
      [unit('a', [PASS], { mayAskCommander: true })],
      [linear([{ name: 'a', unit: 'a' }])],
    );
    await h.start('feature', { toggles: { a: false } });
    await h.waitFor((es) => es.some((e) => e.type === 'mission.completed'));
    expect(h.engine.callsFor('pilot', 'a')[0]?.spec.allowQuestions).toBe(false);
  });

  it('stops while a Pilot is running, while waiting for the Commander, and in Needs Attention', async () => {
    h = await harness(
      [unit('a', [PASS], { mayAskCommander: true }), unit('b', [FAIL])],
      [
        linear(
          [
            { name: 'a', unit: 'a' },
            { name: 'b', unit: 'b' },
          ],
          'feature',
        ),
        linear([{ name: 'b', unit: 'b' }], 'failing'),
      ],
    );
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    h.engine.script('pilot', 'a', (call) =>
      call.index === 0
        ? [{ text: 'busy' }, { wait: gate }, { result: { output: 'never' } }]
        : [
            { question: [{ question: 'q', header: 'h', options: [], multiSelect: false }] },
            { result: { output: 'never' } },
          ],
    );
    // running
    const running = await h.start();
    await h.waitFor((es) => es.some((e) => e.missionId === running && e.type === 'agent.text'));
    await h.registry.stop(running);
    expect(h.registry.get(running)?.summary.state).toBe('stopped');
    expect(
      h.events
        .filter((e) => e.missionId === running)
        .map((e) => e.type)
        .at(-1),
    ).toBe('mission.stopped');
    expect(h.engine.callsFor('pilot', 'a')[0]?.interrupted).toBe(true);
    expect(h.registry.isCheckoutBusy(h.repo.clonePath)).toBeNull();
    release();
    // waiting for the Commander
    const waiting = await h.start();
    await h.waitForState(waiting, 'waiting_for_owner');
    await h.registry.stop(waiting);
    expect(h.registry.get(waiting)?.summary.state).toBe('stopped');
    expect(h.engine.callsFor('pilot', 'a')[1]?.dismissed).toBe(true);
    // needs attention
    const attention = await h.start('failing');
    await h.waitForState(attention, 'needs_attention');
    await h.registry.stop(attention);
    expect(h.registry.get(attention)?.summary.state).toBe('stopped');
    expect(() => h!.registry.retry(attention)).toThrow(MissionStateError);
    expect(h.registry.list()).toHaveLength(3);
  });

  it('refuses a busy Checkout and runs two Missions in two Checkouts concurrently', async () => {
    h = await harness([unit('a', [PASS])], [linear([{ name: 'a', unit: 'a' }])]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    h.engine.script('pilot', 'a', [{ wait: gate }, { result: { output: 'ok' } }]);
    const worktree = join(h.repo.root, 'wt');
    await h.repo.git(['worktree', 'add', '-q', '-b', 'feature/wt', worktree]);
    const first = await h.start();
    await expect(h.start()).rejects.toBeInstanceOf(CheckoutBusyError);
    const second = await h.start('feature', { checkoutPath: worktree });
    expect(h.registry.get(second)?.summary.branch).toBe('feature/wt');
    const checkouts = await h.registry.listCheckouts('my-app');
    expect(checkouts.map((c) => c.busyMissionId)).toEqual([first, second]);
    release();
    await h.waitFor((es) => es.filter((e) => e.type === 'mission.completed').length === 2);
    await expect(h.start('feature', { checkoutPath: '/nowhere' })).rejects.toBeInstanceOf(
      MissionStartError,
    );
    await expect(h.start('missing')).rejects.toMatchObject({ issues: [{ field: 'assembly' }] });
    await expect(h.start('feature', { workItemId: 'has space' })).rejects.toMatchObject({
      issues: [{ field: 'workItemId' }],
    });
  });

  it('runs host Checks: pr_exists, pr_no_open_comments and ci_green with a timeout', async () => {
    h = await harness(
      [
        unit('pub', [{ kind: 'pr_exists' }]),
        unit('rev', [{ kind: 'pr_no_open_comments' }, { kind: 'ci_green' }]),
      ],
      [
        linear([
          { name: 'pub', unit: 'pub' },
          { name: 'rev', unit: 'rev', attemptLimit: 1 },
        ]),
      ],
    );
    h.engine.script('pilot', 'pub', (call) =>
      call.index === 0
        ? [
            {
              shell:
                'git checkout -q -b feature/pr && echo x > x.txt && git add x.txt && git commit -q -m x',
            },
            { result: { output: 'pushed' } },
          ]
        : [{ result: { output: 'pushed again' } }],
    );
    const id = await h.start();
    // pub's Done Condition pr_exists fails until the host knows a PR: Attempt 2 after seeding
    await h.waitFor((es) =>
      es.some((e) => e.type === 'check.evaluated' && e.slot === 'pub' && !e.holds),
    );
    const pr = h.host.seedPullRequest('feature/pr', { ci: 'pending', unresolvedThreads: 1 });
    await h.waitFor((es) => es.some((e) => e.type === 'slot.done' && e.slot === 'pub'));
    expect(h.registry.get(id)?.summary.branch).toBe('feature/pr');
    await h.waitFor((es) =>
      es.some(
        (e) =>
          e.type === 'check.evaluated' &&
          e.slot === 'rev' &&
          e.check.kind === 'pr_no_open_comments' &&
          !e.holds,
      ),
    );
    await h.waitForState(id, 'needs_attention');
    expect(h.registry.get(id)?.attention?.cause).toBe('attempt_limit');
    h.host.setUnresolvedThreads(pr.number, 0);
    // Retry: comments resolved, CI pending forever → ci_timeout (timeout shortened through the registry)
    h.registry.retry(id);
    await h.waitFor(
      (es) =>
        es.filter((e) => e.type === 'mission.state' && e.state === 'needs_attention').length === 2,
    );
    expect(h.registry.get(id)?.attention?.cause).toBe('ci_timeout');
    h.host.setCiStatus(pr.number, 'success');
    h.registry.retry(id);
    await h.waitFor((es) => es.some((e) => e.type === 'mission.completed'));
    expect(h.registry.get(id)?.summary.pr).toEqual({ number: pr.number, url: pr.url });
    expect(h.registry.get(id)?.result?.pr).toEqual({ number: pr.number, url: pr.url });
  });

  it('goes to Needs Attention on an Engine error and on a malformed Core output', async () => {
    h = await harness([unit('a', [PASS])], [linear([{ name: 'a', unit: 'a' }])]);
    h.engine.script('pilot', 'a', (call) =>
      call.index === 0 ? [{ error: 'boom' }] : [{ result: { output: 'ok' } }],
    );
    const id = await h.start();
    await h.waitForState(id, 'needs_attention');
    expect(h.registry.get(id)?.attention).toMatchObject({ cause: 'engine_error', slot: 'a' });
    expect(h.registry.get(id)?.attention?.reason).toContain('boom');
    h.registry.retry(id);
    await h.waitFor((es) => es.some((e) => e.type === 'mission.completed'));

    const steps: FakeStep[] = [{ result: { structured: { nonsense: true } } }];
    h.engine.script('core', 'core', (call) =>
      coreCallName(call.prompt) === 'composeSlotPrompt'
        ? steps
        : (h!.engine.defaultCoreScript as (c: FakeCall) => FakeStep[])(call),
    );
    const second = await h.start();
    await h.waitForState(second, 'needs_attention');
    expect(h.registry.get(second)?.attention?.reason).toContain('malformed');
    await h.registry.stop(second);
  });

  it('keeps working on a pre-existing feature branch', async () => {
    h = await harness([unit('a', [PASS])], [linear([{ name: 'a', unit: 'a' }])]);
    await h.repo.git(['checkout', '-q', '-b', 'feature/existing']);
    h.engine.script('pilot', 'a', [
      { shell: 'echo y > y.txt && git add y.txt && git commit -q -m y' },
      { result: { output: 'ok' } },
    ]);
    const id = await h.start();
    expect(h.registry.get(id)?.summary.branch).toBe('feature/existing');
    await h.waitFor((es) => es.some((e) => e.type === 'mission.completed'));
    expect((await h.repo.git(['log', '--oneline'])).split('\n').filter(Boolean)).toHaveLength(2);
  });

  it('marks interrupted Missions from the ledger, keeps terminal Missions until Dismiss', async () => {
    h = await harness([unit('a', [PASS])], [linear([{ name: 'a', unit: 'a' }])]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    h.engine.script('pilot', 'a', [{ wait: gate }, { result: { output: 'ok' } }]);
    const running = await h.start();
    await h.waitFor((es) => es.some((e) => e.type === 'slot.started'));
    await expect(h.registry.dismiss(running)).rejects.toMatchObject({ reason: 'not_finished' });

    // "restart": a new registry on the same home sees the leftover ledger entry
    const restarted = new MissionRegistry({
      home: h.home,
      engine: h.engine,
      host: h.host,
      git: new RealGitClient(),
    });
    const recovered = await restarted.recoverInterrupted();
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      id: running,
      state: 'stopped',
      note: 'interrupted',
      currentSlot: null,
    });
    const detail = restarted.get(running)!;
    expect(detail.transcriptLost).toBe(true);
    expect(detail.assembly.name).toBe('feature');
    expect(detail.slots.map((s) => s.name)).toEqual(['a', 'core']);
    expect(restarted.isCheckoutBusy(h.repo.clonePath)).toBeNull();
    const dismissed: MissionEvent[] = [];
    restarted.events.onAny((e) => dismissed.push(e));
    await restarted.dismiss(running);
    expect(dismissed).toEqual([{ type: 'mission.dismissed', missionId: running, seq: 1 }]);
    expect(restarted.list()).toEqual([]);
    expect(await restarted.recoverInterrupted()).toEqual([]);

    release();
    await h.waitFor((es) => es.some((e) => e.type === 'mission.completed'));
    expect(h.registry.list().map((m) => m.state)).toEqual(['completed']);
    await h.registry.dismiss(running);
    expect(h.registry.list()).toEqual([]);
    expect(h.events.at(-1)).toMatchObject({ type: 'mission.dismissed', missionId: running });
  });
});
