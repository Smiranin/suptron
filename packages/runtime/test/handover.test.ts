import { describe, expect, it } from 'vitest';
import { HANDOVER_PROMPT, readHandoverStatus, withHandover } from '../src/domain/handover.js';

describe('readHandoverStatus', () => {
  it('reads the Status of a Handover block', () => {
    const output =
      '# Report\n\n### Handover\nProduced: a.md\nDone: all\nOpen: nothing\nStatus: done';
    expect(readHandoverStatus(output)).toBe('done');
    expect(readHandoverStatus('Status: open')).toBe('open');
    expect(readHandoverStatus('Status: failed')).toBe('failed');
  });

  it('reads through the markdown a Pilot wraps the line in', () => {
    expect(readHandoverStatus('**Status:** `done`')).toBe('done');
    expect(readHandoverStatus('- **Status**: Open.')).toBe('open');
    expect(readHandoverStatus('  status : FAILED  ')).toBe('failed');
    expect(readHandoverStatus('#### Status: done')).toBe('done');
  });

  it('takes the last Status line', () => {
    expect(readHandoverStatus('Status: done\n\nlater\n\nStatus: open')).toBe('open');
  });

  it('is null without a Status line, and when the line names no single Status', () => {
    expect(readHandoverStatus('All written.')).toBeNull();
    expect(readHandoverStatus('The status: done, I think')).toBeNull();
    expect(readHandoverStatus('Status: done | open | failed')).toBeNull();
    expect(readHandoverStatus('Status: mostly done')).toBeNull();
    expect(readHandoverStatus('Status: done\nStatus: unsure')).toBeNull();
  });
});

describe('withHandover', () => {
  it("puts how to hand over after the Slot's Instructions", () => {
    expect(withHandover('  Write the plan.\n')).toBe(`Write the plan.\n\n${HANDOVER_PROMPT}`);
    expect(withHandover('')).toBe(HANDOVER_PROMPT);
  });

  it('shows a block whose Status line reads as done', () => {
    expect(readHandoverStatus(HANDOVER_PROMPT.split('\n\n')[2]!)).toBe('done');
  });
});
