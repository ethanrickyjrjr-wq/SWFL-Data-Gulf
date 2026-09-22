# FDIC BankFind: Lee/Collier/Hendry bank branches + annual branch deposits (SOD), no key

**Date:** 2026-09-22 · **Operator pick (verbatim):** "whichever you have an api key to and can actually
produce a working pipeline with all the information" · **Check:** `fdic_bankfind_live_verify`

## Problem

Bank deposits by branch are a free, keyless, 32-year county series we catalogued twice
(`_RESEARCH/data-and-ingest/2026-08-02-greenfield-scout-bizform.md` §1; `docs/standards/data-inventory.md`
"confirmed NOT in our database") and never landed. It is the NORTH STAR shape — a series nobody equates
with the housing market that has to move first (deposit flight precedes lending pullback).

## Goal

Land the source's FULL scope for the three core counties into `data_lake.*` on a cron, with a consumer
in the same change, and prove it with a real run.

## Full scope (live-probed 09/22/2026 at `https://api.fdic.gov/banks`, the host `banks.data.fdic.gov`
301-redirects to)

- `/sod` — Summary of Deposits, one row per branch per year, **81 fields** (deposits `DEPSUMBR` in $000s,
  branch address, lat/lon, service type, MSA/CSA, parent-holding-company, charter, regulator, plus the
  institution-level `ASSET`/`DEPSUM`/`DEPDOM`). Years **1994–2026** (2026 = as-of 06/30/2026, already
  published: Lee 162 branches vs 160 in 2025). Filtered by **`STCNTYBR`** (branch county):
  Lee 12071 = 6,160 rows · Collier 12021 = 4,297 · Hendry 12051 = 302 → **10,759 rows**.
- `/locations` — current branch directory, **38 fields** (name, office, address, lat/lon, CBSA, service
  type, established/acquired dates). Lee 165 · Collier 128 · Hendry 5 → **298 rows**, 47 distinct banks.
- `/institutions` — the banks behind those branches, **134 fields** (assets, deposits, ROA/ROE, net
  income, charter, holding company, active flag). Pulled for every CERT that appears in SOD or locations:
  **198 distinct CERTs** across all years.
- Paging: `limit` max **10,000** (validated by the API: `Number must be less than or equal to 10000`);
  `offset` honored. Every county fits in one page; the pipeline still pages and asserts
  `len(rows) == meta.total`.
- Unpulled ceiling (same API, not in this build): `/history` (structure-change events), `/failures`,
  `/summary` (state aggregates), `/demographics`, `/financials`.

## THE TRAP (found this session; the 08/02 scout has it wrong)

`STCNTY` on `/sod` is the **institution's headquarters** county; `STCNTYBR` is the **branch's** county.
The scout filtered `STCNTY:12071` and got 26 rows for 2025 — Edison National Bank and two other locally
headquartered banks. The branch-county filter returns 160 Lee branches for 2025 across 33 banks.
Test `test_sod_filter_uses_branch_county_not_hq_county` locks this.

## What we're building

1. `ingest/pipelines/fdic_bankfind/` — three dlt resources, vendor field names kept as-written
   (dlt lowercases): `fdic_sod` (merge on `id` = `YEAR_CERT_BRNUM`, all years), `fdic_locations`
   (replace, insert-from-staging, min-rows guard 268 = 90% of 298), `fdic_institutions` (replace,
   insert-from-staging, min-rows guard 178 = 90% of 198). `--dry-run` fetches + validates, no write.
2. `docs/sql/20260922_fdic_sod_county_year_v.sql` — aggregate view `data_lake.fdic_sod_county_year_v`
   (county, year, branches, banks, deposits $000s). Aggregate at source; the connector reads ~100 rows.
3. `refinery/sources/fdic-deposits-source.mts` → one `fdic-deposits-swfl-summary` fragment (latest
   complete year per county, YoY %, branch + bank counts) → `refinery/packs/macro-swfl.mts` facts +
   key_metrics + vocab slugs. Fixture `refinery/__fixtures__/fdic-deposits.sample.json`.
4. `.github/workflows/fdic-bankfind-annual.yml` — SOD publishes once a year (~October, as-of 06/30);
   monthly retry cron on the 20th like `census-cbp-annual.yml`, `workflow_dispatch` with `dry_run`.
5. Registry `pipelines:` + `jobs:` entries with `source_scope`; data-roots section; data-inventory +
   repo-inventory rows; scout correction appended in `_RESEARCH`.

## Failure modes → guards

- Partial page (API truncates or errors mid-sweep) → `assert len(rows) == meta.total` per county, raise.
- Vendor renames a column we look up by name → `assert_header_has` on `YEAR, CERT, BRNUM, DEPSUMBR,
  STCNTYBR` before the first row (Redfin 09/15 lesson).
- HQ-county filter regression → test on the literal filter string.
- Latest year incomplete in the vendor index (a bank reports early) → connector serves a year only when
  its branch count ≥ 80% of the prior year; otherwise it serves the prior year and names the partial one.
- Replace wipes good data on a bad fetch → `insert-from-staging` + `assert_min_rows` before yield.
- Built dark → consumer in the same change; `consuming_pack: macro-swfl`.

## Not built (deliberate)

`/history`, `/failures`, `/summary`, `/demographics`, `/financials` — catalogued in `source_ceiling`.
No ZIP-grain consumer yet (branch `ZIPBR` is situs, G1-clean, available when a consumer asks).
