# CRYPTO.md — Crypto Integration: Findings & Expectations

Working companion for adding **cryptocurrency** support to Thresher. Consolidates the
codebase findings, the locked decisions, the expected end-to-end behavior, and the build
plan. **Binding math lives in `docs/THRESHER-METHODOLOGY.md` Part IV** (proposed, awaiting
sign-off) — if this doc and Part IV ever disagree, **Part IV wins**. Companion to
`THRESHER-DESIGN.md` (§1.2, §2.2, §8.1, §10 M5).

Status: **Phase 0 (docs) written; awaiting sign-off before any engine change.**
Milestone: **M5 — Crypto** (ships *before* options, which is M6).

---

## 1. The headline finding

**Crypto is not a different kind of technical analysis.** The pure engine
(`packages/engine`) is ~99% asset-agnostic: every indicator (SMA/EMA/MACD/RSI/ATR/ADX/
OBV/RelVol/Bollinger/pivots), the four families, the composite `S`, direction, confidence,
the stop/target/R:R math, and refusal gates **G1–G4** operate on an abstract OHLCV series
keyed by epoch-ms and **never inspect the calendar**. Bars are `{ t, o, h, l, c, v }` and
the engine never reads wall-clock time.

➡️ **Crypto reuses the same engine** — there is **no second engine package** (unlike
options). It is a *config + a few web-layer branch points*, not new math.

---

## 2. Equity coupling — the complete inventory (what actually has to change)

The only equity-specific surface area, from a full sweep of `packages/engine/src` and
`apps/web`:

| # | Coupling | Where | Crypto handling |
|---|---|---|---|
| 1 | **Earnings gate G5 + penalty** | `gates.ts:122-148`, `analyze.ts:59-68`, `confidence.ts:77-80`, `config.ts` `earningsVetoTradingDays`, `types.ts` `Context.tradingDaysToEarnings` | **Off.** `earningsVetoTradingDays` all `null` (already = "flag-only, never veto"); pass `tradingDaysToEarnings: null`. **Already null-safe — no engine special-casing.** |
| 2 | **Whole-unit sizing** (`Math.floor` → "shares") | `packages/engine/src/plan/sizing.ts:18`; web `lib/position-size.ts:43` | **Fractional units.** Config `sizing.unitStep` (equity `1`, crypto `1e-6`) + `unitLabel`. The one real correctness bug: a $250 risk on a $60k coin floors to **0**. |
| 3 | **Session volume normalization** | `lib/config.ts` `guardrails.perDayFactor.intraday = 6.5` | **`24`** (24/7). Understates 24 h crypto volume ~3.7× otherwise. Web guardrail only, not engine math. |
| 4 | **Price floor guardrail** | `lib/guardrails.ts` (`minPrice = 2`) | **No floor** for crypto (legit sub-dollar coins); keep the dollar-volume floor (on soft volume). |
| 5 | **"US market closed" hint** | `lib/market-hours.ts` (`isUsMarketOpen`), used only at `ScanApp.tsx:194,306` | **Suppressed** for crypto (24/7). |
| 6 | **Equity-only search filter** | `lib/providers/yahoo.ts:187` (drops non-`EQUITY`/`ETF`) | Include `CRYPTOCURRENCY` so `BTC-USD` autocompletes. |
| 7 | **Fundamentals panel** | `components/CompanyPanel.tsx` (P/E, EPS, dividend, earnings, peers) | Swap for a **CryptoPanel** (name, 24 h range, market cap); the rest is N/A for coins. |
| 8 | **Equity universe** | `lib/config.ts` `scan.curated`, `moverScreens`, `follows.defaultWatchlist`; `scan-service.ts buildUniverse` | A curated **crypto** universe; Yahoo screens are equity-only (use the curated list for "movers"). |

Everything **not** in this table is reused verbatim.

