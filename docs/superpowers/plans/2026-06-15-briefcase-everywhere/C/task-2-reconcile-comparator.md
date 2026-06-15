# C-2 — Reconciliation comparator + verdict contract — **OPUS**

## Goal
The deterministic comparator and its verdict contract — the heart of lane 3 — built and unit-tested NOW
against lane-tagged fixtures, before B or the freshness brain land.

## Files
- **NEW** `lib/reconcile/types.ts` — the contract (below).
- **NEW** `lib/reconcile/reconcile.ts` — `reconcileMetric(fact: LaneOneFact | null, assertion:
  LaneTwoAssertion, now?: string): ReconciliationVerdict`. Pure.
- **NEW** `lib/reconcile/fixtures/*.json` — lane-tagged fixtures (one per status; each tagged
  `"lane_source": "fixture"`), INCLUDING a no-TTL-basis (uncataloged) case.
- **NEW** `lib/reconcile/reconcile.test.ts` — `bun:test`.

## The verdict contract (`lib/reconcile/types.ts`)
```ts
export type VerdictStatus =
  | "verified"            // value matches at the same grain AND the lake fact is fresh
  | "needs_review"        // both present & fresh, but values differ (the discrepancy case)
  | "cannot_assert_stale" // lake fact HELD but past TTL (C-1 gate) — refuse to assert; offer re-pull
  | "out_of_grain"        // assertion is finer-grained than the lake holds — never fabricate
  | "not_found";          // no lake metric resolves (missing/ambiguous label) OR no TTL basis (uncataloged)

export interface LaneOneFact {            // lane 1 — our cited lake fact
  brain_id: string; metric_slug: string; label: string;
  value: number | string; grain: string;            // e.g. "zip-month"
  source: { url: string; fetched_at: string; tier: 1|2|3|4; citation: string };
  expires?: string;                                  // resolved by C-3; ABSENT ⇒ no TTL basis ⇒ not_found
}
export interface LaneTwoAssertion {       // lane 2 — the user's-AI assertion
  report_id: string; label: string; value: string;
  freshness_token: string; source_url?: string; source_label?: string;
  metric_slug?: string;                              // optional (forward path); else resolve by label
  asserted_grain?: string;
  origin: "mcp" | "web";
}
export interface ReconciliationVerdict {
  status: VerdictStatus;
  ours?: { value: number | string; metric_slug: string; expires: string;
           source: LaneOneFact["source"] };          // OMITTED entirely when value is withheld
  theirs: { value: string; freshness_token: string; source_url?: string };
  delta_pct?: number;                                // signed; numeric needs_review only
  fresher_side?: "ours" | "theirs" | "tie" | "unknown";  // "unknown" when ours withheld
  grain?: { lake: string; asserted?: string; mismatch: boolean };
  reason: string;                                    // deterministic, prose-free machine reason
}
```

## Logic / Hard invariants (strict order — first failing gate wins)
1. **Resolve:** `fact == null` → `not_found`.
2. **No TTL basis (catalog gap, B2 + R1):** `fact.expires === undefined` → `not_found` (reason: "no TTL
   basis — `<brain>` absent from catalog"). **Test `=== undefined`, NOT `!fact.expires`** — a
   present-but-empty/whitespace `expires` is a stamped-but-corrupt value, not a missing basis, so it must
   fall through to step 3's `freshnessGate` (which fail-closes garbage → expired). **Never
   `cannot_assert_stale`** for a truly-absent TTL — we do not claim "expired" for a number we have no TTL
   for.
3. **TTL gate (C-1):** `freshnessGate(fact.expires, now)` expired → `cannot_assert_stale`; **omit `ours`
   entirely** (reason carries `expires`, never the number); `fresher_side:"unknown"`.
4. **Grain:** `assertion.asserted_grain` finer than `fact.grain` → `out_of_grain` (no value compare).
5. **Value compare:** `normalizeNumber` (imported from `lib/deliverable/narrative-lint.ts`) on both;
   exact-equal → `verified`; else `needs_review` with signed `delta_pct`.
6. `fresher_side` from `fact.source.fetched_at` vs the assertion's `…-{YYYYMMDD}` token tail; `"unknown"`
   if unparseable OR `ours` withheld.
7. **Pure & deterministic** — no LLM, no I/O, no `Date.now` except via injectable `now`. **Reuse**
   `normalizeNumber` — never re-implement.
8. **Slug-resolution policy (OPUS spec C-3 implements):** match `label` → `key_metrics[].metric` slug by
   case/whitespace normalization; **multiple metrics with the same normalized label → `not_found`** (never
   guess); an `assertion.metric_slug`, when present, wins.

## Acceptance test
- One fixture per status. `verified`: match+fresh. `needs_review`: `"360000"` vs `362000` →
  `delta_pct ≈ -0.55`, both surfaced. `cannot_assert_stale`: past `expires` → `ours` absent, no number in
  `reason`, `fresher_side:"unknown"`. `out_of_grain`: `asserted_grain:"parcel"`. `not_found`: BOTH the
  ambiguous-label case AND the **no-TTL-basis (uncataloged brain, `expires` absent)** case — and the
  no-TTL-basis verdict is `not_found`, NOT `cannot_assert_stale`.
- Determinism: same inputs + fixed `now` → byte-identical verdict.
