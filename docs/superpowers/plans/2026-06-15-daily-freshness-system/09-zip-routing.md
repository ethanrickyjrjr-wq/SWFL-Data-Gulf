# 09 — ZIP Routing (~11 datasets) (Wave 2)

> Build file for the Daily Freshness System. **Read `README.md` §0 (the FEMA correction is load-bearing here) + CLAUDE.md ZIP COLUMNS 3 GATES (G1/G2/G3) + `08-zip-machine-core.md`.** Route the priority non-ZIP datasets through `zip_stamp.py` so they light up the ZIP map — but only where the ZIP is a true **site** location (G1), and only with a consuming brain in the same PR (G3).

**Model:** Sonnet ×N (one dataset per worktree/PR) · **Repo:** brain-platform · **Wave:** 2 · **Depends:** 08.

**Goal:** Stamp site-ZIP on the genuinely site-located datasets and surface them at ZIP grain through a consuming brain.

---

## ⚠️ The FEMA correction — this overturns the original plan's "NFIP G1 violation"

The original plan called NFIP a **"BLOCKER — G1 ZIP violation (reported_zipcode = mailing ZIP)"** and dropped "NFIP-first." **The OpenFEMA data dictionary (verified in-session) refutes this:**

> **`reportedZipCode` = "5-digit Postal Zip Code of the insured property as reported by WYO partners."**

So `reported_zipcode` is the **insured-property (site) ZIP — NOT a mailing ZIP.** Two consequences:

1. **NFIP is NOT a G1 violation** and not the thing to "exclude." But it is also **not an unbuilt quick-win** — **`env-swfl` already surfaces per-ZIP NFIP flood metrics** (`swfl_zip_<zip>_flood_aal_*` templated `key_metrics`). So NFIP-at-ZIP is **largely done**; the only remaining work (optional) is exposing those per-ZIP rows as a `detail_table` (housing-swfl pattern) for the customer-facing drill — not a routing job.
2. **Caveats to preserve on any NFIP ZIP surface** (provenance honesty): it's **WYO-self-reported**; `latitude`/`longitude` are **privacy-coarsened to 1 decimal (~11 km)** so they **cannot independently verify** the ZIP via point-in-polygon; `countyCode` "may not reflect the individual county the property is located." Label it accordingly; never imply we geocoded it ourselves.

**Net:** start with the truly site-located, not-yet-surfaced datasets below. NFIP is a verify-coverage/expose-detail task, not a route-the-mailing-ZIP task.

---

## Routing order (G1-clean first; each is its own small PR)

| # | Dataset | Site source | `zip_stamp` mode | Consuming brain (G3, same PR) | Gate notes |
|---|---|---|---|---|---|
| 1 | **Collier permits** (`data_lake.collier_building_permits`) | site address present | `geocode` | permits-commercial-swfl / a collier-permits brain | G2 derivable now |
| 2 | **NOAA GHCN** (`data_lake.noaa_ghcn_rainfall`) | 4 fixed stations (FMY/RSW/Naples Muni/Naples COOP) | `pip` (or a 4-row known map) | env-swfl (rainfall) | trivial, 4 ZIPs |
| 3 | **USGS gauges** (`data_lake.usgs_daily`) | station coords present | `pip` | env-swfl (hydrology) | G2 derivable now |
| 4 | **DBPR SIRS condos** (`data_lake.dbpr_sirs_submissions`) | building identifiers | `geocode` | a condo/structural brain | G2 derivable now |
| 5 | **CRE submarket family** (marketbeat_swfl / colliers_industrial / mhs_databook / lee_associates) | submarket name | `crosswalk` | cre-swfl | tag `approx` where crosswalk confidence≠official |
| 6 | **FDOT traffic** (`data_lake.fdot_aadt_fl`) | station lat/lon | `pip` | traffic-swfl | G2 derivable now |
| 7 | **Collier parcels** (`data_lake.collier_parcels`) | site address | `geocode` | properties-collier-value | G2 derivable now |
| — | **FEMA NFIP** | (site ZIP already present) | — | env-swfl (already surfaces it) | **verify coverage / optional detail_table; NOT a routing task** |
| — | **LeePA parcels** (`data_lake.leepa_parcels`) | NO address/geo on the row | — | — | **PARK (G2)** — `parcels_lee_zip_source_layer` deferred (needs MapServer probe → FOLIOID join → centroid PIP) |

