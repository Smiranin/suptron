import type { MissionState } from '@suptron/runtime/browser';
import { StatusBadge, type StatusTone } from './status-badge';

export const STATE_LABELS: Record<MissionState, string> = {
  running: 'Running',
  waiting_for_owner: 'Waiting for you',
  needs_attention: 'Needs attention',
  stopped: 'Stopped',
  completed: 'Completed',
};

const TONES: Record<MissionState, StatusTone> = {
  running: 'success',
  waiting_for_owner: 'warning',
  needs_attention: 'destructive',
  stopped: 'neutral',
  completed: 'success',
};

export function StateBadge({
  state,
  note,
  appearance = 'pill',
}: {
  state: MissionState;
  note?: 'interrupted';
  appearance?: 'plain' | 'pill';
}) {
  const label =
    note === 'interrupted' ? `${STATE_LABELS[state]} · interrupted` : STATE_LABELS[state];
  return (
    <StatusBadge tone={TONES[state]} appearance={appearance}>
      {label}
    </StatusBadge>
  );
}
