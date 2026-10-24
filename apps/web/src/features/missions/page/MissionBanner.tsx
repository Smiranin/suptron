import { cn } from '@suptron/ui/lib/utils';
import { AlertTriangle, CircleStop, MessageCircleQuestion, WifiOff } from 'lucide-react';
import { CAUSE_LABELS } from '../model/selectors';
import type { ReadyMissionState } from '../model/types';

/** The banners over the clock: waiting, needs attention, stopped, connection lost (FR-25, FR-28, FR-30, FR-34). */
export function MissionBanner({ state }: { state: ReadyMissionState }) {
  const banners: {
    key: string;
    tone: 'warning' | 'destructive' | 'neutral';
    icon: typeof AlertTriangle;
    text: string;
  }[] = [];
  if (state.connection === 'closed') {
    banners.push({
      key: 'connection',
      tone: 'warning',
      icon: WifiOff,
      text: 'Connection lost, reconnecting',
    });
  }
  if (state.summary.state === 'waiting_for_owner' && state.pendingQuestion) {
    banners.push({
      key: 'waiting',
      tone: 'warning',
      icon: MessageCircleQuestion,
      text: `Waiting for your answer on ${state.pendingQuestion.slot}`,
    });
  }
  if (state.summary.state === 'needs_attention' && state.attention) {
    banners.push({
      key: 'attention',
      tone: 'destructive',
      icon: AlertTriangle,
      text: `Needs attention: ${CAUSE_LABELS[state.attention.cause]} on ${state.attention.slot}`,
    });
  }
  if (state.summary.state === 'stopped') {
    banners.push({
      key: 'stopped',
      tone: 'neutral',
      icon: CircleStop,
      text:
        state.summary.note === 'interrupted'
          ? 'Stopped: interrupted by an application restart'
          : 'Stopped',
    });
  }
  if (banners.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="mission-banners">
      {banners.map(({ key, tone, icon: Icon, text }) => (
        <div
          key={key}
          role="status"
          data-banner={key}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium',
            tone === 'warning' && 'border-warning/40 bg-warning/10 text-warning',
            tone === 'destructive' && 'border-destructive/40 bg-destructive/10 text-destructive',
            tone === 'neutral' && 'border-border bg-muted text-muted-foreground',
          )}
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {text}
        </div>
      ))}
    </div>
  );
}
