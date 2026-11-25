import mongoose, { Schema, type InferSchemaType, type Types } from 'mongoose';

const { ObjectId } = Schema.Types;
const opts = { timestamps: true } as const;

const UserSchema = new Schema({
  phone: { type: String, required: true, unique: true },
  name: String,
  friends: [{ _id: false, phone: String, name: String }],
  follows: [{ type: ObjectId, ref: 'Organization' }],
}, opts);

const SessionSchema = new Schema({
  token: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['user', 'org', 'gate'], required: true },
  subject: { type: ObjectId, required: true },
  gate: String,
  createdAt: { type: Date, default: Date.now, expires: 60 * 86400 },
});

const OtpSchema = new Schema({
  phone: { type: String, required: true, unique: true },
  code: String,
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, expires: 0 },
});

const OrganizationSchema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  kind: { type: String, default: 'venue' },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: String,
  passwordHash: { type: String, required: true },
  verified: { type: Boolean, default: false },
  bio: String,
  payoutMethod: { type: String, default: 'mpesa' },
  payoutAccount: String,
}, opts);

const EventSchema = new Schema({
  org: { type: ObjectId, ref: 'Organization', required: true, index: true },
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  category: { type: String, default: 'Party' },
  venueName: String,
  address: String,
  lat: Number,
  lng: Number,
  startsAt: { type: Date, required: true, index: true },
  endsAt: Date,
  posterUrl: String,
  theme: { type: String, default: 'sunset' },
  ticketStyle: { type: String, enum: ['stub', 'admit', 'boarding', 'holo'], default: 'stub' },
  status: { type: String, enum: ['draft', 'published', 'cancelled'], default: 'draft', index: true },
  maxPerBuyer: { type: Number, default: 10 },
  gatePin: String,
  ageLimit: Number,
  dressCode: String,
  lineup: [String],
  views: { type: Number, default: 0 },
  promos: [{ code: String, percentOff: Number, maxUses: Number, used: { type: Number, default: 0 } }],
}, opts);
EventSchema.index({ title: 'text', venueName: 'text', description: 'text' });

/** Inventory lives on its own document so holds can be taken atomically with a conditional $inc. */
const TicketTypeSchema = new Schema({
  event: { type: ObjectId, ref: 'Event', required: true, index: true },
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 0 },
  admits: { type: Number, default: 1 },
  sold: { type: Number, default: 0 },
  held: { type: Number, default: 0 },
  comps: { type: Number, default: 0 },
  salesStart: Date,
  salesEnd: Date,
  sort: { type: Number, default: 0 },
}, opts);

const OrderSchema = new Schema({
  ref: { type: String, required: true, unique: true },
  event: { type: ObjectId, ref: 'Event', required: true, index: true },
  user: { type: ObjectId, ref: 'User' },
  phone: { type: String, required: true, index: true },
  name: String,
  email: String,
  source: { type: String, enum: ['online', 'door'], default: 'online' },
  status: { type: String, enum: ['pending', 'processing', 'paid', 'failed', 'expired', 'review', 'refunded'], default: 'pending', index: true },
  items: [{ _id: false, ticketType: { type: ObjectId, ref: 'TicketType' }, name: String, qty: Number, unitPrice: Number }],
  subtotal: Number,
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  promoCode: String,
  merchantRequestId: String,
  checkoutRequestId: { type: String, index: { unique: true, sparse: true } },
  mpesaReceipt: { type: String, index: { unique: true, sparse: true } },
  paidPhone: String,
  resultCode: String,
  resultDesc: String,
  reviewReason: String,
  holdExpiresAt: Date,
  holdActive: { type: Boolean, default: false },
  lastQueryAt: Date,
  paidAt: Date,
}, opts);

const TicketSchema = new Schema({
  code: { type: String, required: true, unique: true },
  order: { type: ObjectId, ref: 'Order' },
  event: { type: ObjectId, ref: 'Event', required: true, index: true },
  ticketType: { type: ObjectId, ref: 'TicketType' },
  typeName: String,
  admits: { type: Number, default: 1 },
  holderName: String,
  holderPhone: { type: String, index: true },
  status: { type: String, enum: ['valid', 'used', 'void'], default: 'valid' },
  isComp: { type: Boolean, default: false },
  checkedInAt: Date,
  checkedInGate: String,
  replacedBy: String,
}, opts);

const ScanSchema = new Schema({
  event: { type: ObjectId, index: true }, code: String, result: String, gate: String, at: { type: Date, default: Date.now },
});

const MpesaLogSchema = new Schema({ kind: String, checkoutRequestId: String, payload: Schema.Types.Mixed }, opts);

const PlanSchema = new Schema({
  event: { type: ObjectId, ref: 'Event', required: true },
  creator: { type: ObjectId, ref: 'User' },
  title: String,
  meetPoint: String,
  leaveAt: String,
  members: [{ _id: false, phone: String, name: String, vote: { type: String, enum: ['going', 'maybe', 'no', null], default: null } }],
  messages: [{ phone: String, name: String, body: String, at: { type: Date, default: Date.now } }],
}, opts);
PlanSchema.index({ 'members.phone': 1 });

const PushSubSchema = new Schema({ endpoint: { type: String, unique: true }, user: ObjectId, sub: Schema.Types.Mixed }, opts);
const NotificationSchema = new Schema({ user: { type: ObjectId, index: true }, title: String, body: String, url: String, read: { type: Boolean, default: false } }, opts);

export const User = mongoose.model('User', UserSchema);
export const Session = mongoose.model('Session', SessionSchema);
export const Otp = mongoose.model('Otp', OtpSchema);
export const Organization = mongoose.model('Organization', OrganizationSchema);
export const Event = mongoose.model('Event', EventSchema);
export const TicketType = mongoose.model('TicketType', TicketTypeSchema);
export const Order = mongoose.model('Order', OrderSchema);
export const Ticket = mongoose.model('Ticket', TicketSchema);
export const Scan = mongoose.model('Scan', ScanSchema);
export const MpesaLog = mongoose.model('MpesaLog', MpesaLogSchema);
export const Plan = mongoose.model('Plan', PlanSchema);
export const PushSub = mongoose.model('PushSub', PushSubSchema);
export const Notification = mongoose.model('Notification', NotificationSchema);

export type EventDoc = InferSchemaType<typeof EventSchema> & { _id: Types.ObjectId };
export type TicketTypeDoc = InferSchemaType<typeof TicketTypeSchema> & { _id: Types.ObjectId };
export type OrderDoc = InferSchemaType<typeof OrderSchema> & { _id: Types.ObjectId };
export type OrgDoc = InferSchemaType<typeof OrganizationSchema> & { _id: Types.ObjectId };
export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: Types.ObjectId };
