import type { MissionEvent } from '@suptron/runtime';
import { describe, expect, it } from 'vitest';
import { TranscriptStore } from '../src/transcript-store.js';

let seq = 0;
const m = 'm1';
function ev<T extends MissionEvent['type']>(
  type: T,
  fields: Omit<Extract<MissionEvent, { type: T }>, 'type' | 'missionId' | 'seq'>,
): MissionEvent {
  return { type, missionId: m, seq: ++seq, ...fields } as MissionEvent;
}

describe('TranscriptStore', () => {
  it('opens a section per execution with the right titles and keeps the Retry note first', () => {
    const store = new TranscriptStore(200, () => new Date('2026-10-23T10:00:00Z'));
    store.apply(ev('slot.started', { slot: 'implementer', attempt: 1 }));
    store.apply(ev('agent.text', { slot: 'implementer', payload: { type: 'text', text: 'hi' } }));
    store.apply(ev('slot.started', { slot: 'reviewer', attempt: 1 }));
    store.apply(
      ev('slot.started', {
        slot: 'implementer',
        attempt: 1,
        loopIteration: 1,
        loopFrom: 'reviewer',
      }),
    );
    store.apply(
      ev('slot.started', {
        slot: 'implementer',
        attempt: 2,
        loopIteration: 1,
        loopFrom: 'reviewer',
        note: 'be careful',
      }),
    );
    const sections = store.sections(m);
    expect(sections.map((s) => s.execution)).toEqual([
      { slot: 'implementer', attempt: 1 },
      { slot: 'reviewer', attempt: 1 },
      { slot: 'implementer', attempt: 1, loopIteration: 1, loopFrom: 'reviewer' },
      { slot: 'implementer', attempt: 2, loopIteration: 1, loopFrom: 'reviewer' },
    ]);
    expect(sections[3]!.entries[0]).toMatchObject({
      kind: 'note',
      text: 'be careful',
      at: '2026-10-23T10:00:00.000Z',
    });
    expect(sections[0]!.entries[0]).toMatchObject({ kind: 'text', text: 'hi', id: `${m}:2` });
  });

  it('merges a tool result into its call and records questions, answers, checks and errors', () => {
    const store = new TranscriptStore();
    store.apply(ev('slot.started', { slot: 'a', attempt: 1 }));
    store.apply(
      ev('agent.tool_call', {
        slot: 'a',
        payload: { type: 'tool_call', id: 't1', name: 'Bash', input: { command: 'ls' } },
      }),
    );
    store.apply(
      ev('agent.tool_result', {
        slot: 'a',
        payload: { type: 'tool_result', toolCallId: 't1', output: 'files', isError: false },
      }),
    );
    store.apply(
      ev('question.asked', {
        slot: 'a',
        questionId: 'q1',
        questions: [{ question: 'Q?', header: 'H', options: [], multiSelect: false }],
      }),
    );
    store.apply(ev('question.answered', { slot: 'a', questionId: 'q1', answers: { 'Q?': 'yes' } }));
    store.apply(
      ev('check.evaluated', {
        slot: 'a',
        check: { kind: 'pr_exists' },
        holds: false,
        detail: 'none',
      }),
    );
    store.apply(ev('agent.error', { slot: 'a', payload: { type: 'error', message: 'boom' } }));
    const [section] = store.sections(m);
    expect(section!.entries.map((e) => e.kind)).toEqual([
      'tool_call',
      'question',
      'answer',
      'check',
      'error',
    ]);
    expect(section!.entries[0]).toMatchObject({
      kind: 'tool_call',
      name: 'Bash',
      result: { output: 'files', isError: false },
    });
  });

  it('trims earlier sections to the last 200 entries and counts the dropped ones', () => {
    const store = new TranscriptStore();
    store.apply(ev('slot.started', { slot: 'a', attempt: 1 }));
    for (let i = 0; i < 250; i++)
      store.apply(ev('agent.text', { slot: 'a', payload: { type: 'text', text: `t${i}` } }));
    expect(store.sections(m)[0]!.entries).toHaveLength(250);
    store.apply(ev('slot.started', { slot: 'b', attempt: 1 }));
    const [first, second] = store.sections(m);
    expect(first!.entries).toHaveLength(200);
    expect(first!.dropped).toBe(50);
    expect(first!.entries[0]).toMatchObject({ kind: 'text', text: 't50' });
    expect(second!.entries).toHaveLength(0);
    store.apply(ev('mission.dismissed', {}));
    expect(store.sections(m)).toEqual([]);
  });
});
