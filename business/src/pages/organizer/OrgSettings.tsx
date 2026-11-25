import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, LogOut, ShieldCheck } from 'lucide-react';
import { post, put } from '@shared/api';
import { prettyPhone } from '@shared/utils';
import { Button, Field, Input, Select, Textarea } from '@shared/ui';
import type { Org } from './Organizer';

export default function OrgSettings({ org }: { org: Org }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: org.name, bio: org.bio || '', phone: prettyPhone(org.phone), payoutMethod: org.payoutMethod, payoutAccount: org.payoutAccount || '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
      <form className="card space-y-4 p-5" onSubmit={async (e) => { e.preventDefault(); await put('/org/me', f); qc.invalidateQueries({ queryKey: ['org-me'] }); toast.success('Saved'); }}>
        <Field label="Organizer name"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Public bio" hint="Shown on your organizer page."><Textarea rows={3} value={f.bio} onChange={set('bio')} /></Field>
        <Field label="Contact phone"><Input value={f.phone} onChange={set('phone')} inputMode="tel" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payout method"><Select value={f.payoutMethod} onChange={set('payoutMethod')}><option value="mpesa">M-Pesa (B2C to phone)</option><option value="paybill">Your PayBill / Till</option><option value="bank">Bank (PesaLink)</option></Select></Field>
          <Field label="Payout account"><Input value={f.payoutAccount} onChange={set('payoutAccount')} /></Field>
        </div>
        <Button variant="primary">Save</Button>
      </form>
      <div className="card flex gap-4 p-5">
        {org.verified ? <BadgeCheck className="size-6 shrink-0 text-info" /> : <ShieldCheck className="size-6 shrink-0 text-muted" />}
        <div><div className="font-semibold">{org.verified ? 'Verified organizer' : 'Get verified'}</div>
          <p className="mt-1 text-sm text-muted">Verified organizers get the blue badge on every event. Buyers trust it, and it’s how fake event pages are stopped. Send your business registration certificate and KRA PIN to the Pasi team.</p></div>
      </div>
      <Button variant="ghost" onClick={async () => { await post('/org/logout'); qc.setQueryData(['org-me'], null); }}><LogOut className="size-4" />Log out</Button>
    </div>
  );
}
