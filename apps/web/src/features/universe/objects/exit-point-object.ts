import { Group, Object3D, type Vector3 } from 'three';
import type { ExitPointPiece } from '../../missions/picture';
import type { LoadedAssets } from '../scene/assets';
import { sameLook, type Look } from '../scene/compare';
import { WORLD } from '../world/world';
import { paintedMesh, setGlow } from './materials';
import { Resources } from './resources';
import { powerFactor, SmoothColor, SmoothNumber } from './smooth';
import type { Ambience, Marks, ViewObject } from './view-object';

/** A gate behind its Slot's dock, facing out of the ring; it lights up when the Mission leaves through it. */
export function createExitPointObject(
  piece: ExitPointPiece,
  place: Vector3,
  outward: Vector3,
  assets: LoadedAssets,
): ViewObject<ExitPointPiece> {
  const resources = new Resources();
  const root = new Group();
  root.position.copy(place);
  // The gate's opening faces along `outward`: the way out of the ring.
  root.rotation.y = Math.atan2(outward.x, outward.z);
  const gate = paintedMesh(resources, assets.model('exitGate'), {
    kind: 'colour',
    colour: WORLD.palette.exit,
  });
  const anchor = new Object3D();
  // The gate floats centred on its place, so its top is half its height up.
  anchor.position.y = WORLD.sizes.exitGate.height / 2;
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
      const shade = color.step(deltaSeconds);
      setGlow(gate, glow.step(deltaSeconds), shade);
    },
    dispose() {
      resources.dispose();
    },
  };
}
