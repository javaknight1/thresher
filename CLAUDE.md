# CLAUDE.md — Thresher

Technical confluence desk: ticker + timeframe in → complete trade story out
(entry/stop/target, reasoning, expected outcomes, confidence) — or an honest refusal.

## Canonical documents (read before any engine or product work)

- `docs/THRESHER-DESIGN.md` — architecture, data layer, API contract, frontend spec, roadmap
- `docs/THRESHER-METHODOLOGY.md` — **the binding spec for all engine math**

Rules of precedence: if code and methodology doc disagree, the doc wins.
If the doc is ambiguous or silent, STOP and ask — do not invent financial logic.
Never "improve" a formula, weight, threshold, or gate without an explicit instruction;
these are versioned design decisions, not implementation details.

## Stack (canonical — do not substitute)

- pnpm monorepo: `packages/engine` + `apps/web`
- `apps/web`: Next.js (App Router), TypeScript strict, deployed to Cloudflare Pages
- Data: `yahoo-finance2` behind the `MarketDataProvider` interface (design doc §2.1)
- Cache/rate-limit: Upstash Redis (`@upstash/redis`, `@upstash/ratelimit`)
- DB: Supabase · Auth: Clerk · Errors: Sentry · Analytics: PostHog · Uptime: BetterStack
- Tests: Vitest · E2E: Playwright

## Hard rules — packages/engine

1. **Pure functions only.** No I/O, no network, no env vars, no `Date.now()` — time and
   bars are always passed in. `analyze(bars, config, context) → AnalysisResult`.
   This purity is what makes the backtester (design doc §7) replay the exact user-facing code.
2. **Every score component emits a reason string.** No component may move a score
   without producing the human-readable detail shown in the UI. This is a type-level
   requirement, not a convention.
3. **All constants live in `packages/engine/src/config.ts`**: weights, thresholds
   (±0.22, conf 35, RR 1.2, G4 margin 0.25), ATR multipliers (0.45/0.8/2.2/2.5/1.4),
   penalty points, pivot params. Export `ENGINE_VERSION` and a deterministic `configHash`.
   Zero magic numbers in logic files.
4. **Refusals are first-class results**, never errors. A refusal carries the failed
   gate and reason string.

## Hard rules — product

- Confidence is labeled "signal agreement," never "probability" or "win rate,"
  until the calibration pipeline exists.
- The disclaimer block (methodology doc II.10 item 7) renders on every page that
  shows a trade plan. Non-negotiable.
- No copy anywhere may promise returns or use predictive phrasing
  ("will rise" → "the setup targets").
- Every displayed number deep-links to its `/methodology` page (design doc §6.5).

## Testing requirements

- Indicators: golden-file tests. Cross-validate SMA/EMA/MACD/RSI/ATR/ADX against the
  `technicalindicators` npm package (dev-dependency only) on fixed fixtures, plus
  hand-computed micro-fixtures (5–10 bars) for seeding/smoothing edge behavior.
- Engine: unit tests for every family component vote, every penalty, every gate —
  including the methodology doc II.9 worked example and its counterfactual,
  reproduced exactly as fixtures (expected: S=+0.745, C=86, stop=80.96, target=91.88,
  RR=2.00, emitted; counterfactual: C=29, refused at G2).
- Coverage gate: ≥ 90% lines in `packages/engine`.
- API route: integration tests with a `MockProvider`; never call Yahoo in tests.
- `pnpm typecheck && pnpm lint && pnpm test` must pass before any task is marked done.

## Workflow

- Work milestone-by-milestone per `TODO.md`. Check items off as completed.
- HARD STOP after M0 and after M1 for human review (see kickoff prompt).
- Conventional commits (`feat(engine): …`), one logical change per commit.
- Never commit secrets; all keys via `.env.local` (gitignored) with `.env.example` kept current.