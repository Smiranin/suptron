import { ExternalLink } from 'lucide-react';
import { CostLabel } from '../../../components/cost-label';
import { Markdown } from '../../../components/markdown';
import { STATE_LABELS } from '../../../components/state-badge';
import { CAUSE_LABELS } from '../model/selectors';
import type { ReadyMissionState } from '../model/types';

export function SlotsTable({ state }: { state: ReadyMissionState }) {
  return (
    <table className="w-full border-collapse text-sm" data-testid="slots-table">
      <thead>
        <tr className="text-muted-foreground text-left text-xs tracking-wider uppercase">
          <th className="py-1 pr-2 font-semibold">Slot</th>
          <th className="py-1 pr-2 font-semibold">Attempts</th>
          <th className="py-1 pr-2 font-semibold">Loops</th>
          <th className="py-1 font-semibold">Cost</th>
        </tr>
      </thead>
      <tbody>
        {state.slotOrder.map((name) => {
          const record = state.slots[name];
          if (!record) return null;
          const core = name === 'core';
          return (
            <tr key={name} className="border-border border-t" data-slot={name}>
              <td className="py-1 pr-2 font-medium">{name}</td>
              <td className="py-1 pr-2 tabular-nums">{core ? '' : record.attempts}</td>
              <td className="py-1 pr-2 tabular-nums">{core ? '' : record.loops}</td>
              <td className="py-1 tabular-nums">
                <CostLabel cost={record.cost} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The Mission as a whole: state, cost, explanation, report, PR, Slots table (FR-24, FR-31). */
export function MissionLevelView({ state }: { state: ReadyMissionState }) {
  const { summary, attention, result } = state;
  const pr = summary.pr ?? result?.pr ?? null;
  return (
    <div className="flex flex-col gap-4 p-4 text-sm" data-testid="mission-level-view">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          State: <span className="font-semibold">{STATE_LABELS[summary.state]}</span>
          {summary.state === 'needs_attention' && attention && (
            <span className="text-destructive"> · {CAUSE_LABELS[attention.cause]}</span>
          )}
        </span>
        <span>
          Total cost: <CostLabel cost={summary.cost} />{' '}
          <span className="text-muted-foreground text-xs">(estimate)</span>
        </span>
      </div>
      {attention && (
        <section className="border-destructive/40 bg-destructive/5 rounded-lg border p-3">
          <h3 className="m-0 mb-1 text-xs font-bold tracking-wider uppercase">
            The Core's explanation
          </h3>
          <Markdown text={attention.reason} />
        </section>
      )}
      {summary.state === 'completed' && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-xs font-bold tracking-wider uppercase">Result</h3>
          {pr ? (
            <a
              href={pr.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1"
            >
              <ExternalLink aria-hidden="true" className="size-3.5" /> Pull Request #{pr.number}
            </a>
          ) : (
            <p className="text-muted-foreground m-0">No Pull Request was opened.</p>
          )}
          {result && (
            <div className="border-border rounded-lg border p-3" data-testid="final-report">
              <Markdown text={result.report} />
            </div>
          )}
        </section>
      )}
      <section>
        <h3 className="m-0 mb-2 text-xs font-bold tracking-wider uppercase">Slots</h3>
        <SlotsTable state={state} />
      </section>
    </div>
  );
}
