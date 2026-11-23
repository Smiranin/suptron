import { Vector3 } from 'three';
import type { MissionPicture, SlotPiece } from '../../missions/picture';
import { WORLD } from '../world/world';

/** Where a Slot stands and what belongs to it, all in world coordinates on the ground plane. */
export interface SlotPlace {
  /** The centre of the dock. */
  dock: Vector3;
  /** Radians clockwise from the far side, as on the clock. */
  angle: number;
  /** A unit vector from the Core out through the dock. */
  outward: Vector3;
  /** A unit vector along the ring, the way the Mission goes. */
  along: Vector3;
  /** One position per Sub-pilot, in the Slot's order. */
  subPilots: Vector3[];
  /** One pad per Side Slot, in the Slot's order. */
  sideSlots: Vector3[];
  /** The middle of the gate of the Exit Point, when the Slot has one. */
  exitPoint?: Vector3;
  /** The route into the dock along the ring, from the Slot before; the first Slot has none. */
  route?: { radius: number; from: number; to: number };
}

/** The curve of a Loop on the ground: from its Slot's dock to its target's, inside the ring. */
export interface LoopPlace {
  from: Vector3;
  control1: Vector3;
  control2: Vector3;
  to: Vector3;
}

export interface UniverseLayout {
  radius: number;
  /** By Slot name. */
  slots: ReadonlyMap<string, SlotPlace>;
  /** By the name of the looping Slot; a Loop whose target is not in the Assembly has none. */
  loops: ReadonlyMap<string, LoopPlace>;
  /** A sphere on the ground that holds everything, for fitting the whole Assembly into view. */
  bounds: { center: Vector3; radius: number };
}

/** The radius of the ring of docks: it grows with the number of Slots. */
function ringRadius(slotCount: number): number {
  const { minRadius, radiusPerSlot } = WORLD.layout;
  return Math.max(minRadius, radiusPerSlot * (slotCount + 1));
}

/** The angle of a Slot: the ring starts at the far side and leaves a gap there, as on the clock. */
function slotAngle(index: number, slotCount: number): number {
  return (2 * Math.PI * (index + 1)) / (slotCount + 1);
}

/** The point at `distance` from `origin` along `direction`, plus `aside` along `across`. */
function offset(
  origin: Vector3,
  direction: Vector3,
  distance: number,
  across: Vector3,
  aside: number,
): Vector3 {
  return origin.clone().addScaledVector(direction, distance).addScaledVector(across, aside);
}

/** The dock of a Slot and the places of its Sub-pilots, Side Slots and Exit Point. */
function placeSlot(slot: SlotPiece, slotCount: number, radius: number): SlotPlace {
  const layout = WORLD.layout;
  const angle = slotAngle(slot.index, slotCount);
  const outward = new Vector3(Math.sin(angle), 0, -Math.cos(angle));
  const along = new Vector3(Math.cos(angle), 0, Math.sin(angle));
  const dock = outward.clone().multiplyScalar(radius);
  // The route stops short of both docks, so it never runs under a platform.
  const margin = (WORLD.sizes.dock.radius + WORLD.sizes.route.gap) / radius;
  const from = slotAngle(slot.index - 1, slotCount) + margin;
  const to = angle - margin;
  const subPilots = slot.subPilots.map((_, i) =>
    offset(
      dock,
      outward,
      layout.subPilotOutward + i * layout.subPilotStep,
      along,
      -layout.subPilotAside,
    ).setY(layout.subPilotHeight),
  );
  const sideSlots = slot.sideSlots.map((_, i) =>
    offset(
      dock,
      outward,
      layout.sideSlotOutward + i * layout.sideSlotStep,
      along,
      layout.sideSlotAside,
    ),
  );
  return {
    dock,
    angle,
    outward,
    along,
    subPilots,
    sideSlots,
    ...(slot.exitPoint && {
      exitPoint: offset(dock, outward, layout.exitOutward, along, 0).setY(layout.exitHeight),
    }),
    ...(slot.index > 0 && to > from && { route: { radius, from, to } }),
  };
}

/** The curve of a Loop on the ground from one dock back to another, bowing in towards the Core. */
function placeLoop(from: Vector3, to: Vector3): LoopPlace {
  // The control points are pulled towards the Core, so the curve runs inside the ring.
  const pull = (point: Vector3) => point.clone().multiplyScalar(1 - WORLD.layout.loopInward);
  return { from: from.clone(), control1: pull(from), control2: pull(to), to: to.clone() };
}

/**
 * Places the Core in the centre and the docks around it in Assembly order, with what belongs to
 * each dock beside it. Pure: the same picture gives the same layout.
 */
export function layoutUniverse(picture: MissionPicture): UniverseLayout {
  const count = picture.slots.length;
  const radius = ringRadius(count);
  const slots = new Map(picture.slots.map((slot) => [slot.name, placeSlot(slot, count, radius)]));
  const loops = new Map<string, LoopPlace>();
  for (const slot of picture.slots) {
    const from = slots.get(slot.name);
    const to = slot.loop && slots.get(slot.loop.to);
    if (from && to) loops.set(slot.name, placeLoop(from.dock, to.dock));
  }
  let reach = radius;
  for (const place of slots.values()) {
    for (const point of [place.dock, ...place.subPilots, ...place.sideSlots]) {
      reach = Math.max(reach, Math.hypot(point.x, point.z));
    }
    if (place.exitPoint) reach = Math.max(reach, Math.hypot(place.exitPoint.x, place.exitPoint.z));
  }
  return {
    radius,
    slots,
    loops,
    bounds: { center: new Vector3(0, 0, 0), radius: reach + WORLD.layout.fitMargin },
  };
}
