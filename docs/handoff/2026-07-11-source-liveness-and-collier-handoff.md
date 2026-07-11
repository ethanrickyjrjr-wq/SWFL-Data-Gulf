# HANDOFF — Source liveness, the false-green, Collier fix, and the pipeline check playbook

**Written 07/11/2026 (Opus 4.8). Read this before touching parcels, freshness, or "why is X stale."**
This exists because the same three things get rediscovered every week. They are now written down.

---

## 0. TL;DR — the four things

1. **The freshness probe cannot catch a silently-locked source.** It reads "when did we last WRITE"
   vs a tolerance window. A dead upstream writes nothing, so the last good write reads FRESH until the
   window ages out. For `collier_parcels` that window is **547 days** (cadence 365 × tolerance 1.5).
   The FDOR source has been dead since ~06/09/2026 and would read green until **~Dec 2027**.
2. **The fix for that class is an UPSTREAM check.** Hit the source's real query, assert HTTP 200 +
   count ≥ floor. Built + runnable: `ingest/scripts/probe_source_liveness.py`. Run it weekly.
3. **Collier's parcel source is fixed by a one-line repoint** to the FDOR centroid twin (below).
4. **STOP re-ingesting Lee parcels.** LeePA is live with **548,330** Lee parcels. Pulling 556,100 Lee
   rows from the FDOR centroid is a duplicate. Lee's parcel lake = LeePA. Full stop.

---

## 1. The false-green, precisely (so nobody "fixes" the wrong layer)

`ingest/scripts/check_freshness.py` → `check_tier2_entry` → `_fetch_max_freshness` runs:

```sql
SELECT MAX(inserted_at) FROM data_lake._dlt_loads WHERE schema_name = 'collier_parcels' AND status = 0
```

That is the timestamp of the last **successful load**. Then `age_days > cadence_days * tolerance_multiplier`
→ STALE. `collier_parcels` registry (cadence_registry.yaml L704): `cadence_days: 365`,
`tolerance_multiplier: 1.5` → **threshold 547 days**.

When FDOR started 400-ing `CO_NO=21`, `ingest_collier_parcels()` fetched 0 rows and returned early
(resources.py: `if not rows: return 0`) — **no new `_dlt_loads` row**. So the probe keeps reading the
06/06 load, 35 days old, ≪ 547 → FRESH. Row-count (`expected_rows_min`) also passes: the table still
holds the 06/06 rows. Every existing signal is green while the source is dead.

**There is no threshold tweak that fixes this.** Lowering cadence just shortens the blind window; it never
sees the 400. Only hitting the upstream sees it.

## 2. The correct check — and it's already the pattern for VIEWS

`check_freshness.py` already has `check_view_liveness()` — it probes the DOWNSTREAM view via live
PostgREST (catches a missing GRANT that psycopg would miss). We need the mirror for the UPSTREAM:
a `source_liveness` probe. Two ways to land it:

- **Now (shipped, safe):** `ingest/scripts/probe_source_liveness.py` — standalone, read-only, hits each
  ArcGIS source's real query, asserts 200 + count ≥ floor, exits 1 on any BROKEN. Wire a weekly GHA cron.
  Critically it inspects the **body** for `{"error":{"code":400}}` — ArcGIS returns HTTP **200** with a
  400 error inside, so a status-code-only check is itself a false-green. This script does it right.
- **Proper (needs brainstorm + approval — C2 "extend, don't erect"):** add a `source_liveness:` block to
  the registry (mirroring `liveness_view:`) with `{url, where, floor}`, and a `check_source_liveness()`
  in `check_freshness.py` that runs in `run_probe` alongside the view probe. Same non-gating contract.
  This makes every ArcGIS/REST source self-checking in the daily probe. Do NOT push it blind — it touches
  the freshness system.

### Live ArcGIS status (probed 07/11/2026)

