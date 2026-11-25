// Order lifecycle: hold seats -> STK push -> verify callback -> issue signed tickets.
// Inventory counters (sold/held/comps) are changed only with conditional atomic updates,
// so two buyers can never get the last seat and a payment can never mint tickets twice.
import type { Types } from 'mongoose';
import { config } from './config.js';
import { Event, MpesaLog, Order, Ticket, TicketType, type EventDoc, type OrderDoc, type TicketTypeDoc } from './models.js';
import { stkPush, stkQuery, parseCallback, isSimulated } from './mpesa.js';
import { notifyPhone } from './notify.js';
import { bad, makeTicketCode, normPhone, randId, UserError } from './util.js';

export function ticketTypeView(t: TicketTypeDoc) {
  const remaining = Math.max(0, t.quantity - t.sold - t.held - t.comps);
  const now = new Date();
  let state: 'on_sale' | 'sold_out' | 'not_started' | 'ended' = remaining === 0 ? 'sold_out' : 'on_sale';
  if (t.salesStart && t.salesStart > now) state = 'not_started';
  if (t.salesEnd && t.salesEnd < now) state = 'ended';
  return {
    id: String(t._id), name: t.name, description: t.description || '', price: t.price, quantity: t.quantity, admits: t.admits,
    remaining, state, low: remaining > 0 && remaining <= Math.max(10, t.quantity * 0.1), salesEnd: t.salesEnd,
  };
}

/** Atomically reserve `qty` units if (sold + held + comps + qty) <= quantity. */
async function take(ttId: Types.ObjectId, qty: number, field: 'held' | 'sold' | 'comps') {
  const r = await TicketType.updateOne(
    { _id: ttId, $expr: { $lte: [{ $add: ['$sold', '$held', '$comps', qty] }, '$quantity'] } },
    { $inc: { [field]: qty } },
  );
  return r.modifiedCount === 1;
}
export const takeComps = (ttId: Types.ObjectId, qty: number) => take(ttId, qty, 'comps');

interface Line { tt: TicketTypeDoc; qty: number }

async function price(ev: EventDoc, items: { ticketTypeId: string; qty: number }[], promoCode?: string) {
  const types = new Map((await TicketType.find({ event: ev._id }).lean()).map((t) => [String(t._id), t as TicketTypeDoc]));
  const lines: Line[] = [];
  let subtotal = 0, units = 0;
  for (const it of items || []) {
    const qty = Math.floor(Number(it.qty));
    if (!qty || qty < 0) continue;
    const tt = types.get(String(it.ticketTypeId)) ?? bad('Unknown ticket type');
    const v = ticketTypeView(tt);
    if (v.state === 'not_started') bad(`${tt.name} sales haven't opened yet`);
    if (v.state === 'ended') bad(`${tt.name} sales have closed`);
    if (qty > v.remaining) bad(v.remaining ? `Only ${v.remaining} ${tt.name} left` : `${tt.name} is sold out`, 409);
    lines.push({ tt, qty });
    subtotal += qty * tt.price;
    units += qty;
  }
  if (!lines.length) bad('Pick at least one ticket');
  let discount = 0, code: string | undefined;
  if (promoCode?.trim()) {
    const p = ev.promos.find((x) => x.code?.toUpperCase() === promoCode.trim().toUpperCase()) ?? bad('That promo code is not valid for this event');
    if (p.maxUses && (p.used ?? 0) >= p.maxUses) bad('That promo code has been fully used');
    discount = Math.floor((subtotal * (p.percentOff ?? 0)) / 100);
    code = p.code ?? undefined;
  }
  return { lines, subtotal, discount, total: subtotal - discount, units, promoCode: code };
}

export async function quote(ev: EventDoc, items: { ticketTypeId: string; qty: number }[], promo?: string) {
  const q = await price(ev, items, promo);
  return { subtotal: q.subtotal, discount: q.discount, total: q.total, units: q.units };
}

