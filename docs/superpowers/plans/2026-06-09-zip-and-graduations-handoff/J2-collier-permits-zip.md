# J2 — Collier permits site `zip_code`

> **Preamble:** Read `SESSION_LOG.md` then `CLAUDE.md` (RULE 0). Obey the **3 GATES**
> ([`README.md`](./README.md)). **Do not `git push` without operator confirmation.** Work on
> `main` — no branches/PRs. **Do not touch** `cre-swfl.mts`, `lib/highlighter/grounding.ts`, or
> (to avoid a J3 registry clash) `refinery/packs/permits-commercial-swfl.mts` /
> `ingest/cadence_registry.yaml`.

**Phase:** 2 · **Depends on:** J1 merged on `main` · **Parallel:** ∥ J3 (serialize registry edits — see PARALLEL-MAP).
**Model: 🟡 SONNET-CAPABLE** — mostly mechanical (column add + backfill + surface). **Escalate to
Opus for two steps:** the live Census field-path confirmation (G4) and the MOAT scope-gate
assertion (zero out-of-6-county ZIPs). Don't let those two slide.

## Why this is clean
- **G1:** `data_lake.collier_building_permits` has site `lat`/`lon` (already geocoded) and
  `site_address`. It also has `owner_zip` / `contractor_zip` — **those are mailing ZIPs; never
  read them.** The source connector already drops `owner_*`/`contractor_*`
  (`collier-permits-source.mts:38-39`) — keep it that way.
- **G3 already satisfied:** `permits-swfl` consumes Collier via
  `refinery/sources/collier-permits-source.mts`. No new brain needed — this is a column add to a
  table that already has a consuming brain.
- The Census batch geocoder that stamped `lat`/`lon` **also returns the ZIP** in the same
  response (`ingest/pipelines/collier_permits/geocoder.py`). We're capturing a field we already
  fetch, not adding a geocode pass.

## Steps
1. **Geocoder (G4 first):** make ONE live Census batch-geocoder call and confirm the postal/ZIP
   field path in the real JSON. Extend `ingest/pipelines/collier_permits/geocoder.py` to return
   that ZIP alongside lat/lon; `ingest/pipelines/collier_permits/normalizer.py` /
   `pipeline.py` stamp it onto the row (**G2 — wire the pipeline so future runs populate it**).
2. **Migration (idempotent, run directly per CLAUDE.md — creds in `.dlt/secrets.toml`):**
   ```sql
   ALTER TABLE data_lake.collier_building_permits ADD COLUMN IF NOT EXISTS zip_code text;
   CREATE INDEX IF NOT EXISTS idx_collier_permits_zip
     ON data_lake.collier_building_permits (zip_code);
   ```
3. **Backfill** existing rows from their stored `lat`/`lon` (reverse-geocode) or re-geocode
   `site_address`. **Scope-gate every value through `resolveZip(zip).in_scope` (J1)** — if a row
   resolves out-of-6-county, leave `zip_code` NULL (do not write an out-of-scope or invented ZIP;
   MOAT). Verify:
   ```sql
   SELECT count(*) total,
          count(*) FILTER (WHERE zip_code IS NOT NULL) with_zip
   FROM data_lake.collier_building_permits;
   -- then assert zero out-of-scope: every non-null zip_code must satisfy resolveZip().in_scope
   ```
4. **Surface it (§F crisp rows):** add `zip_code` to the `collier-permits-source.mts` SELECT and
   carry it into a `permits-swfl` `grain:"zip"` detail_table row (mirror how Lee permits expose
   ZIP). Numbers stay at their true grain — a permit's ZIP is the permit's own site, not a county
   figure (MOAT safe).

## Acceptance
- Migration idempotent (re-run = no-op); row counts verified; **zero non-null `zip_code` outside
  the 6 counties** (the scope-gate assertion above passes).
- `bun test refinery/packs/permits-swfl.test.mts` green (update/extend fixtures as needed).
- A spot ZIP (e.g. a Naples `34102` permit) appears in the `permits-swfl` zip detail rows.
- Pipeline dry-run shows new rows carry `zip_code` going forward (G2 — not backfill-only).
