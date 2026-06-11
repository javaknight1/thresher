# KICKOFF-PROMPT.md — paste this into Claude Code

Prerequisites before running (you, the human):

1. `mkdir thresher && cd thresher && git init`
2. Copy into the repo: `CLAUDE.md` (root), `TODO.md` (root),
   `docs/THRESHER-DESIGN.md`, `docs/THRESHER-METHODOLOGY.md`
3. Optional but recommended: `.claude/skills/thresher-methodology/SKILL.md` (see below)
4. Create `.env.local` later at M1 (Upstash, Supabase, Clerk, Sentry, PostHog keys);
   nothing is needed for M0.

---

## The prompt (paste everything below this line)

You are implementing Thresher, a technical-analysis confluence engine and web app.
This is a real product build, not a prototype.

READ FIRST, IN THIS ORDER:
1. CLAUDE.md — binding conventions and hard rules
2. docs/THRESHER-DESIGN.md — architecture, API contract, frontend spec
3. docs/THRESHER-METHODOLOGY.md — the binding spec for ALL engine math
4. TODO.md — your task list with acceptance criteria

OPERATING RULES:
- Work strictly milestone-by-milestone per TODO.md. Check off items as you complete them.
- The methodology doc is law for engine math. Implement formulas exactly as specified —
  including Wilder seeding details, clamps, buffers, and evaluation order of gates.
  If you believe a formula is wrong or ambiguous, STOP and ask me; never silently "fix" it.
- All engine constants come from config.ts. If you find yourself typing a magic number
  in a logic file, you are doing it wrong.
- packages/engine is pure: no I/O, no env, no Date.now(). If an engine function needs
  time or external facts (earnings date), they arrive as parameters.
- Every score component must emit its reason string. Make the types enforce this.
- Run `pnpm typecheck && pnpm lint && pnpm test` before declaring any TODO item done.
  Show me the test output, not a summary of it.
- Conventional commits, one logical change each, after each green test run.
- Do not install dependencies beyond those named in CLAUDE.md without asking.
- Do not write marketing copy that promises returns. Disclaimers per CLAUDE.md are required.

EXECUTION PLAN:

PHASE M0 — Engine package.
Implement every M0 item in TODO.md. The critical deliverable is the worked-example
fixture test: methodology doc II.9 must reproduce EXACTLY (composite +0.745,
confidence 86 with a single −5 thin-volume penalty, stop 80.96, target 91.88 with
overheadWarning, RR 2.00, all five gates passing) and the counterfactual must refuse
at G2 with confidence 29. If your implementation produces different numbers, your
implementation is wrong — debug against the doc's step-by-step arithmetic, do not
adjust the fixture.
When M0 acceptance criteria are all green: STOP. Print a summary of the engine's
public API, the full test output, and coverage. Wait for my review. Do not start M1.

PHASE M1 — Live data + Analyze page + deploy.
Only after my explicit go-ahead. Implement every M1 item. The API response must match
design doc §8 field-for-field. The UI must implement the §6.1 visual system and §6.2
layout including the NO TRADE state and the trade-ladder signature element. Ask me for
env keys when you reach the integration points; stub with the MockProvider until then.
When M1 acceptance criteria are green and the Playwright smoke passes: STOP.
Give me a manual QA checklist (specific tickers and states to verify in the browser).
Wait for my review. Do not start M2.

PHASES M2–M4 — proceed per TODO.md after my go-ahead at each milestone boundary,
asking for decisions on the parking-lot items when you reach them.

START NOW with M0: scaffold the monorepo, then config.ts and types, then indicators
with their golden tests (one indicator at a time, test before moving on), then
families, then composite/confidence, then plan logic, then gates, then the worked
example. Show your plan for the engine package file layout before writing code.

---

## Optional: project skill (`.claude/skills/thresher-methodology/SKILL.md`)

```markdown
---
name: thresher-methodology
description: Binding math spec for the Thresher TA engine. Use whenever implementing,
  modifying, testing, or reviewing anything in packages/engine — indicators, signal
  families, weights, composite score, confidence, penalties, stops, targets, refusal
  gates, or sizing. Also use when writing engine tests or the methodology pages.
---

# Thresher engine methodology

The complete, binding specification for all engine math lives in
`docs/THRESHER-METHODOLOGY.md` (formulas, Part I) and
`docs/THRESHER-DESIGN.md` §4–§5 (point tables, weights, gates).

Rules:
1. Read the relevant section of the methodology doc BEFORE writing or changing
   engine code. Formulas must match exactly, including Wilder seeding, clamps,
   buffers (0.45/0.8/2.2/2.5×ATR), thresholds (±0.22, conf 35, RR 1.2, G4 0.25R),
   and gate evaluation order G1→G5.
2. The worked example (methodology II.9) is the canonical fixture. Any engine
   change that alters its outputs is a spec violation unless the doc changed first.
3. Never invent, "improve," or simplify financial logic. Ambiguity → stop and ask.
4. All constants belong in packages/engine/src/config.ts, versioned via configHash.
```