export async function createOrder(a: {
  ev: EventDoc; items: { ticketTypeId: string; qty: number }[]; phone: string; name: string; email?: string;
  promoCode?: string; userId?: Types.ObjectId; source?: 'online' | 'door';
}) {
  const { ev } = a;
  const phone = normPhone(a.phone) ?? bad('Enter a valid Safaricom number, e.g. 0712 345 678');
  if (ev.status !== 'published') bad('This event is not on sale');
  if ((ev.endsAt || ev.startsAt) < new Date()) bad('This event has already ended');

  // One payment in flight per phone per event: no double charges, no bot hammering.
  if (await Order.exists({ event: ev._id, phone, status: 'pending', holdActive: true })) {
    bad('You already have a payment waiting on your phone. Complete or cancel it first.', 409);
  }
  const q = await price(ev, a.items, a.promoCode);
  if ((a.source ?? 'online') === 'online') {
    const [owned] = await Order.aggregate([
      { $match: { event: ev._id, phone, status: 'paid' } }, { $unwind: '$items' }, { $group: { _id: null, n: { $sum: '$items.qty' } } },
    ]);
    const have = owned?.n ?? 0;
    if (have + q.units > (ev.maxPerBuyer ?? 10)) bad(`Limit is ${ev.maxPerBuyer} tickets per person for this event (you already have ${have}).`);
  }

  // Hold seats while the buyer enters their PIN.
  const taken: Line[] = [];
  for (const l of q.lines) {
    if (!(await take(l.tt._id, l.qty, 'held'))) {
      for (const t of taken) await TicketType.updateOne({ _id: t.tt._id }, { $inc: { held: -t.qty } });
      bad(`${l.tt.name} just sold out. Try fewer tickets or another type.`, 409);
    }
    taken.push(l);
  }

  const order = await Order.create({
    ref: randId(8), event: ev._id, user: a.userId, phone, name: a.name, email: a.email, source: a.source ?? 'online',
    status: 'pending', subtotal: q.subtotal, discount: q.discount, total: q.total, promoCode: q.promoCode,
    items: q.lines.map((l) => ({ ticketType: l.tt._id, name: l.tt.name, qty: l.qty, unitPrice: l.tt.price })),
    holdActive: true, holdExpiresAt: new Date(Date.now() + config.holdSeconds * 1000),
  });

  if (order.total === 0) {
    await finalizePaid(order._id, { resultDesc: 'Free ticket' });
    return (await Order.findById(order._id))!;
  }

  let push;
  try { push = await stkPush({ phone, amount: order.total, reference: order.ref }); }
  catch (e) { push = { ok: false as const, error: (e as Error).message }; }
  if (!push.ok) {
    await failOrder(order._id, undefined, push.error);
    throw new UserError('M-Pesa could not send the prompt: ' + push.error, 502);
  }
  order.checkoutRequestId = push.checkoutRequestId;
  order.merchantRequestId = push.merchantRequestId;
  await order.save();
  return order;
}

/** Release held seats exactly once. */
async function releaseHold(orderId: Types.ObjectId) {
  const o = await Order.findOneAndUpdate({ _id: orderId, holdActive: true }, { holdActive: false });
  if (!o) return false;
  for (const it of o.items) await TicketType.updateOne({ _id: it.ticketType }, { $inc: { held: -(it.qty ?? 0) } });
  return true;
}

export async function failOrder(orderId: Types.ObjectId, code?: string, desc?: string, status: 'failed' | 'expired' = 'failed') {
  const o = await Order.findOneAndUpdate({ _id: orderId, status: 'pending' }, { status, resultCode: code, resultDesc: desc });
  if (o) await releaseHold(orderId);
}

async function toReview(orderId: Types.ObjectId, reason: string, receipt?: string | null, phone?: string | null) {
  await Order.updateOne({ _id: orderId }, { $set: { status: 'review', reviewReason: reason, paidPhone: phone, ...(receipt && { mpesaReceipt: receipt }) } });
  await releaseHold(orderId);
}

/**
 * Handle a Safaricom callback. Never trusted on its own:
 *  1. it must match a CheckoutRequestID we created,
 *  2. the amount must equal what we charged,
 *  3. the receipt must never have been used before,
 *  4. in live mode Safaricom's STK Query must independently confirm the result.
 */
export async function handleCallback(body: unknown) {
  const cb = parseCallback(body);
  await MpesaLog.create({ kind: 'callback', checkoutRequestId: cb?.checkoutRequestId, payload: body });
  if (!cb) return { ok: false, reason: 'malformed' };
  const order = await Order.findOne({ checkoutRequestId: cb.checkoutRequestId });
  if (!order) return { ok: false, reason: 'unknown checkout request' };
  if (order.status === 'paid') return { ok: true, reason: 'already paid' };

  if (cb.resultCode !== '0') {
    await failOrder(order._id, cb.resultCode, cb.resultDesc);
    return { ok: true, reason: 'payment not completed' };
  }
  const problems: string[] = [];
  if (cb.amount !== order.total) problems.push(`amount ${cb.amount} ≠ expected ${order.total}`);
  if (cb.receipt && (await Order.exists({ mpesaReceipt: cb.receipt, _id: { $ne: order._id } }))) problems.push(`receipt ${cb.receipt} already used`);
  if (!isSimulated) {
    const q = await stkQuery(cb.checkoutRequestId).catch(() => ({ state: 'pending' as const }));
    if (q.state === 'failed') problems.push('Safaricom query says the payment failed');
  }
  if (problems.length) {
    await toReview(order._id, problems.join('; '), cb.receipt, cb.phone);
    return { ok: false, reason: problems.join('; ') };
  }
  return finalizePaid(order._id, { receipt: cb.receipt, phone: cb.phone, resultDesc: cb.resultDesc });
}

