# Putting Pasi online (free): Vercel + Render + MongoDB Atlas

```
 fans ──► pasi-xxx.vercel.app ──/api──► pasi-api.onrender.com ──┐
                                                                  ├──► MongoDB Atlas (free M0)
 staff ─► pasi-business-xxx.vercel.app ─/api─► pasi-business-api.onrender.com ┘
```

There are two websites (on Vercel) and two API servers (on Render), all sharing one database.

Each website forwards its own `/api` calls to its own server. Because of that, logins stay on the website's own address, and the customer site never touches the business server.

Sign in to all three services with **GitHub** (as jonahmzera). There are no new passwords to remember.

---

## 0. Push the latest code

Render and Vercel deploy straight from GitHub, so first push the latest version:

```powershell
git add -A
git commit -m "Deploy config, ticket designs, glass UI"
git push
```

## 1. Database: MongoDB Atlas (about 5 minutes)

1. Go to **mongodb.com/cloud/atlas/register** and choose **Sign up with Google** or GitHub.
2. **Create a cluster** and choose **M0 / Free**. Pick a region near Kenya; Cape Town or Frankfurt are good if they're listed. Name it `pasi`.
3. **Database Access** → **Add New Database User**.
   - Username: `pasi-app`.
   - Click **Autogenerate Secure Password** and copy the password somewhere safe.
4. **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`).
   - This is needed because Render's free servers don't have a fixed IP address.
   - The strong password from step 3 is what protects the database.
5. **Connect** → **Drivers** → copy the connection link. It looks like this:
   `mongodb+srv://pasi-app:<password>@pasi.xxxxx.mongodb.net/?retryWrites=true&w=majority`
6. Put your password in place of `<password>`, and add the database name `pasi` before the `?`:
   `mongodb+srv://pasi-app:YOURPASSWORD@pasi.xxxxx.mongodb.net/pasi?retryWrites=true&w=majority`
   This complete link is your **MONGODB_URI**. Keep it private.

## 2. Push-notification keys (one time, on your computer)

In the project folder, run:

```powershell
npx web-push generate-vapid-keys
```

Keep the **Public Key** and **Private Key** it prints. Both servers use this same pair.

## 3. API servers: Render (about 10 minutes)

1. Go to **render.com** and **sign in with GitHub**.
2. Click **New** → **Blueprint** and choose the `pasi-ticketing` repository. Render reads `render.yaml` and sets up **pasi-api** and **pasi-business-api**.
3. Render asks for the empty settings. Fill them in:

   | Setting | pasi-api | pasi-business-api |
   |---|---|---|
   | `MONGODB_URI` | your link from step 1 | the same link |
   | `PUBLIC_URL`, `MPESA_CALLBACK_URL` | leave blank for now (you'll fill these in step 5) | leave blank for now |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | from step 2 | the same pair |
   | `TICKET_SECRET`, `MPESA_CALLBACK_TOKEN` | Render generates these automatically | leave blank for now (filled in step 4) |

   You can leave the other settings (Daraja keys and the Africa's Talking key) blank for now.
4. After the first deploy, open **pasi-api** → **Environment** and copy the values of `TICKET_SECRET` and `MPESA_CALLBACK_TOKEN`. Paste them into **pasi-business-api** → **Environment**, then click **Save, rebuild and deploy**.
   - These two values **must match** on both servers: one signs the ticket QR codes, and the other checks M-Pesa callbacks.
5. **Optional, to start with demo data:** on pasi-api, add `SEED_DEMO` = `true` and deploy once. Then delete it.
6. Check each service's address (shown at the top of its page). They should be `https://pasi-api.onrender.com` and `https://pasi-business-api.onrender.com`.
   - If Render gave either one a different name, edit the matching `destination` in `web/vercel.json` or `business/vercel.json` before step 4. Then commit and push again.

## 4. Websites: Vercel (about 5 minutes)

1. Go to **vercel.com** and **sign in with GitHub**.
2. **Customer site:** **Add New** → **Project** → import `pasi-ticketing`.
   - Set **Root Directory** to `web`.
   - Click **Deploy**.
   - When it's done, copy its address, e.g. `https://pasi-xyz.vercel.app`.
3. **Business site:** **Add New** → **Project** → import the **same repo** again.
   - Set **Root Directory** to `business`.
   - Under **Environment Variables**, add `VITE_FAN_URL` = the customer site address from step 2.
   - Click **Deploy**.

## 5. Connect everything

On Render, open **pasi-api** and **pasi-business-api** → **Environment**. On both, set:
- `PUBLIC_URL` = the customer site address
- `MPESA_CALLBACK_URL` = the customer site address

Save, and both services redeploy.

## 6. Try it

- **Customer site:** buy a ticket. While `MPESA_MODE=simulate`, approve the payment at `https://<customer-site>/simulator`.
- **Business site:** log in, create an event, publish it, and use the gate scanner at `/scan` (it works with a phone camera).

## Things to know about the free tiers

- **Render free servers sleep after about 15 minutes of no visits.** The next visitor waits roughly 30 to 60 seconds while it wakes up.
  - Payment checks for missed M-Pesa callbacks also pause while it sleeps, and resume when it wakes.
  - **Before real ticket sales**, move **pasi-api** to Render's paid Starter plan (about $7/month) so it never sleeps.
- **Atlas M0** gives you 512 MB, enough for tens of thousands of orders. It slows down under heavy load rather than shutting off.
- **Built-in protection:**
  - per-IP limits on checkout, login and the gate PIN;
  - one M-Pesa payment in progress per phone;
  - a ticket limit per phone.

## Going live with real M-Pesa later

1. Get your PayBill or Till "go-live" approval on developer.safaricom.co.ke.
2. On **both** Render services, set `MPESA_MODE=production` plus your real `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE` and `MPESA_PASSKEY`.
3. Payment confirmations reach the fan server through your customer site address (`MPESA_CALLBACK_URL`).

Note: the demo M-Pesa phone (`/simulator`) only shows payment prompts started from the customer site. Door sales from the scanner need `MPESA_MODE=sandbox` or `production` to try them out.
