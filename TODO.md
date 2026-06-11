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

- [ ] `MarketDataProvider` interface + `YahooProvider` (yahoo-finance2): OHLCV per timeframe profile (design doc §2.2 lookbacks), earnings date via quoteSummary
- [ ] Upstash cache (`ohlcv:{symbol}:{interval}`, TTLs §2.1), stale-while-revalidate, stale-data warning passthrough
- [ ] Upstash rate limiting: 20/hr anon, 200/hr authed; 429 with reset time
- [ ] `GET /api/v1/analyze` matching design doc §8 schema exactly (incl. `engineVersion`, `configHash`, `dataFreshness`, `gates[]`, `refusal`)
- [ ] Error paths: UNKNOWN_SYMBOL 404, RATE_LIMITED 429, DATA_UNAVAILABLE 503 with stale fallback
- [ ] Analyze page per design doc §6.2: controls, trade card with stat tiles + basis captions, confidence bar with itemized penalties, trade ladder (signature element), TradingView Lightweight Charts (candles + SMA20/50 + level lines), trade story, signal family grid, disclaimer footer
- [ ] NO TRADE state as designed (§6.2): failed gate explanation, watched levels, family grid still renders
- [ ] Visual system tokens (§6.1): palette, Space Grotesk + IBM Plex Mono, responsive to mobile, visible focus states
- [ ] `/methodology/*` pages rendered from `docs/THRESHER-METHODOLOGY.md` content (route map in design doc §6.5); deep links from product numbers
- [ ] Sentry + PostHog + BetterStack wiring; Playwright smoke: analyze a liquid symbol, a refusal case, an unknown symbol
- [ ] Deploy to Cloudflare Pages

**Acceptance:** real ticker → correct full story in browser; refusal renders properly; methodology deep links work; all checks green.
**→ HARD STOP: human review + manual QA before M2.**

## M2 — Accounts and Scan

- [ ] Clerk auth (anonymous tier preserved), Supabase schema: `watchlists`, `saved_analyses`, `emitted_setups` (records every plan with engineVersion/configHash from day one)
- [ ] `POST /api/v1/scan` (≤50 symbols, authed, session-cached) + Scan page (§6.3): quality rank `(C/100)×RR`, refusal collapse count
- [ ] Save/load analyses; watchlist CRUD

## M3 — Honesty board

- [ ] Nightly outcome labeler (cron): first-touch labeling per methodology horizons (intraday 3d / swing 30d / position 26w), `outcomes` table
- [ ] History page (§6.4): hit rates by confidence bucket × timeframe, win/loss distributions; store refusals too (design doc §11.2: resolved YES)

## M4 — Calibration

- [ ] Backtest runner: walk-forward replay of `analyze()` (no lookahead), `backtest_runs`/`setups` tables
- [ ] Isotonic calibration table (n ≥ 300/bucket), versioned; UI shows calibrated hit rate alongside agreement score; G4 switches p to calibrated value
- [ ] Threshold tuning on train period, walk-forward validation; T1/T2 scale-outs; entry zones

## Parking lot (design doc §11)

- [ ] Universe guardrails: reject < $2 price or < $1M avg dollar volume — RECOMMENDED, confirm
- [ ] Free-tier scan limit (5 symbols?) — decide at M2
- [ ] Intraday data quality: ship swing/position first, gate intraday behind a data-quality check or Polygon — decide at M1