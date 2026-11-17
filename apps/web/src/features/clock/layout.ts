import { DEFAULTS, sideSlotName, type AssemblyFile } from '@suptron/runtime/browser';
import {
  angleOf,
  arcPath,
  chordControl,
  chordPath,
  normalizeAngle,
  polarToCartesian,
  quadraticPoint,
  radialPath,
  type Point,
} from '../../lib/geometry';

export interface Viewport {
  width: number;
  height: number;
}

export interface SlotPosition {
  name: string;
  index: number;
  angle: number;
  position: Point;
}

export type AttachedKind = 'subPilot' | 'sideSlot';

/** A Sub-pilot or a Side Slot drawn as a small plate outside its Slot's card. */
export interface AttachedPlate {
  slot: string;
  kind: AttachedKind;
  name: string;
  index: number;
  position: Point;
}

export interface ClockLayout {
  center: Point;
  radius: number;
  /** The clock's own coordinate box (cards and exit arrows included). */
  box: { width: number; height: number };
  start: { angle: 0; position: Point };
  slots: SlotPosition[];
  forwardArcs: { from: 'start' | string; to: string; path: string }[];
  loops: { from: string; to: string; limit: number; path: string; badgeAt: Point }[];
  exits: { slot: string; label: string; path: string; labelAt: Point }[];
  plusPositions: { index: number; position: Point; angle: number }[];
  /** Empty when no Slot carries Sub-pilots or Side Slots. */
  attached: AttachedPlate[];
  /** Per Slot and kind, the middle of its plates, for the line that ties them to the card. */
  attachedColumns: { slot: string; kind: AttachedKind; position: Point }[];
  fit(viewport: Viewport): { scale: number; translate: Point };
}

export const CARD_WIDTH = 184;
export const CARD_HEIGHT = 104;
export const CLOCK_MARGIN = 170;
export const MIN_RADIUS = 220;
export const RADIUS_PER_SLOT = 48;
export const MAX_FIT_SCALE = 1.25;
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 3;
export const PLATE_WIDTH = 112;
export const PLATE_HEIGHT = 22;
const PLATE_GAP = 4;
/** Between a card or an Exit label and the plates beyond it. */
const PLATE_OFFSET = 12;
/** Keeps plates off the Slot's radial axis, where the Exit arrow runs. */
const PLATE_AXIS_CLEARANCE = 10;
/** Room left around the outermost plate inside the clock's box. */
const PLATE_MARGIN = 24;
/** The box an Exit label is drawn in (see ExitArrow). */
export const EXIT_LABEL_WIDTH = 160;
export const EXIT_LABEL_HEIGHT = 24;
/** Ahead of the label: from the card's edge to the label's middle, the arrow's length aside. */
const EXIT_LABEL_GAP = 14;

export function clockRadius(slotCount: number): number {
  return Math.max(MIN_RADIUS, RADIUS_PER_SLOT * (slotCount + 1));
}

export function slotAngle(index: number, slotCount: number): number {
  return (360 * (index + 1)) / (slotCount + 1);
}

