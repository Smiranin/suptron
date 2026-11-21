import { Group, Object3D, type Vector3 } from 'three';
import type { SubPilotPiece } from '../../missions/picture';
import { sameLook, type Look } from '../scene/compare';
import { MODELS } from '../world/models';
import { WORLD } from '../world/world';
import { markRing, matteMaterial, trackedMesh } from './materials';
import { Resources } from './resources';
import { powerFactor, SmoothColor, SmoothNumber, wave } from './smooth';
import type { Ambience, Marks, ViewObject } from './view-object';

/** The light of a Sub-pilot: dark until called, lit while it works, a quiet green once it returned. */
const SUB_PILOT_LIGHT: Record<SubPilotPiece['status'], { color: number; glow: number }> = {
  idle: { color: WORLD.palette.idle, glow: WORLD.glow.off },
  running: { color: WORLD.palette.work, glow: WORLD.glow.on },
  done: { color: WORLD.palette.done, glow: WORLD.glow.dim },
};

/** A small drone by its Slot's ship, lit while the Pilot has called it. */
export function createSubPilotObject(
  piece: SubPilotPiece,
  place: Vector3,
  phase: number,
): ViewObject<SubPilotPiece> {
  const resources = new Resources();
  const root = new Group();
  root.position.copy(place);
  const bodyMaterial = matteMaterial(resources, WORLD.palette.hull);
  const body = trackedMesh(resources, MODELS.subPilot(), bodyMaterial);
  const selectedRing = markRing(resources, WORLD.sizes.smallSelectedRing, WORLD.palette.selected);
  const anchor = new Object3D();
  anchor.position.y = WORLD.sizes.subPilot.radius * 2;
  root.add(body, selectedRing, anchor);

  const color = new SmoothColor(WORLD.palette.idle);
  const glow = new SmoothNumber(0);
  const ring = new SmoothNumber(0);
  let running = false;
  let applied: Look | null = null;

  return {
    ref: piece.ref,
    root,
    targets: [body],
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
      const light = SUB_PILOT_LIGHT[next.status];
      color.set(light.color);
      glow.set(
        (light.glow + (marks.hovered ? WORLD.glow.hovered : 0)) * powerFactor(ambience.power),
      );
      ring.set(marks.selected ? WORLD.glow.mark.selected : 0);
      running = next.status === 'running';
    },
    frame(now, deltaSeconds) {
      const { hover, subPilotSpin } = WORLD.motion;
      body.position.y = hover.amplitude * (wave(now, hover.periodSeconds, phase) - 0.5);
      // A called drone turns slowly, so work reads even where its light is small.
      if (running) body.rotation.y += subPilotSpin * deltaSeconds;
      bodyMaterial.emissive.copy(color.step(deltaSeconds));
      bodyMaterial.emissiveIntensity = glow.step(deltaSeconds);
      selectedRing.material.opacity = ring.step(deltaSeconds);
    },
    dispose() {
      resources.dispose();
    },
  };
}
