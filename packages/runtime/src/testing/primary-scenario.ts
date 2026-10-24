import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assemblyRelPath, profileRelPath, unitRelPath } from '../config/paths.js';
import type { AssemblyFile, ProfileFile, UnitFile } from '../config/schemas.js';
import { serializeAssembly, serializeProfile, serializeUnit } from '../config/serialize.js';

/** The six Units of the primary software scenario (SPEC: SPEC + PLAN → draft Pull Request). */
export function primaryUnits(): UnitFile[] {
  return [
    {
      name: 'analyst',
      model: 'sonnet',
      mayAskCommander: true,
      doneCondition: [],
      rules: [
        'Never modify the existing Task documents; write only new files next to them.',
        'Never change any file inside the Checkout.',
      ].join('\n'),
      instructions: [
        'Read the Task documents and the Knowledge Sources. Identify open questions that block the',
        'implementation and ask the Commander about them. Record every question and answer in a new',
        'file named ANALYSIS.md next to the Task documents, then summarize the agreed decisions as',
        'your output.',
      ].join('\n'),
    },
    {
      name: 'implementer',
      model: 'sonnet',
      mayAskCommander: false,
      doneCondition: [{ kind: 'command', command: 'pnpm test' }],
      rules: [
        'Never push to or commit on the protected branch.',
        'Never force-push and never delete or rename a branch.',
        'Follow the conventions of the Knowledge Sources.',
      ].join('\n'),
      instructions: [
        'If the Checkout is on the protected branch, first create the branch named in the Git',
        'conventions from the fresh protected branch, before changing anything. Implement the Task',
        'according to the PLAN and the analysis. Commit as you go with clear messages. When you',
        'receive Loop feedback or failed Checks, address every finding. Finish with a summary of',
        'what changed and why.',
      ].join('\n'),
    },
    {
      name: 'reviewer',
      model: 'opus',
      mayAskCommander: false,
      doneCondition: [
        { kind: 'llm_judgment', criterion: 'No blocking findings remain in the review.' },
      ],
      rules: [
        'Never edit source files; you only review.',
        'Never run git commands that change history.',
      ].join('\n'),
      instructions: [
        'Review the diff of the current branch against the protected branch for correctness, missing',
        'tests and deviations from the PLAN. List every blocking finding with file and line. State',
        'explicitly whether any blocking finding remains.',
      ].join('\n'),
    },
    {
      name: 'tester',
      model: 'sonnet',
      mayAskCommander: false,
      doneCondition: [{ kind: 'command', command: 'pnpm test' }],
      rules: ['Never weaken or delete existing tests to make them pass.'].join('\n'),
      instructions: [
        'Run the test suite and the type checker. Add tests for behaviour the PLAN requires that',
        'has none. Commit the tests. Report what you ran and what you added.',
      ].join('\n'),
    },
    {
      name: 'publisher',
      model: 'sonnet',
      mayAskCommander: false,
      doneCondition: [{ kind: 'pr_exists' }],
      rules: ['Never mark the Pull Request ready for review; it stays a draft.'].join('\n'),
      instructions: [
        'Push the current branch to the remote named in the Git conventions and open a draft Pull',
        'Request with `gh pr create --draft`, using the Pull Request description template, the',
        'labels and the reviewers from the conventions. Report the Pull Request URL.',
      ].join('\n'),
    },
    {
      name: 'pr-reviewer',
      model: 'opus',
      mayAskCommander: false,
      doneCondition: [{ kind: 'pr_no_open_comments' }, { kind: 'ci_green' }],
      rules: ['Never edit source files.', 'Never resolve review threads yourself.'].join('\n'),
      instructions: [
        'Review the open Pull Request of the current branch. Post every finding as a review comment',
        'on the Pull Request with `gh`. If there are no findings, say so and post nothing.',
      ].join('\n'),
    },
  ];
}

export function primaryProfile(repositoryPath: string, name = 'my-app'): ProfileFile {
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

/** analyst → implementer (persistent) → reviewer ⟲ implementer → tester ⟲ implementer → publisher → pr-reviewer ⟲ implementer */
export function primaryAssembly(name = 'feature'): AssemblyFile {
  return {
    name,
    core: {
      model: 'opus',
      defaultAttemptLimit: 2,
      defaultLoopLimit: 3,
      instructions: [
        'Compose each Slot prompt from the Task documents, the Knowledge Sources, the Git',
        'conventions and the Slot Outputs it is given. Judge Checks strictly against their',
        'criterion. Explain a Needs Attention in two or three sentences a developer can act on.',
        'Report at the end what was built, what was verified and what remains open.',
      ].join('\n'),
    },
    slots: [
      { name: 'analyst', unit: 'analyst', mayAskCommander: true },
      {
        name: 'implementer',
        unit: 'implementer',
        memoryMode: 'persistent',
        context: { slotOutputs: ['analyst'], gitConventions: true },
      },
      {
        name: 'reviewer',
        unit: 'reviewer',
        context: { gitConventions: true },
        loop: { target: 'implementer', limit: 3 },
      },
      { name: 'tester', unit: 'tester', loop: { target: 'implementer', limit: 3 } },
      { name: 'publisher', unit: 'publisher', context: { gitConventions: true } },
      {
        name: 'pr-reviewer',
        unit: 'pr-reviewer',
        loop: { target: 'implementer', limit: 3 },
        exitPoint: true,
      },
    ],
  };
}

export interface HomeContent {
  units?: UnitFile[];
  projects?: { profile: ProfileFile; assemblies: AssemblyFile[] }[];
}

async function writeRel(home: string, rel: string, text: string): Promise<void> {
  const path = join(home, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, 'utf8');
}

/** Writes Units, Profiles and Assemblies as canonical files into `home`. */
export async function writeHome(home: string, content: HomeContent): Promise<void> {
  await mkdir(join(home, 'hangar'), { recursive: true });
  await mkdir(join(home, 'projects'), { recursive: true });
  for (const unit of content.units ?? []) {
    await writeRel(home, unitRelPath(unit.name), serializeUnit(unit));
  }
  for (const project of content.projects ?? []) {
    await writeRel(home, profileRelPath(project.profile.name), serializeProfile(project.profile));
    await mkdir(join(home, 'projects', project.profile.name, 'assemblies'), { recursive: true });
    for (const assembly of project.assemblies) {
      await writeRel(
        home,
        assemblyRelPath(project.profile.name, assembly.name),
        serializeAssembly(assembly),
      );
    }
  }
}

/** A complete SUPTRON_HOME with the primary scenario, pointing at `repositoryPath`. */
export async function writePrimaryHome(home: string, repositoryPath: string): Promise<void> {
  await writeHome(home, {
    units: primaryUnits(),
    projects: [{ profile: primaryProfile(repositoryPath), assemblies: [primaryAssembly()] }],
  });
}
