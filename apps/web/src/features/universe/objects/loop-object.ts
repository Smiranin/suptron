import { Color, CubicBezierCurve3, Group, Object3D, TubeGeometry } from 'three';
import type { LoopPiece } from '../../missions/picture';
import { sameLook, type Look } from '../scene/compare';
import type { LoopPlace } from '../scene/layout';
import { WORLD } from '../world/world';
import { matteMaterial, trackedMesh } from './materials';
import { Resources } from './resources';
import { powerFactor, SmoothNumber } from './smooth';
import type { Ambience, Marks, ViewObject } from './view-object';

/** The colour a fired Loop flashes towards; only read, never changed. */
const FLASH_COLOR = new Color(WORLD.palette.loopFired);

/**
 * An arc of energy from a looping Slot back to its target. It flashes when the Loop fires: for as
 * long as the world says after `firedAt`, so a reload in the middle of a flash shows the rest of it.
 */
export function createLoopObject(piece: LoopPiece, place: LoopPlace): ViewObject<LoopPiece> {
  const resources = new Resources();
  const root = new Group();
  const curve = new CubicBezierCurve3(place.from, place.control1, place.control2, place.to);
  const material = matteMaterial(resources, WORLD.palette.hullDark, WORLD.palette.loop);
  const arc = trackedMesh(
    resources,
    new TubeGeometry(
      curve,
      WORLD.sizes.loop.segments,
      WORLD.sizes.loop.tube,
      WORLD.sizes.loop.sides,
    ),
    material,
  );
  const anchor = new Object3D();
  anchor.position.copy(curve.getPoint(0.5));
  root.add(arc, anchor);

  const rest = new SmoothNumber(0);
  let firedAt: number | undefined;
  let power = 1;
  let applied: Look | null = null;

  return {
    ref: piece.ref,
    root,
    targets: [],
    anchor,
    apply(next, _marks: Marks, ambience: Ambience) {
      const look = { firedAt: next.firedAt, power: ambience.power };
      if (sameLook(applied, look)) return;
      applied = look;
      firedAt = next.firedAt;
      power = powerFactor(ambience.power);
      rest.set(WORLD.glow.loop.rest * power);
    },
    frame(now, deltaSeconds) {
      const level = rest.step(deltaSeconds);
      const since = firedAt === undefined ? Infinity : now - firedAt;
      const flash =
        since >= 0 && since < WORLD.motion.loopFlashMs ? 1 - since / WORLD.motion.loopFlashMs : 0;
      material.emissive.setHex(WORLD.palette.loop).lerp(FLASH_COLOR, flash);
      material.emissiveIntensity = level + flash * WORLD.glow.loop.fired * power;
    },
    dispose() {
      resources.dispose();
    },
  };
}
