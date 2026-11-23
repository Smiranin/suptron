import { Group, Object3D } from 'three';
import type {
  ExitPointPiece,
  LoopPiece,
  SideSlotPiece,
  SlotPiece,
  SubPilotPiece,
} from '../../missions/picture';
import type { SlotVisualState } from '../../missions/model/types';
import type { LoadedAssets } from '../scene/assets';
import { sameLook, type Look } from '../scene/compare';
import type { LoopPlace, SlotPlace } from '../scene/layout';
import { MODELS } from '../world/models';
import { WORLD } from '../world/world';
import { createExitPointObject } from './exit-point-object';
import { createLoopObject } from './loop-object';
import {
  lightMaterial,
  markRing,
  matteMaterial,
  paintedMesh,
  setGlow,
  trackedMesh,
} from './materials';
import { Resources } from './resources';
import { powerFactor, SmoothColor, SmoothNumber, wave } from './smooth';
import { createSideSlotObject } from './side-slot-object';
import { createSubPilotObject } from './sub-pilot-object';
import type { Ambience, Marks, ViewObject } from './view-object';

/** The light of a dock for each state of its Slot. */
const DOCK_LIGHT: Record<SlotVisualState, { color: number; glow: number }> = {
  pending: { color: WORLD.palette.idle, glow: WORLD.glow.dim },
  running: { color: WORLD.palette.work, glow: WORLD.glow.on },
  done: { color: WORLD.palette.done, glow: WORLD.glow.on },
  failed: { color: WORLD.palette.failed, glow: WORLD.glow.on },
};

/** The colour of the beacon over a dock for each marker. */
const BEACON_COLOR: Record<NonNullable<SlotPiece['marker']>, number> = {
  waiting: WORLD.palette.waiting,
  attention: WORLD.palette.failed,
};

/** A Slot's object with the objects of what belongs to it, which it creates and releases. */
export interface SlotObject extends ViewObject<SlotPiece> {
  /** Every child, for the scene's index. */
  readonly children: readonly ViewObject<
    SubPilotPiece | SideSlotPiece | LoopPiece | ExitPointPiece
  >[];
  subPilot(unit: string): ViewObject<SubPilotPiece> | undefined;
  sideSlot(name: string): ViewObject<SideSlotPiece> | undefined;
  readonly loop: ViewObject<LoopPiece> | undefined;
  readonly exitPoint: ViewObject<ExitPointPiece> | undefined;
}

/** The light of the route into a dock for each state of its Slot. */
const ROUTE_LIGHT: Record<SlotVisualState, { color: number; glow: number }> = {
  pending: { color: WORLD.palette.route, glow: WORLD.glow.route.ahead },
  running: { color: WORLD.palette.work, glow: WORLD.glow.route.reached },
  done: { color: WORLD.palette.done, glow: WORLD.glow.route.reached },
  failed: { color: WORLD.palette.failed, glow: WORLD.glow.route.reached },
};

/**
 * A dock with a ship: the ship is the one its Unit flies, the dock's lights tell the Slot's state,
 * a beam on the ground ties a running dock to the Core, a beacon calls the Commander.
 */
