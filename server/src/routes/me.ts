// Attendee account: phone + one-time code login, tickets, friends, squads, notifications.
import { Router } from 'express';
import { Types } from 'mongoose';
import { config } from '../config.js';
import { Event, Notification, Order, Otp, Plan, PushSub, Ticket, User, type EventDoc } from '../models.js';
import { notifyPhone, sendSms } from '../notify.js';
import { endSession, eventCard, limit, needUser, optUser, startSession } from '../http.js';
import { bad, makeTicketCode, maskPhone, normPhone } from '../util.js';

export const me = Router();

me.post('/auth/otp', async (req, res) => {
  limit(req, 'otp', 5, 300);
  const phone = normPhone(req.body.phone) ?? bad('Enter a valid Kenyan phone number');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await Otp.findOneAndUpdate({ phone }, { code, attempts: 0, expiresAt: new Date(Date.now() + 600e3) }, { upsert: true });
  await sendSms(phone, `Your Pasi code is ${code}. It expires in 10 minutes.`);
  // Without a real SMS provider the code is shown on screen so the app stays testable.
  res.json({ ok: true, devCode: config.sms.provider === 'console' ? code : undefined });
});

me.post('/auth/verify', async (req, res) => {
  const phone = normPhone(req.body.phone) ?? bad('Enter a valid phone number');
  const o = await Otp.findOne({ phone });
  if (!o || !o.expiresAt || o.expiresAt < new Date()) bad('Code expired. Request a new one.');
  if (o!.attempts >= 5) bad('Too many wrong attempts. Request a new code.');
  if (o!.code !== String(req.body.code).trim()) { o!.attempts++; await o!.save(); bad('Wrong code'); }
  await Otp.deleteOne({ phone });
  const name = String(req.body.name || '').trim().slice(0, 60) || undefined;
  let u = await User.findOne({ phone });
  if (!u) u = await User.create({ phone, name });
  else if (name && !u.name) { u.name = name; await u.save(); }
  await startSession(res, 'user', u._id);
  await Order.updateMany({ phone, user: null }, { user: u._id }); // claim guest orders
  res.json({ id: String(u._id), phone: u.phone, name: u.name ?? null });
});

me.post('/auth/logout', async (req, res) => { await endSession(req, res, 'user'); res.json({ ok: true }); });

me.get('/me', async (req, res) => {
  const u = await optUser(req);
  if (!u) return res.json(null);
  res.json({ id: String(u._id), phone: u.phone, name: u.name ?? null, unread: await Notification.countDocuments({ user: u._id, read: false }) });
});
me.put('/me', async (req, res) => {
  const u = await needUser(req);
  u.name = String(req.body.name || '').trim().slice(0, 60);
  await u.save();
  res.json({ ok: true });
});

me.get('/me/tickets', async (req, res) => {
  const u = await needUser(req);
  const tickets = await Ticket.find({ holderPhone: u.phone, status: { $ne: 'void' } }).lean();
  const events = new Map((await Event.find({ _id: { $in: tickets.map((t) => t.event) } }).lean()).map((e) => [String(e._id), e]));
  const pending = await Order.find({ phone: u.phone, status: { $in: ['pending', 'review'] } }).sort({ _id: -1 }).populate('event', 'title').lean();
  res.json({
    tickets: tickets.map((t) => {
      const e = events.get(String(t.event))!;
      return { code: t.code, status: t.status, holderName: t.holderName, typeName: t.typeName, admits: t.admits, checkedInAt: t.checkedInAt,
        event: { slug: e.slug, title: e.title, startsAt: e.startsAt, venueName: e.venueName, theme: e.theme, category: e.category, posterUrl: e.posterUrl } };
    }).sort((a, b) => +new Date(a.event.startsAt) - +new Date(b.event.startsAt)),
    pending: pending.map((o) => ({ ref: o.ref, status: o.status, total: o.total, title: (o.event as unknown as { title: string })?.title, review: o.reviewReason })),
  });
});

