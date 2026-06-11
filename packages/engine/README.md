# @thresher/engine

Pure-TypeScript technical-confluence engine. Bars in → complete trade story out
(entry/stop/target, reasoning, confidence) — or a first-class refusal naming the
failed gate.

**The binding spec is `docs/THRESHER-METHODOLOGY.md`** (formulas) and
`docs/THRESHER-DESIGN.md` §4–§5 (point tables, weights, gates). If this code and
those docs disagree, the docs win.

## Public API

```ts
import { analyze, DEFAULT_CONFIG } from '@thresher/engine';

const result = analyze(bars, DEFAULT_CONFIG, {
  symbol: 'NVDA',
  timeframe: 'swing',            // 'intraday' | 'swing' | 'position'
  tradingDaysToEarnings: 7,      // provider-supplied; null/undefined = unknown
});
```

- `analyze(bars: Bar[], cfg: EngineConfig, ctx: Context): AnalysisResult` — the
  entry point. Pure: no I/O, no clock, no env. The backtester replays this exact
  function.
- `determine(snapshot, cfg, ctx)` — the determination layer (families →
  composite → confidence → plan → gates → story) driven by indicator readings
  directly. The methodology II.9 worked-example fixture uses this.
- `buildSnapshot(bars, cfg)` / `minBars(cfg)` — bars → `IndicatorSnapshot`.
  Throws on insufficient history (a data error, not a refusal; refusals are
  reserved for gate decisions on valid data).
- `ENGINE_VERSION`, `DEFAULT_CONFIG`, `configHash`, `hashConfig(cfg)` — every
  constant lives in `src/config.ts`; the hash is recorded with stored analyses
  so backtests are reproducible.
- Lower-level pieces are exported for tests and the backtester: family scorers
  (`scoreTrend` …), `compositeScore`, `resolveDirection`, `computeConfidence`,
  `buildStop`, `buildTarget`, `buildSizing`, `evaluateGates`, `buildStory`, and
  every indicator (`smaSeries`, `emaSeries`, `macdSeries`, `rsiSeries`,
  `atrSeries`, `adxSeries`, `obvSeries`/`obvDelta`, `relVol`, `percentB`,
  `pivotLevels`).

### Result shape (see `src/types.ts`)

`AnalysisResult` carries: `direction`, `composite`, `confidence` (score, bucket,
itemized `penalties`), `gates[]` (evaluated in order), `plan` xor `refusal`,
`families[]` (every component vote with its reason string — required at the
type level), `levels` (with synthetic flags), `indicators`, `flags`, `story`,
`engineVersion`, `configHash`.

## Semantics worth knowing (settled design decisions)

- **Price levels are denominated in cents.** Stop and target are rounded to
  2 dp after their bounds are applied — this is how the methodology II.9
  arithmetic (stop 80.96, target 91.88) reproduces exactly.
- **Gates short-circuit.** `gates[]` contains only the gates actually evaluated;
  evaluation stops at the first failure, which becomes `refusal`. A trade plan
  is emitted iff all five pass — `plan` is `null` whenever `refusal` is set.
- **Confidence penalties apply only when a direction exists.** When the
  composite nets out to NONE, confidence is the base term alone (prototype
  parity; dissent/RSI-extreme penalties are undefined without a direction).
- **Targets prefer multi-touch zones** (methodology I.10): the nearest zone with
  strength ≥ 2 wins if one exists in the trade direction, else the nearest zone,
  else the synthetic ±2.5×ATR fallback (flagged).
- **G5 earnings veto:** intraday 1 trading day, swing 3; position is never
  vetoed — earnings are surfaced via `flags.earningsFlag` instead. Unknown
  earnings date ⇒ G5 passes ("earnings date unknown — no veto").
- **Guards (documented, non-financial):** relative volume with a zero 20-bar
  mean returns 1 (neutral); Bollinger %B with σ = 0 returns 0.5; ADX divisions
  by zero yield 0 (never NaN).
- Confidence is **signal agreement**, not probability — UI labeling rule until
  the calibration pipeline (design §7) ships.

## Tests

```
pnpm --filter @thresher/engine test            # 22 files · 362 tests
pnpm --filter @thresher/engine test:coverage   # gate: ≥ 90% lines (current: 97%)
```

- **Indicators:** golden cross-validation vs `technicalindicators` (dev-dep
  only) plus hand-computed micro-fixtures for seeding/smoothing edges.
- **Worked example:** methodology II.9 reproduced exactly (S=+0.745, C=86,
  stop=80.96, target=91.88, RR≈2.00, 68 shares, emitted) and the counterfactual
  (C=29, refused at G2). The counterfactual stipulates a momentum score (−0.40)
  unreachable from the component table, so it drives the determination
  functions directly, as the doc does.
- **Properties:** 120 deterministic pseudo-random market shapes × invariants
  (no NaN; long ⇒ stop < entry < target, mirrored short; emitted ⇒ all gates
  pass; refusal ⇒ the named gate actually failed; NONE ⇒ refusal at G1).

## Layout

```
src/
  config.ts        ALL constants · ENGINE_VERSION · configHash
  types.ts         domain types (Detail requires a reason string)
  analyze.ts       analyze() / determine() orchestration
  indicators/      sma ema macd rsi atr adx obv relative-volume bollinger
                   pivots snapshot
  families/        trend momentum volume structure
  composite.ts confidence.ts gates.ts story.ts
  plan/            stop target sizing
test/              mirrors src + worked-example, properties, fixtures
```
