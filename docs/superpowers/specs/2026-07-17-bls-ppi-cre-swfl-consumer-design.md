# BLS PPI construction-cost consumer — design

**Date:** 2026-07-17
**Status:** approved (operator, in-session)

## Problem

`bls_ppi` (`ingest/cadence_registry.yaml:518`) has landed monthly to `lake-tier1/macro/bls_ppi/`
since 2026-05-27. `consuming_pack: none` — no brain reads it. Two series pulled today:
`PCU236221236221` (New Warehouse Building Construction) and `PCU236211236211` (New Industrial
Building Construction) — both nonresidential (an earlier "residential" label in
`ingest/pipelines/bls_ppi/constants.py` was wrong and already corrected 07/11/2026).

Two things needed deciding before wiring a consumer: (1) which pack should read it, (2) whether
the 2-series ingest scope was complete. Full-scope-first discipline (`CLAUDE.md`) requires
enumerating the source's full ceiling before writing ingest code.

## Research (crawl4ai, live 07/17/2026)

Fetched BLS's live PPI industry code list (`download.bls.gov/pub/time.series/pc/pc.industry`) and
the PPI Industry Factsheets pages. Findings:

- The 2 series we pull belong to a bounded, named BLS sector: **"Nonresidential Building
  Construction"** (BLS's own NRBC initiative), NAICS 236 subset. That sector has exactly 12
  industry-level series, of which we pull 2.
- **No BLS PPI series exists for residential building construction** (no NAICS 2361xx entries in
  the live industry list). The old "residential" label wasn't applied to the wrong series — there
  is no correct series to apply it to. Genuine new-home price data lives at Census (Price Index of
  New Single-Family Houses Under Construction), a different agency/program — out of scope here.
- All 12 series are **national-only** — no state/regional BLS breakout, same constraint macro-us
  already works around via the tiered chain + local data.
- Adjacent to the 12: BLS also publishes a **Final Demand Construction** composite family
  (`WPUFD43`/`WPUFD431`/`WPUFD432`, under the FD-ID commodity system) and a **Materials and
  Components for Construction** input-cost index (`WPUID612`/`WPUID6121`/`WPUID6122`). Both
  verified live but **not included in this build** — different survey/ID system, and the registry's
  own source_ceiling note only named the 12 NRBC series as the gap to close. Flagged as a future
  extension, not pulled now.

## Full series scope (all 12, pulling all 12)

| Series ID | NAICS | Title | Status today |
|---|---|---|---|
| `PCU236211236211` | 236211 | New industrial building construction | pulling |
| `PCU236221236221` | 236221 | New warehouse building construction | pulling |
| `PCU236222236222` | 236222 | New school building construction | **adding** |
| `PCU236223236223` | 236223 | New office building construction | **adding** |
| `PCU236224236224` | 236224 | New health care building construction | **adding** |
| `PCU23811X23811X` | 23811X | Concrete contractors, nonres. building work | **adding** |
| `PCU23816X23816X` | 23816X | Roofing contractors, nonres. building work | **adding** |
| `PCU23821X23821X` | 23821X | Electrical contractors, nonres. building work | **adding** |
| `PCU23822X23822X` | 23822X | Plumbing/HVAC contractors, nonres. building work | **adding** |
| (id tbd, verify at implementation) | 236400 | Nonres. building construction by contractor type/region | **adding**, aggregate — not separately surfaced |
| (id tbd, verify at implementation) | 236500 | Nonres. building construction by region | **adding**, aggregate — not separately surfaced |
| (id tbd, verify at implementation) | 2381MR | Nonresidential building maintenance & repair | **adding**, not separately surfaced |

BLS's timeseries POST endpoint accepts up to 50 series per call — pulling all 12 is still one
request, same monthly cadence, no cost/rate change. Implementation must re-verify the two
`tbd` series IDs against `data.bls.gov` before wiring `SERIES_IDS` (per RULE 0.4 — don't hand-type
IDs from this doc without a live check at build time).

## Consumer: cre-swfl (not a new pack, not the macro chain)

