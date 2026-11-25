export type Theme = 'sunset' | 'lime' | 'violet' | 'ocean';

export interface OrgRef { id: string; name: string; slug: string; verified: boolean }

export interface EventCard {
  id: string; slug: string; title: string; category: string; venueName: string; address?: string;
  lat?: number; lng?: number; startsAt: string; endsAt?: string; theme: Theme; posterUrl?: string; status: string;
  org: OrgRef | null; minPrice: number | null; soldOut: boolean; sellingFast: boolean;
}

export interface TicketTypeView {
  id: string; name: string; description: string; price: number; quantity: number; admits: number;
  remaining: number; state: 'on_sale' | 'sold_out' | 'not_started' | 'ended'; low: boolean; salesEnd?: string;
}

export interface EventDetail extends Omit<EventCard, 'org'> {
  description?: string; maxPerBuyer: number; ageLimit?: number; dressCode?: string; lineup: string[];
  ticketTypes: TicketTypeView[]; going: number; friendsGoing: string[];
  org: OrgRef & { kind: string; following: boolean };
}

export interface TicketLite {
  code: string; status: 'valid' | 'used' | 'void'; holderName?: string; typeName?: string; admits: number; checkedInAt?: string;
}
export interface EventLite { slug: string; title: string; venueName?: string; startsAt: string; theme: Theme; category?: string; posterUrl?: string; address?: string; lat?: number; lng?: number; endsAt?: string }

export interface OrderView {
  ref: string; status: 'pending' | 'processing' | 'paid' | 'failed' | 'expired' | 'review' | 'refunded';
  total: number; subtotal: number; discount: number; phone: string; receipt: string | null; message: string | null; review: string | null;
  holdExpiresAt?: string; event: EventLite; items: { name: string; qty: number; unitPrice: number }[]; tickets: TicketLite[];
}

export interface Me { id: string; phone: string; name: string | null; unread: number }

export interface PlanView {
  id: string; title: string; meetPoint?: string; leaveAt?: string; event: EventCard;
  members: { name: string; vote: 'going' | 'maybe' | 'no' | null; hasTicket: boolean; me: boolean; onApp: boolean }[];
  messages: { id: string; name: string; body: string; at: string; mine: boolean }[];
}

export interface AppConfig { mpesaMode: string; simulated: boolean; vapidPublicKey: string; feePct: number }
