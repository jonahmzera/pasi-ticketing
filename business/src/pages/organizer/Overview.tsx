import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { AlertTriangle, BadgeCheck, Bell, CalendarDays, CalendarPlus, ChevronRight, Eye, Ticket, Users } from 'lucide-react';
import { api, post } from '@shared/api';
import { fmtDate, ksh, num, prettyPhone } from '@shared/utils';
import { Poster } from '@shared/event';
import { Badge, Button, Empty, Progress, Skeleton } from '@shared/ui';
import { RevenueArea } from './charts';
import type { Org } from './Organizer';

interface OverviewData {
  events: { id: string; title: string; slug: string; status: string; startsAt: string; venueName: string; theme: string; category: string; capacity: number; sold: number; checkedIn: number; views: number; gross: number; net: number; platformFee: number; mpesaCost: number }[];
  totals: { gross: number; net: number; platformFee: number; mpesaCost: number; tickets: number; orders: number };
  fans: number; repeatFans: number; followers: number; feePct: number;
  daily: { date: string; revenue: number; orders: number }[];
  review: { id: string; ref: string; phone: string; total: number; receipt?: string; reason: string; title: string }[];
  recent: { id: string; name?: string; total: number; status: string; source?: string; qty: number; at: string; title?: string }[];
}

export const statusTone = (s: string) => (s === 'published' ? 'brand' : s === 'cancelled' ? 'danger' : 'neutral') as 'brand' | 'danger' | 'neutral';

