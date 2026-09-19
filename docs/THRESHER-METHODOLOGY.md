# THRESHER — Methodology Reference

**Every number the engine produces, derived from first principles.**

This document serves two purposes: it is the implementation spec for `packages/engine` (Parts I–II) and the future `packages/options-engine` (Part III), and it is the source content for the public `/methodology` documentation pages. If a calculation isn't in this document, the engine doesn't do it.

Companion to `THRESHER-DESIGN.md`. Version 1.1 (adds **Part III — Options**, proposed/awaiting sign-off).

**Docs site structure** (each Part I/II/III section below = one page):

```
/methodology                    → overview + pipeline diagram
/methodology/indicators/{slug}  → sma, ema, macd, rsi, atr, adx, obv,
                                  relative-volume, bollinger, pivots
/methodology/engine/{slug}      → families, weights, composite, confidence,
                                  stops, targets, gates, sizing
/methodology/options/{slug}     → delta, gamma, theta, vega, rho, pricing,
                                  strategies, exits, gates, limitations (Part III)
/methodology/example            → worked end-to-end trade derivation
/methodology/limitations        → what this engine cannot see
```

---

## Pipeline overview

Everything flows one direction. No step can reach backward.

```
OHLCV bars (per timeframe)
   │
   ▼
[Part I]  Indicators ───── pure math on bars; no opinions yet
   │
   ▼
[Part II] Signal families ─ each indicator's reading becomes a scored,
   │                        directional vote with a written reason
   ▼
Composite score S ────────  weighted sum of family scores
   │
   ▼
Direction ────────────────  long / short / none (threshold on S)
   │
   ▼
Confidence C ─────────────  base from |S|, minus itemized penalties
   │
   ▼
Trade plan ───────────────  stop from structure, target from structure,
   │                        R:R from those two
   ▼
Refusal gates G1–G5 ──────  trade emitted only if all pass;
                            otherwise: which gate failed, and why
```

Conventions used throughout: `C_t` = close of bar t, `H_t`/`L_t`/`V_t` = high/low/volume, `n` = lookback period. "Bar" means one unit of the selected timeframe (1 h, 1 d, or 1 w).

---

# Part I — Indicators

Each section: what it measures, the exact formula, parameters Thresher uses, how the engine consumes it, and — importantly — where it fails.

---

## I.1 Simple Moving Average (SMA)

**Measures:** the average price over the last n bars — the smoothed consensus of where the market has been trading.

**Formula:**

```
SMA_n(t) = (1/n) × Σ  C_(t−i)     for i = 0 … n−1
```

**Calculation:** sum the last n closes, divide by n. Computed as a rolling window (add the newest close, drop the oldest) for O(1) per bar.

**Parameters:** n = 20 (short-term mean), 50 (intermediate trend), 200 (long-term regime, display only in v1).

**How Thresher uses it:**
- *Trend family:* price above/below SMA50; SMA20 vs SMA50 stacking; SMA50 slope (current value vs its value 10 bars ago).
- *Structure family:* price vs SMA20 as the "20-bar mean" reference.
- *Bollinger Bands* (I.9) are built on SMA20.

**Limitations:** the SMA lags by construction — roughly n/2 bars behind a turn. It says nothing about *how* price got there (a slow grind and a violent whipsaw can produce the same SMA). The engine never uses an SMA alone; it always pairs level (above/below) with slope and with ADX trend-quality.

---

## I.2 Exponential Moving Average (EMA)

**Measures:** a moving average that weights recent bars more heavily, reacting faster than the SMA.

**Formula:**

```
k       = 2 / (n + 1)                      (smoothing factor)
EMA_t   = C_t × k + EMA_(t−1) × (1 − k)
EMA_0   = C_0                              (seed)
```

**Calculation:** seeded with the first close, then recursively blended. Because the seed biases early values, the engine requires at least 5×n bars of history before any EMA-derived signal is trusted, which the lookback windows in the design doc guarantee.

**Parameters:** n = 12 and 26 — used exclusively as MACD inputs. The engine never reads EMAs directly.

**Limitations:** faster reaction also means more false signals in chop. This is contained by feeding EMAs only into MACD, whose reading is in turn discounted by the ADX quality multiplier at the family level.

---

## I.3 MACD (Moving Average Convergence Divergence)

**Measures:** the spread between fast and slow EMAs — whether short-term momentum is gaining or losing on the longer-term drift, and whether that spread itself is accelerating.

**Formula:**

```
MACD line  = EMA_12(C) − EMA_26(C)
Signal     = EMA_9(MACD line)
Histogram  = MACD line − Signal
```

**Calculation:** three EMA passes — two over closes, one over the MACD line itself.

**How Thresher uses it (Momentum family):**
- MACD line above/below Signal → ±0.40 (the primary momentum vote)
- Histogram now vs histogram 3 bars ago → ±0.20 (is momentum *accelerating* or fading — a second derivative check that often turns before the crossover does)

**Limitations:** MACD is unbounded and scale-dependent, so its absolute value is meaningless across tickers — the engine only ever reads *relationships* (above/below, expanding/fading), never magnitudes. Like all EMA constructs, it whipsaws in ranges; the choppy-tape confidence penalty (II.4) exists largely because of this.

---

## I.4 Relative Strength Index (RSI, Wilder)

**Measures:** the balance of up-bar gains vs down-bar losses over n bars, normalized to 0–100. High = buyers have dominated recently; low = sellers have.

**Formula:**

```
gain_t = max(C_t − C_(t−1), 0)
loss_t = max(C_(t−1) − C_t, 0)

First n bars (simple seed):
  AvgGain = (1/n) Σ gain     AvgLoss = (1/n) Σ loss

Thereafter (Wilder smoothing):
  AvgGain_t = (AvgGain_(t−1) × (n−1) + gain_t) / n
  AvgLoss_t = (AvgLoss_(t−1) × (n−1) + loss_t) / n

RS  = AvgGain / AvgLoss
RSI = 100 − 100 / (1 + RS)        (RSI = 100 when AvgLoss = 0)
```

**Parameters:** n = 14.

**How Thresher uses it (Momentum family):** zone-based, *trend-following* — this is a deliberate departure from the pop-TA "buy under 30, sell over 70" reading:

| RSI | Interpretation | Points |
|---|---|---|
| 55–72 | healthy bullish momentum | +0.30 |
| > 72 | strong **but stretched** — sets `rsiHot` flag | +0.10 |
| 45–55 | neutral, no vote | 0 |
| 28–45 | healthy bearish momentum | −0.30 |
| < 28 | weak but washed out — sets `rsiCold` flag | −0.10 |

The extreme flags feed the confidence penalty (−8 when entering a fresh trade *into* an extreme, II.4) rather than reversing the vote — because in real trends RSI can stay pinned above 70 for weeks, and treating that as a short signal is one of the classic ways naive TA loses money.

**Limitations:** RSI is a derivative of price, not new information — it will diverge meaninglessly on low-volume drift. It carries no notion of *why* price moved.

---

## I.5 Average True Range (ATR, Wilder)

