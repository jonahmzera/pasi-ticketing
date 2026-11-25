import crypto from 'node:crypto';
import { config } from './config.js';

/** Normalise Kenyan numbers to 2547XXXXXXXX / 2541XXXXXXXX. Returns null if invalid. */
export function normPhone(input: unknown): string | null {
  if (!input) return null;
  let p = String(input).replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (/^0[17]\d{8}$/.test(p)) p = '254' + p.slice(1);
  else if (/^[17]\d{8}$/.test(p)) p = '254' + p;
  return /^254[17]\d{8}$/.test(p) ? p : null;
}
export const maskPhone = (p?: string | null) => (p ? p.slice(0, 6) + '***' + p.slice(-3) : '');

const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion when typed at a gate
export function randId(n = 10) {
  return Array.from(crypto.randomBytes(n), (x) => ABC[x % ABC.length]).join('');
}
export const token = () => crypto.randomBytes(24).toString('base64url');

/** Ticket codes are ID.SIGNATURE so forged or mistyped codes are rejected before touching the DB. */
const sign = (id: string) => crypto.createHmac('sha256', config.ticketSecret).update(id).digest('base64url').slice(0, 8);
export function makeTicketCode() {
  const id = randId(10);
  return `${id}.${sign(id)}`;
}
export function verifyTicketCode(code: string) {
  const [id, sig] = String(code || '').trim().split('.');
  if (!id || !sig) return false;
  const exp = sign(id);
  return sig.length === exp.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp));
}

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
export function checkPassword(pw: string, stored: string) {
  const [salt, h] = String(stored).split(':');
  if (!salt || !h) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(pw, salt, 32), Buffer.from(h, 'hex'));
}

export const slugify = (s: string) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'event';

/** Rough M-Pesa C2B cost the organizer bears (estimate; set your actual tariff). */
export function mpesaCost(amount: number) {
  if (amount <= 100) return 0;
  if (amount <= 500) return Math.round(amount * 0.005);
  return Math.min(Math.round(amount * 0.0055), 200);
}

export class UserError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const bad = (msg: string, status = 400): never => { throw new UserError(msg, status); };
