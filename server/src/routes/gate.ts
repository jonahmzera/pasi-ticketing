// Gate scanner API. Door staff sign in with the event PIN; no account needed.
import { Router } from 'express';
import { Types } from 'mongoose';
import { Event, Order, Organization, Scan, Ticket, TicketType, type EventDoc } from '../models.js';
import { createOrder, orderView, ticketTypeView } from '../orders.js';
import { endSession, limit, needGate, startSession } from '../http.js';
import { bad, verifyTicketCode } from '../util.js';

export const gate = Router();

gate.get('/events', async (_req, res) => {
  const evs = await Event.find({ status: 'published', $or: [{ endsAt: { $gte: new Date(Date.now() - 864e5) } }, { startsAt: { $gte: new Date(Date.now() - 864e5) } }] }).sort({ startsAt: 1 }).lean();
  const orgs = new Map((await Organization.find({ _id: { $in: evs.map((e) => e.org) } }, { name: 1 }).lean()).map((o) => [String(o._id), o.name]));
  res.json(evs.map((e) => ({ id: String(e._id), title: e.title, startsAt: e.startsAt, venueName: e.venueName, org: orgs.get(String(e.org)) })));
});

gate.post('/login', async (req, res) => {
  limit(req, 'gate', 10, 300);
  if (!Types.ObjectId.isValid(String(req.body.eventId))) bad('Pick an event');
  const ev = await Event.findById(req.body.eventId).lean();
  if (!ev?.gatePin || ev.gatePin !== String(req.body.pin || '').trim()) bad('Wrong event PIN', 401);
  await startSession(res, 'gate', ev!._id, { gate: String(req.body.gate || 'Gate A').slice(0, 30) });
  res.json({ ok: true });
});
gate.post('/logout', async (req, res) => { await endSession(req, res, 'gate'); res.json({ ok: true }); });

gate.get('/me', async (req, res) => {
  const { ev, gate: g } = await needGate(req);
  const types = (await TicketType.find({ event: ev._id }).sort({ sort: 1 }).lean()).map((t) => ticketTypeView(t as never));
  res.json({ gate: g, event: { id: String(ev._id), title: ev.title, startsAt: ev.startsAt, venueName: ev.venueName, theme: ev.theme }, types });
});

gate.get('/manifest', async (req, res) => {
  const { ev } = await needGate(req);
  const t = await Ticket.find({ event: ev._id, status: { $ne: 'void' } }, { code: 1, holderName: 1, status: 1, typeName: 1, admits: 1 }).lean();
  res.json(t.map((x) => ({ code: x.code, name: x.holderName, status: x.status, type: x.typeName, admits: x.admits })));
});

type ScanResult = { result: 'ok' | 'duplicate' | 'void' | 'invalid' | 'wrong_event'; message: string; name?: string | null; type?: string | null; admits?: number; comp?: boolean };

async function checkIn(ev: EventDoc, raw: string, gateName: string, at?: Date): Promise<ScanResult> {
  const code = String(raw || '').trim().replace(/^PASI:/, '');
  const log = (result: string) => Scan.create({ event: ev._id, code, result, gate: gateName, at: at ?? new Date() });
  if (!verifyTicketCode(code)) { await log('invalid'); return { result: 'invalid', message: 'Not a genuine ticket' }; }
  const t = await Ticket.findOne({ code }).lean();
  if (!t) { await log('invalid'); return { result: 'invalid', message: 'Ticket not found' }; }
  if (!t.event.equals(ev._id)) { await log('wrong_event'); return { result: 'wrong_event', message: 'This ticket is for a different event' }; }
  const info = { name: t.holderName, type: t.typeName, admits: t.admits ?? 1, comp: t.isComp };
  if (t.status === 'void') { await log('void'); return { result: 'void', message: 'Transferred — the new owner has a different QR', ...info }; }
  const won = await Ticket.updateOne({ _id: t._id, status: 'valid' }, { status: 'used', checkedInAt: at ?? new Date(), checkedInGate: gateName });
  if (!won.modifiedCount) {
    await log('duplicate');
    const when = t.checkedInAt ? new Date(t.checkedInAt).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' }) : '';
    return { result: 'duplicate', message: `Already scanned${when ? ' at ' + when : ''}${t.checkedInGate ? ' · ' + t.checkedInGate : ''}`, ...info };
  }
  await log('ok');
  return { result: 'ok', message: info.admits > 1 ? `Admit ${info.admits}` : 'Admit 1', ...info };
}

gate.post('/scan', async (req, res) => {
  const { ev, gate: g } = await needGate(req);
  res.json(await checkIn(ev, req.body.code, g));
});
gate.post('/sync', async (req, res) => {
  const { ev, gate: g } = await needGate(req);
  const out = [];
  for (const s of (req.body.scans || []).slice(0, 2000)) out.push({ code: s.code, ...(await checkIn(ev, s.code, s.gate || g, s.at ? new Date(s.at) : undefined)) });
  res.json(out);
});
gate.get('/stats', async (req, res) => {
  const { ev } = await needGate(req);
  res.json({
    checkedIn: await Ticket.countDocuments({ event: ev._id, status: 'used' }),
    issued: await Ticket.countDocuments({ event: ev._id, status: { $ne: 'void' } }),
    recent: (await Scan.find({ event: ev._id }).sort({ _id: -1 }).limit(10).lean()).map((s) => ({ code: s.code, result: s.result, gate: s.gate, at: s.at })),
  });
});
gate.post('/door-sale', async (req, res) => {
  const { ev } = await needGate(req);
  const o = await createOrder({ ev, items: [{ ticketTypeId: req.body.ticketTypeId, qty: Number(req.body.qty) || 1 }], phone: req.body.phone, name: req.body.name || 'Door sale', source: 'door' });
  res.json({ ref: o.ref, total: o.total, status: o.status });
});

// Door-sale status, scoped to this gate's event.
gate.get('/orders/:ref', async (req, res) => {
  const { ev } = await needGate(req);
  const o = (await Order.findOne({ ref: req.params.ref, event: ev._id })) ?? bad('Order not found', 404);
  res.json(await orderView(o));
});
