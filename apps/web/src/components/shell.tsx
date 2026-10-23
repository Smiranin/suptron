import { Button } from '@suptron/ui/components/button';
import { SidebarProvider, useSidebar } from '@suptron/ui/components/sidebar';
import { Outlet } from '@tanstack/react-router';
import { Menu } from 'lucide-react';
import type { CSSProperties } from 'react';
import { AppearanceButton } from './appearance-button';
import { Brand } from './brand';
import { ShellNavigation } from './shell-navigation';

function ShellHeader() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  return (
    <header className="flex min-h-[72px] shrink-0 items-center justify-between gap-4 px-[var(--shell-content-padding)] py-3">
      <div className="md:hidden">
        <Brand />
      </div>
      <div className="flex flex-1 items-center justify-end gap-1">
        <AppearanceButton />
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-10"
            aria-label="Open navigation"
            aria-haspopup="dialog"
            aria-expanded={openMobile}
            onClick={() => setOpenMobile(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
        )}
      </div>
    </header>
  );
}

export function Shell() {
  return (
    <SidebarProvider
      open
      className="bg-muted dark:bg-background fixed inset-0 h-dvh min-h-0 overflow-clip"
      style={
        {
          '--sidebar-width': '240px',
          '--shell-content-padding': 'clamp(24px, 3vw, 40px)',
        } as CSSProperties
      }
    >
      <ShellNavigation />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ShellHeader />
        <div className="bg-background dark:bg-card flex min-h-0 min-w-0 flex-1 flex-col overflow-clip rounded-tl-3xl shadow-[-6px_-4px_28px_color-mix(in_oklab,var(--foreground)_4%,transparent)] max-md:rounded-t-3xl dark:shadow-none">
          <main
            id="app-content"
            data-shell-scroll
            data-scroll-restoration-id="app-content"
            tabIndex={0}
            aria-label="Page content"
            className="focus-visible:ring-ring min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-tl-3xl [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset max-md:rounded-t-3xl"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
