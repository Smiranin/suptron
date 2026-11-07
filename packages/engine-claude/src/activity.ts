import type { AgentEvent } from '@suptron/runtime';

type Activity = Extract<AgentEvent, { type: 'activity' }>;

export const ACTIVITY_INTERVAL_MS = 1000;

/**
 * Streaming frames arrive many times a second; the UI needs a sign of life, not every delta.
 * Lets an activity event through when its phase or detail changed, or when the last one let
 * through is older than `intervalMs`. Anything else resets nothing and passes untouched.
 */
export class ActivityThrottle {
  private last: { phase: string; detail: string | undefined; at: number } | null = null;

  constructor(
    private readonly intervalMs = ACTIVITY_INTERVAL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** The event to emit, or null when this activity frame adds nothing new yet. */
  pass(event: AgentEvent): AgentEvent | null {
    if (event.type !== 'activity') {
      // A real entry ends the current phase: the next activity frame is news again.
      this.last = null;
      return event;
    }
    return this.passActivity(event) ? event : null;
  }

  private passActivity(event: Activity): boolean {
    const at = this.now();
    const last = this.last;
    const changed = last === null || last.phase !== event.phase || last.detail !== event.detail;
    if (!changed && at - last.at < this.intervalMs) return false;
    this.last = { phase: event.phase, detail: event.detail, at };
    return true;
  }
}
