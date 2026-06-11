# THRESHER — Design Document

**Technical confluence desk: a complete trade story (entry → stop → target) for any ticker, with transparent reasoning, expected outcomes, and honest confidence.**

*The name: a thresher separates grain from chaff — this engine's defining behavior is refusing the chaff. (Also a shark.)*

Version 1.0 · Design phase · No implementation in this document

---

## 1. Product definition

### 1.1 What it does

A user enters a ticker and picks a timeframe. The engine returns one of two things:

1. **A trade plan**: direction, entry, stop loss, target, risk %, reward %, R:R ratio, position-sizing math, and a confidence score — plus the full reasoning chain that produced it.
2. **A refusal**: "no trade," with the specific gate that failed and what would need to change.

### 1.2 What it deliberately does not do

- No order execution, no brokerage connection. Read-only, advisory output.
- No return predictions. It reports the *math of a defined-risk setup* (what you gain if target hits, what you lose if stop hits), never "this stock will go up X%."
- No uncalibrated probability claims. Until the backtest pipeline (§7) produces real per-bucket win rates, confidence is labeled as a *signal-agreement score*, not a win probability.
- No options, futures, or crypto in v1. US equities and ETFs only.

### 1.3 Design principles

1. **Refusing bad trades is the product.** A tool that always returns a trade returns bad trades. Most tickers on most days should produce NO TRADE.
2. **Every number is explainable.** Confidence penalties are itemized. Stop and target each cite the structure that produced them. The composite score shows each family's vote and weight.
3. **Confluence over single indicators.** No indicator has standalone edge; the engine only acts when independent signal families agree.
4. **Honesty in the UI.** Disclaimers are part of the design, not legal boilerplate bolted on. The History page (§6.4) publicly tracks the engine's own past calls and outcomes.

---

## 2. System architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js app (Cloudflare Pages / Vercel)                     │
│                                                              │
│  /            Analyze page (main product)                    │
│  /scan        Watchlist scanner                              │
│  /history     Past calls + outcomes (honesty board)          │
│  /methodology Engine documentation page                      │
│                                                              │
│  API routes                                                  │
│  GET  /api/v1/analyze?symbol=&timeframe=                     │
│  POST /api/v1/scan          (auth required)                  │
│  GET  /api/v1/history                                        │
└────────────┬────────────────────────────────────────────────┘
             │
   ┌─────────▼──────────┐     ┌──────────────────────────┐
   │ packages/engine    │     │ MarketDataProvider        │
   │ pure TypeScript    │◄────┤ interface                 │
   │ zero I/O           │     │  • YahooProvider (v1,     │
   │ fully unit-tested  │     │    yahoo-finance2, free)  │
   └────────────────────┘     │  • PolygonProvider (v2)   │
                              └──────────┬───────────────┘
             ┌───────────────────────────┤
   ┌─────────▼─────────┐      ┌──────────▼──────────┐
   │ Upstash Redis     │      │ Supabase (Postgres)  │
   │ OHLCV cache       │      │ • saved analyses     │
   │ rate limiting     │      │ • watchlists         │
   │ analysis cache    │      │ • backtest outcomes  │
   └───────────────────┘      │ • calibration table  │
                              └─────────────────────┘

Cron (Supabase pg_cron or Cloudflare Worker cron):
  • nightly outcome labeler (did target/stop hit?)
  • weekly calibration recompute
