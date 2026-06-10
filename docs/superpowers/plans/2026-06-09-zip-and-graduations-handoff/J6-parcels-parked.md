# J6 — Parcels: Lee PARKED, Collier surface-able (= §G + one §F-style add)

> **Preamble:** Read `SESSION_LOG.md` then `CLAUDE.md` (RULE 0). Obey the **3 GATES**
> ([`README.md`](./README.md)). **Do not `git push` without operator confirmation.** Work on
> `main` — no branches/PRs.

**Phase:** any · **Depends on:** J1 (for the scope-gate) for the Collier add; the Lee track is
deferred · **Parallel:** independent.
**Model: 🟢 SONNET-FINE** — the Collier surface is a small brain add; the Lee track is doc-only.

> **Correction (2026-06-09):** an earlier draft of this card said *both* parcel tables have "no
> site geo → park." That is wrong for Collier. Verified columns:
> - `data_lake.leepa_parcels` (Lee): `folioid` + valuation + sale columns only — **no situs
>   address, no lat/lon, no zip** (`ingest/pipelines/leepa/resources.py:32` `_TIER2_LEEPA_COLUMNS`).
> - `data_lake.collier_parcels`: **already carries `phy_zipcd`** — a nullable *physical/site* ZIP
>   from FDOR cadastral (`ingest/pipelines/collier_parcels/resources.py:35`). G1-compliant (physical,
>   not mailing). The column comment even says it's "kept for … per-ZIP drill work."

---

## J6a — Collier parcels: surface the EXISTING `phy_zipcd` (doable now)
No column add — `collier_parcels.phy_zipcd` exists. The work is **surfacing + guarding**, §F-style:
1. **Validate, don't invent:** every `phy_zipcd` surfaced must pass `resolveZip(zip).in_scope` (J1);
   drop/null out-of-6-county or malformed values. Never widen from the data rows (SCOPE).
2. **G3 — consuming brain exists:** `properties-collier-value` (county-grain today; §C `BRAIN_GEO`
   lists it `covers: Collier`). Add a `grain:"zip"` `detail_tables` entry keyed by `phy_zipcd`
   (per-ZIP parcel value/SOH stats) so a Collier ZIP becomes a true-ZIP row in the fan-out (§C
   branch-a) instead of a county-labeled fallback. Numbers stay at the parcel's own ZIP — that is
   the row's true grain, not a county figure relabeled (MOAT safe).
3. **Note:** this surfaces ZIP-grain *parcel stats*. The address→exact-parcel JOIN is still §G
   (J6b) — we don't hold it; never quote a single-parcel value from a street address.

## J6b — Lee `leepa_parcels`: genuinely PARKED (= §G data track)
No situs/geo on the row → **park, don't omit** (G2). Unblocking is real ingest work, scoped
separately:
1. Extend `ingest/pipelines/leepa/resources.py` to pull a **situs-address or parcel-centroid**
   layer (Lee centroids live in Tier-1 `leepa/parcels/*.geojson.gz`) joined on `folioid`.
2. Geocode/centroid → ZIP, **scope-gated via `resolveZip`** (J1), NULL when out-of-scope.
3. `ALTER TABLE data_lake.leepa_parcels ADD COLUMN IF NOT EXISTS zip_code text` + backfill + **wire
   the pipeline** (G2). **G3:** surface in `properties-lee-value` (already reads `leepa_parcels`) in
   the same PR.

## Relationship to the existing plan
This is **§G parcel-exact** (`../2026-06-09-universal-location-search/07-parcel-exact.md`). §G itself
notes Collier `phy_zipcd` "already gives ZIP-grain parcel stats now" (that's J6a) while the
address→parcel join is the deferred track (that's J6b). Out of the critical path for ZIP search.

## Acceptance
- **J6a:** `properties-collier-value` emits a `grain:"zip"` detail_table from `phy_zipcd`; every
  surfaced ZIP passes `resolveZip().in_scope`; `bun refinery/tools/check-vocab-coverage.mts --all`
  clean (detail rows add no slugs). 
- **J6b:** a `checks` row opened for the Lee parcel ZIP source-layer extension
  (`node scripts/check.mjs open … parcels_lee_zip_source_layer …`); nothing silently dropped.
