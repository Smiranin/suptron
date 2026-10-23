import { Toaster } from '@suptron/ui/components/sonner';
import { TooltipProvider } from '@suptron/ui/components/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useAppearance, useSyncAppearance } from './appearance';
import { createAppRouter } from './router';
import './index.css';

const queryClient = new QueryClient();
const router = createAppRouter(queryClient);

function App() {
  useSyncAppearance();
  const appearance = useAppearance();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
      <Toaster theme={appearance} />
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
