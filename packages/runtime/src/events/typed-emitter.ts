/**
 * A minimal typed emitter: listeners receive every event (`onAny`) or one type (`on`).
 * Listener errors are isolated so a failing subscriber never breaks the Runner.
 */
export type Listener<T> = (event: T) => void;

export class TypedEmitter<T extends { type: string }> {
  private readonly byType = new Map<string, Set<Listener<T>>>();
  private readonly any = new Set<Listener<T>>();
  private readonly errorHandler: (error: unknown) => void;

  constructor(onListenerError?: (error: unknown) => void) {
    this.errorHandler =
      onListenerError ?? ((error) => console.error('[suptron] event listener failed', error));
  }

  on<K extends T['type']>(type: K, listener: Listener<Extract<T, { type: K }>>): () => void {
    let set = this.byType.get(type);
    if (!set) {
      set = new Set();
      this.byType.set(type, set);
    }
    const typed = listener as Listener<T>;
    set.add(typed);
    return () => {
      set.delete(typed);
    };
  }

  onAny(listener: Listener<T>): () => void {
    this.any.add(listener);
    return () => {
      this.any.delete(listener);
    };
  }

  emit(event: T): void {
    const listeners = [...this.any, ...(this.byType.get(event.type) ?? [])];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        this.errorHandler(error);
      }
    }
  }

  listenerCount(): number {
    let count = this.any.size;
    for (const set of this.byType.values()) count += set.size;
    return count;
  }
}
