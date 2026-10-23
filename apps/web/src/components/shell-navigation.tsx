import { Button } from '@suptron/ui/components/button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@suptron/ui/components/sidebar';
import { Link } from '@tanstack/react-router';
import { FolderGit2, Rocket, Warehouse, X } from 'lucide-react';
import type { MouseEvent, PropsWithChildren } from 'react';
import { Brand } from './brand';

const activeProps = { 'aria-current': 'page' as const, 'data-active': true };

function NavigationItem({ children }: PropsWithChildren) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className="text-muted-foreground hover:bg-muted data-[active=true]:bg-primary/15 data-[active=true]:text-primary-foreground data-[active=true]:after:bg-primary dark:data-[active=true]:text-primary h-11 gap-3 rounded-lg px-3 text-sm data-[active=true]:font-semibold data-[active=true]:after:ml-auto data-[active=true]:after:size-1.5 data-[active=true]:after:shrink-0 data-[active=true]:after:rounded-full [&>svg]:size-[18px]"
      >
        {children}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function ShellNavigation() {
  const { setOpenMobile } = useSidebar();
  const closeOnNavigate = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest('a')) setOpenMobile(false);
  };
  return (
    <Sidebar className="[&>div]:bg-muted dark:[&>div]:bg-background h-dvh group-data-[side=left]:border-r-0">
      <SidebarHeader
        className="h-[72px] flex-row items-center justify-between px-6"
        onClick={closeOnNavigate}
      >
        <Brand />
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Close navigation"
          onClick={() => setOpenMobile(false)}
        >
          <X aria-hidden="true" />
        </Button>
      </SidebarHeader>
      <SidebarContent className="gap-5 px-3 pt-5" onClick={closeOnNavigate}>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Main navigation">
              <SidebarMenu>
                <NavigationItem>
                  <Link to="/projects" activeProps={activeProps}>
                    <FolderGit2 aria-hidden="true" />
                    <span>Projects</span>
                  </Link>
                </NavigationItem>
                <NavigationItem>
                  <Link to="/hangar" activeProps={activeProps}>
                    <Warehouse aria-hidden="true" />
                    <span>Hangar</span>
                  </Link>
                </NavigationItem>
                <NavigationItem>
                  <Link to="/missions" activeProps={activeProps}>
                    <Rocket aria-hidden="true" />
                    <span>Missions</span>
                  </Link>
                </NavigationItem>
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
