import { z } from 'zod';
import { DEFAULTS } from './defaults.js';

/** Basename rules for Units, Projects, Assemblies and Slots: lowercase letters, digits and `-`. */
export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const nameSchema = z
  .string()
  .min(1, 'A name is required')
  .regex(NAME_PATTERN, 'Use lowercase letters, digits and "-" only');

/**
 * The human name shown in lists and headers; the `name` stays the ID (file name, URL, references).
 * Optional so files written before titles existed stay valid; readers fall back to the name.
 */
export const titleSchema = z.string().trim().min(1, 'A title is required').optional();

export const checkSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('command'),
    command: z.string().min(1, 'A command is required'),
    timeoutSeconds: z.number().int().positive().optional(),
  }),
  z.object({ kind: z.literal('ci_green') }),
  z.object({ kind: z.literal('pr_exists') }),
  z.object({ kind: z.literal('pr_no_open_comments') }),
  z.object({
    kind: z.literal('llm_judgment'),
    criterion: z.string().min(1, 'A criterion is required'),
  }),
]);

export type Check = z.infer<typeof checkSchema>;
export type CheckKind = Check['kind'];
export type Condition = Check[];

export const conditionSchema = z.array(checkSchema);

export const unitFrontmatterSchema = z.object({
  name: nameSchema,
  title: titleSchema,
  model: z.string().min(1, 'A model is required'),
  mayAskCommander: z.boolean().default(DEFAULTS.unit.mayAskCommander),
  doneCondition: conditionSchema.default([]),
});

export const unitFileSchema = unitFrontmatterSchema.extend({
  rules: z.string(),
  instructions: z.string(),
});

export type UnitFile = z.infer<typeof unitFileSchema>;
export type UnitFileInput = z.input<typeof unitFileSchema>;

/** An absolute path, judged without `node:path` so the schema also runs in the browser. */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/');
}

/**
 * The Workspace of a Project: exactly one kind, with the fields of that kind only (SPEC FR-1).
 * Unknown fields are rejected so a `folder` Project cannot carry a stray protected branch.
 */
export const workspaceFileSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('folder'),
    path: z.string().min(1, 'A folder path is required'),
  }),
  z.strictObject({
    kind: z.literal('repository'),
    path: z.string().min(1, 'A repository path is required'),
    remote: z.string().min(1).default(DEFAULTS.profile.repository.remote),
    protectedBranch: z.string().min(1).default(DEFAULTS.profile.repository.protectedBranch),
    host: z.enum(['github', 'none']).default(DEFAULTS.profile.repository.host),
    git: z
      .object({
        branchNameTemplate: z.string().default(DEFAULTS.profile.repository.git.branchNameTemplate),
        pullRequestTemplate: z
          .string()
          .default(DEFAULTS.profile.repository.git.pullRequestTemplate),
        labels: z.array(z.string().min(1)).default([]),
        reviewers: z.array(z.string().min(1)).default([]),
      })
      .default({
        branchNameTemplate: DEFAULTS.profile.repository.git.branchNameTemplate,
        pullRequestTemplate: DEFAULTS.profile.repository.git.pullRequestTemplate,
        labels: [],
        reviewers: [],
      }),
    ciWaitTimeoutMinutes: z
      .number()
      .int()
      .positive()
      .default(DEFAULTS.profile.repository.ciWaitTimeoutMinutes),
  }),
]);

export type WorkspaceFile = z.infer<typeof workspaceFileSchema>;
export type WorkspaceFileInput = z.input<typeof workspaceFileSchema>;
export type RepositoryWorkspaceFile = Extract<WorkspaceFile, { kind: 'repository' }>;

/** A Knowledge Source is a path (relative to the Workspace root, or absolute) or an inline text (SPEC FR-2). */
export const knowledgeSourceSchema = z.union([
  z.strictObject({ path: z.string().min(1, 'A path is required'), title: z.string().optional() }),
  z.strictObject({ text: z.string().min(1, 'A text is required'), title: z.string().optional() }),
]);

export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

export const RELATIVE_PATH_WITHOUT_WORKSPACE = 'relative_path_without_workspace';

