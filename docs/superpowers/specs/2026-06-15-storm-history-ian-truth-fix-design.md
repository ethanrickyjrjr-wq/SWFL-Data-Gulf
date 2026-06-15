# storm-history-swfl — Hurricane Ian truth fix (DAT-6 / A1 + DAT-5 / A2)

**Date:** 2026-06-15
**Scope:** A1 (DAT-6) + A2 (DAT-5) only, from `docs/superpowers/plans/2026-06-15-root-R3-data-truth.md`.
**Brain:** `storm-history-swfl` (NOAA Storm Events catalog). `hurricane-tracks-fl` (HURDAT2×NFIP) is correct and **out of scope**.

---

## 1. Problem — root cause, verified against the authoritative NOAA source

A Fort-Myers-area read claims *"76 property-damage events… ZERO reached hurricane-force wind (≥74 kt)"* and *"most recent billion-dollar storm = 2004-08-13 (Charley)."* Hurricane Ian (2022, Cat 4, costliest in FL history) is absent. The live `storm-history-swfl.md` v14 reproduces this exactly (`storm_extreme_wind_events_10yr=0`; `storm_last_billion_dollar_event_type="Hurricane (Typhoon)" on 2004-08-13`).

I queried NOAA's raw `StormEvents_details d2022` file directly (DuckDB httpfs, no creds). **Ian is present for all three counties**, but every Ian row is invisible to our pipeline for three compounding reasons:

| NOAA reality (verified) | Pipeline assumption | Result |
|---|---|---|
| Hurricanes/surge logged at **NWS zone** level: `CZ_TYPE='Z'`, `CZ_NAME` = "COASTAL LEE", "INLAND LEE", "COASTAL COLLIER COUNTY", "COASTAL CHARLOTTE"… | ingest `WHERE cz_name IN ('LEE','COLLIER','CHARLOTTE')` matches **county names only** | **all Ian zone rows dropped at ingest** |
| `EVENT_TYPE='Hurricane (Typhoon)'`; `DAMAGE_PROPERTY` = **"7.00B" (Coastal Lee), "3.00B", "2.20B"**; 60 direct deaths in Lee | `MAJOR_EVENT_TYPES` has `"Hurricane"` (never matches) | misclassified even if present |
| Hurricane rows carry **`MAGNITUDE=NULL`**; intensity is the event type, not a wind column | `extreme_wind_event_count` counts `MAGNITUDE>=74` | **"ZERO hurricane-force"** for a Cat-4 |
| 2004 Charley had a **county-type** row back then → survives the filter | — | "last billion-dollar" stuck at 2004 |

**A2** is the same render line: `storm-history-swfl` summarizes the billion-dollar event by the generic NOAA `EVENT_TYPE` (`"Hurricane (Typhoon)"`), never the storm's proper name — so it reads "Hurricane on `<date>`", which looks like a blank name. The proper name lives in the **narrative fields** (`EPISODE_NARRATIVE`/`EVENT_NARRATIVE`), which I verified reliably contain "Hurricane Ian" / "Tropical Storm Ian" for every Ian row.

The brief's hypothesis #1 (vintage stops <2022) is **wrong** — the corpus already covers 1996–2025; the failure is the ingest filter, not the vintage.

---

## 2. Decisions (operator-locked)

1. **Rename the misleading wind slug** to what it actually measures; retire the old slug cleanly; update vocab + every downstream ref in the **same commit** (slug names are contracts — leave nothing dangling).
2. **Hazard zone types only** — include `Hurricane (Typhoon)`, `Tropical Storm`, `Tropical Depression`, `Storm Surge/Tide`, `High Wind`, `Strong Wind`, `Coastal Flood`. Exclude `Drought` / `Frost/Freeze` (climatology, not storms) so `total_storm_count` stays a meaningful "storm" number.
3. **Dispatch the live re-ingest** (`gh workflow run storm-history-monthly.yml`) right after the fix merges to `main`; flows into the next refinery rebuild.

### 2a. Flag 1 — the `>= 3` threshold is NOT silently inherited

The slug's **unit changes**: from "count of `MAGNITUDE>=74` event-rows in 10yr" (≈0) to "count of **distinct named tropical cyclones** in 10yr" (≈4). The old `EXTREME_WIND_BEARISH_THRESHOLD = 3` was calibrated against the old unit and is meaningless for the new one.

**Explicit decision: keep `3`, and document that it now fires effectively permanently — intentionally.** The current rolling 10-year SWFL window already holds **Irma (2017), Ian (2022), Helene (2024), Milton (2024) = 4 distinct cyclones**, so `>= 3` is always-true. Two consequences, both honest:

- **Brain direction** flips structurally to `bearish` (magnitude 0.5, low weight). Correct for a backward-looking hazard-record brain that "never emits bullish — absence of named storms is the baseline." SWFL genuinely *is* a permanent active-storm climate.
- **Constitution `storm-history-modifier` caveat** (permit z-scores may be storm-rebuild-inflated) is likewise chronically true for SWFL and stays effectively always-on.

