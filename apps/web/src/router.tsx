import type { QueryClient } from '@tanstack/react-query';
import {
  type RouterHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { Shell } from './components/shell';
import { AssemblyEditorPage } from './features/assembly-editor/AssemblyEditorPage';
import { HangarPage } from './features/hangar/HangarPage';
import { UnitEditorPage } from './features/hangar/UnitEditorPage';
import { MissionsListPage } from './features/missions/list/MissionsListPage';
import { MissionPage } from './features/missions/page/MissionPage';
import { ProjectPage } from './features/projects/ProjectPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { NotFoundPage } from './pages';

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
  const projectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/projects/$project',
    component: function ProjectRoute() {
      const { project } = projectRoute.useParams();
      return <ProjectPage key={project} project={project} />;
    },
  });
  const assemblyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/projects/$project/assemblies/$assembly',
    component: function AssemblyRoute() {
      const { project, assembly } = assemblyRoute.useParams();
      return (
        <AssemblyEditorPage key={`${project}/${assembly}`} project={project} assembly={assembly} />
      );
    },
  });
  const hangarRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/hangar',
    component: HangarPage,
  });
  const newUnitRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/hangar/new',
    component: () => <UnitEditorPage key="new" name={null} />,
  });
  const unitRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/hangar/$name',
    component: function UnitRoute() {
      const { name } = unitRoute.useParams();
      return <UnitEditorPage key={name} name={name} />;
    },
  });
  const missionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/missions',
    component: MissionsListPage,
  });
  const missionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/missions/$id',
    component: function MissionRoute() {
      const { id } = missionRoute.useParams();
      return <MissionPage key={id} id={id} />;
    },
  });

  return createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      projectsRoute,
      projectRoute,
      assemblyRoute,
      hangarRoute,
      newUnitRoute,
      unitRoute,
      missionsRoute,
      missionRoute,
    ]),
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

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
