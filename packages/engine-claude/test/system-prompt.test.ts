import { describe, expect, it } from 'vitest';
import {
  COMMANDER_CHANNEL_PROMPT,
  ClaudeEngine,
  SLOT_END_PROMPT,
  offeredModels,
  systemText,
  toolRefusal,
} from '../src/claude-engine.js';

const systemPrompt = { rules: '  Never push.\n', instructions: '\nWrite the plan.  ' };

describe('offeredModels', () => {
  it("leaves out Claude Code's machine default, which would make an Assembly depend on /model", () => {
    expect(
      offeredModels([
        { value: 'default', displayName: 'Default (recommended)' },
        { value: 'opus', displayName: 'Opus' },
        { value: '', displayName: 'nothing' },
      ]),
    ).toEqual([{ id: 'opus', displayName: 'Opus' }]);
  });
});

describe('systemText', () => {
  it('is what the Engine shows for a preview', () => {
    const spec = { role: 'pilot' as const, systemPrompt, allowQuestions: true };
    expect(new ClaudeEngine().systemText(spec)).toBe(systemText(spec));
  });

  it('gives the Core only its Rules and Instructions, trimmed', () => {
    const text = systemText({ role: 'core', systemPrompt, allowQuestions: false });
    expect(text).toBe('Never push.\n\nWrite the plan.');
  });

  it('tells every Pilot how a Slot ends', () => {
    const text = systemText({ role: 'pilot', systemPrompt, allowQuestions: false });
    expect(text).toBe(`Never push.\n\nWrite the plan.\n\n${SLOT_END_PROMPT}`);
    expect(text).not.toContain('AskUserQuestion');
  });

  it('tells a Pilot that may ask the Commander how to reach them', () => {
    const text = systemText({ role: 'pilot', systemPrompt, allowQuestions: true });
    expect(text).toBe(
      `Never push.\n\nWrite the plan.\n\n${SLOT_END_PROMPT}\n\n${COMMANDER_CHANNEL_PROMPT}`,
    );
    expect(COMMANDER_CHANNEL_PROMPT).toContain('AskUserQuestion');
  });

  it('never gives the Pilot paragraphs to the Core, whatever the flag says', () => {
    const text = systemText({ role: 'core', systemPrompt, allowQuestions: true });
    expect(text).not.toContain('Commander');
    expect(text).not.toContain('Slot');
  });
});

describe('toolRefusal', () => {
  it('refuses a background sub-agent', () => {
    expect(toolRefusal('Agent', { prompt: 'x', run_in_background: true })).toContain('background');
  });

  it('allows a foreground sub-agent and every other tool', () => {
    expect(toolRefusal('Agent', { prompt: 'x' })).toBeNull();
    expect(toolRefusal('Agent', { prompt: 'x', run_in_background: false })).toBeNull();
    expect(toolRefusal('Bash', { command: 'ls', run_in_background: true })).toBeNull();
  });
});