Observability: Sentry (errors), PostHog (product analytics),
BetterStack (uptime on /api/v1/analyze)
Auth: Clerk — anonymous users get N free analyses/day,
signed-in users get watchlists, scan, and history
```

**Key architectural rule:** `packages/engine` is a pure function library — `analyze(bars, config) → AnalysisResult`. It performs no I/O, knows nothing about Yahoo or Redis, and is the exact code the backtester replays over historical data. This guarantees the backtest tests the same logic users see.

### 2.1 Data layer

| Concern | v1 decision | Rationale |
|---|---|---|
| Provider | `yahoo-finance2` (npm) | Free, no API key, daily/weekly/hourly OHLCV, earnings dates via `quoteSummary` |
| Abstraction | `MarketDataProvider` interface | Swap to Polygon/Twelve Data later without touching the engine |
| Cache | Upstash Redis, key `ohlcv:{symbol}:{interval}` | Yahoo is unofficial and rate-limited; cache absorbs traffic |
| TTLs | intraday 15 min · daily 6 h · weekly 24 h | Daily bars only change after close; no reason to refetch |
| Rate limit | 20 analyses/hr anonymous, 200/hr signed-in (Upstash ratelimit) | Protects the free data source |
| Lookback | intraday: 60 d of 1 h bars · swing: 2 y daily · position: 5 y weekly | Enough history for SMA200 and pivot detection |

Stale-while-revalidate: serve cached bars immediately, refresh in background if TTL exceeded. If the provider is down, serve stale data with a visible "data as of {timestamp}" warning rather than failing.

### 2.2 Timeframe profiles

| Profile | Bars | Holding intent | Earnings veto window |
|---|---|---|---|
| Intraday | 1 h | hours–2 days | 1 trading day |
| Swing | 1 d | 3–20 days | 3 trading days |
| Position | 1 w | 1–6 months | none (flag only) |

---

## 3. The engine — indicators

All computed on the selected timeframe's bars. Wilder smoothing where the original indicator specifies it.

| Indicator | Params | Used by |
|---|---|---|
| SMA | 20, 50, 200 | Trend, Structure |
| EMA | 12, 26 | MACD |
| MACD | 12/26/9 | Momentum |
| RSI (Wilder) | 14 | Momentum |
| ATR (Wilder) | 14 | Stops, targets, structure buffers |
| ADX (Wilder) | 14 | Trend-quality multiplier |
| OBV | cumulative, 20-bar delta | Volume |
| Relative volume | 5-bar avg ÷ 20-bar avg | Volume |
| Bollinger %B | 20, 2σ | Structure |
| Pivot S/R | fractal window w=5, min 2 touches preferred | Structure, stops, targets |

**Pivot S/R detail:** a bar is a pivot high if its high exceeds the highs of the 5 bars on each side (mirror for lows). Levels within 0.5×ATR of each other merge into a zone (strength = touch count). Nearest support = highest zone below `close × 0.996`; nearest resistance = lowest zone above `close × 1.004`. Fallback when no pivot exists in range: `close ∓ 2.5×ATR`.

---

## 4. The engine — signal families and scoring

Each family outputs a score `s ∈ [−1, +1]` plus an itemized detail list (every component's contribution is shown in the UI).

### 4.1 Family definitions

**Trend** — *is there a directional regime, and how clean is it?*

| Component | Bullish | Bearish | Points |
|---|---|---|---|
| Price vs SMA50 | above | below | ±0.40 |
| SMA20 vs SMA50 stack | 20 > 50 | 20 < 50 | ±0.30 |
| SMA50 slope (vs 10 bars ago) | rising | falling | ±0.30 |

Raw sum is then multiplied by an ADX quality factor: ADX ≥ 25 → ×1.0 · 18–25 → ×0.8 · < 18 → ×0.5 (and sets the `choppy` flag used in confidence penalties). Clamp to [−1, +1].

**Momentum** — *is the move being pushed right now?*

| Component | Condition | Points |
|---|---|---|
| MACD vs signal | above / below | ±0.40 |
| MACD histogram (vs 3 bars ago) | expanding / fading | ±0.20 |
| RSI zone | 55–72 bullish / 28–45 bearish | ±0.30 |
| RSI extreme | > 72 (+0.10, sets `rsiHot`) / < 28 (−0.10, sets `rsiCold`) | ±0.10 |

**Volume** — *is anyone behind this move?*

| Component | Condition | Points |
|---|---|---|
| OBV 20-bar delta confirms price | both up / both down | ±0.50 |
| OBV diverges from price | divergence direction | ±0.20 |
| Relative volume > 1.2× | added in the direction of the 20-bar price change | ±0.30 |
| Relative volume < 0.8× | sets `thin` flag, 0 points | 0 |

**Structure** — *does the map of levels favor this direction?*

| Component | Condition | Points |
|---|---|---|
| Room asymmetry | distance-to-resistance > 1.3× distance-to-support → bullish (mirror for bearish) | ±0.40 |
| Price vs 20-bar mean | above / below | ±0.20 |
| Bollinger %B extreme | > 0.98 stretched (−0.20) / < 0.02 washed out (+0.20) | ±0.20 |

### 4.2 Weights (per timeframe)

Weights shift with holding intent: short horizons reward momentum and participation; long horizons reward regime.

| Family | Intraday | Swing | Position |
|---|---|---|---|
| Trend | 0.30 | 0.35 | 0.45 |
| Momentum | 0.35 | 0.30 | 0.20 |
| Volume | 0.20 | 0.15 | 0.10 |
| Structure | 0.15 | 0.20 | 0.25 |

All weight sets are config, stored in `engine/config.ts`, versioned (every stored analysis records `engineVersion` + `configHash` so backtests are reproducible).

### 4.3 Composite and direction

```
S = Σ (weight_f × score_f)          S ∈ [−1, +1]

