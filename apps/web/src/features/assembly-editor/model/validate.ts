import { validateAssembly, type AssemblyFile, type Issue } from '@suptron/runtime/browser';

export interface EditorIssues {
  errors: Issue[];
  warnings: Issue[];
  bySlot: Map<string, Issue[]>;
}

/** The one validation function, grouped by Slot for the cards and the inspector. */
export function validate(doc: AssemblyFile, units: readonly { name: string }[]): EditorIssues {
  const result = validateAssembly(doc, units);
  const bySlot = new Map<string, Issue[]>();
  for (const issue of result.errors) {
    if (!issue.slotName) continue;
    const list = bySlot.get(issue.slotName) ?? [];
    list.push(issue);
    bySlot.set(issue.slotName, list);
  }
  return { errors: result.errors, warnings: result.warnings, bySlot };
}
