// Browser-safe entry: domain types, config schemas, validateAssembly(), Check catalogue, Workspace kinds.
// Must never import `node:` modules. See docs/features/assembly-editors/PLAN.md.
export * from './domain/index.js';
export * from './events/mission-event.js';
export { DEFAULTS } from './config/defaults.js';
export {
  NAME_PATTERN,
  assemblyFileSchema,
  checkSchema,
  conditionSchema,
  coreDirectivesSchema,
  isAbsolutePath,
  issuesFromZod,
  knowledgeSourceSchema,
  loopRuleSchema,
  memoryModeSchema,
  nameSchema,
  profileFileSchema,
  slotContextSchema,
  slotFileSchema,
  unitFileSchema,
  unitFrontmatterSchema,
  workspaceFileSchema,
} from './config/schemas.js';
export type {
  AssemblyFileInput,
  KnowledgeSource,
  ProfileFileInput,
  RepositoryWorkspaceFile,
  UnitFileInput,
  WorkspaceFile,
  WorkspaceFileInput,
} from './config/schemas.js';
export {
  validateAssembly,
  type ValidationResult,
  type ValidationUnit,
} from './config/validate-assembly.js';
export * from './workspace/kinds.js';
export { referencesToSlot, uniqueSlotName, type SlotReference } from './config/slot-names.js';
export {
  defaultMemoryMode,
  resolveCore,
  resolveSlot,
  type CoreDirectives,
  type ResolvedContext,
  type ResolvedSlot,
} from './config/snapshot.js';

export {
  CHECK_CATALOGUE,
  checkDescriptor,
  summarizeCheck,
  summarizeCondition,
  type CheckDescriptor,
  type CheckParam,
} from './checks/catalogue.js';
export type { AssemblyStatus } from './config/load.js';
