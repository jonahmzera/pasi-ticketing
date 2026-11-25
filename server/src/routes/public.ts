import { Router } from 'express';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { Event, Order, Organization, Ticket, TicketType, User, type EventDoc } from '../models.js';
import { callbackToken, isSimulated, simulatedCallbackBody, simulatedPrompts } from '../mpesa.js';
import { checkNow, createOrder, failOrder, handleCallback, orderView, quote, ticketTypeView } from '../orders.js';
import { vapidPublicKey } from '../notify.js';
import { eventCard, limit, optUser } from '../http.js';
import { bad, maskPhone, normPhone, verifyTicketCode } from '../util.js';

export const pub = Router();

pub.get('/config', (_req, res) => {
  res.json({ mpesaMode: config.mpesa.mode, simulated: isSimulated, vapidPublicKey, feePct: config.platformFeePct });
});

// ---------- discovery ----------
pub.get('/events', async (req, res) => {
  const { q, category, when, org } = req.query as Record<string, string | undefined>;
  const now = new Date();
  const filter: Record<string, unknown> = { status: 'published', $or: [{ endsAt: { $gte: now } }, { endsAt: null, startsAt: { $gte: now } }] };
  if (category) filter.category = category;
  if (org) { const o = await Organization.findOne({ slug: org }).lean(); filter.org = o?._id ?? null; }
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const orgs = await Organization.find({ name: rx }, { _id: 1 }).lean();
    filter.$and = [{ $or: [{ title: rx }, { venueName: rx }, { description: rx }, { address: rx }, { org: { $in: orgs.map((o) => o._id) } }] }];
  }
  if (when === 'today' || when === 'weekend' || when === 'week') {
    const eat = new Date(now.getTime() + 3 * 3600e3); // Nairobi wall clock
    const endOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59) - 3 * 3600e3);
    let end = endOfDay(eat);
    let start = now;
    if (when === 'week') end = new Date(end.getTime() + 7 * 864e5);
    if (when === 'weekend') {
      const dow = eat.getUTCDay();
      const toFri = (5 - dow + 7) % 7;
      if (dow !== 6 && dow !== 0) start = new Date(endOfDay(new Date(eat.getTime() + (toFri - 1) * 864e5)).getTime() + 1000);
      end = endOfDay(new Date(eat.getTime() + ((7 - dow) % 7) * 864e5));
    }
    filter.startsAt = { $lte: end };
    if (start !== now) filter.$and = [...((filter.$and as object[]) || []), { $or: [{ endsAt: { $gte: start } }, { startsAt: { $gte: start } }] }];
  }
  const evs = await Event.find(filter).sort({ startsAt: 1 }).limit(100).lean();
  res.json(await Promise.all(evs.map((e) => eventCard(e as EventDoc))));
});

