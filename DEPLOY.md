# Putting Pasi online for free: Vercel + Render + MongoDB Atlas

```
 fans ──► pasi-xxx.vercel.app ──────/api──► pasi-api.onrender.com ────────────┐
                                                                              ├──► MongoDB Atlas (free M0)
 staff ─► pasi-business-xxx.vercel.app ─/api─► pasi-business-api.onrender.com ┘
```

| Piece | Where | Cost |
|---|---|---|
| Two websites | Vercel | Free, no card |
| Two API servers | Render | Free, no card |
| Database | MongoDB Atlas M0 | Free, no card |
| Your own domain (optional) | Name.com, Namecheap or .TECH, from the student pack | Free for the first year |

Each website forwards its own `/api` calls to its own server. Logins stay on the website's address, and the customer site never touches the business server.

Sign in to Render, Vercel and Atlas with **GitHub** (as jonahmzera), so there are no new passwords.

---

## 0. Push the latest code

Render and Vercel deploy straight from GitHub:

```powershell
git add -A
```

```powershell
git commit -m "Switch deploy to Render free, JMCreations credit"
```

```powershell
git push
```

## 1. Database: MongoDB Atlas (about 5 minutes)

1. Go to **mongodb.com/cloud/atlas/register** and sign up with Google or GitHub.
2. **Create a cluster**, choose **M0 / Free**, pick a region near Kenya (Cape Town or Frankfurt), and name it `pasi`.
3. **Database Access** → **Add New Database User**.
   - Username: `pasi-app`.
   - Click **Autogenerate Secure Password** and save the password somewhere safe.
4. **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`). Render's free servers don't have a fixed IP address, so the strong password is what protects the database.
5. **Connect** → **Drivers** → copy the link. Put your password in place of `<password>`, and add `pasi` before the `?`:
   `mongodb+srv://pasi-app:YOURPASSWORD@pasi.xxxxx.mongodb.net/pasi?retryWrites=true&w=majority`
   This is your **MONGODB_URI**. Keep it private.

## 2. Make your secret keys (one time, on your computer)

In the project folder, run each of these and save what they print in a private note:

```powershell
npx web-push generate-vapid-keys
```

That gives the **VAPID public key** and **VAPID private key** (for push notifications).

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run that one **twice**:
- the first result is your **TICKET_SECRET** (signs the ticket QR codes);
- the second is your **MPESA_CALLBACK_TOKEN** (checks that payment confirmations are genuine).

Both servers must use **the same** values for all four keys.

## 3. API servers: Render (about 10 minutes)

1. Go to **render.com** and **sign in with GitHub**. Render doesn't ask for a card for free services.
2. Click **New** → **Blueprint** and choose the `pasi-ticketing` repository. Render reads `render.yaml` and sets up **pasi-api** and **pasi-business-api**.
3. Render asks for the empty settings. Fill them in **the same on both services**:

   | Setting | Value |
   |---|---|
   | `MONGODB_URI` | your link from step 1 |
   | `TICKET_SECRET` | from step 2 |
   | `MPESA_CALLBACK_TOKEN` | from step 2 |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | from step 2 |
   | `PUBLIC_URL`, `MPESA_CALLBACK_URL` | leave blank for now (step 6) |
   | Daraja keys, `AT_API_KEY` | leave blank for now |

4. Click **Apply** and wait for both to show **Live** (the first build takes a few minutes).
5. **Optional, to start with demo events:** open **pasi-api** → **Environment**, add `SEED_DEMO` = `true`, and save. Once it has redeployed, delete `SEED_DEMO` again.
6. Check each service's address at the top of its page.
   - If they are exactly `https://pasi-api.onrender.com` and `https://pasi-business-api.onrender.com`, nothing to do.
   - If Render added extra letters (because the name was taken), put the real addresses in the `destination` lines of `web/vercel.json` and `business/vercel.json`, then commit and push.
7. Open `https://<pasi-api address>/api/health`. It should say `{"ok":true}`.

## 4. Websites: Vercel (about 5 minutes)

