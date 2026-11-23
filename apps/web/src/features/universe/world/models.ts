import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  OctahedronGeometry,
  Float32BufferAttribute,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { WORLD } from './world';

const QUARTER_TURN = Math.PI / 2;

/** Straight up: the face of everything that lies on the ground. */
const UP = new Vector3(0, 1, 0);

/**
 * A flat band on the ground of `width`, through `points` in order: two corners at each point,
 * across the way the band runs there. The points' heights are ignored.
 */
function groundBand(points: readonly Vector3[], width: number): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const along = new Vector3();
  const across = new Vector3();
  points.forEach((point, i) => {
    const before = points[Math.max(0, i - 1)]!;
    const after = points[Math.min(points.length - 1, i + 1)]!;
    along.subVectors(after, before).setY(0).normalize();
    across.crossVectors(along, UP).multiplyScalar(width / 2);
    positions.push(
      point.x - across.x,
      0,
      point.z - across.z,
      point.x + across.x,
      0,
      point.z + across.z,
    );
    if (i > 0) {
      const a = 2 * (i - 1);
      // Two triangles from the corners of the last point to this one, both facing up.
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const band = new BufferGeometry();
  band.setAttribute('position', new Float32BufferAttribute(positions, 3));
  band.setIndex(indices);
  band.computeVertexNormals();
  return band;
}

/** How high the middle of the Core's crystal floats: over the plinth, the column and a gap. */
export function crystalHeight(): number {
  const { plinth, coreColumn, crystal } = WORLD.sizes;
  return plinth.height + coreColumn.height + crystal.lift + crystal.radius * crystal.stretch;
}

/**
 * What is still drawn by a shape built in code: the Core's crystal and its rings, the light
 * around a dock, the marks and the route on the ground, the beacon, the beam and the Side Slot's
 * pad and shuttle.
 */
export const MODELS = {
  crystal: () => {
    const { radius, stretch } = WORLD.sizes.crystal;
    return new OctahedronGeometry(radius).scale(1, stretch, 1);
  },
  coreRing: (radius: number) =>
    new TorusGeometry(radius, WORLD.sizes.coreRingTube, 6, 64).rotateX(QUARTER_TURN),
  dockLights: () => {
    const { radius, tube } = WORLD.sizes.dockLights;
    return new TorusGeometry(radius, tube, 6, 36)
      .rotateX(QUARTER_TURN)
      .translate(0, WORLD.sizes.dock.height, 0);
  },
  flatRing: (inner: number, outer: number) =>
    new RingGeometry(inner, outer, 48).rotateX(-QUARTER_TURN),
  /**
   * A band on the ground along the ring of `radius`, from the ring angle `from` to `to` (radians
   * clockwise from the far side, as the layout counts them).
   */
  routeArc: (radius: number, from: number, to: number) => {
    const half = WORLD.sizes.route.width / 2;
    // A ring angle a lies at the drawing angle a quarter turn minus a, once the ring lies flat.
    return new RingGeometry(
      radius - half,
      radius + half,
      WORLD.sizes.route.segments,
      1,
      QUARTER_TURN - to,
      to - from,
    ).rotateX(-QUARTER_TURN);
  },
  beacon: () => new SphereGeometry(WORLD.sizes.beacon.radius, 16, 12),
  /** The band on the ground from a dock at `dock` straight to the Core in the centre. */
  beam: (dock: Vector3) => groundBand([dock, new Vector3(0, 0, 0)], WORLD.sizes.beam.width),
  /** The band on the ground a Loop draws, through the points of its curve. */
  loopBand: (points: readonly Vector3[]) => groundBand(points, WORLD.sizes.loop.width),
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
} as const;

/** The model files in the repository, by path: their addresses in the built application. */
const SHAPE_URLS = import.meta.glob<string>('./assets/models/*.glb', {
  eager: true,
  query: '?url',
  import: 'default',
});
/** The pictures painted on the models, by path. */
const PICTURE_URLS = import.meta.glob<string>('./assets/pictures/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** The address of a file the world names; a name with no file is a mistake in this module. */
function fileUrl(files: Record<string, string>, path: string): string {
  const url = files[path];
  if (url === undefined) throw new Error(`The world names a file that is not in it: ${path}`);
  return url;
}

/** The address of the model file `name`. */
const shape = (name: string) => fileUrl(SHAPE_URLS, `./assets/models/${name}.glb`);
/** The address of the picture `name`. */
const picture = (name: string) => fileUrl(PICTURE_URLS, `./assets/pictures/${name}.jpg`);

/** How a model file is fitted into the world, whatever size it was made in. */
export interface ModelFit {
  /** The longest side across the ground (along x or z), in world units. */
  span: number;
  /** The height to stretch the model to; without it the height follows `span`. */
  height?: number;
  /** Where the model stands: its bottom on y = 0, or its middle on its place. */
  stand: 'ground' | 'centre';
}

/** A model file of the world, how it is fitted and the picture on each of its materials. */
export interface ModelFile {
  url: string;
  fit: ModelFit;
  /** The picture painted on each material of the model, by the material's name in the file. */
  pictures: Readonly<Record<string, string>>;
}

/** The pictures of the metal trim the station's models are made of. */
const TRIM_PICTURES = {
  MI_Trim_01: picture('T_Trim_01_BaseColor'),
  MI_Trim_02: picture('T_Trim_02_BaseColor'),
};

/** The model files that draw the things of the world, by name. */
export const MODEL_FILES = {
  dock: {
    url: shape('Platform_Round1'),
    fit: { span: WORLD.sizes.dock.radius * 2, height: WORLD.sizes.dock.height, stand: 'ground' },
    pictures: TRIM_PICTURES,
  },
  plinth: {
    url: shape('Platform_Round1'),
    fit: {
      span: WORLD.sizes.plinth.radius * 2,
      height: WORLD.sizes.plinth.height,
      stand: 'ground',
    },
    pictures: TRIM_PICTURES,
  },
  subPilot: {
    url: shape('Enemy_EyeDrone'),
    fit: { span: WORLD.sizes.subPilot.span, stand: 'centre' },
    pictures: { MI_Enemies: picture('T_Enemies_BaseColor') },
  },
  coreColumn: {
    url: shape('Column_Round'),
    fit: {
      span: WORLD.sizes.coreColumn.span,
      height: WORLD.sizes.coreColumn.height,
      stand: 'ground',
    },
    pictures: TRIM_PICTURES,
  },
  exitGate: {
    url: shape('Door_Frame_Square'),
    fit: { span: WORLD.sizes.exitGate.span, height: WORLD.sizes.exitGate.height, stand: 'centre' },
    pictures: TRIM_PICTURES,
  },
} as const satisfies Record<string, ModelFile>;

/** The name of a model file of the world. */
export type ModelName = keyof typeof MODEL_FILES;

/** The colours every ship of the pack is painted in. */
export const SHIP_COLOURS = ['Blue', 'Green', 'Orange', 'Purple', 'Red'] as const;

/** A colour a ship is painted in. */
export type ShipColour = (typeof SHIP_COLOURS)[number];

/** The ships of the pack; each is one model painted in any of `SHIP_COLOURS`. */
const SHIP_NAMES = [
  'Bob',
  'Challenger',
  'Dispatcher',
  'Executioner',
  'Imperial',
  'Insurgent',
  'Omen',
  'Pancake',
  'Spitfire',
  'Striker',
  'Zenith',
] as const;

/** The model file of the ship `name`, painted in `colour`. */
function shipFile(name: string, colour: ShipColour): ModelFile {
  return {
    url: shape(name),
    fit: { span: WORLD.sizes.ship.span, stand: 'centre' },
    // A ship of the pack has one material; it takes the picture of its colour.
    pictures: { Texture: picture(`${name}_${colour}`) },
  };
}

/** The ship models a Unit can fly, in every colour; `shipFor` picks one. Noses point along +z. */
export const SHIP_FILES: readonly Readonly<Record<ShipColour, ModelFile>>[] = SHIP_NAMES.map(
  (name) => ({
    Blue: shipFile(name, 'Blue'),
    Green: shipFile(name, 'Green'),
    Orange: shipFile(name, 'Orange'),
    Purple: shipFile(name, 'Purple'),
    Red: shipFile(name, 'Red'),
  }),
);
