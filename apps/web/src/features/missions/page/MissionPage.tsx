import { Skeleton } from '@suptron/ui/components/skeleton';
import { useMemo } from 'react';
import { useLiveMission } from '../live/useLiveMission';
import { usePageTitle } from '../MissionsProvider';
import { missionTitle } from '../model/selectors';
import type { MissionPageAction, MissionPageState, PanelSelection } from '../model/types';
import { missionPicture } from '../picture';
import { SidePanel } from '../panel/SidePanel';
import { AbsentMissionPage } from './AbsentMissionPage';
import { MissionBanner } from './MissionBanner';
import { MissionHeader, useStopMission } from './MissionHeader';
import { MissionPictureArea } from './MissionPictureArea';
import { StopMissionDialog } from './StopMissionDialog';

/** The action of the page that selects what a view of the Mission reported as clicked. */
function selectAction(selection: PanelSelection): MissionPageAction {
  switch (selection.kind) {
    case 'slot':
      return { type: 'selectSlot', name: selection.name };
    case 'mission':
      return { type: 'selectMission' };
    case 'sideSlot':
      return { type: 'selectSideSlot', name: selection.name };
    case 'subPilot':
      return { type: 'selectSubPilot', slot: selection.slot, unit: selection.unit };
  }
}

/** The picture of a ready Mission, computed once per state; null while the page has none. */
function usePicture(state: MissionPageState) {
  return useMemo(() => (state.status === 'ready' ? missionPicture(state) : null), [state]);
}

/** One page per Mission; the layout follows the state, the address does not (FR-13). */
export function MissionPage({ id }: { id: string }) {
  const [state, dispatch] = useLiveMission(id);
  usePageTitle(state.status === 'ready' ? missionTitle(state.summary) : null);
  const stop = useStopMission(id);
  const picture = usePicture(state);
  if (state.status === 'absent') return <AbsentMissionPage />;
  if (state.status === 'loading' || picture === null) {
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
          <MissionPictureArea
            assembly={state.assembly}
            picture={picture}
            selection={state.panel.selection}
            onSelect={(selection) => dispatch(selectAction(selection))}
          />
        </div>
        <SidePanel state={state} dispatch={dispatch} onStop={stop.request} />
      </div>
      <StopMissionDialog open={stop.open} onConfirm={stop.confirm} onCancel={stop.cancel} />
    </div>
  );
}
