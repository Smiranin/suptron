import {
  Mesh,
  SRGBColorSpace,
  TextureLoader,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  MODEL_FILES,
  SHIP_FILES,
  type ModelFile,
  type ModelFit,
  type ModelName,
} from '../world/models';
import { shipFor } from '../world/ships';

/** A model ready to draw: its shape and the picture for each of its parts. */
export interface PaintedShape {
  /** The shape, with one group per part; a group's `materialIndex` points into `pictures`. */
  geometry: BufferGeometry;
  /** The picture of each part. Shared by every object: the assets free them, not the object. */
  pictures: readonly Texture[];
}

/** The model files the world names, loaded for one scene and freed with it. */
export interface LoadedAssets {
  /** A model, with a fresh copy of its shape that the caller owns and disposes. */
  model(name: ModelName): PaintedShape;
  /** The ship the Unit flies, with a fresh copy of its shape that the caller owns and disposes. */
  ship(unitName: string): PaintedShape;
  /** Frees everything that was loaded. */
  dispose(): void;
}

/** A shape as loaded: one group per part, and the name of each part's material in the file. */
interface LoadedShape {
  geometry: BufferGeometry;
  materialNames: readonly string[];
}

/** The attributes the scene draws with; everything else in a file is dropped. */
const KEPT_ATTRIBUTES = new Set(['position', 'normal', 'uv']);

/** Releases the material or the materials of a mesh. */
function disposeMaterial(material: Material | Material[]): void {
  for (const one of Array.isArray(material) ? material : [material]) one.dispose();
}

/** The name of a mesh's material in its file. A part drawn with several materials is not supported. */
function materialName(mesh: Mesh): string {
  if (Array.isArray(mesh.material)) {
    throw new Error(`The part ${mesh.name} has several materials; one is expected`);
  }
  return mesh.material.name;
}

/**
 * The shape of one mesh in the coordinates of its file: transformed by its nodes, with only the
 * attributes the scene uses, and without an index so that every part merges with every other.
 */
function meshShape(mesh: Mesh): BufferGeometry {
  const shape = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const name of Object.keys(shape.attributes)) {
    if (!KEPT_ATTRIBUTES.has(name)) shape.deleteAttribute(name);
  }
  shape.morphAttributes = {};
  return shape.applyMatrix4(mesh.matrixWorld);
}

/** Every mesh under `root`. */
function meshesOf(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof Mesh) meshes.push(node);
  });
  return meshes;
}

/**
 * Loads one model file and returns its shape as one geometry, a group per part. The loaded meshes
 * and their materials are freed at once: the scene paints the shape with materials of its own.
 */
async function loadShape(loader: GLTFLoader, url: string): Promise<LoadedShape> {
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const meshes = meshesOf(gltf.scene);
  try {
    const names = meshes.map(materialName);
    const parts = meshes.map(meshShape);
    const merged = parts.length > 0 ? mergeGeometries(parts, true) : null;
    for (const part of parts) part.dispose();
    if (!merged) throw new Error(`The model ${url} has no shape that could be drawn`);
    // Parts with the same material share one picture: groups point at the distinct names.
    const materialNames = [...new Set(names)];
    merged.groups.forEach((group, i) => {
      group.materialIndex = materialNames.indexOf(names[i]!);
    });
    return { geometry: merged, materialNames };
  } finally {
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      disposeMaterial(mesh.material);
    }
  }
}

/** Loads one picture as the model files expect it: in sRGB, not flipped. */
async function loadPicture(loader: TextureLoader, url: string): Promise<Texture> {
  const picture = await loader.loadAsync(url);
  picture.colorSpace = SRGBColorSpace;
  // glTF's texture coordinates start at the top of the picture.
  picture.flipY = false;
  return picture;
}

/** Scales and moves `shape` so it fits as `fit` says: centred across the ground, standing or floating. */
function fitShape(shape: BufferGeometry, fit: ModelFit): BufferGeometry {
  shape.computeBoundingBox();
  const box = shape.boundingBox!;
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  const height = box.max.y - box.min.y;
  const across = fit.span / Math.max(width, depth);
  const up = fit.height !== undefined ? fit.height / height : across;
  const base = fit.stand === 'ground' ? box.min.y : (box.min.y + box.max.y) / 2;
  shape.translate(-(box.min.x + box.max.x) / 2, -base, -(box.min.z + box.max.z) / 2);
  shape.scale(across, up, across);
  shape.computeBoundingBox();
  shape.computeBoundingSphere();
  return shape;
}

