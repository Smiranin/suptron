import {
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  Group,
  Points,
  PointsMaterial,
} from 'three';
import { sameLook, type Look } from '../scene/compare';
import { WORLD } from '../world/world';
import { Resources } from './resources';
import { powerFactor, SmoothNumber, wave } from './smooth';
import type { Ambience } from './view-object';

/** The light, the fog and the stars of the whole picture: they follow its power and its alarm. */
export interface AmbienceObject {
  readonly root: Group;
  readonly fog: Fog;
  apply(ambience: Ambience): void;
  frame(now: number, deltaSeconds: number): void;
  dispose(): void;
}

/** The seed of the star field: the same sky after every reload. */
const STAR_SEED = 0x5eed;
const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;
const UINT32 = 2 ** 32;

/** A repeatable stream of numbers between 0 and 1 (a linear congruential generator). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
    return state / UINT32;
  };
}

/** Points spread evenly over a sphere around the picture. */
function starPositions(): number[] {
  const { count, radius } = WORLD.stars;
  const random = seededRandom(STAR_SEED);
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const height = 2 * random() - 1;
    const turn = 2 * Math.PI * random();
    const across = Math.sqrt(1 - height * height);
    positions.push(
      radius * across * Math.cos(turn),
      radius * height,
      radius * across * Math.sin(turn),
    );
  }
  return positions;
}

/** Creates the lights, the fog and the stars of the Universe. */
export function createAmbienceObject(): AmbienceObject {
  const resources = new Resources();
  const root = new Group();
  const { ambient: ambientLook, key: keyLook, rim: rimLook } = WORLD.lights;
  const ambient = new AmbientLight(ambientLook.color, ambientLook.intensity);
  const key = new DirectionalLight(keyLook.color, keyLook.intensity);
  key.position.set(...keyLook.position);
  const rim = new DirectionalLight(rimLook.color, rimLook.intensity);
  rim.position.set(...rimLook.position);
  const starGeometry = resources.track(new BufferGeometry());
  starGeometry.setAttribute('position', new Float32BufferAttribute(starPositions(), 3));
  const starMaterial = resources.track(
    new PointsMaterial({
      color: WORLD.stars.color,
      size: WORLD.stars.size,
      sizeAttenuation: false,
      transparent: true,
      opacity: WORLD.stars.opacity,
      // The stars are far beyond the fog; they stay visible through it.
      fog: false,
    }),
  );
  const stars = new Points(starGeometry, starMaterial);
  root.add(ambient, key, rim, stars);
  const fog = new Fog(WORLD.fog.color);

  const restColor = new Color(ambientLook.color);
  const alarmColor = new Color(WORLD.palette.alarm);
  const power = new SmoothNumber(1);
  const alarm = new SmoothNumber(0);
  let applied: Look | null = null;

  return {
    root,
    fog,
    apply(ambience) {
      const look = { power: ambience.power, alarm: ambience.alarm };
      if (sameLook(applied, look)) return;
      applied = look;
      power.set(powerFactor(ambience.power));
      alarm.set(ambience.alarm ? WORLD.lights.alarmTint : 0);
    },
    frame(now, deltaSeconds) {
      const level = power.step(deltaSeconds);
      // The alarm breathes: the ambient light swings towards red and back.
      const tint = alarm.step(deltaSeconds) * wave(now, WORLD.motion.alarmBreathe.periodSeconds);
      ambient.color.copy(restColor).lerp(alarmColor, tint);
      ambient.intensity = ambientLook.intensity * level;
      key.intensity = keyLook.intensity * level;
      rim.intensity = rimLook.intensity * level;
    },
    dispose() {
      ambient.dispose();
      key.dispose();
      rim.dispose();
      resources.dispose();
    },
  };
}