1. Go to **vercel.com** and **sign in with GitHub**.
2. **Customer site:** **Add New** → **Project** → import `pasi-ticketing`.
   - Set **Root Directory** to `web`, then **Deploy**.
   - Copy its address, e.g. `https://pasi-xyz.vercel.app`.
3. **Business site:** import the **same repo** again.
   - Set **Root Directory** to `business`.
   - Under **Environment Variables**, add `VITE_FAN_URL` = the customer site address from step 2.
   - Click **Deploy**.

## 5. Your own domain (optional, can be done later)

If you claimed a free domain from the student pack, e.g. `pasi.live`:

1. In Vercel, open the **customer** project → **Settings** → **Domains** → add `pasi.live` (and `www.pasi.live` when it offers).
2. Open the **business** project → **Settings** → **Domains** → add `business.pasi.live`.
3. Vercel shows the DNS records to create. Add exactly those at your domain's DNS settings (Name.com → **My Domains** → your domain → **Manage DNS Records**). Usually:

   | Type | Host | Value |
   |---|---|---|
   | `A` | (blank or `@`) | `76.76.21.21` |
   | `CNAME` | `www` | `cname.vercel-dns.com` |
   | `CNAME` | `business` | `cname.vercel-dns.com` |

4. Wait until Vercel shows **Valid Configuration** (minutes to a few hours). HTTPS is added for you.
5. Change `VITE_FAN_URL` on the business project to `https://pasi.live` and click **Redeploy**.

## 6. Connect everything

On Render, open **pasi-api** and **pasi-business-api** → **Environment**. On both, set:

- `PUBLIC_URL` = the customer site address (your domain, or the `vercel.app` one)
- `MPESA_CALLBACK_URL` = the same address

Save, and both services redeploy.

## 7. Try it

- **Customer site:** buy a ticket. While `MPESA_MODE=simulate`, approve the payment at `<customer site>/simulator`.
- **Business site:** log in with `demo@pasi.test` / `demo12345` (only if you used `SEED_DEMO`; change it before real use), create and publish an event, and try the gate scanner at `/scan` on a phone.

## If something goes wrong

- **Render → the service → Logs** shows the server's errors.
  - `MongoServerError: bad auth`: the password inside `MONGODB_URI` is wrong.
  - `connection timed out` to Atlas: step 1.4 (allow `0.0.0.0/0`) is missing.
- **The site loads but every action fails:** the address in `web/vercel.json` or `business/vercel.json` is wrong, or the server is still waking up. Open `<customer site>/api/health`; it should say `{"ok":true}`.
- **Tickets fail to scan at the gate:** `TICKET_SECRET` differs between the two Render services.

## Things to know about the free tier

- **Render free servers sleep after about 15 minutes with no visits.** The next visitor waits about 30 to 60 seconds while it wakes up. Payment checks for missed M-Pesa callbacks also pause while it sleeps, and resume when it wakes.
- That's fine for testing and showing people. **Before real ticket sales**, move **pasi-api** to an always-on plan (Render Starter about $7/month, or Heroku with your student credit once you have a bank card it accepts).
- **Atlas M0** gives you 512 MB, enough for tens of thousands of orders.
- **Built-in protection:** per-IP limits on checkout, login and the gate PIN; one M-Pesa payment in progress per phone; a ticket limit per phone.

## Before real customers

- **SMS:** set `SMS_PROVIDER=africastalking` plus `AT_USERNAME` and `AT_API_KEY` on pasi-api. Until then, the login code is shown on screen for testing, which means anyone could sign in as any phone number.
- **Real M-Pesa:**
  1. Get your PayBill or Till "go-live" approval on developer.safaricom.co.ke.
  2. On **both** Render services, set `MPESA_MODE=production` plus your real `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE` and `MPESA_PASSKEY`.
- The demo M-Pesa phone (`/simulator`) only shows payment prompts started from the customer site. Door sales from the scanner need `MPESA_MODE=sandbox` or `production` to try them out.
