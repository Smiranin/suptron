import {
  loopBadge,
  type LoopPiece,
  type SideSlotPiece,
  type SubPilotPiece,
} from '../../missions/picture';
import { WORLD } from '../world/world';

/** A Sub-pilot's label close up: its Unit and whether it was called. */
export function SubPilotLabel({ subPilot }: { subPilot: SubPilotPiece }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono">{subPilot.unit}</span>
      <span style={{ color: WORLD.labels.muted }}>{subPilot.status}</span>
    </span>
  );
}

/** A Side Slot's label close up: its name and its status as recorded. */
export function SideSlotLabel({ sideSlot }: { sideSlot: SideSlotPiece }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono">{sideSlot.name}</span>
      <span style={{ color: WORLD.labels.muted }}>{sideSlot.status}</span>
    </span>
  );
}

/** A Loop's counter, the same text the clock shows on its chord. */
export function LoopLabel({ loop }: { loop: LoopPiece }) {
  return <span>{loopBadge(loop.iterations, loop.limit)}</span>;
}

/** The word on an Exit Point's gate close up. */
export function ExitPointLabel() {
  return <span style={{ color: WORLD.labels.muted }}>exit</span>;
}
