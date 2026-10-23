import { cn } from '@suptron/ui/lib/utils';
import { Link } from '@tanstack/react-router';

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn('text-foreground inline-flex w-fit items-center gap-3 no-underline', className)}
      aria-label="Suptron"
    >
      <span
        className="bg-primary text-primary-foreground grid size-[42px] items-end justify-items-center rounded-[10px] pb-0.5 text-[30px] font-extrabold leading-none tracking-[-0.08em]"
        aria-hidden="true"
      >
        s
      </span>
      <span
        className="text-[28px] font-extrabold leading-none tracking-[-0.06em]"
        aria-hidden="true"
      >
        suptron
      </span>
    </Link>
  );
}