**Measures:** how far this instrument actually moves per bar, gap-inclusive. ATR is the engine's unit of distance — every buffer, cap, and projection is denominated in it so that the same logic works identically on a $9 ticker and a $900 one.

**Formula:**

```
TR_t  = max( H_t − L_t,
             |H_t − C_(t−1)|,
             |L_t − C_(t−1)| )

ATR seeded as simple mean of first n TRs, then:
ATR_t = (ATR_(t−1) × (n−1) + TR_t) / n
```

**Parameters:** n = 14.

**How Thresher uses it:** stop buffer (0.45×ATR beyond structure), stop bounds (0.8× floor, 2.2× cap), target projection (2.5×ATR), pivot-zone merging tolerance (0.5×ATR). ATR never votes on direction — it only sizes distances.

**Limitations:** ATR is backward-looking; volatility regime shifts (earnings, macro events) blow through it. This is exactly why gate G5 vetoes trades into earnings windows rather than trusting ATR-sized stops through them.

---

## I.6 Average Directional Index (ADX, with +DI / −DI)

**Measures:** trend *strength*, direction-agnostic. The engine's answer to "is there even a trend here worth following, or is this chop?"

**Formula:**

```
Directional movement per bar:
  upMove   = H_t − H_(t−1)
  downMove = L_(t−1) − L_t
  +DM = upMove   if upMove > downMove and upMove > 0,   else 0
  −DM = downMove if downMove > upMove and downMove > 0, else 0

Wilder-smooth TR, +DM, −DM over n
(seed = sum of first n; then S_t = S_(t−1) − S_(t−1)/n + x_t)

  +DI = 100 × S(+DM) / S(TR)
  −DI = 100 × S(−DM) / S(TR)
  DX  = 100 × |+DI − −DI| / (+DI + −DI)
  ADX = Wilder average of DX over n
```

**Parameters:** n = 14.

**How Thresher uses it (Trend family quality multiplier):**

| ADX | Reading | Multiplier on raw trend score |
|---|---|---|
| ≥ 25 | established trend | × 1.0 |
| 18–25 | developing trend | × 0.8 |
| < 18 | chop | × 0.5, sets `choppy` flag (−12 confidence) |

Note the engine uses ADX to *discount*, never to generate, direction — +DI/−DI crossovers are notoriously noisy and are not used as signals.

**Limitations:** ADX is doubly smoothed and therefore very slow — it confirms trends late and announces their death late. Acceptable here because its only job is regime classification, where lag is tolerable.

---

## I.7 On-Balance Volume (OBV)

**Measures:** cumulative volume signed by price direction — a crude but effective proxy for whether money is flowing in (accumulation) or out (distribution).

**Formula:**

```
OBV_t = OBV_(t−1) + V_t   if C_t > C_(t−1)
        OBV_(t−1) − V_t   if C_t < C_(t−1)
        OBV_(t−1)         if equal
```

**How Thresher uses it (Volume family):** the OBV *level* is meaningless (it depends on where the series starts), so the engine reads only its 20-bar delta, cross-referenced against the 20-bar price delta:

| OBV Δ20 | Price Δ20 | Reading | Points |
|---|---|---|---|
| up | up | accumulation confirms | +0.50 |
| down | down | distribution confirms | −0.50 |
| up | down/flat | bullish divergence (early, weaker) | +0.20 |
| down | up/flat | bearish divergence | −0.20 |

**Limitations:** OBV treats a +0.01% bar and a +5% bar identically (full volume credited either way), is distorted by splits and gap opens, and inherits whatever quality problems the volume feed has. It carries the lowest family weight in the engine partly for these reasons.

---

## I.8 Relative Volume

**Measures:** current participation vs. recent norm — is anyone actually showing up for this move?

**Formula:**

```
RelVol = mean(V, last 5 bars) / mean(V, last 20 bars)
```

**How Thresher uses it (Volume family):**

| RelVol | Reading | Effect |
|---|---|---|
| > 1.2 | elevated participation | ±0.30 in the direction of the 20-bar price change |
| 0.8–1.2 | normal | no vote |
| < 0.8 | thin tape | sets `thin` flag → −5 confidence |

**Limitations:** volume has strong day-of-week and intraday seasonality (Mondays and lunchtime hours run light), which a flat 5/20 ratio doesn't adjust for. v2 consideration: seasonal normalization for the intraday profile.

---

## I.9 Bollinger Bands and %B

**Measures:** where price sits inside its own recent volatility envelope.

**Formula:**

```
Mid   = SMA_20(C)
σ     = population stdev of last 20 closes
      = √( (1/20) Σ (C_i − Mid)² )
Upper = Mid + 2σ        Lower = Mid − 2σ

%B    = (C − Lower) / (Upper − Lower)
```

%B = 1.0 at the upper band, 0.0 at the lower, 0.5 at the mean; it can exceed [0,1] when price pierces a band.

**How Thresher uses it (Structure family):** extremes only — %B > 0.98 means price is pressing the upper band (stretched, −0.20 even for longs: chasing here buys the worst short-term price); %B < 0.02 means washed out (+0.20). Between the extremes %B casts no vote; the price-vs-mean component (I.1) covers the middle ground.

**Limitations:** band touches are *not* reversal signals — strong trends "walk the band" for extended runs. That's exactly why the engine penalizes entry timing at extremes rather than flipping direction on them.

---

## I.10 Pivot Support & Resistance (fractal method)

**Measures:** the price levels where the market has actually reversed before — the structural map that stops and targets anchor to. This is the only "subjective-looking" indicator in the engine, so its algorithm is specified exactly.

**Algorithm:**

```
1. Fractal detection (window w = 5):
   bar i is a pivot HIGH if H_i > H_j for all j in [i−5, i+5], j ≠ i
   bar i is a pivot LOW  if L_i < L_j for all j in [i−5, i+5], j ≠ i
   (the last 5 bars can never be pivots — they lack a right side;
    this is inherent, not a bug: fresh structure is unconfirmed)

2. Zone merging:
   sort pivot levels; merge any levels within 0.5 × ATR of each
   other into one zone at their volume-weighted mean
   zone strength = number of merged touches

3. Nearest-level selection (relative to close):
   resistance = lowest zone strictly above close × 1.004
   support    = highest zone strictly below close × 0.996
   (0.4% buffer prevents treating a level price is *sitting on*
    as meaningful overhead/floor)

4. Fallback when no zone exists in range:
   close ± 2.5 × ATR, flagged "synthetic level" in the response
```

**How Thresher uses it:** Structure family room-asymmetry vote (±0.40); stop anchoring (II.5); structure targets (II.6). Zone strength ≥ 2 touches is preferred for targets when multiple candidates exist.

**Limitations:** pivots are timeframe-relative (a daily level is invisible to the weekly engine), the 5-bar window is a tunable that trades sensitivity for noise, and levels decay in relevance with age — v2 adds recency weighting to zone strength.

---

# Part II — Determination

How indicator readings become a trade, step by step. (Component point tables for each family live in `THRESHER-DESIGN.md` §4.1; this part documents the *reasoning* and the downstream math.)

