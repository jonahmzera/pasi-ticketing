# Putting Pasi online: Vercel + Heroku + MongoDB Atlas (+ your own domain)

```
 fans ──► pasi.live ───────────/api──► fan API (Heroku, Basic dyno, always on) ───┐
                                                                                   ├──► MongoDB Atlas (free M0)
 staff ─► business.pasi.live ──/api──► business API (Heroku, Eco dyno) ───────────┘
```

| Piece | Where | Cost |
|---|---|---|
| Two websites | Vercel | Free |
| Two API servers | Heroku | About $12/month, covered by the student credit ($13/month for 24 months) |
| Database | MongoDB Atlas M0 | Free (the $50 student credit is for later, when you need a bigger cluster) |
| Domain | Name.com, Namecheap or .TECH, from the student pack | Free for the first year |

Each website forwards its own `/api` calls to its own server. Logins stay on the website's address, and the customer site never touches the business server.

`pasi.live` is used as the example domain below. Use whichever domain you claim.

---

## 0. Push the latest code

```powershell
git add -A
```

```powershell
git commit -m "Heroku deploy setup"
```

```powershell
git push
```

## 1. Claim the student offers

1. Open **education.github.com/pack** while signed in to GitHub, and confirm your student status shows as approved.
2. **Heroku:** create an account at **signup.heroku.com**. Then go to **heroku.com/github-students** and link your GitHub account to claim the credit.
   - Heroku asks for a card to verify the account. The credit pays the bill, but keep an eye on **Billing** to make sure the total stays under $13.
3. **Domain:** in the pack, open the **Name.com** offer (or Namecheap `.me`, or `.TECH`) and claim a free domain such as `pasi.live`.

## 2. Database: MongoDB Atlas (about 5 minutes)

1. Go to **mongodb.com/cloud/atlas/register** and sign up with Google or GitHub.
2. **Create a cluster**, choose **M0 / Free**, pick a region near Kenya (Cape Town or Frankfurt), and name it `pasi`.
3. **Database Access** → **Add New Database User**.
   - Username: `pasi-app`.
   - Click **Autogenerate Secure Password** and save the password somewhere safe.
4. **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`). Heroku servers don't have a fixed IP address, so the strong password is what protects the database.
5. **Connect** → **Drivers** → copy the link. Put your password in place of `<password>`, and add `pasi` before the `?`:
   `mongodb+srv://pasi-app:YOURPASSWORD@pasi.xxxxx.mongodb.net/pasi?retryWrites=true&w=majority`
   This is your **MONGODB_URI**. Keep it private.

## 3. Make your secret keys (one time, on your computer)

In the project folder, run each of these and save what they print:

```powershell
npx web-push generate-vapid-keys
```

