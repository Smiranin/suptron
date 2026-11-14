import { stringify as stringifyYaml } from 'yaml';
import { DEFAULTS } from './defaults.js';
import type {
  AssemblyFile,
  Check,
  KnowledgeSource,
  ProfileFile,
  SlotContextFile,
  SlotFile,
  UnitFile,
  WorkspaceFile,
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
  put(out, 'rules', slot.rules);
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
    put(loop, 'acceptCondition', plainCondition(slot.loop.acceptCondition));
    out.loop = loop;
  }
  put(out, 'skipWhenDone', unlessDefault(slot.skipWhenDone, DEFAULTS.slot.skipWhenDone));
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
  put(
    core,
    'resolutionLimit',
    unlessDefault(assembly.core.resolutionLimit, DEFAULTS.core.resolutionLimit),
  );
  put(core, 'instructions', unlessDefault(assembly.core.instructions, DEFAULTS.core.instructions));
  const doc: Plain = { name: assembly.name };
  put(doc, 'title', assembly.title);
  doc.core = core;
  doc.slots = assembly.slots.map((slot, i) => plainSlot(slot, i === assembly.slots.length - 1));
  return stringifyYaml(doc, YAML_OPTIONS);
}

/** The Workspace section with the defaults of its kind omitted; the kind always comes first. */
function plainWorkspace(workspace: WorkspaceFile): Plain {
  switch (workspace.kind) {
    case 'none':
      return { kind: 'none' };
    case 'folder':
      return { kind: 'folder', path: workspace.path };
    case 'repository': {
      const defaults = DEFAULTS.profile.repository;
      const out: Plain = { kind: 'repository', path: workspace.path };
      put(out, 'remote', unlessDefault(workspace.remote, defaults.remote));
      put(
        out,
        'protectedBranch',
        unlessDefault(workspace.protectedBranch, defaults.protectedBranch),
      );
      put(out, 'host', unlessDefault(workspace.host, defaults.host));
      const git: Plain = {};
      put(
        git,
        'branchNameTemplate',
        unlessDefault(workspace.git.branchNameTemplate, defaults.git.branchNameTemplate),
      );
      put(
        git,
        'pullRequestTemplate',
        unlessDefault(workspace.git.pullRequestTemplate, defaults.git.pullRequestTemplate),
      );
      put(git, 'labels', nonEmpty(workspace.git.labels));
      put(git, 'reviewers', nonEmpty(workspace.git.reviewers));
      if (Object.keys(git).length > 0) out.git = git;
      put(
        out,
        'ciWaitTimeoutMinutes',
        unlessDefault(workspace.ciWaitTimeoutMinutes, defaults.ciWaitTimeoutMinutes),
      );
      return out;
    }
  }
}

function plainKnowledgeSource(source: KnowledgeSource): Plain {
  const out: Plain = 'path' in source ? { path: source.path } : { text: source.text };
  put(out, 'title', source.title);
  return out;
}

export function serializeProfile(profile: ProfileFile): string {
  const doc: Plain = { name: profile.name };
  put(doc, 'title', profile.title);
  doc.workspace = plainWorkspace(profile.workspace);
  put(doc, 'knowledgeSources', nonEmpty(profile.knowledgeSources)?.map(plainKnowledgeSource));
  put(doc, 'engine', unlessDefault(profile.engine, DEFAULTS.profile.engine));
  return stringifyYaml(doc, YAML_OPTIONS);
}

export function serializeUnit(unit: UnitFile): string {
  const frontmatter: Plain = { name: unit.name };
  put(frontmatter, 'title', unit.title);
  frontmatter.model = unit.model;
  put(
    frontmatter,
    'mayAskCommander',
    unlessDefault(unit.mayAskCommander, DEFAULTS.unit.mayAskCommander),
  );
  put(frontmatter, 'doneCondition', plainCondition(unit.doneCondition));
  return formatUnitMarkdown(frontmatter, unit.rules, unit.instructions);
}
