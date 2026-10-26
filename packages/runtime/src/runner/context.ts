import { isAbsolute, join } from 'node:path';
import type { KnowledgeSource } from '../config/schemas.js';
import type { ResolvedSlot } from '../config/snapshot.js';
import type { ContextBundle, KnowledgeSourceRef } from '../core-agent/index.js';

export interface MissionLocations {
  /** The files of the Task, listed for the Pilot; the Task location itself is for Laws and access. */
  taskDocuments: string[];
  knowledgeSources: KnowledgeSourceRef[];
  /** The Workspace's own fragment; every Slot receives it (SPEC FR-15). */
  workspace: string;
  /** null when the Workspace has no Git conventions. */
  gitConventions: string | null;
}

/** Turns the Profile's Knowledge Sources into references; a relative path resolves against the Workspace root. */
export function resolveKnowledgeSources(
  sources: readonly KnowledgeSource[],
  root: string,
): KnowledgeSourceRef[] {
  return sources.map((source) => {
    const title = source.title !== undefined ? { title: source.title } : {};
    if ('text' in source) return { kind: 'text', text: source.text, ...title };
    return {
      kind: 'path',
      path: isAbsolute(source.path) ? source.path : join(root, source.path),
      ...title,
    };
  });
}

/** Builds the paths, texts and Slot Outputs a Slot receives, from its `context` settings. */
export function buildContextBundle(
  slot: ResolvedSlot,
  locations: MissionLocations,
  slotOutputs: ReadonlyMap<string, string>,
): ContextBundle {
  return {
    taskDocuments: slot.context.taskDocuments ? locations.taskDocuments : [],
    knowledgeSources: slot.context.knowledgeSources ? locations.knowledgeSources : [],
    workspace: locations.workspace,
    gitConventions: slot.context.gitConventions ? locations.gitConventions : null,
    slotOutputs: slot.context.slotOutputs.flatMap((name) => {
      const output = slotOutputs.get(name);
      return output === undefined ? [] : [{ slotName: name, output }];
    }),
  };
}
