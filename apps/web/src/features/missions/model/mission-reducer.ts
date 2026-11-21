import {
  SIDE_SLOTS_LEFT_OUT_NOTE,
  executionId,
  executionKeyOf,
  resolutionNote,
  sideSlotEndedNote,
  sideSlotName,
  type MissionDetail,
  type MissionEvent,
  type MissionSummary,
  type SideSlotRecord,
  type TranscriptEntry,
  type TranscriptSection,
} from '@suptron/runtime/browser';
import { slotUnderWay } from './selectors';
import type {
  LiveActivity,
  MissionPageAction,
  MissionPageState,
  PanelSelection,
  PanelState,
  ReadyMissionState,
  SlotVisualState,
} from './types';

export const initialMissionPageState: MissionPageState = {
  status: 'loading',
  connection: 'connecting',
};

const CORE = 'core';

type EntryBody = TranscriptEntry extends infer E
  ? E extends { id: string; at: string }
    ? Omit<E, 'id' | 'at'>
    : never
  : never;

function defaultPanel(detail: MissionDetail): PanelState {
  if (detail.summary.state === 'completed') {
    return { selection: { kind: 'mission' }, follow: false, tab: 'main', expanded: new Set() };
  }
  const slot =
    detail.summary.currentSlot ??
    detail.transcript.at(-1)?.execution.slot ??
    detail.assembly.slots[0]?.name;
  const tab = detail.pendingQuestion ? 'question' : detail.attention ? 'attention' : 'main';
  return {
    selection: slot ? { kind: 'slot', name: slot } : { kind: 'mission' },
    follow: true,
    tab,
    expanded: new Set(),
  };
}

/** Derives each Slot's visual state from what the detail knows (events refine it afterwards). */
function statusFromDetail(detail: MissionDetail): Record<string, SlotVisualState> {
  const status: Record<string, SlotVisualState> = {};
  for (const slot of detail.assembly.slots) status[slot.name] = 'pending';
  const touched = new Set(detail.transcript.map((s) => s.execution.slot));
  const records = new Map(detail.slots.map((s) => [s.name, s]));
  for (const slot of detail.slots) if (slot.attempts > 0) touched.add(slot.name);
  for (const name of touched) {
    if (!(name in status)) continue;
    status[name] = records.get(name)?.lastOutput !== undefined ? 'done' : 'failed';
  }
  const current = detail.summary.currentSlot;
  if (current && current in status) {
    if (slotUnderWay(detail.summary.state)) status[current] = 'running';
  }
  if (detail.attention) status[detail.attention.slot] = 'failed';
  if (detail.result) status[detail.result.exitSlot] = 'done';
  return status;
}

export function initMissionPage(
  detail: MissionDetail,
  previous?: MissionPageState,
  now: number = Date.now(),
): ReadyMissionState {
  const prior = previous?.status === 'ready' ? previous : null;
  const keepSelection = prior && selectionExists(prior.panel.selection, detail);
  const panel = keepSelection
    ? { ...prior.panel, tab: defaultPanel(detail).tab }
    : defaultPanel(detail);
  return {
    status: 'ready',
    summary: detail.summary,
    assembly: detail.assembly,
    slots: Object.fromEntries(detail.slots.map((s) => [s.name, s])),
    sideSlots: detail.sideSlots,
    slotOrder: [...detail.assembly.slots.map((s) => s.name), CORE],
    sections: detail.transcript.map((s) => ({ ...s, entries: [...s.entries] })),
    current: detail.transcript.at(-1)?.execution ?? null,
    slotStatus: statusFromDetail(detail),
    transcriptLost: detail.transcriptLost,
    resumable: detail.resumable,
    ...(detail.pendingQuestion && { pendingQuestion: detail.pendingQuestion }),
    ...(detail.attention && { attention: detail.attention }),
    ...(detail.result && { result: detail.result }),
    loopFiredAt: prior?.loopFiredAt ?? {},
    lastEventAt: now,
    seq: detail.seq,
    connection: previous?.connection ?? 'connecting',
    panel,
  };
}