### Already-good news (no change needed)
- **`SYMBOL_PATTERN`** (`lib/symbols.ts:8`, `/^[A-Z][A-Z.-]{0,9}$/`) **already admits
  `BTC-USD`**. `normalizeSymbol` uppercases (`btc-usd` → `BTC-USD` = Yahoo's exact form).
- **Yahoo `chart()` / `quote()` already serve crypto** natively at `1h`/`1d`/`1wk`.
- **`getDaysToEarnings`** returns `null` for coins (no earnings) — harmless.
- No market-session, halt, dividend, tick-size, or lot-size logic exists anywhere in the
  engine to fight.

---

## 3. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Data source** | **Free Yahoo** (`BTC-USD`, …) | Works today behind `MarketDataProvider`; $0. Paid feed (real-time, full universe, better volume) is a future drop-in behind the same seam. |
| **Product surface** | **Dedicated crypto section** | Its own `/crypto` board + curated coin universe, distinct from equities. Analyze also handles coins. |
| **Engine constants** | **Tuned crypto profile** | A deliberate, versioned `CRYPTO_CONFIG` (own hash), authored in the methodology doc. |
| **Process** | **Doc-first + sign-off** | Author Part IV + amend design; sign-off before any engine change (CLAUDE.md). |
| **Architecture** | **Reuse `packages/engine`** | One tuned config + fractional sizing. The web layer picks the config per symbol; the engine stays asset-agnostic. |

---

## 4. Expectations — the tuned `CRYPTO_CONFIG` (proposed priors)

Reasoned, **un-calibrated** priors (same status as the equity set); a future crypto
backtest tunes them. Departures from equity, with rationale.

**Family weights** (equity → crypto):

| Timeframe | Trend | Momentum | Volume | Structure |
|---|---|---|---|---|
| Hourly | 0.30 → **0.30** | 0.35 → **0.40** | 0.20 → **0.10** | 0.15 → **0.20** |
| Daily | 0.35 → **0.40** | 0.30 → **0.30** | 0.15 → **0.10** | 0.20 → **0.20** |
| Weekly | 0.45 → **0.50** | 0.20 → **0.20** | 0.10 → **0.10** | 0.20 → **0.20** |

*Volume is **down**-weighted* — crypto volume is unreliable (wash trading, fragmented
venues), so we trust the *data* less, leaning on price-derived evidence.

**ATR multipliers — wider, for fatter tails** (equity → crypto):

| Param | Equity | Crypto |
|---|---|---|
| `stop.bufferAtr` | 0.45 | **0.60** |
| `stop.floorAtr` | 0.80 | **1.00** |
| `stop.capAtr` | 2.20 | **3.00** |
| `target.projectionAtrMult` | 2.5 | **3.0** |

**Unchanged:** direction threshold `0.22`; confidence base `35`/slope `75`/cap `95`/floor
`5`; penalties (`earnings` inert); buckets `70`/`45`; gates `minConfidence 35`, `minRR
1.2`, `evMargin 0.25`; `target.projectionR 2`, `target.structureMinR 1.4`.

**Also in `CRYPTO_CONFIG`:** `earningsVetoTradingDays: { intraday: null, swing: null,
position: null }`; `sizing.unitStep = 1e-6`, `sizing.unitLabel = "units"`. Ships with its
own `cryptoConfigHash`, stamped into every result.

**Crypto web guardrails:** `perDayFactor { intraday: 24, swing: 1, position: 0.143 }`; no
`minPrice`; keep the `$1M/day` dollar-volume floor (on soft volume, caveated).

---

## 5. Expectations — the end-to-end story (UI → backend)

Trace of one coin (`BTC-USD`, Daily). The **bold** steps are the only new/branch points;
the rest is the existing equity pipeline.

1. **Entry points** — header "Crypto" → `/crypto` board; search/⌘K (**crypto now in
   `search()`**); Analyze via `/analyze?symbol=BTC-USD&timeframe=swing`.
2. **Route** — `app/api/v1/analyze/route.ts`: `SYMBOL_PATTERN` passes `BTC-USD`;
   rate-limit before provider work.
3. **Service** — `lib/analyze-service.ts` `runAnalysis`:
   - **① `assetClassOf('BTC-USD') → 'crypto'`** (`lib/asset-class.ts`, new)
   - ② bars via cache → `YahooProvider.getBars` (`chart()`, works for crypto)
   - **③ `checkGuardrails(bars, 'swing', 'crypto')`** → crypto guardrails
   - ④ min-bars (too-new coin → first-class "insufficient history", not a 500)
   - **⑤ skip earnings → `tradingDaysToEarnings: null`**
   - **⑥ `analyze(bars, CRYPTO_CONFIG, ctx)`**
4. **Engine** — same pipeline; `CRYPTO_CONFIG` changes weights/ATR-widths; **G5 passes
   flag-only**; **sizing returns fractional `units`**.
5. **Response** — equity shape, but `configHash = cryptoConfigHash`, `plan.sizing.units`
   fractional, no earnings veto.
6. **Render** — `AnalyzeApp.tsx`: TradeCard / Ladder / ConfidenceBar / FamilyGrid /
   TradeStory unchanged; **PositionSizer shows fractional units**; **CryptoPanel** replaces
   CompanyPanel; **no "market closed" hint**; Disclaimer gets a crypto data caveat; every
   number deep-links into **`/methodology/crypto/*`** (Part IV).
7. **Board** — `/crypto` → `scan-service.runScan` over the crypto universe with
   `CRYPTO_CONFIG` per symbol → ranked shortlist, no market-hours notice.

---

## 6. Build plan (phases)

Full plan: `~/.claude/plans/delightful-rolling-marble.md`. Mirror the engine's test
discipline (≥ 90 % coverage on new code; MockProvider only — never call Yahoo in tests).

- **Phase 0 — docs (BLOCKING):** methodology Part IV + design amendments. **Sign-off
  required before Phase 1.** ← *done, awaiting sign-off.*
- **Phase 1 — engine:** `CRYPTO_CONFIG` + fractional sizing (`unitStep`/`unitLabel`;
  `Sizing.shares` → `units`); `ENGINE_VERSION` bump; worked-example fixture (Part IV
  IV.9) + fractional-sizing + config-parity tests.
- **Phase 2 — web data:** `lib/asset-class.ts`; `WEB_CONFIG.crypto` (universe, samples,
  guardrails); `checkGuardrails(…, assetClass)`; analyze-service config selection;
  `yahoo.search()` include `CRYPTOCURRENCY`; MockProvider crypto fixtures.
- **Phase 3 — product:** `/crypto` board + nav; Analyze adaptation (CryptoPanel, hint
  suppression); fractional `PositionSizer` / `lib/position-size`.
- **Phase 4 — methodology pages:** generalize `SECTION_HEADING` (`I{1,2}` → `[IVX]+`);
  add `crypto` `MethodologyPart` + `SLUG_MAPS` + `app/methodology/crypto/[slug]`; crypto
  grid + Disclaimer caveat.

---

## 7. Risks & honest edges

- **Volume quality** — the biggest honesty risk; reported crypto volume is inflated/
  fragmented. Volume family is down-weighted and captioned as the softest input.
- **24/7 gap risk** — no close, but weekend liquidity thins; a gap can jump a stop. The
  **defined max risk** is what actually bounds the downside; the stop is not a guaranteed
  fill.
- **Un-calibrated priors** — confidence stays "signal agreement," never a win rate, until
  a crypto backtest exists (extend the M4 calibration pipeline to crypto).
- **Free-data limits** — delayed quotes, narrow coin set. Paid feed is a clean future
  upgrade behind `getBars`/`getQuotes`.
- **Versioned ripples** — the `ENGINE_VERSION` bump + `Sizing` shape change touch
  `api-types`, the trade card, and the sizer; equity behavior must stay byte-identical
  (`unitStep = 1` reproduces today's whole-share output).

---

## 8. Open questions (for later)

- Which coins in the curated crypto universe (majors only, or a broader set)?
- A crypto-specific event veto (token unlocks, halvings, listings) once a data source
  exists — the crypto analog of G5.
- Fractional-unit display precision per coin (BTC vs a sub-dollar alt).

## 9. Post-ship findings (v0.16.0)

- **Yahoo numeric-suffix symbols (ticker collisions).** Several major coins whose base
  ticker collides with an equity/other coin get a numeric suffix on Yahoo, NOT the plain
  `BASE-USD` form: Uniswap = `UNI7083-USD`, PEPE = `PEPE24478-USD`, Sui = `SUI20947-USD`,
  Bittensor = `TAO22974-USD`, The Graph = `GRT6719-USD`, Stacks = `STX4847-USD`. The plain
  `UNI-USD`/`PEPE-USD`/`SUI-USD` return **"no data — may be delisted."** These are
  currently **unsupported end-to-end** because `SYMBOL_PATTERN` (`lib/symbols`) is
  `/^[A-Z][A-Z.-]{0,9}$/` — it rejects **digits** (and symbols longer than 10 chars). So
  they can't be searched, analyzed, or curated today. `1INCH-USD` is out for the same
  reason (leading digit).
  - **Follow-up to support them:** broaden `SYMBOL_PATTERN` to allow digits + a longer
    max, AND add a **display-name map** (`UNI7083-USD` → "Uniswap (UNI)") so the board /
    search don't show the raw suffixed symbol. Then add them to `curatedCoins`.
- **Curated universe (v0.16.0):** ~56 majors whose plain `BASE-USD` symbol was
  **verified to return daily bars** on live Yahoo (`config.ts crypto.curatedCoins`). The
  board scans the first `maxScanUniverse` (24 — crypto makes no earnings subrequests, so
  it has budget above the equity cap of 20). Delisted/absent coins are simply skipped.
- **Crypto board is now cron-precomputed** (`/api/cron/scan?scope=crypto`, GitHub Action
  matrix scope × timeframe), so reads are warm like the equity board.
- **On-board coin search** added to `/crypto` (filtered to crypto matches) → Analyze.
- **Better data provider (open):** a paid feed (real-time, full/unsuffixed crypto
  universe, reliable volume, + more accurate equity quotes) would fix the collision-symbol
  problem AND the volume-quality caveat AND enable crypto movers/discovery (item 5/6). It
  slots behind the existing `MarketDataProvider` seam.
