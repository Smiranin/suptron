import { cn } from '@suptron/ui/lib/utils';

export type StatusTone = 'success' | 'warning' | 'destructive' | 'neutral';

/** A coloured dot with a label; `pill` puts it on a tinted background. */
export function StatusBadge({
  tone,
  children,
  appearance = 'plain',
}: {
  tone: StatusTone;
  children: string;
  appearance?: 'plain' | 'pill';
}) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "text-muted-foreground before:bg-muted-foreground data-[tone=success]:before:bg-success data-[tone=warning]:before:bg-warning data-[tone=destructive]:before:bg-destructive inline-flex items-center gap-[7px] text-xs font-bold before:size-[7px] before:rounded-full before:content-['']",
        appearance === 'pill' &&
          'bg-muted data-[tone=success]:bg-success/10 data-[tone=success]:text-success data-[tone=warning]:bg-warning/10 data-[tone=warning]:text-warning data-[tone=destructive]:bg-destructive/10 data-[tone=destructive]:text-destructive rounded-full px-2.5 py-1 font-medium before:size-1.5',
      )}
    >
      {children}
    </span>
  );
}
