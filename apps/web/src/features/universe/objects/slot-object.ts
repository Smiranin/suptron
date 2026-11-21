import { Group, Object3D, Quaternion, Vector3 } from 'three';
import type {
  ExitPointPiece,
  LoopPiece,
  SideSlotPiece,
  SlotPiece,
  SubPilotPiece,
} from '../../missions/picture';
import type { SlotVisualState } from '../../missions/model/types';
import { sameLook, type Look } from '../scene/compare';
import type { LoopPlace, SlotPlace } from '../scene/layout';
import { MODELS, SHIP_MODELS } from '../world/models';
import { shipFor } from '../world/ships';
import { WORLD } from '../world/world';
import { createExitPointObject } from './exit-point-object';
import { createLoopObject } from './loop-object';
import { lightMaterial, markRing, matteMaterial, trackedMesh } from './materials';
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

/** Where the beam from a running ship ends: high on the monolith. */
function beamTarget(): Vector3 {
  return new Vector3(
    0,
    WORLD.sizes.plinth.height + WORLD.sizes.monolith.height * WORLD.layout.beamOnMonolith,
    0,
  );
}

/**
 * A dock with a ship: the ship is the one its Unit flies, the dock's lights tell the Slot's state,
 * a beam ties a running ship to the Core, a beacon calls the Commander.
 */
export function createSlotObject(
  piece: SlotPiece,
  place: SlotPlace,
  loopPlace: LoopPlace | undefined,
): SlotObject {
  const resources = new Resources();
  const root = new Group();
  const body = new Group();
  body.position.copy(place.dock);
  root.add(body);

  const dock = trackedMesh(resources, MODELS.dock(), matteMaterial(resources, WORLD.palette.dock));
  const lightsMaterial = matteMaterial(resources, WORLD.palette.dockEdge, WORLD.palette.idle);
  const dockLights = trackedMesh(resources, MODELS.dockLights(), lightsMaterial);
  const shipMaterial = matteMaterial(resources, WORLD.palette.hull, WORLD.palette.work);
  const shipModel = SHIP_MODELS[shipFor(piece.unit)]!;
  const ship = trackedMesh(resources, shipModel(), shipMaterial);
  ship.scale.setScalar(WORLD.sizes.ship);
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

  const beamMaterial = lightMaterial(resources, WORLD.palette.work);
  const beam = trackedMesh(resources, MODELS.beam(), beamMaterial);
  const beamStart = place.dock.clone().setY(WORLD.layout.shipHeight);
  const beamLine = beamTarget().sub(beamStart);
  beam.position.copy(beamStart).addScaledVector(beamLine, 0.5);
  beam.quaternion.copy(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), beamLine.clone().normalize()),
  );
  beam.scale.y = beamLine.length();
  root.add(beam);

  const subPilots = new Map(
    piece.subPilots.map((sub, i) => [
      sub.unit,
      createSubPilotObject(
        sub,
        place.subPilots[i]!,
        (piece.index + i + 1) * WORLD.motion.hoverPhaseStep,
      ),
    ]),
  );
  const sideSlots = new Map(
    piece.sideSlots.map((side, i) => [side.name, createSideSlotObject(side, place.sideSlots[i]!)]),
  );
  const loop = piece.loop && loopPlace ? createLoopObject(piece.loop, loopPlace) : undefined;
  const exitPoint =
    piece.exitPoint && place.exitPoint
      ? createExitPointObject(piece.exitPoint, place.exitPoint, place.outward)
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
  const engines = new SmoothNumber(0);
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
      engines.set(((running ? WORLD.glow.on : WORLD.glow.off) + hovered) * power);
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
      lightsMaterial.emissive.copy(lightColor.step(deltaSeconds));
      lightsMaterial.emissiveIntensity = lightGlow.step(deltaSeconds) * breath;
      shipMaterial.emissiveIntensity = engines.step(deltaSeconds);
      beamMaterial.opacity = beamLevel.step(deltaSeconds) * breath;
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
