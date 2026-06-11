# MANUAL.md — human setup steps

Things Claude cannot do for you: creating accounts, generating API keys, and
pasting secrets. Work top to bottom; each block says when it's needed and where
the keys go. **All keys go in `.env.local` (gitignored) — never commit them.**
Keep `.env.example` as the reference for variable names.

Status legend: ☐ todo · ☑ done (check items off as you complete them)

---

## Needed during M1 (blocking the API route going live)

### ☐ Upstash (Redis cache + rate limiting)
1. Create an account at https://upstash.com (free tier is fine for v1).
2. Create a **Redis database** (choose a region near your Cloudflare deployment,
   e.g. us-east-1; enable TLS — default).
3. From the database page, copy the **REST API** credentials (not the TCP ones):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Paste both into `.env.local`.

> Until these exist, the app runs with cache/rate-limit disabled (in-memory
> fallback, dev only). The API route works locally without Upstash.

### ☐ Cloudflare Pages (hosting)
1. Create a Cloudflare account at https://dash.cloudflare.com.
2. Install + authenticate wrangler locally: `pnpm dlx wrangler login`
   (opens a browser; needs your account).
3. Create the Pages project (one-time):
   `pnpm dlx wrangler pages project create thresher` (production branch: `master`).
4. In the Cloudflare dashboard → Pages → thresher → **Settings → Environment
   variables**, add the same variables as `.env.local` (Upstash, Sentry DSN,
   PostHog key) for Production (and Preview if you want).
5. Optional: connect the GitHub repo (javaknight1/thresher) for automatic
   deploys on push, or let Claude deploy via `wrangler pages deploy`.

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

## Needed at M2 (do not set up yet — listed for planning)

### ☐ Clerk (auth) — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
### ☐ Supabase (Postgres) — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

---

## After every new key

1. Add the value to `.env.local`.
2. Mirror the variable name (commented) in `.env.example` if it's new.
3. Add it to Cloudflare Pages → Settings → Environment variables before the
   next production deploy.
4. Tell Claude the key exists (not the value) so the integration gets wired
   and smoke-tested.
