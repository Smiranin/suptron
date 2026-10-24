import type {
  MissionDetail,
  MissionSummary,
  SlotRecord,
  TranscriptSection,
} from '@suptron/runtime/browser';
import { primaryAssembly } from '../primary';

const ZERO = { usd: 0, inputTokens: 0, outputTokens: 0 };
const SLOT_NAMES = ['analyst', 'implementer', 'reviewer', 'tester', 'publisher', 'pr-reviewer'];

function records(overrides: Record<string, Partial<SlotRecord>> = {}): SlotRecord[] {
  return [...SLOT_NAMES, 'core'].map((name) => ({
    name,
    attempts: 0,
    loops: 0,
    cost: ZERO,
    checkResults: [],
    ...overrides[name],
  }));
}

function summary(id: string, overrides: Partial<MissionSummary> = {}): MissionSummary {
  return {
    id,
    projectName: 'my-app',
    assemblyName: 'feature',
    taskPath: '/tasks/my-task',
    taskTitle: 'my-task',
    state: 'running',
    currentSlot: 'implementer',
    branch: 'feature/my-task',
    checkoutPath: '/repos/my-app',
    startedAt: '2026-10-23T10:00:00.000Z',
    cost: { usd: 0.42, inputTokens: 12000, outputTokens: 3000, estimated: true },
    ...overrides,
  };
}

const at = '2026-10-23T10:01:00.000Z';

function analystSection(id: string): TranscriptSection {
  return {
    execution: { slot: 'analyst', attempt: 1 },
    entries: [
      { id: `${id}:2`, at, kind: 'text', text: 'Reading the **SPEC**.' },
      {
        id: `${id}:3`,
        at,
        kind: 'tool_call',
        toolCallId: 't1',
        name: 'Read',
        input: { file_path: '/tasks/my-task/SPEC.md' },
        result: { output: '# My task', isError: false },
      },
    ],
    dropped: 0,
  };
}

/** Running on `implementer` after one Loop from `reviewer`. */
export function runningDetail(id = 'm-running'): MissionDetail {
  return {
    summary: summary(id, { startedAt: '2026-10-23T10:00:00.000Z' }),
    assembly: primaryAssembly(),
    slots: records({
      analyst: {
        attempts: 1,
        lastOutput: 'Decisions: Postgres.',
        cost: { usd: 0.05, inputTokens: 1000, outputTokens: 200 },
      },
      implementer: { attempts: 2, cost: { usd: 0.3, inputTokens: 9000, outputTokens: 2500 } },
      reviewer: {
        attempts: 1,
        loops: 1,
        cost: { usd: 0.07, inputTokens: 2000, outputTokens: 300 },
      },
    }),
    transcript: [
      analystSection(id),
      {
        execution: { slot: 'implementer', attempt: 1 },
        entries: [
          { id: `${id}:5`, at, kind: 'text', text: 'Implementing the login form.' },
          {
            id: `${id}:6`,
            at,
            kind: 'check',
            check: { kind: 'command', command: 'pnpm test' },
            holds: true,
            detail: 'Exit code 0',
          },
        ],
        dropped: 0,
      },
      {
        execution: { slot: 'reviewer', attempt: 1 },
        entries: [
          { id: `${id}:8`, at, kind: 'text', text: 'One blocking finding: missing validation.' },
          {
            id: `${id}:9`,
            at,
            kind: 'check',
            check: {
              kind: 'llm_judgment',
              criterion: 'No blocking findings remain in the review.',
            },
            holds: false,
            detail: 'A blocking finding remains.',
          },
        ],
        dropped: 0,
      },
      {
        execution: { slot: 'implementer', attempt: 1, loopIteration: 1, loopFrom: 'reviewer' },
        entries: [{ id: `${id}:11`, at, kind: 'text', text: 'Addressing the review feedback.' }],
        dropped: 0,
      },
    ],
    transcriptLost: false,
    seq: 11,
  };
}

/** Waiting on `analyst` with a pending two-option question. */
export function waitingDetail(id = 'm-waiting'): MissionDetail {
  const questions = [
    {
      question: 'Which database?',
      header: 'Database',
      options: [
        { label: 'Postgres', description: 'The relational default' },
        { label: 'SQLite', description: 'Embedded' },
      ],
      multiSelect: false,
    },
  ];
  return {
    summary: summary(id, {
      state: 'waiting_for_owner',
      currentSlot: 'analyst',
      branch: 'main',
      startedAt: '2026-10-23T11:00:00.000Z',
      workItemId: 'ABC-7',
    }),
    assembly: primaryAssembly(),
    slots: records({ analyst: { attempts: 1 } }),
    transcript: [
      {
        execution: { slot: 'analyst', attempt: 1 },
        entries: [
          { id: `${id}:2`, at, kind: 'text', text: 'I have a question before I continue.' },
          { id: `${id}:3`, at, kind: 'question', questionId: 'q-1', questions },
        ],
        dropped: 0,
      },
    ],
    transcriptLost: false,
    pendingQuestion: { id: 'q-1', slot: 'analyst', questions },
    seq: 4,
  };
}

