# Roadmap Status — Current State (Auto-Generated)

_The descriptive layer. Live brains, sources, edges, and commits since the last `ontology-and-roadmap.md` touch. Hand-edit `docs/ontology-and-roadmap.md` §6–§9 for forward strategy; this file is regenerated from code._

**Generated:** 2026-05-19T05:02:22.374Z (commit `2beff0a`)
**Last roadmap doc touch:** `5ce70b2` · 2026-05-17T21:55:20-04:00 · feat(properties-lee-value): ship first LeePA-consuming brain + master 10→11 edges

## Regenerate

```
npm run roadmap:sync
```

## TL;DR

- **14** brains in the runtime registry.
- **34** source connectors across **2** distinct trust tiers (T1, T2).
- **6** distinct domains: `environmental`, `finance`, `hospitality`, `logistics`, `macro`, `real-estate`.
- **45** commits since the last roadmap-doc touch — **17** are trigger-shaped (touched packs/sources/types/constitution/confidence/dag/render/validate).

## Live Brains

| Brain | Domain | Sources | Trust tiers | Input edges |
| --- | --- | ---: | --- | ---: |
| `cre-swfl` | `real-estate` | 1 | T2 | 0 |
| `env-swfl` | `environmental` | 3 | T1 | 0 |
| `franchise-outcomes` | `real-estate` | 1 | T1 | 0 |
| `logistics-swfl` | `logistics` | 1 | T1 | 0 |
| `logistics-swfl-nowcast` | `logistics` | 2 | T2 | 1 |
| `macro-florida` | `macro` | 3 | T1, T2 | 1 |
| `macro-swfl` | `macro` | 1 | T2 | 1 |
| `macro-us` | `macro` | 1 | T1 | 0 |
| `master` | `real-estate` | 12 | T2 | 12 |
| `properties-lee-value` | `real-estate` | 2 | T1, T2 | 0 |
| `sector-credit-swfl` | `finance` | 4 | T1, T2 | 3 |
| `storm-history-swfl` | `environmental` | 1 | T1 | 0 |
| `tourism-tdt` | `hospitality` | 1 | T1 | 0 |
| `traffic-swfl` | `logistics` | 1 | T2 | 0 |

## Source connectors per brain

### `cre-swfl`

| source_id | trust_tier |
| --- | ---: |
| `corridor_profiles` | T2 |

### `env-swfl`

| source_id | trust_tier |
| --- | ---: |
| `fema_nfhl` | T1 |
| `fema_nfip_claims` | T1 |
| `usgs_water` | T1 |

### `franchise-outcomes`

| source_id | trust_tier |
| --- | ---: |
| `sba_loans_franchise_outcomes` | T1 |

### `logistics-swfl`

| source_id | trust_tier |
| --- | ---: |
| `faf5_flows_swfl` | T1 |

### `logistics-swfl-nowcast`

| source_id | trust_tier |
| --- | ---: |
| `fdot_freight_swfl` | T2 |
| `brain-input:logistics-swfl` | T2 |

### `macro-florida`

| source_id | trust_tier |
| --- | ---: |
| `fred_macro_florida` | T1 |
| `census_cbp_fl` | T1 |
| `brain-input:macro-us` | T2 |

### `macro-swfl`

| source_id | trust_tier |
| --- | ---: |
| `brain-input:macro-florida` | T2 |

### `macro-us`

| source_id | trust_tier |
| --- | ---: |
| `fred_macro_us` | T1 |

### `master`

| source_id | trust_tier |
| --- | ---: |
| `brain-input:franchise-outcomes` | T2 |
| `brain-input:cre-swfl` | T2 |
| `brain-input:macro-us` | T2 |
| `brain-input:macro-florida` | T2 |
| `brain-input:macro-swfl` | T2 |
| `brain-input:sector-credit-swfl` | T2 |
| `brain-input:tourism-tdt` | T2 |
| `brain-input:env-swfl` | T2 |
| `brain-input:logistics-swfl` | T2 |
| `brain-input:logistics-swfl-nowcast` | T2 |
| `brain-input:traffic-swfl` | T2 |
| `brain-input:properties-lee-value` | T2 |

### `properties-lee-value`

| source_id | trust_tier |
| --- | ---: |
| `leepa_value_lee` | T2 |
| `fhfa_hpi` | T1 |

### `sector-credit-swfl`

| source_id | trust_tier |
| --- | ---: |
| `sba_loans_by_naics_county` | T1 |
| `brain-input:franchise-outcomes` | T2 |
| `brain-input:macro-us` | T2 |
| `brain-input:macro-florida` | T2 |

