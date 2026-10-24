import { Button } from '@suptron/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@suptron/ui/components/tooltip';
import { Save } from 'lucide-react';
import type { ReactNode } from 'react';

export interface SaveBarProps {
  dirty: boolean;
  canSave: boolean;
  saving?: boolean;
  /** Why Save is disabled (shown in a tooltip). */
  disabledReason?: string;
  onSave: () => void;
  children?: ReactNode;
}

/** The unsaved indicator and the Save button every editor shares (SPEC FR-2). */
export function SaveBar({
  dirty,
  canSave,
  saving = false,
  disabledReason,
  onSave,
  children,
}: SaveBarProps) {
  const disabled = !canSave || saving;
  const button = (
    <Button
      type="button"
      onClick={onSave}
      disabled={disabled}
      aria-disabled={disabled}
      data-testid="save-button"
    >
      <Save aria-hidden="true" />
      {saving ? 'Saving…' : 'Save'}
    </Button>
  );
  return (
    <div className="flex items-center gap-3" data-testid="save-bar">
      {children}
      {dirty ? (
        <span className="text-warning text-sm font-medium" data-testid="unsaved-indicator">
          Unsaved changes
        </span>
      ) : (
        <span className="text-muted-foreground text-sm">Saved</span>
      )}
      {disabled && disabledReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>{button}</span>
          </TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </div>
  );
}
