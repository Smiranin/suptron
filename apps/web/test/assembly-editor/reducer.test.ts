import { describe, expect, it } from 'vitest';
import { reduce, type Command } from '../../src/features/assembly-editor/model/reducer';
import {
  cardSummary,
  effectiveSlot,
  unitIndex,
} from '../../src/features/assembly-editor/model/selectors';
import { validate } from '../../src/features/assembly-editor/model/validate';
import { primaryAssembly, primaryUnits } from '../fixtures/primary';

const ctx = { defaultLoopLimit: 3 };
const run = (...cmds: Command[]) =>
  cmds.reduce((doc, cmd) => reduce(doc, cmd, ctx), primaryAssembly());
const names = (doc: ReturnType<typeof primaryAssembly>) => doc.slots.map((s) => s.name);

describe('reduce', () => {
  it('addSlot names the Slot after its Unit with a numeric suffix when taken', () => {
    const doc = run(
      { type: 'addSlot', unit: 'tester', index: 1 },
      { type: 'addSlot', unit: 'tester', index: 1 },
    );
    expect(names(doc)).toEqual([
      'analyst',
      'tester-3',
      'tester-2',
      'implementer',
      'reviewer',
      'tester',
      'publisher',
      'pr-reviewer',
    ]);
    const appended = run({ type: 'addSlot', unit: 'analyst', index: 99 });
    expect(names(appended).at(-1)).toBe('analyst-2');
    expect(appended.slots.at(-1)?.exitPoint).toBe(true);
    expect(appended.slots.at(-2)?.exitPoint).toBe(true);
  });

  it('moveSlot reorders and turns the new last Slot into an Exit Point while the old one keeps its flag (FR-40)', () => {
    const doc = run({ type: 'moveSlot', name: 'pr-reviewer', toIndex: 0 });
    expect(names(doc)).toEqual([
      'pr-reviewer',
      'analyst',
      'implementer',
      'reviewer',
      'tester',
      'publisher',
    ]);
    expect(doc.slots[0]?.exitPoint).toBe(true);
    expect(doc.slots.at(-1)).toMatchObject({ name: 'publisher', exitPoint: true });
    expect(validate(doc, primaryUnits()).errors.map((e) => e.code)).toContain(
      'exit_condition_required',
    );
    expect(reduce(primaryAssembly(), { type: 'moveSlot', name: 'nope', toIndex: 1 }, ctx)).toEqual(
      primaryAssembly(),
    );
  });

  it('removeSlot strips Loop targets and slotOutputs that point at it (FR-28)', () => {
    const doc = run({ type: 'removeSlot', name: 'implementer' });
    expect(names(doc)).toEqual(['analyst', 'reviewer', 'tester', 'publisher', 'pr-reviewer']);
    expect(doc.slots.every((s) => s.loop === undefined)).toBe(true);
    const noAnalyst = run({ type: 'removeSlot', name: 'analyst' });
    expect(noAnalyst.slots.find((s) => s.name === 'implementer')?.context).toBeUndefined();
    const last = run({ type: 'removeSlot', name: 'pr-reviewer' });
    expect(last.slots.at(-1)).toMatchObject({ name: 'publisher', exitPoint: true });
  });

  it('renameSlot rewrites every reference', () => {
    const doc = run({ type: 'renameSlot', name: 'implementer', newName: 'builder' });
    expect(names(doc)[1]).toBe('builder');
    expect(doc.slots.filter((s) => s.loop?.target === 'builder')).toHaveLength(3);
    const withOutput = run({ type: 'renameSlot', name: 'analyst', newName: 'planner' });
    expect(withOutput.slots[1]?.context?.slotOutputs).toEqual(['planner']);
    expect(run({ type: 'renameSlot', name: 'analyst', newName: 'tester' })).toEqual(
      primaryAssembly(),
    );
  });

  it('patchSlot removes a field when the patch value is undefined', () => {
    const doc = run(
      { type: 'patchSlot', name: 'reviewer', patch: { model: 'opus' } },
      { type: 'patchSlot', name: 'reviewer', patch: { model: undefined } },
    );
    expect('model' in doc.slots[2]!).toBe(false);
  });

  it('setLoop defaults the limit and null removes it', () => {
    const doc = run({
      type: 'setLoop',
      name: 'publisher',
      loop: { target: 'implementer', limit: 0 },
    });
    expect(doc.slots[4]?.loop).toEqual({ target: 'implementer', limit: 3 });
    const removed = reduce(doc, { type: 'setLoop', name: 'publisher', loop: null }, ctx);
    expect(removed.slots[4]?.loop).toBeUndefined();
  });

  it('patchCore and replaceDoc', () => {
    expect(run({ type: 'patchCore', patch: { model: 'sonnet' } }).core.model).toBe('sonnet');
    const other = { ...primaryAssembly(), name: 'other' };
    expect(run({ type: 'replaceDoc', doc: other })).toBe(other);
  });

  it('every result keeps names unique, the last Slot an Exit Point and no dangling references', () => {
    const commands: Command[] = [
      { type: 'addSlot', unit: 'reviewer', index: 2 },
      { type: 'moveSlot', name: 'analyst', toIndex: 5 },
      { type: 'removeSlot', name: 'tester' },
      { type: 'renameSlot', name: 'reviewer-2', newName: 'second-review' },
      { type: 'setLoop', name: 'second-review', loop: { target: 'implementer', limit: 2 } },
      { type: 'removeSlot', name: 'implementer' },
    ];
    let doc = primaryAssembly();
    for (const cmd of commands) {
      doc = reduce(doc, cmd, ctx);
      const slotNames = names(doc);
      expect(new Set(slotNames).size).toBe(slotNames.length);
      expect(doc.slots.at(-1)?.exitPoint).toBe(true);
      for (const slot of doc.slots) {
        if (slot.loop) expect(slotNames).toContain(slot.loop.target);
        for (const ref of slot.context?.slotOutputs ?? []) expect(slotNames).toContain(ref);
      }
    }
  });
});