### `storm-history-swfl`

| source_id | trust_tier |
| --- | ---: |
| `noaa_storm_events_swfl` | T1 |

### `tourism-tdt`

| source_id | trust_tier |
| --- | ---: |
| `fl_dor_tdt` | T1 |

### `traffic-swfl`

| source_id | trust_tier |
| --- | ---: |
| `fdot_aadt_swfl` | T2 |

## Brain DAG (edges)

Every edge: `upstream → downstream (edge_type)`. Edge types: `input | constraint | veto | modifier` (`refinery/types/pack.mts` → `BrainEdgeType`).

| Upstream | Downstream | Edge type |
| --- | --- | --- |
| `cre-swfl` | `master` | **input** |
| `env-swfl` | `master` | **veto** |
| `franchise-outcomes` | `master` | **input** |
| `franchise-outcomes` | `sector-credit-swfl` | **input** |
| `logistics-swfl-nowcast` | `master` | **input** |
| `logistics-swfl` | `logistics-swfl-nowcast` | **input** |
| `logistics-swfl` | `master` | **input** |
| `macro-florida` | `macro-swfl` | **input** |
| `macro-florida` | `master` | **input** |
| `macro-florida` | `sector-credit-swfl` | **input** |
| `macro-swfl` | `master` | **input** |
| `macro-us` | `macro-florida` | **input** |
| `macro-us` | `master` | **input** |
| `macro-us` | `sector-credit-swfl` | **input** |
| `properties-lee-value` | `master` | **input** |
| `sector-credit-swfl` | `master` | **input** |
| `tourism-tdt` | `master` | **input** |
| `traffic-swfl` | `master` | **input** |

## Domain coverage

| Domain | Brain count | Brain IDs |
| --- | ---: | --- |
| `environmental` | 2 | `env-swfl`, `storm-history-swfl` |
| `finance` | 1 | `sector-credit-swfl` |
| `hospitality` | 1 | `tourism-tdt` |
| `logistics` | 3 | `logistics-swfl`, `logistics-swfl-nowcast`, `traffic-swfl` |
| `macro` | 3 | `macro-florida`, `macro-swfl`, `macro-us` |
| `real-estate` | 4 | `cre-swfl`, `franchise-outcomes`, `master`, `properties-lee-value` |

_The `BrainDomain` union (`real-estate | finance | environmental | demographics | logistics | hospitality | macro`) defines the seven roadmap slots. Any domain not listed above is currently empty._

## Commits since last roadmap doc touch

