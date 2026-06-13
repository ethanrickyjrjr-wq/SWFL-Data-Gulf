# Ingest — structured / dlt + duckdb pipelines

**Health: mostly-ok.** The structured ingest layer is, on the whole, well-engineered: deterministic merge keys, volume guards (fema, leepa, collier), zero-row aborts (zori/redfin/zhvi duckdb), `raise_on_failed_jobs()` on the destructive-replace pipelines, an auto-advancing quarter/year probe for the BLS feeds, and a genuinely good freshness/volume/view-liveness probe. The serious problems are two latent traps that will bite on the *next* scheduled re-ingest rather than today: (1) the FDOT `year_` vs `yearx` column-name mismatch between the ingest output and every read-side surface, and (2) the LeePA tier-2 promotion writing under a randomized dlt schema_name that the freshness probe can never match. Plus one stale-data hole: Census CBP is frozen at vintage 2022 in code while 2023 is live at the API.

---

## [HIGH] FDOT ingest writes `year_`; brain connectors + analyst view both read `yearx` — next annual re-ingest silently zeroes traffic-swfl

**Location:** `ingest/pipelines/fdot/resources.py:18,48` (`_INT_COLS = ("objectid","year_","aadt")`, `"year_": _coerce_int(raw.get("YEAR_"))`) and `ingest/tests/pipelines/fdot/test_resources.py:98` (`assert out["year_"] == 2024`) vs `refinery/sources/fdot-source.mts:227,230-231,305` + `refinery/sources/fdot-freight-source.mts:381,383` (`.select("yearx,...")`, `.eq("yearx", ...)`) and `docs/sql/fdot_aadt_swfl_yearly.sql:31` (`yearx AS year_ FROM data_lake.fdot_aadt_fl`).

**Detail:** The ingest resource explicitly pins the AADT year column to `year_` via dlt column hints and yields a `year_` key (tests assert this). Every consumer — both brain source connectors and the analyst view — instead select/filter on `yearx`. Commit `1c3c21b` (2026-05-20, "dlt mangled YEAR→yearx") moved the *read* side to `yearx` because an earlier pipeline version yielded a raw `YEAR` key that dlt mangled to `yearx`. The current ingest code yields `year_`, which dlt does NOT mangle (it is already a legal identifier). FDOT uses `write_disposition="replace"` (drops + recreates `fdot_aadt_fl` from the resource schema on every run, annual cadence). So whichever name the live table currently has, the ingest code and the read code now disagree: a fresh FDOT re-ingest recreates the column as `year_`, and `.eq("yearx", LATEST_FDOT_YEAR)` then returns 0 rows — traffic-swfl goes null with no error (the connector treats empty as "no data"). The annual cadence means this can sit latent for months and detonate on the once-a-year run.

**Fix:** Pick ONE canonical name and make ingest + read + view + tests agree. Simplest: change the ingest to emit `yearx` (rename in `_INT_COLS`, the `_normalize` output key, and the two test assertions) so it matches the read side and the existing live table; OR if the live table is genuinely `year_`, fix the connectors/view instead. Confirm the live column with `SELECT column_name FROM information_schema.columns WHERE table_schema='data_lake' AND table_name='fdot_aadt_fl' AND column_name LIKE 'year%'` before choosing direction. Add a post-load assertion (or a connector-side smoke test) that the queried column actually exists so a future drift fails loud.

**Model:** opus — invariant-touching (deterministic-math read path), requires a live-DB check + a cross-cutting decision about which name is canonical across ingest/read/view/tests.

---

## [HIGH] LeePA tier-2 promotion uses a randomized dlt pipeline_name → `_dlt_loads.schema_name` never matches the cadence probe; freshness is read off a frozen pre-2026-05-19 load

