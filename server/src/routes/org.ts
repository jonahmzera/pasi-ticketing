// Organizer API: account, events, analytics, guest list, review queue, payouts.
import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { config } from '../config.js';
import { Event, Order, Organization, Plan, Scan, Ticket, TicketType, User, type EventDoc } from '../models.js';
import { broadcast, notifyPhone } from '../notify.js';
import { finalizePaid, takeComps, ticketTypeView } from '../orders.js';
import { endSession, limit, needOrg, startSession } from '../http.js';
import { bad, checkPassword, hashPassword, makeTicketCode, mpesaCost, normPhone, randId, slugify } from '../util.js';

export const org = Router();

org.post('/register', async (req, res) => {
  limit(req, 'orgauth', 10, 300);
  const { name, email, password, phone, kind } = req.body;
  if (!name || !email || !password || String(password).length < 8) bad('Name, email and a password of at least 8 characters are required');
  if (await Organization.exists({ email: String(email).toLowerCase() })) bad('An account with that email already exists');
  let slug = slugify(name);
  if (await Organization.exists({ slug })) slug += '-' + randId(4).toLowerCase();
  const o = await Organization.create({ name, slug, kind: kind || 'venue', email, phone: normPhone(phone), payoutAccount: normPhone(phone), passwordHash: hashPassword(password) });
  await startSession(res, 'org', o._id);
  res.json({ ok: true });
});
org.post('/login', async (req, res) => {
  limit(req, 'orgauth', 10, 300);
  const o = await Organization.findOne({ email: String(req.body.email || '').toLowerCase() });
  if (!o || !checkPassword(req.body.password || '', o.passwordHash)) bad('Wrong email or password', 401);
  await startSession(res, 'org', o!._id);
  res.json({ ok: true });
});
org.post('/logout', async (req, res) => { await endSession(req, res, 'org'); res.json({ ok: true }); });

const orgView = (o: Awaited<ReturnType<typeof needOrg>>) => ({
  id: String(o._id), name: o.name, slug: o.slug, kind: o.kind, email: o.email, phone: o.phone, verified: o.verified,
  bio: o.bio, payoutMethod: o.payoutMethod, payoutAccount: o.payoutAccount,
});
org.get('/me', async (req, res) => { try { res.json(orgView(await needOrg(req))); } catch { res.json(null); } });
org.put('/me', async (req, res) => {
  const o = await needOrg(req);
  const b = req.body;
  await Organization.updateOne({ _id: o._id }, {
    name: b.name || o.name, bio: b.bio ?? o.bio, phone: normPhone(b.phone) || o.phone,
    payoutMethod: b.payoutMethod || o.payoutMethod, payoutAccount: b.payoutAccount || o.payoutAccount,
  });
  res.json({ ok: true });
});

async function orgEvent(req: Request) {
  const o = await needOrg(req);
  if (!Types.ObjectId.isValid(String(req.params.id))) bad('Event not found', 404);
  const ev = (await Event.findOne({ _id: req.params.id, org: o._id }).lean()) as EventDoc | null;
  return { o, ev: ev ?? bad('Event not found', 404) };
}

async function money(eventIds: Types.ObjectId[]) {
  const rows = await Order.aggregate([
    { $match: { event: { $in: eventIds }, status: 'paid' } },
    { $group: { _id: '$event', gross: { $sum: '$total' }, orders: { $sum: 1 }, totals: { $push: '$total' } } },
  ]);
  const by = new Map<string, { gross: number; orders: number; platformFee: number; mpesaCost: number; net: number }>();
  for (const r of rows) {
    const fee = Math.round((r.gross * config.platformFeePct) / 100);
    const mp = (r.totals as number[]).reduce((a, t) => a + mpesaCost(t), 0);
    by.set(String(r._id), { gross: r.gross, orders: r.orders, platformFee: fee, mpesaCost: mp, net: r.gross - fee - mp });
  }
  return (id: Types.ObjectId) => by.get(String(id)) ?? { gross: 0, orders: 0, platformFee: 0, mpesaCost: 0, net: 0 };
}

