import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeftRight, CalendarPlus, Clock, Download, Hourglass, MapPin, PartyPopper, Ticket as TicketIcon, WifiOff } from 'lucide-react';
import { api, post } from '@shared/api';
import type { EventLite, OrderView, TicketLite } from '@shared/types';
import { useAuth, useMe } from '@/lib/hooks';
import { fmtTime, ksh, prettyPhone, relDay } from '@shared/utils';
import { downloadTicket, offline, TicketCard, type SavedTicket } from '@/components/ticket';
import { Poster } from '@shared/event';
import { Badge, Button, Empty, Field, Input, Sheet, Skeleton } from '@shared/ui';

export function OrderPage() {
  const { ref = '' } = useParams();
  const { data: me } = useMe();
  const { requireLogin } = useAuth();
  const { data: o, isLoading } = useQuery({ queryKey: ['order', ref], queryFn: () => api<OrderView>('/orders/' + ref), refetchInterval: (q) => (q.state.data?.status === 'pending' ? 3000 : false) });
  useEffect(() => { if (o?.status === 'paid') offline.save(o.tickets, o.event); }, [o]);

  if (isLoading || !o) return <Skeleton className="mx-auto h-[600px] max-w-sm rounded-[28px]" />;
  const paid = o.status === 'paid';
  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
        <div className={`mx-auto mb-4 grid size-16 place-items-center rounded-2xl ${paid ? 'bg-brand/15 text-brand-soft' : 'bg-warn/15 text-warn'}`}>
          {paid ? <PartyPopper className="size-8" /> : o.status === 'pending' ? <Hourglass className="size-8" /> : <AlertCircle className="size-8" />}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {paid ? <>You’re <span className="font-display italic text-brand-soft">going!</span></> : o.status === 'pending' ? 'Waiting for payment' : o.status === 'review' ? 'Payment under review' : 'Payment not completed'}
        </h1>
        <p className="mt-2 text-muted">{o.event.title} · {relDay(o.event.startsAt)} {fmtTime(o.event.startsAt)}</p>
        {o.receipt && <p className="mt-1 text-xs text-subtle">M-Pesa receipt <span className="font-mono text-muted">{o.receipt}</span> · Order {o.ref} · {ksh(o.total)}</p>}
      </motion.div>

      {paid && (
        <>
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={async () => { for (const t of o.tickets) await downloadTicket(t, o.event); }}><Download className="size-4" />Download all</Button>
            <a href={`/api/events/${o.event.slug}/ics`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface-3 px-4 font-medium"><CalendarPlus className="size-4" />Add to calendar</a>
            {!me && <Button variant="outline" onClick={() => requireLogin(`Log in with ${prettyPhone(o.phone)} to keep these`)}>Save to my account</Button>}
          </div>
          <p className="mb-6 flex items-center justify-center gap-1.5 text-center text-sm text-muted"><WifiOff className="size-4" />Saved on this device — your tickets open even without internet.</p>
          <div className="flex flex-wrap justify-center gap-10 [&>*]:w-full [&>*]:sm:w-[24rem]">
            {o.tickets.map((t, i) => <TicketCard key={t.code} t={t} ev={o.event} index={i} actions={<Link to={`/t/${t.code}`} className="inline-flex h-9 items-center rounded-xl border border-line px-3 text-sm font-medium">Open</Link>} />)}
          </div>
        </>
      )}
      {o.status === 'review' && <p className="mx-auto max-w-md text-center text-muted">{o.review}. The organizer has been alerted and will issue your tickets or refund you.</p>}
    </div>
  );
}

export function TicketPage() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const { requireLogin } = useAuth();
  const [xfer, setXfer] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ticket', code], retry: false,
    queryFn: () => api<TicketLite & { event: EventLite; replacedBy?: string }>('/tickets/' + code),
  });
  const saved = offline.get(code);
  const t = data ?? (isError && saved ? saved : null);
  useEffect(() => { if (data && data.status === 'valid') offline.save([data], data.event); }, [data]);

  if (isLoading) return <Skeleton className="mx-auto h-[600px] max-w-sm rounded-[28px]" />;
  if (!t) return <Empty icon={<TicketIcon />} title="Ticket not found" />;
  return (
    <div className="mx-auto max-w-md">
      {!data && <div className="mb-4 flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn"><WifiOff className="size-4" />You’re offline — this is your saved ticket. It will still scan.</div>}
      <TicketCard t={t} ev={t.event} actions={t.status === 'valid' && data ? <Button size="sm" variant="secondary" onClick={async () => { if (await requireLogin('Log in to transfer')) setXfer(true); }}><ArrowLeftRight className="size-4" />Transfer</Button> : null} />
      <div className="mt-6 text-center"><Link to={`/e/${t.event.slug}`} className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">Event details, directions & nearby</Link></div>
      <TransferSheet code={code} open={xfer} onOpenChange={setXfer} onDone={() => nav('/tickets')} />
    </div>
  );
}

