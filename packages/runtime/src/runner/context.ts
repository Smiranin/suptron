import { isAbsolute, join } from 'node:path';
import type { MissionSnapshot, ResolvedSlot } from '../config/snapshot.js';
import type { ContextBundle } from '../core-agent/index.js';

export interface MissionLocations {
  /** The files of the Task, listed for the Pilot; the Task location itself is for Laws and access. */
  taskDocuments: string[];
  checkoutPath: string;
  gitConventions: string;
}

/** Builds the paths and Slot Outputs a Slot receives, from its `context` settings. */
export function buildContextBundle(
  slot: ResolvedSlot,
  snapshot: MissionSnapshot,
  locations: MissionLocations,
  slotOutputs: ReadonlyMap<string, string>,
): ContextBundle {
  const repositoryPath = snapshot.profile.repository.path;
  return {
    taskDocuments: slot.context.taskDocuments ? locations.taskDocuments : [],
    knowledgeSources: slot.context.knowledgeSources
      ? snapshot.profile.knowledgeSources.map((source) =>
          isAbsolute(source) ? source : join(repositoryPath, source),
        )
      : [],
    checkoutPath: slot.context.checkout ? locations.checkoutPath : null,
    gitConventions: slot.context.gitConventions ? locations.gitConventions : null,
    slotOutputs: slot.context.slotOutputs.flatMap((name) => {
      const output = slotOutputs.get(name);
      return output === undefined ? [] : [{ slotName: name, output }];
    }),
  };
}
