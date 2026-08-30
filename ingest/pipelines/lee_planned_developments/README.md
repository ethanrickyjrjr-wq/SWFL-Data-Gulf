# lee_planned_developments — community boundaries + the parcel→community join

**Spec (read first):** `docs/superpowers/specs/2026-08-12-community-crosswalk-design.md` —
every number, failure mode, and design decision lives there. Playbook:
`docs/standards/community-crosswalk-playbook.md`.

Two entry points, one table each:

1. `python -m ingest.pipelines.lee_planned_developments.pipeline [--dry-run]`
   Lee County DCD "Planned Developments" FeatureServer → `data_lake.lee_planned_developments`.
   ALL 1,629 features land (full-scope-first); geometry arrives WGS84 because the request
   says `outSR=4326` (server-side reprojection from State Plane feet — the failure class is
   deleted, not guarded). Merge on `objectid`. 2 empty-name features dropped + counted.

2. `python -m ingest.pipelines.lee_planned_developments.spatial_join [--dry-run]`
   `data_lake.leepa_parcels` (strap + latitude/longitude, attached by the LeePA fabric pull /
   `scripts/backfill_leepa_parcel_coords.py`) × the 490 Approved-residential polygons →
   `data_lake.parcel_community_pd`. DuckDB `spatial` ST_Contains; no hand-written
   point-in-polygon (that is `lib/geo/ray-cast.ts`'s whole reason for existing, and we write
   none at all). The residential/Approved allowlist applies HERE at read, never at ingest,
   and is recorded per-row in `assignment_criteria`.

First live run 08/28/2026: 104,911 assignments across 409 communities; 7,429 ambiguous
(cross-community multi-match — smallest ACRES won, flagged, never silently); 803 low-trust
(Sketched / "Bad Legal"); **96,679 servable across 401 communities**
(`data_lake.parcel_community_pd_summary_v`, the ONE aggregate consumers read).
Collier: 220,875 parcels explicitly excluded — no coordinates, Lee-only boundary source.

**SCOPE — never drop this sentence:** the source layer covers unincorporated Lee County
only, plus some legacy incorporated polygons. Cape Coral, Fort Myers and Bonita Springs are
NOT fully covered. Never describe this as "the community answer for Lee."

Consumers (brain-first, same PR): `refinery/packs/communities-swfl.mts` (via
`parcel_community_pd_summary_v`) and `lib/listings/community-identity.ts` (per-parcel
identity on the email path — silent for Sketched/"Bad Legal"/ambiguous, wording
test-enforced).

Tests: `test_normalize.py` (name normalization, bounds, empty names),
`test_assign.py` (allowlist, multi-phase collapse, ambiguity flag),
`test_spatial_join.py` (real DuckDB containment — the lon/lat-swap tripwire).
