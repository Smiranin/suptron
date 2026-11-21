import type { CSSProperties, ReactNode } from 'react';
import type { PanelSelection } from '../../missions/model/types';
import { elementKey, type ElementRef, type MissionPicture } from '../../missions/picture';
import { WORLD, type LabelDetail } from '../world/world';
import { CoreLabel } from './CoreLabel';
import { ExitPointLabel, LoopLabel, SideSlotLabel, SubPilotLabel } from './small-labels';
import { SlotLabel } from './SlotLabel';

export interface LabelsProps {
  picture: MissionPicture;
  selection: PanelSelection;
  detail: LabelDetail;
  /** Hands the scene each label's element by `elementKey`, and null when it goes away. */
  register(key: string, element: HTMLElement | null): void;
  onSelect(selection: PanelSelection): void;
  /** The pointer entered a label (its element) or left it (null). */
  onHover(ref: ElementRef | null): void;
}

/** The dark, muted look of every label, whatever the application's theme. */
const LABEL_STYLE: CSSProperties = {
  color: WORLD.labels.text,
  background: WORLD.labels.background,
  borderColor: WORLD.labels.border,
};

const SELECTED_STYLE: CSSProperties = {
  ...LABEL_STYLE,
  borderColor: WORLD.labels.selectedBorder,
};

/**
 * The layer of labels over the canvas: one element per element of the picture. React draws what a
 * label says; the scene writes where it stands, each frame, straight onto the element.
 */
export function Labels({ picture, selection, detail, register, onSelect, onHover }: LabelsProps) {
  const selected = elementKey(selection);
  /** One positioned label; clickable when its element can be selected. */
  const label = (ref: ElementRef, content: ReactNode) => {
    const key = elementKey(ref);
    if (content === null) return null;
    const selectable = ref.kind !== 'loop' && ref.kind !== 'exitPoint';
    return (
      <div
        key={key}
        ref={(element) => {
          register(key, element);
          return () => register(key, null);
        }}
        data-label={key}
        // Hidden until the scene has placed it, so it never flashes in the corner.
        className="invisible absolute top-0 left-0 will-change-transform"
      >
        {selectable ? (
          <button
            type="button"
            className="pointer-events-auto cursor-pointer rounded-md border px-2 py-1 text-left text-xs whitespace-nowrap shadow-sm backdrop-blur-sm"
            style={key === selected ? SELECTED_STYLE : LABEL_STYLE}
            onClick={() => onSelect(ref)}
            onPointerEnter={() => onHover(ref)}
            onPointerLeave={() => onHover(null)}
          >
            {content}
          </button>
        ) : (
          <div
            className="rounded-md border px-1.5 py-0.5 text-[11px] whitespace-nowrap"
            style={LABEL_STYLE}
          >
            {content}
          </div>
        )}
      </div>
    );
  };
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-testid="universe-labels"
    >
      {label(picture.core.ref, <CoreLabel core={picture.core} />)}
      {picture.slots.map((slot) => [
        label(slot.ref, <SlotLabel slot={slot} detail={detail} />),
        ...slot.subPilots.map((sub) =>
          label(sub.ref, detail === 'close' ? <SubPilotLabel subPilot={sub} /> : null),
        ),
        ...slot.sideSlots.map((side) =>
          label(side.ref, detail === 'close' ? <SideSlotLabel sideSlot={side} /> : null),
        ),
        slot.loop && label(slot.loop.ref, <LoopLabel loop={slot.loop} />),
        slot.exitPoint && label(slot.exitPoint.ref, detail === 'close' ? <ExitPointLabel /> : null),
      ])}
    </div>
  );
}
