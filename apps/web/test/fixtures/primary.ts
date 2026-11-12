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
    workspace: {
      kind: 'repository',
      path: repositoryPath,
      remote: 'origin',
      protectedBranch: 'main',
      host: 'github',
      git: {
        branchNameTemplate: 'feature/{work_item_id}-{task_slug}',
        pullRequestTemplate: '## {task_title}\n\n### Summary\n\n### Testing\n',
        labels: [],
        reviewers: [],
      },
      ciWaitTimeoutMinutes: 30,
    },
    knowledgeSources: [{ path: 'README.md' }],
    engine: 'claude-code',
  };
}

/** A folder Project (kind `folder`): notes in `/notes`, no git. */
export function notesProfile(path = '/notes', name = 'notes'): ProfileFile {
  return { name, workspace: { kind: 'folder', path }, knowledgeSources: [], engine: 'claude-code' };
}

/** A Project without a folder (kind `none`), with a text Knowledge Source. */
export function researchProfile(name = 'research'): ProfileFile {
  return {
    name,
    workspace: { kind: 'none' },
    knowledgeSources: [{ title: 'House style', text: 'Cite every claim with a dated source.' }],
    engine: 'claude-code',
  };
}

/** The two Units of the research scenario; nothing in them needs a folder or git. */
export function briefUnits(): UnitFile[] {
  return [
    {
      name: 'researcher',
      model: 'sonnet',
      mayAskCommander: false,
      doneCondition: [
        { kind: 'llm_judgment', criterion: 'RESEARCH.md lists at least three dated sources.' },
      ],
      rules: 'Never modify the existing Task documents.',
      instructions: 'Research the question and write RESEARCH.md next to the Task.',
    },
    {
      name: 'brief-writer',
      model: 'sonnet',
      mayAskCommander: false,
      doneCondition: [
        { kind: 'llm_judgment', criterion: 'BRIEF.md answers the Task using only RESEARCH.md.' },
      ],
      rules: 'Never cite a source that is not in RESEARCH.md.',
      instructions: 'Write BRIEF.md next to the Task.',
    },
  ];
}

/** researcher → brief-writer ⟲ researcher (limit 2) */
export function briefAssembly(name = 'brief'): AssemblyFile {
  return {
    name,
    core: {
      model: 'opus',
      defaultAttemptLimit: 2,
      defaultLoopLimit: 3,
      resolutionLimit: 2,
      instructions: '',
    },
    slots: [
      { name: 'researcher', unit: 'researcher' },
      {
        name: 'brief-writer',
        unit: 'brief-writer',
        context: { slotOutputs: ['researcher'] },
        loop: { target: 'researcher', limit: 2 },
        exitPoint: true,
      },
    ],
  };
}

export function primaryAssembly(name = 'feature'): AssemblyFile {
  return {
    name,
    core: {
      model: 'opus',
      defaultAttemptLimit: 2,
      defaultLoopLimit: 3,
      resolutionLimit: 2,
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
    core: {
      model: 'opus',
      defaultAttemptLimit: 2,
      defaultLoopLimit: 3,
      resolutionLimit: 2,
      instructions: '',
    },
    slots: [
      { name: 'analyst', unit: 'analyst', loop: { target: 'tester', limit: 3 } },
      { name: 'tester', unit: 'tester', exitPoint: true },
    ],
  };
}