describe('selectors', () => {
  const units = unitIndex(primaryUnits());

  it('resolves effective values with their source', () => {
    const doc = run({ type: 'patchSlot', name: 'reviewer', patch: { model: 'sonnet' } });
    const reviewer = effectiveSlot(doc, doc.slots[2]!, units);
    expect(reviewer.model).toEqual({ value: 'sonnet', source: 'slot', inherited: 'opus' });
    expect(reviewer.doneCondition.source).toBe('unit');
    expect(reviewer.memoryMode).toEqual({ value: 'fresh', source: 'default', inherited: 'fresh' });
    const implementer = effectiveSlot(doc, doc.slots[1]!, units);
    expect(implementer.memoryMode.source).toBe('slot');
    expect(implementer.attemptLimit).toEqual({ value: 2, source: 'default', inherited: 2 });
  });

  it('summarizes a card', () => {
    const doc = primaryAssembly();
    expect(cardSummary(doc, doc.slots[2]!, units, true)).toEqual({
      name: 'reviewer',
      unitName: 'reviewer',
      showUnit: false,
      model: 'opus',
      mayAskCommander: false,
      persistent: false,
      doneSummary: 'judgment: No blocking findings remain in the review.',
      loopBadge: '↩ implementer, max 3',
      hasErrors: true,
    });
    expect(cardSummary(doc, doc.slots[1]!, units, false)).toMatchObject({
      persistent: true,
      doneSummary: 'pnpm test',
    });
  });

  it('validate groups errors by Slot', () => {
    const doc = run({
      type: 'patchSlot',
      name: 'analyst',
      patch: { loop: { target: 'tester', limit: 3 } },
    });
    const issues = validate(doc, primaryUnits());
    expect(issues.bySlot.get('analyst')?.[0]?.code).toBe('loop_target_not_earlier');
    expect(issues.errors).toHaveLength(1);
  });
});