---

## II.1 Signal families — why these four

The engine's core claim is that confluence across **independent evidence types** beats any single indicator. The four families are chosen to be as orthogonal as TA allows:

| Family | Question it answers | Evidence type |
|---|---|---|
| Trend | Is there a directional regime? | price level/slope vs its own history |
| Momentum | Is the move being pushed *right now*? | rate-of-change of price |
| Volume | Is real participation behind it? | non-price data (the only family not derived from close) |
| Structure | Does the map of levels leave room? | spatial position vs historical reversal points |

Each component within a family casts a bounded vote (the point tables), the family clamps to [−1, +1], and *every component's vote is preserved as a written detail* — this is what makes the family cards in the UI possible and is a hard requirement: no component may influence the score without producing a human-readable reason string.

Design rule: no single component may exceed 0.5 family points, so no single indicator reading can dominate a family, and no family can trade alone (II.3).

## II.2 Weights and the composite

```
S = Σ over families ( weight_f × score_f )         S ∈ [−1, +1]
```

Weights per timeframe (design doc §4.2): intraday tilts toward Momentum (0.35) and Volume (0.20) because over hours, flow *is* the signal; position tilts toward Trend (0.45) and Structure (0.25) because over months, regime *is* the signal. Weights always sum to 1.0, are stored in versioned config, and are the first parameters the calibration pipeline (design doc §7) will tune — the v1 values are reasoned priors, not measured optima, and the docs page says so.

## II.3 Direction thresholds

```
LONG  if S ≥ +0.22      SHORT if S ≤ −0.22      else NONE
```

Why 0.22: the strongest single family (Trend at 0.45 weight, position timeframe) maxes out at 0.45 contribution — but real readings rarely max out, and any dissent subtracts. At 0.22 the engine needs either one strong family *plus* agreement elsewhere, or broad moderate agreement. A lone bullish indicator in an otherwise flat tape cannot trigger. The threshold is symmetric: the engine has no long bias.

## II.4 Confidence — design rationale

```
base = min(95, 35 + |S| × 75)
C    = clamp(round(base − Σ penalties), 5, 95)
```

- **Why base 35:** crossing the direction threshold (|S| = 0.22) yields base ≈ 51 — barely past a coin flip, which is the honest read of a marginal composite.
- **Why a 95 ceiling and 5 floor:** the engine never claims certainty in either direction.
- **Why penalties subtract instead of multiply:** subtraction keeps each penalty's cost legible in points ("thin volume cost this trade 5 points"), which is the entire transparency contract. Multiplicative penalties compound invisibly.
- **Penalty registry** (each emits its reason string): choppy ADX −12 · each dissenting family −8 · RSI extreme against the trade −8 · thin volume −5 · earnings inside veto window −10.
- A *dissenting family* = |score| > 0.15 with sign opposing the trade. Dissent is the most important penalty conceptually: it is the direct price of broken confluence.

Until calibration ships, C is labeled "signal agreement (0–100)" everywhere in the UI. After calibration, each bucket displays its measured historical hit rate alongside.

## II.5 Stop placement — the invalidation principle

A stop is not a pain threshold; it is the price at which **the reason for the trade is gone**. For a long, the thesis includes "support holds," so:

```
structStop = support − 0.45 × ATR        thesis-invalidation point,
                                          padded so ordinary noise that
                                          briefly pierces the level
                                          doesn't tag the stop
stop = max(structStop, entry − 2.2×ATR)  risk cap: if support is far,
                                          the trade risks at most 2.2 ATR
stop = min(stop,       entry − 0.8×ATR)  noise floor: if support is
                                          on top of price, a sub-0.8-ATR
                                          stop would be hit by random
                                          bar-to-bar variation
risk = entry − stop                       (mirror all signs for shorts)
```

The three constants (0.45 buffer, 2.2 cap, 0.8 floor) are config, denominated in ATR so they self-adjust to each instrument's volatility, and are calibration-tunable.

## II.6 Target selection — structure first, projection second

```
structTarget = nearest resistance zone (long) / support zone (short)

if |structTarget − entry| / risk ≥ 1.4:
    target = structTarget            basis: "structure level" —
                                     a price the market has actually
                                     defended before
else:
    target = entry ± max(2 × risk, 2.5 × ATR)
    basis: "2R / 2.5×ATR projection"
    flag:  overheadWarning           the projection lies BEYOND a known
                                     level; price must chew through it
```

Why prefer structure: a level with prior touches is a real liquidity magnet and a real exit; a projection is just arithmetic. Why the 1.4 pre-check: if the nearest level pays under 1.4R, taking it as the target makes the trade nearly un-passable through the gates, so the engine looks past it — but honestly flags that the path runs through resistance.

## II.7 The refusal gates — full math

All five must pass, evaluated in order; the response names the first failure and its reason string. G1–G3, G5 are simple predicates (design doc §5.5). **G4 is the confidence × return joint gate** and deserves its own derivation:

