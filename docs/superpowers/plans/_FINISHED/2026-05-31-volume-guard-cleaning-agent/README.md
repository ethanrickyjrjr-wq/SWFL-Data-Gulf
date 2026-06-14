# Volume Guard / Cleaning Agent — Implementation Plan

**Status:** READY TO IMPLEMENT  
**Check:** `flywheel_volume_guard` (due 2026-06-04 UTC)  
**Resolves:** `docs/sql/20260530_checks.sql:35`  
**Precedes:** flywheel writeback work (Goal 9)

---

## Why this matters for the flywheel

The flywheel scores batches — "starting conditions on date X + event → outcome on date Y." Its whole
value is a scored history, and that history is only trustworthy if every data_lake.\* snapshot it
reads was (a) complete (≥ floor rows) and (b) cleanly typed (no silent None/$0 from bad coercion).
A single stealth-truncated or stealth-corrupted ingest poisons scored history permanently.

This plan is the prerequisite that lets flywheel trust its substrate. The flywheel reads the same
Tier-2 tables these guards protect. No flywheel-specific code here — just the interface contract.

**Flywheel seam to carry forward (not designed here):** When flywheel scoring is built, it should
join on `_dlt_load_id` rows that correspond to a guard-passing run. `_dlt_loads` in Postgres is the
lineage hook — don't discard it. A guard-passing run should eventually stamp a load as
`volume_guard_passed = true` so the flywheel can filter on clean loads only.

---

## Design decision

"Cleaning agent" = a deterministic shared Python module, not an LLM. Matches the repo's
non-negotiable: "Deterministic math, narrative prose; LLMs produce qualitative synthesis only."

---

## Three components

```
ingest/lib/coercion.py          ← NEW  shared cleaning (dedup duplicated _coerce_* functions)
ingest/lib/guards.py            ← NEW  volume assertions + VolumeGuardError, raise pre-promote
ingest/cadence_registry.yaml    ← EXTEND  add optional expected_rows_min / expected_rows_max
ingest/scripts/check_freshness.py ← EXTEND  add LOW_VOLUME status alongside FRESH/STALE/MISSING
```

---

## Component 1 — ingest/lib/coercion.py

Pure functions, no side effects, fully unit-testable. Single home for coercion logic now duplicated
across ingest pipelines (confirmed in: leepa/resources.py, bls_oews_swfl/resources.py,
collier_permits/normalizer.py — audit remaining pipelines before writing the standards doc count).

```python
def coerce_float(v) -> float | None:
    # strips $, comma, whitespace; None for "", N/A, NA, null
    # Lifted from leepa/resources.py:49-55

def coerce_int(v) -> int | None:
    # same, integer

def coerce_date(v) -> str | None:
    # epoch-ms → ISO; T-split; ESRI "2024-4" → "2024-04-01"; returns YYYY-MM-DD
    # Lifted from leepa/resources.py:58-71

SUPPRESSION_TOKENS = {"*", "#", "**", "***", "-", "N/A", "NA"}

def coerce_suppressed(v, tokens=SUPPRESSION_TOKENS) -> None:
    # BLS uses * and # for suppressed values — return None, NEVER zero
    # Generalized from bls_oews_swfl/resources.py
```

**Roll-out:** incremental, non-breaking. Replace each pipeline's local `_coerce_*` with an import
in its own PR. Behavior pinned by tests copied from current outputs first. city-pulse + 2-3
highest-risk pipelines first; remaining pipelines are follow-up.

---

## Component 2 — ingest/lib/guards.py

```python
class VolumeGuardError(RuntimeError):
    """Raised pre-promote when a volume assertion fails. Named for unambiguous GHA log parsing."""
    pass

def assert_vs_canonical(landed: int, canonical: int, floor: float = 0.9, label: str = "") -> None:
    """ArcGIS / API total-count endpoint. Caller fetches canonical and passes the int."""
    if canonical > 0 and landed < int(canonical * floor):
        raise VolumeGuardError(...)

def assert_min_rows(landed: int, minimum: int, label: str = "") -> None:
    """Flat-file / scrape sources with no canonical endpoint. minimum from cadence_registry."""
    if landed < minimum:
        raise VolumeGuardError(...)

def assert_vs_baseline(landed: int, prior: int | None, drop_band: float = 0.5,
                       spike_band: float = 5.0, label: str = "") -> None:
    """Flag collapse or explosion vs prior load. prior from live table count or _tier1_inventory.

    BOOTSTRAP BEHAVIOR: if prior is None or 0, skip assertion and log BASELINE_UNAVAILABLE.
    Only asserts once a non-zero prior exists. New pipeline onboarding will not false-alarm.
    """
    if not prior:
        log.warning(f"[volume-guard] BASELINE_UNAVAILABLE for {label} — skipping baseline check")
        return
    ...
```