function TransferSheet({ code, open, onOpenChange, onDone }: { code: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Transfer ticket" description="Your QR stops working immediately and your friend gets a brand-new one. Screenshots can be sold to many people — official transfers can’t.">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try { await post(`/tickets/${code}/transfer`, { name, phone }); offline.remove(code); toast.success('Ticket sent — they’ll get a notification and SMS'); onOpenChange(false); onDone(); }
        catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
      }}>
        <Field label="Friend’s name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Friend’s phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="07XX XXX XXX" required /></Field>
        <Button variant="primary" size="lg" block loading={busy}>Send ticket</Button>
      </form>
    </Sheet>
  );
}

export function MyTickets() {
  const { data: me } = useMe();
  const { requireLogin } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['myTickets'], enabled: !!me,
    queryFn: () => api<{ tickets: SavedTicket[]; pending: { ref: string; status: string; total: number; title: string; review?: string }[] }>('/me/tickets'),
  });
  const list: SavedTicket[] = [...(data?.tickets ?? [])];
  for (const s of offline.all()) if (!list.some((t) => t.code === s.code)) list.push(s);
  const now = Date.now() - 12 * 3600e3;
  const upcoming = list.filter((t) => +new Date(t.event.startsAt) > now).sort((a, b) => +new Date(a.event.startsAt) - +new Date(b.event.startsAt));
  const past = list.filter((t) => +new Date(t.event.startsAt) <= now);
  // group by event
  const groups = Object.values(upcoming.reduce<Record<string, SavedTicket[]>>((g, t) => { (g[t.event.slug] ||= []).push(t); return g; }, {}));

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight">Your tickets</h1>
      <p className="mt-1 text-muted">{me ? `Everything bought with ${prettyPhone(me.phone)}.` : 'Tickets saved on this device.'}</p>
      {!me && (
        <button onClick={() => requireLogin('Recover your tickets')} className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-glow/30 bg-glow/10 p-4 text-left">
          <AlertCircle className="size-5 shrink-0 text-glow" />
          <span className="text-sm">Lost a ticket or bought on another phone? <b>Log in with your M-Pesa number</b> to recover every ticket bought with it.</span>
        </button>
      )}
      {data?.pending.map((p) => (
        <Link key={p.ref} to={`/order/${p.ref}`} className="mt-4 flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm">
          <Clock className="size-5 text-warn" /><span className="flex-1">{p.status === 'review' ? 'Payment under review' : 'Waiting for payment'} — <b>{p.title}</b> · {ksh(p.total)}</span>
        </Link>
      ))}
      <div className="mt-6 space-y-3">
        {isLoading && me ? [0, 1].map((i) => <Skeleton key={i} className="h-24" />) : groups.length ? groups.map((g, i) => (
          <motion.div key={g[0].event.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Link to={g.length === 1 ? `/t/${g[0].code}` : `/t/${g[0].code}`} className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-3 transition hover:border-line-strong">
              <Poster ev={g[0].event} className="size-20 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-brand-soft">{relDay(g[0].event.startsAt)} · {fmtTime(g[0].event.startsAt)}</div>
                <div className="truncate text-lg font-semibold">{g[0].event.title}</div>
                <div className="flex items-center gap-1 truncate text-sm text-muted"><MapPin className="size-3.5" />{g[0].event.venueName}</div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Badge tone="brand"><TicketIcon className="size-3" />{g.length}</Badge>
                {g.some((t) => t.status === 'used') && <Badge>Scanned</Badge>}
              </div>
            </Link>
            {g.length > 1 && (
              <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pl-2">
                {g.map((t, k) => <Link key={t.code} to={`/t/${t.code}`} className="shrink-0 rounded-xl border border-line px-3 py-1.5 text-xs text-muted hover:text-fg">#{k + 1} {t.typeName}{t.status === 'used' ? ' · in' : ''}</Link>)}
              </div>
            )}
          </motion.div>
        )) : <Empty icon={<TicketIcon />} title="No upcoming tickets" action={<Link to="/"><Button variant="primary">Find something to do</Button></Link>}>When you buy tickets they show up here — and work offline.</Empty>}
      </div>
      {past.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-lg font-bold text-muted">Past events</h2>
          <div className="space-y-2 opacity-60">{past.map((t) => <Link key={t.code} to={`/t/${t.code}`} className="flex justify-between rounded-xl border border-line p-3 text-sm"><span>{t.event.title}</span><span className="text-muted">{t.typeName}</span></Link>)}</div>
        </>
      )}
    </div>
  );
}
