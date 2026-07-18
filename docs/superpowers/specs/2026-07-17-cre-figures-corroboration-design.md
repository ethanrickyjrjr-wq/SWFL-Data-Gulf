# Unified multi-source CRE figures layer + cross-source corroboration confidence

**Date:** 2026-07-17
**Status:** design — awaiting operator review before writing the implementation plan
**Build check:** `cre_figures_corroboration_live_verify`

## Problem

The commercial-real-estate numbers the platform reports are built on a "corridor"
grain that no professional CRE research uses, and that grain is largely a
LittleBird artifact:

- The four money metrics on the 27 `corridor_profiles` rows are not
  corridor-measured. Cap rate, vacancy, and rent are broker-survey **submarket**
  figures stamped onto each corridor; net absorption is worse — **22 of 23
  absorption values carry no source URL at all** (only 1 of 23 is sourced). That
  unsourced absorption currently feeds the brain's published direction call.
- The brain reports a single blended "SWFL CRE" number across property sectors.
  Industrial vacancy (~2–4%) and office/retail differ enormously; blending them
  is the same grain error as stamping corridors, one axis over.
- We hold real CRE figures from **four professional firms** across two tables,
  but there is no unified, monitorable view of what we actually have, which
  figures corroborate each other, and how much to trust each one.

Professional CRE (Cushman & Wakefield MarketBeat, CBRE, JLL — confirmed live via
crawl4ai, 07/17/2026) is published at **submarket × sector**, rolled up to a
market/metro headline. ZIP is a residential grain and is never used for CRE.

## Goal

One tidy, monitorable **figures layer** holding every real CRE figure we own at
**submarket × sector × quarter × metric** grain, where each figure carries its
source firm, source URL, verified flag, as-of date, and a **corroboration
confidence tier**. The brain reads this layer instead of stamped corridor
copies; the corridor tables drop to the qualitative-intel role they genuinely
earn. We can "keep tabs on" the whole thing from an ops monitoring page.

The moat rule holds unchanged: an unsourced number is the only hard reject; a
single professional-firm figure is used (it is the only trust available); two
firms agreeing within tolerance is a confidence upgrade, not a requirement.

## Data census (verified live, 07/17/2026)

Five real CRE tables. Numbers below are live row counts from direct probes.

1. **`data_lake.marketbeat_swfl`** — the numeric core. 373 rows, 14 quarters
   (2022-Q4 → 2026-Q1), 22 submarkets, 6 sectors (industrial, flex,
   medical_office, office, retail, multifamily). Metrics: `vacancy_rate`,
   `asking_rent_nnn`, `absorption_sqft`, `inventory_sf`, `sale_price_psf`,
   `cap_rate`. Per-source population:
   - `cw_marketbeat` — 173 rows, 113 verified. vacancy 133, rent 68, absorption
     126, inventory 169. **cap_rate 0.**
   - `colliers_industrial` — 132 rows, 0 verified. vacancy/rent/inventory 132,
     absorption 128. cap_rate 0.
   - `mhs_databook` — 48 rows, 48 verified. all of vacancy/rent/absorption/
     inventory/sale_psf populated. cap_rate 0.
   - `lee_associates` — 20 rows, 0 verified. the **only** marketbeat source with
     `cap_rate` (20).
2. **`public.corridor_profiles`** — 27 corridors. cap/vacancy/rent sourced on 23
   of 27 (≈94% of metric citations point at `assets.cushmanwakefield.com`;
   remainder lsicompanies.com / gulfshorebusiness.com). Absorption sourced on 1
   of 23. Also holds the genuine corridor intel (`character`, `active_flags`,
   `character_broker_narrative`, `character_facts`).
3. **`data_lake.active_listings_cre`** — 62 property-level listings (Brevitas,
   Crexi) with `asking_price_psf`, `sqft`, `property_type`, `status`. Listing
   grain, not aggregate.
4. **`data_lake.city_pulse_corridors`** — 198 cited current-events facts per
   corridor (transit grants, broker-report drops), each with `source_url` and
   `cited_text`. Qualitative intel, all sourced.
5. **`data_lake.local_cre_context`** — 14 cited new-project / permit items per
   city.

The numbers live in (1)(2)(3); (4)(5) are the qualitative intel layer.

### Corroboration reality (why the confidence model is needed, not decorative)

Where two firms report the same submarket × sector × quarter cell (exact
submarket-name match), agreement ranges from tight to wildly divergent:

- North Fort Myers industrial 2026-Q1: C&W 2.8% vs MHS 3.4% vacancy → spread 0.6.
- Charlotte County industrial 2026-Q1: C&W 2.4% vs MHS 9.4% vacancy → spread 7.0.

Multi-source cells today (exact-name match only): 18 for vacancy, 16 for rent,
17 for absorption, out of 346 total cells. Overlap is limited because the four
firms use **different submarket vocabularies** (Colliers 6 broad names, C&W 18
fine, MHS 16, Lee 1) and cover different sectors. A submarket crosswalk widens
corroboration; single-source figures are the baseline regardless.

## What we're building

### 1. Submarket crosswalk (`cre-submarket-crosswalk`)

