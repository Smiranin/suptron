import {
  PerspectiveCamera,
  Raycaster,
  Scene,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import type { PanelSelection } from '../../missions/model/types';
import { elementKey, type ElementRef, type MissionPicture } from '../../missions/picture';
import { createAmbienceObject } from '../objects/ambience-object';
import { createCoreObject } from '../objects/core-object';
import { createSlotObject, type SlotObject } from '../objects/slot-object';
import type { Ambience, Marks, PlacedObject } from '../objects/view-object';
import type { UniverseFailure } from '../types';
import { WORLD } from '../world/world';
import type { LoadedAssets } from './assets';
import { layoutUniverse, type UniverseLayout } from './layout';

export interface UniverseSceneOptions {
  canvas: HTMLCanvasElement;
  /** The element whose size the scene follows. */
  container: HTMLElement;
  picture: MissionPicture;
  selection: PanelSelection;
  assets: LoadedAssets;
  /** The label of an element, by `elementKey`; the scene writes its position each frame. */
  labelElement(key: string): HTMLElement | null;
  onSelect(selection: PanelSelection): void;
  /** Called when the zoom changes; 1 is "the whole Assembly in view". */
  onZoom(zoom: number): void;
  onFailure(failure: UniverseFailure): void;
}

export interface UniverseScene {
  /** A new picture or a new selection; the scene hands every view object its piece. */
  update(picture: MissionPicture, selection: PanelSelection): void;
  /** Marks an element as under the pointer from outside the canvas (a label); null clears it. */
  hover(ref: ElementRef | null): void;
  /** Back to "the whole Assembly in view". */
  fit(): void;
  dispose(): void;
}

/** The smallest change of zoom worth reporting. */
const ZOOM_EPSILON = 1e-3;

/** True when the browser can draw the Universe: it needs WebGL 2. */
export function canDrawUniverse(): boolean {
  return WebGL.isWebGL2Available();
}

/** True for an element the page can select: a Loop and an Exit Point are only looked at. */
function isSelectable(ref: ElementRef): ref is PanelSelection {
  return ref.kind !== 'loop' && ref.kind !== 'exitPoint';
}

/** The direction from the point looked at towards the camera; the camera never turns. */
function viewDirection(): Vector3 {
  const elevation = (WORLD.camera.elevation * Math.PI) / 180;
  const azimuth = (WORLD.camera.azimuth * Math.PI) / 180;
  return new Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  );
}

