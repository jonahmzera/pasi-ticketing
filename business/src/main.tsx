import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import './index.css';
import Organizer from '@/pages/organizer/Organizer';
import Scanner from '@/pages/gate/Scanner';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="scan" element={<Scanner />} />
          <Route path="*" element={<Organizer />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="top-center" richColors toastOptions={{ style: { borderRadius: 14 } }} />
    </QueryClientProvider>
  </StrictMode>,
);
