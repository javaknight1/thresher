# Thresher

Technical confluence desk: ticker + timeframe in → a complete trade story out
(entry, stop, target, reasoning, expected outcomes, confidence) — **or an honest
refusal**. Refusing bad trades is the product: most tickers on most days should
produce NO TRADE, with the failed gate named.

*A thresher separates grain from chaff. (Also a shark.)*

Currently personal-use software, built to production standards. US equities and
ETFs only; advisory and read-only — no order execution, no return predictions,
and confidence is labeled "signal agreement," never probability, until the
calibration pipeline ships.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Mental model](#2-mental-model)
3. [Repo layout](#3-repo-layout)
4. [The engine](#4-the-engine-packagesengine)
5. [The web app](#5-the-web-app-appsweb)
6. [Stack — what we interface with](#6-stack--what-we-interface-with)
7. [How a request flows, end to end](#7-how-a-request-flows-end-to-end)
8. [Running it locally](#8-running-it-locally)
9. [Testing](#9-testing)
10. [Conventions and gotchas](#10-conventions-and-gotchas)
11. [Status and roadmap](#11-status-and-roadmap)
12. [Where to start reading](#12-where-to-start-reading)

---

## 1. What it does

You enter a stock ticker and pick a timeframe (intraday / swing / position). The
engine analyzes price and volume history and returns one of two honest answers:

- **A trade plan** — direction (long/short), entry, stop, target, risk/reward,
  position sizing, and a confidence score, *plus* the full reasoning: four signal
  families (trend, momentum, volume, structure) each voting with written
  explanations, an itemized confidence breakdown, and a plain-English trade story.
- **A refusal** — "NO TRADE," naming the specific gate that failed and why. This
  is the whole point: most tickers most days should be refused rather than forced
  into a bad trade.

Around that, the Analyze page shows a price chart (candles, volume, moving
averages, level lines), the signature trade-ladder gauge, a full `/methodology`
documentation section explaining every formula, and a company context panel
(fundamentals, earnings, analyst targets, peers — clearly marked as external
context, separate from the engine's signal).

## 2. Mental model

Thresher is a **pure analysis engine** wrapped in a **thin web app**. The engine
(`packages/engine`) is deterministic TypeScript with zero I/O — you hand it price
bars and config, it hands back a trade plan or a refusal. The web app
(`apps/web`) is everything impure: it fetches market data, caches it,
rate-limits, and renders the UI.

The hard rule is that **all financial logic lives in the engine and nothing else
does**. That separation is what will let the backtester replay the exact code
users see.

## 3. Repo layout

A pnpm monorepo with two workspaces (`@thresher/engine`, `@thresher/web`).

| Path | What it is |
|---|---|
| `packages/engine/` | The confluence engine — pure TypeScript, zero runtime deps. Indicators → families → composite → confidence → plan → refusal gates. |
| `apps/web/` | Next.js app (App Router): the Analyze page, the `/api/v1/*` routes, and the public `/methodology` documentation pages. |
| `docs/THRESHER-DESIGN.md` | Architecture, API contract, frontend spec. |
| `docs/THRESHER-METHODOLOGY.md` | **Binding** spec for all engine math — every formula. The doc wins over code. |
| `reference/thresher.jsx` | The original single-file React prototype the production UI was ported from. |
| `.claude/` | Project skill that auto-loads the methodology spec during engine work. |
| `CLAUDE.md` | Binding conventions and hard rules for development. |
| `TODO.md` | Milestone roadmap (M0 → M4) with acceptance criteria. |
| `MANUAL.md` | Human setup steps: accounts and API keys that can't be automated. |
| `KICKOFF-PROMPT.md` | The original build brief. |

The web app depends on the engine via `workspace:*` (a local symlink, not a
published package).

## 4. The engine (`packages/engine`)

Pure functions only — **no network, no env vars, no `Date.now()`**. Time and
external facts (like earnings dates) are always passed in. Entry point:
`analyze(bars, config, context) → AnalysisResult`.

The pipeline maps directly to the source files:

```
OHLCV bars
  → indicators/      sma, ema, macd, rsi, atr, adx, obv, relative-volume,
  │                  bollinger, pivots   (snapshot.ts assembles them)
  → families/        trend, momentum, volume, structure
  │                  (each votes −1..+1 with a written reason per component)
  → composite.ts     weighted sum → direction (long/short/none at ±0.22)
  → confidence.ts    base score from |composite| minus itemized penalties
  → plan/            stop, target, sizing
  → gates.ts         G1–G5 refusal gates, evaluated in order
  → story.ts         the human-readable narrative
```

Everything is wired together in `analyze.ts`. **Every tunable number** (weights,
thresholds, ATR multipliers, penalty points) lives in `config.ts` — no magic
numbers in logic files — and the config is hashed (`configHash`) so any stored
analysis is reproducible. The only dependency is `technicalindicators`, and it's
**dev-only**, used to cross-check our indicator math in tests.

## 5. The web app (`apps/web`)

Next.js 15.5.2 (App Router), React 19, TypeScript strict. Three layers:

**`lib/` — data + service layer (where the real work is):**
- `contracts.ts` — the frozen interfaces everything implements
  (`MarketDataProvider`, `BarCache`, `ProfileCache`, `RateLimiter`). **Read this
  first.**
- `providers/` — `yahoo.ts` (real data), `mock.ts` (deterministic synthetic data
  for tests/offline), `select.ts` (picks one via the `THRESHER_PROVIDER` env).
- `cache.ts` / `profile-cache.ts` — Upstash Redis or in-memory, with
  stale-while-revalidate.
- `ratelimit.ts` — Upstash or in-memory.
- `guardrails.ts` — rejects untradeable junk (price < $2, avg dollar-volume < $1M).
- `analyze-service.ts` / `profile-service.ts` — the testable cores that wire data
  → engine → response, with **no HTTP objects**.
- `api-types.ts` / `config.ts` — API response shapes and web-layer constants.

**`app/api/v1/` — the HTTP shell:** `analyze/route.ts` and `profile/route.ts` are
thin — validate the query, rate-limit, delegate to the service. Both run on the
**Node runtime** (not edge — see gotchas).

**`app/` + `components/` — the UI:** `app/page.tsx` is the Analyze page (a client
component that fetches both endpoints in parallel). Components: the trade card,
the signature trade-ladder gauge, the price chart, family grid, trade story,
company panel, disclaimer. `app/methodology/*` renders the methodology doc into
~22 static documentation pages.

### API endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/analyze?symbol=&timeframe=` | The trade plan or refusal (design doc §8). |
| `GET /api/v1/profile?symbol=` | Display-only company fundamentals — separate so a flaky fetch never blocks the trade plan. |

Error codes: `400 INVALID_REQUEST`, `404 UNKNOWN_SYMBOL`, `422 UNTRADEABLE_SYMBOL`,
`429 RATE_LIMITED`, `503 DATA_UNAVAILABLE`.

## 6. Stack — what we interface with

| Concern | Tool | Status |
|---|---|---|
| Market data | **yahoo-finance2** v3 (free, no key) | ✅ live, behind `MarketDataProvider` |
| Charts | **lightweight-charts** v5 (TradingView) | ✅ |
| Methodology pages | **react-markdown** + remark-gfm | ✅ |
| Cache + rate limit | **Upstash Redis** (`@upstash/*`) | ⚙️ optional — in-memory fallback |
| Hosting | **Cloudflare** (via wrangler) | ⬜ not deployed yet |
| Auth | **Clerk** | ⬜ M2, not wired |
| Database | **Supabase** (Postgres) | ⬜ M2, not wired |
| Monitoring | Sentry / PostHog / BetterStack | ⬜ deferred (personal-use decision) |
| Unit/integration tests | **Vitest** | ✅ |
| E2E | **Playwright** | ✅ |

The important nuance: **the app runs with zero environment variables.** Upstash,
auth, etc. are optional with documented fallbacks (in-memory cache and rate
limiter). That's deliberate — this is personal-use software today, not a
multi-tenant SaaS.

## 7. How a request flows, end to end

Analyzing NVDA on the swing timeframe:

1. **Browser** (`app/page.tsx`) fires two parallel fetches: `/api/v1/analyze` and
   `/api/v1/profile`.
2. **Route** validates symbol/timeframe, then **rate-limits by IP** before any
   data work (protects the free Yahoo source).
3. **`runAnalysis`** calls `getBarsWithFreshness`: fresh cache hit, or
   serve-stale-and-refresh, or cold-fetch from Yahoo. Then **guardrails**
   (tradeable?), then a best-effort **earnings-date** lookup.
4. **`analyze()`** — the pure engine runs the whole pipeline.
5. The service assembles the response (engine result + freshness + chart data)
   matching the design doc's contract field-for-field.
6. The page renders the trade card, ladder, chart, story, families — or the
   NO-TRADE state. The company panel populates independently from the profile
   endpoint; if it fails, it just hides (never breaks the trade plan).

## 8. Running it locally

Prerequisites: **Node ≥ 20** and **pnpm ≥ 10** (`corepack enable` will provide
pnpm). No API keys or accounts are required.

```bash
# 1. install dependencies (once)
pnpm install

# 2. start the app → http://localhost:3000
pnpm --filter @thresher/web dev
```

Leave that dev server running; the app stays available at
`http://localhost:3000` for as long as it's up. If you ever see
**"NETWORK — Could not reach the analysis service"** in the UI, it just means the
dev server isn't running (nothing is listening on port 3000) — start it again.

### Offline / deterministic mode

Set `THRESHER_PROVIDER=mock` to swap in synthetic, seeded data (no network):

```bash
THRESHER_PROVIDER=mock pnpm --filter @thresher/web dev
```

Special mock symbols: `MOCKLONG` (emits a long), `MOCKCHOP` (refuses),
`MOCKUNKNOWN` (404), `MOCKCHEAP` (trips guardrails), `MOCKEARNINGS` (earnings in
the veto window).

### Environment variables (all optional)

Copy `.env.example` to `.env.local` (gitignored) and fill in only what you want.
With none set, the app uses in-memory cache and rate limiting.

| Variable | Effect when set |
|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Use Upstash Redis for cache + rate limiting instead of in-memory. |
| `THRESHER_PROVIDER=mock` | Use the deterministic mock data provider. |

See `MANUAL.md` for how to create those accounts when you want them.

### Other commands

```bash
pnpm typecheck && pnpm lint && pnpm test   # the gate — must pass for any change
pnpm --filter @thresher/web build          # production build
pnpm --filter @thresher/web e2e            # Playwright smoke (starts its own server)
pnpm --filter @thresher/engine test        # engine tests only
pnpm --filter @thresher/engine test:coverage
```

> Tip: in this Claude Code session you can run a shell command inline by prefixing
> it with `!` (e.g. `! pnpm --filter @thresher/web dev`).

## 9. Testing

- **Engine** — 22 files, 362 tests, ~97% line coverage. Golden-file
  cross-validation of every indicator against the `technicalindicators` package,
  hand-computed micro-fixtures for edge cases, the methodology doc's worked
  example reproduced exactly, plus property tests over many random market shapes.
- **Web** — 7 Vitest files (79 tests) over the services, cache, rate limiter,
  guardrails, providers, and methodology loader, all driven by the **mock
  provider** (tests never call Yahoo). Plus a Playwright smoke covering a trade
  plan, a refusal, and an unknown symbol.

`pnpm typecheck && pnpm lint && pnpm test` is the gate that must pass before any
change is considered done.

## 10. Conventions and gotchas

- **The methodology doc is law.** If code and `docs/THRESHER-METHODOLOGY.md`
  disagree, the doc wins. Never "improve" a formula, weight, or threshold without
  an explicit decision — they're versioned design choices.
- **Engine purity is enforced.** No I/O, no clock, no env in `packages/engine`.
  Constants go in `config.ts`. Every scoring component emits a human-readable
  reason string (a type-level requirement).
- **Refusals are results, not errors.** "NO TRADE" is a first-class output with a
  named failed gate.
- **Confidence is labeled "signal agreement," never "probability"** or "win
  rate," until calibration exists. Don't change that copy.
- **The disclaimer renders on every page with a trade plan**, and every
  engine-produced number deep-links to its `/methodology` page. (Company-panel
  fundamentals are the deliberate exception — external context, not deep-linked.)
- **API routes are Node runtime, not edge.** yahoo-finance2 v3 ships Deno-shimmed
  Node builds with no edge-safe entry, so it can't compile for Cloudflare's edge
  runtime. This is also why the standard `next-on-pages` adapter doesn't work —
  deployment needs the OpenNext Workers adapter (an open decision).
- **The local dev server isn't permanent.** Closing it (or ending a session that
  started it) leaves the UI unable to reach the API. Run `pnpm dev` yourself in a
  terminal you control for day-to-day use.

## 11. Status and roadmap

M0 (engine) and M1 (web app + live data + UI + methodology pages) are **done,
tested, and pushed** to `github.com/javaknight1/thresher` (branch `master`), with
a company fundamentals panel added on top. Verified end-to-end against live Yahoo
data. **Nothing is deployed yet** — blocked on the Cloudflare adapter decision
and account setup in `MANUAL.md`.

| Milestone | Scope | State |
|---|---|---|
| M0 — Engine | Pure confluence engine, fully tested | ✅ Done |
| M1 — Web app | Live data, Analyze page, API, methodology pages | ✅ Done |
| M2 — Accounts | Clerk auth, Supabase, watchlists, Scan page, history | ⬜ Not started |
| M3 — Honesty board | Outcome labeling, hit-rate tracking | ⬜ Not started |
| M4 — Calibration | Backtest pipeline, calibrated probabilities | ⬜ Not started |

See `TODO.md` for per-milestone acceptance criteria.

## 12. Where to start reading

`CLAUDE.md` → `docs/THRESHER-DESIGN.md` → skim `docs/THRESHER-METHODOLOGY.md` →
`packages/engine/src/analyze.ts` → `apps/web/lib/contracts.ts` →
`apps/web/lib/analyze-service.ts` → `apps/web/app/page.tsx`. That path takes you
from the rules, through the engine's spine, out to how the web app calls it.
