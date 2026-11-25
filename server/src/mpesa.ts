// M-Pesa Daraja (Lipa na M-Pesa Online / STK push).
// MPESA_MODE=simulate (default) runs a fake phone at /simulator so the full flow works without credentials.
// MPESA_MODE=sandbox|production calls the real Daraja API.
import { config } from './config.js';
import { randId } from './util.js';

const m = config.mpesa;
export const isSimulated = m.mode === 'simulate';
export const callbackToken = m.callbackToken;
const BASE = m.mode === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';

let cached: { value: string; exp: number } | null = null;
async function accessToken() {
  if (cached && cached.exp > Date.now()) return cached.value;
  if (!m.consumerKey || !m.consumerSecret) throw new Error('MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET are not set');
  const auth = Buffer.from(`${m.consumerKey}:${m.consumerSecret}`).toString('base64');
  const r = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
  if (!r.ok) throw new Error(`Daraja auth failed (${r.status})`);
  const j = (await r.json()) as { access_token: string; expires_in: string };
  cached = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) - 60) * 1000 };
  return cached.value;
}

/** Safaricom expects East Africa Time, yyyyMMddHHmmss. */
const stamp = () => new Date(Date.now() + 3 * 3600e3).toISOString().replace(/[-:T]/g, '').slice(0, 14);
const password = (ts: string) => Buffer.from(m.shortcode + m.passkey + ts).toString('base64');

export interface SimPrompt {
  checkoutRequestId: string; merchantRequestId: string; phone: string; amount: number; reference: string; at: number;
  outcome?: 'paid' | 'failed';
}
export const simulatedPrompts = new Map<string, SimPrompt>();

export type StkResult = { ok: true; checkoutRequestId: string; merchantRequestId: string } | { ok: false; error: string };

export async function stkPush(o: { phone: string; amount: number; reference: string; description?: string }): Promise<StkResult> {
  if (isSimulated) {
    const p: SimPrompt = { checkoutRequestId: 'ws_CO_SIM_' + randId(12), merchantRequestId: 'SIM-' + randId(8), phone: o.phone, amount: o.amount, reference: o.reference, at: Date.now() };
    simulatedPrompts.set(p.checkoutRequestId, p);
    return { ok: true, checkoutRequestId: p.checkoutRequestId, merchantRequestId: p.merchantRequestId };
  }
  const ts = stamp();
  const r = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: m.shortcode, Password: password(ts), Timestamp: ts, TransactionType: m.transactionType,
      Amount: Math.ceil(o.amount), PartyA: o.phone, PartyB: m.partyB, PhoneNumber: o.phone,
      CallBackURL: `${m.callbackBase}/api/mpesa/callback/${m.callbackToken}`,
      AccountReference: o.reference.slice(0, 12), TransactionDesc: (o.description || 'Tickets').slice(0, 13),
    }),
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, string>;
  if (!r.ok || j.ResponseCode !== '0') return { ok: false, error: j.errorMessage || j.ResponseDescription || `STK push failed (${r.status})` };
  return { ok: true, checkoutRequestId: j.CheckoutRequestID, merchantRequestId: j.MerchantRequestID };
}

export interface QueryResult { state: 'paid' | 'failed' | 'pending'; resultCode?: string; resultDesc?: string }

/** Ask Safaricom directly. Used to confirm every callback and to recover payments whose callback never arrived. */
export async function stkQuery(checkoutRequestId: string): Promise<QueryResult> {
  if (isSimulated) {
    const p = simulatedPrompts.get(checkoutRequestId);
    if (!p?.outcome) return { state: 'pending' };
    return p.outcome === 'paid' ? { state: 'paid', resultCode: '0', resultDesc: 'The service request is processed successfully.' }
      : { state: 'failed', resultCode: '1032', resultDesc: 'Request cancelled by user' };
  }
  const ts = stamp();
  const r = await fetch(`${BASE}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ BusinessShortCode: m.shortcode, Password: password(ts), Timestamp: ts, CheckoutRequestID: checkoutRequestId }),
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, string>;
  // While the customer is still on the PIN prompt Daraja answers with an errorCode.
  if (j.errorCode || j.ResultCode === undefined) return { state: 'pending', resultDesc: j.errorMessage };
  return { state: String(j.ResultCode) === '0' ? 'paid' : 'failed', resultCode: String(j.ResultCode), resultDesc: j.ResultDesc };
}

export interface ParsedCallback {
  checkoutRequestId: string; merchantRequestId: string; resultCode: string; resultDesc: string;
  amount: number | null; receipt: string | null; phone: string | null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseCallback(body: any): ParsedCallback | null {
  const cb = body?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return null;
  const meta: Record<string, unknown> = {};
  for (const it of cb.CallbackMetadata?.Item || []) meta[it.Name] = it.Value;
  return {
    checkoutRequestId: cb.CheckoutRequestID, merchantRequestId: cb.MerchantRequestID,
    resultCode: String(cb.ResultCode), resultDesc: cb.ResultDesc,
    amount: meta.Amount != null ? Number(meta.Amount) : null,
    receipt: (meta.MpesaReceiptNumber as string) || null,
    phone: meta.PhoneNumber != null ? String(meta.PhoneNumber) : null,
  };
}

/** Same shape Safaricom posts, for the simulator. */
export function simulatedCallbackBody(p: SimPrompt, outcome: 'paid' | 'cancelled' | 'timeout') {
  const ok = outcome === 'paid';
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: p.merchantRequestId, CheckoutRequestID: p.checkoutRequestId,
        ResultCode: ok ? 0 : outcome === 'timeout' ? 1037 : 1032,
        ResultDesc: ok ? 'The service request is processed successfully.' : outcome === 'timeout' ? 'DS timeout user cannot be reached' : 'Request cancelled by user',
        ...(ok && {
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: p.amount },
              { Name: 'MpesaReceiptNumber', Value: 'S' + randId(9) },
              { Name: 'TransactionDate', Value: Number(stamp()) },
              { Name: 'PhoneNumber', Value: Number(p.phone) },
            ],
          },
        }),
      },
    },
  };
}
