import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, HelpCircle, MapPin, MessageCircle, Navigation, Send, Ticket, UserPlus, Users, X } from 'lucide-react';
import { api, post, put } from '@shared/api';
import type { EventDetail, PlanView } from '@shared/types';
import { useAuth, useMe } from '@/lib/hooks';
import { cn, fmtTime, ksh, prettyPhone, relDay } from '@shared/utils';
import { Poster } from '@shared/event';
import { Avatar, Badge, Button, Empty, Field, Input, Sheet, Skeleton } from '@shared/ui';

export function NewSquad({ ev, open, onOpenChange }: { ev: EventDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const nav = useNavigate();
  const { requireLogin } = useAuth();
  const { data: me } = useMe();
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: friends } = useQuery({ queryKey: ['friends'], enabled: !!me && open, queryFn: () => api<{ phone: string; name: string; onApp: boolean }[]>('/me/friends') });

  useEffect(() => {
    if (!open) return;
    setTitle(`${ev.title} squad`);
    if (!me) requireLogin('Log in to plan with friends').then((m) => { if (!m) onOpenChange(false); });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={open && !!me} onOpenChange={onOpenChange} title="Plan with friends" description="Everyone sees the same event, prices, map and travel time. Vote and chat here — no forwarding posters between apps.">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try {
          const phones = [...picked, ...extra.split(',').map((x) => x.trim()).filter(Boolean)];
          const r = await post<{ id: string }>('/plans', { eventSlug: ev.slug, title, phones });
          onOpenChange(false); nav('/squads/' + r.id);
        } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
      }}>
        <Field label="Squad name"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        {!!friends?.length && (
          <div>
            <div className="mb-2 text-[13px] font-medium text-muted">Invite friends</div>
            <div className="flex flex-wrap gap-2">
              {friends.map((f) => {
                const on = picked.includes(f.phone);
                return (
                  <button type="button" key={f.phone} onClick={() => setPicked(on ? picked.filter((p) => p !== f.phone) : [...picked, f.phone])}
                    className={cn('flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition', on ? 'border-brand bg-brand/15' : 'border-line bg-surface-2')}>
                    <Avatar name={f.name} className="size-7 text-[10px]" />{f.name || prettyPhone(f.phone)}{on && <Check className="size-3.5 text-brand-soft" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <Field label="Add phone numbers" hint="Separate with commas. People not on Pasi yet get an SMS invite."><Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0712 345 678, 0722 000 111" inputMode="tel" /></Field>
        <Button variant="primary" size="lg" block loading={busy}><Users className="size-5" />Create squad</Button>
      </form>
    </Sheet>
  );
}

export function SquadsPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const { requireLogin } = useAuth();
  const { data: plans, isLoading } = useQuery({ queryKey: ['plans'], enabled: !!me, queryFn: () => api<PlanView[]>('/me/plans') });
  if (meLoading) return <Skeleton className="h-40" />;
  if (!me) return (
    <Empty icon={<Users />} title="Plan nights out together" action={<Button variant="primary" onClick={() => requireLogin()}>Log in with phone</Button>}>
      Add friends by phone number, vote on events, see who already has a ticket and chat — all in one place.
    </Empty>
  );
  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight">Squads</h1>
      <p className="mt-1 text-muted">Open any event and tap <b className="text-fg">Plan with friends</b> to start one.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {isLoading ? [0, 1].map((i) => <Skeleton key={i} className="h-28" />) : plans?.length ? plans.map((p) => {
          const going = p.members.filter((m) => m.vote === 'going').length;
          const mine = p.members.find((m) => m.me);
          return (
            <Link key={p.id} to={`/squads/${p.id}`} className="flex gap-4 rounded-3xl border border-line bg-surface p-3 transition hover:border-line-strong">
              <Poster ev={p.event} className="size-24 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1 py-1">
                <div className="flex items-start justify-between gap-2"><div className="truncate font-semibold">{p.title}</div>{!mine?.vote && <Badge tone="hot">Vote</Badge>}</div>
                <div className="text-sm text-muted">{relDay(p.event.startsAt)} · {fmtTime(p.event.startsAt)}</div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex -space-x-2">{p.members.slice(0, 5).map((m, i) => <Avatar key={i} name={m.name} className="size-7 text-[10px]" />)}</div>
                  <span className="text-xs text-muted">{going}/{p.members.length} going{p.messages.length ? ` · ${p.messages.length} msgs` : ''}</span>
                </div>
              </div>
            </Link>
          );
        }) : <div className="sm:col-span-2"><Empty icon={<Users />} title="No squads yet">Start one from any event page.</Empty></div>}
      </div>
    </div>
  );
}

const VOTES = [
  { v: 'going', label: 'Going', icon: Check, tone: 'bg-brand text-on-brand' },
  { v: 'maybe', label: 'Maybe', icon: HelpCircle, tone: 'bg-warn text-zinc-900' },
  { v: 'no', label: "Can't", icon: X, tone: 'bg-surface-3 text-fg' },
] as const;

export function SquadPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { requireLogin } = useAuth();
  const [msg, setMsg] = useState('');
  const [invite, setInvite] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const { data: p, isLoading } = useQuery({ queryKey: ['plan', id], enabled: !!me, queryFn: () => api<PlanView>('/plans/' + id), refetchInterval: 5000 });
  const set = (d: PlanView) => qc.setQueryData(['plan', id], d);
  useEffect(() => { if (me === null) requireLogin('Log in to see this squad'); }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [p?.messages.length]);

  if (isLoading || !p) return <Skeleton className="h-96" />;
  const meM = p.members.find((m) => m.me);
  const counts = { going: p.members.filter((m) => m.vote === 'going').length, maybe: p.members.filter((m) => m.vote === 'maybe').length };

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/squads" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />Squads</Link>
      <h1 className="text-3xl font-extrabold tracking-tight">{p.title}</h1>

      <Link to={`/e/${p.event.slug}`} className="mt-5 flex gap-4 rounded-3xl border border-line bg-surface p-3 transition hover:border-line-strong">
        <Poster ev={p.event} className="h-28 w-28 shrink-0 rounded-2xl" />
        <div className="min-w-0 py-1">
          <div className="text-sm font-semibold text-brand-soft">{relDay(p.event.startsAt)} · {fmtTime(p.event.startsAt)}</div>
          <div className="text-lg font-semibold">{p.event.title}</div>
          <div className="flex items-center gap-1 text-sm text-muted"><MapPin className="size-3.5" />{p.event.venueName}</div>
          <div className="mt-2 text-sm font-bold">{p.event.minPrice == null ? 'Sold out' : `from ${ksh(p.event.minPrice)}`}</div>
        </div>
      </Link>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Are you in?</h2>
        <div className="grid grid-cols-3 gap-2">
          {VOTES.map(({ v, label, icon: I, tone }) => (
            <button key={v} onClick={async () => set(await post<PlanView>(`/plans/${id}/vote`, { vote: v }))}
              className={cn('flex h-14 items-center justify-center gap-2 rounded-2xl border font-semibold transition active:scale-95', meM?.vote === v ? `${tone} border-transparent` : 'border-line bg-surface text-muted hover:text-fg')}>
              <I className="size-5" />{label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={`/e/${p.event.slug}#tickets`}><Button variant="primary"><Ticket className="size-4" />Get my ticket</Button></Link>
          <a target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${p.event.lat},${p.event.lng}`}><Button variant="secondary"><Navigation className="size-4" />Directions</Button></a>
          <Button variant="secondary" onClick={() => setInvite(true)}><UserPlus className="size-4" />Invite</Button>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between"><h2 className="font-semibold">Who’s coming</h2><span className="text-sm text-muted">{counts.going} going · {counts.maybe} maybe</span></div>
        <div className="card divide-y divide-line">
          {p.members.map((m, i) => (
            <div key={i} className="flex items-center gap-3 p-3.5">
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1"><div className="font-medium">{m.name}{m.me && <span className="text-muted"> (you)</span>}</div>
                <div className="text-xs text-muted">{m.vote === 'going' ? 'Going' : m.vote === 'maybe' ? 'Maybe' : m.vote === 'no' ? "Can't make it" : 'Hasn’t replied'}{!m.onApp && ' · invited by SMS'}</div></div>
              {m.hasTicket && <Badge tone="brand"><Ticket className="size-3" />Has ticket</Badge>}
            </div>
          ))}
        </div>
      </section>

      <MeetUp p={p} onSaved={set} />

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><MessageCircle className="size-4" />Chat</h2>
        <div className="card overflow-hidden">
          <div ref={chatRef} className="flex max-h-96 min-h-40 flex-col gap-2 overflow-y-auto p-4">
            {p.messages.length ? p.messages.map((m) => (
              <div key={m.id} className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.mine ? 'self-end rounded-br-md bg-brand text-on-brand' : 'self-start rounded-bl-md bg-surface-3')}>
                {!m.mine && <div className="mb-0.5 text-[11px] font-semibold text-glow">{m.name}</div>}
                {m.body}
                <div className={cn('mt-0.5 text-right text-[10px]', m.mine ? 'text-on-brand/60' : 'text-subtle')}>{fmtTime(m.at)}</div>
              </div>
            )) : <p className="m-auto text-sm text-muted">Say something to get the plan going 👋</p>}
          </div>
          <form className="flex gap-2 border-t border-line p-3" onSubmit={async (e) => { e.preventDefault(); if (!msg.trim()) return; const d = await post<PlanView>(`/plans/${id}/messages`, { body: msg }); setMsg(''); set(d); }}>
            <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message the squad" aria-label="Message" />
            <Button variant="primary" size="icon" className="h-12 w-12" aria-label="Send"><Send className="size-4" /></Button>
          </form>
        </div>
      </section>

      <InviteSheet id={id} open={invite} onOpenChange={setInvite} onDone={set} />
    </div>
  );
}

function MeetUp({ p, onSaved }: { p: PlanView; onSaved: (d: PlanView) => void }) {
  const [meet, setMeet] = useState(p.meetPoint || '');
  const [leave, setLeave] = useState(p.leaveAt || '');
  const dirty = meet !== (p.meetPoint || '') || leave !== (p.leaveAt || '');
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-semibold">Meet-up</h2>
      <div className="card grid gap-3 p-4 sm:grid-cols-[1fr_140px_auto] sm:items-end">
        <Field label="Meeting point"><Input value={meet} onChange={(e) => setMeet(e.target.value)} placeholder="e.g. Sarit Centre parking" /></Field>
        <Field label="Leave at"><Input type="time" value={leave} onChange={(e) => setLeave(e.target.value)} /></Field>
        <Button variant="primary" className="h-12" disabled={!dirty} onClick={async () => { onSaved(await put<PlanView>(`/plans/${p.id}`, { meetPoint: meet, leaveAt: leave })); toast.success('Saved for everyone'); }}>Save</Button>
      </div>
    </section>
  );
}

function InviteSheet({ id, open, onOpenChange, onDone }: { id: string; open: boolean; onOpenChange: (o: boolean) => void; onDone: (d: PlanView) => void }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Invite to squad">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        try { onDone(await post<PlanView>(`/plans/${id}/members`, { name, phone })); setName(''); setPhone(''); onOpenChange(false); toast.success('Invited'); }
        catch (err) { toast.error((err as Error).message); }
      }}>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="07XX XXX XXX" required /></Field>
        <Button variant="primary" size="lg" block>Send invite</Button>
      </form>
    </Sheet>
  );
}