**Deferred (explicitly out of scope for this truth-fix, RULE 3 discipline):** a recency-based signal (e.g. "last billion-dollar event within 5yr") would make the modifier *vary* if a varying signal is later wanted. Not redesigning the modifier's analytical basis inside a data-correctness PR — flagged here so the choice is visible, not buried.

### 2b. Flag 2 — distinct-cyclone dedup key is explicit, not implicit

"Distinct named tropical cyclones in 10yr" is computed **corpus-wide** (NOT summed per county — Ian hits 3 counties × coastal/inland = up to 6 rows; summing per-county distinct counts would triple-count).

**Dedup key = `UPPER(extracted_name) + "|" + year`** (e.g. `IAN|2022`). This separates same-name storms in different years (names recur unless retired). Rows where name extraction returns null fall back to **`"episode:" + EPISODE_ID`** so distinct unnamed episodes still count once (a safety net; named systems essentially always extract). Requires adding `EPISODE_ID` to the connector SELECT.

---

## 3. Design by component

### 3.1 Ingest — `ingest/duckdb_pipelines/storm_history_swfl/{pipeline.py,constants.py}`

**Filter** (the core fix) — keep all county-type rows (unchanged behavior) **plus** hazard-type zone rows for the 3 counties:

```sql
WHERE state = 'FLORIDA'
  AND (
    (cz_type = 'C' AND cz_name IN ('LEE','COLLIER','CHARLOTTE'))
    OR (cz_type = 'Z'
        AND regexp_matches(cz_name, '^(COASTAL|INLAND) (LEE|COLLIER|CHARLOTTE)( COUNTY)?$')
        AND event_type IN ('Hurricane (Typhoon)','Tropical Storm','Tropical Depression',
                           'Storm Surge/Tide','High Wind','Strong Wind','Coastal Flood'))
  )
```

