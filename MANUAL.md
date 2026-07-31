# MANUAL.md — human setup steps

Things Claude cannot do for you: creating accounts, generating API keys, and
pasting secrets. Work top to bottom; each block says when it's needed and where
the keys go. **All keys go in `.env.local` (gitignored) — never commit them.**
Keep `.env.example` as the reference for variable names.

Status legend: ☐ todo · ☑ done (check items off as you complete them)

---

## Needed during M1 (blocking the API route going live)

### ☑ Upstash (shared cache + rate limiting + scan board)
Backs the OHLCV cache, the fundamentals cache, the rate limiter, AND the Scan
board store. In production it's effectively **required**: without it each Worker
isolate has its own in-memory copy, so the board recomputes constantly and the
rate limit isn't actually enforced.
1. Create an account at https://upstash.com (free tier is fine).
2. Create a **Redis database** (region near your Cloudflare deployment; TLS on).
3. Copy the **REST API** credentials (not the TCP ones): `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`.
4. **Local:** paste both into `apps/web/.env.local`.
5. **Production:** add both as **runtime** Variables/Secrets on the Worker
   (Worker → Settings → Variables and Secrets) — **not** build vars. They're read
   at request time; build-only placement is the same mistake that 500'd Clerk.
   (URL as a var, TOKEN as an encrypted secret.)

> Without the keys the app still runs on in-memory fallbacks (fine for local/dev).

### ☐ Cloudflare (hosting — Workers via the OpenNext adapter)

The deploy path is **Cloudflare Workers** using `@opennextjs/cloudflare` (not
Pages — yahoo-finance2 can't run on the edge runtime that Pages requires). All
of this is already wired and verified locally; these are the account steps only
you can do. Run the commands from `apps/web/`.

1. Create a Cloudflare account at https://dash.cloudflare.com.
2. Authenticate wrangler: `pnpm dlx wrangler login` (opens a browser).
3. **Create the R2 cache bucket** (one-time — serves the prerendered
   `/methodology` pages):
   `pnpm exec wrangler r2 bucket create thresher-cache`
4. **Set up the custom domain `thresher.sharkfins.xyz`:** add `sharkfins.xyz` as
   a zone in the Cloudflare dashboard (Add a site → follow the steps to point its
   nameservers at Cloudflare). The worker's `routes` config attaches the
   subdomain automatically on deploy once the zone is active. *(If you'd rather
   ship first and add the domain later, tell me and I'll drop the route so it
   deploys to `thresher.<your-subdomain>.workers.dev`.)*
5. **Production secrets** (only if you set up Upstash above): push them to the
   worker — they are NOT read from `.env.local` in production:
   ```
   pnpm exec wrangler secret put UPSTASH_REDIS_REST_URL
   pnpm exec wrangler secret put UPSTASH_REDIS_REST_TOKEN
   ```
   Without these the deployed worker uses in-memory cache/rate-limit per isolate
   (fine for a few users; Upstash makes them shared and persistent).
6. **Deploy:** `pnpm --filter @thresher/web deploy`
   (runs the embed step, the OpenNext build, uploads the R2 cache, and publishes
   the worker). Re-run this command for every subsequent deploy.

## Deferred — monitoring (skip while this is personal-use, revisit if it becomes a real SaaS)

Per decision on 2026-06-10: no Sentry, PostHog, or BetterStack wiring for now.
When/if needed later:

- **Sentry** (errors): create a Next.js project at sentry.io → DSN →
  `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`.
- **PostHog** (analytics): create a project → `NEXT_PUBLIC_POSTHOG_KEY` +
  `NEXT_PUBLIC_POSTHOG_HOST`.
- **BetterStack** (uptime): dashboard-only — add a monitor on
  `https://<domain>/api/v1/analyze?symbol=SPY&timeframe=swing` after deploy.

---

## M2 — Clerk (authentication)

The code is wired and **conditional on the keys**: present → auth is enforced;
absent → the app runs open (so local CI / e2e are unaffected). Landing page is at
`/`, the app (Scan board) is at `/app`, and signed-in users are redirected `/` → `/app`.

### ☐ Local (Clerk **Development** instance)
1. Clerk dashboard → **Development** instance → **API Keys** → copy `pk_test_…` and `sk_test_…`.
2. Put them in `apps/web/.env.local` (see `.env.example` for the full block):
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
   CLERK_SECRET_KEY=sk_test_…
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/app
   NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/app
   ```
3. `pnpm --filter @thresher/web dev` → visit `/` → Get started → sign up a test user → land on `/app`.

### ☐ Production (Clerk **Production** instance, on Cloudflare)
1. Clerk dashboard → **Production** instance → **Domains** → set app domain
   `thresher.sharkfins.xyz`. Add the ~5 **DNS records** it shows (CNAMEs `clerk`,
   `accounts`, `clkmail`, two `clk._domainkey`) in **Cloudflare DNS** → wait "Verified".
2. **API Keys** → copy `pk_live_…` and `sk_live_…`.
3. In the **Cloudflare Workers build settings**:
   - Build-time variables (baked into the client bundle): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
     = `pk_live_…`, plus the four `NEXT_PUBLIC_CLERK_*` URL vars above.
   - Encrypted runtime secret: `CLERK_SECRET_KEY` = `sk_live_…`.
4. Push to `master` (triggers the build) → verify on `thresher.sharkfins.xyz`:
   logged-out shows the landing, sign-in works, signed-in lands on `/app`.

> Per-user rate limits (userId instead of IP) land with Upstash — the shared
> store is what makes them enforceable.

## ☐ Scan cron (board freshness)

The app reads the Top board from Upstash and never recomputes on a normal page
load (that's what stopped the "different results each reload" bug). A scheduled
job keeps those boards fresh via `GET /api/cron/scan?timeframe=…&key=CRON_SECRET`
(one call per candle size). The scheduler is a **GitHub Action**
(`.github/workflows/scan-cron.yml`, every 30 min during US market hours).

1. Pick a random secret (e.g. `openssl rand -hex 24`).
2. **Cloudflare:** add `CRON_SECRET` as a **runtime** Variable/Secret on the
   Worker (Settings → Variables and Secrets) so the endpoint can check it.
3. **GitHub:** repo → Settings → Secrets and variables → Actions → New secret →
   `CRON_SECRET` (same value).
4. Trigger the Action once manually (Actions tab → Refresh scan boards → Run
   workflow) to warm the boards, then it runs on schedule.

> Without `CRON_SECRET` the cron endpoint returns 503 and boards only refresh on
> the ↻ Refresh button (or a cold cache) — still stable, just not auto-fresh.

## Needed at M2 (do not set up yet — listed for planning)

### ☐ Supabase (Postgres) — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

---

## After every new key

1. Add the value to `.env.local` (for local dev).
2. Mirror the variable name (commented) in `.env.example` if it's new.
3. Push it to the deployed worker with `wrangler secret put <NAME>` before the
   next production deploy.
4. Tell Claude the key exists (not the value) so the integration gets wired
   and smoke-tested.
