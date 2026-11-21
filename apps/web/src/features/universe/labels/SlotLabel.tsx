import { AlertTriangle, MessageCircleQuestion } from 'lucide-react';
import { CostLabel } from '../../../components/cost-label';
import type { SlotVisualState } from '../../missions/model/types';
import type { SlotPiece } from '../../missions/picture';
import { WORLD, type LabelDetail } from '../world/world';

/** The colour of the word that names a Slot's state. */
const STATE_COLOR: Record<SlotVisualState, string> = {
  pending: WORLD.labels.muted,
  running: WORLD.labels.running,
  done: WORLD.labels.done,
  failed: WORLD.labels.failed,
};

/** A Slot's label: name and state from far away; Unit, Attempt, skipped rounds and cost close up. */
export function SlotLabel({ slot, detail }: { slot: SlotPiece; detail: LabelDetail }) {
  return (
    <span className="flex flex-col gap-0.5" data-state={slot.state}>
      <span className="flex items-center gap-1.5">
        <span className="font-semibold">{slot.name}</span>
        <span style={{ color: STATE_COLOR[slot.state] }}>{slot.state}</span>
        {slot.marker === 'waiting' && (
          <MessageCircleQuestion
            aria-label="Waiting for you"
            className="size-3.5"
            style={{ color: WORLD.labels.waiting }}
          />
        )}
        {slot.marker === 'attention' && (
          <AlertTriangle
            aria-label="Needs attention"
            className="size-3.5"
            style={{ color: WORLD.labels.failed }}
          />
        )}
      </span>
      {detail === 'close' && (
        <span className="flex items-center gap-2" style={{ color: WORLD.labels.muted }}>
          {slot.unit !== slot.name && <span>{slot.unit}</span>}
          {slot.attempts > 1 && <span>Attempt {slot.attempts}</span>}
          {slot.skipped > 0 && <span>Skipped {slot.skipped}×</span>}
          <CostLabel cost={slot.cost} />
        </span>
      )}
    </span>
  );
}