/** True when what the panel shows still exists in the Mission's Assembly. */
function selectionExists(selection: PanelSelection, detail: MissionDetail): boolean {
  const slots = detail.assembly.slots;
  switch (selection.kind) {
    case 'mission':
      return true;
    case 'slot':
      return slots.some((s) => s.name === selection.name);
    case 'sideSlot':
      return slots.some((s) => (s.sideSlots ?? []).some((x) => sideSlotName(x) === selection.name));
    case 'subPilot':
      return slots.some(
        (s) =>
          s.name === selection.slot && (s.subPilots ?? []).some((x) => x.unit === selection.unit),
      );
  }
}

/** The record of a Side Slot after `change`; one not seen yet starts from the Assembly. */
function withSideSlot(
  state: ReadyMissionState,
  name: string,
  parent: string,
  change: (record: SideSlotRecord) => SideSlotRecord,
): SideSlotRecord[] {
  const known = state.sideSlots.find((s) => s.name === name);
  const unit =
    state.assembly.slots
      .find((s) => s.name === parent)
      ?.sideSlots?.find((s) => sideSlotName(s) === name)?.unit ?? name;
  const record = change(
    known ?? {
      name,
      parent,
      unit,
      status: 'waiting',
      starts: 0,
      cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
    },
  );
  if (known) return state.sideSlots.map((s) => (s.name === name ? record : s));
  // Kept in Assembly order, as the server lists them.
  const order = state.assembly.slots.flatMap((s) => (s.sideSlots ?? []).map(sideSlotName));
  return [...state.sideSlots, record].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
}

/** The transcript row of a Slot that is done through its Loop's Accept Condition. */
export const ACCEPTED_AT_LIMIT_NOTE =
  'Accepted at the Loop limit: the Done Condition still fails, the Accept Condition holds.';

/**
 * The index of the section an event belongs in: the latest one of the Slot it names, since a
 * Side Slot works while the ordered list goes on. An event without a Slot, or of a Slot without
 * a section yet, goes into the last one; -1 when there is none.
 */
function sectionIndexFor(state: ReadyMissionState, event: MissionEvent): number {
  const slot = 'slot' in event ? event.slot : undefined;
  const index = state.sections.findLastIndex((s) => s.execution.slot === slot);
  return index === -1 ? state.sections.length - 1 : index;
}

function appendEntry(
  state: ReadyMissionState,
  event: MissionEvent,
  body: EntryBody,
): ReadyMissionState {
  const index = sectionIndexFor(state, event);
  const target = state.sections[index];
  if (!target) return state;
  const entry = {
    id: `${event.missionId}:${event.seq}`,
    at: new Date().toISOString(),
    ...body,
  } as TranscriptEntry;
  const sections = [...state.sections];
  sections[index] = { ...target, entries: [...target.entries, entry] };
  // A real entry ends whatever the live row was showing.
  return withoutActivity({ ...state, sections });
}

/** The Slot records after a Sub-pilot was called or returned; an error return is not counted. */
function withSubPilotEvent(
  slots: ReadyMissionState['slots'],
  event: Extract<MissionEvent, { type: 'agent.sub_pilot_called' | 'agent.sub_pilot_returned' }>,
): ReadyMissionState['slots'] {
  const record = slots[event.slot];
  if (!record) return slots;
  const called = event.type === 'agent.sub_pilot_called';
  const counted = called || !event.isError;
  const list = record.subPilots ?? [];
  const known = list.some((sub) => sub.unit === event.subPilot);
  const subPilots = (known ? list : [...list, { unit: event.subPilot, calls: 0, returns: 0 }]).map(
    (sub) =>
      sub.unit !== event.subPilot || !counted
        ? sub
        : called
          ? { ...sub, calls: sub.calls + 1 }
          : { ...sub, returns: sub.returns + 1 },
  );
  return { ...slots, [event.slot]: { ...record, subPilots } };
}

