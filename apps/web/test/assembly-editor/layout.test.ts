import { describe, expect, it } from 'vitest';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  contextChords,
  insertionIndexAt,
  layoutClock,
  positionIndexAt,
} from '../../src/features/assembly-editor/model/layout';
import {
  EXIT_LABEL_HEIGHT,
  EXIT_LABEL_WIDTH,
  PLATE_HEIGHT,
  PLATE_WIDTH,
} from '../../src/features/clock/layout';
import { distance, type Point } from '../../src/lib/geometry';
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

  /** n Slots, each an Exit Point (so each draws a label), with up to three of each attached kind. */
  function attached(n: number, count: number, exits: boolean) {
    return {
      slots: Array.from({ length: n }, (_, i) => ({
        name: `s${i}`,
        unit: 'u',
        ...(exits && { exitPoint: true }),
        subPilots: Array.from({ length: count }, (_, j) => ({ unit: `sub-${j}` })),
        sideSlots: Array.from({ length: count }, (_, j) => ({ name: `side-${i}-${j}`, unit: 'u' })),
      })),
    };
  }

  interface Box {
    what: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }
  const box = (what: string, at: Point, w: number, h: number): Box => ({
    what,
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
  });
  const overlap = (a: Box, b: Box) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it.each(
    [1, 2, 3, 4, 5, 6, 7, 8].flatMap((n) =>
      [1, 3].flatMap((c) => [
        [n, c, true],
        [n, c, false],
      ]),
    ),
  )(
    'lays out %i Slots with %i of each attached kind (exits: %s) without overlaps',
    (n, count, exits) => {
      const doc = attached(n as number, count as number, exits as boolean);
      const layout = layoutClock(doc);
      expect(layout.attached).toHaveLength((n as number) * (count as number) * 2);
      const boxes: Box[] = [
        ...layout.slots.map((s) => box(`card ${s.name}`, s.position, CARD_WIDTH, CARD_HEIGHT)),
        ...layout.exits.map((e) =>
          box(`label ${e.slot}`, e.labelAt, EXIT_LABEL_WIDTH, EXIT_LABEL_HEIGHT),
        ),
        ...layout.attached.map((p) =>
          box(`plate ${p.slot}/${p.kind}/${p.name}`, p.position, PLATE_WIDTH, PLATE_HEIGHT),
        ),
      ];
      // Cards and Exit labels are laid out as before; only what the plates add is judged here.
      for (const [i, a] of boxes.entries()) {
        for (const b of boxes.slice(i + 1)) {
          if (!a.what.startsWith('plate') && !b.what.startsWith('plate')) continue;
          expect(overlap(a, b), `${a.what} overlaps ${b.what}`).toBe(false);
        }
      }
      for (const plate of layout.attached) {
        expect(plate.position.x - PLATE_WIDTH / 2).toBeGreaterThanOrEqual(0);
        expect(plate.position.y - PLATE_HEIGHT / 2).toBeGreaterThanOrEqual(0);
        expect(plate.position.x + PLATE_WIDTH / 2).toBeLessThanOrEqual(layout.box.width);
        expect(plate.position.y + PLATE_HEIGHT / 2).toBeLessThanOrEqual(layout.box.height);
      }
    },
  );

  it('puts Sub-pilots and Side Slots on either side of the radial axis', () => {
    const layout = layoutClock(attached(1, 1, true));
    const [sub, side] = layout.attached;
    const slot = layout.slots[0]!;
    // the single Slot sits at 6 o'clock, where the ring runs on to the left: Side Slots come
    // after the Slot (left), Sub-pilots on the side the ring comes from (right)
    expect(side!.position.x).toBeLessThan(slot.position.x);
    expect(sub!.position.x).toBeGreaterThan(slot.position.x);
  });

  it('keeps a layout without attached work exactly as before', () => {
    for (const doc of [primaryAssembly(), slots(5)]) {
      const layout = layoutClock(doc);
      expect(layout.attached).toEqual([]);
      expect(layout.box.width).toBe((layout.radius + 170) * 2);
      expect(layout.center).toEqual({ x: layout.radius + 170, y: layout.radius + 170 });
    }
  });
});
