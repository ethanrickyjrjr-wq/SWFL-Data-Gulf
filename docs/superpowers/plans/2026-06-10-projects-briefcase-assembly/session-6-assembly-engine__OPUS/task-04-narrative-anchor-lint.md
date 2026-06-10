# Task 04 — Number-anchor lint (EXACT) + grounded-conditional lint + jargon scrub + regenerate-then-strip

**This is the moat enforcement.** Three independent gates on the customer-facing narrative — anchoring alone is NOT enough:

- **`[LB-R2]` EXACT-MATCH number anchoring (NOT the 5% tolerance).** Every numeric token in the narrative must equal an item-snapshot value by **equality** after format-normalization only (`$30,074` == `30074`, `+60bps` == `60`). **No rounding band, no 5% band.** Resolving the rounding ambiguity cleanly: the LLM must emit numbers **verbatim** as they appear in the snapshot — "about $30K" for a `$30,074` fact is itself a **smoothing violation** (CLAUDE.md data-protocol-v3 rule 8: don't re-encode hard numbers into vague English), so it fails the same way an invented number does. Verbatim-or-fail unifies R2 with the no-smoothing gate (R3) and removes the "is this rounding legitimate?" judgment call entirely. **Do NOT reuse `isAnchored`'s `0.05` tolerance** — that was designed for chart *rendering*, where a bar within 5% is visually fine; in a provenance deliverable a number 5% off the cited figure is a fabrication that passes. Keep the 5% tolerance on the chart-render path only; the narrative path uses equality. Write your own `anchorsExactly(token, snapshotNumbers)`.
- **`[LB-R3]` Grounded-conditional / no-smoothing check.** Number-anchoring can't see a number-free forecast. A section intro like "rents will keep climbing" carries no numeric token, so anchoring passes it — but it's an ungrounded prediction. Run every `exec_summary` + section `intro` through the `isGroundedConditional` / no-smoothing filter from `refinery/render/speaker.mts` (find the exported check; it enforces THE-GOAL's "speculation is conditional IF/THEN + falsifier, not flat"). An ungrounded forecast must be flagged and either rewritten to a cited fact, moved to `inference_notes` with an `[INFERENCE]` tag + falsifier, or stripped.
- **`[ADDED]` jargon scrub** (deterministic, cosmetic — NOT a substitute for the two above): strip `master/brain/payload/grain/dossier` leaks reusing the speaker scrub patterns.

**Files:** Create `lib/deliverable/narrative-lint.ts`. Test: `lib/deliverable/narrative-lint.test.ts`.

- [ ] **Step 1: Failing tests — poisoned narrative (three gates).**
  - Number gate: snapshot has `$30,074`; narrative says "vacancy hit 14%" (not in any item) → flagged + stripped. AND a near-miss: snapshot `$30,074`, narrative says "$31,500" (≈5% off) → **flagged** (equality, not tolerance — this is the test that proves R2).
  - Grounded gate: narrative section intro "rents will keep climbing" (no number, no condition, no falsifier) → flagged by the grounded-conditional check.
  - Jargon gate: a planted "the dossier shows…" → stripped.

```ts
import { lintDeliverableNarrative } from "./narrative-lint";
it("flags a number with no item anchor", () => {
  const r = lintDeliverableNarrative(narrative, itemNumbers);
  expect(r.violations.some(v => v.token === "14%")).toBe(true);
});
it("strips the offending sentence", () => {
  expect(lintDeliverableNarrative(narrative, itemNumbers).stripped).not.toContain("14%");
});
```

- [ ] **Step 2: Implement the EXACT number gate `[LB-R2]`.** Extract every numeric token from `exec_summary` + each section `intro` (regex for currency/percent/bps/plain numbers; mirror chart-block-lint's extraction for the token-finding only). Build the anchor set = all numbers in `items_snapshot`, normalized (strip `$`, `,`, `bps`, `%`, sign-as-written). For each narrative number, require an **exact normalized equality** match in the anchor set — `anchorsExactly`, NOT `isAnchored(...,0.05)`. Collect violations with the containing sentence. Provide `strip()` that removes whole offending sentences.

- [ ] **Step 3: Implement the grounded-conditional gate `[LB-R3]`.** Import the `isGroundedConditional` / no-smoothing check from `refinery/render/speaker.mts` (verify the exact exported symbol in-session). Run each `exec_summary` + section `intro` through it; a forward-looking/forecast clause that isn't a cited fact and isn't a conditional (IF/THEN + falsifier) is a violation → flag it; the build route (Task 03) moves it to `inference_notes` on regeneration or strips it.

- [ ] **Step 4: `[ADDED]` jargon scrub** (cosmetic — explicitly NOT a substitute for Steps 2-3). Strip `master/brain/payload/grain/dossier` leaks reusing the speaker-layer forbidden-term list (`refinery/render/speaker.mts`).

- [ ] **Step 5: Regenerate-then-strip wiring** (used by Task 03): on first lint failure (any of the three gates), re-call the model once with the violation list named ("these numbers are not in the items: …; remove them" / "this clause is an ungrounded forecast: …; restate as a cited fact or a conditional with a falsifier, or drop it"); if the second pass still violates, hard-strip the offending sentences and proceed. Log how many regenerations/strips happened.

- [ ] **Step 6: Tests green** (all three gates) **; commit.** `git add lib/deliverable/narrative-lint.ts lib/deliverable/narrative-lint.test.ts && git commit -m "feat(deliverable): exact number-anchor + grounded-conditional + jargon lint; regenerate-then-strip"`
