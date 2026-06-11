# THRESHER — Methodology Reference

**Every number the engine produces, derived from first principles.**

This document serves two purposes: it is the implementation spec for `packages/engine`, and it is the source content for the public `/methodology` documentation pages. If a calculation isn't in this document, the engine doesn't do it.

Companion to `THRESHER-DESIGN.md`. Version 1.0.

**Docs site structure** (each Part I/II section below = one page):

```
/methodology                    → overview + pipeline diagram
/methodology/indicators/{slug}  → sma, ema, macd, rsi, atr, adx, obv,
                                  relative-volume, bollinger, pivots
/methodology/engine/{slug}      → families, weights, composite, confidence,
                                  stops, targets, gates, sizing
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