One authority mapping every firm's submarket vocabulary to a canonical SWFL
submarket set (extends the existing `MARKETBEAT_SUBMARKET_MAP` spirit but is
source-aware: `colliers "Bonita/Estero" → {Bonita Springs, Estero}` etc.). A
firm name with no canonical mapping stays unmatched and its figure is emitted as
single-source (never dropped, never force-fit). Corroboration compares only
canonical cells. Ships exact-match day one; crosswalk entries expand coverage
incrementally.

### 2. Unified figures view (`cre_figures`)

A derived, deterministic layer — one row per **canonical_submarket × sector ×
quarter × metric × source_firm**, normalizing (1)(2)(3) into a single shape:

```
canonical_submarket, sector, quarter, metric, value, units,
source_firm, source_url, source_verified, as_of
```

Corridor figures (table 2) map in as `source_firm` = the cited publisher (mostly
Cushman & Wakefield), at their canonical submarket; **unsourced corridor
absorption is excluded at this boundary** (no source = not a figure). Listing
prices (table 3) enter as a distinct `metric` = `asking_price_psf` at listing
grain, aggregated to submarket median with listing count disclosed.

### 3. Corroboration + confidence engine (`cre-corroboration`)

Deterministic (code, not LLM). For each canonical_submarket × sector × quarter ×
metric, collect all source_firm values and assign a tier:

- **`corroborated`** — 2+ firms within tolerance (Standard, below). Value =
  median of agreeing firms; citation names all contributing firms.
- **`flagged`** — 2+ firms but spread exceeds tolerance. Emit both, prefer the
  verified / most-recent firm as the reported value, attach a
  `sources_disagree` caveat. Never silently average a disagreement.
- **`single_source`** — one firm. Used as-is, tagged with the firm. This is the
  majority of cells and is fully acceptable (professional-firm trust).
- **`rejected`** — no source. Not emitted (the only hard block).

**Standard tolerance (operator-approved 07/17/2026):**
- vacancy: within 2.0 percentage points
- asking rent: within 15% (relative)
- absorption: within 25% (relative)
- (cap rate / sale psf: within 15% relative — provisional, thin data)

Tolerances live in one config object so they are tunable without touching engine
logic.

### 4. Reporting grain

Figures are emitted **per sector** (industrial / office / retail / medical
office / flex / multifamily — never blended across sectors), each rolled up to a
metro/county headline (Lee / Collier, and a SWFL line) computed across
submarkets. This mirrors how C&W publishes (per-sector MarketBeat + a market
headline).

### 5. Ops monitoring surface

A read-only page (in the ops repo, per convention) rendering the `cre_figures`
layer: coverage grid (submarket × sector × metric, which firms, verified),
corroboration tier counts, and the current `flagged` disagreements — so drift,
gaps, and source conflicts are visible at a glance. This is the "keep tabs on
it" surface.

## Data flow

```
marketbeat_swfl ┐
corridor_profiles ┼─→ [crosswalk normalize] ─→ cre_figures (submarket×sector×quarter×metric×firm)
active_listings_cre ┘                                   │
                                                        ▼
                                          [corroboration engine + Standard tolerance]
                                                        │
                                    ┌───────────────────┼────────────────────┐
                                    ▼                    ▼                    ▼
                            confidence-tagged      ops monitoring      (follow-up spec)
                            figures view            page                CRE brain consumes
```

## Provenance & rules

- No-invention is enforced at the `cre_figures` boundary: a figure with no
  `source_url` is never emitted. Unsourced corridor absorption is dropped here.
- Every emitted figure names its source firm + URL + as-of date (MM/DD/YYYY in
  any rendered prose; raw dates internal only).
- Corroboration/agreement math is deterministic code; no LLM produces or blends
  a number.
- Grain and source are unconstrained by the moat framing — this is submarket ×
  sector, never framed as "ZIP-level."

## Scope / decomposition

This spec covers **only** the figures layer + crosswalk + corroboration engine +
ops surface. Explicitly out of scope here (each its own follow-up spec):

- **CRE brain re-grain** — re-point the brain's key_metrics, direction call, and
  health index at `cre_figures` (per sector, submarket vote, metro rollup);
  demote corridor numbers to a secondary block; keep corridor intel
  (`city_pulse_corridors`, `active_flags`, narrative). Supersedes and closes the
  open `cre_direction_vote_and_corridor_factor_stamped_weighting` check.
- Fable's unpushed submarket-median fix (`wt/grain-fixes`, `3084c99d`) stands as
  an interim consumer — its embed card, tests, and rail wiring remain valid; the
  brain's number sourcing later moves onto this layer.

This deliverable is **decoupled from the pre-rebuild push** — it is its own
build, not a pre-rebuild change.

## Testing

- Crosswalk: unit tests that every firm submarket string maps to a canonical
  name or is deliberately unmatched (no silent misroute); a collision test.
- Corroboration engine: fixture-driven tests pinning each tier — a corroborated
  pair (spread < tolerance), a flagged pair (the real Charlotte 7.0-pt gap), a
  single-source cell, a rejected unsourced cell. Tolerance boundary tests
  (exactly at 2.0 pts / 15% / 25%).
