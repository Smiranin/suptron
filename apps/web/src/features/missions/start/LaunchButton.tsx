import { Button } from '@suptron/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@suptron/ui/components/tooltip';
import { Rocket } from 'lucide-react';
import { useState } from 'react';
import { StartMissionDialog } from './StartMissionDialog';

export interface LaunchButtonProps {
  project: string;
  assembly: string;
  disabled?: boolean;
  /** Why the Mission cannot be started (shown in a tooltip). */
  disabledReason?: string;
  size?: 'sm' | 'default';
}

/** Opens the Start Mission dialog for one Assembly (SPEC FR-1). */
export function LaunchButton({
  project,
  assembly,
  disabled,
  disabledReason,
  size = 'default',
}: LaunchButtonProps) {
  const [open, setOpen] = useState(false);
  const button = (
    <Button
      type="button"
      size={size}
      disabled={disabled}
      aria-disabled={disabled}
      data-testid="launch-button"
      aria-label={`Launch ${assembly}`}
      onClick={() => setOpen(true)}
    >
      <Rocket aria-hidden="true" /> Launch
    </Button>
  );
  return (
    <>
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
      {open && (
        <StartMissionDialog
          project={project}
          assembly={assembly}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
