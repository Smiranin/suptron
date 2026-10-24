import { TooltipProvider } from '@suptron/ui/components/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { render, type RenderResult } from '@testing-library/react';
import { LiveEventsProvider } from '../src/features/missions/live';
import type { FakeLiveEvents } from '../src/features/missions/live/LiveEvents';
import { MissionsProvider } from '../src/features/missions/MissionsProvider';
import { createAppRouter, type AppRouter } from '../src/router';

export interface RenderedApp extends RenderResult {
  router: AppRouter;
  queryClient: QueryClient;
}

/** Renders the whole app at a route with the Query provider and a FakeLiveEvents. */
export function renderApp(route: string, live: FakeLiveEvents): RenderedApp {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [route] }));
  const result = render(
    <QueryClientProvider client={queryClient}>
      <LiveEventsProvider live={live}>
        <MissionsProvider>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
        </MissionsProvider>
      </LiveEventsProvider>
    </QueryClientProvider>,
  );
  return { ...result, router, queryClient };
}