- No-invention invariant: a row with null source_url never appears in
  `cre_figures` output.
- Sector-isolation invariant: no aggregate ever blends two sectors.

## Open questions (resolved)

- Grain → submarket × sector, metro/county rollup. (operator, 07/17)
- Tolerance → Standard. (operator, 07/17)
- Single-source figures → used, tagged. Unsourced → rejected. (operator, 07/17)
- Crosswalk → built as part of this layer; exact-match works day one, crosswalk
  expands coverage. (default, confirm on review)

## Resolutions — 07/18/2026 (evidence-backed, operator-steered)

The two decisions the handoff flagged as unsettled — the trust bar for the
0-verified Colliers (132) + Lee (20) rows, and where `cre_figures` lives — were
resolved against the live rows + crawl4ai research this session.

### Firm-data reality (pulled live from `data_lake.marketbeat_swfl`, 07/18)

Both firms are **real**. The split is **sourced vs unsourced**, not real vs fake:

- **`lee_associates`** — 20 rows, Fort Myers, 4 sectors (industrial/retail/office/
  multifamily), 5 quarters (2025-Q1 → 2026-Q1). Holds the **only `cap_rate` and
  `sale_price_psf` in the whole corpus**. Every quarter carries a **live source
  URL** — 4 Lee & Associates PDF reports (`lee-associates.com/wp-content/uploads/
  2026/04/2026-Q1-Fort-Myers-FL-{Industrial,Retail,Office,Multifamily}.pdf`), all
  verified resolving (HTTP 200, `application/pdf`, ~2.7 MB each). `verified=false`
  is an un-done editorial spot-check, **not** a missing source.
- **`colliers_industrial`** — 132 rows, 6 submarkets, 2 sectors (industrial/flex),
  11 quarters (2022-Q4 → 2025-Q4). No cap/psf. **Zero `source_url` captured on any
  row** — the actual defect. Colliers *does* publish this: the SWFL Industrial
  Market Report ships every quarter at `colliers.com/en/research/ft-myers/
  southwest-florida-industrial-market-report-<yyyy>-q<n>` (confirmed live; regional
  figures align — their Q4 2025 vacancy 9.9%, Q1 2026 9.7% / 115,777 sf absorbed).
  The URL is a predictable per-quarter pattern, so provenance is **backfillable**.

### Decision 1 — trust bar = "has a `source_url`", NOT `verified===true`

The gate is the moat rule (an unsourced number is the only hard reject), applied
at the `cre_figures` boundary. Consequences:

- **Lee enters `cre_figures` now** — single-source, tagged `lee_associates`, cited
  to its PDF. This un-strands every cap rate we own.
- **Colliers enters after a source-URL backfill** — a real, bounded work item
  (map each `(quarter)` → its Colliers report URL; the pattern is known). Until
  backfilled, Colliers rows are correctly rejected (no-invention). **This backfill
  is called out as its own plan task requiring operator sign-off** — it is worth
  it (132 rows = the entire SWFL industrial picture across 6 submarkets).
- `verified` is NOT the gate — it is an editorial spot-check that, unrun for these
  two firms, would darken 152 rows of real professional data including all cap
  rates. The pack's existing `verified===true` inclusion rule
  (`selectLatestVerifiedPerSubmarket`) is the wrong gate for the figures layer.

### Decision 2 — `cre_figures` is a queryable table + a viewable ops page

Operator wants to *see* the built layer, not have it buried inside brain output.
So: deterministic logic **in code** (testable), result **materialized to a
queryable `data_lake.cre_figures` table**, and a **read-only ops monitoring page**
(coverage grid: submarket × sector × metric, colored by source status — citable /
needs-source / no-figure; corroboration-tier counts; current `flagged`
disagreements). The ops page reads the table directly; the CRE brain re-grain
(separate follow-up spec) reads the same table. One source of truth, independently
inspectable — the "keep tabs on it" surface.

### Five review findings folded in (from the v2 handoff design review)

1. Firm identity is **`source_name`**, never `_source_model` (the LLM extractor,
   which collapses 3 firms into 1 and under-counts corroboration 18 → 3).
2. **Extend `MARKETBEAT_SUBMARKET_MAP`**, don't rebuild — it already documents
   Colliers' broad aliases (e.g. "Bonita/Estero" = Bonita Springs + Estero).
3. **Sector scope**: Colliers = industrial + flex; Lee = 4 sectors; C&W/MHS cover
   the rest. Every sector surfaces on its own line, **never blended**.
4. **`active_listings_cre` needs a corridor → submarket hop** before its 62
   listings aggregate to a submarket median (distinct `metric = asking_price_psf`).
5. **Corroboration keys on `source_name`** and compares only same canonical cells;
   two firms agreeing within tolerance is a confidence upgrade, never a requirement.

### Still out of scope here (unchanged)

The CRE brain re-grain onto `cre_figures` remains its own follow-up spec. This
layer + crosswalk + corroboration engine + ops page is the deliverable; the brain
consuming it comes after.
