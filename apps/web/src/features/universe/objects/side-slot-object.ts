import { Group, Object3D, type Vector3 } from 'three';
import type { SideSlotPiece } from '../../missions/picture';
import { sameLook, type Look } from '../scene/compare';
import { MODELS } from '../world/models';
import { WORLD } from '../world/world';
import { markRing, matteMaterial, trackedMesh } from './materials';
import { Resources } from './resources';
import { powerFactor, SmoothColor, SmoothNumber } from './smooth';
import type { Ambience, Marks, ViewObject } from './view-object';

/** The light of a Side Slot's pad for each status it can have. */
const SIDE_SLOT_LIGHT: Record<SideSlotPiece['status'], { color: number; glow: number }> = {
  idle: { color: WORLD.palette.idle, glow: WORLD.glow.off },
  waiting: { color: WORLD.palette.idle, glow: WORLD.glow.dim },
  running: { color: WORLD.palette.work, glow: WORLD.glow.on },
  done: { color: WORLD.palette.done, glow: WORLD.glow.on },
  failed: { color: WORLD.palette.failed, glow: WORLD.glow.on },
  interrupted: { color: WORLD.palette.waiting, glow: WORLD.glow.dim },
};

/** A small shuttle on its own pad beside its Slot's dock; the pad's light tells its status. */
export function createSideSlotObject(
  piece: SideSlotPiece,
  place: Vector3,
): ViewObject<SideSlotPiece> {
  const resources = new Resources();
  const root = new Group();
  root.position.copy(place);
  const padMaterial = matteMaterial(resources, WORLD.palette.dock);
  const pad = trackedMesh(resources, MODELS.sideSlotPad(), padMaterial);
  const shuttleMaterial = matteMaterial(resources, WORLD.palette.hull, WORLD.palette.work);
  const shuttle = trackedMesh(resources, MODELS.sideSlotShuttle(), shuttleMaterial);
  const selectedRing = markRing(resources, WORLD.sizes.padSelectedRing, WORLD.palette.selected);
  selectedRing.position.y = WORLD.sizes.markLift;
  const anchor = new Object3D();
  anchor.position.y = WORLD.sizes.sideSlotPad.height + WORLD.sizes.sideSlotShuttle.height;
  root.add(pad, shuttle, selectedRing, anchor);

  const color = new SmoothColor(WORLD.palette.idle);
  const glow = new SmoothNumber(0);
  const engines = new SmoothNumber(0);
  const ring = new SmoothNumber(0);
  let applied: Look | null = null;

  return {
    ref: piece.ref,
    root,
    targets: [shuttle, pad],
    anchor,
    apply(next, marks: Marks, ambience: Ambience) {
      const look = {
        status: next.status,
        selected: marks.selected,
        hovered: marks.hovered,
        power: ambience.power,
      };
      if (sameLook(applied, look)) return;
      applied = look;
      const light = SIDE_SLOT_LIGHT[next.status];
      const power = powerFactor(ambience.power);
      const hovered = marks.hovered ? WORLD.glow.hovered : 0;
      color.set(light.color);
      glow.set((light.glow + hovered) * power);
      engines.set(((next.status === 'running' ? WORLD.glow.on : WORLD.glow.off) + hovered) * power);
      ring.set(marks.selected ? WORLD.glow.mark.selected : 0);
    },
    frame(_now, deltaSeconds) {
      padMaterial.emissive.copy(color.step(deltaSeconds));
      padMaterial.emissiveIntensity = glow.step(deltaSeconds);
      shuttleMaterial.emissiveIntensity = engines.step(deltaSeconds);
      selectedRing.material.opacity = ring.step(deltaSeconds);
    },
    dispose() {
      resources.dispose();
    },
  };
}
