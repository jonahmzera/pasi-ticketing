import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowRight, BadgeCheck, CalendarDays, MapPin, Search, Sparkles } from 'lucide-react';
import { api } from '@shared/api';
import type { EventCard as EventCardT } from '@shared/types';
import { fmtTime, ksh, relDay } from '@shared/utils';
import { CategoryIcon, EventCard } from '@shared/event';
import { FeaturedRing } from '@/components/featured-ring';
import { Badge, Empty, Segmented, Skeleton } from '@shared/ui';

type When = '' | 'today' | 'weekend' | 'week';

export default function Discover() {
  const [q, setQ] = useState('');
  const [when, setWhen] = useState<When>('');
  const [category, setCategory] = useState('');
  const dq = useDeferredValue(q);
  const params = new URLSearchParams(Object.entries({ q: dq, when, category }).filter(([, v]) => v)).toString();
  const { data: events, isLoading } = useQuery({ queryKey: ['events', params], queryFn: () => api<EventCardT[]>('/events?' + params) });
  const { data: cats } = useQuery({ queryKey: ['categories'], queryFn: () => api<{ category: string; count: number }[]>('/categories') });
  const { data: featured } = useQuery({ queryKey: ['events', ''], queryFn: () => api<EventCardT[]>('/events') });
  const filtering = !!(q || when || category);

  return (
    <div>
      {/* Hero */}
      <section className="relative mb-8 mt-2">
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="max-w-3xl text-[40px] font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
          Find your next <span className="font-display font-bold italic text-brand-soft">night out</span> in Kenya.
        </motion.h1>
        <p className="mt-4 max-w-xl text-[15px] text-muted sm:text-base">Pay with M-Pesa in two taps. Your ticket lands on your phone in seconds — and works even with no signal at the gate.</p>
        <div className="relative mt-6 max-w-2xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-subtle" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, venues, DJs, organizers…" aria-label="Search events"
            className="h-14 w-full rounded-2xl border border-line bg-surface pl-12 pr-4 text-base outline-none transition placeholder:text-subtle focus:border-brand focus:ring-4 focus:ring-brand/15" />
        </div>
      </section>

      {/* Featured: 3D ring + poster flow */}
      {!filtering && featured && featured.length > 0 && <FeaturedRing events={featured} />}

      {/* Filters */}
      <div className="sticky top-16 z-30 -mx-4 mb-6 space-y-3 bg-bg/80 px-4 py-3 backdrop-blur-xl">
        <Segmented<When> value={when} onChange={setWhen} options={[
          { value: '', label: 'Any time' }, { value: 'today', label: 'Tonight' }, { value: 'weekend', label: 'This weekend' }, { value: 'week', label: 'Next 7 days' },
        ]} />
        <Segmented value={category} onChange={setCategory} options={[
          { value: '', label: 'All' },
          ...(cats ?? []).map((c) => ({ value: c.category, label: <><CategoryIcon category={c.category} className="size-4" />{c.category}</> })),
        ]} />
      </div>

      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-bold tracking-tight">{filtering ? 'Results' : 'Coming up'}</h2>
        {events && <span className="text-sm text-muted">{events.length} event{events.length === 1 ? '' : 's'}</span>}
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[380px] rounded-3xl" />)}</div>
      ) : events?.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{events.map((e, i) => <EventCard key={e.id} e={e} index={i} />)}</div>
      ) : (
        <Empty icon={<CalendarDays />} title="Nothing matches yet">Try another date or category — new events are added every day.</Empty>
      )}
    </div>
  );
}
