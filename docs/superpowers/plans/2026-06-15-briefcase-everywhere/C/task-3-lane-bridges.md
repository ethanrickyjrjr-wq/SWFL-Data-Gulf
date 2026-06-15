# C-3 — Lane bridges: slug map, live lake lookup, assertion loader — **OPUS**

## Goal
Wire the two lanes to real data: resolve the Lane-2 label→slug gap, fetch the current cited fact (Lane 1)
resiliently with a catalog-gap-safe derivation fallback, and narrow a `ProjectItem` into a typed
assertion. Slug resolution is correctness (a wrong match could pass a stale/wrong number as `verified`),
so it is OPUS.

## Files
- **NEW** `lib/reconcile/slug-map.ts` — `resolveMetricSlug(report_id, label, brainMetrics): string | null`
  (normalized match; ambiguous/no-match → `null`; never guess).
- **NEW** `lib/reconcile/lane1.ts` — `lookupLakeFact(report_id, slugOrLabel, zip?): Promise<LaneOneFact |
  null>`.
- **NEW** `lib/reconcile/lane2.ts` — `toAssertion(item: ProjectItem): LaneTwoAssertion | null`.
- **MODIFY** `lib/project/items.ts` — add **optional, non-breaking** `metric_slug?: string` to the
  `metric` ProjectItem (and `table_slice` if it carries a single metric). Update `projectItemSchema`.
- **NEW** tests (fixture-backed; no live brain or B required).

## Logic / Invariants
- `lookupLakeFact` uses `loadParsedBrain(report_id)` (`lib/fetch-brain.ts`) → `ParsedBrain { output,
  freshness_token }`; `output.key_metrics.find(m => m.metric === slug)`; per-ZIP via
  `fetchDetailRow(report_id, zip)` over `detail_tables`.
- **B5 — never throw.** `loadParsedBrain` is null-resilient (→ `null`). `fetchDetailRow` THROWS
  `BrainNotFoundError` on a missing/invalid slug → **wrap it in try/catch → return `null`** so the per-ZIP
  path honors the never-throw → `not_found` contract.
- **B1/B2 — derivation fallback, catalog-gap-safe.**
  `const cat = BRAIN_CATALOG.find(e => e.id === report_id);`
  `const expires = output.expires ?? (cat ? expiresFor(output.refined_at, cat.ttl_seconds) : undefined);`
  Return the fact with `expires: string | undefined`. **An absent `expires` (uncataloged + unstamped) is
  NOT derived to a fake value — it stays `undefined`, and the comparator maps it to `not_found`.**
  (`BRAIN_CATALOG` is the lean, import-safe `ReadonlyArray<BrainCatalogEntry>` keyed by `id` — it is
  KNOWN_INCOMPLETE; `home-values-swfl`, `investor-zip-swfl` are absent.)
- **B5 + R2 — never throw across the boundary.** `expiresFor` returns `undefined` on a corrupt
  `refined_at` (R2 NaN-guard), so the derivation degrades to `expires: undefined` → `not_found` — it never
  throws a `RangeError` inside `lookupLakeFact`. Keep the `lookupLakeFact` body defensive: any unexpected
  throw degrades to `null` (→ `not_found`), never a crash.
- `grain` from `GrainBoundary.finest_grain` when present, else the metric/table grain.
- **Phantom-data guard (env-swfl lesson — mandatory).** Fixtures tagged `"lane_source":"fixture"`.
  `lane1.ts` branches its citation on the REAL source — never hardcode the live `freshness-pulse` path
  while reading a fixture. The LIVE freshness-pulse lookup is wired only when daily files 01+03 land; a
  post-landing check (C-6) asserts the live read.
- `toAssertion` reuses `projectItemSchema`; only kinds whose schema guarantees `freshness_token`
  (`metric`, `table_slice`) produce assertions; tokenless kinds → `null`. An item's `metric_slug` (if
  present) rides into the assertion.

## Acceptance test
- `resolveMetricSlug`: exact label → slug; unknown → `null`; two metrics sharing a normalized label →
  `null`.
- `lookupLakeFact`: cataloged fixture brain → `LaneOneFact` with `expires` populated (stamped OR derived
  via `.find`); **uncataloged `report_id` with no stamped expires → fact with `expires: undefined`**; **a
  cataloged brain with a garbage `refined_at` → `expires: undefined` (→ `not_found`), no throw (R2)**;
  missing brain → `null` (no throw); `fetchDetailRow` on a bad slug → caught → `null`; per-ZIP returns the
  row's value.
- `toAssertion`: `metric` item → populated assertion (carrying `metric_slug` if set); `note`/`source` →
  `null`.