Treat C/100 as a *provisional* win-rate proxy `p` (provisional = uncalibrated; the gate's conservatism margin exists precisely because of that). A trade risking 1R to make RR has expected value, in R-units:

```
EV_R = p × RR − (1 − p) × 1
```

Requiring EV_R ≥ 0 would accept break-even propositions on an unproven proxy. So the gate demands a margin:

```
G4:  (C/100) × RR − (1 − C/100) ≥ 0.25
```

Rearranged, the minimum R:R the gate demands at a given confidence:

```
RR_min(C) = (0.25 + (1 − C/100)) / (C/100)
```

| C | RR_min from G4 | Binding floor (with G3 = 1.2) |
|---|---|---|
| 35 | 2.57 | 2.57 |
| 40 | 2.13 | 2.13 |
| 45 | 1.78 | 1.78 |
| 50 | 1.50 | 1.50 |
| 55 | 1.27 | 1.27 |
| ≥ 60 | ≤ 1.08 | 1.20 (G3 takes over) |

This is the formalization of "take into consideration the confidence and potential return": weak conviction must be bought with asymmetric payoff; strong conviction may take standard payoffs; and nothing below 1.2R or below 35 confidence trades at any price. When calibration replaces the proxy with measured probabilities, the same gate formula stands — only `p` changes.

## II.8 Position sizing (advisory)

```
dollarsAtRisk = accountSize × riskFraction        default 1%
shares        = floor( dollarsAtRisk / risk )      risk = |entry − stop|
```

Shown as worked arithmetic in the UI. Notable property: position size is a function of *stop distance*, not of conviction — a wide stop means fewer shares for the same dollar risk. The engine does not size up on confidence (a deliberate v1 choice; fractional-Kelly sizing is a v2+ question that requires calibrated probabilities first).

## II.9 Worked example — end to end

Hypothetical ticker QQXR, **swing** timeframe (daily bars). Indicator readings at the latest bar:

```
close 84.60 · ATR 2.10 · support zone 81.90 · resistance zone 89.40
SMA20 82.90 · SMA50 80.40 (vs 79.80 ten bars ago) · RSI 61
MACD 0.92 vs signal 0.71, histogram 0.21 (vs 0.13 three bars ago)
ADX 24 · OBV Δ20 > 0 with price Δ20 > 0 · RelVol 0.76 · %B 0.74
```

**Families** (point tables from design doc §4.1):

| Family | Components | Raw | Final |
|---|---|---|---|
| Trend | above SMA50 +0.4 · stack +0.3 · slope +0.3 = 1.0 | ×0.8 (ADX 24, developing) | **+0.80** |
| Momentum | MACD>signal +0.4 · hist expanding +0.2 · RSI 61 zone +0.3 | | **+0.90** |
| Volume | OBV confirms +0.5 · RelVol 0.76 → `thin` flag, 0 pts | | **+0.50** |
| Structure | room 4.80 > 1.3 × cushion 2.70 → +0.4 · above mean +0.2 · %B mid 0 | | **+0.60** |

**Composite** (swing weights .35/.30/.15/.20):

```
S = .35(.80) + .30(.90) + .15(.50) + .20(.60)
  = .280 + .270 + .075 + .120 = +0.745   →  G1: LONG
```

**Confidence:** base = 35 + 0.745×75 = 90.9. Penalties: none for ADX (24 ≥ 18), no dissenting family, no RSI extreme, **thin volume −5**. C = **86** (HIGH). → G2 pass.

**Stop:** structStop = 81.90 − 0.45(2.10) = 80.96. Cap: 84.60 − 2.2(2.10) = 79.98 → max(80.96, 79.98) = 80.96. Floor: 84.60 − 0.8(2.10) = 82.92 → min(80.96, 82.92) = **80.96**. Risk = 3.64 (4.30%).

**Target:** structure check: (89.40 − 84.60)/3.64 = 1.32 < 1.4 → projection: 84.60 + max(2×3.64, 2.5×2.10) = 84.60 + 7.28 = **91.88**, basis "2R projection," `overheadWarning` (must clear 89.40). Reward = 7.28 (8.61%). **RR = 2.00** → G3 pass.

**G4:** 0.86 × 2.00 − 0.14 = 1.58 ≥ 0.25 → pass. **G5:** no earnings in window → pass.

**Emitted:** LONG QQXR · entry 84.60 · stop 80.96 (−4.3%) · target 91.88 (+8.6%) · 2.0:1 · confidence 86 with one itemized penalty (thin volume −5) and one warning (overhead resistance at 89.40). Sizing example at $25,000 / 1%: floor(250 / 3.64) = 68 shares.

*Counterfactual:* same setup but ADX 15 and Momentum bearish at −0.40: Trend → 1.0×0.5 = 0.50; S = .175 − .120 + .075 + .120 = +0.25 → still LONG at G1, but confidence = 35 + 18.75 = 53.8, then −12 choppy, −8 dissenting momentum, −5 thin = **29 → G2 fails (C < 35): NO TRADE**, reason: "conviction floor — choppy tape and momentum dissent." This is the refusal behavior working as designed.

## II.10 Limitations — what this engine cannot see

The honesty page. Published verbatim at `/methodology/limitations`:

1. **TA sees price and volume only.** No fundamentals, no news, no filings, no macro. A perfect technical setup walks into a guidance cut blind. Gate G5 (earnings veto) is the only event-awareness in v1.
2. **All indicators here are derivatives of the same price series** (except volume) — "independence" of families is partial by construction.
3. **Confidence is uncalibrated until §7 of the design doc ships.** Treating it as a probability before then is exactly the mistake the UI labeling exists to prevent.
4. **Backward-looking volatility:** ATR-sized stops assume tomorrow's volatility resembles the last 14 bars. Regime breaks violate this.
5. **No execution modeling in v1:** slippage, spreads, and commissions are not in the R:R math. Real results will be worse than displayed math by those costs; the History page will measure the gap.
6. **Free-data caveats:** Yahoo volume and intraday bars carry quality issues (design doc §11.4); every response carries its data timestamp.
7. **Nothing here is financial advice.** The engine reports the technical structure and the arithmetic of a defined-risk setup. The decision, and the risk, belong to the user.

---

# Part III — Options analysis

> **Status: PROPOSED — awaiting sign-off.** Everything in Part III is the
> *binding spec* for the future `packages/options-engine`, authored here **before**
> any engine code (project rule: the doc defines the math; code never invents it).
> Until this Part is signed off, no options engine code is written. Once signed off,
> if code and this Part disagree, **this Part wins**.

The equity engine (Parts I–II) answers *"is there a trade in the underlying, and what
is its defined-risk shape?"* Part III **extends** that answer into the option chain:
given the same ticker + timeframe, it reads every liquid strike × expiration through
the greeks and returns **the single best options trade to express the equity read** —
side (buy/sell), type (call/put), expiration, strike(s) — with an *illustrative*
expected return, a **model-based** probability of profit, an options "signal
agreement" confidence, and a full defined-risk payoff. Or an honest refusal.

**The one-way dependency (do not violate):** the options engine **consumes** the
equity `AnalysisResult` as an input value — direction, confidence, composite,
families, and the emitted plan (entry/stop/target). It **never recomputes technical
analysis** and the equity engine never depends on the options engine. This is what
keeps both engines pure, independently versioned, and independently replayable by the
backtester.

**Purity, exactly as Part I–II:** `analyzeOptions(chain, equityRead, config, ctx)` is
a pure function. Spot, per-contract IV, days-to-expiry, the risk-free rate, the
dividend yield, the equity read, and "now" are **all passed in** — no I/O, no
`Date.now()`. Every score component emits a `Detail{ok, text}` reason string; all
numbers live in `packages/options-engine/src/config.ts` behind
`OPTIONS_ENGINE_VERSION` + a deterministic `optionsConfigHash` (the same `fnv1a`
pattern as the equity `config.ts`), stamped into every result. Refusals are
first-class `{gate, reason}`, never thrown.

---

## III.1 The pricing model — Black-Scholes-Merton

Every greek and price in Part III comes from one model: **Black-Scholes-Merton** with
a continuous dividend yield (the Merton extension). All inputs are passed in:

| Symbol | Meaning | Source (passed in) |
|---|---|---|
| `S` | underlying spot price | `chain.underlyingPrice` |
| `K` | strike | per contract |
| `T` | time to expiry, **in years** | `(expiration − ctx.now) / 365` (calendar days ÷ 365) |
| `σ` | implied volatility (annualized) | per contract, from the chain (`impliedVolatility`) |
| `r` | risk-free rate (annualized, continuous) | config constant `riskFreeRate` = **0.04** |
| `q` | continuous dividend yield | `getProfile().fundamentals.dividendYield` (default **0**) |

```
d1 = [ ln(S/K) + (r − q + σ²/2) · T ] / (σ · √T)
d2 = d1 − σ · √T
```

with `N(·)` the standard-normal CDF and `n(·)` its PDF.

**Two documented approximations (v1):**

1. **European pricing of American options.** Listed US equity options are
   American-style (early exercise allowed); BSM prices European exercise. v1 uses the
   European formula as an approximation. Early exercise is only materially valuable
   for deep-ITM options near an ex-dividend date (calls) or deep-ITM puts at high
   rates; the engine **flags** `earlyExerciseApprox` on any contract that is both
   deep ITM (|delta| ≥ 0.90) and inside a dividend/expiry window, rather than
   correcting the price. A binomial (American) model is a paid-phase upgrade. This is
   the direct analog of the "holidays ignored in DTE" simplification.
2. **Flat, static IV.** Each contract is priced at its own quoted IV; the engine does
   **not** model a volatility surface or IV changes over the holding period. Every
   forward-looking number in Part III therefore assumes *IV as quoted now* — stated
   in the honest labels (III.6, III.14).

**Time uses calendar days, not trading days** (`/365`), matching how brokers quote
DTE. A theta expressed *per calendar day* (III.2) is consistent with this.

---

## III.2 The five greeks — definitions, formulas, and what to look for

This section is the **educational core** — its prose is published verbatim on
`/methodology/options/{delta,gamma,theta,vega,rho}`. Each greek is the sensitivity of
the option's price to one input. All formulas below are exact BSM (with `q`);
**calls and puts share gamma and vega**; delta, theta, and rho differ by type.

**Price** (so every greek has its parent in view):

```
Call = S·e^(−qT)·N(d1) − K·e^(−rT)·N(d2)
Put  = K·e^(−rT)·N(−d2) − S·e^(−qT)·N(−d1)
```

### Delta (Δ) — direction exposure

```
Δ_call = e^(−qT) · N(d1)          ∈ (0, 1)
Δ_put  = −e^(−qT) · N(−d1)        ∈ (−1, 0)
```

*What it means:* the dollar change in the option per **$1** move in the underlying —
and, loosely, the option's share-equivalent exposure (a 0.60-delta call moves like 60
shares). *What to look for:* delta near **0.50** ≈ at-the-money; **deep ITM** (→1.0)
behaves like stock with less time-premium risk; **far OTM** (→0) is a low-probability,
high-leverage lottery ticket. Delta also **approximates** the risk-neutral chance the
option finishes ITM (III.3) — a useful intuition, not an identity.