/** How far the camera stands from a sphere of `radius` for the sphere to fill the view. */
function fitDistance(camera: PerspectiveCamera, radius: number): number {
  const vertical = (camera.fov * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
  return radius / Math.sin(Math.min(vertical, horizontal) / 2);
}

/**
 * Creates the Universe on `canvas`: renderer, camera, controls, one view object per element of
 * the picture, the frame loop, the pointer and the label positions. Everything it creates,
 * listens to or observes is released by `dispose`.
 */
export function createUniverseScene(options: UniverseSceneOptions): UniverseScene {
  const { canvas, container } = options;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, WORLD.camera.maxPixelRatio));
  renderer.setClearColor(WORLD.palette.space);
  const scene = new Scene();
  const camera = new PerspectiveCamera(WORLD.camera.fov, 1, WORLD.camera.near, WORLD.camera.far);
  const controls = new MapControls(camera, canvas);
  controls.enableRotate = false;
  controls.enableDamping = true;
  controls.dampingFactor = WORLD.camera.dampingFactor;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;

  const layout: UniverseLayout = layoutUniverse(options.picture);
  const ambience = createAmbienceObject();
  scene.fog = ambience.fog;
  scene.add(ambience.root);
  const core = createCoreObject();
  const slots = new Map<string, SlotObject>();
  for (const piece of options.picture.slots) {
    const place = layout.slots.get(piece.name);
    if (!place) continue;
    slots.set(piece.name, createSlotObject(piece, place, layout.loops.get(piece.name)));
  }
  /** Every view object by the key of its element: what labels and the pointer are matched by. */
  const objects = new Map<string, PlacedObject>();
  const register = (object: PlacedObject) => objects.set(elementKey(object.ref), object);
  register(core);
  scene.add(core.root);
  for (const slot of slots.values()) {
    register(slot);
    for (const child of slot.children) register(child);
    scene.add(slot.root);
  }
  /** What the pointer can hit, and the element each mesh belongs to. */
  const targets = new Map<Object3D, ElementRef>();
  for (const object of objects.values()) {
    for (const target of object.targets) targets.set(target, object.ref);
  }
  const targetList = [...targets.keys()];

  let picture = options.picture;
  let selection = options.selection;
  let canvasHover: string | null = null;
  let labelHover: string | null = null;
  let fittedDistance = 1;
  let lastZoom = Number.NaN;
  let failed = false;
  let size = { width: 0, height: 0 };

  /** Hands every view object its piece of the picture with its marks; unchanged ones do nothing. */
  const handOut = () => {
    const selected = elementKey(selection);
    const hovered = labelHover ?? canvasHover;
    const marks = (key: string): Marks => ({
      selected: key === selected,
      hovered: key === hovered,
    });
    const scope: Ambience = { power: picture.power, alarm: picture.alarm };
    ambience.apply(scope);
    core.apply(picture.core, marks(elementKey(picture.core.ref)), scope);
    for (const piece of picture.slots) {
      const slot = slots.get(piece.name);
      if (!slot) continue;
      slot.apply(piece, marks(elementKey(piece.ref)), scope);
      for (const sub of piece.subPilots) {
        slot.subPilot(sub.unit)?.apply(sub, marks(elementKey(sub.ref)), scope);
      }
      for (const side of piece.sideSlots) {
        slot.sideSlot(side.name)?.apply(side, marks(elementKey(side.ref)), scope);
      }
      if (piece.loop) slot.loop?.apply(piece.loop, marks(elementKey(piece.loop.ref)), scope);
      if (piece.exitPoint) {
        slot.exitPoint?.apply(piece.exitPoint, marks(elementKey(piece.exitPoint.ref)), scope);
      }
    }
  };

  const fail = (failure: UniverseFailure) => {
    if (failed) return;
    failed = true;
    options.onFailure(failure);
  };

  /** Frames the whole Assembly from the camera's fixed angle and sets the zoom limits around it. */
  const fit = () => {
    const { center, radius } = layout.bounds;
    fittedDistance = fitDistance(camera, radius);
    camera.position.copy(center).addScaledVector(viewDirection(), fittedDistance);
    controls.target.copy(center);
    controls.minDistance = fittedDistance / WORLD.camera.maxZoom;
    controls.maxDistance = fittedDistance / WORLD.camera.minZoom;
    ambience.fog.near = fittedDistance * WORLD.fog.nearFactor;
    ambience.fog.far = fittedDistance * WORLD.fog.farFactor;
    controls.update();
  };

  /** Follows the size of the container; the Commander's zoom and position stay as they are. */
  const resize = (width: number, height: number) => {
    if (width === 0 || height === 0) return;
    const first = size.width === 0;
    size = { width, height };
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (first) fit();
  };
  const observer = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (box) resize(box.width, box.height);
  });
  observer.observe(container);
  resize(container.clientWidth, container.clientHeight);

  const projected = new Vector3();
  /** Writes the screen position of every label straight onto its element; React is not involved. */
  const placeLabels = () => {
    for (const [key, object] of objects) {
      const element = options.labelElement(key);
      if (!element) continue;
      object.anchor.getWorldPosition(projected).project(camera);
      const outside = projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      element.style.visibility = outside ? 'hidden' : 'visible';
      if (outside) continue;
      const x = ((projected.x + 1) / 2) * size.width;
      const y = ((1 - projected.y) / 2) * size.height - WORLD.labels.offsetPx;
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
  };

  const reportZoom = () => {
    const zoom = fittedDistance / camera.position.distanceTo(controls.target);
    if (Math.abs(zoom - lastZoom) < ZOOM_EPSILON) return;
    lastZoom = zoom;
    options.onZoom(zoom);
  };

  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    // Capped, so a tab that was hidden does not jump on its return.
    const deltaSeconds = Math.min(timer.getDelta(), WORLD.motion.maxDeltaSeconds);
    const now = Date.now();
    controls.update(deltaSeconds);
    ambience.frame(now, deltaSeconds);
    core.frame(now, deltaSeconds);
    for (const slot of slots.values()) slot.frame(now, deltaSeconds);
    renderer.render(scene, camera);
    placeLabels();
    reportZoom();
  });

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  /** The element under a pointer event, or null. */
  const hitAt = (event: PointerEvent): ElementRef | null => {
    const box = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(targetList, false)[0];
    return hit ? (targets.get(hit.object) ?? null) : null;
  };
  let pressedAt: { x: number; y: number } | null = null;
  const onPointerMove = (event: PointerEvent) => {
    const ref = hitAt(event);
    const key = ref ? elementKey(ref) : null;
    canvas.style.cursor = ref && isSelectable(ref) ? 'pointer' : '';
    if (key === canvasHover) return;
    canvasHover = key;
    handOut();
  };
  const onPointerLeave = () => {
    canvas.style.cursor = '';
    if (canvasHover === null) return;
    canvasHover = null;
    handOut();
  };
  const onPointerDown = (event: PointerEvent) => {
    pressedAt = { x: event.clientX, y: event.clientY };
  };
  // A press and a release without a drag in between is a click.
  const onPointerUp = (event: PointerEvent) => {
    const start = pressedAt;
    pressedAt = null;
    if (!start) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > WORLD.camera.clickTolerancePx) return;
    const ref = hitAt(event);
    if (ref && isSelectable(ref)) options.onSelect(ref);
  };
  const onContextLost = () => fail('context-lost');
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('webglcontextlost', onContextLost);

  handOut();

  return {
    update(nextPicture, nextSelection) {
      picture = nextPicture;
      selection = nextSelection;
      handOut();
    },
    hover(ref) {
      const key = ref ? elementKey(ref) : null;
      if (key === labelHover) return;
      labelHover = key;
      handOut();
    },
    fit,
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      controls.dispose();
      timer.dispose();
      for (const slot of slots.values()) slot.dispose();
      core.dispose();
      ambience.dispose();
      renderer.dispose();
      // Gives the drawing context back to the browser at once: it allows only a few at a time.
      renderer.forceContextLoss();
    },
  };
}
