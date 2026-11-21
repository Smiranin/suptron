import type { Object3D } from 'three';
import type { ElementRef, MissionPicture } from '../../missions/picture';

/** How the page marks an element: the one selected, the one under the pointer. */
export interface Marks {
  selected: boolean;
  hovered: boolean;
}

/** What concerns the whole picture and every object in it. */
export type Ambience = Pick<MissionPicture, 'power' | 'alarm'>;

/**
 * One element of the picture in the scene. It lives as long as the scene: built once, handed its
 * piece of the picture on every change, asked to live one frame at a time, then released.
 */
export interface ViewObject<Piece> {
  /** The element this object draws, in the words of the Mission. */
  readonly ref: ElementRef;
  /** What the scene adds to its graph. */
  readonly root: Object3D;
  /** The meshes the pointer can hit; empty for a Loop and an Exit Point. */
  readonly targets: readonly Object3D[];
  /** Where the element's label stands; it moves with the object. */
  readonly anchor: Object3D;
  /**
   * Takes the piece and its marks; sets targets to move towards, never jumps. Does nothing when
   * the look they make equals the look applied last.
   */
  apply(piece: Piece, marks: Marks, ambience: Ambience): void;
  /** Lives one frame: moves towards the targets, hovers, pulses. `now` is Date.now(). */
  frame(now: number, deltaSeconds: number): void;
  /** Releases every geometry and material the object created. */
  dispose(): void;
}

/** A view object seen apart from the kind of piece it takes: what the scene indexes, frames and releases. */
export type PlacedObject = Omit<ViewObject<unknown>, 'apply'>;
