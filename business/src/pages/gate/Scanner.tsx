// Gate scanner: any phone becomes a scanner. Keeps working with no network by checking against
// a downloaded ticket list, then syncs queued check-ins when signal returns.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import jsQR from 'jsqr';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeftRight, Ban, CameraOff, CheckCircle2, CloudOff, Keyboard, LogOut, ScanLine, Smartphone, Store, Wifi, XCircle } from 'lucide-react';
import { api, post } from '@shared/api';
import type { TicketTypeView } from '@shared/types';
import { cn, fmtDate, ksh } from '@shared/utils';
import { Logo } from '@shared/brand';
import { FAN_URL } from '@/env';
import { Button, Field, Input, Segmented, Select, Skeleton } from '@shared/ui';

interface GateMe { gate: string; event: { id: string; title: string; startsAt: string; venueName: string }; types: TicketTypeView[] }
interface Result { result: 'ok' | 'duplicate' | 'void' | 'invalid' | 'wrong_event'; message: string; name?: string; type?: string; admits?: number; comp?: boolean; offline?: boolean }
interface ManifestItem { code: string; name?: string; status: string; type?: string; admits?: number }

const store = {
  get: <T,>(k: string, d: T): T => { try { const v = localStorage.getItem('gate.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k: string, v: unknown) => { try { localStorage.setItem('gate.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

export default function Scanner() {
  const { data: me, isLoading, refetch } = useQuery({ queryKey: ['gate-me'], retry: false, queryFn: () => api<GateMe>('/gate/me').catch(() => null) });
  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>;
  return me ? <ScanApp me={me} onLogout={() => refetch()} /> : <GateLogin onDone={() => refetch()} />;
}

function GateLogin({ onDone }: { onDone: () => void }) {
  const { data: events } = useQuery({ queryKey: ['gate-events'], queryFn: () => api<{ id: string; title: string; startsAt: string; org: string }[]>('/gate/events') });
  const [eventId, setEventId] = useState(''); const [pin, setPin] = useState(''); const [gate, setGate] = useState(store.get('gate', 'Gate A'));
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <Logo suffix="Gate" to="/scan" />
      <div className="my-auto">
        <div className="mb-6 grid size-16 place-items-center rounded-2xl bg-brand/15 text-brand-soft"><ScanLine className="size-8" /></div>
        <h1 className="text-3xl font-extrabold tracking-tight">Door staff sign-in</h1>
        <p className="mt-2 text-muted">Ask the organizer for the event’s gate PIN. No account needed.</p>
        <form className="mt-8 space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          try { await post('/gate/login', { eventId: eventId || events?.[0]?.id, pin, gate }); store.set('gate', gate); onDone(); }
          catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
        }}>
          <Field label="Event"><Select value={eventId} onChange={(e) => setEventId(e.target.value)}>{events?.map((e) => <option key={e.id} value={e.id}>{e.title} — {fmtDate(e.startsAt)}</option>)}</Select></Field>
          <Field label="Gate PIN"><Input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" type="password" placeholder="••••" required className="font-mono tracking-[.4em]" /></Field>
          <Field label="This gate"><Input value={gate} onChange={(e) => setGate(e.target.value)} /></Field>
          <Button variant="primary" size="lg" block loading={busy}>Start scanning</Button>
          <p className="text-center text-xs text-subtle">Demo events use PIN <b className="text-muted">1234</b></p>
        </form>
      </div>
    </div>
  );
}

function ScanApp({ me, onLogout }: { me: GateMe; onLogout: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'scan' | 'door'>('scan');
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<{ code: string; at: string }[]>(store.get('queue', []));
  const manifest = useRef(new Map<string, ManifestItem>());
  const { data: stats } = useQuery({ queryKey: ['gate-stats'], refetchInterval: 10000, queryFn: () => api<{ checkedIn: number; issued: number }>('/gate/stats') });
  const [localIn, setLocalIn] = useState(0);

  const loadManifest = useCallback(async () => {
    try { const list = await api<ManifestItem[]>('/gate/manifest'); store.set('manifest.' + me.event.id, list); manifest.current = new Map(list.map((t) => [t.code, t])); }
    catch { manifest.current = new Map(store.get<ManifestItem[]>('manifest.' + me.event.id, []).map((t) => [t.code, t])); }
    for (const q of store.get<{ code: string }[]>('queue', [])) { const t = manifest.current.get(q.code); if (t) t.status = 'used'; }
  }, [me.event.id]);

  const sync = useCallback(async () => {
    const q = store.get<{ code: string; at: string }[]>('queue', []);
    if (!q.length || !navigator.onLine) return;
    try { await post('/gate/sync', { scans: q }); store.set('queue', []); setQueue([]); qc.invalidateQueries({ queryKey: ['gate-stats'] }); toast.success(`Synced ${q.length} offline check-ins`); } catch { /* retry later */ }
  }, [qc]);

  useEffect(() => {
    loadManifest();
    const on = () => { setOnline(true); sync(); loadManifest(); }, off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const t = setInterval(() => { if (navigator.onLine) { loadManifest(); sync(); } }, 30000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, [loadManifest, sync]);

  /** Same rules as the server, against the downloaded list. */
  const offlineCheck = (code: string): Result => {
    const t = manifest.current.get(code);
    if (!t) return { result: 'invalid', message: 'Not on this event’s ticket list', offline: true };
    if (t.status === 'used') return { result: 'duplicate', message: 'Already scanned', name: t.name, type: t.type, offline: true };
    t.status = 'used';
    const q = [...store.get<{ code: string; at: string }[]>('queue', []), { code, at: new Date().toISOString() }];
    store.set('queue', q); setQueue(q); setLocalIn((n) => n + 1);
    return { result: 'ok', message: (t.admits ?? 1) > 1 ? `Admit ${t.admits}` : 'Admit 1', name: t.name, type: t.type, admits: t.admits, offline: true };
  };

  const check = useCallback(async (raw: string): Promise<Result> => {
    const code = raw.trim().replace(/^PASI:/, '');
    if (navigator.onLine) {
      try {
        const r = await post<Result>('/gate/scan', { code });
        const t = manifest.current.get(code); if (t && r.result === 'ok') t.status = 'used';
        qc.invalidateQueries({ queryKey: ['gate-stats'] });
        return r;
      } catch (e) { if ((e as { status?: number }).status === 401) { onLogout(); } }
    }
    return offlineCheck(code);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const inCount = (stats?.checkedIn ?? 0) + (online ? 0 : localIn);
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-6">
      <header className="flex h-16 items-center gap-3">
        <Logo suffix="Gate" to="/scan" />
        <div className="flex-1" />
        <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', online ? 'bg-brand/15 text-brand-soft' : 'bg-warn/15 text-warn')}>
          {online ? <Wifi className="size-3.5" /> : <CloudOff className="size-3.5" />}{online ? (queue.length ? `Syncing ${queue.length}` : 'Online') : `Offline${queue.length ? ` · ${queue.length} queued` : ''}`}
        </span>
        <button aria-label="Sign out" className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg" onClick={async () => { await post('/gate/logout'); onLogout(); }}><LogOut className="size-4" /></button>
      </header>
      <div className="mb-4 flex items-end justify-between rounded-2xl border border-line bg-surface p-4">
        <div className="min-w-0"><div className="truncate font-semibold">{me.event.title}</div><div className="text-sm text-muted">{me.gate}</div></div>
        <div className="text-right"><div className="text-3xl font-extrabold tabular-nums">{inCount}<span className="text-base font-medium text-muted"> / {stats?.issued ?? manifest.current.size}</span></div><div className="text-xs text-muted">checked in</div></div>
      </div>
      <Segmented value={tab} onChange={setTab} className="mb-4" options={[{ value: 'scan', label: <><ScanLine className="size-4" />Scan</> }, { value: 'door', label: <><Store className="size-4" />Door sale</> }]} />
      {tab === 'scan' ? <ScanTab check={check} /> : <DoorTab me={me} check={check} />}
    </div>
  );
}

function beep(ok: boolean) {
  try {
    const a = new AudioContext(), o = a.createOscillator(), g = a.createGain();
    o.frequency.value = ok ? 880 : 220; o.type = ok ? 'sine' : 'square'; g.gain.value = 0.15; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + (ok ? 0.15 : 0.45));
  } catch { /* no audio */ }
  navigator.vibrate?.(ok ? 80 : [200, 80, 200]);
}

const LOOK: Record<Result['result'], { bg: string; icon: typeof CheckCircle2; title: string }> = {
  ok: { bg: 'bg-[#0f9f4f]', icon: CheckCircle2, title: 'VALID' },
  duplicate: { bg: 'bg-[#d97706]', icon: AlertTriangle, title: 'ALREADY USED' },
  void: { bg: 'bg-[#d97706]', icon: ArrowLeftRight, title: 'TRANSFERRED' },
  invalid: { bg: 'bg-[#dc2626]', icon: XCircle, title: 'FAKE / INVALID' },
  wrong_event: { bg: 'bg-[#dc2626]', icon: Ban, title: 'WRONG EVENT' },
};

function ScanTab({ check }: { check: (c: string) => Promise<Result> }) {
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const [result, setResult] = useState<Result | null>(null);
  const [camErr, setCamErr] = useState(false);
  const [manual, setManual] = useState('');

  const handle = useCallback(async (code: string) => {
    if (busy.current) return; busy.current = true;
    const r = await check(code);
    beep(r.result === 'ok'); setResult(r);
  }, [check]);
  const dismiss = () => { setResult(null); setTimeout(() => { busy.current = false; }, 350); };
  useEffect(() => { if (!result) return; const t = setTimeout(dismiss, result.result === 'ok' ? 1800 : 4000); return () => clearTimeout(t); }, [result]);

  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, alive = true;
    const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true })!;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!alive || !video.current) return;
        video.current.srcObject = stream; await video.current.play();
        const tick = () => {
          const v = video.current;
          if (!alive || !v) return;
          if (!busy.current && v.readyState === v.HAVE_ENOUGH_DATA) {
            c.width = 480; c.height = Math.round((v.videoHeight / v.videoWidth) * 480) || 480;
            x.drawImage(v, 0, 0, c.width, c.height);
            const qr = jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
            if (qr?.data) handle(qr.data);
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setCamErr(true); }
    })();
    return () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [handle]);

  return (
    <>
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-line bg-black">
        {camErr ? (
          <div className="grid h-full place-items-center p-8 text-center text-muted"><div><CameraOff className="mx-auto mb-3 size-10" />Camera unavailable. Allow camera access, or type the code below.</div></div>
        ) : (<>
          <video ref={video} playsInline muted className="size-full object-cover" />
          <div className="pointer-events-none absolute inset-[16%] rounded-3xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,.45)]" />
          <motion.div className="pointer-events-none absolute inset-x-[18%] h-0.5 bg-brand-soft shadow-[0_0_20px_4px_rgba(74,222,128,.6)]" animate={{ top: ['18%', '82%', '18%'] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} />
        </>)}
      </div>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { handle(manual); setManual(''); } }}>
        <div className="relative flex-1"><Keyboard className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" /><Input value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} placeholder="Type ticket code" className="pl-10 font-mono" aria-label="Ticket code" /></div>
        <Button variant="secondary" className="h-12">Check</Button>
      </form>

      <AnimatePresence>
        {result && (() => { const L = LOOK[result.result]; return (
          <motion.button key="r" onClick={dismiss} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className={cn('fixed inset-0 z-50 grid place-items-center p-6 text-center text-white', L.bg)}>
            <div>
              <L.icon className="mx-auto size-28" strokeWidth={1.5} />
              <div className="mt-4 text-5xl font-black tracking-tight">{L.title}</div>
              {result.name && <div className="mt-4 text-2xl font-bold">{result.name}</div>}
              {result.type && <div className="text-lg opacity-90">{result.type}{result.comp ? ' · Guest list' : ''}</div>}
              <div className={cn('mt-4 font-extrabold', result.result === 'ok' ? 'text-4xl' : 'text-lg')}>{result.message}</div>
              {result.result === 'ok' && <div className="mt-2 opacity-85">Give wristband</div>}
              {result.offline && <div className="mt-4 text-sm opacity-80">Checked offline — will sync automatically</div>}
              <div className="mt-10 text-sm opacity-70">Tap to scan next</div>
            </div>
          </motion.button>
        ); })()}
      </AnimatePresence>
    </>
  );
}