### Gamma (Γ) — how fast delta moves

```
Γ = e^(−qT) · n(d1) / (S · σ · √T)          ≥ 0, same for calls and puts
```

*What it means:* the change in **delta** per $1 move — the curvature of your exposure.
*What to look for:* gamma **peaks at the money and near expiration**. High gamma = your
directional exposure changes fast (great when right, punishing when wrong); it is the
twin of theta — you pay in time decay for the privilege of high gamma.

### Theta (Θ) — time decay, **per calendar day**

```
Θ_call = [ −S·e^(−qT)·n(d1)·σ / (2√T) − r·K·e^(−rT)·N(d2)  + q·S·e^(−qT)·N(d1) ] / 365
Θ_put  = [ −S·e^(−qT)·n(d1)·σ / (2√T) + r·K·e^(−rT)·N(−d2) − q·S·e^(−qT)·N(−d1) ] / 365
```

*What it means:* the dollars the option **loses per day** from the passage of time
alone (usually negative for long options). *What to look for:* theta **accelerates as
expiry approaches** and is worst for at-the-money options. Buyers fight theta (it is
the rent on optionality); sellers collect it. The confidence model (III.7) penalizes a
trade whose theta burden over the expected holding window is large relative to the
premium at risk.

### Vega (ν) — volatility exposure, **per 1 IV point**

```
ν = S·e^(−qT)·n(d1)·√T / 100          ≥ 0, same for calls and puts
```

*What it means:* the dollar change per **1 percentage point** change in implied
volatility. *What to look for:* vega is **largest for longer-dated, at-the-money**
options. Long options are **long vega** (helped when IV rises); because v1 has **no IV
history**, it cannot tell you whether IV is cheap or rich (III.10) — so vega is shown
and taught, but never traded *on* in v1.

### Rho (ρ) — interest-rate exposure, **per 1 rate point**

```
ρ_call =  K·T·e^(−rT)·N(d2)  / 100
ρ_put  = −K·T·e^(−rT)·N(−d2) / 100
```

*What it means:* the dollar change per 1 percentage-point change in the risk-free
rate. *What to look for:* rho matters mainly for **LEAPS** (long `T`); for short-dated
trades it is negligible. It is shown for completeness and taught last.

---

## III.3 Probability metrics — and their honest labels

Two probabilities are computed under the model's risk-neutral lognormal assumption.

**Probability ITM** — chance the option expires in the money:

```
P(ITM)_call = N(d2)          P(ITM)_put = N(−d2)
```

**Probability of profit (POP)** — chance the position finishes past its breakeven at
expiration. For a **long single leg**, breakeven `B = K + premium` (call) or
`K − premium` (put). POP reuses the `d2` form evaluated at `B` instead of `K`:

```
d2(B) = [ ln(S/B) + (r − q − σ²/2)·T ] / (σ·√T)
POP_long_call = N(d2(B))      POP_long_put = N(−d2(B))
```

For **defined-risk spreads**, POP = risk-neutral `P` of finishing on the profitable
side of the structure's breakeven (III.11 gives each structure's breakeven).

**The binding label (rendered wherever POP appears):**

> *Model-based probability of profit — the risk-neutral (Black-Scholes) chance of
> finishing past breakeven at expiration, computed from the option's current implied
> volatility. It is a property of today's option prices, **not a measured win rate and
> not a promise**, and it assumes the position is held to expiration with volatility as
> implied now.*

This is the options analog of the equity "signal agreement, not a win probability"
rule (II.4): POP may be **shown**, never sold as a guarantee, until a calibration
pipeline measures realized outcomes.

---

## III.4 Liquidity & tradeability

Options with no real market cannot be priced or exited fairly. Before a contract is
scored it must clear a liquidity screen (which feeds gate **OG1**):

```
mid       = (bid + ask) / 2            when bid > 0 and ask > 0, else lastPrice
spreadPct = (ask − bid) / mid
```

| Constant (config) | Value | Meaning |
|---|---|---|
| `liquidity.maxSpreadPct` | **0.10** | reject a leg whose bid/ask spread exceeds 10% of mid |
| `liquidity.minOpenInterest` | **100** | reject a leg with thin standing interest |
| `liquidity.minVolume` | **10** | reject a leg with no meaningful day's flow |
| `liquidity.softSpreadPct` | **0.05** | spread in [0.05, 0.10] is tradable but costs a confidence penalty (III.7) |

**All pricing uses `mid` (the mark).** Wide markets make every forward number
unreliable, so an illiquid chain/contract is refused, not silently priced off a stale
`lastPrice`. For multi-leg strategies, the screen applies **per leg**, and the net
debit/credit is computed from each leg's mid.

---

## III.5 The directional bridge — consuming the equity read

The options engine does not vote on direction; it **inherits** it:

| Equity `direction` | Options intent |
|---|---|
| `LONG` (a plan was emitted) | **bullish** structures |
| `SHORT` (a plan was emitted) | **bearish** structures |
| `NONE`, or the equity engine **refused** (any gate G1–G5) | **no directional edge → OG3 refusal** |

