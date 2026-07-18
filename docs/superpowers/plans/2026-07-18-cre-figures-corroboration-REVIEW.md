# CRE Figures + Corroboration — Plan Review (blocking findings)

**Reviewer:** Claude (Opus 4.8) · **Date:** 2026-07-18 · **Verdict:** DO NOT implement as written.
**Method:** traced the plan (`2026-07-18-cre-figures-corroboration.md`) against the real code +
the design spec (`2026-07-17-cre-figures-corroboration-design.md`). Advisor concurred on all findings.

The plan is 80% sound (Task 2 tables, Task 4 corroboration engine are fine modulo minor edge cases).
The defects are concentrated in **Task 1 (crosswalk)** and **Task 3 (normalizer)** — and two of them
are interface-shaping, so implementation must not start until they're resolved.

---

## BLOCKER 1 — `countyForSubmarket` returns a place name, not a county → canonical set collapses

Plan Task 1 (lines 124–141):
```ts
const parent = place ? parentOf(place.display ?? submarket) : parentOf(submarket);
return parent?.display ?? "";          // ← BUG: parent is a PLACE record
...
Object.keys(MARKETBEAT_SUBMARKET_MAP).filter((s) => isCoreCounty(countyForSubmarket(s)))
```

`parentOf()` (`places-swfl.mts:348`) returns a parent **place** record — for "Fort Myers" its
`.display` is `"Fort Myers"`, for "East Naples" it's `"Naples"`. `isCoreCounty()`
(`core-scope.mts:93`) only matches `"Lee"`/`"Collier"` (strips a trailing " County"). So
`isCoreCounty("Fort Myers") === false` — **every non-county key is filtered out**, and
`CANONICAL_SUBMARKETS` collapses to `["Lee County","Collier County"]`. Every Task 1 test that expects
"Fort Myers"/"Bonita/Estero"/etc. fails.

**Fix:** `PlaceRecord` carries a `.county` field (`"Lee"|"Collier"|"Charlotte"`) built for exactly this:
```ts
export function countyForSubmarket(submarket: string): string {
  const meta = SUBMARKET_METADATA[submarket];
  if (meta?.geographic_type === "county") return submarket;      // "Lee County" | "Charlotte County"
  return resolvePlace(submarket)?.county ?? "";                  // "Lee" | "Collier" | "Charlotte"
}
```
The plan's guard test ("every canonical resolves to Lee/Collier") is also circular — it re-applies the
same predicate that *defines* the set, so it can never fail. Replace it with an explicit expected-set
assertion.

## BLOCKER 2 — Colliers composite aliases can't survive the scope gate + spec/plan contradiction

`normalizePlace()` (`places-swfl.mts:264`) folds `-_.,` to spaces but **not `/`**. So
`resolvePlace("Bonita/Estero")` and `resolvePlace("Cape Coral/N. Fort Myers")` return `null` — even
after Blocker 1's fix they get scope-filtered out. But the plan's own Task 1 test (lines 76–80) asserts
they resolve to *themselves*, and the **spec** (§1, "colliers 'Bonita/Estero' → {Bonita Springs,
Estero}") says they should fan out to their **constituents**. Plan test ⟂ spec.

**This is an operator design decision** — three real options:
- **(a) identity / single-source day-one** *(recommended)* — keep the composite as its own canonical
  string; Colliers figures emit single-source under it and simply don't corroborate with C&W's
  fine-grained "Bonita Springs"/"Estero" until a later crosswalk expansion. Matches the spec's own
  "ships exact-match day one; crosswalk expands coverage incrementally." Keeps the signature
  `string | null` — **no interface fork, unblocks everything else.** Scope-classify composites by
  splitting on `/` and resolving each part (both → Lee → in-core).
- **(b) fan-out to constituents** — `canonicalSubmarket` returns `string[]`; one Colliers row emits two
  figure rows (Bonita Springs + Estero). Richer corroboration, but assigns one composite number to two
  submarkets (a small inference) and changes the normalizer contract (1 row in → N out).
- **(c) map to one constituent** — lossy/arbitrary. Not recommended.

## BLOCKER 3 — drop-semantics overload `null`; in-core unmapped figures are lost (spec violation)