**Refactor LeePA first** (regression anchor): replace the inline guard at
`ingest/pipelines/leepa/resources.py:175-181` with `assert_vs_canonical(len(pulled["just_value"]),
arcgis_count(LEEPA_JUST_VALUE_URL), label="leepa just_value")`. LeePA's tests are the implicit
contract for the generalized version.

---

## Component 3 — Volume baselines + probe

### cadence_registry.yaml extension

Add two optional fields per pipeline entry (backward-compatible — entries without them skip the
volume check):

```yaml
expected_rows_min: 493000 # 90% of confirmed 548,798 leepa_parcels rows
expected_rows_max: null # optional spike ceiling; omit if growth is expected
```

### Seeding table — CONFIRMED LIVE COUNTS (pulled 2026-05-31, db.jtkdowmrjaxfvwmemxso)

Use these exact numbers. Do NOT use estimates. Floor = 90% of confirmed count unless noted.

| table                                    | confirmed rows | expected_rows_min | notes                                   |
| ---------------------------------------- | -------------- | ----------------- | --------------------------------------- |
| data_lake.leepa_parcels                  | 548,798        | 493,918           | 90%                                     |
| data_lake.fema_nfip_claims               | 448,381        | 403,542           | 90%                                     |
| data_lake.census_cbp_fl                  | 255,563        | 230,006           | 90%                                     |
| data_lake.fhfa_hpi                       | 133,226        | 119,903           | 90%                                     |
| data_lake.fdot_aadt_fl                   | 103,662        | 93,295            | 90%                                     |
| public.fl_dor_sales_tax                  | 40,140         | 36,126            | 90%                                     |
| data_lake.dbhydro_stations               | 12,937         | 11,643            | 90%                                     |
| data_lake.zori_swfl                      | 5,185          | 4,666             | 90%                                     |
| data_lake.collier_building_permits       | 4,975          | 4,477             | 90%                                     |
| data_lake.usgs_sites                     | 900            | 810               | 90%                                     |
| public.fl_dor_tdt_collections            | 666            | 599               | 90%                                     |
| data_lake.usgs_daily                     | 605            | 544               | 90%                                     |
| public.rsw_airport_monthly               | 516            | 464               | 90%                                     |
| data_lake.bls_laus                       | 328            | 295               | 90%                                     |
| data_lake.bls_oews_swfl                  | 220            | 198               | 90%                                     |
| data_lake.bls_qcew                       | 32             | 28                | 90%                                     |
| public.swfl_inc_announcements            | 32             | 28                | 90%                                     |
| data_lake.fdot_freight_nowcast_shock_log | 14             | 1                 | nascent — floor at 1                    |
| data_lake.lee_building_permits           | 11             | 1                 | nascent v1 first-page-only — floor at 1 |
| public.fgcu_reri_indicators              | 10             | 1                 | nascent — floor at 1                    |

**Do NOT seed a floor for these (instant hard block or wrong signal):**