Because the options engine structures a trade around the **equity plan's target and
stop** (III.6), it requires that the equity engine *emitted a plan* — i.e. passed all
of G1–G5. If the equity read produced no trade, there is no thesis to express in
options, and Part III refuses at **OG3** (never a 500). Non-directional strategies
(long straddle/strangle, iron condor/butterfly) express a **volatility** view, which
requires an IV-regime read the free feed cannot provide (III.10); they are **defined
and taught** in III.11 but are **not selectable in v1**.

The equity confidence `C` carries through as the conviction driving both the scenario
probability `p = C/100` (III.6) and the options confidence base (III.7) — the *same*
provisional, uncalibrated proxy, with the *same* honesty caveats as II.4/II.7.

---

## III.6 The expected-return model — illustrative, defined by the equity plan

The analog of the equity `Plan.ev` (`calibrated: false`). It reuses the equity plan's
two named outcomes — **target** and **stop** — as the two scenarios, weighted by the
equity confidence:

```
p       = C / 100                                  (equity signal-agreement proxy)
V_up    = payoff of the structure at S = equityTarget   (expiration intrinsic value)
V_dn    = payoff of the structure at S = equityStop      (expiration intrinsic value)
cost    = net premium paid  (debit structures)  |  max loss (credit structures)

EV$     = p · (V_up − entryValue) + (1 − p) · (V_dn − entryValue)
EV_R    = EV$ / riskCapital                        (expected return on capital at risk)
```

where `entryValue` = net debit (long/debit) or net credit received (short/credit), and
`riskCapital` = the structure's **defined max loss** (III.11). For a long single leg,
`entryValue = riskCapital = premium`, so `EV_R = EV$ / premium` — an expected **return
on premium**.

**Modeling choices (binding, and honestly labeled):**

- Outcomes are valued at **expiration intrinsic value** at the equity target / stop.
  This deliberately ignores any residual time value (conservative for long premium)
  and assumes the directional move **resolves by the option's expiration**. Contracts
  whose expiration is far shorter than the equity plan's horizon are penalized (theta
  burden, III.7) and may be filtered (OG2).
- `p` and `1 − p` are the equity confidence split — **not** the option's own POP. POP
  (III.3) is reported **alongside** as an independent, model-based cross-check.
- The whole quantity is **illustrative** (`calibrated: false`), labeled: *"illustrative
  expected return under the equity engine's target/stop scenarios with volatility held
  constant — not a forecast."*

**RR analog** (for gate OG4's companion check and display):

```
RR = (V_up − entryValue) / (entryValue − V_dn)     bounded because V_dn ≥ 0
```

---

## III.7 Options "signal agreement" (confidence)

Mirrors the equity `Confidence` (II.4): a **base** minus **itemized, subtractive
penalties**, each with a reason string, bucketed by the *same cutoffs as the equity
confidence* (`config.confidence.buckets`: HIGH ≥ 70, MODERATE ≥ 45, else LOW).

```
base = C_equity                                   (inherit the underlying conviction)
Conf = clamp(round(base − Σ penalties), 5, 95)
```

The base is the equity conviction because **options add no independent directional
evidence** — they add *structural quality*, which the penalties price:

| Penalty (config `optionsConfidence.penalties`) | Points | Fires when |
|---|---|---|
| wide spread | **−5** | leg spreadPct in [`softSpreadPct`, `maxSpreadPct`] (0.05–0.10) |
| theta burden | **−8** | `|Θ_perDay| · holdingDays / entryValue` > `thetaBurdenMax` (**0.50**) |
| low delta (lottery) | **−10** | chosen leg `|Δ|` < `deltaFloor` (**0.20**) |
| earnings inside option life | **−8** | an earnings date falls before expiration (also emits a warning) |
| short-assignment risk | **−6** | a short leg is ITM or within `assignBufferPct` (**2%**) of the money |

`holdingDays` = the equity timeframe's nominal horizon (config
`horizonDays.{intraday,swing,position}`), so theta is judged over how long the plan
expects to hold. Confidence is labeled **"signal agreement (0–100),"** never a win
rate — identical to the equity contract.

---

## III.8 Scoring, ranking, and the single best trade

For the inherited intent, the engine builds a **candidate universe**: every liquid
single-leg contract (calls for bullish, puts for bearish) that clears III.4 and the
DTE window (OG2), **plus** every constructible directional strategy from III.11
(debit/credit verticals, LEAPS, cash-secured put / covered-call overlay). Each
candidate carries: `EV_R` (III.6), `Conf` (III.7), `POP` (III.3), and its defined-risk
payoff (III.11).

**Rank score** — expected edge weighted by conviction (return *on risk*, so the ranker
prefers capital efficiency, consistent with the equity engine ranking in R-multiples,
not raw dollars):

```
rankScore = EV_R · (Conf / 100)
tie-breakers, in order:  higher POP  →  tighter spreadPct  →  fewer legs (simpler)
```

The **best trade** is the top-ranked candidate that also passes **all** OG gates
(III.10). If the top candidate fails a gate it is dropped and the next is considered;
if none survive, the whole analysis is a refusal naming the last binding gate. The
emitted best trade always carries its **exit plan** (III.9) — the stop, target, and
time stop that tell the user when to get out.

**Constrained queries** ("best trade **at this price**", "**at this expiration**") are
the *same* pipeline with the candidate universe pre-filtered:

- `strike` → snapped to the **nearest listed strike** (config
  `constraints.strikeRounding = 'nearest'`); ties round up.
- `expiration` → snapped to the **nearest listed expiration** on/after the request.

A constrained query **may still refuse** — if the requested strike/expiration is
illiquid (OG1), outside the DTE window (OG2), or clears no expected-value margin
(OG4), the honest answer is a refusal, not a forced trade. This is stated in the UI.

---

## III.9 The exit plan — stops, target, and time stop

A defined-risk structure already bounds the worst case at its **max loss** (III.11
payoffs) if held to expiration — but the engine never assumes you hold to zero. Every
emitted options trade carries an **exit plan**: concrete triggers for *when to get
out*, the options analog of the equity stop/target (II.5–II.6). All three are derived
from the equity plan and the option's own greeks, so they inherit the same
invalidation logic (II.5) — the trade's reason *is* the equity read.

**1. Underlying stop — thesis invalidation (primary).**
When the underlying trades to the equity **stop**, the reason for the trade is gone;
close the option. The engine re-prices the structure at that trigger (BSM at
`S = equityStop`, time decayed to the expected exit) so the user gets a concrete
"exit-at" premium and the modeled loss:

```
stopUnderlying   = equityStop
stopOptionValue  = BSM(structure, S = equityStop, T = T − holdingDays/365, σ)   [mid, modeled]
modeledStopLoss  = entryValue − stopOptionValue        (≤ maxLoss by construction)
```

**2. Underlying target — profit exit.**
Symmetrically, when the underlying reaches the equity **target**, take profit. Capped
structures (verticals) value at their structural max:

