import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import './index.css';
import { AuthProvider } from '@/lib/hooks';
import { AppShell } from '@/components/shell';
import Discover from '@/pages/attendee/Discover';
import EventPage from '@/pages/attendee/EventPage';
import { MyTickets, OrderPage, TicketPage } from '@/pages/attendee/Tickets';
import { SquadPage, SquadsPage } from '@/pages/attendee/Squads';
import { InboxPage, MePage, OrgProfile } from '@/pages/attendee/Profile';
import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { Button, Empty, Skeleton } from '@shared/ui';

const Simulator = lazy(() => import('@/pages/Simulator'));

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const Loading = () => <div className="mx-auto max-w-6xl p-6"><Skeleton className="h-64" /></div>;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Discover />} />
                <Route path="e/:slug" element={<EventPage />} />
                <Route path="o/:slug" element={<OrgProfile />} />
                <Route path="order/:ref" element={<OrderPage />} />
                <Route path="t/:code" element={<TicketPage />} />
                <Route path="tickets" element={<MyTickets />} />
                <Route path="squads" element={<SquadsPage />} />
                <Route path="squads/:id" element={<SquadPage />} />
                <Route path="me" element={<MePage />} />
                <Route path="inbox" element={<InboxPage />} />
                <Route path="*" element={<Empty icon={<Compass />} title="Page not found" action={<Link to="/"><Button variant="primary">Back to events</Button></Link>}>That link doesn’t go anywhere.</Empty>} />
              </Route>
              <Route path="simulator" element={<Simulator />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
      <Toaster theme="dark" position="top-center" richColors toastOptions={{ style: { borderRadius: 14 } }} />
    </QueryClientProvider>
  </StrictMode>,
);
