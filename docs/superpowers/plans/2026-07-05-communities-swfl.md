# communities-swfl — Program Plan (review, scope, decomposition)

> **This is the PROGRAM map, not an executable task list.** The executable Phase-1 plan is
> `docs/superpowers/plans/2026-07-05-communities-swfl-phase1-namejoin.md`. Phases 2–5 are briefs here.
>
> **⚠️ PIVOT 07/05/2026 — the spatial-join spike is DEAD.** A live probe proved every parcel already
> carries its subdivision name (`S_LEGAL` / `Description`); grouping by that name reproduces real
> community counts (~7% off on a built-out community — Heritage Bay 1,501 vs 1,400). There is no
> boundary-polygon / centroid / spatial-join problem, and no GO/NO-GO gate. Phase 1 is now a name-join:
> ingest parcel name+type+zip → group → roll up via the alias reconciler (built). Evidence:
> `verification/communities-name-join-accuracy.md`. The old spike plan (`…-phase1-backbone.md`) is
> superseded; the new plan (`…-phase1-namejoin.md`) replaces it. See §5 for the session findings.

**Spec:** `docs/superpowers/specs/2026-07-05-communities-swfl-design.md` (design approved 07/05/2026)
**Slug:** `communities-swfl` · **Check:** `communities_swfl_live_verify`
**Plan authored:** 2026-07-05, after a live code probe of all six subsystems the spec touches.

---

## 1. Review — the spec is a strong design, but several "proven" code claims are stale

