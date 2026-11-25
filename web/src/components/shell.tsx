import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, Compass, Download, Ticket, User, Users } from 'lucide-react';
import { useMe } from '@/lib/hooks';
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
          <nav className="ml-8 hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => cn('flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition', isActive ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg')}>
                <n.icon className="size-4" />{n.label}
              </NavLink>
            ))}
          </nav>
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

      <nav aria-label="Main" className="fixed inset-x-3 bottom-[calc(.75rem+env(safe-area-inset-bottom))] z-40 grid grid-cols-4 rounded-2xl border border-line bg-surface/85 p-1.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,.7)] backdrop-blur-xl md:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => cn('relative flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition', isActive ? 'text-fg' : 'text-subtle')}>
            {({ isActive }) => (<>
              {isActive && <motion.span layoutId="tab" className="absolute inset-0 rounded-xl bg-surface-3" transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }} />}
              <n.icon className={cn('relative size-5', isActive && 'text-brand-soft')} />
              <span className="relative">{n.label}</span>
            </>)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
