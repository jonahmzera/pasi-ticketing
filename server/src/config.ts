// All configuration comes from environment variables (or the root .env file).
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = (k: string, d = '') => process.env[k] || d;

export const DATA_DIR = env('DATA_DIR', path.join(ROOT, 'data'));
mkdirSync(DATA_DIR, { recursive: true });

function persistedSecret(name: string, make: () => string) {
  const f = path.join(DATA_DIR, name);
  if (existsSync(f)) return readFileSync(f, 'utf8').trim();
  const v = make();
  writeFileSync(f, v);
  return v;
}

export const config = {
  port: Number(env('PORT', '4000')),
  businessPort: Number(env('BUSINESS_PORT', '4100')),
  isProd: env('NODE_ENV') === 'production',
  publicUrl: env('PUBLIC_URL', 'http://localhost:5173'),
  mongoUri: env('MONGODB_URI'),
  ticketSecret: env('TICKET_SECRET') || persistedSecret('ticket-secret.txt', () => crypto.randomBytes(32).toString('hex')),
  platformFeePct: Number(env('PLATFORM_FEE_PCT', '4')),
  holdSeconds: Number(env('HOLD_SECONDS', '180')),
  mpesa: {
    mode: env('MPESA_MODE', 'simulate').toLowerCase() as 'simulate' | 'sandbox' | 'production',
    consumerKey: env('MPESA_CONSUMER_KEY'),
    consumerSecret: env('MPESA_CONSUMER_SECRET'),
    shortcode: env('MPESA_SHORTCODE', '174379'),
    passkey: env('MPESA_PASSKEY'),
    transactionType: env('MPESA_TRANSACTION_TYPE', 'CustomerPayBillOnline'),
    partyB: env('MPESA_PARTY_B') || env('MPESA_SHORTCODE', '174379'),
    callbackBase: env('MPESA_CALLBACK_URL') || env('PUBLIC_URL'),
    callbackToken: env('MPESA_CALLBACK_TOKEN', 'dev-callback-token'),
  },
  sms: {
    provider: env('SMS_PROVIDER', 'console') as 'console' | 'africastalking',
    atUsername: env('AT_USERNAME'),
    atApiKey: env('AT_API_KEY'),
    atSenderId: env('AT_SENDER_ID'),
  },
  vapid: {
    publicKey: env('VAPID_PUBLIC_KEY'),
    privateKey: env('VAPID_PRIVATE_KEY'),
    subject: env('VAPID_SUBJECT', 'mailto:admin@example.com'),
  },
};
