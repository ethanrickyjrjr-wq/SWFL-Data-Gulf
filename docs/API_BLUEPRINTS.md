# API Research Blueprints for Dynamic Brain Tree

**Note on Brains Supabase context:** All source fields and staging tables below target the Brains Supabase instance — not the legacy DB.

## Data Tier Policy (locked 2026-05-17)

Five rules govern every new state/national dataset. The companion plan at `C:\Users\ethan\.claude\plans\what-is-the-synchronous-snail.md` is the source spec; this section is the operational reference.

### Three-tier storage

| Tier | Storage                                                                        | Cost (Supabase, May 2026) | What lives here                                                                                       |
| ---- | ------------------------------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1    | Supabase Storage buckets (`raw-geometry/`, `raw-binary/`, `raw-tabular-cold/`) | ~$0.021/GB/mo             | (a) geometry/binary/blobs and (b) **speculatively-cached tabular dumps as compressed Parquet/CSV.gz** |
| 2    | Postgres `data_lake.*`                                                         | ~$0.125/GB/mo             | Tabular data with an active consuming brain shipping THIS sprint                                      |
| 3    | Postgres in non-`data_lake` schemas (e.g. `intelligence.*`, `published.*`)     | ~$0.125/GB/mo             | Promoted, brain-validated baselines, Refinery-readable                                                |

Tabular data without a consuming brain stays in Tier 1 as Parquet. Promotion to Tier 2 happens via a one-shot dlt `replace` load when the brain ships. **Postgres bytes cost ~6× Storage bytes — a 50 GB dump is $1.05/mo in Tier 1 vs $6.25/mo in Tier 2.**

### Decision tree for every new dataset

```
Is there a brain shipping THIS sprint that reads this data?
   |
   +-- YES --> Tier 2 Postgres (data_lake.*). Ship pipeline + brain in one PR.
   |
   +-- NO --> Is the data tabular?
                |
                +-- YES --> Tier 1 Supabase Storage as compressed Parquet/CSV.gz.
                |           Write a pointer row in `data_lake._tier1_inventory`.
                |
                +-- NO (geometry/binary/PDF) --> Tier 1 Supabase Storage in
                                                  raw-geometry/ or raw-binary/.
                                                  Pointer row required.
```

### Five locked rules

1. **Three-tier storage** (see table above). No exceptions.
2. **Brain-first ingest gate.** No bulk ingest hits Tier 2 Postgres without its consuming brain's `PackDefinition` landing in the same PR. No direct Refinery SQL against `data_lake.*` — a `SourceConnector` reads `data_lake` only if its parent pack exists with a real `outputProducer`.
   - **Scoped write exception (added 2026-05-18, precedent: `logistics-swfl-nowcast`):** Refinery **writes** to `data_lake.*` are permitted only for **append-only observability tables that the refinery itself reads back on subsequent runs** — i.e., the table is the refinery's own scratchpad/diagnostic log, not a brain input consumed by other packs. Canonical example: `data_lake.fdot_freight_nowcast_shock_log` (the nowcast brain writes one row per run, reads back the last 90 to compute its rolling baseline). Any new refinery writer to `data_lake.*` requires a **PR-level callout naming this exception**; absent that, the writer must land in an `intelligence.*` or `published.*` schema (Tier 3), not `data_lake`. This prevents the tier boundary from eroding through unannounced precedent.
3. **Macro denominator chain canonical.** `macro-us` (national) → `macro-florida` (state) → `macro-swfl` (regional deltas). Every gap-\* brain declares `macro-florida` as upstream. Gap math in code, never LLM.
4. **logistics-swfl owns FAF5; macro-\* stays economic/environmental.** Domain isolation per Brain Factory v1.1.
5. **FAF5 cold-storage provenance.** ORNL is the archive. `data_lake.faf_flows` is a working cache; `_ingest_metadata` rows capture source URL + vintage so re-download is traceable. Audit trail without paying Postgres prices to be the archive of record.

### TTL + cleanup discipline

