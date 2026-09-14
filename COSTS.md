# COSTS.md — Thresher service pricing & scaling reference

A living reference for the paid services Thresher depends on: what each one
costs, how its pricing works, how **we** use it, why the free tier stops being
enough as real users arrive, and what the alternatives are.

> ⚠️ **Verify before you pay.** All dollar figures below are approximate and
> reflect pricing as of **early 2026**. These providers restructure plans
> frequently — always confirm on the linked pricing page before committing.
> Each section links to the source of truth.

> 💡 **Solo-use reality check.** If Thresher stays a tool for **one person (you)**,
> every service below comfortably fits its **free tier** and the monthly cost is
> effectively **$0**. Everything in this doc is about the moment real users
> arrive. See [When does each free tier actually break?](#when-does-each-free-tier-actually-break) at the bottom.

---

## 1. Cloudflare (hosting + edge storage)

Pricing page: https://developers.cloudflare.com/workers/platform/pricing/

### Pricing model

Cloudflare Workers bills on **two axes**: number of **requests** and **CPU
time** (actual compute milliseconds, *not* wall-clock — time spent waiting on
network I/O like a Yahoo fetch is **not** billed). There are only two Workers
plans, and the paid one is a low flat base + usage overage.

| Plan | Base cost | Included | Overage | Key per-request limits |
|---|---|---|---|---|
| **Workers Free** | $0 | 100,000 requests/day, 10 ms CPU/request | — (hard stop at limits) | **50 subrequests**, 10 ms CPU, 128 MB memory |
| **Workers Paid** | **$5/mo** | 10 M requests/mo + 30 M CPU-milliseconds/mo | $0.30 per additional 1 M requests · $0.02 per additional 1 M CPU-ms | **1,000 subrequests**, up to **30 s CPU** (configurable), 128 MB memory |

**Context that isn't obvious:**
- The **$5/mo is a floor, not a ceiling** — it includes a generous allotment;
  you only pay more if you blow past 10 M requests or 30 M CPU-ms in a month.
  For a small app, effective cost stays right at **$5/mo**.
- The number that matters for us is **not** price — it's the **50 → 1,000
  subrequest jump** and the **10 ms → 30 s CPU jump**. Those are the hard walls
  the free tier puts on us (see below).
- **R2** (object storage — we use it for the incremental cache) is billed
  separately: free tier is 10 GB storage + 1 M Class-A + 10 M Class-B ops/month,
  then $0.015/GB-mo storage with **$0 egress**. We are nowhere near this; R2
  stays effectively free for a long time.
- **Workers Builds** (the git-connected CI that deploys on push to `master`)
  has its own free build-minute allotment; not a concern at our cadence.

### How we use it & why free stops working

Cloudflare **is** Thresher's host — the Next.js app runs as a Worker via the
OpenNext adapter, R2 serves the prerendered `/methodology` pages, and Workers
Builds auto-deploys every push to `master`.

The wall we hit is the **50-subrequest limit per request**, and this is the
single most important cost fact in this whole doc:

- Each symbol we analyze fans out into several Yahoo fetches (bars + profile +
  earnings). Scanning a universe of stocks multiplies that.
- **This limit is per-invocation, not per-user** — so it bites even if *you're
  the only user*. It's why `scan.maxUniverse` is capped at **20** and why the
  intraday cron endpoint intermittently **500s** (15-min bar TTL means bars are
  always cold, so every scan re-fetches and blows the subrequest budget).
- Workers Paid raises this to **1,000 subrequests** and CPU to **30 s**, which
  is what unlocks growing the scan universe from 20 → hundreds of symbols and
  keeps the boards warm.

**So: the $5/mo Workers Paid upgrade is a *coverage* unlock, not a *traffic*
unlock.** We don't need it because of user volume; we need it to analyze more
than a handful of tickers per scan.

### What we'd actually be paying for
$5/mo buys: 20× the subrequest budget, 3,000× the CPU ceiling per request, and
10 M requests/mo of headroom. In practice we sit at the $5 floor for a long time.

### Alternatives to consider
- **Vercel** — the most natural Next.js host (Vercel builds Next). Free
  (Hobby) tier, then **Pro ~$20/mo/seat**. Downside: our data layer
  (`yahoo-finance2`) can't run on Vercel's Edge runtime — we'd use Node
  serverless functions, which have their own execution-time/cost model, and
  we'd lose the $0-egress R2 story. More expensive at scale.
- **Railway / Render / Fly.io** — run the app as a normal long-lived Node
  container (~$5–20/mo). **No 50-subrequest wall at all** — a big-universe scan
  just works. Trade-off: no global edge, you manage a server, cold starts /
  always-on billing. **Strong candidate specifically because it sidesteps the
  subrequest limit that's causing our scan pain.**
- **Stay on Cloudflare Free + shrink scope** — for solo use, keep
  `maxUniverse: 20`, turn the cron off, and refresh boards manually. **$0.**

---

## 2. Upstash (Redis: cache + rate limiting + scan-board store)

Pricing page: https://upstash.com/pricing

### Pricing model

Upstash Redis is **serverless Redis billed per command** (per read/write
operation), with an optional switch to **fixed monthly plans** once your volume
makes per-command billing more expensive than a flat fee. This is the least
simple pricing model of the three — read carefully.

| Plan | Cost | What you get | Notes |
|---|---|---|---|
| **Free** | $0 | ~10,000 commands/day, 256 MB max data, 1 DB region | Hard daily cap; fine for one user |
| **Pay-as-you-go** | ~$0.20 per 100K commands | 1 GB+ storage, higher throughput, no monthly minimum | You pay only for what you use — cheapest until volume is high |
| **Fixed 250 MB** | ~$10/mo | Higher/flat command allowance, 250 MB, better throughput & support | Flat fee — predictable; worth it once PAYG would exceed ~$10 |
| **Fixed 1 GB / Pro** | ~$20+/mo and up | More storage, more throughput, multi-region options | Scale tier |

**Context that isn't obvious:**
- Billing is **per command**, and Thresher issues a lot of small ones (every
  cache `GET`/`SET`, every rate-limit check is ≥1 command). Command *count*, not
  data *size*, is usually what pushes you off free.
- The **free tier's hard limit is ~10K commands/day** — a busy day with many
  users hits that fast, and when it's exhausted the cache silently degrades.
- **Bandwidth** can be billed separately above a free allotment (~$0.03/GB) —
  minor for us (payloads are small JSON boards), but it exists.
- The move from PAYG → a Fixed plan is purely economic: once your monthly
  per-command bill would exceed the flat plan, switch to the flat plan.

### How we use it & why free stops working

Upstash is Thresher's **shared state layer** — without it, every Cloudflare
Worker isolate has its own in-memory copy and nothing is actually shared. We use
it for **four** things:
1. **OHLCV bar cache** (cuts Yahoo fetches — directly eases the Cloudflare
   subrequest problem).
2. **Company-fundamentals cache.**
3. **Rate limiter** (per-user / per-IP request throttling — only *enforceable*
   because the counter is shared across isolates).
4. **Scan-board store** (`thresher:scan:{timeframe}`) — the cron writes the
   computed board here; page loads read it. This is what fixed the
   "3 reloads, 3 different results" bug.

Why free breaks with real users: the **10K-commands/day** cap. Every page view
does multiple cache reads + a rate-limit check; multiply by users and by the
cron's own reads/writes and you cross 10K/day quickly. When you do, caching and
rate-limiting quietly stop working — which then hammers Cloudflare subrequests
*and* Yahoo. The free tiers fail as a chain.

### What we'd actually be paying for
Predictable, always-on shared cache + rate limiting. PAYG (~pennies per 100K
commands) likely covers early growth; the **~$10/mo Fixed 250 MB** plan buys a
flat, worry-free allowance once traffic is steady.

### Alternatives to consider
- **Cloudflare KV / Durable Objects / Cache API** — since we're already on
  Cloudflare, native KV could hold the scan boards (eventually-consistent, cheap)
  and Durable Objects could do rate limiting. **Upside: one less vendor.**
  Downside: KV isn't Redis (no rich data types, weaker consistency), and rate
  limiting via DO is more code. Worth evaluating to consolidate.
- **Redis Cloud (Redis Inc.)** — free 30 MB tier, paid from ~$5/mo. Traditional
  connection-based Redis; less ideal for serverless/edge than Upstash's REST API.
- **Vercel KV** — literally Upstash under the hood; only relevant if we move to
  Vercel.
- **Momento** — serverless cache, generous free tier, similar niche.

---

## 3. Finance data API (market data provider)

### ⚠️ First, the important correction

Thresher currently uses **`yahoo-finance2`**, which is a **free, unofficial
scraper** of Yahoo Finance — **it has no paid tier at all.** So "upgrading our
finance API" does **not** mean paying Yahoo; it means **replacing** Yahoo with a
real, paid market-data provider that has an SLA. Everything below is about that
migration. The good news: everything sits behind our `MarketDataProvider`
interface, so swapping providers is a contained job that never touches the
engine.

### Why we can't stay on Yahoo

- **No SLA / no guarantees** — Yahoo can change endpoints and the library breaks
  (source of the intermittent failures you saw).
- **Delayed & best-effort** — intraday can lag ~15 min; the odd bad/garbage bar
  slips through and the engine faithfully analyzes it.
- **Terms-of-use / rate risk** — unofficial scraping isn't a foundation you want
  under a paid product with real users. It's fine for personal use; it's a
  liability for a business.

### Pricing model & tiers (primary recommendation: Polygon.io)

Pricing page: https://polygon.io/pricing

Polygon bills a **flat monthly subscription per data tier**; higher tiers add
real-time (vs delayed) data, deeper history, and websocket streaming. Paid tiers
give **unlimited API calls** (the free tier is the only rate-limited one).

| Tier | Cost | What you get |
|---|---|---|
| **Basic (Free)** | $0 | End-of-day data, **5 calls/min**, ~2 yrs history |
| **Stocks Starter** | ~$29/mo | **Unlimited calls**, 15-min-delayed data, ~5 yrs history |
| **Stocks Developer** | ~$79/mo | ~10 yrs history, more endpoints |
| **Stocks Advanced** | ~$199/mo | **Real-time** data, 15+ yrs history, websocket streaming |

**Context:** for Thresher, **Starter (~$29/mo)** is almost certainly the right
first paid tier — 15-min-delayed data is fine for a swing/position confluence
tool that labels itself as delayed, and **unlimited calls** removes the rate
anxiety entirely. Real-time (Advanced) only matters if we lean into intraday.

### How we use it & why free stops working

This is Thresher's **primary input** — every price bar the engine analyzes. The
free tier of a *real* provider (e.g. Polygon Basic at 5 calls/min) can't sustain
a multi-symbol scan: 20 symbols × several calls each blows a 5/min budget
instantly, even solo. Delayed data + unlimited calls is the unlock.

### What we'd actually be paying for
Clean, split/dividend-adjusted, SLA-backed OHLCV with unlimited calls — i.e. the
difference between "the math is exact but the inputs are hobby-grade" and
trustworthy analysis. **This is the single biggest accuracy lever in the app.**

### Alternatives to consider
| Provider | Free tier | Paid entry | Notes |
|---|---|---|---|
| **Tiingo** | Personal free (EOD + fundamentals, limited) | ~**$10/mo** (Power) | Cheapest solid option; great EOD + fundamentals. Commercial use needs a license. |
| **Alpaca Market Data** | Free **IEX** data | ~$99/mo (full SIP real-time) | You already list Alpaca as a broker — nice consolidation. Free IEX is usable. |
| **Twelve Data** | 800 req/day, 8/min | ~$29/mo+ | Broad coverage (stocks/FX/crypto), clean API. |
| **Finnhub** | 60 calls/min free | Paid tiers vary | Generous free rate; fundamentals + estimates. |
| **Alpha Vantage** | 25 req/day free | ~$50/mo+ | Popular but stingy free tier; fine as a fallback source. |
| **~~IEX Cloud~~** | — | — | **Shut down (2024) — do not use.** |

Recommendation: **Polygon Starter (~$29/mo)** as primary, or **Tiingo (~$10/mo)**
if minimizing cost; keep `yahoo-finance2` wired as a **free fallback** behind the
interface.

---

## Other services we already use (that you didn't list)

These are live in the app today. Most are free now and stay free for a good
while, but they have paid tiers worth knowing about.

| Service | What it does for us | Current cost | When it starts costing |
|---|---|---|---|
| **Clerk** | Authentication (sign-in/up, sessions, user metadata) | **Free** | Free up to **10,000 monthly active users**, then ~$25/mo + per-MAU. We're very far from this. |
| **logo.dev** | Company/brokerage logos on the board & analyze pages | **Free** (with required attribution) | Paid tiers remove attribution / raise limits. No need until we want to drop the footer credit. |
| **GitHub Actions** | The scan-board cron (`scan-cron.yml`) | **Free** | Free minutes are generous for public/small repos; our cron is tiny. |
| **Domain** (`sharkfins.xyz`) | The app's URL | ~**$10–15/yr** registrar fee | Already owned; annual, not monthly. |

---

## Services we should start to consider (not yet integrated)

Ordered by how soon they matter given the roadmap (payments, track record, digests).

| Service | Why / when | Pricing shape |
|---|---|---|
| **Stripe** | The moment we charge for anything. Payments + subscriptions. | No monthly fee; **~2.9% + 30¢ per transaction** (+ small fees for Billing/Tax). You keep ~97%. |
| **Supabase (Postgres)** | The **track-record / hit-rate board (M3)** — the trust + monetization keystone — needs a real database to store historical calls & outcomes. | Free tier (500 MB DB, limited); **Pro ~$25/mo** for production (backups, more storage, no pausing). |
| **Resend (or similar email)** | Morning digest / alerts — a top retention feature. Also transactional email (receipts, password flows Clerk doesn't cover). | Free ~3,000 emails/mo; paid from ~$20/mo. Alternatives: Postmark, SendGrid, AWS SES (cheapest at scale). |
| **Sentry** | Error monitoring once real users hit bugs you can't see. (Currently deferred per MANUAL.md.) | Free tier (limited events); Team ~$26/mo. |
| **PostHog** | Product analytics — what features people use, funnels, retention. Guides monetization. | Generous free tier (~1M events/mo); usage-based after. |
| **BetterStack** | Uptime monitoring + status page. | Free tier; paid from ~$25/mo. |

---

## When does each free tier actually break?

A blunt summary of the "why can't we just stay free" question:

| Service | Free-tier wall | What trips it | Solo? |
|---|---|---|---|
| **Cloudflare** | **50 subrequests / 10 ms CPU per request** | Scanning >~20 symbols, or keeping intraday boards warm | **Trips even solo** — it's per-request, not per-user |
| **Upstash** | **~10K commands/day** | Many users × (cache reads + rate-limit checks) + cron | Fine solo; breaks with traffic |
| **Finance API (Yahoo)** | No SLA, delayed, breakage, ToS risk | Real users depending on accurate data | Tolerable solo; a liability for a paid product |

**Bottom line:**
- **Solo, today:** stay 100% free (~**$0/mo**) — cap the universe at 20, quiet or
  disable the cron.
- **First real paid step (accuracy):** a finance data plan — **Tiingo ~$10/mo**
  or **Polygon ~$29/mo**.
- **First real paid step (scale/coverage):** **Cloudflare Workers Paid $5/mo**
  (unlocks the bigger scan universe + hot boards).
- **Upstash:** stay on free/PAYG until steady traffic, then **~$10/mo** flat.
- **Realistic "we have paying users" monthly baseline:**
  **Cloudflare $5 + Upstash ~$10 + Polygon ~$29 ≈ $44/mo**, before optional
  Supabase ($25), email ($20), and Stripe's per-transaction cut.

_Last reviewed: 2026-09 · figures approximate — reconfirm on each pricing page._
