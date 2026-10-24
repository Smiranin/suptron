import { Label } from '@suptron/ui/components/label';
import { Switch } from '@suptron/ui/components/switch';
import { cn } from '@suptron/ui/lib/utils';
import { useId, type ReactNode } from 'react';
import type { ValueSource } from '../model/selectors';

export interface OverrideFieldProps {
  label: string;
  source: ValueSource;
  /** The Unit's value shown greyed out while not overridden. */
  inherited: ReactNode;
  /** The editable field, rendered while the override is on. */
  children: ReactNode;
  onToggle(on: boolean): void;
}

/** Inherited fields show the Unit's value greyed out with an Override switch (FR-32). */
export function OverrideField({
  label,
  source,
  inherited,
  children,
  onToggle,
}: OverrideFieldProps) {
  const id = useId();
  const on = source === 'slot';
  return (
    <div
      className="flex flex-col gap-2"
      data-testid={`override-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          Override
          <Switch
            id={id}
            checked={on}
            onCheckedChange={onToggle}
            aria-label={`Override ${label}`}
          />
        </label>
      </div>
      {on ? (
        children
      ) : (
        <div
          className={cn(
            'bg-muted/50 text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm',
          )}
          data-testid="inherited-value"
        >
          {inherited}
          <span className="ml-1 text-[10px] uppercase tracking-wider">
            ({source === 'unit' ? 'from Unit' : 'default'})
          </span>
        </div>
      )}
    </div>
  );
}