That gives the **VAPID public key** and **VAPID private key** (for push notifications).

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run that one **twice**. The first result is your **TICKET_SECRET** (signs the ticket QR codes). The second is your **MPESA_CALLBACK_TOKEN** (proves M-Pesa callbacks are really from Safaricom's request).

Both servers must use **the same** values for all four keys.

## 4. API servers: Heroku (about 15 minutes)

You make **two Heroku apps from the same GitHub repo**. The `SERVICE` setting decides which server each one runs.

### 4a. The fan API

1. Heroku dashboard → **New** → **Create new app**. Name it e.g. `pasi-api`, region **Europe**.
2. **Settings** → **Reveal Config Vars**, and add:

   | Key | Value |
   |---|---|
   | `SERVICE` | `public` |
   | `NODE_ENV` | `production` |
   | `MONGOMS_DISABLE_POSTINSTALL` | `1` |
   | `MONGODB_URI` | your link from step 2 |
   | `TICKET_SECRET` | from step 3 |
   | `MPESA_CALLBACK_TOKEN` | from step 3 |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | from step 3 |
   | `VAPID_SUBJECT` | `mailto:` followed by your email |
   | `MPESA_MODE` | `simulate` (for now) |
   | `SEED_DEMO` | `true` (only for the first deploy, to load demo events; delete it afterwards) |

3. **Deploy** → **Deployment method: GitHub** → connect and choose `pasi-ticketing`.
   - Click **Enable Automatic Deploys** (branch `main`), then **Deploy Branch** once.
4. **Resources** → **Change Dyno Type** → **Basic**. Basic never sleeps, so buyers never wait and the payment checker keeps running.
5. Click **Open app** and add `/api/health` to the address. You should see `{"ok":true}`.
   Copy the app's address (it looks like `https://pasi-api-1a2b3c4d5e6f.herokuapp.com`).

### 4b. The business API

Same steps, with these differences:

- Name it e.g. `pasi-business-api`.
- `SERVICE` = `business`.
- Use the **same** `MONGODB_URI`, `TICKET_SECRET`, `MPESA_CALLBACK_TOKEN` and VAPID keys.
- Don't add `SEED_DEMO`.
- Dyno type **Eco** ($5/month, sleeps after 30 minutes idle; staff wait a few seconds on the first visit).

Copy this app's address too.

### 4c. Point the websites at the servers

Open these two files and replace the placeholder addresses with the real ones from 4a and 4b:

- `web/vercel.json`: replace `https://PASTE-FAN-API-ADDRESS-HERE.herokuapp.com` with the fan API address.
- `business/vercel.json`: replace `https://PASTE-BUSINESS-API-ADDRESS-HERE.herokuapp.com` with the business API address.

No slash at the end. Then commit and push.

## 5. Websites: Vercel (about 5 minutes)

1. Go to **vercel.com** and sign in with GitHub.
2. **Customer site:** **Add New** → **Project** → import `pasi-ticketing`. Set **Root Directory** to `web`, then **Deploy**.
3. **Business site:** import the **same repo** again. Set **Root Directory** to `business`, add the environment variable `VITE_FAN_URL` = `https://pasi.live`, then **Deploy**.

## 6. Your domain

1. In Vercel, open the **customer** project → **Settings** → **Domains** → add `pasi.live` (and `www.pasi.live` when it offers).
2. Open the **business** project → **Settings** → **Domains** → add `business.pasi.live`.
3. Vercel shows the DNS records to create. Go to your domain's DNS settings (Name.com → **My Domains** → your domain → **Manage DNS Records**) and add exactly what Vercel shows. It is usually:

   | Type | Host | Value |
   |---|---|---|
   | `A` | (blank or `@`) | `76.76.21.21` |
   | `CNAME` | `www` | `cname.vercel-dns.com` |
   | `CNAME` | `business` | `cname.vercel-dns.com` |

4. Wait until Vercel shows **Valid Configuration** next to each domain (from a few minutes up to a few hours). Vercel adds HTTPS by itself.

The Heroku servers don't need the domain. The websites reach them through `/api`.

## 7. Connect everything

On **both** Heroku apps → **Settings** → **Config Vars**, set:

- `PUBLIC_URL` = `https://pasi.live`
- `MPESA_CALLBACK_URL` = `https://pasi.live`

Heroku restarts both apps by itself. If you changed `VITE_FAN_URL` after the business site's first build, click **Redeploy** on that Vercel project.

## 8. Try it

- **Customer site** (`pasi.live`): buy a ticket. While `MPESA_MODE=simulate`, approve the payment at `https://pasi.live/simulator`.
- **Business site** (`business.pasi.live`): log in with `demo@pasi.test` / `demo12345` (only if you used `SEED_DEMO`; change it before real use), create and publish an event, and try the gate scanner at `/scan` on a phone.
- Delete `SEED_DEMO` from the fan API's config vars once the demo data is in.

## If something goes wrong

- **Heroku → More → View logs** shows the server's errors.
  - `MongoServerError: bad auth`: the password inside `MONGODB_URI` is wrong.
  - `connection timed out` to Atlas: step 2.4 (allow `0.0.0.0/0`) is missing.
- **The site loads but every action fails:** the address in `web/vercel.json` or `business/vercel.json` is wrong. Open `https://pasi.live/api/health`; it should say `{"ok":true}`.
- **Tickets from one server fail to scan on the other:** `TICKET_SECRET` differs between the two Heroku apps.

## Going live with real M-Pesa later

1. Get your PayBill or Till "go-live" approval on developer.safaricom.co.ke.
2. On **both** Heroku apps, set `MPESA_MODE=production` plus your real `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE` and `MPESA_PASSKEY`.
3. Safaricom reaches the fan server through `MPESA_CALLBACK_URL` (your domain).

**Before real customers use it**, set `SMS_PROVIDER=africastalking` plus `AT_USERNAME` and `AT_API_KEY` on the fan API. Until then, the login code is shown on screen for testing, which means anyone could sign in as any phone number.

## Optional student-pack extras

- **Sentry:** emails you when the live site throws an error. Ask and it can be wired in.
- **Doppler:** keeps the secret keys in one place and syncs them to both Heroku apps, instead of pasting them twice.
- **Atlas $50 credit:** apply it when you move off the free M0 cluster.
