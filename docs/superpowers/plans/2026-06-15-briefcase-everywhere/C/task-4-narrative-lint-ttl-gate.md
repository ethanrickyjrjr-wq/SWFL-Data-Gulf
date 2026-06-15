# C-4 — narrative-lint `"ttl"` gate (single enforcement seam, flag-gated) — **OPUS**

## Goal
Enforce no-stale/no-invention at the EXISTING build-time seam (RULE 3 C2) by adding a `"ttl"` gate and
injecting verdict violations into the existing rebuild loop. **Ships behind a feature flag, default OFF**,
because it has live deliverable blast radius (B6).

## Files
- **MODIFY** `lib/deliverable/narrative-lint.ts` — **add `export` to `extractNumbers`** (B4 — currently
  module-private; do NOT duplicate it). Extend the `Gate` union with `"ttl"`; add
  `lintVerdictFreshness(narrative, verdicts, now): NarrativeViolation[]` (reuses `NarrativeViolation`,
  `normalizeNumber`, `extractNumbers`).
- **MODIFY** `lib/deliverable/build.ts` — guarded by `RECONCILE_TTL_GATE_ENABLED` (env, default OFF):
  compute verdicts for filed metrics (C-2 `reconcileMetric` + C-3 `lookupLakeFact`); after
  `lintDeliverableNarrative(narrative, anchors)`, append the `ttl` violations into the SAME
  `lint.violations` array and into `lint.ok` BEFORE the existing regenerate-once / hard-strip path; extend
  `describeViolations` with a `ttl` branch. **Flag OFF ⇒ zero `ttl` violations appended ⇒ build.ts behaves
  exactly as today.**

## Logic / Hard invariants
- A `"ttl"` violation fires when verdict prose (a) asserts a number whose verdict is
  `cannot_assert_stale`, or (b) asserts a numeric figure with no source/timestamp anchor (mirrors the
  exact-anchor discipline).
- **Single seam:** plugs into the existing loop only — no new call site in the materialization path. The
  comparator (C-2) withholds values deterministically (verdict computation); this lint is the ONLY thing
  that strips/refuses a number from customer prose. No second censor. The `agentsAreMocked()`
  short-circuit is preserved.
- **Flag discipline (B6).** `RECONCILE_TTL_GATE_ENABLED` defaults OFF. It is flipped ON only after (a) the
  full rebuild has stamped `output.expires` on every brain AND (b) C-2/C-3's catalog-gap `not_found`
  branch is merged. Otherwise a stale/uncataloged brain's filed metric could be wrongly stripped from a
  customer deliverable.
- `describeViolations` `ttl` branch: "These figures are stale or unsourced — drop them or cite the lake
  fact + its freshness: …".

## Acceptance test
- **Flag ON (test):** a narrative asserting `$362,000` whose verdict is `cannot_assert_stale` → one `ttl`
  violation → `lint.ok=false` → regenerate → hard-strip. A clean verdict (cites both sides + fresh) → zero
  `ttl` violations.
- **Flag OFF (default):** `build.ts` output is byte-identical to today (no verdict computation, no `ttl`
  violations).
- Existing number/smoothing/grounded/jargon behavior unchanged (regression fixtures green);
  `extractNumbers` import resolves (now exported).
