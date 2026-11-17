import type { ContextBundle, KnowledgeSourceRef } from '../core-agent/index.js';

/**
 * The prompt of a Side Slot, put together by plain code from its context bundle: the Core never
 * writes one. What the Side Slot is to do is in its Instructions, which its Pilot already has.
 */
export function composeSideSlotPrompt(bundle: ContextBundle, parentSlot: string): string {
  const parts = [
    `The Slot "${parentSlot}" of this Mission is done, and you were started after it. Your work stands beside the Mission and does not change its course. Do what your Instructions ask, then hand over.`,
    `## Workspace\n\n${bundle.workspace}`,
  ];
  if (bundle.taskDocuments.length > 0) {
    parts.push(
      `## Task documents\n\n${bundle.taskDocuments.map((path) => `- ${path}`).join('\n')}`,
    );
  }
  if (bundle.knowledgeSources.length > 0) {
    parts.push(
      `## Knowledge Sources\n\n${bundle.knowledgeSources.map(knowledgeSource).join('\n\n')}`,
    );
  }
  if (bundle.gitConventions !== null) {
    parts.push(`## Git conventions\n\n${bundle.gitConventions}`);
  }
  for (const { slotName, output } of bundle.slotOutputs) {
    parts.push(`## Slot Output of "${slotName}"\n\n${output}`);
  }
  return parts.join('\n\n');
}

/** A path to read, or a text given as it is under its title. */
function knowledgeSource(source: KnowledgeSourceRef): string {
  const title = source.title === undefined ? '' : ` (${source.title})`;
  if (source.kind === 'path') return `- ${source.path}${title}`;
  return `### ${source.title ?? 'Text'}\n\n${source.text}`;
}