Plan Task 3 (line 354, `if (canon == null) continue`) + its test (lines 300–303) **drop** any unmapped
submarket. Spec §1 (lines 96–98): unmapped → "emitted as **single-source** (never dropped, never
force-fit)." The plan uses `null` for *both* "out-of-core → drop" (correct) and "in-core but unmapped →
keep" (spec says keep). An in-core C&W/MHS submarket that isn't a `MARKETBEAT_SUBMARKET_MAP` key is
silently dropped instead of emitted single-source.

**Fix (needs the composite decision first):** distinguish the two. `canonicalSubmarket` should return
the raw submarket as its own identity canonical when it resolves to an **in-core** county but has no
alias/map entry (→ single-source), and `null` **only** when out-of-core or unresolvable. Then Task 3's
"unmapped → dropped" test inverts to "in-core unmapped → emitted single-source; out-of-core → dropped."

## BLOCKER 4 — medical_office rent silently vanishes (`asking_rent_full_service` not read)

The real table stores medical_office rent in **`asking_rent_full_service`** (the C&W Medical Office
report is full-service/gross basis); `asking_rent_nnn` is `null` for that sector — confirmed in the
fixture (`marketbeat-swfl.sample.json`, the two `medical_office` rows: `asking_rent_nnn: null`,
`asking_rent_full_service: 38.46 / 36.2`). The plan's normalizer (line 356) reads only
`asking_rent_nnn`, so **every medical_office rent figure is lost** — but spec §4 surfaces medical_office
as a first-class sector. The plan's metric enum (migration line 200) and `METRIC_UNITS` also omit it.

**Fix:** add `asking_rent_full_service` to the metric list (its own metric key, units `USD/sqft`
gross), read it in the normalizer, add it to Task 5's SELECT (the plan's SELECT at line 566 reads
`cap_rate, sale_price_psf` — both real columns — but not `asking_rent_full_service`), and add it to
`TOLERANCE`. Corroboration must **never** compare NNN rent against full-service rent — they're
different bases; keep them as distinct metrics (which the sector partition already guarantees, since
medical_office is the only full-service sector).

---

## BLOCKER 5 (biggest) — C&W has ZERO raw `source_url`; the trust bar drops it too, not just Colliers

Live probe of `pg.data_lake.marketbeat_swfl`, 07/18 — non-null `source_url` per firm:

| source_name | rows | non-null source_url | verified | sectors |
|---|---|---|---|---|
| cw_marketbeat | 173 | **0** | 113 | industrial, medical_office |
| colliers_industrial | 132 | **0** | 0 | industrial, flex |
| lee_associates | 20 | 20 | 0 | industrial, multifamily, office, retail |
| mhs_databook | 48 | 48 | 48 | industrial, office, retail |

The spec's Decision 1 ("trust bar = has `source_url`") was set believing **only Colliers** lacked URLs.
Live truth: **C&W — the largest, mostly-verified source, and half of every corroboration pair the spec
cites (e.g. "North Fort Myers industrial: C&W 2.8% vs MHS 3.4%") — has no raw `source_url` either.**
Under the plan's literal gate, C&W's 173 rows drop with Colliers' 132. Day-one `cre_figures` =
**Lee (20) + MHS (48) = 68 of 373 rows**, and the only multi-firm URL overlap is MHS × Lee at Fort
Myers — corroboration is nearly empty. The plan's Task 5 dry-run expectation ("C&W/MHS sourced rows
present") is wrong for C&W.

