import type { AssemblyFile, ProfileFile, UnitFile } from '../config/schemas.js';

/** A Project that works in a fixed folder without git (SPEC success criterion 2). */
export function folderProfile(path: string, name = 'notes'): ProfileFile {
  return {
    name,
    workspace: { kind: 'folder', path },
    knowledgeSources: [],
    engine: 'claude-code',
  };
}

/** A Project with no folder of its own: Missions work in their Mission folder (criterion 1). */
export function noneProfile(name = 'research'): ProfileFile {
  return {
    name,
    workspace: { kind: 'none' },
    knowledgeSources: [
      {
        title: 'House style',
        text: 'Cite every claim with a dated source. Prefer primary sources over summaries.',
      },
    ],
    engine: 'claude-code',
  };
}

/** The two Units of the `research` example: nothing in them needs a folder or git. */
export function briefUnits(): UnitFile[] {
  return [
    {
      name: 'researcher',
      model: 'sonnet',
      mayAskCommander: false,
      doneCondition: [
        {
          kind: 'llm_judgment',
          criterion: 'RESEARCH.md next to the Task lists at least three dated sources.',
        },
      ],
      rules: ['Never modify the existing Task documents; write only new files next to them.'].join(
        '\n',
      ),
      instructions: [
        'Read the Task and the Knowledge Sources. Research the question with the tools you have',
        'and write RESEARCH.md next to the Task: one entry per source with its date, where it comes',
        'from and what it says. Summarize the findings as your output.',
      ].join('\n'),
    },
    {
      name: 'brief-writer',
      model: 'sonnet',
      mayAskCommander: false,
      doneCondition: [
        {
          kind: 'llm_judgment',
          criterion: 'BRIEF.md answers the Task using only the sources of RESEARCH.md.',
        },
      ],
      rules: [
        'Never modify the existing Task documents; write only new files next to them.',
        'Never cite a source that is not in RESEARCH.md.',
      ].join('\n'),
      instructions: [
        'Read the Task and RESEARCH.md next to it. Write BRIEF.md next to the Task: a short answer',
        'to the Task with every claim backed by a source from RESEARCH.md. When a Loop sends you',
        'back to the researcher, say precisely which sources are missing.',
      ].join('\n'),
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
      resolutionLimit: 3,
      instructions: [
        'Compose each Slot prompt from the Task documents, the Knowledge Sources and the Slot',
        'Outputs it is given. Judge Checks strictly against their criterion. Report at the end',
        'what was written and where it is.',
      ].join('\n'),
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