`cre-swfl` already surfaces `retail`, `industrial`, `office`, `medical_office` as isolated
per-sector slugs (locked 2026-06-08 convention, "zero cross-sector blending"). The 5 building-type
PPI series map onto that existing structure directly — this is completing an established pattern,
not scope creep. The macro chain (macro-us/florida/swfl) was ruled out: it's explicitly
rate/inflation-scoped, not sector-specific construction cost. A new dedicated leaf pack was ruled
out: unnecessary surface area for what pairs 1:1 onto sectors that already exist.

**Wiring:**

- New `refinery/sources/bls-ppi-source.mts` — tier-1 reader modeled on
  `refinery/sources/macro-us-source.mts` (live + fixture modes, `SourceConnector` shape). Reads
  `lake-tier1/macro/bls_ppi/`, normalizes each series into a typed fragment (series_id, label,
  value, period, direction vs. prior periods — same `direction` computation pattern as
  `MacroUsNormalized`).
- `cre-swfl.mts` adds `blsPpiSource` to its `sources: [...]` array.
- Per-sector mapping (building-type indexes → matching MarketBeat sector's key_metrics, each as its
  own named/cited metric, never blended):
  - `industrial` sector ← `236211` (industrial) + `236221` (warehouse), two named citations
  - `office` sector ← `236223`
  - `medical_office` sector ← `236224`
  - `retail` sector — no matching BLS series; stays without a construction-cost pairing (documented
    gap, not invented)
- The 4 trade-contractor indexes (concrete/roofing/electrical/plumbing-HVAC) surface as **one
  cross-sector "construction cost pressure" metric** on cre-swfl's top-level output — not
  sector-isolated, since they're genuinely cross-sector cost drivers (same treatment cre-swfl
  already gives other cross-sector context).
- `236400`/`236500`/`2381MR` are pulled (ingest completeness) but **not** surfaced as separate
  cre-swfl metrics — they're aggregates/rollups of series already shown individually; surfacing
  both would violate the smoothing-lint/no-blending discipline already enforced on this pack.

## 236222 (school) — parked, not force-fit

No existing pack owns institutional/public construction (`permits-commercial-swfl` aggregates by
submarket+ZIP, not building type; `econ-dev-swfl` tracks announced project $ and jobs, not
construction cost). Forcing it into cre-swfl's private-CRE broker-profile framing would be
incoherent — a CRE broker persona has no reason to care about school-construction PPI the way it
cares about industrial/office/medical_office costs.

Decision: **pull it into ingest now** (same one BLS API call, zero extra cost) but leave it
consumer-less — same honest `consuming_pack` gap the whole source is in today, just correctly
scoped down to one series instead of the whole source. Per RULE 2.4 (no silent deferrals), open a
`checks` entry in the same session this ships: find `236222`'s real home once there's a matching
institutional/school-specific data source to pair it with (school district capital plans, DOE
facility data, or an SWFL Inc project-announcement category match). This is not a decision to
revisit casually — it's tracked, not forgotten.

## Registry / vocab / test updates

- `ingest/cadence_registry.yaml` bls_ppi entry: `consuming_pack: cre-swfl` (11 of 12 series
  consumed; comment notes 236222 stays parked, points at the checks entry). `source_scope` block
  rewritten: `confirmed_total` = 12 series (the full NRBC sector), `source_ceiling` narrowed to the
  genuinely-not-pulled adjacent systems (Final Demand Construction composite, Materials/Components
  for Construction input index) with their verified series IDs and `as_of: 07/17/2026`.
- `refinery/vocab/brain-vocabulary.json`: new slugs for each new cre-swfl metric (industrial/
  office/medical_office construction-cost, cross-sector build-cost-pressure) — shipped in the same
  commit as the pack change (Gate 2).
- Tests: `refinery/__fixtures__/bls-ppi.sample.json` (fixture-mode sample, modeled on
  `macro-us.sample.json`), `cre-swfl.test.mts` additions for the new metrics, ingest-side
  `ingest/tests/pipelines/bls_ppi/test_pipeline.py` extended for the 10 new series IDs.

## Out of scope (this build)

- Final Demand Construction composite (`WPUFD43` family) and Materials/Components for Construction
  input index (`WPUID612` family) — verified live, real, but a different survey/ID system beyond
  what this build closes. Future extension if wanted.
- Heavy/civil engineering construction (NAICS 237 — roads, bridges, utilities) — different asset
  class from cre-swfl's private-building focus, never investigated this session.
