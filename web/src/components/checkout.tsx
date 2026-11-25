// Checkout + M-Pesa STK push waiting screen.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Lock, ShieldCheck, Smartphone, Tag, XCircle } from 'lucide-react';
import { api, post } from '@shared/api';
import type { EventDetail, OrderView } from '@shared/types';
import { LS, useConfig, useMe } from '@/lib/hooks';
import { fmtDate, ksh, prettyPhone } from '@shared/utils';
import { offline } from './ticket';
import { Button, Field, Input, Sheet } from '@shared/ui';

export function Checkout({ ev, cart, open, onOpenChange }: { ev: EventDetail; cart: Record<string, number>; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: me } = useMe();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [promo, setPromo] = useState('');
  const [applied, setApplied] = useState<{ code: string; discount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<{ orderRef: string; total: number; phone: string } | null>(null);

  useEffect(() => {
    if (open) { setName(me?.name || LS.get('name', '')); setPhone(me ? prettyPhone(me.phone) : LS.get('phone', '')); }
  }, [open, me]);

  const items = Object.entries(cart).filter(([, q]) => q > 0).map(([ticketTypeId, qty]) => ({ ticketTypeId, qty }));
  const subtotal = items.reduce((a, i) => a + i.qty * (ev.ticketTypes.find((t) => t.id === i.ticketTypeId)?.price ?? 0), 0);
  const total = subtotal - (applied?.discount ?? 0);

  async function applyPromo() {
    try {
      const q = await post<{ discount: number }>(`/events/${ev.slug}/quote`, { items, promo });
      setApplied({ code: promo.toUpperCase(), discount: q.discount });
      toast.success(`Promo applied — you save ${ksh(q.discount)}`);
    } catch (e) { setApplied(null); toast.error((e as Error).message); }
  }

  async function pay() {
    setBusy(true);
    LS.set('name', name); LS.set('phone', phone);
    try {
      const r = await post<{ ref: string; status: string; total: number }>(`/events/${ev.slug}/checkout`, { items, name, phone, promo: applied?.code });
      onOpenChange(false);
      setWaiting({ orderRef: r.ref, total: r.total, phone });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title="Checkout" description={`${ev.title} · ${fmtDate(ev.startsAt)}`}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); pay(); }}>
          <Field label="Name on tickets"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoComplete="name" required minLength={2} /></Field>
          <Field label="M-Pesa number" hint="Your tickets are linked to this number — log in with it any time to recover them.">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="07XX XXX XXX" autoComplete="tel" required />
          </Field>
          <div className="flex gap-2">
            <div className="relative flex-1"><Tag className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" /><Input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="Promo code" className="pl-10 uppercase" aria-label="Promo code" /></div>
            <Button type="button" variant="outline" size="md" className="h-12" onClick={applyPromo} disabled={!promo}>Apply</Button>
          </div>

          <div className="rounded-2xl border border-line bg-surface-2 p-4">
            {items.map((i) => { const t = ev.ticketTypes.find((x) => x.id === i.ticketTypeId)!; return (
              <div key={i.ticketTypeId} className="flex justify-between py-1 text-sm"><span className="text-muted">{i.qty} × {t.name}</span><span className="tabular-nums">{ksh(i.qty * t.price)}</span></div>
            ); })}
            {applied && <div className="flex justify-between py-1 text-sm text-brand-soft"><span>Promo {applied.code}</span><span className="tabular-nums">− {ksh(applied.discount)}</span></div>}
            <div className="mt-2 flex items-end justify-between border-t border-line pt-3"><span className="font-semibold">Total</span><span className="text-2xl font-extrabold tabular-nums">{ksh(total)}</span></div>
            <div className="mt-1 text-xs text-subtle">No booking fees. What you see is what you pay.</div>
          </div>

          <Button variant="primary" size="lg" block loading={busy}>
            <Smartphone className="size-5" />{total ? `Pay ${ksh(total)} with M-Pesa` : 'Get free tickets'}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-subtle"><Lock className="size-3.5" /> You’ll enter your PIN on your own phone — never on this site.</p>
        </form>
      </Sheet>
      {waiting && <PaymentWaiting {...waiting} onClose={() => setWaiting(null)} />}
    </>
  );
}