export function createSlotObject(
  piece: SlotPiece,
  place: SlotPlace,
  loopPlace: LoopPlace | undefined,
  assets: LoadedAssets,
): SlotObject {
  const resources = new Resources();
  const root = new Group();
  const body = new Group();
  body.position.copy(place.dock);
  root.add(body);

  const dock = paintedMesh(resources, assets.model('dock'));
  const lightsMaterial = matteMaterial(resources, WORLD.palette.dockEdge, WORLD.palette.idle);
  const dockLights = trackedMesh(resources, MODELS.dockLights(), lightsMaterial);
  // At work the ship only grows lighter, in its own colours; its dock lights up in the state's.
  const ship = paintedMesh(resources, assets.ship(piece.unit), { kind: 'paint' });
  // The ship's nose points the way the Mission goes round the ring.
  ship.rotation.y = Math.atan2(place.along.x, place.along.z);
  const markHeight = WORLD.sizes.dock.height + WORLD.sizes.markLift;
  const currentRing = markRing(resources, WORLD.sizes.currentRing, WORLD.palette.current);
  currentRing.position.y = markHeight;
  const selectedRing = markRing(resources, WORLD.sizes.selectedRing, WORLD.palette.selected);
  selectedRing.position.y = markHeight;
  const beaconMaterial = lightMaterial(resources, WORLD.palette.waiting);
  const beacon = trackedMesh(resources, MODELS.beacon(), beaconMaterial);
  beacon.position.y = WORLD.sizes.beacon.height;
  const anchor = new Object3D();
  anchor.position.y = WORLD.layout.slotLabelHeight;
  body.add(dock, dockLights, ship, currentRing, selectedRing, beacon, anchor);

  // The beam lies on the ground from the dock to the Core; both platforms cover its ends.
  const beamMaterial = lightMaterial(resources, WORLD.palette.work);
  const beam = trackedMesh(resources, MODELS.beam(place.dock), beamMaterial);
  beam.position.y = WORLD.sizes.markLift;
  // Drawn after the ground it lies on, so it is never hidden in it.
  beam.renderOrder = 1;
  root.add(beam);

  // The route from the Slot before lights up once the Mission reaches this dock.
  const routeMaterial = lightMaterial(resources, WORLD.palette.route);
  if (place.route) {
    const { radius, from, to } = place.route;
    const route = trackedMesh(resources, MODELS.routeArc(radius, from, to), routeMaterial);
    route.position.y = WORLD.sizes.markLift;
    // Drawn after the ground it lies on, so it is never hidden in it.
    route.renderOrder = 1;
    root.add(route);
  }

  const subPilots = new Map(
    piece.subPilots.map((sub, i) => [
      sub.unit,
      createSubPilotObject(
        sub,
        place.subPilots[i]!,
        (piece.index + i + 1) * WORLD.motion.hoverPhaseStep,
        assets,
      ),
    ]),
  );
  const sideSlots = new Map(
    piece.sideSlots.map((side, i) => [side.name, createSideSlotObject(side, place.sideSlots[i]!)]),
  );
  const loop = piece.loop && loopPlace ? createLoopObject(piece.loop, loopPlace) : undefined;
  const exitPoint =
    piece.exitPoint && place.exitPoint
      ? createExitPointObject(piece.exitPoint, place.exitPoint, place.outward, assets)
      : undefined;
  const children = [
    ...subPilots.values(),
    ...sideSlots.values(),
    ...(loop ? [loop] : []),
    ...(exitPoint ? [exitPoint] : []),
  ];
  for (const child of children) root.add(child.root);

  const lightColor = new SmoothColor(WORLD.palette.idle);
  const lightGlow = new SmoothNumber(0);
  const dockGlow = new SmoothNumber(0);
  const shipGlow = new SmoothNumber(0);
  const routeColor = new SmoothColor(WORLD.palette.route);
  const routeLevel = new SmoothNumber(0);
  const beamLevel = new SmoothNumber(0);
  const current = new SmoothNumber(0);
  const selected = new SmoothNumber(0);
  const beaconLevel = new SmoothNumber(0);
  const hoverPhase = piece.index * WORLD.motion.hoverPhaseStep;
  let applied: Look | null = null;

  return {
    ref: piece.ref,
    root,
    targets: [ship, dock],
    anchor,
    children,
    subPilot: (unit) => subPilots.get(unit),
    sideSlot: (name) => sideSlots.get(name),
    loop,
    exitPoint,
    apply(next, marks: Marks, ambience: Ambience) {
      const look = {
        state: next.state,
        current: next.current,
        marker: next.marker,
        selected: marks.selected,
        hovered: marks.hovered,
        power: ambience.power,
      };
      if (sameLook(applied, look)) return;
      applied = look;
      const power = powerFactor(ambience.power);
      const hovered = marks.hovered ? WORLD.glow.hovered : 0;
      const light = DOCK_LIGHT[next.state];
      const running = next.state === 'running';
      lightColor.set(light.color);
      lightGlow.set((light.glow + hovered) * power);
      shipGlow.set(running ? WORLD.glow.shipRunning * power : 0);
      const route = ROUTE_LIGHT[next.state];
      routeColor.set(route.color);
      routeLevel.set(route.glow * power);
      dockGlow.set(
        ((running ? WORLD.glow.dockRunning : 0) + (marks.hovered ? WORLD.glow.dockHovered : 0)) *
          power,
      );
      beamLevel.set(running ? WORLD.glow.beam * power : 0);
      current.set(next.current ? WORLD.glow.mark.current : 0);
      selected.set(
        marks.selected ? WORLD.glow.mark.selected : marks.hovered ? WORLD.glow.mark.hovered : 0,
      );
      if (next.marker) beaconMaterial.color.setHex(BEACON_COLOR[next.marker]);
      beaconLevel.set(next.marker ? WORLD.glow.beacon : 0);
    },
    frame(now, deltaSeconds) {
      const { hover, beaconBlink, breathe } = WORLD.motion;
      ship.position.y =
        WORLD.layout.shipHeight +
        hover.amplitude * (wave(now, hover.periodSeconds, hoverPhase) - 0.5);
      const breath = 1 - breathe.depth * wave(now, breathe.periodSeconds, hoverPhase);
      const shade = lightColor.step(deltaSeconds);
      lightsMaterial.emissive.copy(shade);
      setGlow(dock, dockGlow.step(deltaSeconds), shade);
      setGlow(ship, shipGlow.step(deltaSeconds));
      lightsMaterial.emissiveIntensity = lightGlow.step(deltaSeconds) * breath;
      beamMaterial.opacity = beamLevel.step(deltaSeconds) * breath;
      routeMaterial.color.copy(routeColor.step(deltaSeconds));
      routeMaterial.opacity = routeLevel.step(deltaSeconds) * breath;
      currentRing.material.opacity = current.step(deltaSeconds);
      selectedRing.material.opacity = selected.step(deltaSeconds);
      beaconMaterial.opacity =
        beaconLevel.step(deltaSeconds) * wave(now, beaconBlink.periodSeconds);
      for (const child of children) child.frame(now, deltaSeconds);
    },
    dispose() {
      for (const child of children) child.dispose();
      resources.dispose();
    },
  };
}
