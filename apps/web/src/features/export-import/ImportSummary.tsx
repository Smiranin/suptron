import type { ElementRef, ImportSummary as Summary } from '@suptron/runtime/browser';
import { CheckCircle2 } from 'lucide-react';
import { elementLabel } from './element-label';

/** One titled list of elements, absent when empty. */
function SummaryList({ title, refs }: { title: string; refs: readonly ElementRef[] }) {
  if (refs.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h3 className="m-0 text-sm font-bold">{title}</h3>
      <ul className="text-sm">
        {refs.map((ref) => (
          <li key={`${ref.kind}:${ref.project ?? ''}:${ref.name}`}>{elementLabel(ref)}</li>
        ))}
      </ul>
    </section>
  );
}

/** What an applied Import added and replaced. */
export function ImportSummary({ summary }: { summary: Summary }) {
  const nothing = summary.added.length === 0 && summary.replaced.length === 0;
  return (
    <div
      role="status"
      className="border-border bg-card flex flex-col gap-3 rounded-xl border px-4 py-3"
      data-testid="import-summary"
    >
      <p className="m-0 flex items-center gap-2 text-sm font-bold">
        <CheckCircle2 className="text-success size-4" aria-hidden="true" />
        {nothing ? 'The Import is applied; nothing changed.' : 'The Import is applied.'}
      </p>
      <SummaryList title="Added" refs={summary.added} />
      <SummaryList title="Replaced" refs={summary.replaced} />
    </div>
  );
}
