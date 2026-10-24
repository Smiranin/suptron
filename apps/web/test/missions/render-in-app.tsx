import { TooltipProvider } from '@suptron/ui/components/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LiveEventsProvider } from '../../src/features/missions/live';
import type { FakeLiveEvents } from '../../src/features/missions/live/LiveEvents';
import { MissionsProvider } from '../../src/features/missions/MissionsProvider';

/** Renders one element at `/` inside the app providers, with a `/missions/$id` stub to navigate to. */
export function renderInApp(element: ReactNode, live: FakeLiveEvents) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{element}</>,
  });
  const missionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/missions/$id',
    component: function Stub() {
      const { id } = missionRoute.useParams();
      return <p data-testid="mission-stub">mission {id}</p>;
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, missionRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
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