function withoutActivity(state: ReadyMissionState): ReadyMissionState {
  if (state.activity === undefined) return state;
  const { activity: _dropped, ...rest } = state;
  void _dropped;
  return rest;
}

function withoutCoreActivity(state: ReadyMissionState): ReadyMissionState {
  if (state.coreActivity === undefined) return state;
  const { coreActivity: _dropped, ...rest } = state;
  void _dropped;
  return rest;
}

/** A Mission that stops, completes or resumes has no sign of life of anyone left. */
function withoutAnyActivity(state: ReadyMissionState): ReadyMissionState {
  return withoutCoreActivity(withoutActivity(state));
}

/** The sign of life after `event`; a repeated frame of the same phase keeps when the phase began. */
function nextActivity(
  previous: LiveActivity | undefined,
  event: Extract<MissionEvent, { type: 'agent.activity' }>,
  now: number,
): LiveActivity {
  const { phase, detail } = event.payload;
  const same =
    previous !== undefined &&
    previous.slot === event.slot &&
    previous.phase === phase &&
    previous.detail === detail;
  return {
    slot: event.slot,
    phase,
    ...(detail !== undefined && { detail }),
    since: same ? previous.since : now,
  };
}

/** The summary after a `mission.state`: the reset time lives only in Waiting for usage. */
export function withState(
  summary: MissionSummary,
  event: Extract<MissionEvent, { type: 'mission.state' }>,
): MissionSummary {
  const { usageResetsAt: _dropped, ...rest } = summary;
  void _dropped;
  return {
    ...rest,
    state: event.state,
    ...(event.state === 'waiting_for_usage' &&
      event.resetsAt !== undefined && { usageResetsAt: event.resetsAt }),
  };
}