pub.get('/categories', async (_req, res) => {
  const r = await Event.aggregate([{ $match: { status: 'published', startsAt: { $gte: new Date(Date.now() - 864e5) } } }, { $group: { _id: '$category', n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  res.json(r.map((x) => ({ category: x._id, count: x.n })));
});

async function findEvent(slug: string) {
  return ((await Event.findOne({ slug }).lean()) as EventDoc | null) ?? bad('Event not found', 404);
}

pub.get('/events/:slug', async (req, res) => {
  const e = await findEvent(req.params.slug);
  if (e.status === 'draft') bad('Event not found', 404);
  await Event.updateOne({ _id: e._id }, { $inc: { views: 1 } });
  const org = (await Organization.findById(e.org).lean())!;
  const me = await optUser(req);
  const types = (await TicketType.find({ event: e._id }).sort({ sort: 1, price: 1 }).lean()).map((t) => ticketTypeView(t as never));
  const going = await Ticket.countDocuments({ event: e._id, status: { $ne: 'void' } });
  const friendsGoing = me?.friends?.length
    ? await Ticket.distinct('holderPhone', { event: e._id, status: { $ne: 'void' }, holderPhone: { $in: me.friends.map((f) => f.phone as string) } })
    : [];
  res.json({
    ...(await eventCard(e, org)), description: e.description, maxPerBuyer: e.maxPerBuyer, ageLimit: e.ageLimit, dressCode: e.dressCode,
    lineup: e.lineup, ticketTypes: types, going,
    friendsGoing: friendsGoing.map((p) => me!.friends.find((f) => f.phone === p)?.name || maskPhone(p)),
    org: { id: String(org._id), slug: org.slug, name: org.name, verified: org.verified, kind: org.kind, following: !!me?.follows?.some((f) => String(f) === String(org._id)) },
  });
});

pub.get('/orgs/:slug', async (req, res) => {
  const o = (await Organization.findOne({ slug: req.params.slug }).lean()) ?? bad('Organizer not found', 404);
  const me = await optUser(req);
  const followers = await User.countDocuments({ follows: o._id });
  const events = await Event.find({ org: o._id, status: 'published', startsAt: { $gte: new Date(Date.now() - 864e5) } }).sort({ startsAt: 1 }).lean();
  res.json({
    id: String(o._id), slug: o.slug, name: o.name, kind: o.kind, verified: o.verified, bio: o.bio, followers,
    following: !!me?.follows?.some((f) => String(f) === String(o._id)),
    events: await Promise.all(events.map((e) => eventCard(e as EventDoc, o))),
  });
});

// Hotels, food and parking near the venue from OpenStreetMap, fetched server-side and cached for a day.
const nearbyCache = new Map<string, { at?: number; data?: unknown; pending?: Promise<unknown> }>();
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
pub.get('/events/:slug/nearby', async (req, res) => {
  const e = await findEvent(req.params.slug);
  if (e.lat == null || e.lng == null) bad('No location for this event', 404);
  const key = String(e._id);
  const hit = nearbyCache.get(key);
  if (hit?.data && Date.now() - (hit.at ?? 0) < 864e5) return res.json(hit.data);
  if (hit?.pending) return res.json(await hit.pending);
  const { lat, lng } = e;
  const q = `[out:json][timeout:25];(
    node(around:2500,${lat},${lng})[tourism~"^(hotel|guest_house|hostel|apartment|motel)$"];
    way(around:2500,${lat},${lng})[tourism~"^(hotel|guest_house|hostel|apartment|motel)$"];
    node(around:1200,${lat},${lng})[amenity~"^(restaurant|fast_food|cafe|bar|pub)$"];
    node(around:800,${lat},${lng})[amenity=parking];
    way(around:800,${lat},${lng})[amenity=parking];);out center 150;`;
  const pending = Promise.any(OVERPASS.map((u) => fetch(u, {
    method: 'POST', body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'pasi-ticketing/1.0' },
  }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))))
    .then((d: { elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] }) =>
      (d.elements || []).map((el) => ({ lat: el.lat ?? el.center?.lat, lng: el.lon ?? el.center?.lon, tags: el.tags || {} })))
    .catch(() => null);
  nearbyCache.set(key, { pending });
  const data = await pending;
  if (data) nearbyCache.set(key, { at: Date.now(), data }); else nearbyCache.delete(key);
  if (!data) bad('Nearby places are unavailable right now', 503);
  res.json(data);
});

pub.get('/events/:slug/ics', async (req, res) => {
  const e = await findEvent(req.params.slug);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = e.endsAt || new Date(e.startsAt.getTime() + 4 * 3600e3);
  res.type('text/calendar').attachment(`${e.slug}.ics`).send([
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pasi//EN', 'BEGIN:VEVENT', `UID:${e.slug}@pasi`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(e.startsAt)}`, `DTEND:${f(end)}`, `SUMMARY:${e.title}`, `LOCATION:${e.venueName}, ${e.address || ''}`,
    'BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', `DESCRIPTION:${e.title} starts in 3 hours`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
});

// ---------- checkout ----------
pub.post('/events/:slug/quote', async (req, res) => {
  res.json(await quote(await findEvent(req.params.slug), req.body.items || [], req.body.promo));
});

pub.post('/events/:slug/checkout', async (req, res) => {
  limit(req, 'checkout', 8, 60);
  const ev = await findEvent(req.params.slug);
  const me = await optUser(req);
  const { items, phone, name, email, promo } = req.body;
  if (!name || String(name).trim().length < 2) bad('Enter the name to put on the tickets');
  const o = await createOrder({ ev, items, phone, name: String(name).trim(), email, promoCode: promo, userId: me?._id });
  res.json({ ref: o.ref, status: o.status, total: o.total });
});

const orderByRef = async (ref: string) => (await Order.findOne({ ref })) ?? bad('Order not found', 404);
pub.get('/orders/:ref', async (req, res) => res.json(await orderView(await orderByRef(req.params.ref))));
pub.post('/orders/:ref/cancel', async (req, res) => {
  const o = await orderByRef(req.params.ref);
  await failOrder(o._id, '1032', 'Cancelled on website');
  res.json({ ok: true });
});
pub.post('/orders/:ref/check', async (req, res) => {
  limit(req, 'check', 10, 60);
  const o = await orderByRef(req.params.ref);
  await checkNow(o._id);
  res.json(await orderView((await Order.findById(o._id))!));
});

// ---------- tickets ----------
pub.get('/tickets/:code/qr.svg', async (req, res) => {
  if (!verifyTicketCode(req.params.code)) bad('Invalid ticket', 404);
  const svg = await QRCode.toString(`PASI:${req.params.code}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', width: 320, color: { dark: '#0b0b12', light: '#ffffff' } });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=31536000, immutable').send(svg);
});

pub.get('/tickets/:code', async (req, res) => {
  const t = (await Ticket.findOne({ code: req.params.code }).lean()) ?? bad('Ticket not found', 404);
  const e = (await Event.findById(t.event).lean())!;
  const o = t.order ? await Order.findById(t.order, { ref: 1 }).lean() : null;
  res.json({
    code: t.code, status: t.status, holderName: t.holderName, holderPhone: maskPhone(t.holderPhone), typeName: t.typeName, admits: t.admits,
    isComp: t.isComp, checkedInAt: t.checkedInAt, replacedBy: t.replacedBy, orderRef: o?.ref,
    event: { slug: e.slug, title: e.title, venueName: e.venueName, address: e.address, startsAt: e.startsAt, endsAt: e.endsAt, theme: e.theme, category: e.category, posterUrl: e.posterUrl, lat: e.lat, lng: e.lng },
  });
});

// ---------- M-Pesa ----------
pub.post('/mpesa/callback/:token', async (req, res) => {
  // ACK Safaricom quickly; our own verification decides whether tickets are issued.
  if (req.params.token !== callbackToken) return res.status(404).end();
  const r = await handleCallback(req.body);
  console.log('[M-Pesa callback]', req.body?.Body?.stkCallback?.CheckoutRequestID, r.reason);
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// Fake phone for simulate mode
pub.get('/simulator/prompts', (req, res) => {
  if (!isSimulated) bad('Simulator is off', 404);
  const phone = normPhone(req.query.phone);
  res.json([...simulatedPrompts.values()]
    .filter((p) => !p.outcome && (!phone || p.phone === phone) && Date.now() - p.at < 180e3)
    .map((p) => ({ id: p.checkoutRequestId, phone: p.phone, amount: p.amount, reference: p.reference })));
});
pub.post('/simulator/:id/respond', async (req, res) => {
  if (!isSimulated) bad('Simulator is off', 404);
  const p = simulatedPrompts.get(req.params.id);
  if (!p || p.outcome) bad('This prompt has expired', 404);
  const outcome = req.body.outcome === 'paid' ? 'paid' : 'cancelled';
  if (outcome === 'paid' && !/^\d{4}$/.test(req.body.pin || '')) bad('Enter a 4-digit PIN');
  p!.outcome = outcome === 'paid' ? 'paid' : 'failed';
  if (!req.body.dropCallback) {
    // Delivered the way Safaricom does it: an HTTP POST to our callback URL.
    setTimeout(() => {
      fetch(`http://127.0.0.1:${config.port}/api/mpesa/callback/${callbackToken}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(simulatedCallbackBody(p!, outcome)),
      }).catch((e) => console.error('sim callback failed', e.message));
    }, 700);
  }
  res.json({ ok: true });
});
