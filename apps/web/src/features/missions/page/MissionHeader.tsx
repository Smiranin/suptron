import { Button } from '@suptron/ui/components/button';
import { toast } from '@suptron/ui/components/sonner';
import { useNavigate } from '@tanstack/react-router';
import { CircleStop, ExternalLink, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { missionsApi } from '../../../api/missions';
import { CostLabel } from '../../../components/cost-label';
import { StateBadge } from '../../../components/state-badge';
import { taskName } from '../model/selectors';
import type { ReadyMissionState } from '../model/types';
import { StopMissionDialog } from './StopMissionDialog';

export function useStopMission(id: string) {
  const [open, setOpen] = useState(false);
  const confirm = () => {
    setOpen(false);
    missionsApi.stop(id).catch((error: Error) => toast.error(`Could not stop: ${error.message}`));
  };
  return { open, request: () => setOpen(true), cancel: () => setOpen(false), confirm };
}

/** Project / Assembly, Task, Checkout, state, cost, PR link, Stop or Dismiss (FR-14, FR-33). */
export function MissionHeader({ state, onStop }: { state: ReadyMissionState; onStop: () => void }) {
  const navigate = useNavigate();
  const { summary } = state;
  const terminal = summary.state === 'completed' || summary.state === 'stopped';
  const pr = summary.pr ?? state.result?.pr ?? null;
  const dismiss = () =>
    missionsApi
      .dismiss(summary.id)
      .then(() => navigate({ to: '/missions' }))
      .catch((error: Error) => toast.error(`Could not dismiss: ${error.message}`));
  return (
    <header
      className="flex flex-wrap items-start justify-between gap-4"
      data-testid="mission-header"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-2xl font-bold tracking-[-0.03em]">
            {summary.projectName} / {summary.assemblyName}
          </h1>
          <StateBadge state={summary.state} note={summary.note} />
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span>
            Task: <span className="text-foreground font-medium">{taskName(summary)}</span>
          </span>
          <span className="font-mono text-xs">
            {summary.checkoutPath}
            {summary.branch ? ` @ ${summary.branch}` : ''}
          </span>
          <span>
            Cost: <CostLabel cost={summary.cost} /> <span className="text-xs">(estimate)</span>
          </span>
          {pr && (
            <a
              href={pr.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1"
              data-testid="pr-link"
            >
              <ExternalLink aria-hidden="true" className="size-3.5" /> Pull Request #{pr.number}
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {terminal ? (
          <Button type="button" variant="outline" onClick={dismiss}>
            <Trash2 aria-hidden="true" /> Dismiss
          </Button>
        ) : (
          <Button type="button" variant="destructive" onClick={onStop}>
            <CircleStop aria-hidden="true" /> Stop
          </Button>
        )}
      </div>
    </header>
  );
}

export { StopMissionDialog };