me.get('/me/notifications', async (req, res) => {
  const u = await needUser(req);
  const list = await Notification.find({ user: u._id }).sort({ _id: -1 }).limit(50).lean();
  await Notification.updateMany({ user: u._id, read: false }, { read: true });
  res.json(list.map((n) => ({ id: String(n._id), title: n.title, body: n.body, url: n.url, read: n.read, at: (n as unknown as { createdAt: Date }).createdAt })));
});

me.post('/orgs/:id/follow', async (req, res) => {
  const u = await needUser(req);
  const id = new Types.ObjectId(String(req.params.id));
  const following = u.follows.some((f) => f.equals(id));
  await User.updateOne({ _id: u._id }, following ? { $pull: { follows: id } } : { $addToSet: { follows: id } });
  res.json({ following: !following });
});

me.post('/push/subscribe', async (req, res) => {
  const sub = req.body.subscription;
  if (!sub?.endpoint) bad('Bad subscription');
  const u = await optUser(req);
  await PushSub.findOneAndUpdate({ endpoint: sub.endpoint }, { endpoint: sub.endpoint, user: u?._id, sub }, { upsert: true });
  res.json({ ok: true });
});

// Official transfer: the old QR dies and the new holder gets a fresh one. Kills screenshot resale.
me.post('/tickets/:code/transfer', async (req, res) => {
  const u = await needUser(req);
  const to = normPhone(req.body.phone) ?? bad('Enter a valid phone number');
  if (to === u.phone) bad("That's your own number");
  const code = makeTicketCode();
  const old = await Ticket.findOneAndUpdate({ code: req.params.code, holderPhone: u.phone, status: 'valid' }, { status: 'void', replacedBy: code });
  if (!old) bad('This ticket cannot be transferred (not yours, already used or already transferred)', 403);
  await Ticket.create({
    code, order: old!.order, event: old!.event, ticketType: old!.ticketType, typeName: old!.typeName, admits: old!.admits,
    holderName: String(req.body.name || '').trim() || null, holderPhone: to, isComp: old!.isComp,
  });
  const ev = await Event.findById(old!.event).lean();
  await notifyPhone(to, { title: `${u.name || 'A friend'} sent you a ticket 🎟️`, body: ev?.title, url: `/t/${code}` }, { sms: true });
  res.json({ ok: true, code });
});

// ---------- friends ----------
me.get('/me/friends', async (req, res) => {
  const u = await needUser(req);
  const onApp = new Set((await User.find({ phone: { $in: u.friends.map((f) => f.phone as string) } }, { phone: 1 }).lean()).map((x) => x.phone));
  res.json(u.friends.map((f) => ({ phone: f.phone, name: f.name, onApp: onApp.has(f.phone!) })));
});
me.post('/me/friends', async (req, res) => {
  const u = await needUser(req);
  const phone = normPhone(req.body.phone) ?? bad('Enter a valid phone number');
  if (phone === u.phone) bad("That's your own number");
  await User.updateOne({ _id: u._id }, { $pull: { friends: { phone } } });
  await User.updateOne({ _id: u._id }, { $push: { friends: { phone, name: String(req.body.name || '').trim() || null } } });
  res.json({ ok: true });
});
me.delete('/me/friends/:phone', async (req, res) => {
  const u = await needUser(req);
  await User.updateOne({ _id: u._id }, { $pull: { friends: { phone: req.params.phone } } });
  res.json({ ok: true });
});

