import { Toaster } from '@suptron/ui/components/sonner';
import { TooltipProvider } from '@suptron/ui/components/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useAppearance, useSyncAppearance } from './appearance';
import { EventSourceLiveEvents, LiveEventsProvider } from './features/missions/live';
import { MissionsProvider } from './features/missions/MissionsProvider';
import { createAppRouter } from './router';
import './index.css';

const queryClient = new QueryClient();
const router = createAppRouter(queryClient);
const live = new EventSourceLiveEvents();

function App() {
  useSyncAppearance();
  const appearance = useAppearance();
  return (
    <QueryClientProvider client={queryClient}>
      <LiveEventsProvider live={live}>
        <MissionsProvider>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
        </MissionsProvider>
      </LiveEventsProvider>
      <Toaster theme={appearance} />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
