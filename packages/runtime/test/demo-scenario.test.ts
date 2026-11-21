import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MissionRegistry, RealGitClient, type MissionEvent } from '../src/index.js';
import {
  DEMO_ASSEMBLY,
  DEMO_PROJECT,
  DEMO_QUESTION,
  FakeEngine,
  FakeHost,
  installDemoScripts,
  writeDemoHome,
} from '../src/testing/index.js';

describe('the demo voyage', () => {
  let home: string | undefined;
  let registry: MissionRegistry | undefined;

  afterEach(async () => {
    await registry?.flush();
    if (home) await rm(home, { recursive: true, force: true });
    home = undefined;
    registry = undefined;
  });

  it('passes through every state the picture draws: a question, a Sub-pilot, a Side Slot, a Loop, Needs Attention and its Retry, a passed Exit Point, the end', async () => {
    home = await mkdtemp(join(tmpdir(), 'suptron-demo-'));
    await writeDemoHome(home);
    const engine = new FakeEngine();
    installDemoScripts(engine, { pace: 0 });
    registry = new MissionRegistry({
      home,
      engine,
      host: new FakeHost(),
      git: new RealGitClient(),
    });
    const events: MissionEvent[] = [];
    registry.events.onAny((event) => events.push(event));
    const waitFor = async (predicate: (event: MissionEvent) => boolean) => {
      const started = Date.now();
      while (!events.some(predicate)) {
        if (Date.now() - started > 10_000) {
          throw new Error(`Timed out. Events: ${events.map((e) => e.type).join(', ')}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    };

    const { id } = await registry.start({
      project: DEMO_PROJECT,
      assembly: DEMO_ASSEMBLY,
      task: { kind: 'text', text: 'Take the voyage.' },
    });
    await waitFor((e) => e.type === 'question.asked');
    const asked = events.find((e) => e.type === 'question.asked');
    if (asked?.type !== 'question.asked') throw new Error('no question');
    registry.answer(id, asked.questionId, { [DEMO_QUESTION.question]: 'Through the nebula' });

    await waitFor((e) => e.type === 'mission.state' && e.state === 'needs_attention');
    expect(
      events.find((e) => e.type === 'mission.state' && e.state === 'needs_attention'),
    ).toMatchObject({
      slot: 'tester',
      cause: 'attempt_limit',
    });
    registry.retry(id, 'Fix the two tests.');

    await waitFor((e) => e.type === 'mission.completed');
    const mission = events.filter((e) => e.missionId === id);
    const started = mission.flatMap((e) => (e.type === 'slot.started' ? [e.slot] : []));
    expect(started).toEqual([
      'scout',
      'planner',
      'builder',
      'reviewer',
      'builder',
      'reviewer',
      'tester',
      'tester',
      'release',
      'audit',
      'closer',
    ]);
    expect(mission.some((e) => e.type === 'slot.started' && e.loopFrom === 'reviewer')).toBe(true);
    expect(mission.some((e) => e.type === 'agent.sub_pilot_returned' && e.slot === 'planner')).toBe(
      true,
    );
    expect(
      mission.some((e) => e.type === 'side_slot.ended' && e.slot === 'docs' && e.status === 'done'),
    ).toBe(true);
    expect(mission.some((e) => e.type === 'agent.activity' && e.slot === 'core')).toBe(true);
    expect(mission.at(-1)).toMatchObject({ type: 'mission.completed', exitSlot: 'closer' });
  });
});
