import type { AgentEvent } from '@suptron/runtime';
import { describe, expect, it } from 'vitest';
import { ActivityThrottle } from '../src/activity.js';

const thinking: AgentEvent = { type: 'activity', phase: 'thinking' };
const writing: AgentEvent = { type: 'activity', phase: 'writing' };
const read: AgentEvent = { type: 'activity', phase: 'tool', detail: 'Read' };
const bash: AgentEvent = { type: 'activity', phase: 'tool', detail: 'Bash' };

describe('ActivityThrottle', () => {
  it('passes a phase change at once and a repeat only after the interval', () => {
    let now = 0;
    const throttle = new ActivityThrottle(1000, () => now);
    expect(throttle.pass(thinking)).toBe(thinking);
    now = 300;
    expect(throttle.pass(thinking)).toBeNull();
    expect(throttle.pass(writing)).toBe(writing);
    now = 900;
    expect(throttle.pass(writing)).toBeNull();
    now = 1300;
    expect(throttle.pass(writing)).toBe(writing);
  });

  it('treats a different tool as a change', () => {
    const throttle = new ActivityThrottle(1000, () => 0);
    expect(throttle.pass(read)).toBe(read);
    expect(throttle.pass(bash)).toBe(bash);
    expect(throttle.pass(bash)).toBeNull();
  });

  it('passes every other event untouched and lets the next activity through again', () => {
    const throttle = new ActivityThrottle(1000, () => 0);
    expect(throttle.pass(thinking)).toBe(thinking);
    const text: AgentEvent = { type: 'text', text: 'done' };
    expect(throttle.pass(text)).toBe(text);
    expect(throttle.pass(thinking)).toBe(thinking);
  });
});