**Location:** `ingest/pipelines/leepa/resources.py:107-120` (`pipeline_name=f"leepa_t2_{_secrets.token_hex(4)}"`, one fresh randomly-named pipeline per 5k chunk) vs `ingest/cadence_registry.yaml:235` (`dlt_schema_name: leepa_parcels_tier2`) and `ingest/scripts/check_freshness.py:252-257` (`SELECT MAX(inserted_at) FROM data_lake._dlt_loads WHERE schema_name = %s`).

**Detail:** On 2026-05-19 (`e1722a5`) the LeePA loader switched its tier-2 pipeline name from the stable `leepa_parcels_tier2` to `leepa_t2_<random hex>`, generating a *new random name every chunk every run*. dlt derives the default `_dlt_loads.schema_name` from the pipeline name, so each LeePA run now writes loads under schema_names like `leepa_t2_a1b2c3d4` that will never equal the registry's `leepa_parcels_tier2`. The probe's `MAX(inserted_at) WHERE schema_name='leepa_parcels_tier2'` therefore matches only the last load written *before* the rename — i.e. a frozen 2026-05-18-era timestamp. The registry "Verified: MAX(inserted_at)=2026-05-18 ✓" note is exactly that stale match. The collier_parcels loader (`resources.py:84-100`) documents this same failure mode in a code comment and deliberately uses ONE stable pipeline name reused across chunks to avoid it — LeePA never got that fix. Net effect: the LeePA freshness probe is blind; a LeePA cron that silently stops loading would report FRESH (or eventually STALE against the frozen old timestamp, not against reality) and the volume guard is the only real signal left.

**Fix:** Mirror the collier_parcels pattern: construct ONE `dlt.pipeline(pipeline_name="leepa_parcels_tier2", ...)` outside the chunk loop and call `.run(...)` per chunk (each `.run()` is still its own connection, preserving the pooler-timeout protection). Then verify `SELECT DISTINCT schema_name FROM data_lake._dlt_loads WHERE schema_name LIKE 'leepa%'` shows `leepa_parcels_tier2` after a run.

**Model:** sonnet — the fix is mechanical and already has a working reference implementation (collier_parcels) to copy; low ambiguity.

---

## [HIGH] Census CBP frozen at vintage 2022 in code; 2023 is live at the API — establishment/employment data is structurally stale and cannot advance

**Location:** `ingest/pipelines/census_cbp/resources.py:8` (`CBP_YEARS = [2017, 2018, 2019, 2020, 2021, 2022]`). Annual cron at `.github/workflows/census-cbp-annual.yml`.

**Detail:** The CBP year list is a hardcoded literal ending at 2022. Verified live: `https://api.census.gov/data/2023/cbp` returns the valid "2023 County Business Patterns" dataset, so the most recent vintage is at least one year newer than what the pipeline pulls (2024 CBP typically lands ~late 2026). The annual cron re-pulls the same six frozen years every run — a no-op refresh that never gains new data. Every CBP-derived brain metric (establishment counts, employment, payroll) is anchored to 2022. Contrast with bls_laus (`pipeline.py:8-21` rolling window) and census_vip (`constants.py` rolling `time_to()`), which auto-advance — CBP is the outlier that requires a code edit to move forward, and nothing alerts when a new vintage appears.

**Fix:** Compute the year window dynamically (e.g. probe `api.census.gov/data/{y}/cbp` descending from `current_year-1` to find the latest published vintage, then ingest a trailing N-year window), or at minimum bump the list to include 2023 now and add a check that opens a ledger item when a newer vintage is detected. Verify NAICS variable name per vintage — `NAICS2017` is correct through 2022; confirm 2023 still uses `NAICS2017` (CBP has not yet moved to NAICS2022 for these years) before widening.

**Model:** opus — needs a vendor-cadence verification + a small design decision (dynamic vintage discovery vs. trailing-window), and touches the data-provenance invariant.

---

## [MEDIUM] Census CBP can wipe its 255k-row table on a fully-failed pull: `replace` disposition + per-year `continue`-on-error + no `raise_on_failed_jobs()` + no in-pipeline volume guard

