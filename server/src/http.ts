import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { config } from './config.js';
import { Event, Organization, Session, TicketType, User, type EventDoc, type OrgDoc } from './models.js';
import { ticketTypeView } from './orders.js';
import { bad, token } from './util.js';

const COOKIE = { user: 'sid', org: 'oid', gate: 'gid' } as const;
type Kind = keyof typeof COOKIE;

export function cookies(req: Request): Record<string, string> {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
  }));
}

export async function startSession(res: Response, kind: Kind, subject: Types.ObjectId, extra: Record<string, unknown> = {}) {
  const t = token();
  await Session.create({ token: t, kind, subject, ...extra });
  res.cookie(COOKIE[kind], t, { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: (kind === 'user' ? 60 : 14) * 864e5, path: '/' });
}
export async function endSession(req: Request, res: Response, kind: Kind) {
  const t = cookies(req)[COOKIE[kind]];
  if (t) await Session.deleteOne({ token: t });
  res.clearCookie(COOKIE[kind], { path: '/' });
}
export async function session(req: Request, kind: Kind) {
  const t = cookies(req)[COOKIE[kind]];
  return t ? Session.findOne({ token: t, kind }).lean() : null;
}

export async function optUser(req: Request) {
  const s = await session(req, 'user');
  return s ? User.findById(s.subject) : null;
}
export async function needUser(req: Request) {
  return (await optUser(req)) ?? bad('Please log in with your phone number', 401);
}
export async function needOrg(req: Request) {
  const s = await session(req, 'org');
  return (s && (await Organization.findById(s.subject).lean())) || bad('Please log in', 401);
}
export async function needGate(req: Request) {
  const s = await session(req, 'gate');
  const ev = s && (await Event.findById(s.subject).lean());
  return ev ? { ev: ev as EventDoc, gate: s.gate || 'Gate' } : bad('Scanner not signed in', 401);
}

// Tiny in-memory rate limiter. Blunts bots hammering checkout when sales open.
const hits = new Map<string, number[]>();
export function limit(req: Request, bucket: string, max: number, windowSec: number) {
  const key = bucket + ':' + req.ip;
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowSec * 1000);
  if (arr.length >= max) bad('Too many attempts. Wait a moment and try again.', 429);
  arr.push(now);
  hits.set(key, arr);
}

export async function eventCard(e: EventDoc, org?: Pick<OrgDoc, '_id' | 'name' | 'verified' | 'slug'> | null) {
  const types = (await TicketType.find({ event: e._id }).lean()).map((t) => ticketTypeView(t as never));
  const onSale = types.filter((t) => t.state === 'on_sale');
  const remaining = types.reduce((a, t) => a + t.remaining, 0);
  const total = types.reduce((a, t) => a + t.quantity, 0);
  org ??= await Organization.findById(e.org, { name: 1, verified: 1, slug: 1 }).lean();
  return {
    id: String(e._id), slug: e.slug, title: e.title, category: e.category, venueName: e.venueName, address: e.address,
    lat: e.lat, lng: e.lng, startsAt: e.startsAt, endsAt: e.endsAt, theme: e.theme, posterUrl: e.posterUrl, status: e.status,
    org: org ? { id: String(org._id), name: org.name, slug: org.slug, verified: !!org.verified } : null,
    minPrice: onSale.length ? Math.min(...onSale.map((t) => t.price)) : null,
    soldOut: total > 0 && remaining === 0,
    sellingFast: total > 0 && remaining > 0 && remaining / total < 0.25,
  };
}