`HAZARD_ZONE_EVENT_TYPES` + the zone-name regex live in `constants.py`. Keep the `COPY (SELECT * …)` (so `EPISODE_NARRATIVE`/`EVENT_NARRATIVE`/`CZ_TYPE`/`EPISODE_ID` ride into the parquet for the connector to read; the parquet is storm-history's private Tier-1 file — no other consumer — so `SELECT *` is the low-risk choice for carrying the narrative columns).

**Volume guard before the destructive replace** (BIBLE §0.2 rule 5 — this pipeline has none today). Restructure to stage → guard → write:

```python
con.execute("CREATE TABLE staged AS SELECT * FROM read_csv_auto([...]) WHERE <filter>")
total = con.execute("SELECT count(*) FROM staged").fetchone()[0]
hurricane = con.execute(
    "SELECT count(*) FROM staged WHERE event_type IN ('Hurricane (Typhoon)','Tropical Storm')"
).fetchone()[0]
assert_min_rows(total, MIN_TOTAL_ROWS, "storm_events_swfl total")        # floor ~1000 (current 1,178)
assert_min_rows(hurricane, MIN_HURRICANE_ROWS, "storm_events_swfl hurricane/TS rows")  # floor 5 (Ian alone = 6)
# only now: COPY staged TO parquet (replace)
```

The **hurricane-presence floor is the load-bearing invariant** — if a future filter regression drops zone rows again, the ingest fails loud instead of silently shipping "ZERO hurricane-force" a second time. Floors are constants in `constants.py`. PROBE FIRST: run the new filter against NOAA (1996–2025) to confirm row counts, Ian captured, no over-pull, before the real ingest.

### 3.2 Source connector — `refinery/sources/storm-history-source.mts`

- SELECT adds `CZ_TYPE`, `EPISODE_ID`, `EPISODE_NARRATIVE`, `EVENT_NARRATIVE`; `StormRow` gains the matching fields.
- **`normalizeCounty(cz_name)`** — strip leading `COASTAL `/`INLAND `, trailing ` COUNTY`, upper/trim → canonical `LEE`/`COLLIER`/`CHARLOTTE`; used for per-county rollups so zone rows attribute to the right county.
- **`extractStormName(episodeNarr, eventNarr)`** — regex `\b(?:Hurricane|Tropical Storm|Tropical Depression|Subtropical Storm)\s+([A-Z][a-z]+)\b`, preferring a `Hurricane <Name>` match over `Tropical Storm <Name>`; returns `"Ian"` etc., else null. Exported + unit-tested against real narrative strings.
- **`MAJOR_EVENT_TYPES`** → `{Hurricane (Typhoon), Tropical Storm, Tornado, Flash Flood, Storm Surge/Tide}` (was `{Hurricane, …}` — never matched NOAA's actual string).
- **Replace** per-county `extreme_wind_event_count`/`extremeWind10yr` with a **corpus-level `distinct_tropical_cyclones_10yr`**: build a `Set` of dedup keys (§2b) from rows whose `event_type ∈ {Hurricane (Typhoon), Tropical Storm, Tropical Depression}` AND whose date is within the trailing 10yr window; the metric is `set.size`.
- Corpus summary gains **`last_billion_dollar_event_name: string | null`** (name of the most-recent ≥$1B storm).

### 3.3 Pack — `refinery/packs/storm-history-swfl.mts`

- Rename metric slug `storm_extreme_wind_events_10yr` → **`storm_tropical_cyclones_10yr`**. Label: *"SWFL tropical cyclones — distinct hurricanes / tropical storms affecting the footprint, trailing 10-year window."* Units `storms`.
- Rename `directionFromExtremeWind` → **`directionFromTropicalCyclones`** (keeps `>= 3 → bearish`, see §2a). `swflExtremeWindEvents10yr` → `swflDistinctTropicalCyclones10yr` (reads the corpus metric, no longer a per-county sum).
- **A2:** billion-dollar fact/metric/conclusion render **"Hurricane Ian on 2022-09-28"** when a name is present (`${type=Hurricane} ${name=Ian} on ${date}`), gracefully `"Hurricane (Typhoon) on <date>"` when null. Add metric **`storm_last_billion_dollar_event_name`** (categorical).
- Update conclusion + caveats wording (drop the "≥74 kt"/"absence of named storms" framing that no longer matches the metric).

### 3.4 Vocab — `refinery/vocab/brain-vocabulary.json` (same commit)

- Rename concept `env_storm_extreme_wind_events_10yr_swfl` → `env_storm_tropical_cyclones_10yr_swfl` (prefLabel, altLabels, raw_slug `storm_tropical_cyclones_10yr`, scope_note rewritten to the distinct-cyclone definition + the always-on threshold note); update the `slug_index` entry.
- Add concept `env_storm_last_billion_dollar_event_name_swfl` + slug `storm_last_billion_dollar_event_name` + `slug_index` entry.
- Update `env_storm_last_billion_dollar_event_type_swfl` scope_note (Ian 2022 is now the live answer).

### 3.5 Constitution — `refinery/constitution/real-estate.mts` + `.test.mts`

- `STORM_EXTREME_WIND_METRIC` → `STORM_TROPICAL_CYCLONE_METRIC = "storm_tropical_cyclones_10yr"`; `STORM_EXTREME_WIND_BEARISH_THRESHOLD` → `STORM_TROPICAL_CYCLONE_THRESHOLD = 3`; rewrite the rule's doc comment to the new unit + the §2a always-on acknowledgement. Behavior (priority 70, `add_caveat`, scoped to `brain_id==="storm-history-swfl"`) unchanged. Update the modifier tests' metric name + comments.

### 3.6 Fixture — `refinery/__fixtures__/storm-history-swfl.sample.parquet`

Regenerate from NOAA with the **new filter** over a window that includes Ian (e.g. 2022–2024), so it actually contains Ian's `Hurricane (Typhoon)` zone rows + narratives + the $7B Coastal Lee row. The current fixture is county-only and its "captures Hurricane Ian" comment is **false**. A small committed generation script (or documented DuckDB one-liner) makes regeneration reproducible.

### 3.7 Tests

- `storm-history-source.test.mts`: **delete the false** *"Hurricane Ian is in the LIVE Parquet only / fixture has no billion-dollar event"* assertion; assert the fixture now yields `last_billion_dollar_event_date` non-null, `last_billion_dollar_event_name === "Ian"`, `distinct_tropical_cyclones_10yr >= 1`; add `normalizeCounty` + `extractStormName` unit tests.
- `storm-history-swfl.test.mts`: rename `directionFromTropicalCyclones`; assert the renamed metric + the `storm_last_billion_dollar_event_name` metric.

### 3.8 Generated docs / rendered brain

Regenerate `docs/semantic-ledger.md` (`npm run ledger`) and `brains/storm-history-swfl.md` (`npm run refinery -- storm-history-swfl --target-only`) so they reflect the rename + Ian.

---

## 4. Verification, gates, live

- `bun test refinery/sources/storm-history-source.test.mts refinery/packs/storm-history-swfl.test.mts refinery/constitution/real-estate.test.mts`
- `bun refinery/tools/check-vocab-coverage.mts --all` (rendered-output orphan scan — mandatory `--all`)
- Gate-5 catalog mirror (`catalog.test.mts`) + per-pack `bun:test` fire automatically on `refinery/packs/**` touch.
- Local `npm run refinery -- storm-history-swfl --target-only` read-back: confirm Ian present, `bearish`, billion-dollar = "Hurricane Ian on 2022-09-28", distinct-cyclone count > 0.
- Pre-push: Gate 1 (no dep change) · Gate 4 (ingest replace now guarded) · Gate 5 (pack⇆catalog). SESSION_LOG entry. build-queue sync.
- **After merge:** `gh workflow run storm-history-monthly.yml` → live parquet re-ingested with the fix → next refinery rebuild corrects the client-facing read.

## 5. Out of scope / not touched

- `hurricane-tracks-fl` (already correct, names Ian via HURDAT2).
- The modifier's recency re-calibration (§2a deferred).
- No new mandatory pre-materialization gate (RULE 3 C2) — extends existing seams (ingest filter, volume-guard lib, vocab, constitution) only.
