import { Button } from '@suptron/ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@suptron/ui/components/tooltip';
import { cn } from '@suptron/ui/lib/utils';
import { Monitor, Moon, Sun } from 'lucide-react';
import { nextAppearance, toggleAppearance, useAppearance } from '../appearance';

const labels = { system: 'System', light: 'Light', dark: 'Dark' };
const icons = { system: Monitor, light: Sun, dark: Moon };

export function AppearanceButton({ className }: { className?: string }) {
  const appearance = useAppearance();
  const Icon = icons[appearance];
  const label = `Theme: ${labels[appearance]}. Switch to ${labels[nextAppearance[appearance]]}.`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('text-muted-foreground size-10', className)}
          onClick={toggleAppearance}
          aria-label={label}
        >
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
