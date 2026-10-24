import {
  executionId,
  type ExecutionKey,
  type MissionDetail,
  type MissionEvent,
  type TranscriptEntry,
  type TranscriptSection,
} from '@suptron/runtime/browser';
import type {
  MissionPageAction,
  MissionPageState,
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
    const active =
      detail.summary.state === 'running' || detail.summary.state === 'waiting_for_owner';
    if (active) status[current] = 'running';
  }
  if (detail.attention) status[detail.attention.slot] = 'failed';
  if (detail.result) status[detail.result.exitSlot] = 'done';
  return status;
}

export function initMissionPage(
  detail: MissionDetail,
  previous?: MissionPageState,
): ReadyMissionState {
  const prior = previous?.status === 'ready' ? previous : null;
  const keepSelection =
    prior &&
    (prior.panel.selection.kind === 'mission' ||
      detail.assembly.slots.some(
        (s) => prior.panel.selection.kind === 'slot' && s.name === prior.panel.selection.name,
      ));
  const panel = keepSelection
    ? { ...prior.panel, tab: defaultPanel(detail).tab }
    : defaultPanel(detail);
  return {
    status: 'ready',
    summary: detail.summary,
    assembly: detail.assembly,
    slots: Object.fromEntries(detail.slots.map((s) => [s.name, s])),
    slotOrder: [...detail.assembly.slots.map((s) => s.name), CORE],
    sections: detail.transcript.map((s) => ({ ...s, entries: [...s.entries] })),
    current: detail.transcript.at(-1)?.execution ?? null,
    slotStatus: statusFromDetail(detail),
    transcriptLost: detail.transcriptLost,
    ...(detail.pendingQuestion && { pendingQuestion: detail.pendingQuestion }),
    ...(detail.attention && { attention: detail.attention }),
    ...(detail.result && { result: detail.result }),
    loopFiredAt: prior?.loopFiredAt ?? {},
    seq: detail.seq,
    connection: previous?.connection ?? 'connecting',
    panel,
  };
}

function appendEntry(
  state: ReadyMissionState,
  event: MissionEvent,
  body: EntryBody,
): ReadyMissionState {
  const last = state.sections.at(-1);
  if (!last) return state;
  const entry = {
    id: `${event.missionId}:${event.seq}`,
    at: new Date().toISOString(),
    ...body,
  } as TranscriptEntry;
  const sections = [...state.sections];
  sections[sections.length - 1] = { ...last, entries: [...last.entries, entry] };
  return { ...state, sections };
}

function applyEvent(state: ReadyMissionState, event: MissionEvent, now: number): ReadyMissionState {
  if (event.seq <= state.seq) return state;
  const base: ReadyMissionState = { ...state, seq: event.seq };
  switch (event.type) {
    case 'mission.state': {
      const summary = { ...base.summary, state: event.state };
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
    case 'slot.started': {
      const execution: ExecutionKey = {
        slot: event.slot,
        attempt: event.attempt,
        ...(event.loopIteration !== undefined && { loopIteration: event.loopIteration }),
        ...(event.loopFrom !== undefined && { loopFrom: event.loopFrom }),
      };
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
      if (record) slots[event.slot] = { ...record, attempts: record.attempts + 1 };
      if (event.loopFrom && slots[event.loopFrom]) {
        const from = slots[event.loopFrom]!;
        slots[event.loopFrom] = {
          ...from,
          loops: Math.max(from.loops, event.loopIteration ?? from.loops + 1),
        };
      }
      const { attention: _dropped, ...rest } = base;
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
      return { ...base, slots, slotStatus: { ...base.slotStatus, [event.slot]: 'done' } };
    }
    case 'agent.text':
      return appendEntry(base, event, { kind: 'text', text: event.payload.text });
    case 'agent.tool_call':
      return appendEntry(base, event, {
        kind: 'tool_call',
        toolCallId: event.payload.id,
        name: event.payload.name,
        input: event.payload.input,
      });
    case 'agent.tool_result': {
      const last = base.sections.at(-1);
      const index =
        last?.entries.findIndex(
          (e) => e.kind === 'tool_call' && e.toolCallId === event.payload.toolCallId,
        ) ?? -1;
      if (!last || index === -1) {
        return appendEntry(base, event, {
          kind: 'tool_call',
          toolCallId: event.payload.toolCallId,
          name: '(result)',
          input: null,
          result: { output: event.payload.output, isError: event.payload.isError },
        });
      }
      const entries = [...last.entries];
      const call = entries[index]!;
      entries[index] = {
        ...call,
        result: { output: event.payload.output, isError: event.payload.isError },
      } as TranscriptEntry;
      const sections = [...base.sections];
      sections[sections.length - 1] = { ...last, entries };
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
      return {
        ...rest,
        panel: { ...next.panel, tab: next.panel.tab === 'question' ? 'main' : next.panel.tab },
      };
    }
    case 'cost.updated': {
      const slots = { ...base.slots };
      const record = slots[event.slot];
      if (record) slots[event.slot] = { ...record, cost: event.cost };
      return {
        ...base,
        slots,
        summary: { ...base.summary, cost: { ...event.missionTotal, estimated: true } },
      };
    }
    case 'mission.completed': {
      const slots = { ...base.slots };
      for (const record of event.slots) slots[record.name] = record;
      return {
        ...base,
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
      const { pendingQuestion: _q, attention: _a, ...rest } = base;
      void _q;
      void _a;
      return {
        ...rest,
        summary: {
          ...base.summary,
          state: 'stopped',
          currentSlot: null,
          ...(event.note && { note: event.note }),
        },
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
      return initMissionPage(action.detail, state);
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