| Source | Endpoint (layer) | Real WHERE | Status 07/11 |
| --- | --- | --- | --- |
| collier_parcels (FDOR) | Florida_Statewide_Cadastral/FS/0 | `CO_NO=21` | **BROKEN** — 200-body-400 on any attribute WHERE |
| collier_parcels FIX | Florida_Statewide_Parcel_Centroid_Version/FS/0 | `CO_NO=21` | **LIVE 364,827** — the replacement |
| leepa (Lee) | gissvr.leepa.org ParcelInfo/MS/12 | `1=1` | **LIVE 548,330** |
| fdot (traffic) | gis.fdot.gov FTO/fto_PROD/MS/7 | `1=1` | **LIVE 103,662** |
| fema (NFHL flood) | hazards.fema.gov NFHL/MS/28 | state/bbox filter | **504 on `1=1`** — national service; MUST probe with the pipeline's real filter, not 1=1 (TODO: pin it) |

## 3. Collier fix — exact change (repoint + one new field)

The FDOR **centroid twin** is not locked, carries the SAME 100+ NAL fields, and returns the exact
364,827 Collier count. The pipeline's existing OBJECTID keyset paging works on it unchanged.

In `ingest/pipelines/collier_parcels/constants.py`:
- `COLLIER_CADASTRAL_URL` → `https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query`
- Add `SALE_PRC1` to `OUT_FIELDS` (the republished roll now carries sale price; the old 14-field layer
  did not) → and add `sale_prc1` to `_TIER2_COLUMNS` in resources.py.
- Everything else (CO_NO=21, keyset paging, guards, chunked merge) is unchanged.

**Query guard nuances on the centroid twin (verified live):**
- `CO_NO=21` (indexed) works instantly. `IS NOT NULL`, `OBJECTID=` work.
- Compound range + orderBy (`SALE_YR1>=2024 AND SALE_PRC1>50000 ORDER BY SALE_PRC1 DESC`) → 400. The
  pipeline does NOT need server-side range filtering — pull all 364,827, filter/median downstream in SQL.
- An UNORDERED row fetch on a deep county (Lee CO_NO=46) soft-times-out to `[]`; the count is instant.
  Always page by `... AND OBJECTID>last ORDER BY OBJECTID` — it seeks instead of scanning.
- The host throttles rapid sequential probing (curl `-m 25` sweeps → HTTP 000). Space calls.