/** Needs Attention on `reviewer`: Loop limit reached, two failed Checks. */
export function attentionDetail(id = 'm-attention'): MissionDetail {
  return {
    summary: summary(id, {
      state: 'needs_attention',
      currentSlot: 'reviewer',
      startedAt: '2026-10-23T09:00:00.000Z',
    }),
    assembly: primaryAssembly(),
    slots: records({
      analyst: { attempts: 1, lastOutput: 'ok' },
      implementer: { attempts: 4, lastOutput: 'implemented' },
      reviewer: { attempts: 2, loops: 3 },
    }),
    transcript: [
      analystSection(id),
      { execution: { slot: 'implementer', attempt: 1 }, entries: [], dropped: 0 },
      {
        execution: { slot: 'reviewer', attempt: 1 },
        entries: [{ id: `${id}:6`, at, kind: 'text', text: 'Still blocking.' }],
        dropped: 0,
      },
      {
        execution: { slot: 'reviewer', attempt: 2 },
        entries: [
          {
            id: `${id}:8`,
            at,
            kind: 'check',
            check: {
              kind: 'llm_judgment',
              criterion: 'No blocking findings remain in the review.',
            },
            holds: false,
            detail: 'Still a blocking finding.',
          },
        ],
        dropped: 0,
      },
    ],
    transcriptLost: false,
    attention: {
      cause: 'loop_limit',
      reason:
        'The reviewer keeps finding the same blocking issue; the implementer may need guidance.',
      slot: 'reviewer',
      failedChecks: [
        {
          check: { kind: 'llm_judgment', criterion: 'No blocking findings remain in the review.' },
          holds: false,
          detail: 'Still a blocking finding.',
        },
        { check: { kind: 'command', command: 'pnpm lint' }, holds: false, detail: 'Exit code 1' },
      ],
    },
    seq: 9,
  };
}

export function completedDetail(id = 'm-completed'): MissionDetail {
  return {
    summary: summary(id, {
      state: 'completed',
      currentSlot: null,
      startedAt: '2026-10-23T08:00:00.000Z',
      pr: { number: 42, url: 'https://github.com/me/my-app/pull/42' },
    }),
    assembly: primaryAssembly(),
    slots: records({
      analyst: { attempts: 1, lastOutput: 'ok' },
      implementer: { attempts: 2, lastOutput: 'ok' },
      reviewer: { attempts: 2, loops: 1, lastOutput: 'ok' },
      tester: { attempts: 1, lastOutput: 'ok' },
      publisher: { attempts: 1, lastOutput: 'ok' },
      'pr-reviewer': { attempts: 1, lastOutput: 'ok' },
      core: { cost: { usd: 0.11, inputTokens: 5000, outputTokens: 800 } },
    }),
    transcript: [
      analystSection(id),
      { execution: { slot: 'pr-reviewer', attempt: 1 }, entries: [], dropped: 0 },
    ],
    transcriptLost: false,
    result: {
      report: '# Mission report\n\nThe login form was built and **verified**.',
      pr: { number: 42, url: 'https://github.com/me/my-app/pull/42' },
      exitSlot: 'pr-reviewer',
    },
    seq: 30,
  };
}

export function stoppedDetail(id = 'm-stopped'): MissionDetail {
  return {
    summary: summary(id, {
      state: 'stopped',
      currentSlot: null,
      startedAt: '2026-10-23T07:00:00.000Z',
    }),
    assembly: primaryAssembly(),
    slots: records({ analyst: { attempts: 1, lastOutput: 'ok' }, implementer: { attempts: 1 } }),
    transcript: [
      analystSection(id),
      {
        execution: { slot: 'implementer', attempt: 1 },
        entries: [{ id: `${id}:5`, at, kind: 'text', text: 'Stopped midway.' }],
        dropped: 0,
      },
    ],
    transcriptLost: false,
    seq: 6,
  };
}

export function interruptedDetail(id = 'm-interrupted'): MissionDetail {
  return {
    summary: summary(id, {
      state: 'stopped',
      note: 'interrupted',
      currentSlot: null,
      startedAt: '2026-10-23T06:00:00.000Z',
    }),
    assembly: primaryAssembly(),
    slots: records({ analyst: { attempts: 1, lastOutput: 'ok' }, implementer: { attempts: 1 } }),
    transcript: [],
    transcriptLost: true,
    seq: 0,
  };
}

export const MISSION_FIXTURES = {
  running: runningDetail,
  waiting: waitingDetail,
  attention: attentionDetail,
  completed: completedDetail,
  stopped: stoppedDetail,
  interrupted: interruptedDetail,
} as const;
