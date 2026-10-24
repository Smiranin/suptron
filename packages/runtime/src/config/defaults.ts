/**
 * Default values of every optional configuration field, in one place: the loader, the snapshot,
 * the serializer (which omits a field equal to its default) and the editors read from it.
 */
export const DEFAULTS = {
  unit: {
    mayAskCommander: false,
    doneCondition: [] as const,
  },
  core: {
    defaultAttemptLimit: 2,
    defaultLoopLimit: 3,
    instructions: '',
  },
  loopLimit: 3,
  slot: {
    memoryMode: 'fresh' as const,
    context: {
      taskDocuments: true,
      knowledgeSources: true,
      checkout: true,
      // Off by default: only the Slots that branch, commit or open Pull Requests need them.
      gitConventions: false,
      slotOutputs: [] as const,
    },
    exitPoint: false,
    exitCondition: [] as const,
  },
  profile: {
    repository: { remote: 'origin', protectedBranch: 'main' },
    knowledgeSources: [] as const,
    git: { pullRequestTemplate: '', labels: [] as const, reviewers: [] as const },
    host: 'github' as const,
    engine: 'claude-code' as const,
    ciWaitTimeoutMinutes: 30,
  },
} as const;