/** The pure layout of an Assembly as a clock: positions, arcs, chords and arrows, nothing stored. */
/** `core` gives the Loop limit of a Loop that states none; without it the system default is drawn. */
export function layoutClock(
  doc: Pick<AssemblyFile, 'slots'> & { core?: Pick<AssemblyFile['core'], 'defaultLoopLimit'> },
): ClockLayout {
  const n = doc.slots.length;
  const radius = clockRadius(n);
  // Plates may reach beyond the usual margin; the box grows to hold them.
  const reach = attachedLayout(doc, { x: 0, y: 0 }, radius).plates.reduce(
    (max, plate) =>
      Math.max(
        max,
        Math.abs(plate.position.x) + PLATE_WIDTH / 2 + PLATE_MARGIN,
        Math.abs(plate.position.y) + PLATE_HEIGHT / 2 + PLATE_MARGIN,
      ),
    0,
  );
  const half = Math.max(radius + CLOCK_MARGIN, reach);
  const center: Point = { x: half, y: half };
  const box = { width: half * 2, height: half * 2 };
  const slots: SlotPosition[] = doc.slots.map((slot, index) => {
    const angle = slotAngle(index, n);
    return { name: slot.name, index, angle, position: polarToCartesian(center, radius, angle) };
  });
  const byName = new Map(slots.map((s) => [s.name, s]));
  const start = { angle: 0 as const, position: polarToCartesian(center, radius, 0) };

  const forwardArcs: ClockLayout['forwardArcs'] = slots.map((slot, index) => {
    const fromAngle = index === 0 ? 0 : slots[index - 1]!.angle;
    return {
      from: index === 0 ? 'start' : slots[index - 1]!.name,
      to: slot.name,
      path: arcPath(center, radius, fromAngle, slot.angle),
    };
  });

  const loops: ClockLayout['loops'] = [];
  doc.slots.forEach((slot) => {
    if (!slot.loop) return;
    const from = byName.get(slot.name);
    const to = byName.get(slot.loop.target);
    if (!from || !to || to.index >= from.index) return;
    const control = chordControl(center, radius, from.angle, to.angle);
    loops.push({
      from: slot.name,
      to: slot.loop.target,
      limit: slot.loop.limit ?? doc.core?.defaultLoopLimit ?? DEFAULTS.core.defaultLoopLimit,
      path: chordPath(center, radius, from.angle, to.angle),
      badgeAt: quadraticPoint(from.position, control, to.position, 0.5),
    });
  });

  const exits: ClockLayout['exits'] = [];
  doc.slots.forEach((slot, index) => {
    const isLast = index === n - 1;
    if (!slot.exitPoint && !isLast) return;
    const position = slots[index]!;
    const length = radius / 4;
    exits.push({
      slot: slot.name,
      label: '',
      path: radialPath(center, radius + CARD_HEIGHT / 2, position.angle, length),
      labelAt: polarToCartesian(center, radius + CARD_HEIGHT / 2 + length + 14, position.angle),
    });
  });

  const plusPositions: ClockLayout['plusPositions'] = [];
  for (let index = 0; index <= n; index++) {
    const before = index === 0 ? 0 : slots[index - 1]!.angle;
    const after = index === n ? 360 : slots[index]!.angle;
    const angle = (before + after) / 2;
    plusPositions.push({ index, angle, position: polarToCartesian(center, radius, angle) });
  }

  const attached = attachedLayout(doc, center, radius);

  return {
    center,
    radius,
    box,
    start,
    slots,
    forwardArcs,
    loops,
    exits,
    plusPositions,
    attached: attached.plates,
    attachedColumns: attached.columns,
    fit: (viewport) => fitBox(box, viewport),
  };
}

/** How far a box of this half size reaches along a unit direction. */
function extentAlong(halfWidth: number, halfHeight: number, direction: Point): number {
  return halfWidth * Math.abs(direction.x) + halfHeight * Math.abs(direction.y);
}

/**
 * The plates of every Slot: a column per kind, outward from the card (beyond the Exit label of an
 * Exit Point), Side Slots on the side the ring runs on to and Sub-pilots on the side it comes
 * from, so the Slot's radial axis stays free for the Exit arrow.
 */
