import type { QueryClient } from '@tanstack/react-query';
import {
  type RouterHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { Shell } from './components/shell';
import { HangarPage, MissionsPage, NotFoundPage, ProjectsPage } from './pages';

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
    component: Shell,
    notFoundComponent: NotFoundPage,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: () => {
      throw redirect({ to: '/projects' });
    },
  });
  const projectsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/projects',
    component: ProjectsPage,
  });
  const hangarRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/hangar',
    component: HangarPage,
  });
  const missionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/missions',
    component: MissionsPage,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, projectsRoute, hangarRoute, missionsRoute]),
    ...(history && { history }),
    context: { queryClient },
    defaultPreloadStaleTime: 0,
    defaultViewTransition: {
      types: ({ fromLocation, pathChanged }) =>
        fromLocation &&
        pathChanged &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? ['page']
          : false,
    },
    scrollRestoration: true,
    scrollToTopSelectors: ['#app-content'],
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
