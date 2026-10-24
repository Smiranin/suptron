import type { Issue } from '@suptron/runtime/browser';
import { cn } from '@suptron/ui/lib/utils';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import type { EditorIssues } from './model/validate';

/** Errors (red) and warnings (amber) under the canvas; clicking one selects its Slot (FR-38). */
export function IssuesList({
  issues,
  onSelect,
}: {
  issues: EditorIssues;
  onSelect: (slot: string) => void;
}) {
  if (issues.errors.length === 0 && issues.warnings.length === 0) return null;
  const row = (issue: Issue, kind: 'error' | 'warning', index: number) => {
    const Icon = kind === 'error' ? AlertCircle : AlertTriangle;
    const content = (
      <>
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span>{issue.message}</span>
      </>
    );
    const className = cn(
      'flex items-center gap-2 text-sm',
      kind === 'error' ? 'text-destructive' : 'text-warning',
    );
    return (
      <li key={`${kind}-${index}`} data-testid={`issue-${kind}`} data-slot={issue.slotName}>
        {issue.slotName ? (
          <button
            type="button"
            className={cn(className, 'hover:underline')}
            onClick={() => onSelect(issue.slotName!)}
          >
            {content}
          </button>
        ) : (
          <span className={className}>{content}</span>
        )}
      </li>
    );
  };
  return (
    <section
      className="border-border bg-background border-t px-4 py-2"
      aria-label="Validation issues"
      data-testid="issues-list"
    >
      <ul className="flex flex-col gap-1">
        {issues.errors.map((issue, i) => row(issue, 'error', i))}
        {issues.warnings.map((issue, i) => row(issue, 'warning', i))}
      </ul>
    </section>
  );
}
