import type { UnitFile } from '@suptron/runtime/browser';
import { cn } from '@suptron/ui/lib/utils';
import { GripVertical } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface UnitPaletteProps {
  units: UnitFile[];
  dragging: string | null;
  itemHandlers(unit: string): {
    onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
    onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
    onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
    onPointerCancel(event: ReactPointerEvent<HTMLElement>): void;
  };
  /** A click (no drag) appends the Unit after the last Slot. */
  onAppend(unit: string): void;
}

/** The Units of the Hangar, draggable onto the ring (FR-26). */
export function UnitPalette({ units, dragging, itemHandlers, onAppend }: UnitPaletteProps) {
  return (
    <aside
      className="border-border flex w-52 shrink-0 flex-col gap-2 overflow-y-auto border-r p-3"
      aria-label="Units palette"
      data-testid="unit-palette"
    >
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        Hangar
      </h2>
      {units.length === 0 && (
        <p className="text-muted-foreground text-xs">No Units yet. Create one in the Hangar.</p>
      )}
      {units.map((unit) => (
        <div
          key={unit.name}
          role="button"
          tabIndex={0}
          data-testid="palette-unit"
          data-unit={unit.name}
          aria-label={`Unit ${unit.name}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onAppend(unit.name);
            }
          }}
          onDoubleClick={() => onAppend(unit.name)}
          className={cn(
            'bg-card hover:border-primary flex cursor-grab items-center gap-2 rounded-lg border px-2 py-1.5 text-sm shadow-xs select-none active:cursor-grabbing',
            dragging === unit.name && 'border-primary opacity-60',
          )}
          {...itemHandlers(unit.name)}
        >
          <GripVertical className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{unit.name}</span>
            <span className="text-muted-foreground block truncate text-[11px]">{unit.model}</span>
          </span>
        </div>
      ))}
    </aside>
  );
}
