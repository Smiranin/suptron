import type { MissionSummary } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { toast } from '@suptron/ui/components/sonner';
import { Link } from '@tanstack/react-router';
import { Rocket, Trash2, WifiOff } from 'lucide-react';
import { missionsApi } from '../../../api/missions';
import { CostLabel } from '../../../components/cost-label';
import { EmptyState, PageContainer, PageHeader } from '../../../components/page';
import { RelativeTime } from '../../../components/relative-time';
import { StateBadge } from '../../../components/state-badge';
import { useMissionGroups, useMissionsState, usePageTitle } from '../MissionsProvider';
import { taskName } from '../model/selectors';

export function DismissButton({ mission }: { mission: MissionSummary }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={`Dismiss ${mission.assemblyName} · ${taskName(mission)}`}
      onClick={() =>
        missionsApi
          .dismiss(mission.id)
          .catch((error: Error) => toast.error(`Could not dismiss: ${error.message}`))
      }
    >
      <Trash2 aria-hidden="true" /> Dismiss
    </Button>
  );
}

function MissionRow({ mission }: { mission: MissionSummary }) {
  const finished = mission.state === 'completed' || mission.state === 'stopped';
  return (
    <li
      className="border-border bg-card grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border px-4 py-3"
      data-testid="mission-row"
      data-mission={mission.id}
    >
      <Link
        to="/missions/$id"
        params={{ id: mission.id }}
        className="flex min-w-0 flex-col gap-1 no-underline"
      >
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-foreground font-semibold">
            {mission.projectName} / {mission.assemblyName}
          </span>
          <span className="text-foreground">{taskName(mission)}</span>
          <StateBadge state={mission.state} note={mission.note} />
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {mission.branch && <span className="font-mono">{mission.branch}</span>}
          {!finished && mission.currentSlot && (
            <span data-testid="current-slot">Slot: {mission.currentSlot}</span>
          )}
          <CostLabel cost={mission.cost} />
          <RelativeTime iso={mission.startedAt} />
        </span>
      </Link>
      {finished && <DismissButton mission={mission} />}
    </li>
  );
}

function MissionGroup({ title, missions }: { title: string; missions: MissionSummary[] }) {
  if (missions.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-muted-foreground m-0 text-xs font-bold tracking-[0.15em] uppercase">
        {title}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {missions.map((m) => (
          <MissionRow key={m.id} mission={m} />
        ))}
      </ul>
    </section>
  );
}

export function EmptyMissionsHint() {
  return (
    <EmptyState
      icon={Rocket}
      title="No Missions"
      description="Launch a Mission from an Assembly on the Projects page."
      action={
        <Button asChild variant="outline">
          <Link to="/projects">Go to Projects</Link>
        </Button>
      }
    />
  );
}

export function MissionsListPage() {
  usePageTitle('Missions');
  const groups = useMissionGroups();
  const { connection, loaded } = useMissionsState();
  const total = groups.needsYou.length + groups.running.length + groups.finished.length;
  return (
    <PageContainer>
      <PageHeader title="Missions" count={loaded ? total : undefined} />
      {connection === 'closed' && (
        <p className="text-warning mb-4 flex items-center gap-2 text-sm" role="status">
          <WifiOff aria-hidden="true" className="size-4" /> Connection lost, reconnecting
        </p>
      )}
      {loaded && total === 0 ? (
        <EmptyMissionsHint />
      ) : (
        <div className="flex flex-col gap-8">
          <MissionGroup title="Needs you" missions={groups.needsYou} />
          <MissionGroup title="Running" missions={groups.running} />
          <MissionGroup title="Finished" missions={groups.finished} />
        </div>
      )}
    </PageContainer>
  );
}
