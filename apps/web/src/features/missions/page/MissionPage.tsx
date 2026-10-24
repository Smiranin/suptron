import { Skeleton } from '@suptron/ui/components/skeleton';
import { useLiveMission } from '../live/useLiveMission';
import { usePageTitle } from '../MissionsProvider';
import { missionTitle } from '../model/selectors';
import { SidePanel } from '../panel/SidePanel';
import { AbsentMissionPage } from './AbsentMissionPage';
import { MissionBanner } from './MissionBanner';
import { MissionClock } from './MissionClock';
import { MissionHeader, useStopMission } from './MissionHeader';
import { StopMissionDialog } from './StopMissionDialog';

/** One page per Mission; the layout follows the state, the address does not (FR-13). */
export function MissionPage({ id }: { id: string }) {
  const [state, dispatch] = useLiveMission(id);
  usePageTitle(state.status === 'ready' ? missionTitle(state.summary) : null);
  const stop = useStopMission(id);
  if (state.status === 'absent') return <AbsentMissionPage />;
  if (state.status === 'loading') {
    return (
      <div
        className="flex flex-col gap-4 p-[var(--shell-content-padding,24px)]"
        aria-busy="true"
        data-testid="mission-loading"
      >
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }
  return (
    <div
      className="flex h-full min-h-0 flex-col gap-4 p-[var(--shell-content-padding,24px)]"
      data-testid="mission-page"
    >
      <MissionHeader state={state} onStop={stop.request} />
      <MissionBanner state={state} />
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="min-h-[420px] min-w-0 flex-1">
          <MissionClock
            state={state}
            onSelectSlot={(name) => dispatch({ type: 'selectSlot', name })}
            onSelectMission={() => dispatch({ type: 'selectMission' })}
          />
        </div>
        <SidePanel state={state} dispatch={dispatch} onStop={stop.request} />
      </div>
      <StopMissionDialog open={stop.open} onConfirm={stop.confirm} onCancel={stop.cancel} />
    </div>
  );
}