export function ReviewQueue({ items, onDone }: { items: { id: string; phone: string; total: number; receipt?: string; reason: string; title?: string }[]; onDone: () => void }) {
  if (!items.length) return null;
  const act = async (id: string, action: 'issue' | 'refunded') => {
    try { await post(`/org/orders/${id}/resolve`, { action }); toast.success(action === 'issue' ? 'Tickets issued' : 'Marked refunded'); onDone(); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="rounded-2xl border border-warn/30 bg-warn/[.07] p-4">
      <div className="flex items-center gap-2 font-semibold text-warn"><AlertTriangle className="size-4" />{items.length} payment{items.length > 1 ? 's' : ''} need your review</div>
      <p className="mt-1 text-sm text-muted">Money was received but something didn’t match, so no tickets were issued automatically.</p>
      <div className="mt-3 space-y-2">
        {items.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{r.title ? `${r.title} · ` : ''}{ksh(r.total)} from {prettyPhone(r.phone)}</div>
              <div className="text-xs text-muted">{r.receipt && <span className="font-mono">{r.receipt} · </span>}{r.reason}</div>
            </div>
            <Button size="sm" variant="primary" onClick={() => act(r.id, 'issue')}>Issue tickets</Button>
            <Button size="sm" variant="outline" onClick={() => act(r.id, 'refunded')}>Mark refunded</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Overview({ org }: { org: Org }) {
  const qc = useQueryClient();
  const { data: d, isLoading } = useQuery({ queryKey: ['org-overview'], queryFn: () => api<OverviewData>('/org/overview') });
  if (isLoading || !d) return <div className="space-y-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-28" /><Skeleton className="h-72" /></div>;
  const upcoming = d.events.filter((e) => new Date(e.startsAt).getTime() > Date.now() - 864e5);
  const past = d.events.filter((e) => !upcoming.includes(e));

  const tiles = [
    { label: 'Tickets sold', value: num(d.totals.tickets), hint: `${num(d.totals.orders)} orders`, icon: Ticket, hot: true },
    { label: 'Fans', value: num(d.fans), hint: `${num(d.repeatFans)} came back`, icon: Users },
    { label: 'Followers', value: num(d.followers), hint: 'get your event alerts', icon: Bell },
    { label: 'Upcoming', value: num(upcoming.length), hint: `${upcoming.filter((e) => e.status === 'published').length} on sale`, icon: CalendarDays },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow flex items-center gap-1.5">{org.name}{org.verified && <BadgeCheck className="size-3.5 text-info" aria-label="Verified" />}</div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Command Center</h1>
          <p className="mt-1 text-sm text-muted">Sales, check-ins and anything that needs your attention.</p>
        </div>
        <Link to="/events/new"><Button variant="light"><CalendarPlus className="size-4" />Create event</Button></Link>
      </div>

      <ReviewQueue items={d.review} onDone={() => qc.invalidateQueries({ queryKey: ['org-overview'] })} />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="card relative overflow-hidden p-6 lg:col-span-5">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/[.06] blur-3xl" />
          <div className="flex items-center justify-between"><span className="eyebrow">Your net payout</span><span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-muted">all events</span></div>
          <div className="mt-3 text-[44px] font-extrabold leading-none tracking-tight tabular-nums">{ksh(d.totals.net)}</div>
          <div className="mt-2 text-sm text-muted">{ksh(d.totals.gross)} gross · {d.feePct}% fee + M-Pesa charges</div>
          <div className="mt-6 flex flex-wrap gap-2">
            <a href="#events"><Button variant="light" size="sm">View events</Button></a>
            <a href="#payouts"><Button variant="secondary" size="sm">Payout statement</Button></a>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:col-span-7">
          {tiles.map((t) => (
            <div key={t.label} className={t.hot ? 'card border-brand/30 bg-brand/[.12] p-4' : 'card p-4'}>
              <div className="flex items-center justify-between"><span className="eyebrow">{t.label}</span><t.icon className={t.hot ? 'size-4 text-brand-soft' : 'size-4 text-muted'} /></div>
              <div className="mt-3 text-2xl font-bold tabular-nums">{t.value}</div>
              <div className="mt-1 text-xs text-muted">{t.hint}</div>
            </div>
          ))}
        </div>
        <div className="card p-5 lg:col-span-7">
          <div className="mb-4 flex items-baseline justify-between"><h2 className="font-semibold">Revenue · last 30 days</h2><span className="text-sm text-muted tabular-nums">{ksh(d.daily.reduce((a, x) => a + x.revenue, 0))}</span></div>
          <RevenueArea data={d.daily.map((x) => ({ label: new Date(x.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }), value: x.revenue }))} />
        </div>
        <div className="card p-5 lg:col-span-5">
          <h2 className="mb-3 font-semibold">Recent activity</h2>
          <div className="divide-y divide-white/5">
            {d.recent.length ? d.recent.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className={r.status === 'paid' ? 'size-2 shrink-0 rounded-full bg-brand' : r.status === 'review' ? 'size-2 shrink-0 rounded-full bg-warn' : 'size-2 shrink-0 rounded-full bg-danger'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate"><b className="font-medium">{r.name || 'Guest'}</b> <span className="text-muted">{r.status === 'paid' ? `bought ${r.qty} · ${r.title}` : r.status === 'review' ? 'payment needs review' : 'payment didn’t finish'}</span></div>
                  <div className="text-xs text-subtle">{r.source === 'door' ? 'Door sale · ' : ''}{new Date(r.at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <span className="tabular-nums">{ksh(r.total)}</span>
              </div>
            )) : <p className="py-6 text-center text-sm text-muted">No sales yet.</p>}
          </div>
        </div>
      </div>

      <section id="events" className="scroll-mt-6">
        <h2 className="mb-4 text-xl font-bold tracking-tight">Upcoming events</h2>
        {upcoming.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {upcoming.map((e, i) => {
              const pct = e.capacity ? (e.sold / e.capacity) * 100 : 0;
              return (
                <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <Link to={`/events/${e.id}`} className="group flex gap-4 rounded-3xl border border-line bg-surface p-3 transition hover:border-line-strong">
                    <Poster ev={e} className="h-28 w-24 shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1 py-1">
                      <div className="flex items-start justify-between gap-2"><div className="truncate font-semibold">{e.title}</div><Badge tone={statusTone(e.status)}>{e.status}</Badge></div>
                      <div className="text-sm text-muted">{fmtDate(e.startsAt)} · {e.venueName}</div>
                      <div className="mt-3 flex items-baseline justify-between text-sm"><span className="tabular-nums"><b>{num(e.sold)}</b><span className="text-muted"> / {num(e.capacity)}</span></span><b className="tabular-nums">{ksh(e.gross)}</b></div>
                      <Progress value={pct} className="mt-2" />
                      <div className="mt-2 flex items-center gap-1 text-xs text-subtle"><Eye className="size-3" />{num(e.views)} views<ChevronRight className="ml-auto size-4 transition group-hover:translate-x-0.5" /></div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        ) : <Empty icon={<CalendarPlus />} title="No upcoming events" action={<Link to="/events/new"><Button variant="primary">Create your first event</Button></Link>} />}
      </section>

      <section id="payouts" className="card scroll-mt-6 overflow-x-auto p-5">
        <h2 className="mb-4 font-semibold">Payout statement</h2>
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-subtle"><th className="pb-3 font-medium">Event</th><th className="pb-3 text-right font-medium">Gross</th><th className="pb-3 text-right font-medium">Fee ({d.feePct}%)</th><th className="pb-3 text-right font-medium">M-Pesa (est.)</th><th className="pb-3 text-right font-medium">Net to you</th></tr></thead>
          <tbody className="divide-y divide-line">
            {d.events.filter((e) => e.gross).map((e) => (
              <tr key={e.id}><td className="py-3">{e.title}</td><td className="py-3 text-right tabular-nums">{ksh(e.gross)}</td><td className="py-3 text-right tabular-nums text-muted">− {ksh(e.platformFee)}</td><td className="py-3 text-right tabular-nums text-muted">− {ksh(e.mpesaCost)}</td><td className="py-3 text-right font-semibold tabular-nums">{ksh(e.net)}</td></tr>
            ))}
            <tr className="font-bold"><td className="pt-3">Total</td><td className="pt-3 text-right tabular-nums">{ksh(d.totals.gross)}</td><td className="pt-3 text-right tabular-nums text-muted">− {ksh(d.totals.platformFee)}</td><td className="pt-3 text-right tabular-nums text-muted">− {ksh(d.totals.mpesaCost)}</td><td className="pt-3 text-right tabular-nums text-brand-soft">{ksh(d.totals.net)}</td></tr>
          </tbody>
        </table>
        <p className="mt-4 text-xs text-subtle">Payouts go to {org.payoutAccount ? prettyPhone(org.payoutAccount) : 'your payout account'} and can settle daily while sales are open.</p>
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-muted">Past events</h2>
          <div className="space-y-2">{past.map((e) => <Link key={e.id} to={`/events/${e.id}`} className="flex justify-between rounded-xl border border-line p-3 text-sm hover:bg-surface"><span>{e.title}</span><span className="tabular-nums text-muted">{ksh(e.gross)}</span></Link>)}</div>
        </section>
      )}
    </div>
  );
}
