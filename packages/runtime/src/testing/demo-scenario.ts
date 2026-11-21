import type { AssemblyFile, ProfileFile, UnitFile } from '../config/schemas.js';
import type { Cost } from '../domain/cost.js';
import type { Question } from '../domain/transcript.js';
import {
  coreCallInput,
  coreCallName,
  defaultCoreScript,
  type FakeCall,
  type FakeEngine,
  type FakeStep,
} from './fake-engine.js';
import { writeHome } from './primary-scenario.js';

/**
 * The demo voyage: a Mission that passes through every state a picture of a Mission draws, run by
 * the FakeEngine. A Human Checkpoint on `scout`, a Sub-pilot on `planner`, a Side Slot after
 * `builder`, a Loop from `reviewer`, Needs Attention on `tester` (the Commander retries), an Exit
 * Point on `release` whose Exit Condition fails, two Slots of one Unit, and the end at `closer`.
 */

export const DEMO_PROJECT = 'demo';
export const DEMO_ASSEMBLY = 'demo-voyage';

/** A Slot Output that carries this does not satisfy its judged Done Condition. */
const NOT_YET = '(not finished yet)';
const REVIEW_CRITERION = 'No blocking findings remain in the review.';
const TEST_CRITERION = 'Every test of the voyage passes.';
const RELEASE_CRITERION = 'The release is cleared for launch.';

export const DEMO_QUESTION: Question = {
  question: 'Which route should the voyage take?',
  header: 'Route',
  options: [
    { label: 'Through the nebula', description: 'Slower, more to see' },
    { label: 'The straight line', description: 'Faster, less to see' },
  ],
  multiSelect: false,
};

/** The Units of the voyage: plain, without Checks of their own except where a Slot judges. */
export function demoUnits(): UnitFile[] {
  const unit = (name: string, instructions: string, overrides: Partial<UnitFile> = {}) => ({
    name,
    model: 'sonnet',
    mayAskCommander: false,
    doneCondition: [],
    rules: 'Never leave the Mission folder.',
    instructions,
    ...overrides,
  });
  return [
    unit('scout', 'Survey the Task and ask the Commander which way to go.', {
      mayAskCommander: true,
    }),
    unit('planner', 'Plan the voyage; ask the researcher for charts.'),
    unit('researcher', 'Find charts for the planner.'),
    unit('builder', 'Build what the plan asks for.'),
    unit('writer', 'Write the log of the voyage.'),
    unit('reviewer', 'Review the work and name blocking findings.', {
      doneCondition: [{ kind: 'llm_judgment', criterion: REVIEW_CRITERION }],
    }),
    unit('tester', 'Test the work.', {
      doneCondition: [{ kind: 'llm_judgment', criterion: TEST_CRITERION }],
    }),
    unit('publisher', 'Prepare the release.'),
    unit('closer', 'Close the voyage and sum it up.'),
  ];
}

/** A Project without a folder: every Mission works in its own Mission folder, no git needed. */
export function demoProfile(): ProfileFile {
  return {
    name: DEMO_PROJECT,
    workspace: { kind: 'none' },
    knowledgeSources: [],
    outerFolders: [],
    engine: 'claude-code',
  };
}

/** The eight Slots of the voyage. */
export function demoAssembly(): AssemblyFile {
  return {
    name: DEMO_ASSEMBLY,
    core: {
      model: 'opus',
      defaultAttemptLimit: 2,
      defaultLoopLimit: 3,
      resolutionLimit: 3,
      instructions: '',
    },
    slots: [
      { name: 'scout', unit: 'scout', mayAskCommander: true },
      { name: 'planner', unit: 'planner', subPilots: [{ unit: 'researcher', required: true }] },
      { name: 'builder', unit: 'builder', sideSlots: [{ name: 'docs', unit: 'writer' }] },
      { name: 'reviewer', unit: 'reviewer', loop: { target: 'builder', limit: 3 } },
      { name: 'tester', unit: 'tester', attemptLimit: 1 },
      {
        name: 'release',
        unit: 'publisher',
        exitPoint: true,
        exitCondition: [{ kind: 'llm_judgment', criterion: RELEASE_CRITERION }],
      },
      { name: 'audit', unit: 'reviewer' },
      { name: 'closer', unit: 'closer' },
    ],
  };
}

/** Writes the demo Units, Project and Assembly into `home`. */
export async function writeDemoHome(home: string): Promise<void> {
  await writeHome(home, {
    units: demoUnits(),
    projects: [{ profile: demoProfile(), assemblies: [demoAssembly()] }],
  });
}

export interface DemoPace {
  /** 1 plays the voyage at watching speed (a few minutes); 0 plays it without a single pause. */
  pace: number;
}

/** A pause of `seconds` at the given pace; none at pace 0. */
function pause(pace: number, seconds: number): { delay: number }[] {
  const delay = Math.round(seconds * 1000 * pace);
  return delay > 0 ? [{ delay }] : [];
}

