// Notifications: in-app inbox + Web Push (installed app) + SMS.
import * as webpush from 'web-push';
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Types } from 'mongoose';
import { config, DATA_DIR } from './config.js';
import { Notification, PushSub, User } from './models.js';

const vapidFile = path.join(DATA_DIR, 'vapid.json');
const keys = config.vapid.publicKey && config.vapid.privateKey
  ? { publicKey: config.vapid.publicKey, privateKey: config.vapid.privateKey }
  : existsSync(vapidFile) ? JSON.parse(readFileSync(vapidFile, 'utf8'))
    : (() => { const k = webpush.generateVAPIDKeys(); writeFileSync(vapidFile, JSON.stringify(k)); return k; })();
webpush.setVapidDetails(config.vapid.subject, keys.publicKey, keys.privateKey);
export const vapidPublicKey: string = keys.publicKey;

export interface Msg { title: string; body?: string; url?: string }

async function push(subs: { endpoint?: string | null; sub?: unknown }[], msg: Msg) {
  const body = JSON.stringify(msg);
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification(s.sub as webpush.PushSubscription, body); }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await PushSub.deleteOne({ endpoint: s.endpoint }); }
  }));
}

export async function notifyUser(userId: Types.ObjectId | string, msg: Msg) {
  await Notification.create({ user: userId, ...msg });
  push(await PushSub.find({ user: userId }).lean(), msg).catch(() => {});
}

export async function notifyPhone(phone: string, msg: Msg, { sms = false } = {}) {
  const u = await User.findOne({ phone }).lean();
  if (u) await notifyUser(u._id, msg);
  if (sms || !u) sendSms(phone, `${msg.title}${msg.body ? ' — ' + msg.body : ''}${msg.url ? ' ' + absolute(msg.url) : ''}`).catch(() => {});
}

export async function broadcast(msg: Msg, followerIds: Types.ObjectId[] = []) {
  if (followerIds.length) await Notification.insertMany(followerIds.map((user) => ({ user, ...msg })));
  push(await PushSub.find().lean(), msg).catch(() => {});
}

const absolute = (url: string) => (url.startsWith('http') ? url : config.publicUrl.replace(/\/$/, '') + url);

/** SMS via Africa's Talking when configured; otherwise printed to the server log. */
export async function sendSms(phone: string, text: string) {
  const s = config.sms;
  if (s.provider !== 'africastalking' || !s.atApiKey) { console.log(`[SMS → +${phone}] ${text}`); return; }
  const body = new URLSearchParams({ username: s.atUsername, to: '+' + phone, message: text, ...(s.atSenderId && { from: s.atSenderId }) });
  const host = s.atUsername === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  const r = await fetch(`https://${host}/version1/messaging`, {
    method: 'POST', headers: { apiKey: s.atApiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  if (!r.ok) console.error('[SMS] failed', r.status, await r.text());
}