function applyEvent(state: ReadyMissionState, event: MissionEvent, now: number): ReadyMissionState {
  if (event.seq <= state.seq) return state;
  const base: ReadyMissionState = { ...state, seq: event.seq, lastEventAt: now };
  switch (event.type) {
    case 'agent.activity': {
      // The Core's signs of life are kept apart, so the live row does not take the Core for the current Slot.
      if (event.slot === CORE) {
        return { ...base, coreActivity: nextActivity(base.coreActivity, event, now) };
      }
      // The live row follows the ordered list; a Side Slot's signs of life are not shown there.
      if (!(event.slot in base.slots)) return base;
      return { ...base, activity: nextActivity(base.activity, event, now) };
    }
    case 'core.idle':
      return withoutCoreActivity(base);
    case 'mission.state': {
      const summary = withState(base.summary, event);
      if (event.state === 'needs_attention') {
        const attention = {
          cause: event.cause ?? 'engine_error',
          reason: event.reason ?? '',
          slot: event.slot ?? base.current?.slot ?? '',
          failedChecks: event.failedChecks ?? [],
        };
        return {
          ...base,
          summary,
          attention,
          slotStatus: { ...base.slotStatus, [attention.slot]: 'failed' },
          panel: { ...base.panel, tab: 'attention' },
        };
      }
      if (event.state === 'running') {
        const { attention: _dropped, ...rest } = base;
        void _dropped;
        return {
          ...rest,
          summary,
          panel: base.panel.tab === 'attention' ? { ...base.panel, tab: 'main' } : base.panel,
        };
      }
      return { ...base, summary };
    }
    case 'mission.resumed': {
      const { attention: _a, pendingQuestion: _q, ...rest } = withoutAnyActivity(base);
      void _a;
      void _q;
      return { ...rest, summary: event.mission, resumable: false };
    }
    case 'slot.started': {
      const execution = executionKeyOf(event);
      const section: TranscriptSection = { execution, entries: [], dropped: 0 };
      if (event.note !== undefined) {
        section.entries.push({
          id: `${event.missionId}:${event.seq}`,
          at: new Date().toISOString(),
          kind: 'note',
          text: event.note,
        });
      }
      const slotStatus = { ...base.slotStatus };
      const previous = base.current?.slot;
      if (previous && previous !== event.slot && slotStatus[previous] === 'running')
        slotStatus[previous] = 'failed';
      slotStatus[event.slot] = 'running';
      const loopFiredAt = event.loopFrom
        ? { ...base.loopFiredAt, [event.loopFrom]: now }
        : base.loopFiredAt;
      const slots = { ...base.slots };
      const record = slots[event.slot];
      if (record) {
        slots[event.slot] = {
          ...record,
          attempts: record.attempts + 1,
          // The Sub-pilots are counted per Attempt, as in the Runner.
          ...(record.subPilots && {
            subPilots: record.subPilots.map((sub) => ({ ...sub, calls: 0, returns: 0 })),
          }),
        };
      }
      if (event.loopFrom && slots[event.loopFrom]) {
        // A round of this Loop is new work: the Loops inside it count from zero, as in the Runner.
        const order = base.assembly.slots.map((s) => s.name);
        for (const inner of order.slice(order.indexOf(event.slot), order.indexOf(event.loopFrom))) {
          if (slots[inner]) slots[inner] = { ...slots[inner], loops: 0 };
        }
        const from = slots[event.loopFrom]!;
        slots[event.loopFrom] = { ...from, loops: event.loopIteration ?? from.loops + 1 };
      }
      const { attention: _dropped, ...rest } = withoutActivity(base);
      void _dropped;
      const panel: PanelState = {
        ...base.panel,
        tab: base.panel.tab === 'attention' ? 'main' : base.panel.tab,
        selection: base.panel.follow ? { kind: 'slot', name: event.slot } : base.panel.selection,
      };
      return {
        ...rest,
        summary: {
          ...base.summary,
          currentSlot: event.slot,
          state: base.summary.state === 'needs_attention' ? 'running' : base.summary.state,
        },
        sections: [...base.sections, section],
        current: execution,
        slotStatus,
        loopFiredAt,
        slots,
        panel,
      };
    }
    case 'slot.done': {
      const slots = { ...base.slots };
      const record = slots[event.slot];
      if (record) slots[event.slot] = { ...record, lastOutput: event.output };
      const next: ReadyMissionState = withoutActivity({
        ...base,
        slots,
        slotStatus: { ...base.slotStatus, [event.slot]: 'done' },
      });
      return event.acceptedAtLimit
        ? appendEntry(next, event, { kind: 'note', text: ACCEPTED_AT_LIMIT_NOTE })
        : next;
    }
    case 'slot.skipped': {
      const record = base.slots[event.slot];
      if (!record) return base;
      return {
        ...base,
        slots: { ...base.slots, [event.slot]: { ...record, skipped: (record.skipped ?? 0) + 1 } },
      };
    }
    case 'core.resolved': {
      const next = appendEntry(base, event, {
        kind: 'note',
        text: resolutionNote(event.resolution),
      });
      const record = next.slots[event.slot];
      if (!record) return next;
      return {
        ...next,
        slots: {
          ...next.slots,
          [event.slot]: {
            ...record,
            resolutions: [...(record.resolutions ?? []), event.resolution],
          },
        },
      };
    }
    case 'agent.text':
      return appendEntry(base, event, {
        kind: 'text',
        text: event.payload.text,
        ...(event.payload.agent && { agent: event.payload.agent }),
      });
    case 'agent.tool_call':
      return appendEntry(base, event, {
        kind: 'tool_call',
        toolCallId: event.payload.id,
        name: event.payload.name,
        input: event.payload.input,
        ...(event.payload.agent && { agent: event.payload.agent }),
      });
    case 'agent.sub_pilot_called':
    case 'agent.sub_pilot_returned':
      return { ...base, slots: withSubPilotEvent(base.slots, event) };
    case 'agent.tool_result': {
      const sectionIndex = sectionIndexFor(base, event);
      const target = base.sections[sectionIndex];
      const index =
        target?.entries.findIndex(
          (e) => e.kind === 'tool_call' && e.toolCallId === event.payload.toolCallId,
        ) ?? -1;
      if (!target || index === -1) {
        return appendEntry(base, event, {
          kind: 'tool_call',
          toolCallId: event.payload.toolCallId,
          name: '(result)',
          input: null,
          result: { output: event.payload.output, isError: event.payload.isError },
          ...(event.payload.agent && { agent: event.payload.agent }),
        });
      }
      const entries = [...target.entries];
      const call = entries[index]!;
      entries[index] = {
        ...call,
        result: { output: event.payload.output, isError: event.payload.isError },
      } as TranscriptEntry;
      const sections = [...base.sections];
      sections[sectionIndex] = { ...target, entries };
      return { ...base, sections };
    }
    case 'agent.error':
      return appendEntry(base, event, { kind: 'error', message: event.payload.message });
    case 'check.evaluated': {
      const next = appendEntry(base, event, {
        kind: 'check',
        check: event.check,
        holds: event.holds,
        detail: event.detail,
      });
      const record = next.slots[event.slot];
      if (!record) return next;
      return {
        ...next,
        slots: {
          ...next.slots,
          [event.slot]: {
            ...record,
            checkResults: [
              ...record.checkResults,
              { check: event.check, holds: event.holds, detail: event.detail },
            ],
          },
        },
      };
    }
    case 'question.asked': {
      const next = appendEntry(base, event, {
        kind: 'question',
        questionId: event.questionId,
        questions: event.questions,
      });
      return {
        ...next,
        pendingQuestion: { id: event.questionId, slot: event.slot, questions: event.questions },
        panel: { ...next.panel, tab: 'question' },
      };
    }
    case 'question.answered': {
      const next = appendEntry(base, event, {
        kind: 'answer',
        questionId: event.questionId,
        answers: event.answers,
      });
      const { pendingQuestion: _dropped, ...rest } = next;
      void _dropped;
      // The Commander wants to see what their answer sets in motion: follow the Slot that asked.
      return {
        ...rest,
        panel: {
          ...next.panel,
          tab: next.panel.tab === 'question' ? 'main' : next.panel.tab,
          selection: { kind: 'slot', name: event.slot },
          follow: true,
        },
      };
    }
    case 'cost.updated': {
      const slots = { ...base.slots };
      const record = slots[event.slot];
      if (record) slots[event.slot] = { ...record, cost: event.cost };
      const sideSlots = base.sideSlots.map((s) =>
        s.name === event.slot ? { ...s, cost: event.cost } : s,
      );
      return {
        ...base,
        slots,
        sideSlots,
        summary: { ...base.summary, cost: { ...event.missionTotal, estimated: true } },
      };
    }
    case 'side_slot.waiting':
      return {
        ...base,
        sideSlots: withSideSlot(base, event.slot, event.parent, (record) => {
          const { note: _dropped, ...rest } = record;
          void _dropped;
          return { ...rest, status: 'waiting' };
        }),
      };
    case 'side_slot.started': {
      const section: TranscriptSection = {
        execution: { slot: event.slot, attempt: event.attempt },
        sideSlotOf: event.parent,
        entries: [],
        dropped: 0,
      };
      return {
        ...base,
        sections: [...base.sections, section],
        sideSlots: withSideSlot(base, event.slot, event.parent, (record) => {
          const { note: _dropped, ...rest } = record;
          void _dropped;
          return { ...rest, status: 'running', starts: event.attempt };
        }),
      };
    }
    case 'side_slot.ended': {
      const next = appendEntry(base, event, {
        kind: 'note',
        text: sideSlotEndedNote(event.status, event.note),
      });
      return {
        ...next,
        sideSlots: withSideSlot(next, event.slot, event.parent, (record) => ({
          ...record,
          status: event.status,
          ...(event.note !== undefined && { note: event.note }),
        })),
      };
    }
    case 'side_slots.left_out':
      return appendEntry(base, event, { kind: 'note', text: SIDE_SLOTS_LEFT_OUT_NOTE });
    case 'mission.reported':
      // The report is there while the Mission waits for its Side Slots, still Running.
      return {
        ...withoutActivity(base),
        summary: {
          ...base.summary,
          currentSlot: null,
          ...(event.result.pr && { pr: event.result.pr }),
        },
        result: event.result,
        slotStatus: { ...base.slotStatus, [event.result.exitSlot]: 'done' },
      };
    case 'mission.completed': {
      const slots = { ...base.slots };
      for (const record of event.slots) slots[record.name] = record;
      return {
        ...withoutAnyActivity(base),
        slots,
        summary: {
          ...base.summary,
          state: 'completed',
          currentSlot: null,
          cost: { ...event.cost, estimated: true },
          ...(event.pr && { pr: event.pr }),
        },
        result: { report: event.report, pr: event.pr, exitSlot: event.exitSlot },
        slotStatus: { ...base.slotStatus, [event.exitSlot]: 'done' },
        panel: { ...base.panel, selection: { kind: 'mission' }, follow: false, tab: 'main' },
      };
    }
    case 'mission.stopped': {
      const { pendingQuestion: _q, attention: _a, ...rest } = withoutAnyActivity(base);
      void _q;
      void _a;
      const { usageResetsAt: _u, ...summary } = base.summary;
      void _u;
      return {
        ...rest,
        summary: {
          ...summary,
          state: 'stopped',
          currentSlot: null,
          ...(event.note && { note: event.note }),
        },
        // The server keeps what a Mission it has just stopped needs to go on.
        resumable: true,
        panel: { ...base.panel, tab: 'main' },
      };
    }
    default:
      return base;
  }
}

