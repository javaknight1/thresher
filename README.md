# Thresher

Technical confluence desk: ticker + timeframe in → a complete trade story out
(entry, stop, target, reasoning, expected outcomes, confidence) — **or an honest
refusal**. Refusing bad trades is the product: most tickers on most days should
produce NO TRADE, with the failed gate named.

*A thresher separates grain from chaff. (Also a shark.)*

Currently personal-use software, built to production standards. US equities and
ETFs only; advisory output only — no execution, no return predictions, and
confidence is labeled signal agreement, never probability, until the
calibration pipeline ships.

## Layout

| Path | What it is |
|---|---|
| `packages/engine/` | The confluence engine — pure TypeScript, zero I/O. Indicators → signal families → composite → confidence → trade plan → refusal gates. Fully unit-tested against the methodology doc's worked example. |
| `apps/web/` | Next.js app (App Router): the Analyze page, `/api/v1/analyze`, and the public `/methodology` documentation pages. Deploys to Cloudflare Pages. |
| `docs/` | The canonical specs: `THRESHER-DESIGN.md` (architecture, API, frontend) and `THRESHER-METHODOLOGY.md` (**binding** spec for all engine math). |
| `reference/` | The original single-file React prototype the production UI is ported from. |
| `.claude/` | Project skill that auto-loads the methodology spec during engine work. |
| `CLAUDE.md` | Binding conventions and hard rules for development. |
| `TODO.md` | Milestone roadmap (M0 engine → M1 ship → M2 accounts → M3 honesty board → M4 calibration) with acceptance criteria. |
| `MANUAL.md` | Human setup steps: accounts and API keys that can't be automated. |
| `KICKOFF-PROMPT.md` | The original build brief. |

## Development

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test   # the gate for every change
pnpm --filter @thresher/web dev            # local app
```

Engine rules that matter everywhere: all math constants live in
`packages/engine/src/config.ts` (versioned via `configHash`); every score
component emits a human-readable reason string; if code and
`docs/THRESHER-METHODOLOGY.md` disagree, the doc wins.