- **Monthly Tier 2 orphan check:** any `data_lake.*` table whose name doesn't match an active `PackDefinition` source is flagged. Ship the brain or demote to Tier 1 Parquet.
- **Quarterly Tier 1 inventory audit:** review `data_lake._tier1_inventory`. >12 months old + no consumer brain on the roadmap → delete the bucket object, leave the pointer row with `deleted_at` timestamp (audit trail stays, bytes don't).
- **FAF5 time-boxed exception:** FAF5 is in Tier 2 without a brain. Allowed because `logistics-swfl` ships this sprint. If the brain doesn't ship, FAF5 demotes to Tier 1.

### Multi-layer Tier 2 promotion — LeePA canonical example

LeePA exposes 24 layers on its ArcGIS MapServer; `properties-lee-value` reads three of them (9 use codes, 10 last qualified sale, 12 just value). The Tier 2 table `data_lake.leepa_parcels` is the **joined** result of those three layers on `FOLIOID`. Pattern:

1. **Per-layer Tier 1 archive.** Each layer pulled via `paginate_arcgis_tabular()` (the `f=json&returnGeometry=false` sibling of `paginate_arcgis`), uploaded as `leepa/{layer}/{date}.csv.gz` with its own `_tier1_inventory` pointer. Three layers → three pointer rows. Provenance per layer is preserved even though Tier 2 holds the joined product.
2. **Fail-fast canonical-count gate.** Before promotion, `arcgis_count(LEEPA_JUST_VALUE_URL)` queries the layer's `returnCountOnly=true` endpoint. If paginated rows are < 90% of the canonical count, abort — pagination dropped pages and Tier 2 would be silently truncated.
3. **In-memory left-join on the value-layer spine.** Use-codes and last-sale are joined onto every just-value row. Missing matches yield NULL columns (left-join semantics), not row drops.
4. **Single `_promote_to_tier2` step.** Same shape as the FDOT/FEMA inline promoters: `@dlt.resource(table_name="leepa_parcels", write_disposition="replace", columns=_TIER2_LEEPA_COLUMNS)` then `load_info.raise_on_failed_jobs()`. No separate file, no separate npm script.
5. **Server-side aggregation views.** For 400k-row tables, the source connector reads pre-aggregated views (`data_lake.leepa_parcels_sales_yearly`, `data_lake.leepa_parcels_summary`) rather than pulling raw rows over PostgREST. Aggregation lives in `docs/sql/leepa_parcels_grant.sql` alongside the GRANTs.

Sibling LeePA brains (`-supply`, `-corridors`, `-flood`) land additively against `data_lake.leepa_parcels` without re-ingesting layers. Spatial brains (`-flood`) will need a parallel promoter that retains SHAPE geometry — that's the only deviation from this pattern.

**Architectural Rule — Ingest Broad, Filter Local:**
The `dlt` pipelines described below MUST ingest data broadly (e.g., all of Florida or national context) into the A1 Data Lake. Do not prematurely truncate the raw ingest to just Lee/Collier counties at the pipeline level. SWFL-specific filtering (e.g., `county_fips = 12071` or `dms_dest = 129`) is handled downstream by the Master Brain when spinning up Atomic Brains. The examples below show the SWFL logic for downstream use, not for upstream truncation.

## Target 1 — Data USA API (Tesseract Cubes)

### Critical Corrections

- `cbp_naics` -> Actual Tesseract Cube Name is `county_business_patterns`
- `pums_migration` -> **DOES NOT EXIST.** The PUMS cubes (pums_1, pums_5) contain Birthplace and Nativity dimensions — useful for origin-country proxy but NOT county-to-county migration flows. For wealth-weighted migration, we must use IRS SOI county-to-county files (see substitution below).

### Cube 1: county_business_patterns (Business Density)

- **Base URL:** `https://api.datausa.io/tesseract/`
- **Auth:** None. No API key.
- **Ingest Target:** Pull all FL counties. Drop the `&County=` filter in the raw ingest, or use `&State=04000US12` if supported.
- **Downstream SWFL Filter:** `05000US12071` (Lee) | `05000US12021` (Collier)
- **NAICS Drilldown:** Append `&drilldowns=County,NAICS` to get industry breakdown.

### Substitute for pums_migration: IRS SOI County-to-County Migration

- **Source:** `https://www.irs.gov/statistics/soi-tax-stats-county-to-county-migration-data-files`
- **Type:** Bulk CSV download via ZIP (dlt must use `requests` + `csv.DictReader`)
- **Auth:** None.
- **Ingest Target:** Ingest all inflows/outflows involving `statefips == "12"` (Florida).
- **Downstream SWFL Filter:** `y2_countyfips` in `["071", "021"]`

## Target 2 — Federal Register API (/public-inspection)

- **Base URL:** `https://www.federalregister.gov/api/v1/`
- **Auth:** None.
- **Rate Limits:** ~100 req/min is safe.
- **Infrastructure Grants Query:**
  `GET https://www.federalregister.gov/api/v1/documents.json?per_page=100&conditions[term]=infrastructure+grant&conditions[type][]=Notice&conditions[publication_date][gte]=2025-01-01`
- **AI Consortia Export Rules Query:**
  `GET https://www.federalregister.gov/api/v1/documents.json?per_page=50&conditions[term]=AI+export+rules&conditions[publication_date][gte]=2025-01-01`

## Target 3 — ITA Trade Data API

- **Portal:** `https://developer.trade.gov/`
- **Auth:** Free account required (Ocp-Apim-Subscription-Key in header). _Note: Old api.trade.gov/apps/store/ credentials are dead._
- **Trade Leads Query:** `GET https://api.trade.gov/v1/trade_leads/search.json?size=50&offset=0`
- **CSL Query:** `GET https://api.trade.gov/v1/consolidated_screening_list/search.json?size=50&q=China&sources=SDN,DPL,EL`
- **CSL Free Fallback:** The full CSL is downloadable without a key at `https://www.trade.gov/consolidated-screening-list` in CSV/JSON. Simpler for a `dlt` pipeline targeting periodic snapshots.

## Target 4 — FAF5 (Freight Analysis Framework)

- **Verdict:** No REST API. Bulk CSV/ZIP download only (`https://faf.ornl.gov/faf5/`).
- **FAF Zone for SWFL:** **Zone 129** (Remainder of Florida). _(Note: 124 is Tampa, 129 is Lee/Collier)_
- **SCTG Targets:** 12 (Gravel/crushed stone), 32 (Base metals/rebar), 31 (Nonmetallic mineral products), 33 (Articles of base metal).
- **Ingest Target:** Ingest all domestic flows where `dms_dest` OR `dms_orig` starts with `12` (All FL zones: 121, 122, 123, 124, 129).
- **Downstream SWFL Filter:** `dms_dest = 129` and `trade_type = 1`

## Semantic Ledger Mapping Proposal (`brain-vocabulary.json`)

```json
{
  // IRS Migration → pums_migration brain
  "irs_migration_inflow_count": {
    "maps_to": "population_inflow_units",
    "source": "IRS SOI"
  },
  "irs_migration_agi_000s": {
    "maps_to": "household_wealth_proxy",
    "source": "IRS SOI"
  },

  // Data USA CBP → cbp_naics brain
  "cbp_employees": { "maps_to": "labor_market_depth", "source": "Census CBP" },
  "cbp_num_establishments": {
    "maps_to": "business_density",
    "source": "Census CBP"
  },

  // Federal Register → macro/policy brain
  "fedreg_doc_number": {
    "maps_to": "regulatory_event_id",
    "source": "Federal Register"
  },
  "fedreg_type": {
    "maps_to": "regulatory_action_type",
    "source": "Federal Register"
  },

  // ITA Trade Leads → foreign capital brain
  "ita_lead_country": {
    "maps_to": "foreign_capital_origin",
    "source": "ITA Trade Leads"
  },
  "ita_csl_entity_name": { "maps_to": "sanctions_entity", "source": "ITA CSL" },

  // FAF5 → logistics/commodity brain
  "faf_sctg2": { "maps_to": "commodity_class_sctg", "source": "FAF5 ORNL" },
  "faf_tons": { "maps_to": "freight_volume_ktons", "source": "FAF5 ORNL" }
}
```
