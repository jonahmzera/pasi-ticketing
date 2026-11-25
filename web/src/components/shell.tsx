import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, Compass, Download, Ticket, User, Users } from 'lucide-react';
import { useMe } from '@/lib/hooks';
import { GlassNav } from './glass-nav';
import { cn } from '@shared/utils';
import { Logo } from '@shared/brand';
export { Logo };

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
function useInstall() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  return evt && (async () => { await evt.prompt(); await evt.userChoice; setEvt(null); });
}

const NAV = [
  { to: '/', label: 'Discover', icon: Compass, end: true },
  { to: '/tickets', label: 'Tickets', icon: Ticket },
  { to: '/squads', label: 'Squads', icon: Users },
  { to: '/me', label: 'Profile', icon: User },
];

export function AppShell() {
  const { data: me } = useMe();
  const install = useInstall();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Logo />
          <GlassNav items={NAV} compact className="ml-8 hidden md:grid" />
          <div className="flex-1" />
          {install && (
            <button onClick={install} className="flex h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-medium text-muted transition hover:text-fg">
              <Download className="size-4" /><span className="hidden sm:inline">Install app</span>
            </button>
          )}
          <Link to={me ? '/inbox' : '/me'} aria-label="Notifications" className="relative grid size-10 place-items-center rounded-xl border border-line text-muted transition hover:text-fg">
            <Bell className="size-[18px]" />
            {!!me?.unread && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-hot px-1 text-[10px] font-bold text-white">{me.unread}</span>}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-32 pt-5 md:pb-16">
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <GlassNav items={NAV} className="fixed inset-x-3 bottom-[calc(.75rem+env(safe-area-inset-bottom))] z-40 md:hidden" />
    </div>
  );
}
