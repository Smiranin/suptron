import { sideSlotName } from '@suptron/runtime/browser';
import { Button } from '@suptron/ui/components/button';
import { toast } from '@suptron/ui/components/sonner';
import { Play, Square } from 'lucide-react';
import { useState, type Dispatch } from 'react';
import { WorkspaceBusyError, missionsApi } from '../../../api/missions';
import { CostLabel } from '../../../components/cost-label';
import { Markdown } from '../../../components/markdown';
import type { MissionPageAction, ReadyMissionState } from '../model/types';
import { TranscriptView } from './TranscriptView';

const STATUS_LABELS = {
  waiting: 'Waiting',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  interrupted: 'Interrupted',
} as const;

/** One Side Slot: its status, Slot, cost and note, Stop or Run again, and its transcript. */
export function SideSlotView({
  state,
  name,
  dispatch,
}: {
  state: ReadyMissionState;
  name: string;
  dispatch: Dispatch<MissionPageAction>;
}) {
  const [busy, setBusy] = useState(false);
  const record = state.sideSlots.find((s) => s.name === name);
  const parent =
    record?.parent ??
    state.assembly.slots.find((s) => (s.sideSlots ?? []).some((x) => sideSlotName(x) === name))
      ?.name;
  const missionId = state.summary.id;
  const act = async (action: 'stop' | 'run') => {
    setBusy(true);
    try {
      if (action === 'stop') await missionsApi.stopSideSlot(missionId, name);
      else await missionsApi.runSideSlot(missionId, name);
    } catch (error) {
      const message =
        error instanceof WorkspaceBusyError
          ? 'The Workspace is busy with another Mission'
          : error instanceof Error
            ? error.message
            : String(error);
      toast.error(`Could not ${action === 'stop' ? 'stop' : 'run'} ${name}: ${message}`);
    } finally {
      setBusy(false);
    }
  };
  const runnable =
    (record?.status === 'failed' || record?.status === 'interrupted') &&
    state.summary.state !== 'stopped';
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="side-slot-view">
      <div className="border-border flex flex-col gap-2 border-b p-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            Side Slot of <span className="font-semibold">{parent}</span>
          </span>
          <span data-testid="side-slot-status">
            {record ? STATUS_LABELS[record.status] : 'Not started'}
          </span>
          {record && <CostLabel cost={record.cost} />}
          {record?.status === 'running' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void act('stop')}
            >
              <Square aria-hidden="true" /> Stop
            </Button>
          )}
          {runnable && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void act('run')}
            >
              <Play aria-hidden="true" /> Run again
            </Button>
          )}
        </div>
        {record?.note && (
          <div
            className="bg-muted max-h-48 overflow-y-auto rounded-md p-2 text-xs"
            data-testid="side-slot-note"
          >
            <Markdown text={record.note} />
          </div>
        )}
      </div>
      <TranscriptView state={state} slot={name} dispatch={dispatch} />
    </div>
  );
}
