import type { Check, CheckKind } from '../config/schemas.js';
import type { Capability } from '../workspace/kinds.js';

export interface CheckParam {
  name: string;
  label: string;
  type: 'string' | 'number' | 'text';
  required: boolean;
  placeholder?: string;
}

export interface CheckDescriptor {
  kind: CheckKind;
  label: string;
  description: string;
  params: CheckParam[];
  /** What the Project's Workspace must provide for the Check to run (SPEC FR-5). */
  requires: readonly Capability[];
  summarize(check: Check): string;
}

/** The fixed catalogue of Checks; the Commander cannot define new kinds. */
export const CHECK_CATALOGUE: readonly CheckDescriptor[] = [
  {
    kind: 'command',
    label: 'Command succeeds',
    description: "A shell command exits with code 0 in the Workspace's working directory.",
    params: [
      {
        name: 'command',
        label: 'Command',
        type: 'string',
        required: true,
        placeholder: 'pnpm test',
      },
      { name: 'timeoutSeconds', label: 'Timeout (seconds)', type: 'number', required: false },
    ],
    requires: [],
    summarize: (check) => (check.kind === 'command' ? check.command : ''),
  },
  {
    kind: 'ci_green',
    label: 'CI green',
    description: "Waits for the Pull Request's checks up to the Project's CI timeout.",
    params: [],
    requires: ['host'],
    summarize: () => 'CI green',
  },
  {
    kind: 'pr_exists',
    label: 'Pull Request exists',
    description: 'A Pull Request exists for the current branch.',
    params: [],
    requires: ['host'],
    summarize: () => 'PR exists',
  },
  {
    kind: 'pr_no_open_comments',
    label: 'No open PR comments',
    description: 'The Pull Request has no unresolved review threads.',
    params: [],
    requires: ['host'],
    summarize: () => 'no open PR comments',
  },
  {
    kind: 'llm_judgment',
    label: 'LLM judgment',
    description:
      "The Core judges the Slot Output, and the Workspace's change summary when it has one, against a written criterion.",
    params: [{ name: 'criterion', label: 'Criterion', type: 'text', required: true }],
    requires: [],
    summarize: (check) => (check.kind === 'llm_judgment' ? `judgment: ${check.criterion}` : ''),
  },
];

export function checkDescriptor(kind: CheckKind): CheckDescriptor {
  const descriptor = CHECK_CATALOGUE.find((d) => d.kind === kind);
  if (!descriptor) throw new Error(`Unknown Check kind: ${kind}`);
  return descriptor;
}

export function summarizeCheck(check: Check): string {
  return checkDescriptor(check.kind).summarize(check);
}

/** "pnpm test · CI green"; an empty list summarizes to "". */
export function summarizeCondition(condition: readonly Check[]): string {
  return condition.map(summarizeCheck).join(' · ');
}
