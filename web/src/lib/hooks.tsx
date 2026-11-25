import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { api, post } from '@shared/api';
import type { AppConfig, Me } from '@shared/types';
import { Button, Field, Input, Sheet } from '@shared/ui';

export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: () => api<AppConfig>('/config'), staleTime: Infinity });
export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<Me | null>('/me'), staleTime: 30_000 });

const LS = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem('pasi.' + k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem('pasi.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
export { LS };

// ---------- phone login, available anywhere via requireLogin() ----------
type Ctx = { requireLogin: (reason?: string) => Promise<Me | null> };
const AuthCtx = createContext<Ctx>({ requireLogin: async () => null });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState(LS.get('phone', ''));
  const [name, setName] = useState(LS.get('name', ''));
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string>();
  const [busy, setBusy] = useState(false);
  const resolver = useRef<(m: Me | null) => void>(undefined);

  const requireLogin = useCallback(async (why = 'Log in with your phone') => {
    const cur = await qc.fetchQuery({ queryKey: ['me'], queryFn: () => api<Me | null>('/me') });
    if (cur) return cur;
    setReason(why); setStep('phone'); setCode(''); setOpen(true);
    return new Promise<Me | null>((r) => { resolver.current = r; });
  }, [qc]);

  const close = (m: Me | null) => { setOpen(false); resolver.current?.(m); resolver.current = undefined; };

  async function send() {
    setBusy(true);
    try {
      const r = await post<{ devCode?: string }>('/auth/otp', { phone });
      setDevCode(r.devCode); setStep('code'); LS.set('phone', phone); LS.set('name', name);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true);
    try {
      await post('/auth/verify', { phone, code, name });
      const me = await qc.fetchQuery({ queryKey: ['me'], queryFn: () => api<Me | null>('/me') });
      qc.invalidateQueries();
      toast.success(`Welcome${me?.name ? ', ' + me.name : ''}!`);
      close(me);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <AuthCtx.Provider value={{ requireLogin }}>
      {children}
      <Sheet open={open} onOpenChange={(o) => !o && close(null)} title={reason}
        description={step === 'phone' ? 'We’ll text you a 6-digit code. No passwords.' : `Enter the code sent to ${phone}`}>
        {step === 'phone' ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <Field label="Your name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wanjiku" autoComplete="name" /></Field>
            <Field label="Phone number"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="07XX XXX XXX" autoComplete="tel" required /></Field>
            <Button variant="primary" size="lg" block loading={busy}>Send code</Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); verify(); }}>
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code"
              className="h-16 text-center font-mono text-2xl tracking-[.5em]" placeholder="••••••" aria-label="6-digit code" />
            {devCode && <p className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">Demo mode (no SMS provider yet): your code is <b className="font-mono">{devCode}</b></p>}
            <Button variant="primary" size="lg" block loading={busy} disabled={code.length !== 6}>Verify & continue</Button>
            <button type="button" className="w-full text-sm text-muted hover:text-fg" onClick={() => setStep('phone')}>Use a different number</button>
          </form>
        )}
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-subtle"><ShieldCheck className="size-3.5" /> Your number is only used for tickets and friends.</p>
      </Sheet>
    </AuthCtx.Provider>
  );
}
