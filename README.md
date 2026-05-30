# FF panel sale official — Digital Goods Platform

A complete, secure, installable (PWA) digital-product selling store with wallet, referrals,
hosted bKash/Nagad payment verification (VerifyTaka), and a full admin panel.

Stack: Cloudflare Pages (static + Functions) + D1 (SQLite). No server, no domain bill —
you get a free `https://<project>.pages.dev` URL.

---

## 1. Prerequisites
- A free Cloudflare account
- Node.js 18+ installed locally
- `npm install -g wrangler` then `wrangler login`

## 2. Create the database
```
cd ffpanel
wrangler d1 create ffpanel
```
Copy the printed `database_id` into `wrangler.toml` (replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`).

Load the schema:
```
npm run db:init
```

## 3. Set secrets (Cloudflare → Pages → your project → Settings → Variables & Secrets)
Add these as **encrypted** variables (also works via `wrangler pages secret put <NAME>`):

| Name | Description |
|------|-------------|
| `SESSION_SECRET` | Long random string (sign session cookies). Generate: `openssl rand -hex 32` |
| `ADMIN_SETUP_KEY` | Secret used once on `/setup.html` to create the first admin |
| `VT_SECRET_KEY` | Your VerifyTaka secret key (`vt_sk_...`) — server-side only |
| `VT_WEBHOOK_SECRET` | VerifyTaka shop webhook secret (verifies redirect + webhook signatures) |
| `SITE_URL` | Your deployed URL, e.g. `https://ffpanel.pages.dev` (no trailing slash) |

## 4. Deploy
```
npm run deploy
```
Wrangler prints your live URL. Bind the D1 database to the Pages project
(Settings → Functions → D1 bindings → variable name `DB` → database `ffpanel`) if not auto-bound.

## 5. First-time setup
1. Open `https://<your-site>/setup.html`
2. Enter your `ADMIN_SETUP_KEY`, admin name, email, password → **Create Admin**
3. Log in at `https://<your-site>/admin.html`

## 6. Configure VerifyTaka
In the VerifyTaka dashboard set the **webhook URL** to:
```
https://<your-site>/api/webhook/verifytaka
```
and the **webhook secret** equal to your `VT_WEBHOOK_SECRET`.
The `payment.verified` webhook is the source of truth for fulfillment; the signed
success redirect (`/api/checkout/return`) is HMAC-verified as a second layer.

---

## Admin panel
`/admin.html` → Dashboard, Products, Packages + Stock keys, Orders, Users (balance/ban),
Promo codes, Categories, and full Site Settings (name, colors, logo, payment numbers,
referral %, footer). Everything is editable without touching code.

## Security summary
- PBKDF2-SHA256 password hashing (150k iterations, per-user salt)
- HMAC-signed httpOnly + Secure + SameSite=Strict session cookies
- 100% parameterized SQL (no injection surface)
- Admin routes guarded by role check on every request
- Payment: secret key never leaves the server; redirect + webhook HMAC verified;
  txn_id uniqueness + idempotent fulfillment (no double-credit / replay loophole)
- Strict CSP, X-Frame-Options DENY, HSTS, nosniff
- Per-IP rate limiting on auth, orders, and funding
