# TODO.md — Thresher

Milestones from `docs/THRESHER-DESIGN.md` §10. Work top to bottom. Do not start a
milestone until the previous one's acceptance criteria all pass. HARD STOP for human
review after M0 and M1.

## M0 — Engine package (`packages/engine`) — pure, tested, spec-faithful

- [x] Monorepo scaffold: pnpm workspaces, TS strict, Vitest, ESLint, `packages/engine` + `apps/web` stubs
- [x] `config.ts`: all constants from methodology doc, `ENGINE_VERSION`, `configHash`, per-timeframe weight tables (design doc §4.2)
- [x] Types: `Bar`, `AnalysisResult`, `Family`, `Detail` (reason string required at type level), `Plan`, `Refusal`, `GateResult`
- [x] Indicators per methodology Part I: sma, ema, macd, rsi (Wilder), atr (Wilder), adx (+DI/−DI), obv delta, relVol, bollinger %B, pivot S/R (fractal w=5, 0.5×ATR zone merge, 0.4% nearest-level buffer, synthetic fallback flag)
- [x] Indicator golden tests: cross-validation vs `technicalindicators` + hand-computed micro-fixtures (seeding/smoothing edges)
- [x] Signal families per design doc §4.1 (component point tables, ADX multiplier, flags: choppy/rsiHot/rsiCold/thin)
- [x] Composite + direction (±0.22), confidence base + itemized penalties (methodology II.4)
- [x] Stop logic (II.5: 0.45 buffer, 0.8 floor, 2.2 cap) and target logic (II.6: 1.4 structure check, 2R/2.5×ATR projection, overheadWarning)
- [x] Gates G1–G5 (II.7), evaluated in order, first failure named; G5 takes `earningsDate` via context param (provider wires it in M1)
- [x] Sizing math (II.8) and story generator (assembles drivers, levels, caveats, penalty reasons)
- [x] **Worked-example fixture test**: methodology II.9 numbers reproduced exactly, plus counterfactual refusal at G2
- [x] Property tests: no NaN for any valid bar series; long ⇒ stop < entry < target (mirror short); emitted ⇒ all gates pass; refusal ⇒ named gate actually fails
- [x] Coverage ≥ 90%; `pnpm typecheck && pnpm lint && pnpm test` green

**Acceptance:** all above checked; engine README documents the public API.
**→ HARD STOP: human review of engine code + test output before M1.**

## M1 — Analyze page, live data, ship

- [x] `MarketDataProvider` interface + `YahooProvider` (yahoo-finance2): OHLCV per timeframe profile (design doc §2.2 lookbacks), earnings date via quoteSummary
- [x] Upstash cache (`ohlcv:{symbol}:{interval}`, TTLs §2.1), stale-while-revalidate, stale-data warning passthrough
- [x] Upstash rate limiting: 20/hr anon, 200/hr authed; 429 with reset time
- [x] `GET /api/v1/analyze` matching design doc §8 schema exactly (incl. `engineVersion`, `configHash`, `dataFreshness`, `gates[]`, `refusal`)
- [x] Error paths: UNKNOWN_SYMBOL 404, RATE_LIMITED 429, DATA_UNAVAILABLE 503 with stale fallback
- [x] Analyze page per design doc §6.2: controls, trade card with stat tiles + basis captions, confidence bar with itemized penalties, trade ladder (signature element), TradingView Lightweight Charts (candles + SMA20/50 + level lines), trade story, signal family grid, disclaimer footer
- [x] NO TRADE state as designed (§6.2): failed gate explanation, watched levels, family grid still renders
- [x] Visual system tokens (§6.1): palette, Space Grotesk + IBM Plex Mono, responsive to mobile, visible focus states
- [x] `/methodology/*` pages rendered from `docs/THRESHER-METHODOLOGY.md` content (route map in design doc §6.5); deep links from product numbers
- [x] ~~Sentry + PostHog + BetterStack wiring~~ (deferred 2026-06-11: personal use, no monitoring); Playwright smoke: analyze a liquid symbol, a refusal case, an unknown symbol — DONE
- [ ] Deploy to Cloudflare (pending: account setup per MANUAL.md + adapter decision — yahoo-finance2 is not edge-safe, so next-on-pages/Pages is out; OpenNext Workers adapter proposed)

