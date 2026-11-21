import { CostLabel } from '../../../components/cost-label';
import { STATE_LABELS } from '../../../components/state-badge';
import { formatResetTime } from '../../missions/model/selectors';
import type { CorePiece } from '../../missions/picture';
import { WORLD } from '../world/world';

/** The Core's label: the state of the Mission, the Core's own cost, and when usage resets. */
export function CoreLabel({ core }: { core: CorePiece }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span
        className="text-[10px] font-bold tracking-wider uppercase"
        style={{ color: WORLD.labels.muted }}
      >
        Core
      </span>
      <span className="font-semibold">{STATE_LABELS[core.state]}</span>
      {core.usageResetsAt !== undefined && (
        <span style={{ color: WORLD.labels.muted }}>
          resets at {formatResetTime(core.usageResetsAt)}
        </span>
      )}
      <CostLabel cost={core.cost} />
    </span>
  );
}