Datasets with **no** site address/geo on the row (county/MSA/corridor/national grain — BLS, FRED, Census CBP, RSW airport, FDLE, etc.) get **no** `zip_code` — that would be invented precision (G1). Leave them at their held grain.

---

## Per-dataset template (repeat for #1–#7)

- [ ] **Step A: Isolate.** `node scripts/worktree.mjs new zip-<dataset>` (RULE 1.5 — Sonnet works in `../bp-zip-<dataset>`).
- [ ] **Step B: Probe-first (BIBLE §0.1).** Confirm the site column(s) are populated and stable (e.g. `SELECT count(*) FILTER (WHERE site_address IS NOT NULL) FROM <table>`). If the load-bearing site column returns mostly NULL → **PARK** (G2: backfill-only rots), don't half-route.
- [ ] **Step C: Stamp.** Add a post-ingest step in the dataset's pipeline calling `zip_stamp.stamp_zip(rows, mode=…, …)`; backfill the existing rows with a one-off (`UPDATE … SET zip_code = …` from the stamper) **and** wire it into the pipeline so future loads stamp automatically (backfill-only rots — G2).
- [ ] **Step D: Verify non-null rate + scope.** `SELECT count(*) FILTER (WHERE zip_code IS NOT NULL), count(DISTINCT zip_code) FROM <table>`; every stamped ZIP must be `in_scope` (the stamper guarantees it). Record the geocode hit-rate (e.g. "184/281 geocoded" like mhs_permits) — a low rate is data, not failure; surface it.
- [ ] **Step E: Consuming brain (G3).** In the SAME PR, surface the per-ZIP rows in the consuming brain as a `detail_table` (grain `"zip"`, **housing-swfl.mts pattern**) and/or per-ZIP `key_metrics`; register any new slugs in `brain-vocabulary.json` (concept + slug_index) / `patterns.mts`. A new `zip_code` Tier-2 column without a consuming brain in the same PR = orphan substrate (G3 violation).
- [ ] **Step F: Gates + land.** `bun test refinery/packs/catalog.test.mts` + `bun refinery/tools/check-vocab-coverage.mts --all` (if a pack/vocab changed); the destructive-write guard (use the dataset's existing idempotent merge; if a backfill `UPDATE`, no replace → safe). `SESSION_LOG.md` entry; land via `node scripts/worktree.mjs land zip-<dataset>` → `git push origin HEAD:main`. Mark the dataset's board row green.

---

## NFIP-specific task (not routing — verify + optional expose)

- [ ] **Step N1:** Confirm `env-swfl` already emits per-ZIP NFIP (`grep swfl_zip_ refinery/packs/env-swfl.mts` → the `swfl_zip_<zip>_flood_aal_*` loop). It does.
- [ ] **Step N2 (optional):** If the customer drill wants a per-ZIP NFIP table, add a `detail_table` (grain `"zip"`) to env-swfl from the same `zipAggregates`, with a caveat: *"ZIP = insured-property location as self-reported by WYO insurers (OpenFEMA `reportedZipCode`); not independently geocoded — coordinates are privacy-coarsened."* No new ingest, no `zip_stamp`.

---

## Definition of Done

- Datasets #1–#7 (where the site column is actually populated) carry an in-scope `zip_code` (site location, G1), stamped at ingest time (not backfill-only), surfaced through a consuming brain (G3) with registered vocab.
- NFIP is documented as **already ZIP-surfaced** (env-swfl), with the WYO/privacy caveats — not re-routed as a mailing ZIP.
- LeePA parcels remain parked (`parcels_lee_zip_source_layer`); county/MSA/national datasets correctly get **no** ZIP.
- **Board rows:** each routed dataset flips green on `/data-inventory`; parked ones show their G2 reason, not a silent omission.
