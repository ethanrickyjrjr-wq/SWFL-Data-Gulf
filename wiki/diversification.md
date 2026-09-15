---
title: Diversification beyond real estate
type: concept
status: active
updated: 2026-09-15
sources:
  - brains/condo-sirs-swfl.md
  - brains/sector-credit-swfl.md
  - brains/logistics-swfl.md
  - brains/labor-demand-swfl.md
  - brains/econ-dev-swfl.md
  - ingest/pipelines/dbpr_sirs/pipeline.py
---
# Diversification beyond real estate

**Status (2026-09-15):** the data is already multi-industry; the product wrapper (copy, pricing,
marketing) is the only thing single-industry. Condo SIRS compliance is the sharpest, most timely
opportunity of the five identified — scoped below, waiting on Ricky's call on framing (free public
lookup vs. gated/monetized) before building.

## What it is

Ricky's ask: "How do we diversify from just being a real estate search? We need to find more data
and figure out how data we already have access to correlates with other industries." The answer
found by reading the actual brain files (not just filenames): at least 5 of the 44 brains hold data
whose real buyer isn't a realtor at all. This mirrors Carbon Arc's own playbook exactly — one data
layer, sliced into named vertical landing pages (their `/enterprise` page: Financial Services,
Consumer, Real Estate, Healthcare, AI Natives, Sports & Media, Business Services, Consulting) — see
[MCP connector](mcp-connector.md) for the full Carbon Arc comparison.

## Facts

- 2026-09-15 — Five brains with a buyer outside real estate, ranked by opportunity:
  1. **`condo-sirs-swfl`** — DBPR Structural Integrity Reserve Study filings (post-Surfside law).
     Buyer: condo boards/property managers checking their own building, structural engineers who do
     SIRS studies, condo buyers doing due diligence. Real regulatory deadline pressure = urgency a
     realtor-facing product doesn't have. Scoped below.
  2. **`sector-credit-swfl`** — SBA 7(a)/504 loan charge-off rates by NAICS sector, Lee & Collier,
     paired with named-brand outcomes. Buyer: local banks/credit unions underwriting SBA loans, loan
     brokers.
  3. **`logistics-swfl`** — FAF5 inbound freight flow data (origin, commodity, tonnage, value)
     landing in the SWFL FAF zone. Buyer: 3PLs, warehouse/industrial site selectors, trucking
     companies. Pairs with `rsw-airport` and `traffic-swfl`.
  4. **`labor-demand-swfl`** — BLS OEWS wage/occupation benchmarks for the Cape Coral-Fort Myers and
     Naples-Marco Island MSAs. Buyer: staffing agencies, employers doing wage benchmarking or
     relocation site-selection.
  5. **`econ-dev-swfl`** — weekly scrape of SWFL Inc.'s (Lee County EDO) project announcements:
     count, disclosed investment, jobs. Buyer: CRE brokers, chambers of commerce, regional
     investors tracking growth.
- 2026-09-15 — **Condo SIRS data verified deeper than the brain summary.** The brain
  (`brains/condo-sirs-swfl.md`) exposes only 4 aggregate counts (1,366 SWFL total, 608 Lee, 758
  Collier, 664 filed under HB 913). The raw table underneath, `data_lake.dbpr_sirs_submissions`,
  holds **row-level data** per filing — `association_name`, `project_name`, `city`, `zip`,
  `county`, `dbpr_id` — for all 1,366 associations. Nothing reads this table anywhere in the app
  today; no API route, no UI. A "search your building" lookup is genuinely buildable from data
  already sitting in the lake, not a new-data project. (ingest/pipelines/dbpr_sirs/pipeline.py,
  `INSERT INTO data_lake.dbpr_sirs_submissions`)
- 2026-09-15 — **The one real limitation on condo SIRS, and it changes how this can be sold.**
  DBPR's registry is positive-signal-only: presence confirms a filing, but there is no baseline
  count of every SWFL condo that's *required* to file. We can say "yes, on file" with confidence.
  We cannot say "not on file" = "non-compliant" with confidence — it might be missing from the
  scrape, or the building might not even be 3-story+ and subject to the law. This blocks selling
  engineers a prospect list of "buildings that haven't complied" until a baseline registry of all
  required filers is sourced. It does NOT block a public "check your building" lookup, which only
  needs to answer "is this one on file."

## Decisions

- 2026-09-15 — Condo SIRS is the first diversification target, on urgency (real regulatory clock)
  and buildability (row-level data already in the lake, zero new ingestion needed).
- 2026-09-15 — v1 scope proposed: a page (e.g. `/condo-sirs`) with one search box — building/
  association name in, filed/not-found-in-registry (worded carefully, since "not found" ≠ "not
  compliant"), era (pre/post HB 913), county. Needs one new API route doing a fuzzy match against
  `data_lake.dbpr_sirs_submissions` — same shape of work as `/connect`, plus a query endpoint. Not
  yet built.
- 2026-09-15 — The move for the other four (`sector-credit-swfl`, `logistics-swfl`,
  `labor-demand-swfl`, `econ-dev-swfl`) is a landing page per vertical pointed at data already
  collected — same mechanism as `/connect` and the condo SIRS page, not new data collection.

## Open questions

- **Free public lookup, or gated/monetized from day one?** Ricky's call, asked 2026-09-15, not yet
  answered — changes the build (a `/connect`-style trust funnel vs. an account-gated product from
  the start).
- Who's the real first paying customer for condo SIRS — a condo board (one-time check, low value)
  or a structural engineering firm (recurring lead list, higher value, but blocked until a baseline
  registry of required filers exists)? Worth five real cold asks before building past v1, same
  doctrine as [SWFL Data Gulf](https://github.com/ethanrickyjrjr-wq/chief-of-staff/blob/master/wiki/swfl-data-gulf.md)'s
  own "ask five real buyers" rule.
- Where does a baseline registry of all SWFL 3-story+ condominiums come from, to eventually unlock
  the "who hasn't filed" lead-gen angle? Not sourced yet.

## Related

- [MCP connector](mcp-connector.md)
- [Pipeline health](pipeline-health.md)
- [Chief of Staff: Florida public records](https://github.com/ethanrickyjrjr-wq/chief-of-staff/blob/master/wiki/florida-public-records.md)