direction = LONG   if S ≥ +0.22
            SHORT  if S ≤ −0.22
            NONE   otherwise
```

The ±0.22 threshold is intentionally high enough that a single strong family cannot trigger a trade alone (max single-family contribution = 0.45 × 1.0, but penalties and dissent make solo triggers rare in practice). Threshold is config and a primary target for backtest tuning.

---

## 5. The engine — confidence, trade plan, and refusal gates

### 5.1 Confidence (transparent confluence)

```
base = 35 + |S| × 75                      (capped at 95)

penalties (each itemized in the response):
  −12  ADX < 18 (choppy tape)
  − 8  per dissenting family (|score| > 0.15 opposing the trade direction)
  − 8  RSI extreme against the trade (long & rsiHot, or short & rsiCold)
  − 5  thin volume (relative volume < 0.8×)
  −10  earnings within the timeframe's veto window (production data)

C = clamp(round(base − Σ penalties), 5, 95)

bucket: HIGH ≥ 70 · MODERATE 45–69 · LOW < 45
```

Until calibration (§7) is live, the UI labels C as "signal agreement," never probability. After calibration, the UI shows both: raw agreement score and calibrated historical win rate for that bucket.

### 5.2 Stop loss

Structure-anchored, ATR-buffered, risk-bounded. For LONG (mirror everything for SHORT):

```
structStop = nearestSupport − 0.45 × ATR     // below the level that invalidates the idea
stop = max(structStop, entry − 2.2 × ATR)    // never risk more than 2.2 ATR
stop = min(stop,        entry − 0.8 × ATR)   // never tighter than 0.8 ATR (noise floor)
risk = entry − stop
```

Rationale: the stop must live where the *thesis is wrong* (below support), padded so ordinary noise doesn't tag it, but capped so one trade can't be a blowout, and floored so normal volatility doesn't shake it out instantly.

### 5.3 Target

```
structTarget = nearestResistance (LONG) / nearestSupport (SHORT)

if |structTarget − entry| / risk ≥ 1.4:
    target = structTarget                 basis: "structure level"
else:
    target = entry ± max(2 × risk, 2.5 × ATR)
    basis: "2R / 2.5×ATR projection"
    flag: overheadWarning                 // must clear a nearby level first

reward = |target − entry|
RR     = reward / risk
```

v1.1 adds a scale-out: T1 = structure level (sell ⅓–½, move stop to breakeven), T2 = projection.

### 5.4 Entry

v1: entry = current close (market-at-signal), which keeps the backtest honest (no hindsight limit fills). v1.1 adds an optional *entry zone* — `max(SMA20, support retest)` for longs — shown as a band; analyses re-checked at the zone get a fresh score.

### 5.5 Refusal gates — confidence × return combined

A trade is only emitted if **all** gates pass. The response always names the first failed gate.

```
G1  EDGE        direction ≠ NONE                  (|S| ≥ 0.22)
G2  CONVICTION  C ≥ 35
G3  STRUCTURE   RR ≥ 1.2
G4  EXPECTED    (C/100) × RR − (1 − C/100) ≥ 0.25     [R-units]
    VALUE       i.e., treating C as a win-rate proxy, the setup must
                clear +0.25R of expected value — low confidence must
                be paid for with higher reward-to-risk
G5  EVENT       no earnings inside the veto window (intraday/swing);
                position trades get a flag instead of a veto