```
targetUnderlying  = equityTarget
targetOptionValue = min( BSM(structure, S = equityTarget, T − holdingDays/365, σ),  structureMaxValue )
modeledGain       = targetOptionValue − entryValue
```

**3. Time stop — options-specific.**
Theta accelerates and gamma/assignment risk spike into expiry, so the engine sets a
**time stop**: manage or close the trade at a fixed days-to-expiration regardless of
price, or when the equity horizon is reached — whichever comes first:

```
timeStopDte = min( exit.timeStopDte (21),  DTE_at_entry − horizonDays )
```

**4. Premium hard-stop (companion, long single legs only).**
As a simpler backstop for a **long single-leg** option, the engine also states a
premium stop at `exit.premiumStopPct` = **50%** of debit — exit if the option loses
half its premium before the underlying stop is tagged. Defined-risk **spreads** skip
this: their max loss is already bounded and usually small, so they rely on the
underlying stop + max loss.

**Honesty.** `stopOptionValue` / `targetOptionValue` are **modeled** (static-IV BSM at
the trigger; real fills move with the vol surface and the path) and carry the III.14
label. The **max loss** is the only hard, path-independent number — a gap can blow
through the underlying stop, and the defined max loss is what actually caps the
downside. The exit plan is disciplined-exit *guidance*, not a guaranteed fill.

Config: `exit { timeStopDte 21, premiumStopPct 0.50 }` (III.13).

---

## III.10 The options refusal gates — OG1 … OG5

Ordered short-circuit, exactly like G1–G5: evaluated in order, the response names the
**first** failure and its reason string. Cheapest/broadest structural checks first,
then edge, then value, then event.

| Gate | Predicate | Refusal reason (shown) |
|---|---|---|
| **OG1 Liquidity** | at least one contract in the relevant side clears III.4 (spread/OI/volume); the *chosen* structure's every leg clears it | "illiquid chain — the market is too wide to price or exit a fair trade" |
| **OG2 DTE window** | ≥ 1 tradable expiration in `[minDTE, maxDTE]` = **[7, 400]** days (LEAPS candidates require ≥ `leapsMinDTE` = **365**) | "no expirations in the tradable window" |
| **OG3 Directional edge** | the equity engine emitted a plan **and** `C_equity ≥ og3.minEquityConfidence` (**35**, = equity G2 floor) | "no underlying edge — the equity read produced no trade to express" |
| **OG4 Expected-value floor** | best candidate `EV_R ≥ og4.evMargin` (**0.20**) | "no option structure clears the expected-value margin" |
| **OG5 Event** | if an earnings date precedes expiration **and** the structure is **net-short premium**, veto; net-long-premium structures **pass with a warning + penalty** (III.7), since a buyer can benefit from event vol | "earnings inside the contract's life — assignment/gap risk on a short-premium structure" |

**No IV-regime gate in v1** — that check needs IV Rank, which is unavailable on free
data (below). It is deferred to the paid-feed phase, where an "IV too rich to buy /
too cheap to sell" gate joins this list.

### IV Rank — documented as **unavailable**

IV Rank / IV Percentile require a **history** of implied volatility (typically 1 year)
to say whether today's IV is high or low for this name. The free Yahoo feed provides
**current** per-contract IV only — no history. The engine therefore reports:

```
ivRank = { status: 'unavailable', reason: 'no IV history on the free data feed' }
```

and the UI renders **"IV Rank — unavailable (free data)."** The engine **never
fabricates** an IV series. When a paid feed with IV history lands, `ivRank` becomes a
real number and unlocks the IV-regime gate and the non-directional strategies (III.11).

---

## III.11 The strategy library

