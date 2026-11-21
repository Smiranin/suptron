import type { Cost, MissionState, SideSlotStatus } from '@suptron/runtime/browser';
import type { PanelSelection, SlotVisualState } from '../model/types';

/** A reference to an element in the words of the Mission. The first four are what the page can select. */
export type ElementRef =
  PanelSelection | { kind: 'loop'; slot: string } | { kind: 'exitPoint'; slot: string };

/**
 * What every view of a Mission draws: plain, immutable data in the words of the Mission, shaped
 * like the Assembly. Selection is not part of it; a view gets the selection beside it.
 */
export interface MissionPicture {
  /** `low` for a Stopped Mission and one Waiting for usage. */
  power: 'normal' | 'low';
  /** True in Needs Attention. */
  alarm: boolean;
  core: CorePiece;
  /** In Assembly order. */
  slots: readonly SlotPiece[];
}

export interface CorePiece {
  kind: 'core';
  ref: { kind: 'mission' };
  state: MissionState;
  /** The Core's own spend, not the Mission total. */
  cost: Cost;
  atWork: boolean;
  /** ISO time; present only in Waiting for usage. */
  usageResetsAt?: string;
}

export interface SlotPiece {
  kind: 'slot';
  ref: { kind: 'slot'; name: string };
  name: string;
  unit: string;
  index: number;
  state: SlotVisualState;
  current: boolean;
  marker?: 'waiting' | 'attention';
  attempts: number;
  /** How often the Slot was passed by in a later Slot's Loop; 0 when never. */
  skipped: number;
  cost: Cost;
  /** In the Slot's order of the Assembly. */
  subPilots: readonly SubPilotPiece[];
  /** In the Slot's order of the Assembly. */
  sideSlots: readonly SideSlotPiece[];
  loop?: LoopPiece;
  exitPoint?: ExitPointPiece;
}

export interface SubPilotPiece {
  kind: 'subPilot';
  ref: { kind: 'subPilot'; slot: string; unit: string };
  unit: string;
  status: 'idle' | 'running' | 'done';
}

export interface SideSlotPiece {
  kind: 'sideSlot';
  ref: { kind: 'sideSlot'; name: string };
  name: string;
  unit: string;
  /** `idle` until the Side Slot was started for the first time. */
  status: 'idle' | SideSlotStatus;
}

export interface LoopPiece {
  kind: 'loop';
  ref: { kind: 'loop'; slot: string };
  /** The Slot the Loop goes back to. */
  to: string;
  iterations: number;
  limit: number;
  /** Date.now() of the last firing, as the reducer recorded it. */
  firedAt?: number;
}

export interface ExitPointPiece {
  kind: 'exitPoint';
  ref: { kind: 'exitPoint'; slot: string };
  /** True when the Mission left through this Exit Point. */
  lit: boolean;
}
