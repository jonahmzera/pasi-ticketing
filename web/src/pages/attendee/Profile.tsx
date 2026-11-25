import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, Bell, BellRing, ChevronRight, LogOut, Trash2, UserPlus, Users } from 'lucide-react';
import { api, del, post, put } from '@shared/api';
import type { EventCard as EventCardT } from '@shared/types';
import { useAuth, useConfig, useMe } from '@/lib/hooks';
import { cn, prettyPhone } from '@shared/utils';
import { EventCard } from '@shared/event';
import { Avatar, Badge, Button, Empty, Field, Input, Skeleton } from '@shared/ui';

export function MePage() {
  const qc = useQueryClient();
  const { data: me, isLoading } = useMe();
  const { requireLogin } = useAuth();
  const { data: cfg } = useConfig();
  const { data: friends } = useQuery({ queryKey: ['friends'], enabled: !!me, queryFn: () => api<{ phone: string; name: string; onApp: boolean }[]>('/me/friends') });
  const [name, setName] = useState<string>();
  const [fName, setFName] = useState(''); const [fPhone, setFPhone] = useState('');
  const [pushOn, setPushOn] = useState(typeof Notification !== 'undefined' && Notification.permission === 'granted');

  if (isLoading) return <Skeleton className="h-60" />;
  if (!me) return (
    <div>
      <Empty icon={<Users />} title="Your Pasi account" action={<Button variant="primary" size="lg" onClick={() => requireLogin()}>Log in with phone</Button>}>
        Keep all your tickets, friends and squads in one place. No password — just your phone number.
      </Empty>
    </div>
  );

  async function enablePush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !cfg?.vapidPublicKey) return toast.error('Install the app to get notifications on this device');
      if ((await Notification.requestPermission()) !== 'granted') return toast.error('Notifications are blocked in your browser settings');
      const reg = await navigator.serviceWorker.ready;
      const key = Uint8Array.from(atob(cfg.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      await post('/push/subscribe', { subscription: sub.toJSON() });
      setPushOn(true); toast.success('Notifications on');
    } catch (e) { toast.error('Could not enable notifications: ' + (e as Error).message); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-4">
        <Avatar name={me.name || me.phone} className="size-16 text-xl" />
        <div><h1 className="text-2xl font-extrabold tracking-tight">{me.name || 'Hey there'}</h1><p className="text-muted">{prettyPhone(me.phone)}</p></div>
      </div>

      <Link to="/inbox" className="card flex items-center gap-3 p-4 transition hover:border-line-strong">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-3"><Bell className="size-5" /></span>
        <span className="flex-1 font-medium">Notifications</span>{!!me.unread && <Badge tone="hot">{me.unread} new</Badge>}<ChevronRight className="size-4 text-muted" />
      </Link>

      <div className="card flex items-center gap-3 p-4">
        <span className="grid size-10 place-items-center rounded-xl bg-surface-3"><BellRing className="size-5" /></span>
        <div className="flex-1"><div className="font-medium">Push notifications</div><div className="text-sm text-muted">New events from organizers you follow, ticket delivery, squad invites.</div></div>
        <Button size="sm" variant={pushOn ? 'secondary' : 'primary'} onClick={enablePush} disabled={pushOn}>{pushOn ? 'On' : 'Turn on'}</Button>
      </div>

      <div className="card p-4">
        <Field label="Your name">
          <div className="flex gap-2"><Input value={name ?? me.name ?? ''} onChange={(e) => setName(e.target.value)} />
            <Button className="h-12" disabled={name === undefined} onClick={async () => { await put('/me', { name }); setName(undefined); qc.invalidateQueries({ queryKey: ['me'] }); toast.success('Saved'); }}>Save</Button></div>
        </Field>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Friends</h2><span className="text-sm text-muted">{friends?.length ?? 0}</span></div>
        <div className="divide-y divide-line">
          {friends?.map((f) => (
            <div key={f.phone} className="flex items-center gap-3 py-2.5">
              <Avatar name={f.name || f.phone} className="size-9 text-xs" />
              <div className="min-w-0 flex-1"><div className="font-medium">{f.name || 'Friend'}</div><div className="text-xs text-muted">{prettyPhone(f.phone)}{f.onApp && ' · on Pasi'}</div></div>
              <button aria-label={`Remove ${f.name}`} className="grid size-9 place-items-center rounded-lg text-subtle hover:bg-danger/10 hover:text-danger" onClick={async () => { await del('/me/friends/' + f.phone); qc.invalidateQueries({ queryKey: ['friends'] }); }}><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
        <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={async (e) => {
          e.preventDefault();
          try { await post('/me/friends', { name: fName, phone: fPhone }); setFName(''); setFPhone(''); qc.invalidateQueries({ queryKey: ['friends'] }); toast.success('Friend added'); }
          catch (err) { toast.error((err as Error).message); }
        }}>
          <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Name" aria-label="Friend name" />
          <Input value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="07XX XXX XXX" inputMode="tel" aria-label="Friend phone" />
          <Button variant="primary" className="h-12"><UserPlus className="size-4" />Add</Button>
        </form>
      </div>

      <Button variant="ghost" block onClick={async () => { await post('/auth/logout'); qc.setQueryData(['me'], null); qc.invalidateQueries(); }}><LogOut className="size-4" />Log out</Button>
    </div>
  );
}

export function InboxPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['inbox'], queryFn: async () => { const r = await api<{ id: string; title: string; body?: string; url?: string; read: boolean; at: string }[]>('/me/notifications'); qc.invalidateQueries({ queryKey: ['me'] }); return r; },
  });
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">Notifications</h1>
      {isLoading ? <Skeleton className="h-40" /> : data?.length ? (
        <div className="card divide-y divide-line">
          {data.map((n) => (
            <Link key={n.id} to={n.url || '/'} className={cn('flex gap-3 p-4 transition hover:bg-surface-2', !n.read && 'bg-brand/5')}>
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand')} />
              <div><div className="font-medium">{n.title}</div>{n.body && <div className="text-sm text-muted">{n.body}</div>}<div className="mt-1 text-xs text-subtle">{new Date(n.at).toLocaleString('en-KE')}</div></div>
            </Link>
          ))}
        </div>
      ) : <Empty icon={<Bell />} title="All caught up">Follow organizers to hear about new events first.</Empty>}
    </div>
  );
}

