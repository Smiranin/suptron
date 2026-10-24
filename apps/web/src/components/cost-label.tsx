import type { Cost } from '@suptron/runtime/browser';
import { Tooltip, TooltipContent, TooltipTrigger } from '@suptron/ui/components/tooltip';

export function formatUsd(usd: number): string {
  if (usd === 0) return '$0.00';
  const decimals = usd < 0.01 ? 4 : usd < 1 ? 3 : 2;
  return `$${usd.toFixed(decimals)}`;
}

export function formatTokens(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/** Dollars first, tokens and the word "estimate" on hover (POC FR-40). */
export function CostLabel({
  cost,
  estimated = true,
  className,
}: {
  cost: Cost;
  estimated?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className} data-testid="cost-label" tabIndex={0}>
          {formatUsd(cost.usd)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {formatTokens(cost.inputTokens)} input · {formatTokens(cost.outputTokens)} output tokens
        {estimated ? ' (estimate)' : ''}
      </TooltipContent>
    </Tooltip>
  );
}