// ---------- squads (group planning) ----------
async function planFor(id: string, phone: string) {
  if (!Types.ObjectId.isValid(id)) bad('Squad not found', 404);
  const p = await Plan.findOne({ _id: id, 'members.phone': phone });
  return p ?? bad('Squad not found', 404);
}
async function planView(p: Awaited<ReturnType<typeof planFor>>, phone: string) {
  const e = (await Event.findById(p.event).lean()) as EventDoc;
  const holders = new Set(await Ticket.distinct('holderPhone', { event: p.event, status: { $ne: 'void' }, holderPhone: { $in: p.members.map((m) => m.phone as string) } }));
  const users = new Map((await User.find({ phone: { $in: p.members.map((m) => m.phone as string) } }, { phone: 1, name: 1 }).lean()).map((x) => [x.phone, x.name]));
  return {
    id: String(p._id), title: p.title, meetPoint: p.meetPoint, leaveAt: p.leaveAt, event: await eventCard(e),
    members: p.members.map((m) => ({
      name: m.name || users.get(m.phone!) || maskPhone(m.phone), vote: m.vote ?? null, hasTicket: holders.has(m.phone as string),
      me: m.phone === phone, onApp: users.has(m.phone!),
    })),
    messages: p.messages.slice(-100).map((m) => ({ id: String(m._id), name: m.name, body: m.body, at: m.at, mine: m.phone === phone })),
  };
}
me.get('/me/plans', async (req, res) => {
  const u = await needUser(req);
  const plans = await Plan.find({ 'members.phone': u.phone }).sort({ updatedAt: -1 });
  res.json(await Promise.all(plans.map((p) => planView(p, u.phone))));
});
me.post('/plans', async (req, res) => {
  const u = await needUser(req);
  const ev = (await Event.findOne({ slug: req.body.eventSlug }).lean()) ?? bad('Event not found', 404);
  const phones = [...new Set<string>((req.body.phones || []).map(normPhone).filter(Boolean))].filter((p) => p !== u.phone);
  const p = await Plan.create({
    event: ev._id, creator: u._id, title: String(req.body.title || ev.title).slice(0, 80),
    members: [{ phone: u.phone, name: u.name, vote: 'going' }, ...phones.map((ph) => ({ phone: ph, name: u.friends.find((f) => f.phone === ph)?.name }))],
  });
  for (const ph of phones) notifyPhone(ph, { title: `${u.name || 'A friend'} wants to go to ${ev.title}`, body: 'Vote in the squad: going, maybe or no', url: `/squads/${p._id}` }).catch(() => {});
  res.json({ id: String(p._id) });
});
me.get('/plans/:id', async (req, res) => {
  const u = await needUser(req);
  res.json(await planView(await planFor(req.params.id, u.phone), u.phone));
});
me.post('/plans/:id/vote', async (req, res) => {
  const u = await needUser(req);
  if (!['going', 'maybe', 'no'].includes(req.body.vote)) bad('Bad vote');
  const p = await planFor(req.params.id, u.phone);
  const m = p.members.find((x) => x.phone === u.phone)!;
  m.vote = req.body.vote; m.name ||= u.name;
  await p.save();
  res.json(await planView(p, u.phone));
});
me.post('/plans/:id/messages', async (req, res) => {
  const u = await needUser(req);
  const body = String(req.body.body || '').trim().slice(0, 500) || bad('Empty message');
  const p = await planFor(req.params.id, u.phone);
  p.messages.push({ phone: u.phone, name: u.name || maskPhone(u.phone), body, at: new Date() });
  await p.save();
  res.json(await planView(p, u.phone));
});
me.post('/plans/:id/members', async (req, res) => {
  const u = await needUser(req);
  const ph = normPhone(req.body.phone) ?? bad('Enter a valid phone number');
  const p = await planFor(req.params.id, u.phone);
  if (!p.members.some((m) => m.phone === ph)) p.members.push({ phone: ph, name: String(req.body.name || '').trim() || null, vote: null });
  await p.save();
  notifyPhone(ph, { title: `${u.name || 'A friend'} added you to a squad`, body: p.title ?? undefined, url: `/squads/${p._id}` }, { sms: true }).catch(() => {});
  res.json(await planView(p, u.phone));
});
me.put('/plans/:id', async (req, res) => {
  const u = await needUser(req);
  const p = await planFor(req.params.id, u.phone);
  if (req.body.meetPoint !== undefined) p.meetPoint = String(req.body.meetPoint).slice(0, 120);
  if (req.body.leaveAt !== undefined) p.leaveAt = String(req.body.leaveAt).slice(0, 5);
  await p.save();
  res.json(await planView(p, u.phone));
});
