import { Tooltip, TooltipContent, TooltipTrigger } from '@suptron/ui/components/tooltip';
import { cn } from '@suptron/ui/lib/utils';
import { AlertCircle, Brain, MessageCircleQuestion } from 'lucide-react';
import type { CardSummary } from '../model/selectors';

/** What a Slot card shows (FR-27), plus the red error badge (FR-38). */
export function SlotCardContent({ summary }: { summary: CardSummary }) {
  return (
    <div className="flex h-full flex-col gap-1 overflow-hidden" data-testid="slot-card-content">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-bold" title={summary.name}>
          {summary.name}
        </span>
        {summary.mayAskCommander && (
          <Tooltip>
            <TooltipTrigger asChild>
              <MessageCircleQuestion
                className="text-warning size-3.5 shrink-0"
                aria-label="May ask the Commander"
              />
            </TooltipTrigger>
            <TooltipContent>May ask the Commander</TooltipContent>
          </Tooltip>
        )}
        {summary.persistent && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Brain
                className="text-primary-foreground dark:text-primary size-3.5 shrink-0"
                aria-label="Persistent memory"
              />
            </TooltipTrigger>
            <TooltipContent>Persistent memory</TooltipContent>
          </Tooltip>
        )}
        {summary.hasErrors && (
          <span
            className="bg-destructive ml-auto inline-flex size-4 shrink-0 items-center justify-center rounded-full text-white"
            data-testid="card-error-badge"
            aria-label="Has errors"
          >
            <AlertCircle className="size-3" />
          </span>
        )}
      </div>
      <div className="text-muted-foreground flex items-center gap-1 text-[11px]">
        {summary.showUnit && <span className="truncate">unit: {summary.unitName}</span>}
        {summary.showUnit && <span aria-hidden="true">·</span>}
        <span className="truncate">{summary.model || 'no model'}</span>
      </div>
      <div
        className={cn(
          'truncate text-[11px]',
          summary.doneSummary ? 'text-foreground/80' : 'text-muted-foreground italic',
        )}
        title={summary.doneSummary}
      >
        {summary.doneSummary || 'always done'}
      </div>
      {summary.loopBadge && (
        <span
          className="bg-warning/15 text-warning mt-auto w-fit max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          data-testid="loop-badge"
        >
          {summary.loopBadge}
        </span>
      )}
    </div>
  );
}
