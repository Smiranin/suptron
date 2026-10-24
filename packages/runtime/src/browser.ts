// Browser-safe entry: domain types, config schemas, validateAssembly(), Check catalogue.
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
  issuesFromZod,
  loopRuleSchema,
  memoryModeSchema,
  nameSchema,
  profileFileSchema,
  slotContextSchema,
  slotFileSchema,
  unitFileSchema,
  unitFrontmatterSchema,
} from './config/schemas.js';
export type { AssemblyFileInput, ProfileFileInput, UnitFileInput } from './config/schemas.js';
export { validateAssembly, type ValidationResult } from './config/validate-assembly.js';
export { referencesToSlot, uniqueSlotName, type SlotReference } from './config/slot-names.js';
export {
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
