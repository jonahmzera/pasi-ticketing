import { useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { BarChart3, CalendarPlus, DoorOpen, LayoutDashboard, LogOut, ScanLine, Settings, ShieldCheck, Smartphone, Users, Wallet, Zap } from 'lucide-react';
import { api, post } from '@shared/api';
import { cn } from '@shared/utils';
import { Logo } from '@shared/brand';
import { FAN_URL } from '@/env';
import { Button, Field, Input, Segmented, Select, Skeleton } from '@shared/ui';
import Overview from './Overview';
import EventDashboard from './EventDashboard';
import EventEditor from './EventEditor';
import OrgSettings from './OrgSettings';

export interface Org { id: string; name: string; slug: string; kind: string; email: string; phone?: string; verified: boolean; bio?: string; payoutMethod: string; payoutAccount?: string }
export const useOrg = () => useQuery({ queryKey: ['org-me'], queryFn: () => api<Org | null>('/org/me') });

export default function Organizer() {
  const { data: org, isLoading } = useOrg();
  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>;
  if (!org) return <OrgAuth />;
  return <OrgLayout org={org} />;
}

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/events/new', label: 'New event', icon: CalendarPlus },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function OrgLayout({ org }: { org: Org }) {
  const qc = useQueryClient();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-xl lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between px-5"><Logo suffix="Business" to="/" /></div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('flex h-10 shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition', isActive ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
              <n.icon className="size-4" />{n.label}
            </NavLink>
          ))}
          <a href="/scan" target="_blank" className="flex h-10 shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-fg"><ScanLine className="size-4" />Gate scanner</a>
          <a href={FAN_URL} target="_blank" rel="noopener" className="flex h-10 shrink-0 items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-fg"><DoorOpen className="size-4" />Fan app</a>
        </nav>
        <div className="absolute inset-x-3 bottom-4 hidden lg:block">
          <div className="rounded-2xl border border-line bg-surface p-3">
            <div className="truncate text-sm font-semibold">{org.name}</div>
            <div className="truncate text-xs text-muted">{org.email}</div>
            <button className="mt-2 flex items-center gap-1.5 text-xs text-muted hover:text-fg" onClick={async () => { await post('/org/logout'); qc.setQueryData(['org-me'], null); }}><LogOut className="size-3.5" />Log out</button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Routes>
            <Route index element={<Overview org={org} />} />
            <Route path="events/new" element={<EventEditor />} />
            <Route path="events/:id" element={<EventDashboard />} />
            <Route path="events/:id/edit" element={<EventEditor />} />
            <Route path="settings" element={<OrgSettings org={org} />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

const PITCH = [
  { icon: Smartphone, t: 'M-Pesa STK checkout', d: 'Two taps to pay. Every payment is confirmed with Safaricom before a ticket exists — fake SMS screenshots get nothing.' },
  { icon: ShieldCheck, t: 'Fraud-proof tickets', d: 'Signed QR codes, one scan only, official transfers that kill the old QR. Screenshots can’t be resold.' },
  { icon: Zap, t: 'Fast gates, even offline', d: 'Any phone is a scanner. Works with no network and syncs later. Sell at the door by M-Pesa — no cash.' },
  { icon: BarChart3, t: 'Analytics that drive sales', d: 'Sales by day and hour, checkout funnel with lost revenue, arrival curve, returning fans, promo performance.' },
  { icon: Wallet, t: 'Transparent payouts', d: 'Gross, fees and net per event in real time. Flat fee, no hidden charges to your buyers.' },
  { icon: Users, t: 'Built-in word of mouth', d: 'Fans follow your venue and get push alerts. Friends plan in squads, so groups buy together.' },
];

function OrgAuth() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: '', kind: 'venue', email: '', phone: '', password: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-4"><Logo suffix="Business" /></header>
      <div className="mx-auto grid max-w-6xl items-start gap-12 px-4 py-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Sell out your events.<br /><span className="font-display italic text-brand-soft">Get paid</span> faster.
          </motion.h1>
          <p className="mt-5 max-w-lg text-lg text-muted">Built for Kenyan bars, hotels, clubs, festivals and promoters — everything your current ticketing does, without the crashes, fakes and payout waits.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {PITCH.map((p, i) => (
              <motion.div key={p.t} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }} className="card p-5">
                <p.icon className="size-5 text-brand-soft" />
                <div className="mt-3 font-semibold">{p.t}</div>
                <p className="mt-1 text-sm text-muted">{p.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="card p-6 lg:sticky lg:top-8">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'login', label: 'Log in' }, { value: 'register', label: 'Create account' }]} />
          <form className="mt-6 space-y-4" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true);
            try { await post('/org/' + mode, f); await qc.invalidateQueries({ queryKey: ['org-me'] }); nav('/'); }
            catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
          }}>
            {mode === 'register' && (<>
              <Field label="Business / organizer name"><Input value={f.name} onChange={set('name')} placeholder="e.g. Skyline Lounge" required /></Field>
              <Field label="Type"><Select value={f.kind} onChange={set('kind')}>
                <option value="venue">Bar / club / lounge</option><option value="hotel">Hotel / resort</option><option value="promoter">Promoter / events company</option><option value="festival">Festival</option><option value="other">Other</option>
              </Select></Field>
            </>)}
            <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
            {mode === 'register' && <Field label="M-Pesa / phone" hint="Used for payouts. You can change it later."><Input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="07XX XXX XXX" /></Field>}
            <Field label="Password"><Input type="password" value={f.password} onChange={set('password')} minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></Field>
            <Button variant="primary" size="lg" block loading={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</Button>
            <p className="rounded-xl bg-surface-2 p-3 text-center text-xs text-muted">Demo account: <b className="text-fg">demo@pasi.test</b> / <b className="text-fg">demo12345</b></p>
          </form>
        </div>
      </div>
    </div>
  );
}
