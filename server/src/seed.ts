// Demo data so every screen has something to show. `npm run seed` wipes and reseeds.
// Organizer login: demo@pasi.test / demo12345 · Gate PIN for every demo event: 1234
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { Event, Order, Organization, Ticket, TicketType, User } from './models.js';
import { hashPassword, makeTicketCode, randId } from './util.js';

const DAY = 864e5;
/** days from today at hh:mm Nairobi time */
const at = (days: number, hour: number, min = 0) => {
  const e = new Date(Date.now() + 3 * 3600e3 + days * DAY); // Nairobi calendar date
  return new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate(), hour - 3, min));
};
const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=70`;

const EVENTS = [
  {
    title: 'Rooftop Amapiano Sundowner', category: 'Party', theme: 'sunset', days: 0, hour: 17, len: 8, sold: 0.72,
    venueName: 'Skyline Lounge, Westlands', address: 'Waiyaki Way, Westlands, Nairobi', lat: -1.2648, lng: 36.8025,
    poster: 'photo-1514525253161-7a46d19cd819', age: 18, dress: 'Smart casual', lineup: ['DJ Kaytrix', 'Sully Sounds', 'Nyokabi', 'MC Raz'],
    description: 'Sunset sets from four resident DJs on an open-air rooftop. Food stalls, a cocktail bar and the best view of the Nairobi skyline. Doors open at 5pm — arrive early for golden hour.',
    types: [['Early Bird', 800, 100], ['Regular', 1200, 300], ['VIP · fast lane + 1 drink', 3000, 60], ['Squad of 4', 4000, 40, 4]],
  },
  {
    title: 'Nairobi Street Food Festival', category: 'Food', theme: 'lime', days: 4, hour: 11, len: 10, sold: 0.45,
    venueName: 'Uhuru Gardens', address: 'Langata Road, Nairobi', lat: -1.3247, lng: 36.8137,
    poster: 'photo-1555939594-58d7cb561ad1', lineup: ['60+ vendors', 'Nyama choma pit', 'Live band from 3pm'],
    description: 'Over 60 vendors, a nyama choma pit, kids corner and a live band from 3pm. Every ticket includes two tasting tokens.',
    types: [['Adult', 1000, 1500], ['Child (under 12)', 300, 500], ['Family · 2 adults + 2 kids', 2400, 200, 4]],
  },
  {
    title: 'Comedy Night Live', category: 'Comedy', theme: 'violet', days: 2, hour: 19, len: 3, sold: 0.92,
    venueName: 'The Alchemist Bar', address: 'Parklands Road, Westlands, Nairobi', lat: -1.2603, lng: 36.8107,
    poster: 'photo-1585699324551-f6c309eedeca', age: 18, lineup: ['Six stand-ups', 'Hosted by Wanjiru K.'],
    description: 'Six of the funniest stand-ups in town, one mic, no mercy. Seating is first-come — front row tickets are limited.',
    types: [['Standard', 1000, 200], ['Front row', 2000, 30]],
  },
  {
    title: 'Jazz on the Lawn', category: 'Music', theme: 'ocean', days: 11, hour: 14, len: 6, sold: 0.24,
    venueName: 'Garden Hotel Lawns, Karen', address: 'Karen Road, Karen, Nairobi', lat: -1.3197, lng: 36.7076,
    poster: 'photo-1511192336575-5a79af67a629', lineup: ['The Karen Quartet', 'Amara Sings', 'Brass Collective'],
    description: 'An afternoon of live jazz with picnic spots, a wine bar and hotel brunch packages.',
    types: [['General', 2500, 400], ['Picnic table · 6 people', 13500, 30, 6], ['Brunch + Show', 4500, 80]],
  },
  {
    title: 'Coast Beach Rave', category: 'Festival', theme: 'sunset', days: 19, hour: 20, len: 8, sold: 0.12,
    venueName: 'Diani Beach Club', address: 'Diani Beach Road, Kwale', lat: -4.3176, lng: 39.5814,
    poster: 'photo-1470229722913-7c0e2dbbafd3', age: 18, lineup: ['4 DJs', 'Fire dancers', 'Sunrise set'],
    description: 'An all-night beach party with fire dancers and four DJs. Hotels and Airbnbs nearby — check the map.',
    types: [['Early Bird', 1500, 300], ['Regular', 2500, 1200], ['VIP Cabana · 4 people', 20000, 20, 4]],
  },
  {
    title: 'Founders & Funders Mixer', category: 'Networking', theme: 'ocean', days: 7, hour: 18, len: 3, sold: 0.5,
    venueName: 'The Loft, Kilimani', address: 'Ngong Road, Kilimani, Nairobi', lat: -1.2921, lng: 36.7856,
    poster: 'photo-1540575467063-178a50c2df87', lineup: ['Pitch session', 'Investor panel', 'Open bar'],
    description: 'Pitches, panels and drinks with founders and angel investors. Free entry — registration required.',
    types: [['Free RSVP', 0, 150]],
  },
  {
    title: 'Afro House Saturdays', category: 'Party', theme: 'violet', days: 5, hour: 21, len: 6, sold: 0.35,
    venueName: 'Kiza Lounge', address: 'Rhapta Road, Westlands, Nairobi', lat: -1.2681, lng: 36.8065,
    poster: 'photo-1501281668745-f7f57925c3b4', age: 21, dress: 'Dress to impress', lineup: ['Joy Gee', 'Boddhi Satva (guest)', 'Kenyan residents'],
    description: 'The weekly Afro House night. Free entry before 10pm with an Early ticket, tables for groups.',
    types: [['Early (before 10pm)', 500, 150], ['Regular', 1000, 400], ['Table for 6', 15000, 12, 6]],
  },
] as const;

const NAMES = ['Wanjiku', 'Otieno', 'Achieng', 'Kamau', 'Njeri', 'Mwangi', 'Chebet', 'Kiprop', 'Amina', 'Baraka', 'Zawadi', 'Juma', 'Atieno', 'Mutua', 'Wairimu', 'Omondi', 'Nyambura', 'Kibet'];
const FAIL = ['Request cancelled by user', 'DS timeout user cannot be reached', 'The balance is insufficient for the transaction'];

export async function seedIfEmpty(force = false) {
  if (!force && (await Organization.countDocuments({})) > 0) return;
  if (force) await mongoose.connection.db!.dropDatabase();

  const org = await Organization.create({
    name: 'Demo Venues Group', slug: 'demo-venues', kind: 'venue', email: 'demo@pasi.test', phone: '254700000001',
    passwordHash: hashPassword('demo12345'), verified: true, payoutAccount: '254700000001',
    bio: 'Rooftops, lawns and lounges across Nairobi and the coast.',
  });
  const phones = Array.from({ length: 1800 }, (_, i) => '2547' + String(10000000 + i * 4999).slice(0, 8)).sort(() => Math.random() - 0.5);
  let pi = 0;

  for (const e of EVENTS) {
    const startsAt = at(e.days, e.hour);
    const ev = await Event.create({
      org: org._id, title: e.title, slug: e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), description: e.description, category: e.category,
      venueName: e.venueName, address: e.address, lat: e.lat, lng: e.lng, startsAt, endsAt: new Date(startsAt.getTime() + e.len * 3600e3),
      theme: e.theme, posterUrl: img(e.poster), status: 'published', maxPerBuyer: 8, gatePin: '1234',
      ageLimit: 'age' in e ? e.age : undefined, dressCode: 'dress' in e ? e.dress : undefined, lineup: [...e.lineup],
      views: Math.round(500 + Math.random() * 3000), promos: [{ code: 'EARLY10', percentOff: 10, maxUses: 100, used: Math.floor(Math.random() * 25) }],
    });
    const orders: object[] = [];
    const tickets: object[] = [];
    for (const [i, t] of e.types.entries()) {
      const [name, price, quantity, admits = 1] = t as readonly [string, number, number, number?];
      const tt = await TicketType.create({ event: ev._id, name, price, quantity, admits, sort: i });
      let left = Math.floor(quantity * e.sold * (0.75 + Math.random() * 0.25));
      let sold = 0;
      while (left > 0) {
        const qty = Math.min(left, 1 + Math.floor(Math.random() * 3));
        left -= qty; sold += qty;
        const phone = Math.random() < 0.25 ? phones[Math.floor(Math.random() * 150)] : phones[150 + (pi++ % (phones.length - 150))];
        const holder = NAMES[Math.floor(Math.random() * NAMES.length)];
        const paidAt = new Date(Date.now() - Math.floor(Math.random() ** 2 * 21) * DAY);
        paidAt.setUTCHours([8, 12, 13, 18, 19, 20, 21, 22][Math.floor(Math.random() * 8)] - 3, Math.floor(Math.random() * 60));
        if (paidAt > new Date()) paidAt.setTime(Date.now() - 3600e3);
        const _id = new mongoose.Types.ObjectId();
        orders.push({
          _id, ref: randId(8), event: ev._id, phone, name: holder, status: 'paid', subtotal: qty * price, total: qty * price,
          items: [{ ticketType: tt._id, name, qty, unitPrice: price }], ...(price && { mpesaReceipt: 'S' + randId(9), checkoutRequestId: 'ws_CO_SEED_' + randId(12) }),
          resultCode: '0', resultDesc: 'Seeded', paidAt, createdAt: paidAt, updatedAt: paidAt,
        });
        for (let k = 0; k < qty; k++) tickets.push({ code: makeTicketCode(), order: _id, event: ev._id, ticketType: tt._id, typeName: name, admits, holderName: holder, holderPhone: phone, createdAt: paidAt });
      }
      await TicketType.updateOne({ _id: tt._id }, { sold });
      for (let k = 0; k < Math.ceil(quantity * 0.03); k++) {
        orders.push({ ref: randId(8), event: ev._id, phone: phones[(pi + k) % phones.length], name: 'Guest', status: 'failed', subtotal: price, total: price, items: [{ ticketType: tt._id, name, qty: 1, unitPrice: price }], resultDesc: FAIL[k % 3] });
      }
    }
    await Order.insertMany(orders);
    await Ticket.insertMany(tickets);
    // Tonight's event: doors open, a share of people already in.
    if (e.days === 0) {
      const all = await Ticket.find({ event: ev._id }, { _id: 1 }).lean();
      const n = Math.floor(all.length * 0.38);
      const ops = all.slice(0, n).map((t, i) => {
        const ts = new Date(startsAt.getTime() + (i / n) * 3 * 3600e3);
        return { updateOne: { filter: { _id: t._id }, update: { status: 'used', checkedInAt: ts > new Date() ? new Date(Date.now() - (n - i) * 15e3) : ts, checkedInGate: i % 2 ? 'Gate A' : 'Gate B' } } };
      });
      await Ticket.bulkWrite(ops);
    }
  }
  // A demo fan with friends, so squads have someone to invite.
  await User.create({ phone: '254711000111', name: 'Wanjiku', friends: [{ phone: '254722000222', name: 'Otieno' }, { phone: '254733000333', name: 'Achieng' }] });
  console.log('[seed] Demo data ready. Organizer: demo@pasi.test / demo12345 · Gate PIN: 1234');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { connectDb, disconnectDb } = await import('./db.js');
  await connectDb();
  await seedIfEmpty(process.argv.includes('--reset'));
  await disconnectDb();
}
