# Fix the two held ingest incidents — faf5 Tier-2 retire + fl_dbpr_applicants

**Status:** AUDITED + HARDENED 2026-06-13. Reviewer's 6 concerns folded in (all confirmed against code; citations inline). Three additional findings the plan + the 6 concerns both missed are marked **➕ ADDED**. Concern-1 enforcement upgraded from a manual dry-run eyeball to a programmatic hard-block.
**Scope:** (1) retire the dead faf5 dlt→Postgres pipeline + safe tombstone; (2) fix `fl_dbpr_applicants` end-to-end (URL + layout + county + guard). **NOT in scope:** any `LICENSES_URLS` change (license-chunk undercount = handoff + check only); the cilb_certified/registered canonical-file question.

---

## Verification status legend

- ✅ **CONFIRMED** — verified against repo code this session (file:line cited).
- ⚠️ **HARDENED** — plan changed because the original enforcement was too soft / a finding was missed.
- 🌐 **VENDOR-UNVERIFIED THIS SESSION** — rests on the prior session's live probe; re-verified at execution by the dry-run hard-block (NOT trusted as fact per Vendor-First).

---

## Reviewer concern resolution (all 6)

| # | Concern | Status | Evidence / change |
|---|---------|--------|-------------------|
| 1 | County-scheme is make-or-break; must HARD-BLOCK | ⚠️ HARDENED | Consumer filter real (`fl-dbpr-licenses-source.mts:157` `.in("county_code",["46","21"])`, non-fatal `:158-160`). Original plan blocked only via a **manual** dry-run read + a total-collapse `assert_min_rows(4000)` — **neither catches a partial (one-county) scheme drift**. Replaced with a programmatic per-county + city-anchor assertion that raises in dry-run AND live (Part 2 §Guard). |
| 2 | Column layout from one row; comma trap | ✅ CONFIRMED (a) / 🌐 (b) | (a) `_stream_csv` uses `csv.reader(io.StringIO(text), delimiter=",")` (`resources.py:126`) — **quote-aware**, embedded address commas do not shift indices. (b) "all 103,291 rows = 15 cols" is the prior probe → re-asserted at execution (Part 2 §Dry-run). |
| 3 | Floor must be a cited constant | ✅ CONFIRMED | `assert_min_rows(landed, minimum, label)` signature confirmed (`guards.py:33`, raises `VolumeGuardError`). Floor stays **4,000 (~46% of probed 8,727)** with inline citation — deliberately NOT 90% (monthly snapshot fluctuates; 90% lives in the cadence freshness probe). This is a justified, cited deviation from the literal "90%" ask. |
| 4 | Tombstone DELETE not faf5-scoped | ✅ CONFIRMED + worse than stated | `drop_faf_tombstone.sql:9` `DELETE … WHERE table_name IS NULL` is global. Worse: `tier1_inventory.py:50-90` **never writes a `table_name` column**, so EVERY inventory row is `table_name`-NULL → line 9 would truncate the entire live Tier-1 inventory. See **➕ ADDED-B** (delete the line, don't just flag it). |
| 5 | BIBLE rule 5 merge vs replace | ✅ CONFIRMED | `resources.py:136` license = `merge`; `:194` applicant = `replace`. Doc rewrite is accurate. Hook clears the file once the guard lands because `hasGuard` matches `assert_min_rows\(` anywhere in the file (`check-prepush-gate.mjs:330-334`). |
| 6 | Part 1 deletion vs Part 2 live-output change | ✅ CONFIRMED | `licenses-swfl.mts:236` citation literally reads `Contractor_Applicants_All_Boards`; `applicants_swfl` flips 0→live. RULE 1 diff-note on Part 2 only. |
| — | "Gate evaluates HEAD post-commit" (agreed; confirm) | ✅ CONFIRMED + precondition | `check-prepush-gate.mjs:320-326`: `git show HEAD:${file}` in try/catch → `continue; // gone at HEAD`. **Precondition:** the deletion must be COMMITTED before push — `git show HEAD:` returns the old blob for a staged/working-tree-only delete, which would keep it flagged. safe-push commits first → fine. |

---

## Root causes (confirmed — live probes + code)

### Incident A — faf5: NOT broken, it's vestigial dead code ✅

- The dlt pipeline `ingest/pipelines/faf5/{pipeline,resources}.py` writes `data_lake.faf_flows / faf_zone_lookup / faf_sctg_lookup` with `write_disposition="replace"`.
- **Invoked by nothing.** `SESSION_LOG.md:3569` records the cutover: `faf5-annual.yml` was changed from calling `ingest.pipelines.faf5.pipeline` (the abandoned dlt→Postgres route) to `ingest.scripts.faf5_to_parquet` (Cold Lane). `cadence_registry.yaml` registers faf5 as tier-1 only.
- **The live freight path is Parquet, not Postgres.** `faf5_to_parquet.py` → S3 Parquet (`lake-tier1`) → `refinery/sources/faf5-source.mts` → `logistics-swfl`. `faf5-source.mts:1-26` confirms it reads three **Parquet views via `makeDuckDBSource`**, NOT the Postgres tables. The `faf_flows`/`faf_zone_lookup`/`faf_sctg_lookup` strings in that file are DuckDB view names, not Postgres reads.
- **Conclusion:** the dlt→Postgres path was superseded by the Tier-1 cold-lane path. Making the Postgres tables "land" would rebuild a working path (violates THE BIBLE §0 — wire what exists, don't rebuild). **Retire the dead pipeline.** This is a correction, not a "known-good" retirement: the dlt replace tables never landed, so faf5 was never genuinely "known-good unguarded" (Concern 5).

### Incident B — fl_dbpr_applicants: wrong URL + wrong layout + producer/consumer mismatch

Three stacked bugs:

1. **Wrong URL.** 🌐 `constants.py:18` `APPLICANTS_URL` → `CONSTRUCTIONAPPLICANT_1.csv`, which (per prior probe) does not exist; DBPR 301-redirects missing `/extracts/` files to an HTML homepage. `_stream_csv`'s `<`-prefix guard (`resources.py:122-125`) correctly returns `[]` → dlt replace with 0 rows → **table never created** (why it's MISSING, not empty). The real file is `constr_app.csv` (prior probe: 200, text/csv, ~14.9 MB).
2. **Wrong column layout.** ✅ Current `constants.py:43-60` guesses a combined "City/State/Zip" at col 8, phone at col 9, no county. 🌐 Real `constr_app.csv` layout (prior probe): `occ_code=0, occ_desc=1, first=2, mid=3, last=4, suffix=5, addr1=6, addr2=7, addr3=8, city=9, state=10, zip=11, county_code=12, phone=13, ext=14`.
3. **Producer/consumer mismatch.** ✅ `_APPLICANT_COLUMNS` (`resources.py:65-74`) emits **no `county_code`**, but the consumer filters `.in("county_code",["46","21"])` (`fl-dbpr-licenses-source.mts:157`). Today the consumer call errors (no column / missing table) → caught non-fatally (`:158-160`) → `applicants_swfl = 0`. So **"Applicants: 0" is a misleading number, not a true zero** — it's narrated in the brain conclusion (`licenses-swfl.mts:102, 230, 255`) and flagged a "leading indicator" (`:299`).

### Incident C — license undercount (DISCOVERED while probing; OUT OF SCOPE → handoff only)

- 🌐 DBPR splits the construction license extract into 3 chunks (`CONSTRUCTIONLICENSE_1/_2/_3.csv`); the pipeline fetches only `_1` (`constants.py:8-17`). Lee+Collier rows are spread across all 3 → the brain's "9,623 active" likely undercounts ~⅓.
- **Blocker first:** is `CONSTRUCTIONLICENSE_*` the canonical active-license set, or do `cilb_certified.csv` / `cilb_registered.csv` supersede/overlap it? Resolve before adding chunks. → **Part 3 handoff + check, no code change this PR.**

---

## Part 1 — Retire the dead faf5 Tier-2 dlt pipeline (operator chose: RETIRE)

- **DELETE** `ingest/pipelines/faf5/resources.py`, `ingest/pipelines/faf5/pipeline.py`, `ingest/tests/pipelines/faf5/test_resources.py`.
- **KEEP** `ingest/pipelines/faf5/constants.py` + `__init__.py` — `faf5_to_parquet.py:23-29` imports `FAF5_DOWNLOAD_URL / FL_ZONE_IDS / FAF5_YEARS / FAF_ZONE_LOOKUP / SCTG_LOOKUP` from it. ✅ Confirmed.

### Tombstone — RUN ONLY THE 3 DROPS (Concern 4)

`docs/sql/drop_faf_tombstone.sql` has 4 statements:

- **Lines 3-5** (`DROP TABLE IF EXISTS data_lake.faf_flows / faf_zone_lookup / faf_sctg_lookup CASCADE`) — faf5-scoped, idempotent, touch no shared `_dlt_*` metadata → **safe to run.** ✅ Probe says the 3 tables are already MISSING → these are **likely no-ops**; the retirement does not depend on them. Confirm row counts after.
- **Line 9** (`DELETE FROM data_lake._tier1_inventory WHERE table_name IS NULL`) — ⚠️ **DO NOT RUN, AND DELETE IT FROM THE FILE.** See **➕ ADDED-B**.
- Optional faf5 dlt state cleanup (keyed, safe): `DELETE FROM data_lake._dlt_pipeline_state WHERE pipeline_name='faf5';`
- Mark/retire `docs/sql/data_lake_faf_flows.sql`.

### ➕ ADDED-A — `_run_tombstone.py` already exists; use it, don't author a new script

The original plan said "run the 3 DROPs as a one-off psycopg script." **One already exists:** `ingest/scripts/_run_tombstone.py` runs exactly the 3 DROP TABLEs (`:21-27`) and **never runs line 9**. It also re-upserts the faf5 **Parquet** cold-lane inventory rows (`:30-40`) — which is correct (the parquet path stays live). So:
- Use `python -m ingest.scripts._run_tombstone` for the (no-op) DROPs, OR skip the DROP step entirely since the tables are already MISSING.
- Note `_run_tombstone.py`'s INSERT also omits `table_name` (`:36`) — i.e. it writes more `table_name`-NULL rows, which is exactly why line 9 is catastrophic. See ADDED-B.

### ➕ ADDED-B — DELETE tombstone line 9 in this PR (don't just "flag it")

Line 9's own comment ("remove null-`table_name` rows so dlt can add a NOT NULL constraint") is **obsolete and contradicted by current code**: `tier1_inventory.py:50-90` (`upsert_inventory_row`) is *designed* to leave `table_name` NULL on every Tier-1 row, so the premise is dead and the statement is a live footgun for anyone who runs the whole file. It would truncate the entire Tier-1 inventory, not just stray rows. This is a zero-risk SQL-file edit → **remove line 9 (and its 2-line comment) from `docs/sql/drop_faf_tombstone.sql` in this same PR**, with a one-line note in the commit body explaining the obsolete rationale. (The only thing not verifiable from code is whether `_tier1_inventory.table_name` still exists as a column — needs a live `\d data_lake._tier1_inventory`. Either way the line should not survive; if the column was dropped the line errors, if it exists the line wipes inventory.)

### Gate-4 auto-clear ✅

`check-prepush-gate.mjs:320-326` reads each touched file via `git show HEAD:${file}` and `continue`s (skips) on failure — a committed deletion is absent at HEAD → faf5 drops off the replace-without-guard list with no `ALLOW_REPLACE_WITHOUT_GUARD` override. Precondition: commit the deletions before pushing.

### Docs (Concern 5 — precise)

Rewrite THE BIBLE §0.2 rule 5's "known-good unguarded replace pipelines" line so it is accurate:
- **faf5** — removed as a **correction**: its dlt replace tables never landed, so it was never "known-good"; the live freight path is Tier-1 Parquet.
- **fl_dbpr_licenses** — the license resource is `merge` (no guard needed); the guard lands on the **applicant** resource (`replace`) in the same file. Do NOT word it to imply the license resource is the replace target.
- **census_cbp + fdot** — already guarded (unchanged).

Update the hook comment block (`check-prepush-gate.mjs`, the §0.2 narrative comment near the top) to drop the faf5/fl_dbpr "HELD unguarded" language and note both incidents resolved. (Comment-only; not load-bearing.)

---

## Part 2 — Fix the fl_dbpr applicants pipeline (URL + layout + county + guard)

🌐 Prior live probe (2026-06-13, quote-aware, mirroring `_stream_csv`): `constr_app.csv` = 200 text/csv, 103,291 rows, ALL exactly 15 cols (row-len dist `[(15, 103291)]`), county scheme = DBPR 2-digit (Lee=46 incl. FORT MYERS/CAPE CORAL/LEHIGH/BONITA/ESTERO; Collier=21 incl. NAPLES/MARCO ISLAND), SWFL count = 8,727 (Lee 6,031 / Collier 2,696). **These facts are re-asserted programmatically at execution (Dry-run + Guard below) — not trusted as given.**

### `ingest/pipelines/fl_dbpr_licenses/constants.py`

- `APPLICANTS_URL` → `https://www2.myfloridalicense.com/sto/file_download/extracts/constr_app.csv`
- Replace the applicant column constants with the verified 15-col layout: `COL_APP_OCC_CODE=0, COL_APP_OCC_DESC=1, COL_APP_FIRST=2, COL_APP_MID=3, COL_APP_LAST=4, COL_APP_SUFFIX=5, COL_APP_ADDR1=6, COL_APP_ADDR2=7, COL_APP_ADDR3=8, COL_APP_CITY=9, COL_APP_STATE=10, COL_APP_ZIP=11, COL_APP_COUNTY=12, COL_APP_PHONE=13, COL_APP_EXT=14`.
- Drop the bogus `COL_APP_CITY_ST_ZIP`. `MIN_APP_ROW_LEN = COL_APP_EXT + 1 = 15`.

### `ingest/pipelines/fl_dbpr_licenses/resources.py` (`dbpr_applicants_resource`)

- **Filter to Lee+Collier at ingest** (mirrors the license resource): only emit rows where `row[COL_APP_COUNTY].strip() in COUNTY_FILTER`. Keeps the replace table ~8.7k not 103k.
  - ✅ **Required, not optional:** add `county_code` + `county` to `_APPLICANT_COLUMNS` (currently absent, `:65-74`) — without the column the consumer's `.in("county_code",…)` errors. Emit `county_code = row[COL_APP_COUNTY].strip()` (byte-exact `"46"`/`"21"` — the consumer does a string `.in`, so `"046"`, `" 46"`, or an int will silently miss) and `county = COUNTY_FILTER[code]`. Also emit real `city`(col 9)/`state`(10)/`zip`(11) instead of the combined field.
- **➕ ADDED-C — applicant header detection.** `_is_header_row` (`:102-107`) only recognizes the *license* header (`board`/`board_number`); the applicant header (`occ_code`-ish) would slip through as a data row. The ingest-side county filter neutralizes this (a header's col-12 is a label, never `"46"`/`"21"` → dropped), but add a cheap explicit guard for cleanliness: treat `row[0].strip().lower()` in `{"occ number","occ_code","occupation number"}` as a header too. Not blocking; belt for the filter.

### ⚠️ Guard — HARD-BLOCK on county scheme, not just total collapse (Concern 1)

Materialize the SWFL-filtered rows into a list, then assert BEFORE `yield from` (model: `ingest/pipelines/fema/resources.py` `_promote_nfip_to_tier2`). The assertion raises `VolumeGuardError` during dlt extract — which runs in **both** `--dry-run` and live — so it is a true hard-block, not a human eyeball:

```python
rows = [ ... SWFL-filtered applicant dicts ... ]
lee = sum(1 for r in rows if r["county_code"] == "46")
collier = sum(1 for r in rows if r["county_code"] == "21")

# (1) total catastrophic floor — HTML/empty/scheme-break collapse to ~0.
#     4,000 ≈ 46% of 8,727 SWFL applicants probed live in constr_app.csv 2026-06-13.
#     Deliberately loose, NOT 90% — the monthly snapshot fluctuates; the 90%-style
#     freshness floor lives in cadence_registry (expected_rows_min), not here.
assert_min_rows(len(rows), 4000, "fl_dbpr_applicants")

# (2) PARTIAL-scheme-drift block — the total floor above does NOT catch one county
#     dropping out (e.g. Collier scheme drifts → 6,031 Lee rows still > 4,000 → passes,
#     Collier silently 0). This is the env-swfl width/scheme failure mode. Per-county floors:
#     Lee floor 3,000 (~50% of probed 6,031), Collier floor 1,300 (~48% of probed 2,696).
assert_min_rows(lee, 3000, "fl_dbpr_applicants:lee_46")
assert_min_rows(collier, 1300, "fl_dbpr_applicants:collier_21")

# (3) city-anchor invariant — proves col 12 still IS county_code in the DBPR 2-digit
#     scheme (not a FIPS swap / index shift). At least one canonical Lee city must map to
#     "46" and one Collier city to "21". Raises if the anchor is absent (scheme moved).
import re
def _has_anchor(city_substr, code):
    pat = re.compile(city_substr, re.I)
    return any(r["county_code"] == code and pat.search(r.get("city") or "") for r in rows)
if not _has_anchor(r"fort myers|cape coral", "46"):
    raise VolumeGuardError("[volume-guard] fl_dbpr_applicants: no Lee city anchors county_code 46 — scheme moved, aborting")
if not _has_anchor(r"naples|marco island", "21"):
    raise VolumeGuardError("[volume-guard] fl_dbpr_applicants: no Collier city anchors county_code 21 — scheme moved, aborting")

yield from rows
```

- Fix the stale module docstring (`resources.py:1-9`, "pipe-delimited" → comma-delimited/quote-aware; new applicant layout + ingest-side county filter).

### Consumer + provenance

- `fl-dbpr-licenses-source.mts` — `.in("county_code",["46","21"])` (`:157`) now resolves. Also update the docstring at `:19` ("full-state applicant snapshot") to reflect the SWFL-at-ingest filter.
- `licenses-swfl.mts:236` — fix the citation string `Contractor_Applicants_All_Boards` (matches neither the old nor the new filename) → `constr_app.csv`. ✅
- `refinery/__fixtures__/fl-dbpr-licenses.sample.json` — give applicant fixture rows a `county_code` (`"46"`/`"21"`) so fixture-mode + tests exercise the SWFL filter.

### Dry-run → land → grant → register (Concern 2 (b) re-verify)

- **Dry-run** (`python -m ingest.pipelines.fl_dbpr_licenses.pipeline --dry-run`). The 4 hard asserts above run during extract; additionally print, for human confirmation: row-length distribution (expect all 15), DISTINCT `county_code` values, and Lee/Collier/total counts (expect ≈ 6,031 / 2,696 / 8,727). A material deviation = DBPR changed the file → the asserts already aborted; do not override.
- **Live run** → dlt creates `data_lake.fl_dbpr_applicants`.
- **Grant** (BIBLE §5.2 — refinery 403s without it): `GRANT SELECT ON ALL TABLES IN SCHEMA data_lake TO service_role; NOTIFY pgrst,'reload schema';`
- **Cadence registry** — add a `fl_dbpr_applicants` entry. Register `expected_rows_min` as a placeholder, then set it from the **actual** first-live SWFL count (≈ 90% of landed, matching the redfin_lee 600→594 discipline in `SESSION_LOG`), distinct from the in-pipeline catastrophic floor of 4,000. Open a follow-up check to re-baseline after the next monthly refresh.

### RULE 1 (Concern 6) — Part 2 only

Part 2 flips `licenses_applicants_swfl` from a misleading 0 to ~8,727 (live-output change) → the push carries a diff-review note with the clean before/after applicant number. Part 1 (faf5) is a pure deletion with no brain-output delta — keep the two attributable separately in the same push.

---

## Part 3 — License chunk undercount (operator chose: TRACK SEPARATELY — NO code change this PR)

No change to `LICENSES_URLS`. Deliver two artifacts so the next session can pick it up cold after the canonical-file question is answered:

**(a) Open a check (RULE 2 UPDATE):**
```
node scripts/check.mjs open licenses-swfl dbpr_license_chunk_undercount \
  "DBPR construction license extract is 3 chunks (_1/_2/_3); pipeline reads only _1 → Lee+Collier active undercounts ~1/3" \
  --detail "BLOCKER first: confirm whether CONSTRUCTIONLICENSE_* or cilb_certified/cilb_registered is the canonical active-license source before adding chunks. See handoff."
```

**(b) Write `docs/handoff/2026-06-13-dbpr-license-chunk-undercount.md`** (create at execution, not now) containing verbatim:
- Symptom: licenses-swfl reports "Active: Lee 6,342, Collier 3,281 = 9,623" — likely undercount; only `CONSTRUCTIONLICENSE_1.csv` fetched.
- Live-probed facts (2026-06-13): 3 chunks, all 200 text/csv — `_1` = 47,991,367 B, `_2` = 14,739,733 B, `_3` = 13,836,119 B; `_4+` → 301. Pipeline fetches `_1` + `lic08el.csv` (board 08) only (`constants.py:8-17`).
- THE BLOCKER (answer first): DBPR's construction-industry public-records page lists `constr_app.csv`, `cilb_certified.csv` (128,913,344 B), `cilb_registered.csv` (28,538,544 B), `CONSTRUCTIONLICENSE_1.csv`, `swimpool_exam.csv`. Unknown: is `CONSTRUCTIONLICENSE_*` the canonical "all construction licenses" set, or do the CILB files supersede/overlap it? Adding `_2/_3` before resolving risks duplicate/non-canonical rows inflating counts. Resolve via the DBPR file-layout doc / contact + by diffing `license_number` sets across files.
- The fix (once canonical confirmed): add the right chunk URLs (board "06") to `LICENSES_URLS`; same `_stream_csv` + county filter + `_DBPR_COLUMNS` layout (merge on `license_number` is idempotent — re-reading `_1` rows is safe). Pre-verify each new chunk: `curl -sL '.../CONSTRUCTIONLICENSE_2.csv' | head -3` (layout matches `_1`: board=0, county=11, license_no=12, status=13/14, dates=15-17), and confirm it contains Lee/Collier rows.
- After landing: `npm run refinery -- licenses-swfl --target-only`; record before/after Lee+Collier active count in PR notes (RULE 1).
- No guard regression: `fl_dbpr_licenses` uses `write_disposition="merge"` (not replace), so Gate 4's replace-without-guard rule does not apply to the license resource; the guard work in this PR is on the applicant (replace) resource only.

---

## Verification (end-to-end)

1. **Python tests:** `python -m pytest ingest/tests/pipelines/fl_dbpr_licenses/` — update applicant tests for the 15-col layout + ingest county filter; add tests that the per-county + city-anchor + total guards FIRE (assert `VolumeGuardError` raised on a Collier-stripped / scheme-swapped / HTML fixture). Confirm faf5 test deletion doesn't break collection.
2. **Dry-run:** `python -m ingest.pipelines.fl_dbpr_licenses.pipeline --dry-run` → 4 hard asserts pass; printed dist = all 15 cols, county_code ∈ {46,21}, Lee/Collier/total ≈ 6,031 / 2,696 / 8,727.
3. **Live land + grant**, then re-probe row counts via psycopg / `mcp__lake`.
4. **Brain rebuild:** `npm run refinery -- licenses-swfl --target-only` → `licenses_applicants_swfl` is a real number; `bun refinery/tools/check-vocab-coverage.mts --all` clean (no new slug).
5. **Gate-4 dry check:** commit deletions + edits, run the pre-push gate → faf5 gone from the block list; `fl_dbpr_licenses` now shows `assert_min_rows` (guarded).
6. **TS:** `bunx tsc --noEmit` + `bun test refinery/packs/licenses-swfl.test.mts` green.
7. **Handoff artifacts (Part 3):** `docs/handoff/2026-06-13-dbpr-license-chunk-undercount.md` exists with the full dump; `node scripts/check.mjs list` shows `dbpr_license_chunk_undercount` open.

---

## Critical files

- **DELETE:** `ingest/pipelines/faf5/resources.py`, `…/pipeline.py`, `ingest/tests/pipelines/faf5/test_resources.py`
- **KEEP (do NOT touch):** `ingest/pipelines/faf5/constants.py` (imported by `faf5_to_parquet.py`), `__init__.py`
- **EDIT:** `ingest/pipelines/fl_dbpr_licenses/{constants.py,resources.py}`, `refinery/sources/fl-dbpr-licenses-source.mts` (filter resolves + docstring `:19`), `refinery/packs/licenses-swfl.mts` (citation string `:236` only), `refinery/__fixtures__/fl-dbpr-licenses.sample.json`, `ingest/cadence_registry.yaml`, `docs/standards/data-and-build-bible.md` (§0.2 rule 5), `.claude/hooks/check-prepush-gate.mjs` (comment block only), `docs/sql/drop_faf_tombstone.sql` (**DELETE line 9** + its comment — ADDED-B)
- **CREATE:** `docs/handoff/2026-06-13-dbpr-license-chunk-undercount.md` (Part 3, at execution)
- **RUN (no-op DROPs):** `ingest/scripts/_run_tombstone.py` (already does the 3 DROPs safely; ADDED-A) — or skip, tables already MISSING
- **LICENSES_URLS in constants.py:** read, do NOT edit this PR (license-chunk = separate)
- **REFERENCE (mirror the guard):** `ingest/pipelines/fema/resources.py` `_promote_nfip_to_tier2`, `ingest/lib/guards.py` (`assert_min_rows`, `VolumeGuardError`)

---

## Vendor-First caveat (standing)

Everything *in the repo* is confirmed against code (citations above). The live-vendor facts that Concerns 1 & 2 hinge on — `constr_app.csv` at that URL, the 15-col layout, `county_code` at col 12 in the DBPR 2-digit scheme, the 8,727 SWFL count — are the **prior session's probe**, not re-verified in the audit session (the re-probe was halted). Per RULE 0, "the prior session specified X" is not verification. Those facts are re-asserted at execution by the dry-run hard-block (the 4 `VolumeGuardError` asserts run during extract in both dry-run and live) — which is exactly why Concern 1's enforcement was upgraded from a manual read to a programmatic block.