export const profileFileSchema = z
  .object({
    name: nameSchema,
    title: titleSchema,
    workspace: workspaceFileSchema,
    knowledgeSources: z.array(knowledgeSourceSchema).default([]),
    engine: z.literal('claude-code').default(DEFAULTS.profile.engine),
  })
  .superRefine((profile, ctx) => {
    // A relative path has nothing to resolve against when the Project has no folder.
    if (profile.workspace.kind !== 'none') return;
    profile.knowledgeSources.forEach((source, index) => {
      if ('path' in source && !isAbsolutePath(source.path)) {
        ctx.addIssue({
          code: 'custom',
          params: { code: RELATIVE_PATH_WITHOUT_WORKSPACE },
          message: 'A relative path needs a Workspace folder; use an absolute path or a text',
          path: ['knowledgeSources', index, 'path'],
        });
      }
    });
  });

export type ProfileFile = z.infer<typeof profileFileSchema>;
export type ProfileFileInput = z.input<typeof profileFileSchema>;

export const coreDirectivesSchema = z.object({
  model: z.string().min(1, 'A model is required'),
  defaultAttemptLimit: z.number().int().positive().default(DEFAULTS.core.defaultAttemptLimit),
  defaultLoopLimit: z.number().int().positive().default(DEFAULTS.core.defaultLoopLimit),
  resolutionLimit: z.number().int().nonnegative().default(DEFAULTS.core.resolutionLimit),
  instructions: z.string().default(DEFAULTS.core.instructions),
});

export type CoreDirectivesFile = z.infer<typeof coreDirectivesSchema>;

export const memoryModeSchema = z.enum(['fresh', 'persistent']);
export type MemoryMode = z.infer<typeof memoryModeSchema>;

export const slotContextSchema = z.object({
  taskDocuments: z.boolean().optional(),
  knowledgeSources: z.boolean().optional(),
  gitConventions: z.boolean().optional(),
  slotOutputs: z.array(z.string()).optional(),
});

export type SlotContextFile = z.infer<typeof slotContextSchema>;

export const loopRuleSchema = z.object({
  target: z.string().min(1),
  /** Absent: the Core Directives' default Loop limit applies. */
  limit: z.number().int().positive().optional(),
  /**
   * Judged once the limit is exhausted and the Done Condition still fails: when it holds the
   * Slot counts as done (the Mission moves on), otherwise the Loop limit is a Needs Attention as
   * before. Empty or absent keeps today's behaviour.
   */
  acceptCondition: conditionSchema.optional(),
});

export type LoopRule = z.infer<typeof loopRuleSchema>;

export const slotFileSchema = z.object({
  name: nameSchema,
  unit: nameSchema,
  model: z.string().min(1).optional(),
  /** Added after the Unit's Rules; a Slot can tighten a Unit, never loosen it. */
  rules: z.string().optional(),
  instructions: z.string().optional(),
  memoryMode: memoryModeSchema.optional(),
  mayAskCommander: z.boolean().optional(),
  context: slotContextSchema.optional(),
  doneCondition: conditionSchema.optional(),
  attemptLimit: z.number().int().positive().optional(),
  loop: loopRuleSchema.optional(),
  exitPoint: z.boolean().optional(),
  exitCondition: conditionSchema.optional(),
});

export type SlotFile = z.infer<typeof slotFileSchema>;

export const assemblyFileSchema = z.object({
  name: nameSchema,
  title: titleSchema,
  core: coreDirectivesSchema,
  slots: z.array(slotFileSchema).default([]),
});

export type AssemblyFile = z.infer<typeof assemblyFileSchema>;
export type AssemblyFileInput = z.input<typeof assemblyFileSchema>;

/** One validation problem of a configuration file or an Assembly. */
export interface Issue {
  code: string;
  message: string;
  slotName?: string;
  path?: string;
}

/** Turns a zod error into Issues with the dotted path of each problem. */
export function issuesFromZod(error: z.ZodError, code = 'invalid_field'): Issue[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return path
      ? { code, message: `${path}: ${issue.message}`, path }
      : { code, message: issue.message };
  });
}
