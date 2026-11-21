import {
  CORE_SLOT_NAME,
  DEFAULTS,
  sideSlotName,
  ZERO_COST,
  type AssemblyFile,
} from '@suptron/runtime/browser';
import { slotUnderWay } from '../model/selectors';
import type { ReadyMissionState, SlotVisualState } from '../model/types';
import type {
  ElementRef,
  ExitPointPiece,
  LoopPiece,
  MissionPicture,
  SideSlotPiece,
  SlotPiece,
  SubPilotPiece,
} from './types';

type AssemblySlot = AssemblyFile['slots'][number];

/**
 * Turns the state of the Mission page into the picture every view draws. Pure: the same state
 * gives an equal picture, and every decision about what a Mission state means for a picture is
 * taken here, never in a view.
 */
export function missionPicture(state: ReadyMissionState): MissionPicture {
  const missionState = state.summary.state;
  const slotCount = state.assembly.slots.length;
  return {
    power: missionState === 'stopped' || missionState === 'waiting_for_usage' ? 'low' : 'normal',
    alarm: missionState === 'needs_attention',
    core: {
      kind: 'core',
      ref: { kind: 'mission' },
      state: missionState,
      // The Core's own spend, not the Mission total (that is in the header).
      cost: state.slots[CORE_SLOT_NAME]?.cost ?? ZERO_COST,
      atWork: state.coreActivity !== undefined && missionState === 'running',
      ...(state.summary.usageResetsAt !== undefined && {
        usageResetsAt: state.summary.usageResetsAt,
      }),
    },
    slots: state.assembly.slots.map((slot, index) =>
      slotPiece(state, slot, index, index === slotCount - 1),
    ),
  };
}

/** One Slot of the Assembly with what the Mission says about it and the pieces it holds. */
function slotPiece(
  state: ReadyMissionState,
  slot: AssemblySlot,
  index: number,
  isLast: boolean,
): SlotPiece {
  const record = state.slots[slot.name];
  const marker =
    state.pendingQuestion?.slot === slot.name
      ? 'waiting'
      : state.attention?.slot === slot.name
        ? 'attention'
        : undefined;
  const loop = loopPiece(state, slot);
  const exitPoint = exitPointPiece(state, slot, isLast);
  return {
    kind: 'slot',
    ref: { kind: 'slot', name: slot.name },
    name: slot.name,
    unit: slot.unit,
    index,
    state: slotVisualState(state, slot.name),
    current:
      (state.current?.slot ?? state.summary.currentSlot) === slot.name &&
      state.summary.state !== 'completed',
    ...(marker && { marker }),
    attempts: record?.attempts ?? 0,
    skipped: record?.skipped ?? 0,
    cost: record?.cost ?? ZERO_COST,
    subPilots: (slot.subPilots ?? []).map((sub) => subPilotPiece(state, slot.name, sub.unit)),
    sideSlots: (slot.sideSlots ?? []).map((side) =>
      sideSlotPiece(state, sideSlotName(side), side.unit),
    ),
    ...(loop && { loop }),
    ...(exitPoint && { exitPoint }),
  };
}

/**
 * What a Slot's last execution came to; the Slot under way counts as running until it is done,
 * and the Slot that put the Mission into Needs Attention as failed.
 */
function slotVisualState(state: ReadyMissionState, name: string): SlotVisualState {
  const underWay = slotUnderWay(state.summary.state)
    ? (state.current?.slot ?? state.summary.currentSlot)
    : null;
  let visual = state.slotStatus[name] ?? 'pending';
  if (underWay === name && visual !== 'done') visual = 'running';
  if (state.attention?.slot === name) visual = 'failed';
  return visual;
}

/**
 * A Sub-pilot from the Slot's last Attempt: idle until it was called, running while it was called
 * and has not returned, done once it returned.
 */
function subPilotPiece(state: ReadyMissionState, slot: string, unit: string): SubPilotPiece {
  const activity = state.slots[slot]?.subPilots?.find((s) => s.unit === unit);
  const status =
    !activity || activity.calls === 0 ? 'idle' : activity.returns > 0 ? 'done' : 'running';
  return { kind: 'subPilot', ref: { kind: 'subPilot', slot, unit }, unit, status };
}

/** A Side Slot with the status its record gives; idle until it was started for the first time. */
function sideSlotPiece(state: ReadyMissionState, name: string, unit: string): SideSlotPiece {
  const record = state.sideSlots.find((s) => s.name === name);
  return {
    kind: 'sideSlot',
    ref: { kind: 'sideSlot', name },
    name,
    unit,
    status: record?.status ?? 'idle',
  };
}

/** The Loop of a looping Slot: rounds spent against the limit, and when it last fired. */
function loopPiece(state: ReadyMissionState, slot: AssemblySlot): LoopPiece | undefined {
  if (!slot.loop) return undefined;
  const firedAt = state.loopFiredAt[slot.name];
  return {
    kind: 'loop',
    ref: { kind: 'loop', slot: slot.name },
    to: slot.loop.target,
    iterations: state.slots[slot.name]?.loops ?? 0,
    limit:
      slot.loop.limit ?? state.assembly.core.defaultLoopLimit ?? DEFAULTS.core.defaultLoopLimit,
    ...(firedAt !== undefined && { firedAt }),
  };
}

/** The Exit Point of a flagged Slot or of the last one, lit when the Mission left through it. */
function exitPointPiece(
  state: ReadyMissionState,
  slot: AssemblySlot,
  isLast: boolean,
): ExitPointPiece | undefined {
  if (slot.exitPoint !== true && !isLast) return undefined;
  return {
    kind: 'exitPoint',
    ref: { kind: 'exitPoint', slot: slot.name },
    lit: state.result?.exitSlot === slot.name,
  };
}

/**
 * A stable string per element, for indexes and React keys: 'core', 'slot:<name>',
 * 'subPilot:<slot>/<unit>', 'sideSlot:<name>', 'loop:<slot>', 'exitPoint:<slot>'.
 */
export function elementKey(ref: ElementRef): string {
  switch (ref.kind) {
    case 'mission':
      return 'core';
    case 'slot':
      return `slot:${ref.name}`;
    case 'subPilot':
      return `subPilot:${ref.slot}/${ref.unit}`;
    case 'sideSlot':
      return `sideSlot:${ref.name}`;
    case 'loop':
      return `loop:${ref.slot}`;
    case 'exitPoint':
      return `exitPoint:${ref.slot}`;
  }
}

/**
 * The counter of a Loop: how many times the work went back, against the limit. Rounds past the
 * limit were granted by the Core or the Commander and are counted apart.
 */
export function loopBadge(iterations: number, limit: number): string {
  const granted = iterations - limit;
  // Short on purpose: the counter sits on the chord of the clock and by the arc of the Universe.
  return granted > 0 ? `Loop ${limit} of ${limit} +${granted}` : `Loop ${iterations} of ${limit}`;
}
