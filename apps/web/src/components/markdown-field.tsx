import { Textarea } from '@suptron/ui/components/textarea';
import { cn } from '@suptron/ui/lib/utils';
import type { ComponentProps } from 'react';

/** A monospace, auto-growing textarea for Rules and Instructions (no preview by design). */
export function MarkdownField({ className, value, ...props }: ComponentProps<typeof Textarea>) {
  const lines = typeof value === 'string' ? value.split('\n').length : 4;
  return (
    <Textarea
      value={value}
      rows={Math.min(40, Math.max(4, lines + 1))}
      spellCheck={false}
      className={cn('min-h-24 font-mono text-sm leading-relaxed', className)}
      {...props}
    />
  );
}
