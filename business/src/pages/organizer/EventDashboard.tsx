import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Ban, Download, ExternalLink, Gift, KeyRound, Link2, Megaphone, Pencil, Rocket, ScanLine, Search, ShieldAlert, Store, Undo2 } from 'lucide-react';
import { api, post } from '@shared/api';
import { cn, fmtDate, fmtTime, ksh, num, prettyPhone } from '@shared/utils';
import { Badge, Button, Field, Input, Progress, Select, Sheet, Skeleton, Stat, Textarea } from '@shared/ui';
import { Bars, RevenueArea } from './charts';
import { ReviewQueue, statusTone } from './Overview';
import { FAN_URL } from '@/env';

interface Analytics {
  event: { id: string; title: string; slug: string; status: string; startsAt: string; endsAt?: string; gatePin: string; theme: string; venueName: string };
  money: { gross: number; orders: number; platformFee: number; mpesaCost: number; net: number }; feePct: number;
  types: { id: string; name: string; price: number; quantity: number; sold: number; comps: number; held: number; remaining: number; revenue: number; checkedIn: number }[];
  byDay: { date: string; revenue: number; orders: number; tickets: number }[]; byHour: number[]; arrivals: { at: string; n: number }[];
  funnel: { views: number; started: number; paid: number; failed: number; failedValue: number }; failReasons: { reason: string; n: number }[];
  promos: { code: string; percentOff: number; used: number; maxUses?: number }[];
  checkedIn: number; issued: number; buyers: number; returning: number; squads: number; door: { n: number; v: number };
  scans: Record<string, number>; review: { id: string; phone: string; total: number; receipt?: string; reason: string }[];
}
interface Attendee { code: string; holderName?: string; holderPhone: string; typeName?: string; status: string; isComp: boolean; checkedInAt?: string; checkedInGate?: string; ref?: string; receipt?: string; source?: string }

