import { describe, expect, it } from 'vitest';
import { TypedEmitter } from '../src/events/typed-emitter.js';

type E = { type: 'a'; n: number } | { type: 'b'; s: string };

describe('TypedEmitter', () => {
  it('delivers typed and untyped listeners and supports unsubscribe', () => {
    const emitter = new TypedEmitter<E>();
    const got: E[] = [];
    const a: number[] = [];
    const offAny = emitter.onAny((e) => got.push(e));
    emitter.on('a', (e) => a.push(e.n));
    emitter.emit({ type: 'a', n: 1 });
    emitter.emit({ type: 'b', s: 'x' });
    offAny();
    emitter.emit({ type: 'a', n: 2 });
    expect(got).toEqual([
      { type: 'a', n: 1 },
      { type: 'b', s: 'x' },
    ]);
    expect(a).toEqual([1, 2]);
  });

  it('isolates a failing listener', () => {
    const errors: unknown[] = [];
    const emitter = new TypedEmitter<E>((e) => errors.push(e));
    const seen: string[] = [];
    emitter.onAny(() => {
      throw new Error('boom');
    });
    emitter.onAny((e) => seen.push(e.type));
    emitter.emit({ type: 'b', s: '' });
    expect(errors).toHaveLength(1);
    expect(seen).toEqual(['b']);
  });
});