/** The pure reducer of one Mission page; components never change state any other way. */
export function reduceMissionPage(
  state: MissionPageState,
  action: MissionPageAction,
): MissionPageState {
  switch (action.type) {
    case 'init':
      return initMissionPage(action.detail, state, action.now);
    case 'absent':
      return { status: 'absent', connection: state.connection };
    case 'connection':
      return state.connection === action.status ? state : { ...state, connection: action.status };
    case 'event':
      return state.status === 'ready'
        ? applyEvent(state, action.event, action.now ?? Date.now())
        : state;
    case 'selectSlot':
      if (state.status !== 'ready') return state;
      return {
        ...state,
        panel: {
          ...state.panel,
          selection: { kind: 'slot', name: action.name },
          follow: false,
          tab: 'main',
        },
      };
    case 'selectMission':
      if (state.status !== 'ready') return state;
      return {
        ...state,
        panel: { ...state.panel, selection: { kind: 'mission' }, follow: false, tab: 'main' },
      };
    case 'selectSideSlot':
      if (state.status !== 'ready') return state;
      return {
        ...state,
        panel: {
          ...state.panel,
          selection: { kind: 'sideSlot', name: action.name },
          follow: false,
          tab: 'main',
        },
      };
    case 'selectSubPilot':
      if (state.status !== 'ready') return state;
      return {
        ...state,
        panel: {
          ...state.panel,
          selection: { kind: 'subPilot', slot: action.slot, unit: action.unit },
          follow: false,
          tab: 'main',
        },
      };
    case 'backToCurrent': {
      if (state.status !== 'ready') return state;
      const current = state.current?.slot ?? state.summary.currentSlot;
      return {
        ...state,
        panel: {
          ...state.panel,
          follow: true,
          selection: current ? { kind: 'slot', name: current } : { kind: 'mission' },
        },
      };
    }
    case 'setTab':
      if (state.status !== 'ready') return state;
      return { ...state, panel: { ...state.panel, tab: action.tab } };
    case 'toggleSection': {
      if (state.status !== 'ready') return state;
      const expanded = new Set(state.panel.expanded);
      if (expanded.has(action.executionId)) expanded.delete(action.executionId);
      else expanded.add(action.executionId);
      return { ...state, panel: { ...state.panel, expanded } };
    }
    default:
      return state;
  }
}

export { executionId };
