# Core-scope ZIP authority (Lee + Collier = 57) across brains, denominators + Stage-4 lint

**Date:** 2026-07-11
**Slug:** `zip-scope-core` · **Check:** `zip_scope_core_live_verify`
**Trigger:** ZIP Quick Summary page shows a *different* "of N SWFL ZIPs" denominator on every card
(#72 of 124, #42 of 95, #44 of 99, #53 of 99, #40 of 77, #34 of 67). Operator: "Need all zips figures
and all numbers everywhere to not add in more zips than Lee, Collier… ~57 zips. Where is this root?"

## Problem

There is no shared "SWFL ZIP universe." Every card computes its own denominator independently, and two
code paths do it two different wrong ways:

- **Registry cards** (Homes Sold, Market Heat, Price-Cut, …) — `buildRegistryCandidates`
  (`lib/zip-report/candidates.ts:634`) ranks the ZIP against *every row in that brain's detail table*,
  with **no scope filter**. `buildRegistryTableMap` (`lib/zip-report/load-registry-tables.ts:32`) passes
  the brain's rows verbatim. So the denominator = "how many ZIPs that brain emitted."
- **Census cards** (Income, Employment, Poverty) — `loadCensusSignals` (`candidates.ts:821`) *does*
  filter, by `resolveZip(geoId).in_scope`. But `in_scope` = "present in the 6-county crosswalk" = **100
  ZIPs** (Lee 35, Collier 22, Sarasota 24, Charlotte 13, Hendry 3, Glades 3). Scoped — to the wrong,
  too-wide universe.

**The root is source-side, and the counts prove it.** Distinct ZIP row-keys each brain emits:

| brain | keys | core (Lee+Collier) | non-core crosswalk (Sar/Cha/Gla) | OUTSIDE crosswalk (pure leak) |
|---|---|---|---|---|
| housing-swfl (Redfin sold) | 124 | 54 | 37 | 33 |
| home-values-swfl (ZHVI) | 109 | 53 | 37 | 19 |
| market-heat-swfl | 99 | 59 | 40 | 0 |
| seller-stress-swfl | 126 | 55 | 37 | **34** |
| rentals-swfl | 94 | — | — | — |
| investor-zip-swfl | 90 | — | — | — |
| listing-momentum-swfl | 61 | — | — | — |
| active-listings-swfl | 61 | — | — | — |
| market-temperature-swfl | 54 | — | — | — |

Several brains emit **more ZIPs than exist in our entire 100-ZIP crosswalk** (124, 126, 109) — pulling
mailing/other-metro spillover (investor-zip's own code calls it "Manatee spillover"). The `seller-stress`
prose literally claims "126 SWFL ZIPs," of which 34 aren't in SWFL geography at all. The page cards **and**
the `/charts` panels (which read `home-values` = 109, etc.) both consume these raw. That is why the numbers
differ everywhere.

### Research (crawl4ai, per RULE 0.4)

- **Southwest Florida definition** (Wikipedia "Southwest Florida", fetched 2026-07-11): the region's core
  is Sarasota, Charlotte, Lee, Collier (+ sometimes Manatee); Hendry, Glades, DeSoto are "for some
  purposes" *rural inland* add-ons ("notably rural, primary driver agriculture"). So (a) our "core =
  Lee + Collier" is a **data-depth** choice, not the geographic definition, and (b) "of N SWFL ZIPs"
  stays truthful when scoped to Lee/Collier — they are unambiguously SWFL.

## Decision: what "core scope" is

**Core scope = Lee (12071) + Collier (12021) = 57 ZIPs.** Hendry dropped.

Rationale (operator-confirmed):
- **Percentile integrity, not just count.** Held-count keeps the *count* honest, but Hendry's
  Clewiston/LaBelle are an agriculture economy (poverty ~21–23%, median income ~$47–55K) unlike coastal
  Lee/Collier. Pooling them measures "how does Naples rank on income" partly against sugarcane towns —
  distorting the coastal read on exactly the Census + heat cards where Hendry has data.
- **Thin data.** Home-value, sold, rent, and market-temp brains hold **zero** Hendry rows — a Hendry ZIP
  page would render half-empty.
- **Matches existing locks.** CLAUDE.md: "Lee + Collier — the two core, data-rich counties; Hendry is a
  small minor addition, not a headline county." And the code already has `TOTAL_SWFL_ZIPS = 57`.

`in_scope` (6-county) is **unchanged** — it stays the ingest/lake-write MOAT gate (it legitimately answers
"is this SWFL geography at all," and we keep ingesting border data). We add a *narrower* predicate beside
it; we do not narrow `in_scope` (that would reach ~30 consumers incl. the J2/J3 lake-write gate).

## Goal

Every ZIP-grain number the product shows — page ranking cards, `/charts`, and brain-native "N SWFL ZIPs"
counts/prose — ranks against the same 57-ZIP core universe. Denominators are **held-count** (each card
lists the actual number of core ZIPs holding a finite value for that metric — may be <57 when a brain's
coverage is partial; that is honest, not inconsistent). No out-of-region ZIP ever inflates a count again.

## Approaches considered

- **A — Source-fix at the brain + shared `core_scope` predicate + Stage-4 lint (CHOSEN).** Fixes cards,
  charts, and prose in one cut per brain; the lint makes it permanent. Cost: ~9 pack edits + targeted
  rebuilds. This is what "everywhere" requires.
- **B — Fix at the source normalizers** (drop out-of-scope when reading the lake). Fewer touch-points if
  sources were shared, but normalizers are shared across packs with differing needs and it changes what
  upstream considers "available." Riskier, rejected.
- **C — Consumer-patch only** (`candidates.ts` + census loader). Fast, but leaves `/charts` and the
  "126 SWFL ZIPs" prose wrong — the exact rediscovery failure RULE 2.4 forbids. Rejected.

## What we're building

### 1. Scope authority — `refinery/lib/core-scope.mts` (new, small, pure)
- `CORE_SCOPE_COUNTY_FIPS = new Set(["12071", "12021"])`.
- `CORE_SCOPE_ZIPS: ReadonlySet<string>` — derived at module load from `swfl-zip-county.json`, entries
  whose `primary_county ∈ CORE_SCOPE_COUNTY_FIPS`. Asserts size 57 (a build-time self-check; if the
  fixture drifts, the assert names it).
- `isCoreScope(zip: string): boolean` — `CORE_SCOPE_ZIPS.has(String(zip).trim())`.
- G1-pure (static ESM JSON import, no `fs`) so it loads inside the Vercel MCP function, mirroring
  `zip-resolver.mts`.
- One predicate excludes **both** leak layers at once: pure-leak ZIPs aren't in the fixture; Sarasota/
  Charlotte/Glades aren't in the core FIPS.

### 2. Source-fix — the ~9 zip-grain packs
For each pack that emits a ZIP detail table, add `isCoreScope(r.zip_code)` to the `zipRows` filter, and
recompute any "count of SWFL ZIPs" metric + conclusion prose off the scoped set:
`housing-swfl, home-values-swfl, rentals-swfl, market-temperature-swfl, market-heat-swfl,
listing-momentum-swfl, active-listings-swfl, seller-stress-swfl, investor-zip-swfl`
(+ audit `properties-collier-value`, `tier-divergence-swfl`, `env-swfl`, `permits-*` for the same pattern).
`investor-zip-swfl` already filters on `in_scope` → switch it to `isCoreScope`. This is the single conceptual
cut; it cascades to the page cards, `/charts`, and prose because all of them read `--- OUTPUT ---`.

### 3. Consumer belt-and-suspenders — `lib/zip-report/candidates.ts`
- `buildRegistryCandidates`: filter the ranking distribution to `isCoreScope(row.key)` before
  `percentileOf`. Redundant after the source-fix, but keeps the page honest if a rebuild lags.
- `loadCensusSignals`: swap `resolveZip(geoId).in_scope` → `isCoreScope(geoId)`.
- Held-count denominators fall out: `percentileOf`'s `n` = count of core ZIPs with a finite value.
- Reconcile the `TOTAL_SWFL_ZIPS = 57` constant to derive from `CORE_SCOPE_ZIPS.size` (single source).

### 4. Page-guard migration — one audited consumer
`app/r/zip-report/[zip]/page.tsx` + `metadata.ts`: render/metadata guard moves `in_scope` → `isCoreScope`
so a non-core ZIP (e.g. a Sarasota or Clewiston ZIP) gets the clean "outside our coverage" path instead of
an empty-card page. **Only this consumer migrates.** Every other `in_scope` consumer (email enrollment,
social, welcome dossier, address-retrieve, lake-write gate) is left exactly as-is, deliberately.

### 5. Regression lock — extend the Stage-4 lint family
Add `zip-scope-lint` alongside the existing Stage-4 lints (`facts-only-lint`, `grain-guard-lint`, …):
a pack build **fails** if any emitted detail-table row keyed by a 5-digit ZIP is not `isCoreScope`. This is
the anti-rediscovery mechanism — pack #10 that forgets the filter fails loudly instead of leaking. C2-
compliant: extends the existing Stage-4 seam, not a new gate architecture.

## Data flow (after)

```
swfl-zip-county.json ──▶ core-scope.mts (CORE_SCOPE_ZIPS=57, isCoreScope)
                              │
        ┌─────────────────────┼───────────────────────────┐
        ▼                     ▼                            ▼
  pack zipRows filter   candidates.ts (registry     zip-report page guard
  (source-fix, §2)       dist + census, §3)          (isCoreScope, §4)
        │                     │                            │
        ▼                     ▼                            ▼
  brains/*.md OUTPUT    held-count denominators      non-core → outside-coverage
  (page + /charts +     (#X of ≤57, consistent)
   prose all scoped)
        ▲
   Stage-4 zip-scope-lint (§5) fails any out-of-core row
```

## Testing

- `core-scope.test.mts`: `CORE_SCOPE_ZIPS.size === 57`; known Lee/Collier ZIPs in, known Sarasota
  (34285), Charlotte (33950), Hendry (33440), and a pure-leak ZIP out; `isCoreScope("")` false.
- `candidates.test.ts`: a registry table containing core + non-core + leak rows → denominator counts only
  core rows with finite values; census distribution excludes non-core.
- `zip-scope-lint` unit test: a fixture pack emitting one Sarasota row fails; an all-core pack passes.
- Per-pack `bun:test` + `catalog.test.mts` mirror (Gate 5) after each pack edit.
- **Live-verify** (`zip_scope_core_live_verify`): after rebuilds + deploy, the ZIP Quick Summary page
  shows every card denominator ≤ 57 and the seller-stress prose no longer says "126 SWFL ZIPs."

## Rollout / cost

- Pack edits + `core-scope.mts` + consumer edits + lint ship together (atomic — vocab/catalog gates).
- Rebuild each affected brain with `--target-only` (never `master --force`), then a master cascade.
  ~9 Sonnet synthesis calls — **spend heads-up before the first live rebuild run** (per the spend rule).
- Verify row-key counts on each rebuilt brain drop to ≤57 core before pushing.

## Follow-ups (own checks — not this spec's code)

- **Ops coverage matrix** (swfldatagulf-ops repo, per convention): per metric, how many of 57 core ZIPs we
  actually hold + why the gaps — what we need, where, and why we don't have it.
- **National-average comparisons**: income / poverty / employment have clean ACS national benchmarks;
  scope a "vs US" companion figure as a separate feature.

## Non-goals

- Not narrowing `in_scope` (stays 6-county MOAT).
- Not re-ingesting or deleting the border/Hendry data from the lake — it stays; we simply stop surfacing
  it in ranked ZIP-grain outputs.
- Not touching the chat/answer engine's four-lane behavior — a Hendry question can still be answered from
  other lanes; this only governs the ranked ZIP-grain surfaces.
