import { cn } from '@suptron/ui/lib/utils';
import { Plus } from 'lucide-react';
import type { ClockLayout } from '../model/layout';

/** The "+" between two positions, before the first or after the last (FR-26). */
export function PlusControls({
  layout,
  highlighted,
  onClick,
}: {
  layout: ClockLayout;
  highlighted: number | null;
  onClick: (index: number) => void;
}) {
  return (
    <>
      {layout.plusPositions.map((plus) => (
        <button
          key={plus.index}
          type="button"
          data-testid="plus-control"
          data-index={plus.index}
          data-highlighted={highlighted === plus.index ? 'true' : undefined}
          aria-label={`Add a Slot at position ${plus.index + 1}`}
          onClick={() => onClick(plus.index)}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ position: 'absolute', left: plus.position.x - 12, top: plus.position.y - 12 }}
          className={cn(
            'bg-background text-muted-foreground hover:border-primary hover:text-primary flex size-6 items-center justify-center rounded-full border shadow-sm transition-transform',
            highlighted === plus.index &&
              'border-primary bg-primary text-primary-foreground scale-150',
          )}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      ))}
    </>
  );
}