**Location:** `ingest/pipelines/census_cbp/resources.py:11` (`write_disposition="replace"`), `:38,44` (`continue` on HTTP/JSON error per year), and `ingest/pipelines/census_cbp/pipeline.py:15-16` (`load_info = pipeline.run(...); print(load_info)` — no `raise_on_failed_jobs()`).

**Detail:** If the Census API fails for *all* years (API-key expiry, host outage, a NAICS variable rename causing every request to 4xx), the resource yields zero rows and dlt's `replace` truncates `data_lake.census_cbp_fl` to empty — then the pipeline prints `load_info` and exits 0. Unlike fema (`resources.py:115-131` shape/volume guard pre-replace) and fdot/leepa (`raise_on_failed_jobs()`), census_cbp has neither a pre-replace volume floor nor a failed-jobs check. The cadence registry's `expected_rows_min: 230006` is observability-only (probe runs next day, non-gating) — it reports the wipe after the fact, it does not prevent it.

**Fix:** Add `load_info.raise_on_failed_jobs()` in `pipeline.py`, and guard the resource: collect rows into a list, assert a minimum (e.g. `assert_min_rows(len(rows), 230_000)` from `ingest/lib/guards.py`) BEFORE the replace, and abort if any year failed rather than silently `continue`-ing all of them.

**Model:** sonnet — well-specified mechanical hardening with existing helpers (`assert_min_rows`, `raise_on_failed_jobs`) to mirror from sibling pipelines.

---

## [MEDIUM] FEMA NFIP absolute floor is a hardcoded 403,542 — drifts below truth and can mask a partial wipe

**Location:** `ingest/pipelines/fema/resources.py:215` (`assert_min_rows(len(rows), 403_542, ...)`).

**Detail:** The dynamic `_current_tier2_count()` + 0.95-floor guard (`:216-218`) is excellent and self-tracking. But the absolute backstop is a hardcoded 403,542. FL NFIP claims only grow, so over time this constant sits far below the true count: a pull that returns, say, 60% of rows (450k of 750k) would clear the hardcoded floor while failing nothing if the DB-count guard were ever unavailable (the `_current_tier2_count()` returns None on any DB error and the 0.95 guard then no-ops). The two guards together are strong; the hardcoded one alone is weak and will only get weaker.

**Fix:** Either derive the absolute floor from a slow-moving fraction of the live count, or accept it as a coarse floor but add a comment that the real protection is the 0.95 dynamic guard and that the DB-count path must not silently no-op (consider failing loud if `_current_tier2_count()` returns None on a run that has prior data). Low urgency.

**Model:** sonnet — small localized hardening.

---

## [LOW] `collier_parcels.phy_zipcd` is orphaned site-ZIP substrate (G3 brain-first not yet satisfied)

**Location:** `ingest/pipelines/collier_parcels/resources.py:35,60` (`phy_zipcd` column, kept "for future parcel-velocity and per-ZIP drill work").

**Detail:** `phy_zipcd` is the FDOR physical/site ZIP (G1-correct — site, not mailing/owner), but the registry note and code comment say it is not yet consumed by a brain at ZIP grain. This is parked raw passthrough (acceptable under G2 derive-now-or-park since it is a raw column, not a derived `zip_code`), but it is currently orphaned tier-2 ZIP substrate. Worth tracking so it doesn't drift into being silently consumed without the brain-first PR, and so the column name (`phy_zipcd`, not `zip_code`) doesn't get confused with a derived site-ZIP elsewhere. Note: LeePA's tier-2 `leepa_parcels` correctly carries NO zip column at all (the value/sale/use layers are tabular-only with no site address/geo — G2 "park it" is honored), which is the right call.

