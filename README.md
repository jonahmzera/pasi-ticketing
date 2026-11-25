# Pasi: event ticketing for Kenyan venues

Pasi is two completely separate systems that share one database:

| System | Folder | Dev address | What it is |
|---|---|---|---|
| **Fan app** | `web/` | http://localhost:5173 | An installable web app for people buying tickets. They discover events, pay by M-Pesa, and keep offline tickets, a profile, friends and squads. It shows a map, travel time and nearby stays. |
| **Business system** | `business/` | http://localhost:5174 | For venues and promoters. It covers events, ticket tiers, promo codes, analytics, guest lists, messages to attendees, the payment review queue, payouts and the **gate scanner** (`/scan`). |

On the server, each system has its own API server:

| Server | Port | Routes |
|---|---|---|
| Fan API | `PORT` = 4000 | `/api/events`, checkout, tickets, me, squads, the M-Pesa callback |
| Business API | `BUSINESS_PORT` = 4100 | `/api/org/*`, `/api/gate/*` only |

The fan app and the fan API contain **no business routes, links or code**. The business API tells search engines not to index it and refuses to be embedded in other sites. In production, deploy it on its own domain (for example `business.yourdomain.co.ke`) and, ideally, restrict it by IP or VPN. Use `SERVICE=public` or `SERVICE=business` to run each server as its own process.

`shared/` holds the design system (tokens, UI components, API client and types) that both front-ends use.

## Stack

| | |
|---|---|
| Front-ends | React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query, React Router, Motion, Lucide, Recharts, Leaflet, vaul, sonner. The fan app is also a PWA. |
| Backend | Node, TypeScript (run with tsx), Express 5, Mongoose (MongoDB) |
| Payments | Safaricom Daraja: STK push, STK query and verified callbacks |
| SMS | Africa's Talking. Without it, messages print to the console |

## Run it

```bash
npm install
npm run dev
```

`npm run dev` starts the API (both servers), the fan app on :5173 and the business app on :5174.

On first run, an embedded MongoDB starts (its data lives in `~/.pasi/mongo`) and the demo data is loaded:

| What | Where |
|---|---|
| Business login | `demo@pasi.test` / `demo12345` |
| Gate scanner | http://localhost:5174/scan. PIN `1234` |
| Fake M-Pesa phone | http://localhost:5173/simulator |

Other commands:

- `npm run seed` resets the demo data. Stop the API first.
- `npm run typecheck` typechecks everything.
- `npm run build && npm start` serves the built fan app on :4000 and the built business app on :4100.

## Plugging in real services

Copy `.env.example` to `.env`. Each section of that file says where to get the values: MongoDB Atlas, Daraja keys with an HTTPS callback tunnel, and Africa's Talking for SMS.

## How a payment is protected

1. **Checkout holds the seats** with an atomic conditional update, so two buyers can never get the last seat.
2. **One payment at a time.** Each phone can have only one payment in progress per event. There is also a rate limit and a per-phone ticket cap.
3. **The callback is checked before any ticket exists.** It must match our CheckoutRequestID and the exact amount, and its receipt must never have been used before. In live mode, Safaricom's STK Query must also confirm the payment. Anything that doesn't match goes to the business review queue.
4. **Tickets are minted exactly once.** They are HMAC-signed QR codes, and each one scans once.
5. **A background job covers missing callbacks.** It asks Safaricom about payments whose callback never arrived, and releases holds that have expired.
