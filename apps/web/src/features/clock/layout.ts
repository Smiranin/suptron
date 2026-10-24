import type { AssemblyFile } from '@suptron/runtime/browser';
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

export function clockRadius(slotCount: number): number {
  return Math.max(MIN_RADIUS, RADIUS_PER_SLOT * (slotCount + 1));
}

export function slotAngle(index: number, slotCount: number): number {
  return (360 * (index + 1)) / (slotCount + 1);
}

/** The pure layout of an Assembly as a clock: positions, arcs, chords and arrows, nothing stored. */
export function layoutClock(doc: Pick<AssemblyFile, 'slots'>): ClockLayout {
  const n = doc.slots.length;
  const radius = clockRadius(n);
  const half = radius + CLOCK_MARGIN;
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
      limit: slot.loop.limit,
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
    fit: (viewport) => fitBox(box, viewport),
  };
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