function DoorTab({ me, check }: { me: GateMe; check: (c: string) => Promise<Result> }) {
  const sellable = me.types.filter((t) => t.state === 'on_sale');
  const [tt, setTt] = useState(sellable[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'wait'; total: number } | { kind: 'ok'; text: string } | { kind: 'fail'; text: string }>({ kind: 'idle' });

  async function sell(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await post<{ ref: string; total: number }>('/gate/door-sale', { ticketTypeId: tt, qty, phone });
      setState({ kind: 'wait', total: r.total });
      const poll = setInterval(async () => {
        const o = await api<{ status: string; receipt?: string; message?: string; tickets: { code: string }[] }>('/gate/orders/' + r.ref).catch(() => null);
        if (!o || o.status === 'pending' || o.status === 'processing') return;
        clearInterval(poll);
        if (o.status === 'paid') { for (const t of o.tickets) await check(t.code); beep(true); setState({ kind: 'ok', text: `Paid ${o.receipt ?? ''} — ${o.tickets.length} admitted. Ticket sent to their phone.` }); setPhone(''); }
        else setState({ kind: 'fail', text: o.message || 'Payment not completed' });
      }, 2000);
    } catch (err) { toast.error((err as Error).message); }
  }

  return (
    <form onSubmit={sell} className="card space-y-4 p-5">
      <div><h2 className="font-semibold">Sell at the door</h2><p className="text-sm text-muted">The customer gets an M-Pesa prompt. No cash, and every sale shows in the report.</p></div>
      <Field label="Ticket"><Select value={tt} onChange={(e) => setTt(e.target.value)}>{sellable.map((t) => <option key={t.id} value={t.id}>{t.name} — {ksh(t.price)} ({t.remaining} left)</option>)}</Select></Field>
      <div className="grid grid-cols-[1fr_90px] gap-3">
        <Field label="Customer M-Pesa number"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="07XX XXX XXX" required /></Field>
        <Field label="Qty"><Input type="number" min={1} max={10} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></Field>
      </div>
      <Button variant="primary" size="lg" block disabled={state.kind === 'wait' || !sellable.length}><Smartphone className="size-5" />Send M-Pesa prompt</Button>
      {state.kind === 'wait' && <div className="rounded-xl bg-surface-2 p-4 text-center text-sm"><b>Waiting for the customer’s PIN… {ksh(state.total)}</b><div className="mt-1 text-muted">Demo: approve on the <a className="underline" href={`${FAN_URL}/simulator`} target="_blank" rel="noopener">simulator phone</a></div></div>}
      {state.kind === 'ok' && <div className="rounded-xl border border-brand/30 bg-brand/10 p-4 text-sm text-brand-soft">{state.text}</div>}
      {state.kind === 'fail' && <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{state.text}</div>}
    </form>
  );
}
