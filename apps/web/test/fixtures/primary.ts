import type { AssemblyFile, ProfileFile, UnitFile } from '@suptron/runtime/browser';

/** The primary scenario as objects (browser-safe copy of the runtime's builders). */
export function primaryUnits(): UnitFile[] {
  return [
    {
      name: 'analyst',
      model: 'sonnet',
      mayAskCommander: true,
      doneCondition: [],
      rules: 'Never modify the existing Task documents.',
      instructions: 'Read the Task documents and ask the Commander about open questions.',
    },
    {
      name: 'implementer',
      model: 'sonnet',
      mayAskCommander: false,
      doneCondition: [{ kind: 'command', command: 'pnpm test' }],
      rules: 'Never push to the protected branch.',
      instructions: 'Implement the Task according to the PLAN.',
    },
    {
      name: 'reviewer',
      model: 'opus',
      mayAskCommander: false,
      doneCondition: [
        { kind: 'llm_judgment', criterion: 'No blocking findings remain in the review.' },
      ],
      rules: 'Never edit source files.',
      instructions: 'Review the diff against the protected branch.',
    },
    {
      name: 'tester',
      model: 'sonnet',
      mayAskCommander: false,
      doneCondition: [{ kind: 'command', command: 'pnpm test' }],
      rules: 'Never weaken tests.',
      instructions: 'Run and extend the tests.',
    },
    {
      name: 'publisher',
      model: 'sonnet',
      mayAskCommander: false,
      doneCondition: [{ kind: 'pr_exists' }],
      rules: 'Never mark the Pull Request ready.',
      instructions: 'Push the branch and open a draft Pull Request.',
    },
    {
      name: 'pr-reviewer',
      model: 'opus',
      mayAskCommander: false,
      doneCondition: [{ kind: 'pr_no_open_comments' }, { kind: 'ci_green' }],
      rules: 'Never edit source files.',
      instructions: 'Review the Pull Request and comment.',
    },
  ];
}

export function primaryProfile(repositoryPath = '/repos/my-app', name = 'my-app'): ProfileFile {
  return {
    name,
    repository: { path: repositoryPath, remote: 'origin', protectedBranch: 'main' },
    knowledgeSources: ['README.md'],
    git: {
      branchNameTemplate: 'feature/{work_item_id}-{task_slug}',
      pullRequestTemplate: '## {task_title}\n\n### Summary\n\n### Testing\n',
      labels: [],
      reviewers: [],
    },
    host: 'github',
    engine: 'claude-code',
    ciWaitTimeoutMinutes: 30,
  };
}

export function primaryAssembly(name = 'feature'): AssemblyFile {
  return {
    name,
    core: {
      model: 'opus',
      defaultAttemptLimit: 2,
      defaultLoopLimit: 3,
      instructions: 'Compose each Slot prompt carefully.',
    },
    slots: [
      { name: 'analyst', unit: 'analyst', mayAskCommander: true },
      {
        name: 'implementer',
        unit: 'implementer',
        memoryMode: 'persistent',
        context: { slotOutputs: ['analyst'] },
      },
      { name: 'reviewer', unit: 'reviewer', loop: { target: 'implementer', limit: 3 } },
      { name: 'tester', unit: 'tester', loop: { target: 'implementer', limit: 3 } },
      { name: 'publisher', unit: 'publisher' },
      {
        name: 'pr-reviewer',
        unit: 'pr-reviewer',
        loop: { target: 'implementer', limit: 3 },
        exitPoint: true,
      },
    ],
  };
}

/** An Assembly with a Loop to a later Slot: invalid on load (editors SPEC FR-39). */
export function invalidAssembly(name = 'broken'): AssemblyFile {
  return {
    name,
    core: { model: 'opus', defaultAttemptLimit: 2, defaultLoopLimit: 3, instructions: '' },
    slots: [
      { name: 'analyst', unit: 'analyst', loop: { target: 'tester', limit: 3 } },
      { name: 'tester', unit: 'tester', exitPoint: true },
    ],
  };
}