**Acceptance:** real ticker → correct full story in browser; refusal renders properly; methodology deep links work; all checks green.
**→ HARD STOP: human review + manual QA before M2.**

## M2 — Accounts and Scan

- [ ] Clerk auth (anonymous tier preserved), Supabase schema: `watchlists`, `saved_analyses`, `emitted_setups` (records every plan with engineVersion/configHash from day one)
- [ ] `POST /api/v1/scan` (≤50 symbols, authed, session-cached) + Scan page (§6.3): quality rank `(C/100)×RR`, refusal collapse count
- [ ] Save/load analyses; watchlist CRUD
- [x] **Follows (demand-driven universe)** — v0.3.0: `FollowStore` (Supabase-over-PostgREST + in-memory), `/api/v1/follows` (cap `WEB_CONFIG.follows.maxPerUser`, Clerk-gated), follows feed `buildUniverse`, ★ toggle on Analyze + "Following" board tab + dashboard manager, default-watchlist seeding on onboarding.
- [ ] **In-app follow notifications** — notify a follower when a followed symbol *first* triggers a strong setup: `NotificationStore` + signal-transition detection in the cron + a header bell/feed. Deferred from v0.3.0 (depends on Supabase being live **and** a reliably-running cron — currently 500-prone on the CF free tier).

## M3 — Honesty board

- [ ] Nightly outcome labeler (cron): first-touch labeling per methodology horizons (intraday 3d / swing 30d / position 26w), `outcomes` table
- [ ] History page (§6.4): hit rates by confidence bucket × timeframe, win/loss distributions; store refusals too (design doc §11.2: resolved YES)

### Backtest / fact-check (the point of M3–M4)

The engine is pure so a backtester can replay `analyze()` with no lookahead. The
**"analyze as of a past time"** feature (shipped) is its interactive twin — the
single-shot "replay at time T" primitive the batch backtest loops over.

- [ ] **Batch backtester** — loop the as-of path over a **pre-declared** universe ×
  period (NOT the ad-hoc cache — that has selection bias), label first-touch
  target-before-stop per horizon, aggregate hit-rate by confidence bucket ×
  timeframe. Honesty guardrails: no lookahead, out-of-sample/walk-forward, n ≥ 300
  per bucket, and disclose execution costs (slippage/spread not in the R:R math).
- [x] **Point-in-time earnings capture (forward)** — *building now*: on every live
  analysis (on-demand + the scan cron) record the observed next-earnings **date**
  in an append-only `EarningsStore` (Upstash set per symbol + a symbol index). Over
  ~3–4 weeks this accumulates a real point-in-time earnings calendar, so a historical
  replay/backtest inside the captured window gets a **faithful G5** instead of
  "earnings unknown". Forward-only by nature — we accept no backtest of pre-capture
  history (free data has no clean historical announcement calendar).
- [ ] **Store the used earnings distance with each setup** *(needs `emitted_setups`,
  M2/Supabase)* — persist the exact `tradingDaysToEarnings` the engine used, so the
  backtester replays a setup with its true point-in-time value (no reconstruction).

## M4 — Calibration

- [ ] Backtest runner: walk-forward replay of `analyze()` (no lookahead), `backtest_runs`/`setups` tables
- [ ] Isotonic calibration table (n ≥ 300/bucket), versioned; UI shows calibrated hit rate alongside agreement score; G4 switches p to calibrated value
- [ ] Threshold tuning on train period, walk-forward validation; T1/T2 scale-outs; entry zones

## M5 — Crypto ✅ (shipped v0.15.0, 2026-09-24)

Spot coins (`BTC-USD`, …) on free Yahoo, **reusing the equity engine** (no second
package) via a tuned config + fractional sizing, in a dedicated crypto section. Binding
math = **methodology Part IV** (shipped). Plan: `~/.claude/plans/delightful-rolling-marble.md`.

- [x] **Phase 0:** methodology **Part IV — Crypto** + design amendments
  (§1.2, §2.2, §8.1, §10 M5). Constants green-lit; Part IV marked shipped.
