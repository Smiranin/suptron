import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ theme = 'system', ...props }: ToasterProps) => (
  <Sonner
    theme={theme}
    className="toaster group"
    position="top-right"
    offset={24}
    mobileOffset={16}
    duration={4000}
    closeButton
    icons={{
      success: <CircleCheckIcon className="text-success size-4" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="text-warning size-4" />,
      error: <OctagonXIcon className="text-destructive size-4" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    style={
      {
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
        '--border-radius': '12px',
        fontFamily: 'var(--font-sans)',
      } as CSSProperties
    }
    toastOptions={{
      classNames: {
        toast: '!gap-3 !pr-10',
        title: '!font-medium',
        description: '!text-muted-foreground',
        closeButton:
          '!left-auto !right-2 !top-2 !size-7 !transform-none !border-0 !bg-transparent !text-muted-foreground',
      },
    }}
    {...props}
  />
);

export { Toaster };
export { toast } from 'sonner';