| SHA | Date | Subject |
| --- | --- | --- |
| `2beff0a` | 2026-05-19 | feat(storm-history-swfl): pack + 8-concept vocab registration + first Tier 1 brain |
| `e8c5cbb` | 2026-05-19 | feat(storm-history-swfl): TS source connector reading Tier 1 Parquet via DuckDB httpfs |
| `d2ab8ad` | 2026-05-18 | chore: add @duckdb/node-api for refinery DuckDB-on-Parquet reads |
| `1c62235` | 2026-05-18 | test(storm-history-swfl): commit Parquet fixture (2022-2024 SWFL, 91 rows) for TS tests |
| `db6d743` | 2026-05-18 | fix(storm-history-swfl): live-run fixes - correct NCEI URL, enumerate files vs HTTP-glob, run-from-repo-root, ASCII output, s3_region |
| `4ebb80f` | 2026-05-18 | feat(ingest): storm-history-swfl DuckDB pipeline + damage-string parser |
| `007ae1b` | 2026-05-18 | feat(ingest): scaffold duckdb_pipelines package + storm_history_swfl constants |
| `8b132a0` | 2026-05-18 | feat(ingest): _tier1_inventory table + upsert helper for Tier 1 Parquet audit trail |
| `fb30be4` | 2026-05-18 | feat(scripts): add DuckDB<->Supabase S3 smoke test (Q1 gate) |
| `3c848a9` | 2026-05-18 | chore: dlt buffer and chunking tweaks for fdot, fema, and leepa |
| `4f55014` | 2026-05-18 | chore: add littlebird session notes directory + lake-probe script |
| `d8dc4fd` | 2026-05-18 | docs(tier-policy): scope refinery writes to data_lake.* + drop dead Path B constant |
| `8be74ac` | 2026-05-18 | feat(nowcast): Lane 2D.1 — shock_log writer + end-to-end pipeline test |
| `e153949` | 2026-05-18 | docs(sessions): archive cosmic-rolling-brook v2 plan + ship-status |
| `e8f5600` | 2026-05-18 | test(vocab): vocab-coverage helper + canonical adoption in nowcast test |
| `269bf61` | 2026-05-18 | chore(gitignore): defensive **/secrets.toml glob |
| `ce9cd7d` | 2026-05-18 | refactor(logistics-swfl-nowcast): Path B — FDOT-vs-FDOT-history deviation math + cold-start gate |
| `9c1c7bc` | 2026-05-18 | fix(vocab): register 9 logistics-swfl-nowcast concepts + re-render full DAG |
| `53c52aa` | 2026-05-18 | feat(logistics-swfl-nowcast): Lane 2D — 13th pack, thin-pipe FDOT freight nowcast |
| `2ee8055` | 2026-05-18 | feat(dag): Lane 2E — stale-upstream auto-caveat + min-confidence cap |
| `2a548ea` | 2026-05-18 | docs(consumption-contract): Lane 2C — rigid 6-section template + v1.2 preservation |
| `8969fa6` | 2026-05-18 | test(packs): sync env-swfl + properties-lee-value source counts |
| `f2817d1` | 2026-05-18 | feat(metric-contract): Lane 1B — variable_type + units + source-required + citation_ref |
| `b47fd35` | 2026-05-18 | feat(smoothing): Lane 1D — smoothing-lint + shared token constant |
| `645e426` | 2026-05-18 | feat(confidence): Lane 1A — trust-tier-weighted-mean headline + 3 diagnostics |
| `1266072` | 2026-05-18 | docs(sql): version-control data_lake.faf_flows DDL + lookups + grants |
| `80e87ae` | 2026-05-18 | feat(env-swfl): add USGS hydrology as 3rd source + 4 new metrics + vocab entries |
| `b7cac85` | 2026-05-18 | feat(usgs): TS source connector with HydroSwflAggregate + 4 SWFL aggregators |
| `12f576d` | 2026-05-18 | feat(usgs): fixture — 57 rows across 4 parameters + 4 SWFL sites |
| `7d9e888` | 2026-05-18 | feat(usgs): SQL grant — service_role read on usgs_daily + usgs_sites |
| `7367c00` | 2026-05-18 | feat(usgs): pipeline entry point + post-ingest parameter_cds rollup |
| `517cbbe` | 2026-05-18 | feat(usgs): scaffold ingest package — constants, urls, two dlt resources |
| `3114b54` | 2026-05-18 | docs(usgs): add USGS Water Services API blueprint — DBHYDRO replacement for env-swfl |
| `e2a3f22` | 2026-05-18 | chore(ledger): regenerate against HEAD — close 30-commit gap (47→67 concepts, 10→12 packs) |
| `f16029e` | 2026-05-18 | Delete DBHYDRO blueprint (API endpoints dead) |
| `5318e52` | 2026-05-18 | Add DBHYDRO API Blueprints for Opus |
| `7728672` | 2026-05-18 | feat(leepa-live): flip properties-lee-value + master to live LeePA + FHFA data |
| `d07d749` | 2026-05-18 | fix(bls-qcew): switch ingest from .json to .csv endpoint |
| `e21bab9` | 2026-05-18 | docs(bls-qcew): spec + implementation plan |
| `5eed3ac` | 2026-05-18 | feat(bls-qcew): TS source connector — LaborSwflSummary with private-sector YoY |
| `b876a21` | 2026-05-18 | feat(bls-qcew): fixture — 30 rows (3 areas x 5 ownership codes x 2 quarters) |
| `5fe4586` | 2026-05-18 | feat(bls-qcew): add Supabase service_role grant SQL |
| `b11adaa` | 2026-05-18 | feat(bls-qcew): dlt merge pipeline — quarter detection, resource, column hints |
| `d91752d` | 2026-05-18 | feat(bls-qcew): scaffold package skeleton + FIPS constants |
| `400e443` | 2026-05-18 | feat(fhfa-hpi): ship FHFA HPI dlt pipeline + Supabase-backed connector + wire into properties-lee-value v2 |

## Trigger-shaped commits since last roadmap doc touch

Per §10 of `ontology-and-roadmap.md`, commits that touch `refinery/packs/`, `refinery/sources/`, `refinery/types/`, `refinery/constitution/`, `refinery/lib/confidence`, `refinery/lib/dag`, `refinery/render/`, or `refinery/validate/` *should have* triggered a roadmap update. The list below is what's currently un-reflected in the prescriptive doc.