- [x] **Phase 1 — engine:** `CRYPTO_CONFIG` (tuned weights/ATR mults, `earningsVetoTradingDays`
  all null, own hash); fractional sizing (`sizing.unitStep`/`unitLabel`; `Sizing.shares`→`units`);
  `ENGINE_VERSION` bump; worked-example fixture + fractional-sizing + config-parity tests; coverage ≥ 90%.
- [x] **Phase 2 — web data:** `lib/asset-class.ts` (`assetClassOf` + `engineConfigFor`);
  `WEB_CONFIG.crypto` (curated coins, samples, 24 h guardrails); `checkGuardrails(…, assetClass)`;
  analyze-service picks config + null earnings for coins; `yahoo.search()` include `CRYPTOCURRENCY`;
  MockProvider crypto fixtures.
- [x] **Phase 3 — product:** dedicated `/crypto` board + nav; unlimited namespaced crypto follows;
  Analyze adapts (CryptoPanel, no market-closed hint); fractional `PositionSizer`/`lib/position-size`.
- [x] **Phase 4 — methodology pages:** generalized `SECTION_HEADING` to `[IVX]+`; added `crypto`
  MethodologyPart + SLUG_MAPS + `app/methodology/crypto/[slug]`; crypto grid + Disclaimer caveat;
  stripped all repo/impl/hosting references from the public methodology content (math-only).

## Settings & Preferences (planned 2026-09-16)

A user-facing **Preferences** surface. Framing so anyone can pick this up:

- **Clerk already owns "account"** — name, email, password, connected accounts,
  active sessions, sign-out all live in the Clerk `UserButton` (rendered by
  `components/AuthNav.tsx`). Don't rebuild those; this section is Thresher's own
  *preferences*, plus a couple of account actions Clerk doesn't surface nicely.
- **HARD RULE — no engine knobs.** Settings may change *display/convenience*
  only, never engine math (weights, thresholds ±0.22 / conf 35 / RR 1.2 / G4
  0.25, ATR multipliers, penalties). Those are versioned design decisions
  (`packages/engine/src/config.ts`, CLAUDE.md). There is deliberately no
  "tune the strategy" control.
- **Storage strategy (no new infra for the first cut):** persist signed-in
  prefs in **Clerk `unsafeMetadata.prefs`** — the same pattern already used for
  `onboardedAt` (see `components/OnboardingGate.tsx`). In open/keyless mode (no
  Clerk keys — CI/e2e/zero-env) fall back to **localStorage**. Wrap both behind
  a `lib/prefs` client helper (`usePrefs()` / `setPref()`), mirroring
  `lib/follows-client.ts`. This needs **no Supabase and no paid services**.

### First cut — a `/settings` page + prefs helper (shipped)

- [x] **`lib/prefs` helper** — `usePrefs()` returning a typed `Prefs` object with
  defaults, and `setPref(key, value)` that writes to Clerk `unsafeMetadata.prefs`
  when signed in, else localStorage. Shared singleton like `follows-client`
  (useSyncExternalStore) so every consumer stays in sync. Define `Prefs` +
  defaults in `lib/config.ts` (`WEB_CONFIG.prefs.defaults`). Unit-test the
  merge/normalize logic.
- [x] **`/settings` route + entry points** — a protected page (add to
  `middleware.ts` `isProtected`), plus discoverable entry points: a "Settings"
  item in the profile menu (near `AuthNav`) **and** a command-palette action
  (`components/CommandPalette.tsx` NAV list) + `/settings` nav. Use the shared
  `PageHero`. Public/marketing pages unaffected.
- [x] **Default timeframe** (Hourly/Daily/Weekly = intraday/swing/position) —
  replaces the hardcoded `'swing'` default in `components/AnalyzeApp.tsx`
  (`useState<Timeframe>` initializer) and the board's default view. Read from
  prefs when the URL doesn't specify one. Acceptance: set Weekly → open
  `/analyze` with no `?timeframe=` → Weekly is selected.
- [x] **Position-sizer defaults** — account size + per-trade risk %. Currently
  the sizer (`components/PositionSizer.tsx`) stores these in localStorage keys
  `thresher:accountSize` / `thresher:riskPct`; **migrate those into `prefs`** so
  they follow a signed-in user across devices. Keep localStorage as the
  open-mode fallback. Acceptance: set them in Settings → they prefill the sizer
  on any analysis.
