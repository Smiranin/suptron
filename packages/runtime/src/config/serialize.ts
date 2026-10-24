import { stringify as stringifyYaml } from 'yaml';
import { DEFAULTS } from './defaults.js';
import type {
  AssemblyFile,
  Check,
  ProfileFile,
  SlotContextFile,
  SlotFile,
  UnitFile,
} from './schemas.js';
import { formatUnitMarkdown } from './unit-markdown.js';

type Plain = Record<string, unknown>;

function put(target: Plain, key: string, value: unknown): void {
  if (value !== undefined) target[key] = value;
}

function unlessDefault<T>(value: T | undefined, fallback: T): T | undefined {
  if (value === undefined) return undefined;
  return JSON.stringify(value) === JSON.stringify(fallback) ? undefined : value;
}

function nonEmpty<T>(list: readonly T[] | undefined): T[] | undefined {
  return list && list.length > 0 ? [...list] : undefined;
}

function plainCheck(check: Check): Plain {
  switch (check.kind) {
    case 'command': {
      const out: Plain = { kind: 'command', command: check.command };
      put(out, 'timeoutSeconds', check.timeoutSeconds);
      return out;
    }
    case 'llm_judgment':
      return { kind: 'llm_judgment', criterion: check.criterion };
    default:
      return { kind: check.kind };
  }
}

function plainCondition(condition: readonly Check[] | undefined): Plain[] | undefined {
  const list = nonEmpty(condition);
  return list ? list.map(plainCheck) : undefined;
}

function plainContext(context: SlotContextFile | undefined): Plain | undefined {
  if (!context) return undefined;
  const out: Plain = {};
  put(
    out,
    'taskDocuments',
    unlessDefault(context.taskDocuments, DEFAULTS.slot.context.taskDocuments),
  );
  put(
    out,
    'knowledgeSources',
    unlessDefault(context.knowledgeSources, DEFAULTS.slot.context.knowledgeSources),
  );
  put(out, 'checkout', unlessDefault(context.checkout, DEFAULTS.slot.context.checkout));
  put(
    out,
    'gitConventions',
    unlessDefault(context.gitConventions, DEFAULTS.slot.context.gitConventions),
  );
  put(out, 'slotOutputs', nonEmpty(context.slotOutputs));
  return Object.keys(out).length > 0 ? out : undefined;
}

function plainSlot(slot: SlotFile, isLast: boolean): Plain {
  const out: Plain = { name: slot.name, unit: slot.unit };
  put(out, 'model', slot.model);
  put(out, 'instructions', slot.instructions);
  put(out, 'memoryMode', unlessDefault(slot.memoryMode, DEFAULTS.slot.memoryMode));
  put(out, 'mayAskCommander', slot.mayAskCommander);
  put(out, 'context', plainContext(slot.context));
  // An explicit empty override list still replaces the Unit's Done Condition, so it is kept.
  if (slot.doneCondition !== undefined) out.doneCondition = slot.doneCondition.map(plainCheck);
  put(out, 'attemptLimit', slot.attemptLimit);
  if (slot.loop) {
    const loop: Plain = { target: slot.loop.target };
    put(loop, 'limit', slot.loop.limit);
    out.loop = loop;
  }
  // The last Slot always states exitPoint: true so the file reads unambiguously.
  if (isLast) out.exitPoint = true;
  else put(out, 'exitPoint', unlessDefault(slot.exitPoint, DEFAULTS.slot.exitPoint));
  put(out, 'exitCondition', plainCondition(slot.exitCondition));
  return out;
}

const YAML_OPTIONS = { lineWidth: 0 } as const;

export function serializeAssembly(assembly: AssemblyFile): string {
  const core: Plain = { model: assembly.core.model };
  put(
    core,
    'defaultAttemptLimit',
    unlessDefault(assembly.core.defaultAttemptLimit, DEFAULTS.core.defaultAttemptLimit),
  );
  put(
    core,
    'defaultLoopLimit',
    unlessDefault(assembly.core.defaultLoopLimit, DEFAULTS.core.defaultLoopLimit),
  );
  put(core, 'instructions', unlessDefault(assembly.core.instructions, DEFAULTS.core.instructions));
  const doc: Plain = {
    name: assembly.name,
    core,
    slots: assembly.slots.map((slot, i) => plainSlot(slot, i === assembly.slots.length - 1)),
  };
  return stringifyYaml(doc, YAML_OPTIONS);
}

export function serializeProfile(profile: ProfileFile): string {
  const repository: Plain = { path: profile.repository.path };
  put(
    repository,
    'remote',
    unlessDefault(profile.repository.remote, DEFAULTS.profile.repository.remote),
  );
  put(
    repository,
    'protectedBranch',
    unlessDefault(profile.repository.protectedBranch, DEFAULTS.profile.repository.protectedBranch),
  );
  const git: Plain = { branchNameTemplate: profile.git.branchNameTemplate };
  put(
    git,
    'pullRequestTemplate',
    unlessDefault(profile.git.pullRequestTemplate, DEFAULTS.profile.git.pullRequestTemplate),
  );
  put(git, 'labels', nonEmpty(profile.git.labels));
  put(git, 'reviewers', nonEmpty(profile.git.reviewers));
  const doc: Plain = { name: profile.name, repository };
  put(doc, 'knowledgeSources', nonEmpty(profile.knowledgeSources));
  doc.git = git;
  put(doc, 'host', unlessDefault(profile.host, DEFAULTS.profile.host));
  put(doc, 'engine', unlessDefault(profile.engine, DEFAULTS.profile.engine));
  put(
    doc,
    'ciWaitTimeoutMinutes',
    unlessDefault(profile.ciWaitTimeoutMinutes, DEFAULTS.profile.ciWaitTimeoutMinutes),
  );
  return stringifyYaml(doc, YAML_OPTIONS);
}

export function serializeUnit(unit: UnitFile): string {
  const frontmatter: Plain = { name: unit.name, model: unit.model };
  put(
    frontmatter,
    'mayAskCommander',
    unlessDefault(unit.mayAskCommander, DEFAULTS.unit.mayAskCommander),
  );
  put(frontmatter, 'doneCondition', plainCondition(unit.doneCondition));
  return formatUnitMarkdown(frontmatter, unit.rules, unit.instructions);
}
