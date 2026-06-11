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
