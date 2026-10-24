import type { MissionEvent } from '@suptron/runtime/browser';

export type LiveStatus = 'connecting' | 'open' | 'closed';

export interface LiveHandlers {
  onEvent(event: MissionEvent): void;
  onResync(): void;
  onStatus(status: LiveStatus): void;
}

export interface SubscribeOptions {
  missionId?: string;
  after?: number;
}

/** The Missions area's only abstraction over the browser: one subscription, one unsubscribe. */
export interface LiveEvents {
  subscribe(options: SubscribeOptions, handlers: LiveHandlers): () => void;
}

export function eventsUrl(options: SubscribeOptions): string {
  const params = new URLSearchParams();
  if (options.missionId) params.set('mission', options.missionId);
  if (options.after !== undefined) params.set('after', String(options.after));
  const query = params.toString();
  return query ? `/api/events?${query}` : '/api/events';
}

/** The production port: one EventSource per subscription; the browser reconnects on its own. */
export class EventSourceLiveEvents implements LiveEvents {
  subscribe(options: SubscribeOptions, handlers: LiveHandlers): () => void {
    const source = new EventSource(eventsUrl(options));
    handlers.onStatus('connecting');
    source.onopen = () => handlers.onStatus('open');
    source.onerror = () =>
      handlers.onStatus(source.readyState === EventSource.CLOSED ? 'closed' : 'connecting');
    source.onmessage = (message: MessageEvent<string>) => {
      try {
        handlers.onEvent(JSON.parse(message.data) as MissionEvent);
      } catch (error) {
        console.error('[suptron] bad event payload', error);
      }
    };
    source.addEventListener('resync', () => handlers.onResync());
    return () => source.close();
  }
}

interface FakeSubscription {
  options: SubscribeOptions;
  handlers: LiveHandlers;
}

/** The test port: tests push events, flip the connection status and trigger resyncs by hand. */
export class FakeLiveEvents implements LiveEvents {
  readonly subscriptions = new Set<FakeSubscription>();

  subscribe(options: SubscribeOptions, handlers: LiveHandlers): () => void {
    const subscription = { options, handlers };
    this.subscriptions.add(subscription);
    queueMicrotask(() => {
      if (this.subscriptions.has(subscription)) handlers.onStatus('open');
    });
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  /** Delivers to the Mission's subscribers and, when `global`, to the global subscribers. */
  emit(event: MissionEvent, { global = true }: { global?: boolean } = {}): void {
    for (const { options, handlers } of [...this.subscriptions]) {
      if (options.missionId === event.missionId) handlers.onEvent(event);
      else if (options.missionId === undefined && global) handlers.onEvent(event);
    }
  }

  setStatus(status: LiveStatus, missionId?: string): void {
    for (const { options, handlers } of [...this.subscriptions]) {
      if (missionId === undefined || options.missionId === missionId) handlers.onStatus(status);
    }
  }

  resync(missionId?: string): void {
    for (const { options, handlers } of [...this.subscriptions]) {
      if (missionId === undefined || options.missionId === missionId) handlers.onResync();
    }
  }

  missionSubscriptions(missionId: string): FakeSubscription[] {
    return [...this.subscriptions].filter((s) => s.options.missionId === missionId);
  }
}
