import type { MissionEvent } from '@suptron/runtime';
import { describe, expect, it } from 'vitest';
import { EventHub } from '../src/sse.js';

describe('EventHub', () => {
  it('replays buffered events after a seq but never a sign of life', () => {
    const hub = new EventHub();
    const text: MissionEvent = {
      type: 'agent.text',
      missionId: 'm',
      seq: 1,
      slot: 'a',
      payload: { type: 'text', text: 'hi' },
    };
    const activity: MissionEvent = {
      type: 'agent.activity',
      missionId: 'm',
      seq: 2,
      slot: 'a',
      payload: { type: 'activity', phase: 'thinking' },
    };
    const done: MissionEvent = {
      type: 'slot.done',
      missionId: 'm',
      seq: 3,
      slot: 'a',
      output: 'ok',
    };
    hub.publish(text);
    hub.publish(activity);
    hub.publish(done);
    expect(hub.buffered('m', 0).events.map((e) => e.seq)).toEqual([1, 3]);
    expect(hub.buffered('m', 1)).toEqual({ events: [done], gap: false });
  });
});
