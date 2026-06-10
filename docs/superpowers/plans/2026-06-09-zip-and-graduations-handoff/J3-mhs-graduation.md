# J3 — MHS graduation (full): submarket crosswalk + site `zip_code` + consumer brain

> **Preamble:** Read `SESSION_LOG.md` then `CLAUDE.md` (RULE 0). Obey the **3 GATES**
> ([`README.md`](./README.md)). **Do not `git push` without operator confirmation.** Work on
> `main` — no branches/PRs. **Do not touch** `cre-swfl.mts` or `lib/highlighter/grounding.ts`.
> **Do not blend with `permits-swfl`** (that's residential/Accela Lee+Collier — different source).

**Phase:** 2 · **Depends on:** J1 merged on `main` · **Parallel:** ∥ J2 (serialize edits to
`brain-vocabulary.json` / `cadence_registry.yaml` / `index.mts` — see PARALLEL-MAP).
**Model: 🔴 OPUS-RECOMMENDED.** Multi-file build (new source connector + pack + vocab + cadence)
where the **vocab contract is the recurring nightly-rebuild breaker** (pre-push gate #2) and
parallel-session drift has re-flipped locked decisions before. The MOAT scope-gate on the geocode
backfill is a judgment call. If a Sonnet takes it, an Opus must review the pack + vocab diff before push.

## Background
`data_lake.mhs_permits_swfl` holds **281 rows** (2025 calendar year, 12 jurisdictions) from the
MHS DataBook PDF — DDL `docs/sql/20260605_mhs_permits_swfl.sql`. Real columns:
`jurisdiction` (raw string), `calendar_year`, `issued_date`, `asset_class`, `project_address`,
`project_name`, `permit_value_usd`, `building_sf`, `source_name='mhs_databook'`, `verified`.
**No `submarket_slug`, no lat/lon, no `zip_code` yet.** It's parked in `cadence_registry.yaml`
under `probe_mode: odd_window`. It has **no consuming brain**, which is why raw jurisdiction
strings can't be grouped meaningfully — and why **G3 makes the brain mandatory in this same PR.**

> ⚠️ The original handoff said "query the lake via `mcp__lake__query_lake`." **Wrong.** Packs read
> at build time through a **Supabase PostgREST source connector**. Mirror
> `refinery/sources/collier-permits-source.mts` (`getSupabase()` + `selectAllPaged`).

## Step 1 — Migration (idempotent; run directly, creds in `.dlt/secrets.toml`)
```sql
-- jurisdiction -> submarket crosswalk (spellings verified against the loaded rows)
CREATE TABLE IF NOT EXISTS data_lake.mhs_jurisdiction_xwalk (
  raw_jurisdiction TEXT PRIMARY KEY,
  submarket_slug   TEXT NOT NULL,
  county           TEXT NOT NULL
);
INSERT INTO data_lake.mhs_jurisdiction_xwalk VALUES
  ('Unincorporated Lee County',       'lee-county-unincorp',       'Lee'),
  ('City of Cape Coral',              'cape-coral',                'Lee'),
  ('City of Fort Myers',              'fort-myers',                'Lee'),
  ('City of Bonita Springs',          'bonita-springs',            'Lee'),
  ('City of Sanibel',                 'sanibel',                   'Lee'),
  ('Town of Fort Myers Beach',        'fort-myers-beach',          'Lee'),
  ('Estero',                          'estero',                    'Lee'),
  ('Unincorporated Collier',          'collier-county-unincorp',   'Collier'),
  ('City of Naples',                  'naples',                    'Collier'),
  ('City of Marco Island',            'marco-island',              'Collier'),
  ('Unincorporated Charlotte County', 'charlotte-county-unincorp', 'Charlotte'),
  ('City of Punta Gorda',             'punta-gorda',               'Charlotte')
ON CONFLICT (raw_jurisdiction) DO NOTHING;

ALTER TABLE data_lake.mhs_permits_swfl ADD COLUMN IF NOT EXISTS submarket_slug TEXT;
ALTER TABLE data_lake.mhs_permits_swfl ADD COLUMN IF NOT EXISTS zip_code TEXT;

UPDATE data_lake.mhs_permits_swfl p
  SET submarket_slug = x.submarket_slug
  FROM data_lake.mhs_jurisdiction_xwalk x
  WHERE p.jurisdiction = x.raw_jurisdiction AND p.submarket_slug IS NULL;

GRANT SELECT ON data_lake.mhs_jurisdiction_xwalk TO service_role;
NOTIFY pgrst, 'reload schema';
```
Verify: `SELECT submarket_slug, count(*) FROM data_lake.mhs_permits_swfl GROUP BY 1 ORDER BY 2 DESC;`
→ 12 groups, no NULL `submarket_slug`.

## Step 2 — Backfill `zip_code` (G1/G2/SCOPE)
`project_address` is the only site locator (no lat/lon). Geocode it through the Census batch
geocoder (same one collier_permits uses), then **scope-gate through `resolveZip(zip).in_scope`
(J1)**. Write `zip_code` only when in-scope; **leave NULL when the address is missing or resolves
out-of-6-county** (sparse addresses → some NULLs; that is honest, not a failure). Never derive a
ZIP from `jurisdiction` — a jurisdiction spans many ZIPs, so that would be invented precision
(MOAT). **G2:** wire `ingest/pipelines/mhs_permits_swfl/` to stamp `submarket_slug` + `zip_code`
on future drops, not just this backfill.

## Step 3 — Build the consumer brain (G3) — `refinery/packs/permits-commercial-swfl.mts`
New PostgREST source connector mirroring `collier-permits-source.mts`; new pack mirroring a simple
leaf (`notices-swfl.mts` / `tdt-swfl.mts`). Aggregate by `submarket_slug`: count,
`sum(permit_value_usd)`, `sum(building_sf)`. Emit `key_metrics` for the 3 slugs below + a
`grain:"submarket"` detail_table (and, where `zip_code` resolved, `grain:"zip"` rows). Direction:
compare 2025 vs prior year if present, else `stable` + a caveat. Register in
`refinery/packs/index.mts` (`import` + `[pack.id]: pack` in `PER_PACK_REGISTRY`).

## Step 4 — Vocab (same commit as the pack — pre-push gate #2)
Register in `refinery/vocab/brain-vocabulary.json`, each with `prefLabel` + `scope_note` + a
`slug_index` identity entry, `source_brains: ["permits-commercial-swfl"]`:
- `commercial_permits_count`, `commercial_permits_value_usd`, `commercial_permits_sf`.

## Step 5 — Graduate the cadence entry
In `ingest/cadence_registry.yaml`, move `mhs_permits_swfl` out of the `probe_mode: odd_window`
block into the `pipelines:` block. **Coordinate with J5** (same file).

## Acceptance
- `bun refinery/tools/check-vocab-coverage.mts --all` clean (no orphans).
- `npm run refinery -- permits-commercial-swfl` (or `master --target-only`) builds; all 3 slugs
  present; no NULL-PK / build error.
- `submarket_slug` has no NULLs; every non-null `zip_code` satisfies `resolveZip().in_scope`.
- Cadence entry moved; pipeline dry-run stamps both new columns (G2).
