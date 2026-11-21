import type { MissionState } from '@suptron/runtime/browser';
import { Group, Object3D, PointLight } from 'three';
import type { CorePiece } from '../../missions/picture';
import { sameLook, type Look } from '../scene/compare';
import { MODELS } from '../world/models';
import { WORLD } from '../world/world';
import { markRing, matteMaterial, trackedMesh } from './materials';
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

/** The dark monolith in the centre: its light follows the Mission, it pulses while the Core works. */
export function createCoreObject(): ViewObject<CorePiece> {
  const resources = new Resources();
  const root = new Group();
  const plinth = trackedMesh(
    resources,
    MODELS.plinth(),
    matteMaterial(resources, WORLD.palette.dock),
  );
  const monolithMaterial = matteMaterial(resources, WORLD.palette.monolith, WORLD.palette.idle);
  const monolith = trackedMesh(resources, MODELS.monolith(), monolithMaterial);
  monolith.position.y = WORLD.sizes.plinth.height;
  const selectedRing = markRing(resources, WORLD.sizes.coreSelectedRing, WORLD.palette.selected);
  selectedRing.position.y = WORLD.sizes.markLift;
  const light = new PointLight(WORLD.palette.idle, 0, WORLD.glow.coreLight.distance);
  light.position.y = WORLD.glow.coreLight.height;
  const anchor = new Object3D();
  anchor.position.y = WORLD.sizes.plinth.height + WORLD.sizes.monolith.height;
  root.add(plinth, monolith, selectedRing, light, anchor);

  const color = new SmoothColor(WORLD.palette.idle);
  const glow = new SmoothNumber(0);
  const ring = new SmoothNumber(0);
  let pulsing = false;
  let applied: Look | null = null;

  return {
    ref: { kind: 'mission' },
    root,
    targets: [monolith, plinth],
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
      pulsing = piece.atWork;
    },
    frame(now, deltaSeconds) {
      const level = glow.step(deltaSeconds);
      const { corePulse, breathe } = WORLD.motion;
      // At work the monolith pulses; at rest its light only breathes.
      const swing = pulsing
        ? 1 - corePulse.depth * wave(now, corePulse.periodSeconds)
        : 1 - breathe.depth * wave(now, breathe.periodSeconds);
      const shade = color.step(deltaSeconds);
      monolithMaterial.emissive.copy(shade);
      monolithMaterial.emissiveIntensity = level * swing;
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
