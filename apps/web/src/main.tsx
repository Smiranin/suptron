import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="p-8 text-sm text-neutral-500">Suptron</main>
  </StrictMode>,
);
