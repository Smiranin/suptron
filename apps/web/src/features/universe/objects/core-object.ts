import type { MissionState } from '@suptron/runtime/browser';
import { Group, Object3D, PointLight } from 'three';
import type { CorePiece } from '../../missions/picture';
import type { LoadedAssets } from '../scene/assets';
import { sameLook, type Look } from '../scene/compare';
import { crystalHeight, MODELS } from '../world/models';
import { WORLD } from '../world/world';
import { lightMaterial, markRing, matteMaterial, paintedMesh, trackedMesh } from './materials';
import { Resources } from './resources';
import { powerFactor, SmoothColor, SmoothNumber, wave } from './smooth';
import type { Ambience, Marks, ViewObject } from './view-object';

/** The colour of the Core's light for each state of the Mission. */
const CORE_LIGHT: Record<MissionState, number> = {
  running: WORLD.palette.work,
  waiting_for_owner: WORLD.palette.waiting,
  waiting_for_usage: WORLD.palette.idle,
  needs_attention: WORLD.palette.failed,
  stopped: WORLD.palette.idle,
  completed: WORLD.palette.done,
};

/**
 * The Core in the centre: a crystal floating over a column on its plinth, with rings of light
 * around it. The crystal and the rings shine in the Mission's colour; while the Core works the
 * light pulses and the rings turn faster. The column and the plinth keep their own paint.
 */
export function createCoreObject(assets: LoadedAssets): ViewObject<CorePiece> {
  const resources = new Resources();
  const root = new Group();
  const plinth = paintedMesh(resources, assets.model('plinth'));
  const column = paintedMesh(resources, assets.model('coreColumn'));
  column.position.y = WORLD.sizes.plinth.height;
  const centre = crystalHeight();
  const crystalMaterial = matteMaterial(resources, WORLD.palette.crystal, WORLD.palette.idle);
  crystalMaterial.flatShading = true;
  const crystal = trackedMesh(resources, MODELS.crystal(), crystalMaterial);
  crystal.position.y = centre;
  // Each ring is tilted inside a pivot that turns about the vertical, so the ring sways round.
  const ringMaterial = lightMaterial(resources, WORLD.palette.idle);
  const pivots = WORLD.sizes.coreRings.map(({ radius, tilt }) => {
    const pivot = new Group();
    pivot.position.y = centre;
    const ring = trackedMesh(resources, MODELS.coreRing(radius), ringMaterial);
    ring.rotation.x = tilt;
    pivot.add(ring);
    return pivot;
  });
  const selectedRing = markRing(resources, WORLD.sizes.coreSelectedRing, WORLD.palette.selected);
  selectedRing.position.y = WORLD.sizes.markLift;
  const light = new PointLight(WORLD.palette.idle, 0, WORLD.glow.coreLight.distance);
  light.position.y = centre;
  const anchor = new Object3D();
  anchor.position.y = centre + WORLD.sizes.crystal.radius * WORLD.sizes.crystal.stretch;
  root.add(plinth, column, crystal, ...pivots, selectedRing, light, anchor);

  const color = new SmoothColor(WORLD.palette.idle);
  const glow = new SmoothNumber(0);
  const ring = new SmoothNumber(0);
  const spin = new SmoothNumber(WORLD.motion.coreSpin.ringsIdle);
  let pulsing = false;
  let applied: Look | null = null;

  return {
    ref: { kind: 'mission' },
    root,
    targets: [crystal, column, plinth],
    anchor,
    apply(piece, marks: Marks, ambience: Ambience) {
      const look = {
        state: piece.state,
        atWork: piece.atWork,
        selected: marks.selected,
        hovered: marks.hovered,
        power: ambience.power,
      };
      if (sameLook(applied, look)) return;
      applied = look;
      const base = piece.atWork ? WORLD.glow.core.atWork : WORLD.glow.core.idle;
      color.set(CORE_LIGHT[piece.state]);
      glow.set((base + (marks.hovered ? WORLD.glow.hovered : 0)) * powerFactor(ambience.power));
      ring.set(marks.selected ? WORLD.glow.mark.selected : 0);
      spin.set(piece.atWork ? WORLD.motion.coreSpin.ringsAtWork : WORLD.motion.coreSpin.ringsIdle);
      pulsing = piece.atWork;
    },
    frame(now, deltaSeconds) {
      const level = glow.step(deltaSeconds);
      const { corePulse, breathe, coreSpin } = WORLD.motion;
      // At work the crystal pulses; at rest its light only breathes.
      const swing = pulsing
        ? 1 - corePulse.depth * wave(now, corePulse.periodSeconds)
        : 1 - breathe.depth * wave(now, breathe.periodSeconds);
      const shade = color.step(deltaSeconds);
      crystalMaterial.emissive.copy(shade);
      crystalMaterial.emissiveIntensity = level * swing;
      ringMaterial.color.copy(shade);
      ringMaterial.opacity = Math.min(1, level * swing * WORLD.glow.coreRings);
      crystal.rotation.y += coreSpin.crystal * deltaSeconds;
      const turn = spin.step(deltaSeconds) * deltaSeconds;
      // Neighbouring rings turn opposite ways.
      pivots.forEach((pivot, i) => {
        pivot.rotation.y += i % 2 === 0 ? turn : -turn;
      });
      light.color.copy(shade);
      light.intensity = level * swing * WORLD.glow.coreLight.intensity;
      selectedRing.material.opacity = ring.step(deltaSeconds);
    },
    dispose() {
      light.dispose();
      resources.dispose();
    },
  };
}