export function OrgProfile() {
  const { slug = '' } = useParams();
  const qc = useQueryClient();
  const { requireLogin } = useAuth();
  const { data: o, isLoading } = useQuery({
    queryKey: ['org', slug],
    queryFn: () => api<{ id: string; name: string; kind: string; verified: boolean; bio?: string; followers: number; following: boolean; events: EventCardT[] }>('/orgs/' + slug),
  });
  if (isLoading || !o) return <Skeleton className="h-60" />;
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center gap-5 rounded-3xl border border-line bg-gradient-to-br from-surface-2 to-surface p-6">
        <Avatar name={o.name} className="size-20 text-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">{o.name}{o.verified && <BadgeCheck className="size-6 text-info" aria-label="Verified" />}</h1>
          {o.bio && <p className="mt-1 text-muted">{o.bio}</p>}
          <p className="mt-1 text-sm text-subtle">{o.followers} followers · {o.events.length} upcoming</p>
        </div>
        <Button variant={o.following ? 'secondary' : 'primary'} onClick={async () => { if (!(await requireLogin('Log in to follow'))) return; await post(`/orgs/${o.id}/follow`); qc.invalidateQueries({ queryKey: ['org', slug] }); }}>
          {o.following ? 'Following' : 'Follow'}
        </Button>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{o.events.map((e, i) => <EventCard key={e.id} e={e} index={i} />)}</div>
    </div>
  );
}
