// Stand-in for the customer's phone while MPESA_MODE=simulate.
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Signal, Wifi } from 'lucide-react';
import { api, post } from '@shared/api';
import { ksh } from '@shared/utils';

export default function Simulator() {
  const [sp] = useSearchParams();
  const qc = useQueryClient();
  const [phone, setPhone] = useState(sp.get('phone') || '');
  const [pins, setPins] = useState<Record<string, string>>({});
  const [drop, setDrop] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<Record<string, 'paid' | 'cancelled'>>({});
  const { data: prompts = [] } = useQuery({
    queryKey: ['sim', phone], refetchInterval: 1500,
    queryFn: () => api<{ id: string; phone: string; amount: number; reference: string }[]>('/simulator/prompts?phone=' + encodeURIComponent(phone)),
  });

  async function respond(id: string, outcome: 'paid' | 'cancelled') {
    try { await post(`/simulator/${id}/respond`, { outcome, pin: pins[id], dropCallback: drop[id] }); setDone({ ...done, [id]: outcome }); qc.invalidateQueries({ queryKey: ['sim'] }); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-[360px]">
        <p className="mb-4 text-center text-sm text-muted">Demo phone. In production the customer sees this prompt on their own Safaricom line — this stands in for it while <code className="text-fg">MPESA_MODE=simulate</code>.</p>
        <div className="rounded-[44px] border-[10px] border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between px-2 text-xs text-zinc-400">
            <span className="font-semibold">Safaricom</span>
            <span className="flex items-center gap-1"><Signal className="size-3.5" /><Wifi className="size-3.5" /></span>
          </div>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Filter by phone (optional)" className="mb-3 h-10 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm outline-none" />
          <div className="min-h-[440px] space-y-3">
            {Object.entries(done).map(([id, o]) => (
              <div key={id} className="flex items-center gap-2 rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-900"><CheckCircle2 className={`size-5 ${o === 'paid' ? 'text-green-600' : 'text-zinc-400'}`} />{o === 'paid' ? 'Payment sent. You will receive an M-PESA confirmation SMS.' : 'Request cancelled.'}</div>
            ))}
            {prompts.filter((p) => !done[p.id]).map((p) => (
              <div key={p.id} className="rounded-2xl bg-zinc-100 p-4 text-zinc-900">
                <div className="text-xs font-bold tracking-wider text-green-700">M-PESA</div>
                <p className="mt-2 text-sm leading-relaxed">Do you want to pay <b>{ksh(p.amount)}</b> to <b>PASI TICKETS</b> account no. <b>{p.reference}</b>?</p>
                <p className="mt-1 text-xs text-zinc-500">To +{p.phone}</p>
                <input type="password" inputMode="numeric" maxLength={4} placeholder="Enter M-PESA PIN" value={pins[p.id] || ''} onChange={(e) => setPins({ ...pins, [p.id]: e.target.value.replace(/\D/g, '') })}
                  className="mt-3 h-12 w-full rounded-xl border border-zinc-300 bg-white text-center text-xl tracking-[.5em] outline-none focus:border-green-600" aria-label="M-Pesa PIN" />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => respond(p.id, 'cancelled')} className="h-11 rounded-xl bg-zinc-200 font-semibold">Cancel</button>
                  <button onClick={() => respond(p.id, 'paid')} className="h-11 rounded-xl bg-green-600 font-semibold text-white">OK</button>
                </div>
                <label className="mt-3 flex items-center gap-2 text-xs text-zinc-500"><input type="checkbox" checked={!!drop[p.id]} onChange={(e) => setDrop({ ...drop, [p.id]: e.target.checked })} />Drop the callback (tests recovery via STK query)</label>
              </div>
            ))}
            {!prompts.length && !Object.keys(done).length && <p className="pt-32 text-center text-sm text-zinc-500">Waiting for an M-Pesa prompt…</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