```

G4 is the gate you asked for — confidence and potential return decide *together*. The implied minimum R:R by confidence:

| Confidence | Min R:R required by G4 | Effective floor (with G3) |
|---|---|---|
| 35 | 2.57 | 2.57 |
| 45 | 1.78 | 1.78 |
| 55 | 1.27 | 1.27 |
| 60+ | < 1.2 | 1.20 (G3) |

So a marginal setup needs a fat payoff to be worth taking; a high-conviction setup may take a standard one. The 0.25R margin is config (backtest-tunable).

### 5.6 Position sizing (advisory)

```
shares = floor((accountSize × riskFraction) / risk)      default riskFraction = 1%
```

Shown as worked math ("risking 1% of a $25,000 account = $250 → 17 shares"), user-adjustable, never stored as advice.

### 5.7 Expected outcome reporting

The trade card always shows three numbers, framed as scenarios, never predictions:

- **If target hits:** +reward% (and +$ at the sized position)
- **If stop hits:** −risk% (and −$)
- **R:R:** reward ÷ risk

Pre-calibration, EV is shown as "illustrative EV" with an explicit caveat. Post-calibration, EV uses the bucket's measured win rate.

---

## 6. Frontend design

### 6.1 Visual system (established in the prototype)

| Token | Value | Role |
|---|---|---|
| `bg` | `#0E1116` | App background (deep graphite) |
| `panel` / `panel2` | `#151B23` / `#10151C` | Cards / insets |
| `border` | `#27303C` | Hairlines |
| `text` / `muted` | `#E8EBF0` / `#8C96A6` | Copy |
| `amber` | `#E8B44C` | Brand/analytic accent, entry lines |
| `long` / `short` | `#3FCF8E` / `#F26969` | Semantic direction colors |
| Display type | Space Grotesk 400–700 | Headings, ticker |
| Data type | IBM Plex Mono 400–500 | Prices, scores, labels |

Signature element: the **trade ladder** — a vertical proportional gauge showing stop→entry→target with the green reward zone and red risk zone scaled to actual distances, so R:R is *visible* before it's read.

### 6.2 Page: Analyze (`/`) — the product

Layout (established in prototype, carried forward):

1. **Controls** — ticker input, timeframe pills, sample chips, data-freshness stamp
2. **Trade card** — ticker, price, LONG/SHORT/NO TRADE badge, R:R, then four stat tiles (Entry, Stop, Target, EV) each with its basis caption; confidence bar with itemized penalties beneath
3. **Trade ladder** — signature element (right rail on desktop, below card on mobile)
4. **Chart** — price + SMA20/50 with entry/stop/target reference lines (recharts in prototype; **TradingView Lightweight Charts** in production for candlesticks + volume pane)
5. **Trade story** — generated narrative paragraph assembling the drivers, levels, and caveats
6. **Signal family grid** — four cards, each with score bar (−1…+1), weight, and every component's vote (▲/▼/•)
7. **Footer** — standing disclaimer

NO TRADE state is a first-class design: the card explains which gate failed and what it's watching (the S/R levels), the ladder is replaced by a levels readout, and the family grid still renders so the user learns *why*.

### 6.3 Page: Scan (`/scan`, signed-in)

Run the engine across a watchlist (≤ 50 symbols). Table sorted by a quality rank = `(C/100) × RR` for passing setups; refusals collapse into a count ("41 of 50 refused"). Columns: symbol, direction, C, RR, gate status, one-line driver. Row click → Analyze page. Server-side, cached per market session.

### 6.4 Page: History (`/history`) — the honesty board

Every emitted trade plan is stored with its `engineVersion`. The nightly labeler marks outcomes (target hit / stop hit / expired after horizon). The page shows hit rates by confidence bucket and timeframe, win/loss distributions, and the calibration curve. This page is the credibility of the product — it exists from day one, even when the early numbers are unflattering.

### 6.5 Pages: Methodology (`/methodology/*`)

A full public documentation section, not a single page. Content source: **`THRESHER-METHODOLOGY.md`** (companion document), which specifies every formula and determination step. Routes:

```
/methodology                    overview + pipeline diagram
/methodology/indicators/{slug}  one page per indicator (formula, calculation,
                                parameters, how it's used, limitations):
                                sma, ema, macd, rsi, atr, adx, obv,
                                relative-volume, bollinger, pivots
/methodology/engine/{slug}      one page per determination step:
                                families, weights, composite, confidence,
                                stops, targets, gates, sizing
/methodology/example            worked end-to-end trade derivation
/methodology/limitations        what the engine cannot see (published verbatim)
```

Every number in the product deep-links to its methodology page (e.g., the RSI readout in a family card links to `/methodology/indicators/rsi`). This is the trust architecture: confidence is auditable because everything upstream of it is documented.

---

## 7. Backtesting and calibration (v2, designed now)