**Fix:** No code change required now. Open/confirm a ledger item that `collier_parcels.phy_zipcd` graduates to a consuming brain or stays documented-parked; do not begin reading it at ZIP grain without the brain-first gate.

**Model:** sonnet — tracking/doc action, no architectural judgment.

---

## [LOW] storm_history_swfl has no zero-row guard after the county filter — an empty filtered set writes an empty Parquet + a false-FRESH inventory row

**Location:** `ingest/duckdb_pipelines/storm_history_swfl/pipeline.py:109-127` (COPY of the filtered SELECT, then unconditional `upsert_inventory_row`).

**Detail:** The pipeline raises if NO NOAA source files are found, but after the `WHERE state='FLORIDA' AND cz_name IN (...)` filter it COPYs straight to Parquet and upserts a fresh inventory row with no count check. If a NOAA `cz_name` value drifts (county-zone naming change) the filter could match zero rows, producing an empty Parquet and a new `updated_at` in `_tier1_inventory` — the freshness probe then reads FRESH against an empty file. zori/redfin/zhvi duckdb pipelines all have an explicit `row_count == 0 → sys.exit(1)` guard; storm_history does not. Low severity because storm data is historical and stable, but the silent-empty class is the same one that already bit city_pulse.

**Fix:** Add a `SELECT COUNT(*)` on the filtered set (or COPY into a temp table first) and `sys.exit(1)` / raise if zero, mirroring the zori/redfin guard, before the COPY + inventory upsert.

**Model:** sonnet — mechanical, copy the existing zero-row guard pattern.

---

## [LOW] Glades + Hendry counties have no MSA-keyed market coverage (ZORI / ZHVI / Redfin) — documented scope hole

**Location:** `ingest/lib/swfl_metros.py:13-24` (4 MSA substrings: Cape Coral, Naples, Punta Gorda, North Port).

**Detail:** The shared SWFL metro filter covers 4 of the 6 in-scope counties (Lee, Collier, Charlotte, Sarasota). Glades (12043) and Hendry (12051) are intentionally omitted because they belong to no OMB/BEA MSA, so substring matching would silently return zero rows for them. This is honestly documented in the module docstring (good — "document the gap rather than paper over it") and is not a violation of the 6-county scope invariant. Flagging it only as a known missing-data hole: any ZIP-level rent/home-value answer for a Glades/Hendry ZIP has no Zillow/Redfin substrate and the product must say "we don't hold it," not interpolate.

**Fix:** No ingest change. Ensure the consuming brains/connectors treat Glades/Hendry market queries as "not held" (offer the county read), and consider a non-MSA source (e.g. ZIP-level FHFA or DOR sales) if those two counties ever become product-relevant.

**Model:** sonnet — documentation/awareness; no code.

---

## [NIT] Several `replace`-disposition pipelines (faf5, fhfa, fdot) are safe only because the source rarely returns empty — keep the guard discipline consistent

**Location:** `ingest/pipelines/faf5/resources.py:50` (`faf_flows` replace, no volume guard), `ingest/pipelines/fhfa/resources.py:82` (replace, has surrogate `id` + `raise_on_failed_jobs` elsewhere), `ingest/pipelines/fdot/resources.py:79` (replace + `raise_on_failed_jobs`).

**Detail:** fdot and fema correctly pair `replace` with `raise_on_failed_jobs()` (and fema adds a pre-replace shape guard). faf5's `faf_flows` replace has no volume floor; it is annual Tier-1-cold ("a cache") so the blast radius is small, but the pattern is inconsistent across the codebase. The standard worth enforcing: any `write_disposition="replace"` on a consumer-facing table gets (a) a pre-replace minimum-row assertion and (b) `raise_on_failed_jobs()`.

**Fix:** As a cleanup pass, add a `assert_min_rows`-style floor to any remaining `replace` resource that feeds a brain. Lowest priority — faf5 is cold cache, not a hot consumer table.

**Model:** sonnet — small consistent cleanup, no judgment.
