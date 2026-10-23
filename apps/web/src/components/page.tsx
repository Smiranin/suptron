import { cn } from '@suptron/ui/lib/utils';
import { type LucideIcon, Signpost } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

export function PageContainer({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'w-full max-w-[1320px] px-[var(--shell-content-padding,24px)] pb-20 pt-10 max-md:pb-16',
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-5">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="m-0 text-[32px] font-bold leading-tight tracking-[-0.04em] max-sm:text-[28px]">
          {title}
        </h1>
        {count !== undefined && (
          <span className="bg-muted text-muted-foreground rounded-lg px-2.5 py-1 text-sm font-bold">
            <span className="sr-only">Total: </span>
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

export type StatePanelProps = ComponentProps<'section'> & {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  label?: string;
  compact?: boolean;
  headingLevel?: 1 | 2;
};

/** Centred message for empty, missing and error states. */
export function StatePanel({
  title,
  description,
  action,
  icon: Icon = Signpost,
  label,
  compact = false,
  headingLevel = 1,
  className,
  ...props
}: StatePanelProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <section
      className={cn(
        'flex min-h-[520px] flex-col items-center justify-center px-6 py-12 text-center',
        compact && 'min-h-[340px] py-8',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="border-border bg-muted text-muted-foreground grid size-14 place-items-center rounded-2xl border"
      >
        <Icon className="size-6" />
      </span>
      {label && (
        <p className="text-muted-foreground mb-0 mt-5 text-xs font-semibold tracking-[0.15em]">
          {label}
        </p>
      )}
      <Heading
        className={cn(
          'mb-0 mt-6 max-w-[440px] text-[28px] font-bold leading-tight tracking-[-0.04em] max-sm:text-2xl',
          compact && 'text-xl max-sm:text-xl',
        )}
      >
        {title}
      </Heading>
      {description && (
        <p className="text-muted-foreground mb-0 mt-3 max-w-[385px] text-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2.5">{action}</div>}
    </section>
  );
}

export function EmptyState(props: Omit<StatePanelProps, 'compact' | 'headingLevel'>) {
  return <StatePanel compact headingLevel={2} {...props} />;
}