org.get('/overview', async (req, res) => {
  const o = await needOrg(req);
  const evs = await Event.find({ org: o._id }).sort({ startsAt: -1 }).lean();
  const ids = evs.map((e) => e._id);
  const m = await money(ids);
  const types = await TicketType.find({ event: { $in: ids } }).lean();
  const checked = new Map((await Ticket.aggregate([{ $match: { event: { $in: ids }, status: 'used' } }, { $group: { _id: '$event', n: { $sum: 1 } } }])).map((r) => [String(r._id), r.n]));
  const events = evs.map((e) => {
    const tt = types.filter((t) => String(t.event) === String(e._id));
    return {
      id: String(e._id), title: e.title, slug: e.slug, status: e.status, startsAt: e.startsAt, venueName: e.venueName, theme: e.theme, category: e.category, posterUrl: e.posterUrl,
      capacity: tt.reduce((a, t) => a + t.quantity, 0), sold: tt.reduce((a, t) => a + t.sold, 0), checkedIn: checked.get(String(e._id)) ?? 0, views: e.views, ...m(e._id),
    };
  });
  const sum = (k: 'gross' | 'net' | 'platformFee' | 'mpesaCost' | 'sold' | 'orders') => events.reduce((a, e) => a + e[k], 0);
  const fanRows = await Order.aggregate([{ $match: { event: { $in: ids }, status: 'paid' } }, { $group: { _id: '$phone', events: { $addToSet: '$event' } } }]);
  const review = await Order.find({ event: { $in: ids }, status: 'review' }).populate('event', 'title').lean();
  const recentRaw = await Order.find({ event: { $in: ids }, status: { $in: ['paid', 'review'] } }).sort({ paidAt: -1, updatedAt: -1 }).limit(8).populate('event', 'title').lean();
  const recent = recentRaw.map((r) => ({ id: String(r._id), name: r.name, total: r.total, status: r.status, source: r.source, qty: r.items.reduce((n, i) => n + (i.qty ?? 0), 0),
    at: r.paidAt ?? (r as unknown as { updatedAt: Date }).updatedAt, title: (r.event as unknown as { title: string })?.title }));
  // Last 30 days of revenue across all events
  const since = new Date(Date.now() - 30 * 864e5);
  const daily = await Order.aggregate([
    { $match: { event: { $in: ids }, status: 'paid', paidAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: 'Africa/Nairobi' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  res.json({
    events, feePct: config.platformFeePct,
    totals: { gross: sum('gross'), net: sum('net'), platformFee: sum('platformFee'), mpesaCost: sum('mpesaCost'), tickets: sum('sold'), orders: sum('orders') },
    fans: fanRows.length, repeatFans: fanRows.filter((r) => r.events.length > 1).length,
    followers: await User.countDocuments({ follows: o._id }),
    daily: daily.map((d) => ({ date: d._id, revenue: d.revenue, orders: d.orders })),
    recent,
    review: review.map((r) => ({ id: String(r._id), ref: r.ref, phone: r.phone, total: r.total, receipt: r.mpesaReceipt, reason: r.reviewReason, title: (r.event as unknown as { title: string })?.title })),
  });
});

// ---------- events CRUD ----------
interface TTInput { id?: string; name: string; description?: string; price: number; quantity: number; admits?: number; salesStart?: string; salesEnd?: string }
async function saveEvent(orgId: Types.ObjectId, b: Record<string, unknown>, existing?: EventDoc) {
  if (!b.title || !b.startsAt || !b.venueName) bad('Title, venue and start time are required');
  const types = ((b.ticketTypes as TTInput[]) || []).filter((t) => t.name?.trim());
  if (!types.length) bad('Add at least one ticket type');
  const fields = {
    title: String(b.title), description: String(b.description || ''), category: String(b.category || 'Party'),
    venueName: String(b.venueName), address: String(b.address || ''),
    lat: b.lat === '' || b.lat == null ? undefined : Number(b.lat), lng: b.lng === '' || b.lng == null ? undefined : Number(b.lng),
    startsAt: new Date(String(b.startsAt)), endsAt: b.endsAt ? new Date(String(b.endsAt)) : undefined,
    posterUrl: String(b.posterUrl || '') || undefined, theme: String(b.theme || 'sunset'),
    ticketStyle: (['stub', 'admit', 'boarding', 'holo'] as const).find((s) => s === b.ticketStyle) ?? 'stub',
    maxPerBuyer: Math.max(1, Number(b.maxPerBuyer) || 10),
    gatePin: String(b.gatePin || '').trim() || existing?.gatePin || String(Math.floor(1000 + Math.random() * 9000)),
    ageLimit: b.ageLimit ? Number(b.ageLimit) : undefined, dressCode: String(b.dressCode || '') || undefined,
    lineup: Array.isArray(b.lineup) ? (b.lineup as string[]).map(String).filter(Boolean) : String(b.lineup || '').split(',').map((s) => s.trim()).filter(Boolean),
    promos: ((b.promos as { code: string; percentOff: number; maxUses?: number }[]) || []).filter((p) => p.code?.trim()).map((p) => {
      const old = existing?.promos.find((x) => x.code === p.code.toUpperCase().trim());
      return { code: p.code.toUpperCase().trim(), percentOff: Math.min(100, Math.max(1, Number(p.percentOff) || 10)), maxUses: p.maxUses ? Number(p.maxUses) : undefined, used: old?.used ?? 0 };
    }),
  };
  if (isNaN(+fields.startsAt)) bad('Invalid start time');
  let id: Types.ObjectId;
  if (existing) { await Event.updateOne({ _id: existing._id }, fields); id = existing._id; }
  else {
    let slug = slugify(fields.title);
    if (await Event.exists({ slug })) slug += '-' + randId(4).toLowerCase();
    id = (await Event.create({ ...fields, org: orgId, slug, status: 'draft' }))._id;
  }
  const keep: string[] = [];
  for (const [i, t] of types.entries()) {
    const v = {
      name: t.name.trim(), description: t.description || '', price: Math.max(0, Math.round(Number(t.price) || 0)),
      admits: Math.max(1, Number(t.admits) || 1), sort: i,
      salesStart: t.salesStart ? new Date(t.salesStart) : undefined, salesEnd: t.salesEnd ? new Date(t.salesEnd) : undefined,
    };
    const qty = Math.max(0, Math.round(Number(t.quantity) || 0));
    const cur = t.id && Types.ObjectId.isValid(t.id) ? await TicketType.findOne({ _id: t.id, event: id }) : null;
    if (cur) {
      if (qty < cur.sold + cur.held + cur.comps) bad(`${cur.name}: quantity can't go below the ${cur.sold + cur.held + cur.comps} already sold or held`);
      Object.assign(cur, v, { quantity: qty }); await cur.save(); keep.push(String(cur._id));
    } else keep.push(String((await TicketType.create({ ...v, quantity: qty, event: id }))._id));
  }
  for (const old of await TicketType.find({ event: id, _id: { $nin: keep } })) {
    if (old.sold + old.held + old.comps > 0) bad(`${old.name} already has sales and can't be removed — set its quantity instead`);
    await old.deleteOne();
  }
  return String(id);
}
org.post('/events', async (req, res) => { const o = await needOrg(req); res.json({ id: await saveEvent(o._id, req.body) }); });
org.put('/events/:id', async (req, res) => { const { o, ev } = await orgEvent(req); res.json({ id: await saveEvent(o._id, req.body, ev) }); });
org.get('/events/:id', async (req, res) => {
  const { ev } = await orgEvent(req);
  const tts = await TicketType.find({ event: ev._id }).sort({ sort: 1 }).lean();
  res.json({ ...ev, id: String(ev._id), ticketTypes: tts.map((t) => ({ ...ticketTypeView(t as never), sold: t.sold, comps: t.comps, salesStart: t.salesStart })) });
});
org.post('/events/:id/status', async (req, res) => {
  const { o, ev } = await orgEvent(req);
  const status = req.body.status;
  if (!['draft', 'published', 'cancelled'].includes(status)) bad('Bad status');
  await Event.updateOne({ _id: ev._id }, { status });
  if (status === 'published' && ev.status !== 'published') {
    const followers = await User.find({ follows: o._id }, { _id: 1 }).lean();
    await broadcast({ title: `New from ${o.name}: ${ev.title}`, body: new Date(ev.startsAt).toDateString(), url: `/e/${ev.slug}` }, followers.map((f) => f._id));
  }
  if (status === 'cancelled') {
    for (const p of await Ticket.distinct('holderPhone', { event: ev._id, status: 'valid' })) {
      notifyPhone(p!, { title: `${ev.title} has been cancelled`, body: 'The organizer will contact you about refunds.', url: `/e/${ev.slug}` }, { sms: true }).catch(() => {});
    }
  }
  res.json({ ok: true });
});

// ---------- analytics ----------
org.get('/events/:id/analytics', async (req, res) => {
  const { ev } = await orgEvent(req);
  const m = (await money([ev._id]))(ev._id);
  const tts = await TicketType.find({ event: ev._id }).sort({ sort: 1 }).lean();
  const typeAgg = new Map((await Order.aggregate([
    { $match: { event: ev._id, status: 'paid' } }, { $unwind: '$items' },
    { $group: { _id: '$items.ticketType', revenue: { $sum: { $multiply: ['$items.qty', '$items.unitPrice'] } } } },
  ])).map((r) => [String(r._id), r.revenue]));
  const checkedBy = new Map((await Ticket.aggregate([{ $match: { event: ev._id, status: 'used' } }, { $group: { _id: '$ticketType', n: { $sum: 1 } } }])).map((r) => [String(r._id), r.n]));
  const types = tts.map((t) => ({
    id: String(t._id), name: t.name, price: t.price, quantity: t.quantity, sold: t.sold, comps: t.comps, held: t.held,
    remaining: Math.max(0, t.quantity - t.sold - t.held - t.comps), revenue: typeAgg.get(String(t._id)) ?? 0, checkedIn: checkedBy.get(String(t._id)) ?? 0,
  }));
  const tz = 'Africa/Nairobi';
  const byDay = await Order.aggregate([
    { $match: { event: ev._id, status: 'paid' } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: tz } }, revenue: { $sum: '$total' }, orders: { $sum: 1 }, tickets: { $sum: { $sum: '$items.qty' } } } },
    { $sort: { _id: 1 } },
  ]);
  const byHourRaw = await Order.aggregate([
    { $match: { event: ev._id, status: 'paid' } }, { $group: { _id: { $hour: { date: '$paidAt', timezone: tz } }, n: { $sum: 1 } } },
  ]);
  const byHour = Array.from({ length: 24 }, (_, h) => byHourRaw.find((r) => r._id === h)?.n ?? 0);
  const arrivals = await Ticket.aggregate([
    { $match: { event: ev._id, status: 'used', checkedInAt: { $ne: null } } },
    { $group: { _id: { $dateTrunc: { date: '$checkedInAt', unit: 'minute', binSize: 10 } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } },
  ]);
  const started = await Order.countDocuments({ event: ev._id });
  const failedAgg = await Order.aggregate([{ $match: { event: ev._id, status: { $in: ['failed', 'expired'] } } }, { $group: { _id: { $ifNull: ['$resultDesc', 'Unknown'] }, n: { $sum: 1 }, v: { $sum: '$total' } } }, { $sort: { n: -1 } }]);
  const checkedIn = await Ticket.countDocuments({ event: ev._id, status: 'used' });
  const issued = await Ticket.countDocuments({ event: ev._id, status: { $ne: 'void' } });
  const buyers: string[] = await Order.distinct('phone', { event: ev._id, status: 'paid' });
  const otherEvents = (await Event.find({ org: ev.org, _id: { $ne: ev._id } }, { _id: 1 }).lean()).map((e) => e._id);
  const returning = (await Order.distinct('phone', { event: { $in: otherEvents }, status: 'paid', phone: { $in: buyers } })).length;
  const door = await Order.aggregate([{ $match: { event: ev._id, status: 'paid', source: 'door' } }, { $group: { _id: null, n: { $sum: 1 }, v: { $sum: '$total' } } }]);
  const scans = await Scan.aggregate([{ $match: { event: ev._id } }, { $group: { _id: '$result', n: { $sum: 1 } } }]);
  const review = await Order.find({ event: ev._id, status: 'review' }).lean();
  res.json({
    event: { id: String(ev._id), title: ev.title, slug: ev.slug, status: ev.status, startsAt: ev.startsAt, endsAt: ev.endsAt, gatePin: ev.gatePin, theme: ev.theme, venueName: ev.venueName },
    money: m, feePct: config.platformFeePct, types,
    byDay: byDay.map((d) => ({ date: d._id, revenue: d.revenue, orders: d.orders, tickets: d.tickets })), byHour,
    arrivals: arrivals.map((a) => ({ at: a._id, n: a.n })),
    funnel: { views: ev.views, started, paid: m.orders, failed: failedAgg.reduce((a, r) => a + r.n, 0), failedValue: failedAgg.reduce((a, r) => a + r.v, 0) },
    failReasons: failedAgg.slice(0, 5).map((r) => ({ reason: r._id, n: r.n })),
    promos: ev.promos.map((p) => ({ code: p.code, percentOff: p.percentOff, used: p.used, maxUses: p.maxUses })),
    checkedIn, issued, buyers: buyers.length, returning, squads: await Plan.countDocuments({ event: ev._id }),
    door: { n: door[0]?.n ?? 0, v: door[0]?.v ?? 0 },
    scans: Object.fromEntries(scans.map((s) => [s._id, s.n])),
    review: review.map((r) => ({ id: String(r._id), ref: r.ref, phone: r.phone, total: r.total, receipt: r.mpesaReceipt, reason: r.reviewReason })),
  });
});

// Message every ticket holder (push + SMS): gates opening early, parking, line-up changes…
org.post('/events/:id/announce', async (req, res) => {
  const { o, ev } = await orgEvent(req);
  limit(req, 'announce', 5, 3600);
  const text = String(req.body.message || '').trim().slice(0, 300) || bad('Write a message');
  const phones = (await Ticket.distinct('holderPhone', { event: ev._id, status: { $ne: 'void' } })).filter(Boolean) as string[];
  for (const p of phones) notifyPhone(p, { title: `${ev.title} · ${o.name}`, body: text, url: `/e/${ev.slug}` }, { sms: !!req.body.sms }).catch(() => {});
  res.json({ sent: phones.length });
});

org.get('/events/:id/attendees', async (req, res) => {
  const { ev } = await orgEvent(req);
  const tickets = await Ticket.find({ event: ev._id, status: { $ne: 'void' } }).sort({ _id: -1 }).populate('order', 'ref mpesaReceipt paidAt source').lean();
  const rows = tickets.map((t) => {
    const o = t.order as unknown as { ref?: string; mpesaReceipt?: string; paidAt?: Date; source?: string } | null;
    return { code: t.code, holderName: t.holderName, holderPhone: t.holderPhone, typeName: t.typeName, status: t.status, isComp: t.isComp,
      checkedInAt: t.checkedInAt, checkedInGate: t.checkedInGate, ref: o?.ref, receipt: o?.mpesaReceipt, paidAt: o?.paidAt, source: o?.source ?? (t.isComp ? 'comp' : '') };
  });
  if (req.query.format === 'csv') {
    const head = ['code', 'holderName', 'holderPhone', 'typeName', 'status', 'isComp', 'checkedInAt', 'checkedInGate', 'ref', 'receipt', 'paidAt', 'source'] as const;
    const esc = (v: unknown) => `"${String(v instanceof Date ? v.toISOString() : v ?? '').replace(/"/g, '""')}"`;
    return res.type('text/csv').attachment(`${ev.slug}-attendees.csv`).send([head.join(','), ...rows.map((r) => head.map((h) => esc(r[h])).join(','))].join('\n'));
  }
  res.json(rows);
});

org.post('/events/:id/comps', async (req, res) => {
  const { ev } = await orgEvent(req);
  const phone = normPhone(req.body.phone) ?? bad('Enter a valid phone number');
  const qty = Math.min(20, Math.max(1, Number(req.body.qty) || 1));
  const tt = (await TicketType.findOne({ _id: req.body.ticketTypeId, event: ev._id }).lean()) ?? bad('Pick a ticket type');
  if (!(await takeComps(tt._id, qty))) bad(`Not enough ${tt.name} left for ${qty} guest tickets`);
  const docs = await Ticket.insertMany(Array.from({ length: qty }, () => ({
    code: makeTicketCode(), event: ev._id, ticketType: tt._id, typeName: tt.name, admits: tt.admits, holderName: req.body.name || 'Guest', holderPhone: phone, isComp: true,
  })));
  await notifyPhone(phone, { title: "You're on the guest list 🎉", body: ev.title, url: `/t/${docs[0].code}` }, { sms: true });
  res.json({ links: docs.map((d) => `/t/${d.code}`) });
});

org.post('/orders/:id/resolve', async (req, res) => {
  const o = await needOrg(req);
  const order = await Order.findOne({ _id: req.params.id, status: 'review' });
  if (!order || !(await Event.exists({ _id: order.event, org: o._id }))) bad('Order not found', 404);
  if (req.body.action === 'issue') {
    const r = await finalizePaid(order!._id, { receipt: order!.mpesaReceipt, phone: order!.paidPhone, resultDesc: 'Issued manually after review' });
    if (!r.ok) bad('Could not issue: ' + r.reason);
  } else await Order.updateOne({ _id: order!._id }, { status: 'refunded', resultDesc: 'Refunded by organizer' });
  res.json({ ok: true });
});