/** What a Pilot does for about `seconds`: signs of life, a look at the Task, two lines of text. */
function work(pace: number, seconds: number, opening: string, closing: string): FakeStep[] {
  return [
    { activity: { phase: 'thinking' } },
    ...pause(pace, seconds * 0.3),
    { text: opening },
    { activity: { phase: 'tool', detail: 'Read' } },
    {
      toolCall: { name: 'Read', input: { file_path: 'TASK.md' } },
      result: { output: '# The voyage' },
    },
    ...pause(pace, seconds * 0.3),
    { activity: { phase: 'writing' } },
    ...pause(pace, seconds * 0.4),
    { text: closing },
  ];
}

/** The end of a Pilot's turn with `output` and a cost of `usd`. */
function finish(output: string, usd: number): FakeStep {
  const cost: Partial<Cost> = { usd, inputTokens: Math.round(usd * 40_000), outputTokens: 800 };
  return { result: { output, cost } };
}

/**
 * How many times each Slot has run in each Mission. Keyed by the Pilot's working directory, which
 * on a Project without a folder is the Mission folder: two demo Missions do not share a count.
 */
function runCounter(): (call: FakeCall) => number {
  const runs = new Map<string, number>();
  return (call) => {
    const key = `${call.spec.label}@${call.spec.cwd}`;
    const run = (runs.get(key) ?? 0) + 1;
    runs.set(key, run);
    return run;
  };
}

/** The Core: it thinks a moment before each call, judges as the voyage wants, the rest as usual. */
function demoCore(pace: number): (call: FakeCall) => FakeStep[] {
  return (call) => {
    const thinking: FakeStep[] = [
      { activity: { phase: 'thinking' } },
      ...pause(pace, 2),
      { activity: { phase: 'tool', detail: 'Read' } },
      ...pause(pace, 1),
    ];
    if (coreCallName(call.prompt) !== 'judge') return [...thinking, ...defaultCoreScript(call)];
    const input = coreCallInput(call.prompt) as { criterion?: string; slotOutput?: string } | null;
    const holds =
      input?.criterion !== RELEASE_CRITERION && !(input?.slotOutput ?? '').includes(NOT_YET);
    const reason = holds ? 'It holds.' : 'Not yet: the work is not finished.';
    return [...thinking, { result: { structured: { holds, reason } } }];
  };
}

/** Teaches `engine` the voyage at the given pace. */
export function installDemoScripts(engine: FakeEngine, { pace }: DemoPace): void {
  const runs = runCounter();
  engine.script('core', 'core', demoCore(pace));
  engine.script('pilot', 'scout', [
    ...work(pace, 8, 'Surveying the Task.', 'Two routes are possible.'),
    { question: [DEMO_QUESTION] },
    { text: 'Thank you, the route is set.' },
    ...pause(pace, 4),
    finish('Route chosen by the Commander.', 0.03),
  ]);
  engine.script('pilot', 'planner', [
    ...work(pace, 6, 'Drafting the plan.', 'I need charts.'),
    {
      subAgent: {
        name: 'researcher',
        steps: [
          { text: 'Looking for charts.' },
          ...pause(pace, 8),
          { text: 'Three charts found.' },
        ],
        returns: 'Three charts of the route.',
      },
    },
    ...work(pace, 6, 'Charts in hand.', 'The plan is ready.'),
    finish('The plan of the voyage.', 0.05),
  ]);
  engine.script('pilot', 'builder', (call) => [
    ...work(pace, 18, 'Building.', `Round ${runs(call)} of building is done.`),
    finish('The build of the voyage.', 0.08),
  ]);
  engine.script('pilot', 'docs', [
    ...work(pace, 40, 'Writing the log of the voyage.', 'The log is written.'),
    finish('The log of the voyage.', 0.02),
  ]);
  engine.script('pilot', 'reviewer', (call) => {
    const first = runs(call) === 1;
    return [
      ...work(pace, 14, 'Reviewing the build.', first ? 'One blocking finding.' : 'All clear.'),
      finish(first ? `One blocking finding ${NOT_YET}.` : 'No blocking findings.', 0.04),
    ];
  });
  engine.script('pilot', 'tester', (call) => {
    const first = runs(call) === 1;
    return [
      ...work(pace, 14, 'Running the tests.', first ? 'Two tests fail.' : 'Every test passes.'),
      finish(first ? `Two tests fail ${NOT_YET}.` : 'Every test passes.', 0.04),
    ];
  });
  engine.script('pilot', 'release', [
    ...work(pace, 10, 'Preparing the release.', 'The release waits for clearance.'),
    finish('The release is prepared, not cleared.', 0.03),
  ]);
  engine.script('pilot', 'audit', [
    ...work(pace, 12, 'Auditing the voyage.', 'Nothing to add.'),
    finish('The audit found nothing.', 0.04),
  ]);
  engine.script('pilot', 'closer', [
    ...work(pace, 10, 'Closing the voyage.', 'Done.'),
    finish('The voyage is closed.', 0.02),
  ]);
}