export default function EventDashboard() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const live = (a?: Analytics) => !!a && Math.abs(new Date(a.event.startsAt).getTime() - Date.now()) < 12 * 3600e3;
  const { data: a, isLoading } = useQuery({ queryKey: ['analytics', id], queryFn: () => api<Analytics>(`/org/events/${id}/analytics`), refetchInterval: (q) => (live(q.state.data) ? 8000 : false) });
  const { data: people } = useQuery({ queryKey: ['attendees', id], queryFn: () => api<Attendee[]>(`/org/events/${id}/attendees`) });
  const [q, setQ] = useState('');
  const [comp, setComp] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['analytics', id] }); qc.invalidateQueries({ queryKey: ['attendees', id] }); qc.invalidateQueries({ queryKey: ['org-overview'] }); };

  if (isLoading || !a) return <div className="space-y-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-28" /><Skeleton className="h-80" /></div>;
  const ev = a.event;
  const cap = a.types.reduce((s, t) => s + t.quantity, 0);
  const sold = a.types.reduce((s, t) => s + t.sold, 0);
  const conv = a.funnel.views ? (a.funnel.paid / a.funnel.views) * 100 : 0;
  const peak = a.byHour.indexOf(Math.max(...a.byHour));
  const url = `${FAN_URL}/e/${ev.slug}`;

  async function setStatus(status: string) {
    if (status === 'cancelled' && !confirm('Cancel this event? Every ticket holder will be notified by SMS and push.')) return;
    await post(`/org/events/${id}/status`, { status });
    toast.success(status === 'published' ? 'Published — your followers and app users were notified' : status === 'cancelled' ? 'Event cancelled' : 'Moved to drafts');
    refresh();
  }

  const filtered = (people ?? []).filter((p) => !q || JSON.stringify(p).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />Dashboard</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><Badge tone={statusTone(ev.status)}>{ev.status}</Badge>{live(a) && <Badge tone="hot"><span className="size-1.5 animate-pulse rounded-full bg-hot" />Live now</Badge>}</div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{ev.title}</h1>
          <p className="text-muted">{fmtDate(ev.startsAt)} · {fmtTime(ev.startsAt)} · {ev.venueName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ev.status !== 'published' ? <Button variant="primary" onClick={() => setStatus('published')}><Rocket className="size-4" />Publish & notify fans</Button>
            : <Button variant="secondary" onClick={() => setStatus('draft')}><Undo2 className="size-4" />Unpublish</Button>}
          <Link to={`/events/${id}/edit`}><Button variant="secondary"><Pencil className="size-4" />Edit</Button></Link>
          <Button variant="secondary" onClick={() => setAnnounce(true)}><Megaphone className="size-4" />Message attendees</Button>
          <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(url); toast.success('Link copied'); }}><Link2 className="size-4" />Copy link</Button>
          <a href={url} target="_blank" rel="noopener"><Button variant="ghost"><ExternalLink className="size-4" />View</Button></a>
          {ev.status !== 'cancelled' && <Button variant="danger" onClick={() => setStatus('cancelled')}><Ban className="size-4" />Cancel</Button>}
        </div>
      </div>

      <ReviewQueue items={a.review} onDone={refresh} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Gross" value={ksh(a.money.gross)} />
        <Stat label="Net payout" value={ksh(a.money.net)} accent />
        <Stat label="Sold" value={<>{num(sold)}<span className="text-base text-muted"> / {num(cap)}</span></>} />
        <Stat label="Page views" value={num(a.funnel.views)} />
        <Stat label="View → buy" value={`${conv.toFixed(1)}%`} />
        <Stat label="Returning fans" value={`${a.buyers ? Math.round((a.returning / a.buyers) * 100) : 0}%`} hint={`${num(a.returning)} of ${num(a.buyers)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Gate check-in</h2>
            <span className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-2.5 py-1 text-xs"><KeyRound className="size-3.5 text-muted" />PIN <b className="font-mono">{ev.gatePin}</b></span></div>
          <div className="mt-3 flex items-baseline gap-2"><span className="text-4xl font-extrabold tabular-nums">{num(a.checkedIn)}</span><span className="text-muted">of {num(a.issued)} in</span></div>
          <Progress value={a.issued ? (a.checkedIn / a.issued) * 100 : 0} className="mt-3" />
          <div className="mt-4"><div className="eyebrow mb-2">Arrivals · 10-min</div>
            <Bars data={a.arrivals.map((x) => ({ label: fmtTime(x.at), value: x.n }))} height={130} color="#4ade80" /></div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>Duplicates blocked <b className="text-fg">{a.scans.duplicate ?? 0}</b></span><span>Fakes rejected <b className="text-fg">{(a.scans.invalid ?? 0) + (a.scans.wrong_event ?? 0)}</b></span>
            <span>Door sales <b className="text-fg">{a.door.n}</b> ({ksh(a.door.v)})</span>
          </div>
          <a href="/scan" target="_blank" className="mt-4 block"><Button variant="secondary" block><ScanLine className="size-4" />Open gate scanner</Button></a>
        </div>
        <div className="card p-5">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="font-semibold">Sales per day</h2><span className="text-sm text-muted">{num(a.money.orders)} orders</span></div>
          <RevenueArea data={a.byDay.map((d) => ({ label: new Date(d.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }), value: d.revenue }))} height={180} />
          <div className="eyebrow mb-2 mt-4">When your fans buy · hour of day</div>
          <Bars data={a.byHour.map((v, h) => ({ label: `${h}h`, value: v }))} height={110} />
          <p className="mt-2 text-xs text-muted">Peak buying hour is <b className="text-fg">{peak}:00</b> — post on socials and send push alerts just before it.</p>
        </div>
      </div>

      <div className="card overflow-x-auto p-5">
        <h2 className="mb-4 font-semibold">Ticket types</h2>
        <table className="w-full min-w-[680px] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-subtle">{['Type', 'Price', 'Sold', 'Comps', 'Left', 'Revenue', 'In', ''].map((h) => <th key={h} className="pb-3 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {a.types.map((t) => (
              <tr key={t.id}><td className="py-3 font-medium">{t.name}</td><td className="tabular-nums">{ksh(t.price)}</td><td className="tabular-nums">{num(t.sold)}</td><td className="tabular-nums">{t.comps}</td>
                <td className={cn('tabular-nums', t.remaining === 0 && 'text-danger')}>{t.remaining === 0 ? 'Sold out' : num(t.remaining)}</td><td className="tabular-nums">{ksh(t.revenue)}</td><td className="tabular-nums">{num(t.checkedIn)}</td>
                <td className="w-40"><Progress value={t.quantity ? ((t.sold + t.comps) / t.quantity) * 100 : 0} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-1">
          <h2 className="font-semibold">Checkout funnel</h2>
          {[['Viewed event', a.funnel.views], ['Started M-Pesa payment', a.funnel.started], ['Paid', a.funnel.paid]].map(([l, v]) => (
            <div key={l as string} className="mt-4"><div className="mb-1.5 flex justify-between text-sm"><span className="text-muted">{l}</span><b className="tabular-nums">{num(v as number)}</b></div>
              <Progress value={a.funnel.views ? Math.max(1.5, ((v as number) / a.funnel.views) * 100) : 0} /></div>
          ))}
          <div className="mt-5 rounded-xl bg-danger/10 p-3 text-sm"><b>{num(a.funnel.failed)}</b> payments didn’t finish — <b>{ksh(a.funnel.failedValue)}</b> left on the table.</div>
          <div className="mt-3 space-y-1">{a.failReasons.map((r) => <div key={r.reason} className="flex justify-between text-xs text-muted"><span className="truncate pr-2">{r.reason}</span><span>{r.n}</span></div>)}</div>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Promo codes</h2>
          {a.promos.length ? <div className="mt-3 divide-y divide-line">{a.promos.map((p) => (
            <div key={p.code} className="flex items-center justify-between py-2.5 text-sm"><span className="font-mono font-semibold">{p.code}</span><span className="text-muted">{p.percentOff}% off</span><span className="tabular-nums">{p.used}{p.maxUses ? ` / ${p.maxUses}` : ''} used</span></div>
          ))}</div> : <p className="mt-3 text-sm text-muted">None yet — add one in Edit.</p>}
          <h2 className="mt-6 font-semibold">Audience</h2>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted">Unique buyers</span><b>{num(a.buyers)}</b></div>
            <div className="flex justify-between"><span className="text-muted">Came to your other events</span><b>{num(a.returning)}</b></div>
            <div className="flex justify-between"><span className="text-muted">Friend squads planning this</span><b>{num(a.squads)}</b></div>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Payout</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Gross</span><span className="tabular-nums">{ksh(a.money.gross)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Platform fee ({a.feePct}%)</span><span className="tabular-nums">− {ksh(a.money.platformFee)}</span></div>
            <div className="flex justify-between"><span className="text-muted">M-Pesa charges (est.)</span><span className="tabular-nums">− {ksh(a.money.mpesaCost)}</span></div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><span>Net to you</span><span className="tabular-nums text-brand-soft">{ksh(a.money.net)}</span></div>
          </div>
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-xs text-muted"><ShieldAlert className="mt-px size-4 shrink-0 text-info" />Tickets are only issued after Safaricom confirms each payment. Mismatches go to your review queue.</div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Attendees <span className="text-muted">· {num(people?.length)}</span></h2>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setComp(true)}><Gift className="size-4" />Guest list</Button>
            <a href={`/api/org/events/${id}/attendees?format=csv`}><Button size="sm" variant="secondary"><Download className="size-4" />CSV</Button></a>
          </div>
        </div>
        <div className="relative mt-4"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, code or M-Pesa receipt" className="pl-10" /></div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-subtle">{['Name', 'Phone', 'Ticket', 'Status', 'Receipt', 'Code'].map((h) => <th key={h} className="py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {filtered.slice(0, 150).map((r) => (
                <tr key={r.code}>
                  <td className="py-2.5">{r.holderName}{r.isComp && <Badge tone="glow" className="ml-2">comp</Badge>}{r.source === 'door' && <Badge tone="info" className="ml-2"><Store className="size-3" />door</Badge>}</td>
                  <td className="tabular-nums text-muted">{prettyPhone(r.holderPhone)}</td><td>{r.typeName}</td>
                  <td>{r.status === 'used' ? <Badge tone="brand">In · {r.checkedInAt && fmtTime(r.checkedInAt)}</Badge> : <Badge>Not in</Badge>}</td>
                  <td className="font-mono text-xs text-muted">{r.receipt}</td><td className="font-mono text-xs text-subtle">{r.code.split('.')[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-subtle">{Math.min(150, filtered.length)} of {filtered.length} shown</p>
        </div>
      </div>

      <CompSheet id={id} types={a.types} open={comp} onOpenChange={setComp} onDone={refresh} />
      <AnnounceSheet id={id} count={a.issued} open={announce} onOpenChange={setAnnounce} />
    </div>
  );
}

function CompSheet({ id, types, open, onOpenChange, onDone }: { id: string; types: Analytics['types']; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', ticketTypeId: '', qty: 1 });
  const [links, setLinks] = useState<string[] | null>(null);
  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setLinks(null); }} title="Add to guest list" description="Free tickets for VIPs, artists, staff or sponsors. They get a QR on their phone like everyone else and are tracked separately.">
      {links ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Issued and sent by SMS. Share these links too:</p>
          {links.map((l) => <div key={l} className="break-all rounded-xl bg-surface-2 p-3 font-mono text-xs">{FAN_URL}{l}</div>)}
          <Button block onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          try { const r = await post<{ links: string[] }>(`/org/events/${id}/comps`, { ...f, ticketTypeId: f.ticketTypeId || types[0]?.id }); setLinks(r.links); onDone(); }
          catch (err) { toast.error((err as Error).message); }
        }}>
          <Field label="Guest name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Guest phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" placeholder="07XX XXX XXX" required /></Field>
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <Field label="Ticket type"><Select value={f.ticketTypeId} onChange={(e) => setF({ ...f, ticketTypeId: e.target.value })}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="How many"><Input type="number" min={1} max={20} value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} /></Field>
          </div>
          <Button variant="primary" size="lg" block><Gift className="size-4" />Issue guest tickets</Button>
        </form>
      )}
    </Sheet>
  );
}

function AnnounceSheet({ id, count, open, onOpenChange }: { id: string; count: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [message, setMessage] = useState('');
  const [sms, setSms] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Message ticket holders" description={`Goes to all ${num(count)} ticket holders as an app notification. Use it for gate times, parking, line-up changes or weather.`}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try { const r = await post<{ sent: number }>(`/org/events/${id}/announce`, { message, sms }); toast.success(`Sent to ${num(r.sent)} people`); setMessage(''); onOpenChange(false); }
        catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
      }}>
        <Field label="Message" hint={`${message.length}/300`}><Textarea rows={4} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Gates open at 4pm today — free parking at the back entrance." required /></Field>
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />Also send by SMS (charged by your SMS provider)</label>
        <Button variant="primary" size="lg" block loading={busy}><Megaphone className="size-4" />Send announcement</Button>
      </form>
    </Sheet>
  );
}