- `data_lake.city_pulse` — 0 rows, pipeline not yet populating. Probe-only at launch; seed after first week of production data establishes baseline. See city_pulse section below.
- `data_lake.marketbeat_swfl` — 0 rows, dead source.
- `public.fdle_crime_swfl` — 0 rows, dormant (source-blocked, issue #59).
- `public.outcomes` — 0 rows, grading loop not built yet.
- `public.predictions` — 29 rows and growing with each rebuild; floor low (5) or skip.

**Tier-1 Parquet (not SQL tables — out of scope for SQL COUNT guard):**

- `redfin_swfl` — 66,672 rows / 125 ZIPs in `lake-tier1/market/redfin_swfl.parquet`. If Tier-1 volume guard is added later, floor = 60,000. Not a data_lake Postgres table; skip for this PR.

**Excluded (dlt internals):**

- `_dlt_loads` (415), `_dlt_pipeline_state` (348), `_dlt_version` (352), `_tier1_inventory` (75)

### check_freshness.py extension

Add volume check parallel to the age check:

- Query `SELECT count(*) FROM data_lake.<table>` vs `expected_rows_min`
- For Tier-1 pipelines: use `_tier1_inventory.row_count` vs the min
- Emit `LOW_VOLUME` (icon ⚠️) in the same `$GITHUB_STEP_SUMMARY` table, next to FRESH/STALE/MISSING
- Always exit 0 — probe surfaces, guard gates
- LOW_VOLUME flows into the existing ops banner / cron-incident ledger with no new wiring

---

## city_pulse — special handling

city_pulse is not a conventional ETL pipeline. It calls Claude `web_search_20250305` or Firecrawl
for 7 cities, distills with an LLM, then writes to Tier-2.

**Guard placement:** `assert_min_rows` belongs after `distill_capture()` but BEFORE the Tier-2
write in `ingest/pipelines/city_pulse/pipeline.py`. Not before distillation (raw capture count is
meaningless).

**Floor strategy:** Table is currently at 0 rows — pipeline not yet populating. Do NOT set a
positive floor at launch. Instead:

1. Add `city_pulse` to cadence_registry with no `expected_rows_min` (probe-only)
2. After first week of production runs, check p5 row count per daily run
3. Set `expected_rows_min` to p5 value (probably 3-7; 7 cities × variable news yield)
4. Then wire `assert_min_rows` as the hard guard

The pack's existing empty-snapshot guard stays as last-resort floor — it should rarely fire once the
ingest is guarded.

---

## Tier-1 scope note

Volume guards in this plan target Tier-2 (dlt Postgres) promotion paths. Tier-1 DuckDB/Parquet
pipelines are covered by LOW_VOLUME probe only until a Tier-1 guard pattern is explicitly designed.
New pipeline authors: if your pipeline writes to Tier-1 only, add `expected_rows_min` to
cadence_registry for probe coverage; hard guard is not yet defined for that lane.

---

## Files to modify

| File                                                | Change                                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ingest/lib/coercion.py`                            | NEW. Shared coerce_float/int/date + suppression handling.                                                                                           |
| `ingest/lib/guards.py`                              | NEW. `VolumeGuardError` + assert_vs_canonical / assert_min_rows / assert_vs_baseline (bootstrap-safe).                                              |
| `ingest/lib/tests/` (or pipeline-local `test_*.py`) | NEW. Unit tests for coercion edge cases (`"$245,000.00"`, `"2024-4"`, `"*"`, `None`) and each guard at its boundary.                                |
| `ingest/pipelines/leepa/resources.py`               | Refactor inline guard → `assert_vs_canonical`; `_coerce_float` / `_coerce_esri_date` → import from coercion. Regression anchor.                     |
| `ingest/pipelines/city_pulse/pipeline.py`           | After `distill_capture()`, before Tier-2 write: add `assert_min_rows` (wired ONLY after week-1 baseline confirmed). At launch: registry entry only. |
| `ingest/cadence_registry.yaml`                      | Add `expected_rows_min` / `expected_rows_max` fields; document in header; seed all rows from the table above.                                       |
| `ingest/scripts/check_freshness.py`                 | Add LOW_VOLUME status: count vs `expected_rows_min`, render in summary, still exit 0.                                                               |
| `docs/standards/pipeline-freshness.md`              | Add: every new pipeline ships an `expected_rows_min` + wires a guard, same way it ships a cron + `--dry-run`. Note Tier-1 scope exception.          |
| `docs/sql/<date>_checks_resolve.sql`                | After ship + attest: `UPDATE public.checks SET state='done' WHERE check_key='flywheel_volume_guard'` (idempotent, run via psycopg3 per RULE 1).     |

---

## Verification

1. **Unit:** `pytest ingest/lib/` — coercion edge cases and guard raise/pass at boundary.
2. **Guard fires:** run LeePA pipeline with forced low canonical (stubbed paginator) → confirm `VolumeGuardError` before any Tier-2 write; confirm healthy run still promotes.
3. **Bootstrap safe:** run a pipeline with no prior load → confirm `BASELINE_UNAVAILABLE` warning, no raise.
4. **Probe surfaces low volume:** seed a tiny `expected_rows_min` against a known-large table, run `python -m ingest.scripts.check_freshness --dry-run` → large table = FRESH, tiny-seeded = LOW_VOLUME, exit 0.
5. **city_pulse:** registry entry appears in probe output; hard guard deferred until week-1 baseline.
6. **No pack regressions:** `bun refinery/cli.mts city-pulse-swfl` → EXIT 0 (this plan touches ingest, not packs).
7. **Resolve the check:** run UPDATE against `public.checks`; confirm `flywheel_volume_guard` shows done at `/ops/checks`.

---

## Corrections from plan-audit (applied here)

1. `leepa_parcels` is 548,798 (not ~528K) — floors set from live count.
2. `redfin_swfl` is Tier-1 Parquet, not a Postgres table — excluded from SQL guards; note in Tier-1 section.
3. BLS surface is three separate tables: `bls_laus` (328), `bls_oews_swfl` (220), `bls_qcew` (32) — each seeded individually.
4. `assert_vs_baseline` bootstrap behavior specified (prior == None/0 → BASELINE_UNAVAILABLE warning, not raise).
5. `VolumeGuardError(RuntimeError)` named exception added.
6. city_pulse guard deferred until week-1 baseline; placement after `distill_capture()` made explicit.
7. Tier-1 out-of-scope clause added to standards doc change.