1. **Replay:** walk historical bars per symbol/timeframe; on each bar, run `analyze()` on data up to that bar (no lookahead). Record every emitted plan and every refusal with full feature snapshot.
2. **Label:** outcome = first of {target, stop} touched within horizon (intraday 3 d · swing 30 d · position 26 w); else "expired" at mark-to-market.
3. **Measure:** win rate, average R, expectancy, and max drawdown per confidence bucket × timeframe; minimum n = 300 per bucket before display.
4. **Calibrate:** isotonic regression mapping raw confidence → empirical win probability; store as a versioned table; UI then shows "historically, setups like this hit target X% of the time."
5. **Tune:** thresholds (±0.22, G4 margin 0.25R, weights) optimized on train period, validated walk-forward on held-out period — never tuned on the data they're reported against.

Storage: `backtest_runs`, `setups`, `outcomes`, `calibration` tables in Supabase. Compute: one-off Node script per run (engine is pure TS, so the backtester is ~200 lines around it).

---

## 8. API contract

`GET /api/v1/analyze?symbol=NVDA&timeframe=swing`

```jsonc
{
  "symbol": "NVDA",
  "timeframe": "swing",
  "asOf": "2026-06-10T20:00:00Z",
  "dataFreshness": "2026-06-10T20:00:00Z",
  "engineVersion": "1.0.0",
  "configHash": "a3f9c1",
  "price": 187.42,
  "direction": "long",            // "long" | "short" | "none"
  "composite": 0.341,
  "confidence": { "score": 71, "bucket": "high",
                  "penalties": [{ "reason": "thin volume", "points": -5 }] },
  "gates": [{ "gate": "G1", "pass": true }, /* …G2–G5 */],
  "plan": {                        // null when direction === "none"
    "entry": 187.42,
    "stop": 181.10,  "stopBasis": "support 182.30 − 0.45×ATR",
    "target": 201.75, "targetBasis": "structure level",
    "riskPct": 3.37, "rewardPct": 7.65, "rr": 2.27,
    "overheadWarning": false,
    "sizing": { "riskFraction": 0.01, "example": { "account": 25000, "shares": 39 } },
    "ev": { "value": 4.1, "calibrated": false }
  },
  "refusal": null,                 // { "gate": "G4", "reason": "..." } when no trade
  "families": [ { "key": "trend", "score": 0.62, "weight": 0.35,
                  "details": [{ "ok": 1, "text": "Price above 50-bar SMA ($172.10)" }] } ],
  "levels": { "support": 182.30, "resistance": 201.75 },
  "indicators": { "rsi": 61.2, "adx": 27.4, "atr": 4.21, "relVol": 0.78, "percentB": 0.71 },
  "story": "NVDA sets up LONG on the swing timeframe, driven primarily by trend and momentum…",
  "chart": { "bars": "…OHLCV…", "sma20": "…", "sma50": "…" }
}
```

Errors: `404 UNKNOWN_SYMBOL`, `429 RATE_LIMITED` (with reset), `503 DATA_UNAVAILABLE` (with stale-data fallback when possible).

---

## 9. Stack mapping

| Concern | Choice |
|---|---|
| App | Next.js, Cloudflare Pages |
| Engine | `packages/engine` pure TS, Vitest unit tests (golden-file tests per indicator vs known values) |
| Data | yahoo-finance2 behind `MarketDataProvider` |
| Cache / rate limit | Upstash Redis |
| DB | Supabase (analyses, watchlists, outcomes, calibration) |
| Auth | Clerk (anonymous tier allowed) |
| Email | Resend (v1.1: scan-alert digests) |
| Analytics / errors / uptime | PostHog · Sentry · BetterStack |

## 10. Roadmap

- **M0 — Engine package:** indicators + families + gates, fully unit-tested, golden-file fixtures. *(The prototype's logic ports nearly line-for-line.)*
- **M1 — Analyze page:** live data, caching, rate limiting, disclaimers, methodology page. Ship.
- **M2 — Accounts:** Clerk, watchlists, Scan page, saved analyses, History recording (unlabeled).
- **M3 — Honesty board:** outcome labeler cron, History page with hit rates.
- **M4 — Calibration:** backtest pipeline, calibrated probabilities in UI, threshold tuning, T1/T2 scale-outs, entry zones.

## 11. Open questions

1. Universe guardrails — minimum dollar-volume / price floor (e.g., reject < $2 or < $1M avg dollar volume) to keep the engine off untradeable junk?
2. Should NO TRADE results be storable to History too (refusal quality is measurable: did refused setups underperform)? Recommended: yes.
3. Public vs authed default for `/scan` — free tier of 5 symbols?
4. Intraday data quality on free Yahoo (1h bars are spotty pre/post market) — acceptable for v1 or gate intraday behind v2/Polygon?