/**
 * Loads every address of `urls` with `load`, each address once, keyed by address. When any fails, what did
 * load is freed and the promise rejects.
 */
async function loadAll<T>(
  urls: readonly string[],
  load: (url: string) => Promise<T>,
  free: (item: T) => void,
): Promise<Map<string, T>> {
  const unique = [...new Set(urls)];
  const results = await Promise.allSettled(unique.map(load));
  const loaded = new Map<string, T>();
  const failures: unknown[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') loaded.set(unique[i]!, result.value);
    else failures.push(result.reason);
  });
  if (failures.length > 0) {
    for (const item of loaded.values()) free(item);
    throw new AggregateError(failures, 'Some files of the Universe did not load');
  }
  return loaded;
}

/**
 * Loads what the world names for a Mission flown by `unitNames`: every model, and the ships of
 * those Units only, each in its colour. Each model is fitted into the world. When any file fails,
 * what did load is freed and the promise rejects: the page then shows the clock. A caller that no
 * longer needs the result disposes it.
 */
export async function loadAssets(unitNames: readonly string[]): Promise<LoadedAssets> {
  const shipFiles = new Map(
    unitNames.map((unit) => {
      const choice = shipFor(unit);
      return [unit, SHIP_FILES[choice.model]![choice.colour]];
    }),
  );
  const files: ModelFile[] = [...Object.values(MODEL_FILES), ...shipFiles.values()];
  const shapeLoader = new GLTFLoader();
  const pictureLoader = new TextureLoader();
  const [shapesLoad, picturesLoad] = await Promise.allSettled([
    loadAll(
      files.map((file) => file.url),
      (url) => loadShape(shapeLoader, url),
      (shape) => shape.geometry.dispose(),
    ),
    loadAll(
      files.flatMap((file) => Object.values(file.pictures)),
      (url) => loadPicture(pictureLoader, url),
      (picture) => picture.dispose(),
    ),
  ]);
  if (shapesLoad.status === 'rejected' || picturesLoad.status === 'rejected') {
    // One kind loaded and the other did not: what did load is freed before giving up.
    if (shapesLoad.status === 'fulfilled') {
      for (const shape of shapesLoad.value.values()) shape.geometry.dispose();
    }
    if (picturesLoad.status === 'fulfilled') {
      for (const picture of picturesLoad.value.values()) picture.dispose();
    }
    const reasons = [shapesLoad, picturesLoad].flatMap((r) =>
      r.status === 'rejected' ? [r.reason] : [],
    );
    throw new AggregateError(reasons, 'The Universe could not load its models');
  }
  const shapes = shapesLoad.value;
  const pictures = picturesLoad.value;
  const fitted: BufferGeometry[] = [];

  /** The file's shape fitted into the world, with the picture of each of its parts. */
  const paint = (file: ModelFile): PaintedShape => {
    const loaded = shapes.get(file.url)!;
    const parts = loaded.materialNames.map((name) => {
      const url = file.pictures[name];
      if (url === undefined) {
        throw new Error(`The world names no picture for ${name} of ${file.url}`);
      }
      return pictures.get(url)!;
    });
    const geometry = fitShape(loaded.geometry.clone(), file.fit);
    fitted.push(geometry);
    return { geometry, pictures: parts };
  };

  let models: Map<ModelName, PaintedShape>;
  let ships: Map<string, PaintedShape>;
  try {
    models = new Map(
      (Object.entries(MODEL_FILES) as [ModelName, ModelFile][]).map(([name, file]) => [
        name,
        paint(file),
      ]),
    );
    ships = new Map([...shipFiles].map(([unit, file]) => [unit, paint(file)]));
  } catch (error) {
    for (const geometry of fitted) geometry.dispose();
    for (const picture of pictures.values()) picture.dispose();
    throw error;
  } finally {
    // The fitted copies are what is kept; the shapes as loaded were only their source.
    for (const shape of shapes.values()) shape.geometry.dispose();
  }

  /** A copy of a painted shape whose geometry the caller owns. */
  const copy = (shape: PaintedShape): PaintedShape => ({
    geometry: shape.geometry.clone(),
    pictures: shape.pictures,
  });

  return {
    model: (name) => copy(models.get(name)!),
    ship(unitName) {
      const shape = ships.get(unitName);
      if (!shape) throw new Error(`The ship of ${unitName} was not loaded`);
      return copy(shape);
    },
    dispose() {
      for (const geometry of fitted) geometry.dispose();
      for (const picture of pictures.values()) picture.dispose();
    },
  };
}