The design (two-tier universal backbone + marketed profile, spatial-join moat, four-lane provenance,
route-don't-guess) is sound and I am **not** relitigating it. But a live probe (2026-07-05) of the
actual code found the spec's *implementation claims* drifted from reality. **The plan corrects these;
do not build from the spec's word on any row below.**

### Correction ledger (spec claim → live code)

| # | Spec says | Live code | Impact on plan |
|---|---|---|---|
| C1 | Parcels hold "only id + values + ZIP; no DOR use code" | **Wrong.** Collier already pulls `dor_uc`+`pa_uc`; Lee has `use_code`+`use_description`. `ingest/pipelines/collier_parcels/resources.py:36-37`, `ingest/pipelines/leepa/resources.py` | Property-type is **already landed both counties** — do NOT re-ingest it. Map DOR code → property_type in the join, not the fetch. |
| C2 | "FDOR statewide layer serves Lee too via a `CO_NO` filter" | Collier = FDOR statewide (`CO_NO=21`, empirically verified, *not* tax code 11 — `collier_parcels/constants.py:9-13`). **Lee is a DIFFERENT feed** (LeePA appraiser, 3 ArcGIS layers joined on `FOLIOID`), has **no ZIP, no situs on the row**. | Lee geometry is its **own feasibility track**. "Serve Lee via CO_NO" = a new source swap needing a live `CO_NO` probe, not a config tweak. |
| C3 | Pull polygon geometry per parcel (`esriGeometryPolygon`) | A prior live test hit a **40s timeout** at `returnGeometry=true` on this exact hosted layer (`docs/superpowers/plans/2026-06-30-steadyapi-sole-spine/…HANDOFF.md`). Geometry arrives in **EPSG:2237** (FL State Plane ft). | Probe pulls **centroids only** (`returnCentroid=true`, `outSR=4326`, keyset-paginated), never full polygons. Reproject any 2237 geom before `ST_Contains`. |
| C4 | DuckDB `spatial` does the join "natively — no new infra" | **Greenfield.** No `INSTALL spatial`/`ST_Contains` anywhere; only `httpfs` is used today. | Phase-1 probe step 0 = prove `INSTALL/LOAD spatial` + `ST_Contains` runs on the **GHA runner**, not just locally. |
| C5 | Scrape → "one small **Haiku** distill per community" | Model was amended **Haiku → `claude-sonnet-4-6`** (operator decree 07/05/2026, `ingest/CLAUDE.md`, `verification/haiku-vs-sonnet-distill.md`). `web_search_*` in cron is **banned**. | Phase-2 distill uses `claude-sonnet-4-6`; capture is crawl4ai fetch only; wire `RunBudget(default_usd=1.0)` + daily-ceiling preflight. |
| C6 | Copy `active-listings-swfl` / `storm-history-swfl` as the reporter template | `active-listings-swfl` is the right template (`direction:"neutral", magnitude:0, skipSynthesisAgent`). **`storm-history-swfl` is NOT** — it emits `bearish`, magnitude 0.5/0.2. | Copy `active-listings-swfl` (also `investor-zip-swfl` / `active-rentals-swfl`). |
| C7 | Community page "renders from the brain's `detail_tables`", pattern-matched to `cre-swfl/[corridor]` | **No page renders `detail_tables`** (it's dossier-only, `refinery/types/brain-output.mts:322-328`). `cre-swfl/[corridor]` reads a **bespoke `corridor_profiles` table** via service-role (`app/r/cre-swfl/corridors.ts:15-26`). | Phase-4 page reads `data_lake.community_profiles` directly (the real cre-swfl pattern), NOT detail_tables. detail_tables stays the assistant/Lab lookup surface only. |
| C8 | `GatedResidenceCommunity` JSON-LD "via `lib/jsonld.ts`" | Not present — only `brainJsonLd` + `corridorJsonLd` exist. | Phase-4 **adds** the builder (copy `corridorJsonLd`'s `Place`+`containedInPlace` shape). |
| C9 | Mapbox enrichment "proven end-to-end" | Geocoding + Static-Images are proven (direct REST, `refinery/lib/geocode.mts`). **Directions / Isochrone / Category-Search = greenfield**; billable; token is URL-restricted (`pk.`) needing a `Referer: https://www.swfldatagulf.com/` header. `ingest/` has **zero** Mapbox. MCP tools are unreachable from unattended cron. | Phase-3 is direct-REST (not MCP), at **neighborhood grain only** (thousands, not 616K), metered + cached, with a bounded cost ceiling. |
| C10 | Extend `refinery/lib/corridor-aliases` | That file is a **1:1 identity map** (`Record<slug, slug\|null>`) — wrong shape for the spec's **one-to-many** (many platted names → one community). | Reuse its **test discipline** (no orphans / no holes / reachability), author a **new** structure `refinery/lib/subdivision-aliases.mts`. |

### Things the probe CONFIRMED (build on these)
- `detail_tables` supports an arbitrary ~300-row catalog keyed by community slug (`BrainOutputDetailRow.key`) — good.
- Only headline `key_metrics` slugs need vocab registration (both `raw_slugs` **and** `slug_index`, same commit); `detail_tables` keys are **vocab-exempt** (`check-vocab-coverage.mts:80`).
- `market-context.ts` loader pattern (`zipFigures`/`countyFigures` → `MarketFigure[]` via `createServiceRoleClientUntyped`, try/catch degrade) is the exact template for a new `communityFigures()`.
- Master wiring: append to **both** `sources[]` and `input_brains[]` (mirror landmine, `master.mts:314-321`); `grain_boundary.routes` is the route-don't-guess seam.
- Guards (`ingest/lib/guards.py`), cadence registry `not_yet_running:` ODD pattern, and `--target-only` build all exist as claimed.

### Hidden landmines the probe surfaced (not in the spec)
- **L1 — detail_tables cells are scrubbed at Stage 4.** They bypass the *prose* speaker but the serialized OUTPUT JSON is scanned line-by-line by `facts-only-lint` + `smoothing-lint` (`refinery/stages/4-output.mts:527-536`). A scraped catalog cell containing `your`, an imperative, or a smoothing token (`estimated`, non-figure `roughly`) **aborts the build**. Phase-4 must sanitize scraped text.
- **L2 — new-pack registration ≠ master wiring.** `communities-swfl` must also land in `refinery/packs/index.mts` (`PER_PACK_REGISTRY`) **and** `refinery/packs/catalog.mts` (Gate-5 mirror) or `catalog.test.mts` reddens.
- **L3 — build order.** Build the leaf first (`bun run refinery -- communities-swfl`), *then* `master --target-only`; master skips a missing upstream and fails at ingest if `brains/communities-swfl.md` is absent.
- **L4 — comp geometry.** `NearbyComp` has **no lat/lon** by contract; the bootstrap seed must use the `/search` `Listing` (has lat/lon) or the raw address, not `NearbyComp`.
- **L5 — assistant seam scope.** `sourcedFiguresBlockForZip` fires only in the **located branch** of `conversation-path.ts:817`. A bare community name that resolves to neither a ZIP nor a detected location bypasses it — Phase-5 needs a community→location resolver feeding the located branch.

---

## 2. Scope — this is FIVE sequentially-gated plans, not one

The `writing-plans` scope check + the spec's own "independently shippable" phases both say: decompose.
Each phase produces working, testable software on its own. **Phase 1 is a GO/NO-GO spike-gate** whose
outcome (authoritative vs degraded) and X/Y thresholds are *inputs* to Phases 2–5 — so only Phase 1 is
written in full TDD now.

```
Phase 1  Universal backbone SPIKE→GATE→BUILD   ← FULL TDD PLAN (separate file). Free APIs, offline-verifiable.
              │ GO  →  authoritative home↔community graph (parcel_neighborhood + neighborhood_stats)
              │ NO-GO → degrade: scraped-community aggregates only (home counts become lane-3 cited)
              ▼
Phase 2  Marketed profile (scrape → community_profiles)      ← brief; promote after gate
Phase 3  Mapbox enrichment (drive-times + nearby, nbhd grain) ← brief; promote after gate
Phase 4  Brain pack + drill route + master wiring            ← brief; promote after gate
Phase 5  Consumption surfaces (Lab AI + chat grounding)       ← brief; promote after gate
```

**Why gate first:** everything "authoritative" downstream rests on the spatial join working at scale on
both counties. The probe is bounded, throwaway, staging-isolated, and needs **no paid APIs** (free
ArcGIS opendata + free DuckDB spatial), so it clears the no-unmetered-spend rule and is fully
offline-verifiable — `communities_swfl_live_verify` stays operator-run.

---

## 3. Global Constraints (apply to every phase — verbatim from spec + CLAUDE.md)

- **No invented number, ever.** Four-lane at ANY grain: our parcels (lane 1) → user upload (2) → named web, cited + as-of (3) → user figure (4). A gap fills from the next lane; only invention is blocked.
- **As-of dates** written `MM/DD/YYYY`, stated once; never the raw `SWFL-…-YYYYMMDD` token.
- **Never frame as "ZIP-level."** Grain and source both unconstrained.
- **Answers/cells:** no system nouns, internal IDs, `§`, or jargon; plain text, no blockquotes/tables in answers.
- **Ingest:** `$1.00/run` `RunBudget` cap on any LLM call + `INGEST_DAILY_CEILING_USD` ($5) preflight; **no `web_search` in cron**; distill model = `claude-sonnet-4-6`; probe <1 min before any multi-minute ingest; Gate-4 non-null guard before any `replace`; ship the GHA cron wrapper + `--dry-run` in the same PR; `GRANT SELECT … TO service_role; NOTIFY pgrst,'reload schema';` after table creation.
- **Brain-first:** no Tier-2 table without its consuming brain's `PackDefinition` in the same PR (satisfied at Phase 4 — Phase 1–3 tables are consumed by the Phase-4 pack in the program, and each phase's lake tables ship with an empty-tolerant reader so nothing is orphaned).
- **Vocab + pack same commit** (orphan-lint Gate 2); atomic type-lift ships with backfill; `--target-only` rebuilds; SESSION_LOG entry every push; `node scripts/safe-push.mjs`, explicit paths, never `--no-verify`/force-`main`.
- **Migrations** via `new Bun.SQL` (`sslmode=require`); creds in `.dlt/secrets.toml`.
- **crawl4ai** is the only crawl tool; its files are gitignored (`*crawl4ai*`) and never committed.
- **Scope:** Lee (12071) + Collier (12021) only in v1; other 4 counties out.

---

## 4. Phase 2–5 briefs (promote to full TDD plans after the Phase-1 gate)

### Phase 2 — Marketed profile (scrape → `data_lake.community_profiles`)
- **Files:** `ingest/pipelines/community_profiles/{constants,fetch,distill,pipeline}.py`; local-only `*crawl4ai*` capture script; `ingest/cadence_registry.yaml` (ODD-parked under `not_yet_running:`); `data_lake.community_profiles` migration.
- **Do:** crawl4ai stealth fetch of naplesgolfguy / 55places / realtyofnaples detail pages → matched HTML → **one `claude-sonnet-4-6` distill per community** (structured golf_structure/holes/fees/amenity flags), metered via `RunBudget(default_usd=1.0)` + daily-ceiling preflight. Each field carries `source_url`+`as_of`. Merge onto the community slug (from Phase-1 alias map).
- **Gated on:** the Phase-1 alias map (canonical community slugs) existing. Under NO-GO, this phase still ships (scraped-only aggregates).
- **Risks:** L1 (sanitize distilled text against facts-only/smoothing lint before it can reach detail_tables); discrepancy rule when two sources disagree (keep both/flag).

### Phase 3 — Mapbox enrichment (drive-times + nearby, neighborhood grain)
- **Files:** new `ingest/lib/mapbox_enrich.py` (direct REST, `Referer` header, `MAPBOX_TOKEN`); writes drive-time/nearby columns onto `neighborhood_stats` / `community_profiles`.
- **Do:** per **subdivision centroid** (thousands, not 616K): Directions (RSW / nearest Gulf beach / downtown / nearest hospital) + Category-Search (dining/shopping/entertainment counts + named places). Cited to Mapbox + as-of. Bounded cost ceiling + cache; refresh rarely.
- **Gated on:** Phase-1 `neighborhood_stats` centroids existing. **Confirm token scopes cover Directions/Isochrone** before the run (Static-Images scope ≠ nav scope).
- **Risks:** C9 (greenfield, billable, URL-restricted token); unattended cron can't use MCP — direct REST only.

### Phase 4 — Brain pack + drill route + master wiring
- **Files:** `refinery/packs/communities-swfl.mts` (copy `active-listings-swfl`, neutral/0/`skipSynthesisAgent`); register in `refinery/packs/index.mts` + `refinery/packs/catalog.mts` (L2); `refinery/vocab/brain-vocabulary.json` (headline `key_metrics` slugs in `raw_slugs`+`slug_index`, same commit); `refinery/packs/master.mts` (append to `sources[]`+`input_brains[]`, add `grain_boundary.routes` drill — C-mirror landmine); `app/r/communities-swfl/[community]/page.tsx` (copy cre-swfl, read `community_profiles` directly — C7); lighter neighborhood view from `neighborhood_stats`; `lib/jsonld.ts` add `GatedResidenceCommunity` (C8); `app/r/source/_tables.ts` register the 4 new tables (+ date_col index migrations, `buildSourceCitationUrl`).
- **Do:** `key_metrics` = both-tier aggregates (homes-by-type Tier-1, homes-in-gated-communities Tier-1 output, community count, share bundled vs equity, median HOA-range midpoint Tier-2); `detail_tables` = ~300 marketed communities keyed by slug (sanitized — L1). Build leaf then `master --target-only` (L3).
- **Gated on:** Phases 1–3 tables. Satisfies brain-first gate for the whole program.

### Phase 5 — Consumption surfaces (Lab AI + chat)
- **Files:** `lib/email/market-context.ts` add `communityFigures(): Promise<MarketFigure[]>` (mirror `zipFigures`, untyped client) wired into `loadMarketFigures`/`fetchLakeParts` (the **loader**, not `figuresToPromptBlock` — so it reaches both the plain block AND the `[fN]` DATA MENU in `author-doc.ts`); `lib/assistant/conversation-path.ts` community-name detection → resolve to ZIP/located dossier so the existing `sourcedFiguresBlockForZip` seam fires (or add a second inject in the region branch — L5).
- **Do:** Tier-1 any-address (neighborhood stats + nearby/drive-times) + Tier-2 community facts, every number cited. Non-gated address still resolves to its `neighborhood_stats` row — no dead ends.
- **Gated on:** Phase-4 tables/pack live.

---

## 5. Session findings (07/05/2026) — what the probe proved

- **The spatial-join crux is unnecessary.** Every parcel carries its subdivision name in `S_LEGAL`
  (Collier) / `Description` (Lee); grouping by it reproduces real community counts. Benchmark:
  `verification/communities-name-join-accuracy.md`. Spatial join, boundary polygons, centroid pull, and
  the GO/NO-GO gate are all obsolete.
- **Accuracy:** ~7% on a built-out single-name community (Heritage Bay 1,501 vs 55places' 1,400) —
  **CORRECTED 07/06/2026: NOT re-verified.** The 1,501 (1,252 condo + 249 SF) was built on undeduped
  condo rows (see correction below); the true dedup-grain Heritage Bay number is open, not settled.
- **Collier data:** 364,000 parcels pulled from the FDOR centroid layer → ~221K homes (not 289,212 —
  see correction), 4,521 subdivisions. Marketed golf communities ~120 in Lee+Collier (naplesgolfguy);
  a few hundred with gated.
- **Landmines recorded in the name-join plan:** FDOR Lee partition (`CO_NO=46`) is broken (record queries
  400); the cadastral layer doesn't expose `S_LEGAL` (use the centroid layer); `returnCountOnly`/`LIKE`/
  `returnCentroid` 400 on these layers (use keyset pagination).
- **CORRECTION (07/06/2026):** the `169,047`/`289,212` condo/total figures above were never per-unit —
  they're the FDOR centroid layer's raw undeduped row count. That layer stamps ONE DOR roll record
  onto multiple map points per condo (proven live on parcel `81750002283`: 33 raw rows, only
  `OBJECTID`/geometry differ). Deduped, Collier condo count is `100,847` (Collier total ~221K) — the
  original spec figure was right all along. Neither this layer nor a sibling FDOR layer exposes any
  per-unit field. Full evidence + the reversed benchmark table caveat:
  `docs/superpowers/specs/2026-07-05-communities-swfl-design.md` §Scope,
  `verification/communities-name-join-accuracy.md`.

## 6. Prerequisites before executing Phase 1
- **Executable plan:** `docs/superpowers/plans/2026-07-05-communities-swfl-phase1-namejoin.md` (the
  old `…-phase1-backbone.md` is superseded — banner on it).
- Confirm `communities_swfl_live_verify` is open: `node scripts/check.mjs list` (grep `communities`).
  Spec exists — do **not** re-run `new-build.mjs`. Open the follow-ups (F1–F8) as sub-checks.
