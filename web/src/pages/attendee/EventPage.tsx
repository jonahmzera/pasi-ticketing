import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { AlertTriangle, BadgeCheck, CalendarPlus, CalendarDays, IdCard, Lock, MapPin, Minus, Plus, Share2, Shirt, Smartphone, Users } from 'lucide-react';
import { api, post } from '@shared/api';
import type { EventDetail } from '@shared/types';
import { useAuth } from '@/lib/hooks';
import { cn, fmtLongDate, fmtTime, ksh, num } from '@shared/utils';
import { CategoryIcon, Poster } from '@shared/event';
import { VenueExplorer } from '@/components/map';
import { Checkout } from '@/components/checkout';
import { NewSquad } from './Squads';
import { Avatar, Badge, Button, Skeleton } from '@shared/ui';

export default function EventPage() {
  const { slug = '' } = useParams();
  const qc = useQueryClient();
  const { requireLogin } = useAuth();
  const { data: ev, isLoading, error } = useQuery({ queryKey: ['event', slug], queryFn: () => api<EventDetail>('/events/' + slug) });
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);
  const [squad, setSquad] = useState(false);

  if (isLoading) return <div className="space-y-4"><Skeleton className="aspect-[21/9] rounded-3xl" /><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40" /></div>;
  if (error || !ev) return <p className="py-20 text-center text-muted">{(error as Error)?.message || 'Event not found'}</p>;

  const qty = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = ev.ticketTypes.reduce((a, t) => a + (cart[t.id] || 0) * t.price, 0);
  const onSale = ev.status === 'published' && ev.ticketTypes.some((t) => t.state === 'on_sale');

  const change = (id: string, d: number) => {
    const t = ev.ticketTypes.find((x) => x.id === id)!;
    const next = Math.max(0, (cart[id] || 0) + d);
    if (d > 0 && next > t.remaining) return toast(`Only ${t.remaining} left`);
    if (d > 0 && qty + 1 > ev.maxPerBuyer) return toast(`Max ${ev.maxPerBuyer} tickets per person for this event`);
    setCart({ ...cart, [id]: next });
  };

  async function follow() {
    if (!(await requireLogin('Log in to follow organizers'))) return;
    const r = await post<{ following: boolean }>(`/orgs/${ev!.org.id}/follow`);
    qc.invalidateQueries({ queryKey: ['event', slug] });
    toast.success(r.following ? `You’ll get a notification when ${ev!.org.name} posts events` : 'Unfollowed');
  }
  async function share() {
    const url = `${location.origin}/e/${ev!.slug}`;
    if (navigator.share) return navigator.share({ title: ev!.title, text: `${ev!.title} — ${fmtLongDate(ev!.startsAt)} at ${ev!.venueName}`, url }).catch(() => {});
    await navigator.clipboard.writeText(url); toast.success('Link copied');
  }

  return (
    <div>
      {/* Hero */}
      <div className="relative -mx-4 -mt-5 mb-6 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-3xl">
        <Poster ev={ev} rounded={false} className="aspect-[4/3] sm:aspect-[21/9]">
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" />
        </Poster>
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge className="bg-black/50 backdrop-blur"><CategoryIcon category={ev.category} className="size-3" />{ev.category}</Badge>
            {ev.going > 20 && <Badge className="bg-black/50 backdrop-blur"><Users className="size-3" />{num(ev.going)} going</Badge>}
            {ev.sellingFast && <Badge tone="hot">Selling fast</Badge>}
          </div>
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{ev.title}</motion.h1>
        </div>
      </div>

      {ev.status === 'cancelled' && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm"><AlertTriangle className="size-5 text-danger" />This event has been cancelled. The organizer will contact ticket holders about refunds.</div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          {/* Key facts */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Fact icon={<CalendarDays />} title={fmtLongDate(ev.startsAt)} sub={`${fmtTime(ev.startsAt)}${ev.endsAt ? ` – ${fmtTime(ev.endsAt)}` : ''} · EAT`} />
            <Fact icon={<MapPin />} title={ev.venueName} sub={ev.address} />
            {ev.ageLimit ? <Fact icon={<IdCard />} title={`${ev.ageLimit}+ only`} sub="ID checked at the gate" /> : null}
            {ev.dressCode ? <Fact icon={<Shirt />} title="Dress code" sub={ev.dressCode} /> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setSquad(true)}><Users className="size-4" />Plan with friends</Button>
            <Button variant="secondary" onClick={share}><Share2 className="size-4" />Share</Button>
            <a href={`/api/events/${ev.slug}/ics`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface-3 px-4 text-[15px] font-medium hover:bg-line-strong"><CalendarPlus className="size-4" />Add to calendar</a>
          </div>

          {ev.friendsGoing.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-glow/30 bg-glow/10 p-4">
              <div className="flex -space-x-2">{ev.friendsGoing.slice(0, 4).map((n) => <Avatar key={n} name={n} className="size-8 text-xs" />)}</div>
              <p className="text-sm"><b>{ev.friendsGoing.slice(0, 2).join(', ')}</b>{ev.friendsGoing.length > 2 ? ` and ${ev.friendsGoing.length - 2} more friends are` : ev.friendsGoing.length > 1 ? ' are' : ' is'} going</p>
            </div>
          )}

          {/* Organizer */}
          <div className="card flex items-center gap-4 p-4">
            <Avatar name={ev.org.name} className="size-12" />
            <Link to={`/o/${ev.org.slug}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-semibold">{ev.org.name}{ev.org.verified && <BadgeCheck className="size-4 text-info" aria-label="Verified" />}</div>
              <div className="text-sm text-muted">{ev.org.verified ? 'Verified organizer — identity and payout account checked' : 'Organizer'}</div>
            </Link>
            <Button size="sm" variant={ev.org.following ? 'secondary' : 'light'} onClick={follow}>{ev.org.following ? 'Following' : 'Follow'}</Button>
          </div>

          <section>
            <h2 className="mb-3 text-xl font-bold tracking-tight">About</h2>
            <p className="whitespace-pre-line leading-relaxed text-muted">{ev.description}</p>
            {ev.lineup?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">{ev.lineup.map((l) => <span key={l} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm">{l}</span>)}</div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold tracking-tight">Getting there & staying nearby</h2>
            <VenueExplorer ev={ev} />
          </section>
        </div>

        {/* Tickets */}
        <aside id="tickets" className="lg:sticky lg:top-20 lg:self-start">
          <div className="card p-5">
            <div className="flex items-baseline justify-between"><h2 className="text-lg font-bold">Tickets</h2><span className="text-xs text-muted">Max {ev.maxPerBuyer} per person</span></div>
            <div className="mt-2 divide-y divide-line">
              {ev.ticketTypes.map((t) => {
                const q = cart[t.id] || 0;
                const off = t.state !== 'on_sale' || ev.status !== 'published';
                return (
                  <div key={t.id} className={cn('flex items-center gap-3 py-4', off && 'opacity-55')}>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{t.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        {t.admits > 1 && <span className="inline-flex items-center gap-1"><Users className="size-3" />Admits {t.admits}</span>}
                        {t.low && <span className="font-semibold text-warn">Only {t.remaining} left</span>}
                        {t.state === 'sold_out' && <span className="font-semibold text-danger">Sold out</span>}
                        {t.state === 'not_started' && <span>Not on sale yet</span>}
                        {t.state === 'ended' && <span>Sales closed</span>}
                      </div>
                      <div className="mt-1 font-bold tabular-nums">{ksh(t.price)}</div>
                    </div>
                    {!off && (
                      <div className="flex items-center gap-2.5">
                        <button aria-label={`Remove one ${t.name}`} disabled={!q} onClick={() => change(t.id, -1)} className="grid size-10 place-items-center rounded-xl border border-line bg-surface-2 transition hover:border-line-strong disabled:opacity-30"><Minus className="size-4" /></button>
                        <span className="w-5 text-center font-bold tabular-nums" aria-live="polite">{q}</span>
                        <button aria-label={`Add one ${t.name}`} onClick={() => change(t.id, 1)} className="grid size-10 place-items-center rounded-xl bg-fg text-bg transition hover:bg-white"><Plus className="size-4" /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Button variant="primary" size="lg" block className="mt-3" disabled={!qty} onClick={() => setCheckout(true)}>
              <Smartphone className="size-5" />{qty ? `${total ? `Pay ${ksh(total)}` : 'Get free tickets'} · ${qty}` : onSale ? 'Select tickets' : 'Not available'}
            </Button>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-subtle"><Lock className="mt-px size-3.5 shrink-0" />M-Pesa STK push. You only ever enter your PIN on your own phone. No hidden fees.</p>
          </div>
        </aside>
      </div>

      {/* Mobile buy bar */}
      {onSale && (
        <div className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 lg:hidden">
          <div className="glass flex items-center gap-3 rounded-2xl p-2.5 pl-4 shadow-2xl">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">{qty ? `${qty} ticket${qty > 1 ? 's' : ''}` : 'From'}</div>
              <div className="font-bold tabular-nums">{qty ? ksh(total) : ksh(ev.minPrice)}</div>
            </div>
            <Button variant="primary" onClick={() => (qty ? setCheckout(true) : document.getElementById('tickets')?.scrollIntoView({ behavior: 'smooth' }))}>
              {qty ? <><Smartphone className="size-4" />Pay with M-Pesa</> : 'Get tickets'}
            </Button>
          </div>
        </div>
      )}

      <Checkout ev={ev} cart={cart} open={checkout} onOpenChange={setCheckout} />
      <NewSquad ev={ev} open={squad} onOpenChange={setSquad} />
    </div>
  );
}

function Fact({ icon, title, sub }: { icon: React.ReactNode; title?: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-brand-soft [&_svg]:size-5">{icon}</span>
      <div className="min-w-0"><div className="font-semibold">{title}</div>{sub && <div className="text-sm text-muted">{sub}</div>}</div>
    </div>
  );
}