function attachedLayout(
  doc: Pick<AssemblyFile, 'slots'>,
  center: Point,
  radius: number,
): { plates: AttachedPlate[]; columns: ClockLayout['attachedColumns'] } {
  const n = doc.slots.length;
  const plates: AttachedPlate[] = [];
  const columns: ClockLayout['attachedColumns'] = [];
  doc.slots.forEach((slot, index) => {
    const lists: [AttachedKind, number, string[]][] = [
      ['subPilot', -1, (slot.subPilots ?? []).map((sub) => sub.unit)],
      ['sideSlot', 1, (slot.sideSlots ?? []).map(sideSlotName)],
    ];
    if (lists.every(([, , names]) => names.length === 0)) return;
    const angle = slotAngle(index, n);
    const position = polarToCartesian(center, radius, angle);
    const outward = polarToCartesian({ x: 0, y: 0 }, 1, angle);
    const across = { x: -outward.y, y: outward.x };
    const isExit = slot.exitPoint === true || index === n - 1;
    const exitLength = radius / 4;
    const clear = isExit
      ? CARD_HEIGHT / 2 +
        exitLength +
        EXIT_LABEL_GAP +
        extentAlong(EXIT_LABEL_WIDTH / 2, EXIT_LABEL_HEIGHT / 2, outward)
      : extentAlong(CARD_WIDTH / 2, CARD_HEIGHT / 2, outward);
    for (const [kind, side, names] of lists) {
      if (names.length === 0) continue;
      const halfHeight = (names.length * PLATE_HEIGHT + (names.length - 1) * PLATE_GAP) / 2;
      const along = clear + PLATE_OFFSET + extentAlong(PLATE_WIDTH / 2, halfHeight, outward);
      const aside =
        side * (PLATE_AXIS_CLEARANCE + extentAlong(PLATE_WIDTH / 2, halfHeight, across));
      const middle = {
        x: position.x + outward.x * along + across.x * aside,
        y: position.y + outward.y * along + across.y * aside,
      };
      columns.push({ slot: slot.name, kind, position: middle });
      names.forEach((name, i) => {
        plates.push({
          slot: slot.name,
          kind,
          name,
          index: i,
          position: {
            x: middle.x,
            y: middle.y - halfHeight + i * (PLATE_HEIGHT + PLATE_GAP) + PLATE_HEIGHT / 2,
          },
        });
      });
    }
  });
  return { plates, columns };
}

export function fitBox(
  box: { width: number; height: number },
  viewport: Viewport,
): { scale: number; translate: Point } {
  if (viewport.width <= 0 || viewport.height <= 0) return { scale: 1, translate: { x: 0, y: 0 } };
  const padding = 24;
  const scale = Math.min(
    (viewport.width - padding * 2) / box.width,
    (viewport.height - padding * 2) / box.height,
    MAX_FIT_SCALE,
  );
  const clamped = Math.max(MIN_SCALE, scale);
  return {
    scale: clamped,
    translate: {
      x: (viewport.width - box.width * clamped) / 2,
      y: (viewport.height - box.height * clamped) / 2,
    },
  };
}

/** Dashed chords from every earlier Slot whose output the selected Slot reads. */
export function contextChords(
  layout: ClockLayout,
  doc: Pick<AssemblyFile, 'slots'>,
  selected: string,
): { from: string; to: string; path: string }[] {
  const slot = doc.slots.find((s) => s.name === selected);
  const target = layout.slots.find((s) => s.name === selected);
  if (!slot || !target) return [];
  return (slot.context?.slotOutputs ?? []).flatMap((name) => {
    const from = layout.slots.find((s) => s.name === name);
    if (!from || from.index >= target.index) return [];
    return [
      {
        from: name,
        to: selected,
        path: chordPath(layout.center, layout.radius, from.angle, target.angle, 0.3),
      },
    ];
  });
}

/** The nearest Slot position for a dragged Slot, 0..n-1. */
export function positionIndexAt(layout: ClockLayout, angle: number): number {
  const n = layout.slots.length;
  if (n === 0) return 0;
  const step = 360 / (n + 1);
  const index = Math.round(normalizeAngle(angle) / step) - 1;
  return Math.min(n - 1, Math.max(0, index));
}

/** The nearest gap for a palette drop, 0..n (0 just after Start, n just before Start). */
export function insertionIndexAt(layout: ClockLayout, angle: number): number {
  const n = layout.slots.length;
  const step = 360 / (n + 1);
  const index = Math.floor(normalizeAngle(angle) / step);
  return Math.min(n, Math.max(0, index));
}

export { angleOf };
