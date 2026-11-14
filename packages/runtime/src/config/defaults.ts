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
    /**
     * The model a new Assembly's Core starts with; the file always states it. The Core judges every
     * Check, and the judge is never weaker than the Pilots it judges.
     */
    model: 'opus',
    defaultAttemptLimit: 2,
    defaultLoopLimit: 3,
    /**
     * How many Resolutions the Core may take on one Slot before it has the final word (accept, or
     * Needs Attention); 0 sends every such point straight to the Commander.
     */
    resolutionLimit: 3,
    instructions: '',
  },
  slot: {
    memoryMode: 'fresh' as const,
    context: {
      taskDocuments: true,
      knowledgeSources: true,
      // Off by default: only the Slots that branch, commit or open Pull Requests need them.
      gitConventions: false,
      slotOutputs: [] as const,
    },
    exitPoint: false,
    exitCondition: [] as const,
  },
  profile: {
    /** Defaults of the `repository` Workspace kind; the other kinds have no optional fields. */
    repository: {
      remote: 'origin',
      protectedBranch: 'main',
      host: 'github' as const,
      /** Every Git convention is optional: an empty one is not given, and the Pilot decides. */
      git: {
        branchNameTemplate: '',
        pullRequestTemplate: '',
        labels: [] as const,
        reviewers: [] as const,
      },
      ciWaitTimeoutMinutes: 30,
    },
    knowledgeSources: [] as const,
    engine: 'claude-code' as const,
  },
} as const;
