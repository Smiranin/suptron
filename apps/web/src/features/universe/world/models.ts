import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  RingGeometry,
  SphereGeometry,
  TetrahedronGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { WORLD } from './world';

/** Builds a fresh geometry; the object that asked for it owns and disposes it. */
export type ShapeFactory = () => BufferGeometry;

const QUARTER_TURN = Math.PI / 2;

/**
 * What draws each thing of the world. For now every model is a simple shape built in code, so
 * the whole picture works before a model file exists; ships point their nose along +z.
 */
export const MODELS = {
  monolith: () => {
    const { width, height, depth } = WORLD.sizes.monolith;
    return new BoxGeometry(width, height, depth).translate(0, height / 2, 0);
  },
  plinth: () => {
    const { radius, height } = WORLD.sizes.plinth;
    return new CylinderGeometry(radius, radius * 1.08, height, 8).translate(0, height / 2, 0);
  },
  dock: () => {
    const { radius, height } = WORLD.sizes.dock;
    return new CylinderGeometry(radius, radius * 1.05, height, 6).translate(0, height / 2, 0);
  },
  dockLights: () => {
    const { radius, tube } = WORLD.sizes.dockLights;
    return new TorusGeometry(radius, tube, 6, 36)
      .rotateX(QUARTER_TURN)
      .translate(0, WORLD.sizes.dock.height, 0);
  },
  flatRing: (inner: number, outer: number) =>
    new RingGeometry(inner, outer, 48).rotateX(-QUARTER_TURN),
  beacon: () => new SphereGeometry(WORLD.sizes.beacon.radius, 16, 12),
  beam: () => new CylinderGeometry(WORLD.sizes.beam.radius, WORLD.sizes.beam.radius, 1, 6, 1, true),
  subPilot: () => new SphereGeometry(WORLD.sizes.subPilot.radius, 14, 10),
  sideSlotPad: () => {
    const { radius, height } = WORLD.sizes.sideSlotPad;
    return new CylinderGeometry(radius, radius, height, 12).translate(0, height / 2, 0);
  },
  sideSlotShuttle: () => {
    const { radius, height } = WORLD.sizes.sideSlotShuttle;
    return new ConeGeometry(radius, height, 8).translate(
      0,
      height / 2 + WORLD.sizes.sideSlotPad.height,
      0,
    );
  },
  exitGate: () => {
    const { radius, tube } = WORLD.sizes.exitGate;
    return new TorusGeometry(radius, tube, 8, 40);
  },
} as const;

/** The ships a Unit can fly; `shipFor` picks one by the Unit's name. Ten shapes that read apart. */
export const SHIP_MODELS: readonly ShapeFactory[] = [
  () => new ConeGeometry(0.45, 1.5, 4).rotateX(QUARTER_TURN),
  () => new BoxGeometry(0.8, 0.45, 1.4),
  () => new OctahedronGeometry(0.65).scale(1, 0.55, 1.4),
  () => new CylinderGeometry(0.32, 0.32, 1.5, 10).rotateX(QUARTER_TURN),
  () => new CapsuleGeometry(0.3, 0.9, 4, 10).rotateX(QUARTER_TURN),
  () => new TetrahedronGeometry(0.8),
  () => new TorusGeometry(0.5, 0.15, 8, 20).rotateX(QUARTER_TURN),
  () => new IcosahedronGeometry(0.6),
  () => new DodecahedronGeometry(0.6).scale(1, 0.65, 1),
  () => new CylinderGeometry(0.9, 0.9, 0.18, 3),
];
