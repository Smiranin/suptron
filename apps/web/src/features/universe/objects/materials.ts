import {
  AdditiveBlending,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type BufferGeometry,
  type ColorRepresentation,
} from 'three';
import { MODELS } from '../world/models';
import { WORLD } from '../world/world';
import type { Resources } from './resources';

/** A matte surface that can glow: its emissive intensity starts at zero. */
export function matteMaterial(
  resources: Resources,
  color: ColorRepresentation,
  emissive: ColorRepresentation = 0x000000,
): MeshStandardMaterial {
  return resources.track(
    new MeshStandardMaterial({
      color,
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
