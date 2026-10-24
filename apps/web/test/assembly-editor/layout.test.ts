import { describe, expect, it } from 'vitest';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  contextChords,
  insertionIndexAt,
  layoutClock,
  positionIndexAt,
} from '../../src/features/assembly-editor/model/layout';
import { distance } from '../../src/lib/geometry';
import { primaryAssembly } from '../fixtures/primary';

function slots(n: number) {
  return { slots: Array.from({ length: n }, (_, i) => ({ name: `s${i}`, unit: 'u' })) };
}

describe('layoutClock', () => {
  it.each([1, 3, 7, 12])('spaces %i Slots evenly after Start, clockwise', (n) => {
    const layout = layoutClock(slots(n));
    const step = 360 / (n + 1);
    layout.slots.forEach((slot, i) => {
      expect(slot.angle).toBeCloseTo(step * (i + 1));
      expect(distance(layout.center, slot.position)).toBeCloseTo(layout.radius);
    });
    expect(layout.start.angle).toBe(0);
    expect(layout.start.position.y).toBeCloseTo(layout.center.y - layout.radius);
    expect(layout.slots[0]!.position.x).toBeGreaterThanOrEqual(layout.center.x - 1e-9);
    if (n > 1) expect(layout.slots[0]!.position.x).toBeGreaterThan(layout.center.x);
    expect(layout.forwardArcs).toHaveLength(n);
    expect(layout.forwardArcs[0]).toMatchObject({ from: 'start', to: 's0' });
    expect(layout.plusPositions).toHaveLength(n + 1);
    expect(layout.exits.map((e) => e.slot)).toEqual([`s${n - 1}`]);
  });

  it('draws chords only for backward Loops and badges on them', () => {
    const layout = layoutClock(primaryAssembly());
    expect(layout.loops.map((l) => [l.from, l.to, l.limit])).toEqual([
      ['reviewer', 'implementer', 3],
      ['tester', 'implementer', 3],
      ['pr-reviewer', 'implementer', 3],
    ]);
    for (const loop of layout.loops)
      expect(distance(layout.center, loop.badgeAt)).toBeLessThan(layout.radius);
    const forward = layoutClock({
      slots: [
        { name: 'a', unit: 'u', loop: { target: 'b', limit: 3 } },
        { name: 'b', unit: 'u' },
      ],
    });
    expect(forward.loops).toEqual([]);
  });

  it('fit keeps every position plus card padding inside the viewport', () => {
    const layout = layoutClock(slots(12));
    const { scale, translate } = layout.fit({ width: 900, height: 600 });
    for (const slot of layout.slots) {
      const x = translate.x + slot.position.x * scale;
      const y = translate.y + slot.position.y * scale;
      expect(x - (CARD_WIDTH / 2) * scale).toBeGreaterThanOrEqual(0);
      expect(x + (CARD_WIDTH / 2) * scale).toBeLessThanOrEqual(900);
      expect(y - (CARD_HEIGHT / 2) * scale).toBeGreaterThanOrEqual(0);
      expect(y + (CARD_HEIGHT / 2) * scale).toBeLessThanOrEqual(600);
    }
  });

  it('insertionIndexAt and positionIndexAt map angles to gaps and positions', () => {
    const layout = layoutClock(slots(6));
    expect(insertionIndexAt(layout, 1)).toBe(0);
    expect(insertionIndexAt(layout, 359)).toBe(6);
    expect(insertionIndexAt(layout, layout.plusPositions[3]!.angle)).toBe(3);
    expect(positionIndexAt(layout, layout.slots[0]!.angle)).toBe(0);
    expect(positionIndexAt(layout, layout.slots[5]!.angle)).toBe(5);
    expect(positionIndexAt(layout, 2)).toBe(0);
    expect(positionIndexAt(layout, 358)).toBe(5);
  });

  it('contextChords draws dashed chords only from earlier read Slots', () => {
    const layout = layoutClock(primaryAssembly());
    expect(
      contextChords(layout, primaryAssembly(), 'implementer').map((c) => [c.from, c.to]),
    ).toEqual([['analyst', 'implementer']]);
    expect(contextChords(layout, primaryAssembly(), 'reviewer')).toEqual([]);
  });
});