- [x] **Default board view** — starting sort key (Score/Quality/R:R/Agreement),
  direction filter, and min R:R for the Leaderboard. These are already URL
  params (`components/ScanApp.tsx`, `?tab/dir/minrr/sort`); prefs set the
  *initial* values when the URL omits them. Acceptance: default sort = R:R →
  open `/leaderboard` → board sorts by R:R.
- [x] **Theme toggle** — light / dark / **system**. The app is already
  theme-aware via CSS tokens (`app/globals.css`); add an explicit toggle that
  sets `data-theme` on `<html>` and persists to prefs (default: system /
  `prefers-color-scheme`). No palette rework needed — tokens already exist.
- [x] **Re-run onboarding / reset watchlist** — a button to replay the
  onboarding wizard (clear `unsafeMetadata.onboardedAt`, or reuse the
  `GuideIntroButton` mechanism) and a "reset to the default starter watchlist"
  action (re-seed `WEB_CONFIG.follows.defaultWatchlist` via the follows client).
- [ ] **Currency / number format** — how money is displayed (symbol + grouping)
  across the sizer, board, and watchlist. Small; display-only.

### Account actions (Clerk-adjacent)

- [ ] **Delete account / data** — surface Clerk's delete-account, and (once
  Supabase is live) also purge the user's follows/notifications rows. Danger-zone
  styling + confirm.

### Depends on deferred features (spec now, build when the feature lands)

- [ ] **Notification settings** *(needs the in-app notifications feature +
  Supabase/cron — see M2 "In-app follow notifications")* — channel (in-app now;
  email later via Resend), which triggers fire (new qualifying setup on a
  followed stock; earnings-in-window warning), a **min Setup Score to notify**
  threshold (a notification filter, NOT an engine change), digest cadence, and
  quiet hours.
- [ ] **Data & transparency** — toggle the data-freshness stamp; show the
  running `engineVersion` / `configHash` (trust/debug); choose a data source
  *once there's more than Yahoo* (Polygon/Tiingo — see `COSTS.md`).
- [ ] **Timezone** — used by the "as of" freshness stamps and the market-open
  hint (`lib/market-hours.ts` currently assumes ET). Default to the browser TZ.
- [ ] **Privacy & legal** — export my data (follows, saved analyses); analytics
  opt-out *(once PostHog lands)*; links to Terms / Privacy / Disclaimer and a
  re-acknowledge action. (Legal pages themselves are pre-Stripe work — see the
  payments discussion.)
- [ ] **Billing** *(needs Stripe)* — current plan/tier, payment method,
  invoices, upgrade / cancel. Slots in once billing exists.

## Parking lot (design doc §11)

- [x] Universe guardrails: CONFIRMED 2026-06-10 — enforced at the API layer as 422 UNTRADEABLE_SYMBOL
- [ ] Free-tier scan limit (5 symbols?) — decide at M2
- [x] Intraday data quality: DECIDED 2026-06-10 — ship intraday in v1 with the visible data-freshness stamp; revisit with Polygon in v2

### Deferred by the follow-driven model (decided 2026-09-14)

We chose a demand-driven architecture: each user follows ≤20 stocks, the scan
universe = the distinct union of all follows (cached once per symbol), and
notifications start **in-app only**. These three items were consciously deferred
out of that decision — build them after the follow model + in-app notifications
ship.

- [ ] **Discover / Top-movers board** — a global, non-personalized board (curated ∪ Yahoo movers) shown *alongside* each user's personalized "Following" board, so users can find hot stocks they don't already follow. Deferred when we chose the fully follow-driven model (no serendipitous discovery); revisit once follows land.
- [ ] **Email notifications (Resend)** — email a follower when one of their followed stocks *newly* triggers a strong setup (transition-gated, batched, with a cooldown); also unlocks a morning digest. Deferred in favor of in-app-only notifications. Adds the Resend service (see `COSTS.md` → "services to consider").
- [ ] **Mobile app** — a mobile client (PWA first, then native React Native/Expo if warranted) covering the board, Analyze, follows, and **push notifications** (which pair naturally with the follow model). Large effort; scope only after the web follow-model + notifications are proven.