| SHA | Date | Subject | Trigger files (sample) |
| --- | --- | --- | --- |
| `2beff0a` | 2026-05-19 | feat(storm-history-swfl): pack + 8-concept vocab registration + first Tier 1 brain | `refinery/packs/index.mts`, `refinery/packs/storm-history-swfl.mts`, `refinery/packs/storm-history-swfl.test.mts` |
| `e8c5cbb` | 2026-05-19 | feat(storm-history-swfl): TS source connector reading Tier 1 Parquet via DuckDB httpfs | `refinery/sources/storm-history-source.mts`, `refinery/sources/storm-history-source.test.mts` |
| `d8dc4fd` | 2026-05-18 | docs(tier-policy): scope refinery writes to data_lake.* + drop dead Path B constant | `refinery/sources/fdot-freight-source.mts` |
| `8be74ac` | 2026-05-18 | feat(nowcast): Lane 2D.1 — shock_log writer + end-to-end pipeline test | `refinery/packs/logistics-swfl-nowcast.test.mts`, `refinery/sources/fdot-freight-source.mts`, `refinery/sources/supabase.mts` |
| `e8f5600` | 2026-05-18 | test(vocab): vocab-coverage helper + canonical adoption in nowcast test | `refinery/packs/logistics-swfl-nowcast.test.mts` |
| `ce9cd7d` | 2026-05-18 | refactor(logistics-swfl-nowcast): Path B — FDOT-vs-FDOT-history deviation math + cold-start gate | `refinery/packs/logistics-swfl-nowcast.mts`, `refinery/packs/logistics-swfl-nowcast.test.mts`, `refinery/sources/fdot-freight-source.mts` |
| `53c52aa` | 2026-05-18 | feat(logistics-swfl-nowcast): Lane 2D — 13th pack, thin-pipe FDOT freight nowcast | `refinery/packs/index.mts`, `refinery/packs/logistics-swfl-nowcast.mts`, `refinery/packs/logistics-swfl-nowcast.test.mts` |
| `2ee8055` | 2026-05-18 | feat(dag): Lane 2E — stale-upstream auto-caveat + min-confidence cap | `refinery/lib/dag.mts` |
| `2a548ea` | 2026-05-18 | docs(consumption-contract): Lane 2C — rigid 6-section template + v1.2 preservation | `refinery/validate/consumption-contract.test.mts` |
| `8969fa6` | 2026-05-18 | test(packs): sync env-swfl + properties-lee-value source counts | `refinery/packs/env-swfl.test.mts`, `refinery/packs/properties-lee-value.test.mts` |
| `f2817d1` | 2026-05-18 | feat(metric-contract): Lane 1B — variable_type + units + source-required + citation_ref | `refinery/constitution/hospitality.mts`, `refinery/constitution/hospitality.test.mts`, `refinery/constitution/real-estate.mts` |
| `b47fd35` | 2026-05-18 | feat(smoothing): Lane 1D — smoothing-lint + shared token constant | `refinery/validate/smoothing-lint.mts`, `refinery/validate/smoothing-lint.test.mts` |
| `645e426` | 2026-05-18 | feat(confidence): Lane 1A — trust-tier-weighted-mean headline + 3 diagnostics | `refinery/constitution/hospitality.test.mts`, `refinery/constitution/real-estate.test.mts`, `refinery/lib/confidence.mts` |
| `80e87ae` | 2026-05-18 | feat(env-swfl): add USGS hydrology as 3rd source + 4 new metrics + vocab entries | `refinery/packs/env-swfl.mts` |
| `b7cac85` | 2026-05-18 | feat(usgs): TS source connector with HydroSwflAggregate + 4 SWFL aggregators | `refinery/sources/usgs-water-source.mts` |
| `5eed3ac` | 2026-05-18 | feat(bls-qcew): TS source connector — LaborSwflSummary with private-sector YoY | `refinery/sources/bls-qcew-source.mts` |
| `400e443` | 2026-05-18 | feat(fhfa-hpi): ship FHFA HPI dlt pipeline + Supabase-backed connector + wire into properties-lee-value v2 | `refinery/packs/properties-lee-value.mts`, `refinery/sources/fhfa-hpi-source.mts` |

---

**Notes**

- This file is generated; do not edit by hand.
- Hand-edit `docs/ontology-and-roadmap.md` §6 (NOW), §7 (NEAR-TERM), §8 (LONG-TERM) for forward strategy.
- Regenerate after any roadmap-shaped commit: `npm run roadmap:sync`.