/** Mark paid, convert the hold into sold seats and mint tickets. Safe to call more than once. */
export async function finalizePaid(orderId: Types.ObjectId, p: { receipt?: string | null; phone?: string | null; resultDesc?: string }) {
  const o = await Order.findOneAndUpdate({ _id: orderId, status: { $in: ['pending', 'failed', 'expired', 'review'] } }, { status: 'processing' });
  if (!o) return { ok: true, reason: 'already handled' };

  const hadHold = !!(await Order.findOneAndUpdate({ _id: orderId, holdActive: true }, { holdActive: false }));
  if (hadHold) {
    for (const it of o.items) await TicketType.updateOne({ _id: it.ticketType }, { $inc: { held: -(it.qty ?? 0), sold: it.qty ?? 0 } });
  } else {
    // Payment landed after the hold expired: only issue if seats are still free.
    const done: { ticketType?: Types.ObjectId | null; qty?: number | null }[] = [];
    for (const it of o.items) {
      if (!(await take(it.ticketType!, it.qty ?? 0, 'sold'))) {
        for (const d of done) await TicketType.updateOne({ _id: d.ticketType }, { $inc: { sold: -(d.qty ?? 0) } });
        await Order.updateOne({ _id: orderId }, { $set: { status: 'review', reviewReason: `Paid after the hold expired and ${it.name} sold out — refund needed`, paidPhone: p.phone, ...(p.receipt && { mpesaReceipt: p.receipt }) } });
        return { ok: false, reason: 'sold out after hold expired' };
      }
      done.push(it);
    }
  }

  await Order.updateOne({ _id: orderId }, {
    $set: { status: 'paid', resultCode: '0', resultDesc: p.resultDesc, paidAt: new Date(), paidPhone: p.phone || o.phone, ...(p.receipt && { mpesaReceipt: p.receipt }) },
  });
  if (o.promoCode) await Event.updateOne({ _id: o.event, 'promos.code': o.promoCode }, { $inc: { 'promos.$.used': 1 } });
  const tts = new Map((await TicketType.find({ _id: { $in: o.items.map((i) => i.ticketType) } }).lean()).map((t) => [String(t._id), t]));
  await Ticket.insertMany(o.items.flatMap((it) => Array.from({ length: it.qty ?? 0 }, () => ({
    code: makeTicketCode(), order: o._id, event: o.event, ticketType: it.ticketType, typeName: it.name,
    admits: tts.get(String(it.ticketType))?.admits ?? 1, holderName: o.name, holderPhone: o.phone,
  }))));
  const ev = await Event.findById(o.event).lean();
  notifyPhone(o.phone, { title: 'Your tickets are ready 🎟️', body: ev?.title, url: `/order/${o.ref}` }, { sms: true }).catch(() => {});
  return { ok: true, reason: 'issued' };
}

export async function checkNow(orderId: Types.ObjectId) {
  const o = await Order.findById(orderId);
  if (!o || o.status !== 'pending' || !o.checkoutRequestId) return;
  o.lastQueryAt = new Date(); await o.save();
  const q = await stkQuery(o.checkoutRequestId).catch(() => ({ state: 'pending' as const, resultCode: undefined, resultDesc: undefined }));
  if (q.state === 'paid') await finalizePaid(o._id, { resultDesc: 'Confirmed via STK query' });
  else if (q.state === 'failed') await failOrder(o._id, q.resultCode, q.resultDesc);
}

/** Background safety net: free expired holds, resolve orders whose callback never came, expire abandoned ones. */
export async function reconcile() {
  const now = Date.now();
  for (const o of await Order.find({ holdActive: true, holdExpiresAt: { $lt: new Date(now) } }, { _id: 1 }).lean()) await releaseHold(o._id);
  const stuck = await Order.find({
    status: 'pending', checkoutRequestId: { $exists: true }, createdAt: { $lt: new Date(now - 40e3) },
    $or: [{ lastQueryAt: null }, { lastQueryAt: { $lt: new Date(now - 30e3) } }],
  }, { _id: 1 }).limit(50).lean();
  for (const o of stuck) await checkNow(o._id);
  for (const o of await Order.find({ status: 'pending', createdAt: { $lt: new Date(now - (config.holdSeconds + 600) * 1000) } }, { _id: 1 }).lean()) {
    await failOrder(o._id, undefined, 'No response from M-Pesa', 'expired');
  }
}

export async function orderView(o: OrderDoc) {
  const ev = await Event.findById(o.event).lean();
  const tickets = o.status === 'paid' ? await Ticket.find({ order: o._id }).sort({ _id: 1 }).lean() : [];
  return {
    ref: o.ref, status: o.status, total: o.total, subtotal: o.subtotal, discount: o.discount, phone: o.phone,
    receipt: o.mpesaReceipt ?? null, message: o.resultDesc ?? null, review: o.reviewReason ?? null,
    holdExpiresAt: o.holdExpiresAt, createdAt: (o as unknown as { createdAt: Date }).createdAt,
    event: ev && { slug: ev.slug, title: ev.title, venueName: ev.venueName, address: ev.address, startsAt: ev.startsAt, theme: ev.theme, category: ev.category, posterUrl: ev.posterUrl, ticketStyle: ev.ticketStyle },
    items: o.items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
    tickets: tickets.map((t) => ({ code: t.code, status: t.status, holderName: t.holderName, typeName: t.typeName, admits: t.admits, checkedInAt: t.checkedInAt })),
  };
}