Greeks are **additive across legs** (a two-leg position's delta is the sum of its
legs' deltas, etc.) — a clean invariant the tests assert. Each structure below lists
its legs, when it is preferred, how strikes/width/DTE are selected, and its
**defined-risk payoff** (max loss, max gain, breakeven). Widths and deltas are config
bands, not magic numbers.

**Directional — selectable in v1** (ranked together by III.8):

| Strategy | Legs | Preferred when | Selection | Max loss / Max gain / Breakeven |
|---|---|---|---|---|
| **Long Call** | +1 call | bullish, high conviction, wants leverage/convexity | Δ in `longDeltaBand` **0.55–0.70**; DTE from timeframe | loss = premium · unbounded gain · BE = K + premium |
| **Long Put** | +1 put | bearish, high conviction | Δ in **[−0.70, −0.55]**; DTE from timeframe | loss = premium · gain = K − premium (to 0) · BE = K − premium |
| **Bull Call (debit) spread** | +call Kₗ, −call Kₕ | bullish, wants to cut cost/theta, capped upside OK (esp. target near Kₕ) | Kₗ ≈ ATM; width `verticalWidthAtr` ≈ **1×ATR** toward the target | loss = netDebit · gain = width − netDebit · BE = Kₗ + netDebit |
| **Bear Put (debit) spread** | +put Kₕ, −put Kₗ | bearish, cost/theta reduction | Kₕ ≈ ATM; width ≈ 1×ATR toward target | loss = netDebit · gain = width − netDebit · BE = Kₕ − netDebit |
| **Bull Put (credit) spread** | −put Kₕ, +put Kₗ | bullish/neutral, collect premium, defined risk | short Δ ≈ **0.30**; width ≈ 1×ATR | loss = width − netCredit · gain = netCredit · BE = Kₕ − netCredit |
| **Bear Call (credit) spread** | −call Kₗ, +call Kₕ | bearish/neutral, collect premium | short Δ ≈ 0.30; width ≈ 1×ATR | loss = width − netCredit · gain = netCredit · BE = Kₗ + netCredit |
| **Cash-Secured Put** | −1 put (cash-secured) | bullish/neutral, willing to own the shares | Δ ≈ **−0.30**, DTE 30–45 | loss = K − premium (to 0) · gain = premium · BE = K − premium |
| **Covered Call** (overlay) | +100 shares, −1 call | own the stock, mildly bullish, want income | short Δ ≈ **0.30** above cost | loss = (cost − premium) to 0 · gain = (K − cost) + premium · BE = cost − premium |
| **LEAPS** | +1 long-dated call/put | position-horizon conviction; stock replacement | DTE ≥ **365**; deep-ITM Δ in `leapsDeltaBand` **0.70–0.85** (minimize extrinsic/theta) | loss = premium · (call) unbounded gain / (put) K − premium · BE = K ± premium |

**Non-directional — defined & taught, NOT selectable in v1** (need an IV-regime read,
III.10): **Long Straddle / Strangle** (long vol — profits on a large move either way;
BE = K ± total premium), **Iron Condor** and **Iron Butterfly** (short vol, range-bound
— defined risk from two credit spreads). These render on the education pages with full
payoff math and are labeled *"requires an IV-regime read (IV Rank), unavailable on the
free feed — enabled with the paid data phase."* The engine will not emit them as a best
trade in v1.

**Selection is numeric, not hardcoded.** The priors above (which structure "fits" a
setup) seed *which* candidates get built; the **ranker (III.8) decides the winner** by
`EV_R · Conf`. There is no "always pick a long call" rule — a debit spread frequently
wins when the equity target sits near a sensible short strike (see III.12).

---

## III.12 Worked example — end to end

Reuses the **QQXR** equity result from II.9: **LONG**, `C = 86`, entry **84.60**, stop
**80.96**, target **91.88**. Options context passed in: `r = 0.04`, `q = 0`, an
expiration **35 days** out (`T = 35/365 = 0.0959`), all quoted at **σ = 0.30**, a
liquid chain (spreads < 5%, OI > 500). `p = C/100 = 0.86`.

**Two candidate single legs and one spread** (BSM per III.1–III.2; prices per share,
×100 per contract):

| Candidate | Premium (mid) | Δ | POP (III.3) | V_up @ 91.88 | V_dn @ 80.96 | EV_R (III.6) | rankScore |
|---|---|---|---|---|---|---|---|
| Long call **K85** | 3.10 | 0.51 | 0.33 | 6.88 | 0 | (0.86·6.88 − 3.10)/3.10 = **+0.91** | 0.91·0.86 = **0.78** |
| Long call **K90** | 1.31 | 0.28 | 0.24 | 1.88 | 0 | (0.86·1.88 − 1.31)/1.31 = **+0.23** | 0.23·0.86 = 0.20 |
| **Bull call 85/90** | 1.79 (debit) | 0.23 net | 0.39 | 5.00 (width) | 0 | (0.86·5.00 − 1.79)/1.79 = **+1.40** | 1.40·0.86 = **1.21** |

**Best trade = the Bull Call Spread (long 85 call / short 90 call).** Its defined-risk
payoff: **max loss 1.79** (netDebit, $179/contract), **max gain 3.21** ($321),
**breakeven 86.79**. It beats the naked K85 call on `EV_R` because the equity target
(91.88) sits **above** the short strike, so the spread captures the full $5 width at a
third of the cost — higher return *on risk*, and a better POP (0.39 vs 0.33). The naked
K90 call is the cheap-lottery trap: real leverage, poor expected value. Confidence =
**86** inherited, **no** option penalties (tight spreads, Δ 0.23 net ≥ floor, theta
over ~10 swing days < 50% of debit, no earnings in 35 days). All gates: OG1 liquid ✓ ·
OG2 35 ∈ [7,400] ✓ · OG3 equity plan emitted, C 86 ≥ 35 ✓ · OG4 EV_R 1.40 ≥ 0.20 ✓ ·
OG5 no earnings ✓ → **emitted**.

**Emitted:** *Buy the QQXR 85/90 bull call spread, 35 DTE · net debit $1.79 · max loss
$179 · max gain $321 · breakeven 86.79 · illustrative expected return +140% on risk ·
model-based POP 39% · signal agreement 86.*

**Exit plan (III.9):** *stop — exit if QQXR trades to **80.96** (the equity
invalidation); the spread is modeled near ~$0.20 there, a ~$159 loss (hard cap $179).
Target — take profit at QQXR **91.88**, where the spread is at its **$5.00** max
(+$321). Time stop — **21 DTE** (min of 21 and 35 − 10 swing horizon): manage/close
regardless of price. No separate premium stop (defined-risk spread; the $179 max loss
is the floor).*

**Counterfactual:** the II.9 counterfactual equity read **refused at G2** (`C = 29`, no
plan emitted). With no underlying edge, Part III refuses at **OG3**: *"no underlying
edge — the equity read produced no trade to express."* No chain is even scored. This is
the intended behavior: **options never manufacture a thesis the equity engine
declined.**

> The exact greeks/prices above are the *illustrative* output of the III.1–III.2
> formulas at the stated inputs (rounded to 2 dp). The Phase-1 **golden BSM test** pins
> the engine's numbers against a reference implementation, and this worked example is
> regenerated from that verified output to the published precision — the binding items
> are the **formulas, constants, gates, and selection rule**, not the rounded digits.

---

## III.13 Constants (proposed — the versioned options config)

All live in `packages/options-engine/src/config.ts` behind `OPTIONS_ENGINE_VERSION`
(proposed **`0.1.0`** — beta, unshipped) and `optionsConfigHash`:

```
riskFreeRate            0.04          dividendYield            profile → default 0
liquidity.maxSpreadPct  0.10          liquidity.softSpreadPct  0.05
liquidity.minOpenInterest 100         liquidity.minVolume      10
dte.minDTE  7   dte.maxDTE 400        leapsMinDTE 365
longDeltaBand  [0.55, 0.70]           leapsDeltaBand [0.70, 0.85]
shortDeltaTarget 0.30                 deltaFloor 0.20
verticalWidthAtr 1.0                  assignBufferPct 0.02
og3.minEquityConfidence 35            og4.evMargin 0.20
confidence.penalties  { wideSpread 5, thetaBurden 8, lowDelta 10, earnings 8, assignment 6 }
thetaBurdenMax 0.50                   horizonDays { intraday 2, swing 10, position 40 }
confidence.buckets      (reuse equity: HIGH ≥ 70, MODERATE ≥ 45, else LOW)
exit { timeStopDte 21, premiumStopPct 0.50 }   (the exit plan, III.9)
rank  EV_R · (Conf/100), tie-break POP ↓ then spread ↑ then legs ↑
```

These are **reasoned priors**, not measured optima — the same status the equity weights
carry (II.2). A future options-calibration pipeline tunes them; the `/methodology`
page says so.

---

## III.14 Limitations — what options analysis cannot see

Published verbatim at `/methodology/options/limitations`, in addition to every Part II
limitation (which still applies to the underlying read):

1. **POP and expected return are model outputs, not promises.** Both come from
   Black-Scholes under a risk-neutral lognormal assumption with volatility held
   constant. They describe today's option prices, not the future.
2. **Options can expire worthless — a bought option's max loss is 100% of premium.**
   The engine emphasizes *defined-risk* structures for exactly this reason, and always
   states max loss in dollars.
3. **European pricing of American options** (III.1) — early-exercise value is
   approximated away and only flagged; deep-ITM near dividends is where this matters.
4. **No volatility view on free data.** Without IV history there is no IV Rank, so the
   engine cannot say IV is cheap or rich, will not sell/buy premium *on volatility*,
   and does not offer non-directional strategies in v1 (III.10–III.11).
5. **Static-IV, hold-to-expiration assumption.** Real P/L depends on the path and on IV
   changes the model ignores; a mid-life exit can differ materially from the intrinsic
   scenarios in III.6.
6. **Free-data caveats compound for options:** quotes are delayed, greeks are computed
   (not vendor-supplied), and thin/wide chains are common — the liquidity gate (OG1)
   is the primary defense, and every response carries its data timestamp.
7. **Assignment, pin, and dividend risk** on short legs are real and only partially
   modeled (OG5 + the assignment penalty). Short options can be assigned early.
8. **Nothing here is financial advice.** Options carry more risk than the underlying
   shares. The engine reports structure and defined-risk arithmetic; the decision, and
   the risk, belong to the user.