**But** the existing brain already cites C&W: `marketbeat-swfl-source.mts:281` falls back to
`source_url ?? marketbeatReceiptUrl()`, and `marketbeatReceiptUrl()` (line 241) returns a
`buildSourceCitationUrl(...)` receipt to our own citation renderer (label "MarketBeat — SWFL CRE
quarterly", source "Cushman & Wakefield / LSI / CPSWFL"). That receipt is **uniform across every
marketbeat row**, so it is NOT a per-firm discriminator — accepting it as the gate would also admit
Colliers and moot the Task 6 backfill.

**This is the real blocking decision — provenance standard for the broker-survey sources:**
- **(1) Receipt-URL provenance (build-not-blocked).** Accept the platform citation-receipt as valid
  provenance for C&W (and Colliers), matching what the brain already publishes and RULE 3 ("source
  citation homepage URL") + RULE 0.7 (only invention is blocked; a receipt is not invented). Fullest
  day-one layer + real corroboration. Weakest provenance grade; no per-report URL.
- **(2) Real-report URLs only (strongest).** C&W ALSO needs a per-quarter/sector URL backfill like
  Colliers Task 6. Both gated until backfilled; day-one = Lee + MHS only. Most faithful, most work,
  thin day-one, near-zero corroboration until done.
- **(3) Hybrid (recommended).** Admit C&W/Colliers on the receipt-URL provenance BUT stamp a
  `provenance_grade` (`firm_report` for Lee/MHS real URLs vs `platform_receipt` for C&W/Colliers), so
  the ops page distinguishes "cited to the firm's report" from "cited via our receipt," and a later
  real-URL backfill is an *upgrade*, not an unblock-gate. Keeps the build moving, stays honest about
  grade, and the corroboration surface is real day-one.

## Composite handling — resolved against the live vocabulary (operator steer 07/18)

Operator: "Bonita and Estero are not the same, so they need to be different." Live vocab confirms the
fine-grained firms already separate them — so the **canonical set is the fine grain**, and Colliers'
composites fan out to constituents to corroborate:
- Colliers `Bonita/Estero` → {Bonita Springs, Estero} — both already reported separately by C&W + MHS.
- Colliers `Cape Coral/N. Fort Myers` → {Cape Coral, North Fort Myers} — separate in C&W + MHS.
- Colliers/Lee/MHS `Fort Myers` = plain "Fort Myers"; **C&W has no plain "Fort Myers"** — it splits
  into "City of Fort Myers" + "South Fort Myers", so C&W won't corroborate at "Fort Myers" without a
  crosswalk entry (leave single-source day-one).
- `Naples` = plain "Naples" across all three (C&W/MHS also carry East/North Naples).
- `Lehigh`: Colliers/MHS "Lehigh", **C&W industrial uses "Lehigh Acres" but C&W medical uses
  "Lehigh"** — a within-C&W inconsistency the crosswalk must fold.
- MHS ships a raw slug `sfm-san-carlos` → San Carlos Park (Fort Myers sub-area) — crosswalk it.
This is composite option (b) fan-out. It only bites once Colliers enters (post-URL/receipt decision),
since Colliers is unsourced today. `canonicalSubmarket` therefore returns `string[]` (fan-out), not
`string | null` — a normalizer contract change from the plan (1 row in → N rows out).

## Out-of-scope places present in the live data (must be dropped — confirmed)
Charlotte County (Colliers, C&W, MHS all carry it) and Punta Gorda (C&W, 1 row) — both non-core,
dropped at the crosswalk (`countyForSubmarket` → "Charlotte" → not in Lee/Collier).

---

## Non-blocking (fix while implementing Task 4)

- **3+-firm corroborated value** (Task 4, lines 519–525): "corroborated" requires the full max−min
  spread within tolerance, then reports `median(values)`. Spec says "value = median of **agreeing**
  firms." For 2 firms it's identical; for 3 where one is an outlier the cell flags anyway, so the
  divergence is narrow — but if you later want a majority-agrees tier, compute the median over the
  agreeing subset, not all firms.
- **reported-firm tiebreak** (line 522): `firms.find(f => f.source_verified) ?? firms[0]` picks
  first-verified-or-first in **input order**, not most-recent. Spec says "verified / **most-recent**."
  Sort by quarter desc for the fallback.

## Column reality (verified — these are fine)
- `cap_rate` exists (`docs/sql/20260711_marketbeat_swfl_cap_rate.sql`); Lee is the only source with it.
- `sale_price_psf` exists (MHS extension migration + Lee/marketbeat_pdf pipelines write it).
- `asking_rent_full_service` exists (`20260715` column) — see Blocker 4.
- The **existing** reader (`marketbeat-swfl-source.mts:224`) selects neither `cap_rate` nor
  `sale_price_psf` — Task 5 must select them explicitly (the plan does), and add full-service rent.

## Orchestration note
Not fanned out. Implementation is a sequential, type-coupled chain (1→3→4→5); the only independent unit
is the Task 2 migration. Parallel implementation on a broken/drifted foundation buys nothing, and
re-dispatching agents to re-confirm defects already traced solo is the RULE 0.6 "audit the audit"
anti-pattern. Migration + `data_lake` writes and the Task 6 Colliers backfill need explicit operator go
(RULE 1).

## Decisions needed before implementation
1. **Composite handling** — (a) identity/single-source day-one *(recommended)*, (b) fan-out to
   constituents, (c) map-to-one.
2. **Drop semantics** — confirm the spec's "in-core unmapped → single-source" (recommended) over the
   plan's "exact-match-only → drop."