function PaymentWaiting({ orderRef: ref, total, phone, onClose }: { orderRef: string; total: number; phone: string; onClose: () => void }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: cfg } = useConfig();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [left, setLeft] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      const o = await api<OrderView>('/orders/' + ref).catch(() => null);
      if (!live || !o) return;
      setOrder(o);
      if (o.status === 'paid') {
        offline.save(o.tickets, o.event);
        qc.invalidateQueries({ queryKey: ['event'] });
        setTimeout(() => { onClose(); nav('/order/' + ref); }, 1400);
      }
    };
    tick();
    const t = setInterval(() => { if (order?.status === 'pending' || !order) tick(); }, 2000);
    return () => { live = false; clearInterval(t); };
  }, [ref, order?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setLeft(order?.holdExpiresAt ? Math.max(0, Math.floor((new Date(order.holdExpiresAt).getTime() - Date.now()) / 1000)) : 0), 500);
    return () => clearInterval(t);
  }, [order?.holdExpiresAt]);

  const status = order?.status ?? 'pending';
  const done = status !== 'pending' && status !== 'processing';

  return (
    <Sheet open onOpenChange={(o) => { if (!o && done) onClose(); }} dismissible={done} title={status === 'paid' ? 'Payment received' : done ? 'Payment not completed' : 'Check your phone'}>
      <AnimatePresence mode="wait">
        {!done ? (
          <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
            <div className="relative mx-auto my-4 grid size-28 place-items-center">
              <span className="absolute inset-0 animate-ping-slow rounded-full bg-brand/30" />
              <span className="absolute inset-3 rounded-full bg-brand/20" />
              <span className="relative grid size-20 place-items-center rounded-full bg-brand text-on-brand shadow-[var(--shadow-glow)]"><Smartphone className="size-9" /></span>
            </div>
            <p className="text-muted">We sent an M-Pesa request for <b className="text-fg">{ksh(total)}</b> to <b className="text-fg">{phone}</b>.</p>
            <p className="mt-1 text-muted">Enter your M-Pesa PIN on your phone to finish.</p>
            {left > 0 && <p className="mt-4 inline-flex rounded-full bg-surface-3 px-3 py-1 text-xs tabular-nums text-muted">Seats held for {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>}
            <div className="mt-6 space-y-2">
              {cfg?.simulated && (
                <a href={`/simulator?phone=${encodeURIComponent(phone)}`} target="_blank" rel="noopener"
                  className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-warn/50 bg-warn/10 text-sm font-semibold text-warn">
                  Open demo phone (simulated M-Pesa) <ExternalLink className="size-4" />
                </a>
              )}
              <Button block variant="secondary" loading={checking} onClick={async () => {
                setChecking(true);
                const o = await post<OrderView>(`/orders/${ref}/check`).catch((e) => { toast.error(e.message); return null; });
                setChecking(false); if (o) setOrder(o); if (o?.status === 'pending') toast('Still waiting for M-Pesa to confirm…');
              }}>I’ve paid — check now</Button>
              <Button block variant="ghost" onClick={async () => { await post(`/orders/${ref}/cancel`); onClose(); toast('Payment cancelled — seats released'); }}>Cancel</Button>
            </div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-subtle"><ShieldCheck className="size-3.5" /> Tickets are only issued after Safaricom confirms your payment.</p>
          </motion.div>
        ) : status === 'paid' ? (
          <motion.div key="ok" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="py-6 text-center">
            <CheckCircle2 className="mx-auto size-20 text-brand" />
            <p className="mt-4 text-lg font-semibold">You’re in! 🎉</p>
            <p className="text-sm text-muted">M-Pesa receipt {order?.receipt} · opening your tickets…</p>
          </motion.div>
        ) : (
          <motion.div key="fail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-4 text-center">
            <XCircle className={`mx-auto size-16 ${status === 'review' ? 'text-warn' : 'text-danger'}`} />
            {status === 'review' ? (
              <p className="mt-4 text-muted">We received a payment but something didn’t match ({order?.review}). The organizer has been alerted and you’ll be notified when it’s sorted. Reference <b className="text-fg">{ref}</b>.</p>
            ) : (
              <p className="mt-4 text-muted">{order?.message || 'The request was cancelled or timed out.'}<br /><span className="text-subtle">No money was taken and your seats were released.</span></p>
            )}
            <Button className="mt-6" variant="primary" block onClick={onClose}>{status === 'review' ? 'OK' : 'Try again'}</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
