import { Group, Object3D, type Vector3 } from 'three';
import type { ExitPointPiece } from '../../missions/picture';
import { sameLook, type Look } from '../scene/compare';
import { MODELS } from '../world/models';
import { WORLD } from '../world/world';
import { matteMaterial, trackedMesh } from './materials';
import { Resources } from './resources';
import { powerFactor, SmoothColor, SmoothNumber } from './smooth';
import type { Ambience, Marks, ViewObject } from './view-object';

/** A gate behind its Slot's dock, facing out of the ring; it lights up when the Mission leaves through it. */
export function createExitPointObject(
  piece: ExitPointPiece,
  place: Vector3,
  outward: Vector3,
): ViewObject<ExitPointPiece> {
  const resources = new Resources();
  const root = new Group();
  root.position.copy(place);
  // The gate's opening faces along `outward`: the way out of the ring.
  root.rotation.y = Math.atan2(outward.x, outward.z);
  const material = matteMaterial(resources, WORLD.palette.hullDark, WORLD.palette.exit);
  const gate = trackedMesh(resources, MODELS.exitGate(), material);
  const anchor = new Object3D();
  anchor.position.y = WORLD.sizes.exitGate.radius + WORLD.sizes.exitGate.tube;
  root.add(gate, anchor);

  const color = new SmoothColor(WORLD.palette.exit);
  const glow = new SmoothNumber(0);
  let applied: Look | null = null;

  return {
    ref: piece.ref,
    root,
    targets: [],
    anchor,
    apply(next, _marks: Marks, ambience: Ambience) {
      const look = { lit: next.lit, power: ambience.power };
      if (sameLook(applied, look)) return;
      applied = look;
      color.set(next.lit ? WORLD.palette.exitLit : WORLD.palette.exit);
      glow.set(
        (next.lit ? WORLD.glow.exit.lit : WORLD.glow.exit.rest) * powerFactor(ambience.power),
      );
    },
    frame(_now, deltaSeconds) {
      material.emissive.copy(color.step(deltaSeconds));
      material.emissiveIntensity = glow.step(deltaSeconds);
    },
    dispose() {
      resources.dispose();
    },
  };
}
