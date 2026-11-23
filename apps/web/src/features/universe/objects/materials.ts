import {
  AdditiveBlending,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type BufferGeometry,
  type Color,
  type ColorRepresentation,
  type Texture,
} from 'three';
import type { PaintedShape } from '../scene/assets';
import { MODELS } from '../world/models';
import { WORLD } from '../world/world';
import type { Resources } from './resources';

/**
 * A matte surface that can glow: its emissive intensity starts at zero. With a picture, `color`
 * tints the picture.
 */
export function matteMaterial(
  resources: Resources,
  color: ColorRepresentation,
  emissive: ColorRepresentation = 0x000000,
  picture: Texture | null = null,
): MeshStandardMaterial {
  return resources.track(
    new MeshStandardMaterial({
      color,
      map: picture,
      emissive,
      emissiveIntensity: 0,
      roughness: WORLD.surface.roughness,
      metalness: WORLD.surface.metalness,
    }),
  );
}

/** A light that ignores the lights of the scene and adds to what is behind it; starts unseen. */
export function lightMaterial(resources: Resources, color: ColorRepresentation): MeshBasicMaterial {
  return resources.track(
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    }),
  );
}

/** A mesh whose geometry is tracked with the object's other resources. */
export function trackedMesh<M extends MeshStandardMaterial | MeshBasicMaterial>(
  resources: Resources,
  geometry: BufferGeometry,
  material: M,
): Mesh<BufferGeometry, M> {
  return new Mesh(resources.track(geometry), material);
}

/** A flat ring on the ground, drawn as light: the mark of the selected or the current element. */
export function markRing(
  resources: Resources,
  size: { inner: number; outer: number },
  color: ColorRepresentation,
): Mesh<BufferGeometry, MeshBasicMaterial> {
  const ring = trackedMesh(
    resources,
    MODELS.flatRing(size.inner, size.outer),
    lightMaterial(resources, color),
  );
  // Drawn after the ground it lies on, so it is never hidden in it.
  ring.renderOrder = 1;
  return ring;
}

/** A model drawn in its own pictures: one matte material per part, all able to glow. */
export type PaintedMesh = Mesh<BufferGeometry, MeshStandardMaterial[]>;

/** How a painted mesh glows: in one colour over its paint, or in its own paint, lighter. */
export type PaintedGlow = { kind: 'colour'; colour: ColorRepresentation } | { kind: 'paint' };

/** A painted mesh that glows in black, unseen, until its colour is set. */
const DARK_GLOW: PaintedGlow = { kind: 'colour', colour: 0x000000 };

/**
 * A mesh of a loaded model: its shape and one material per part, each with the part's picture.
 * Glowing in its paint, a part gives off its own picture, so it grows lighter but keeps its
 * colours. The shape and the materials are tracked with the object's resources; the pictures
 * belong to the assets and are freed with them.
 */
export function paintedMesh(
  resources: Resources,
  shape: PaintedShape,
  glow: PaintedGlow = DARK_GLOW,
): PaintedMesh {
  const materials = shape.pictures.map((picture) => {
    if (glow.kind === 'colour') {
      return matteMaterial(resources, WORLD.palette.paint, glow.colour, picture);
    }
    const material = matteMaterial(resources, WORLD.palette.paint, WORLD.palette.paint, picture);
    material.emissiveMap = picture;
    return material;
  });
  return new Mesh(resources.track(shape.geometry), materials);
}

/** Sets how strongly every part of a painted mesh glows and, when given, in which colour. */
export function setGlow(mesh: PaintedMesh, intensity: number, color?: Color): void {
  for (const material of mesh.material) {
    if (color) material.emissive.copy(color);
    material.emissiveIntensity = intensity;
  }
}
