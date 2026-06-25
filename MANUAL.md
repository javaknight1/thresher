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

## Needed at M2 (do not set up yet — listed for planning)

### ☐ Clerk (auth) — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
### ☐ Supabase (Postgres) — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

---

## After every new key

1. Add the value to `.env.local` (for local dev).
2. Mirror the variable name (commented) in `.env.example` if it's new.
3. Push it to the deployed worker with `wrangler secret put <NAME>` before the
   next production deploy.
4. Tell Claude the key exists (not the value) so the integration gets wired
   and smoke-tested.
