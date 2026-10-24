import { z } from 'zod';
import { DEFAULTS } from './defaults.js';

/** Basename rules for Units, Projects, Assemblies and Slots: lowercase letters, digits and `-`. */
export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const nameSchema = z
  .string()
  .min(1, 'A name is required')
  .regex(NAME_PATTERN, 'Use lowercase letters, digits and "-" only');

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

export const profileFileSchema = z.object({
  name: nameSchema,
  repository: z.object({
    path: z.string().min(1, 'A repository path is required'),
    remote: z.string().min(1).default(DEFAULTS.profile.repository.remote),
    protectedBranch: z.string().min(1).default(DEFAULTS.profile.repository.protectedBranch),
  }),
  knowledgeSources: z.array(z.string().min(1)).default([]),
  git: z.object({
    branchNameTemplate: z.string().min(1, 'A branch name template is required'),
    pullRequestTemplate: z.string().default(''),
    labels: z.array(z.string().min(1)).default([]),
    reviewers: z.array(z.string().min(1)).default([]),
  }),
  host: z.literal('github').default(DEFAULTS.profile.host),
  engine: z.literal('claude-code').default(DEFAULTS.profile.engine),
  ciWaitTimeoutMinutes: z.number().int().positive().default(DEFAULTS.profile.ciWaitTimeoutMinutes),
});

export type ProfileFile = z.infer<typeof profileFileSchema>;
export type ProfileFileInput = z.input<typeof profileFileSchema>;

export const coreDirectivesSchema = z.object({
  model: z.string().min(1, 'A model is required'),
  defaultAttemptLimit: z.number().int().positive().default(DEFAULTS.core.defaultAttemptLimit),
  defaultLoopLimit: z.number().int().positive().default(DEFAULTS.core.defaultLoopLimit),
  instructions: z.string().default(DEFAULTS.core.instructions),
});

export type CoreDirectivesFile = z.infer<typeof coreDirectivesSchema>;

export const memoryModeSchema = z.enum(['fresh', 'persistent']);
export type MemoryMode = z.infer<typeof memoryModeSchema>;

export const slotContextSchema = z.object({
  taskDocuments: z.boolean().optional(),
  knowledgeSources: z.boolean().optional(),
  checkout: z.boolean().optional(),
  gitConventions: z.boolean().optional(),
  slotOutputs: z.array(z.string()).optional(),
});

export type SlotContextFile = z.infer<typeof slotContextSchema>;

export const loopRuleSchema = z.object({
  target: z.string().min(1),
  limit: z.number().int().positive().default(DEFAULTS.loopLimit),
});

export type LoopRule = z.infer<typeof loopRuleSchema>;

export const slotFileSchema = z.object({
  name: nameSchema,
  unit: nameSchema,
  model: z.string().min(1).optional(),
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