**Publish cadence (from the service's own description):** county appraisers submit rolls to FDOR
**every July**; the layer republishes from "data most recently received." It is an **annual (July)**
refresh — a sold-median-OF-RECORD (rolling `SALE_YR1` history), not a this-week signal. Layer
lastEditDate 06/09/2026 = why Collier broke right after our 06/06 pull (URL republished under us).

**Homes-only filter (verified vs FDOR / Polk-PA reference, not memory):** homes = `DOR_UC` prefix
`01,02,04,05,06,08` (single-family, mobile, condo, coop, retirement, multi-family). Vacant-residential
LAND (the $35k-blend cause) = `00,09,99`. Commercial 10+. Condos (04) are parcel/folio grain only —
no per-unit folio (`collier_condo_unit_grain_gap`).

## 4. The Lee duplication — do not do it

`homes_only_sold_median` needs, per ZIP: sale price, sale date, use code (homes-only), situs ZIP.
- **Collier:** the FDOR centroid IS the source (LeePA is Lee-only). `PHY_ZIPCD` gives situs ZIP native.
- **Lee:** LeePA (548,330 parcels, live) is the source and is FRESHER than FDOR's annual roll. LeePA
  lacks a situs field → the Lee plan derives ZIP via centroid→ZCTA spatial join. The FDOR centroid's
  native `PHY_ZIPCD` is a tempting shortcut, but it is an ANNUAL snapshot and **duplicates 556K rows we
  already hold**. Decision: **Lee stays on LeePA.** Use FDOR `PHY_ZIPCD` only as a one-time crosswalk to
  validate the ZCTA derivation if useful — never as a second standing Lee ingest.

---

## 5. Pipeline check playbook — by source CLASS (this is "all the pipelines")

60+ pipelines live in `ingest/pipelines/`. You don't check them one-by-one with one method — you check
them by the class of source, because each class fails a different way and needs a different probe.

### Class A — ArcGIS / REST FeatureServer-MapServer  (SILENT-LOCK RISK — highest)
`collier_parcels`, `leepa`, `leepa_parcel_zip`, `fdot`, `fema`. **Fails silently** (200-body-400, schema
republish, layer renamed). Freshness probe is blind to all of it.
**CHECK:** `probe_source_liveness.py` — hit the real WHERE, assert 200 + body has no `error` + count ≥ floor.

### Class B — Downloadable annual/monthly files  (FDOR NAL, Census, FHFA, realtor.com, ZHVI/ZORI, redfin)
`census_acs`, `census_cbp`, `census_vip`, `fhfa`, `zhvi_swfl`, `zori_swfl`, `redfin_*`, `fred_*`, `bls_*`.
**Fails by:** URL path changes (new year in the path → 404), file schema drift.
**CHECK:** HEAD/GET the current-vintage URL (200 + non-trivial size); for API sources (Census/BLS/FRED)
call with the real params and assert a populated series. These are `replace`-disposition — a 404 leaves the
old file, so same false-green risk; verify the fetch, not the table.

### Class C — Web-scrape / crawl (crawl4ai)  (ROT RISK — sites move)
`news_swfl`, `city_pulse`, `dbpr_press_releases`, `dbpr_public_notices`, `estero_edc`, `swfl_inc`,
`marketbeat_pdf`, `lee_associates_swfl`, `mhs_permits_swfl`, `collier_permits`, `report_design_research`.
**Fails by:** page moved (leegov 404, collier.gov → SPA), selector drift, bot wall.
**CHECK:** `crawl4ai --probe <url>` (see `docs/standards/web-crawl-rules.md`) → confirm 200 + the expected
content markers are present. Known-rotted today: `news_county_sources_rotted`, `news_wink_rss_adopt`.

### Class D — Paid API (SteadyAPI, others)  (KEY/QUOTA + SILENT-EMPTY RISK)
`active_listings`, `listing_lifecycle`, `rentals`, `brevitas_listings`, `crexi_listings`, `market_*`.
**Fails by:** key rotation, 429 with no retry (`steadyapi_429_no_retry`), gap-sentinel making a dead key
look green. **CHECK:** confirm the key resolves + a probe call returns rows; watch `api_usage_log` spend.
NO paid `web_search` in any scheduled pipeline (locked). $1/run + $5/day ceilings via `RunBudget`.

### Class E — dlt-merge Tier-2 tables consumed by a brain
Everything landing in `data_lake.*`. **Fails by:** the upstream (A–D) dying while the table persists.
**CHECK:** the class-A–D upstream probe IS the check. The DB freshness/volume probe is a *secondary*
signal, never the primary — it is the thing that false-greened.

### The rule that ties it together
**Never trust "the table has rows" or "the load timestamp is recent" as proof the source is alive.**
Those measure the past. To prove a source is alive you must hit the source. Class A has a tool now
(`probe_source_liveness.py`); B/C/D need the analogous upstream probe — spec'd, not yet built.

---

## 6. Concrete to-do (open these as `checks`, don't leave as prose — RULE 2.4)

- [ ] `collier_parcels`: repoint to centroid twin + add `SALE_PRC1` (§3). Closes `collier_parcels_fdor_query_lockdown`.
- [ ] Build `homes_only_sold_median` for **Collier** off the centroid (situs ZIP native). `homes_only_sold_median_live_verify`.
- [ ] Wire `probe_source_liveness.py` as a weekly GHA cron (exit 1 → alert). New check.
- [ ] Pin FEMA's real WHERE filter in the probe (§2 table row 5) — 1=1 504s.
- [ ] Spec the registry `source_liveness:` block + `check_source_liveness()` in check_freshness.py (C2 extend). New check.
- [ ] Close `active_listing_median_land_blend` — already live in prod (33972 $359k/403, 33974 $325k/655).
- [ ] **Kill any in-flight Lee-from-FDOR ingest** (§4). Lee = LeePA. Do not add a second Lee parcel source.
