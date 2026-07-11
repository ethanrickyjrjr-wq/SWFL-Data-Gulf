# DBPR New-Agent Radar Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 9 files, keywords: migration, schema, architecture

**Goal:** Build `ingest/pipelines/dbpr_re_licensees/`, a weekly Python pipeline that downloads Florida DBPR's `RE_rgn7.csv` real-estate-licensee extract, keeps Lee+Collier individual agents, and merges them into `public.dbpr_re_licensees` — giving outreach a queryable "who just got licensed" stream via `public.new_re_agents`.

**Architecture:** Non-dlt pipeline (raw `psycopg` upsert), mirroring `ingest/pipelines/dbpr_public_notices/` — chosen over the dlt-merge pattern used by `fl_dbpr_licenses` because the `email` column needs a `COALESCE`-on-conflict that dlt's built-in merge can't express (dlt merge overwrites every column from the extracted row, which would null out any email the separate records-request lane later populates). CSV parsing (quoted, no header, positional columns) follows `fl_dbpr_licenses/resources.py`'s `_stream_csv` pattern.

**Tech Stack:** Python 3.13, `psycopg[binary]>=3.2`, `requests`, `python-dateutil` (all already in `ingest/requirements.txt` — no new deps). Migration via `bun scripts/run-migration.ts` (Bun's native Postgres, `.dlt/secrets.toml` creds — psql is not installed on this box).

## Global Constraints

- **Scope: Lee + Collier only** (CLAUDE.md SCOPE) — filter on `county_name` (column 12), never widen without an explicit decision.
- **Column layout is 23 (0-indexed)** — corrected 07/10/2026 from a live byte-range download; see `docs/superpowers/specs/2026-07-11-new-agent-radar-design.md` Sources section. Never trust DBPR's published column-list prose over a live probe (same trap `fl_dbpr_licenses` hit).
- **`email` column is nullable and NEVER set by this pipeline** — always `NULL` in every upsert row. A separate records-request lane populates it later. The upsert MUST use `COALESCE(EXCLUDED.email, <table>.email)` on conflict so this pipeline's weekly re-run never clobbers a populated email back to NULL.
- **Merge, never replace.** `license_number` is the primary key; `first_seen_at` is preserved on conflict (never updated).
- **No LLM anywhere in this pipeline** — no `RunBudget`, no spend guard needed (ingest/CLAUDE.md's $1/run rule only applies to LLM-calling pipelines).
- **Lands in `public.*`, not `data_lake.*`** — operational table feeding outreach, not the answer engine. No brain-first gate, no consuming `PackDefinition` needed.
- **`--dry-run` required** in the same PR as the pipeline (pipeline-freshness rule) — fetches + prints, zero DB writes.
- **Stage explicit paths only** when committing; never `git add -A`.

---

## File Structure

```
docs/sql/20260711_dbpr_re_licensees.sql       migration: table + view + grant (idempotent)
ingest/pipelines/dbpr_re_licensees/
  __init__.py                                 empty (package marker)
  constants.py                                URL, column positions, county/individual filters
  parse.py                                    pure functions: date parse, name split, row normalize
  test_parse.py                               unit tests on real sampled rows (colocated, dbpr_public_notices style)
  pipeline.py                                 download, filter, normalize, volume-guard, upsert, --dry-run
.github/workflows/ingest-dbpr-re-licensees.yml  weekly cron (Monday 12:00 UTC) + workflow_dispatch
ingest/cadence_registry.yaml                  append dbpr_re_licensees entry
docs/standards/pipeline-freshness.md          append the new Monday 12:00 slot to the §3 table
```

---

### Task 1: Migration — table + view

**Files:**
- Create: `docs/sql/20260711_dbpr_re_licensees.sql`

**Interfaces:**
- Produces: `public.dbpr_re_licensees` (PK `license_number`), `public.new_re_agents` (view). Both consumed by Task 5 (`pipeline.py`'s `UPSERT_SQL`) and by outreach later (out of scope here).

- [ ] **Step 1: Write the migration SQL**

```sql
-- docs/sql/20260711_dbpr_re_licensees.sql
-- public.dbpr_re_licensees — DBPR weekly RE_rgn7.csv extract, Lee+Collier individual agents.
-- Written by ingest/pipelines/dbpr_re_licensees/pipeline.py (psycopg3, non-dlt — mirrors
-- public.dbpr_public_notices). Source: https://www2.myfloridalicense.com/sto/file_download/
-- extracts/RE_rgn7.csv — weekly refresh. Column layout: docs/superpowers/specs/
-- 2026-07-11-new-agent-radar-design.md (23 cols, corrected 07/10/2026 from a live probe).
--
-- email: ALWAYS NULL from this pipeline. Populated later by a separate Chapter 119
-- records-request lane (tracked outside this build). The upsert in pipeline.py uses
-- COALESCE(EXCLUDED.email, existing) so this pipeline's weekly re-run never clobbers a
-- populated email back to NULL.
--
-- "New agent" access is the public.new_re_agents view below, keyed on original_license_date
-- (NOT first_seen_at) so the very first run does not falsely flag the whole ~30k backlog
-- as "new" — only genuinely recently-issued licenses qualify, cold-start safe.

CREATE TABLE IF NOT EXISTS public.dbpr_re_licensees (
  license_number             text primary key,
  alternate_license_number   text,
  licensee_name               text not null,   -- raw "LAST, FIRST MIDDLE"
  first_name                  text,
  middle                       text,
  last_name                    text,
  dba_name                     text,
  rank                         text,            -- e.g. "SL Sales Associate"
  license_type                 text,            -- e.g. "2501 Real Estate Broker or Sales"
  address1                     text,
  address2                     text,
  address3                     text,
  city                         text,
  state                        text,
  zip                          text,
  county_code                  text,            -- DBPR 2-digit, e.g. "46" (Lee), "21" (Collier)
  county_name                  text not null,   -- "Lee" | "Collier"
  primary_status                text,
  secondary_status              text,
  original_license_date         date,           -- "new agent" signal — first issued
  status_effective_date         date,
  license_expiration_date       date,
  employer_name                 text,
  employer_license_number       text,
  email                         text,           -- ALWAYS NULL here; see header note
  email_source                  text,           -- provenance once the email lane lands
  source_tag                    text not null default 'dbpr_re_rgn7',
  source_url                    text,
  as_of_date                    date,           -- file fetch date
  first_seen_at                 timestamptz not null default now(),
  last_seen_at                  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS dbpr_re_licensees_county_idx ON public.dbpr_re_licensees (county_name);
CREATE INDEX IF NOT EXISTS dbpr_re_licensees_orig_date_idx ON public.dbpr_re_licensees (original_license_date);
CREATE INDEX IF NOT EXISTS dbpr_re_licensees_last_seen_idx ON public.dbpr_re_licensees (last_seen_at);

CREATE OR REPLACE VIEW public.new_re_agents AS
SELECT *
FROM public.dbpr_re_licensees
WHERE original_license_date >= (current_date - interval '90 days')
ORDER BY original_license_date DESC;

COMMENT ON VIEW public.new_re_agents IS
  'Lee/Collier RE licensees issued in the last 90 days. Outreach reads the 7-day slice off the same shape: WHERE original_license_date >= current_date - interval ''7 days''.';

GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Run the migration via the existing runner**

Run: `bun scripts/run-migration.ts docs/sql/20260711_dbpr_re_licensees.sql`
Expected output: `Running docs/sql/20260711_dbpr_re_licensees.sql...` then `  ✓ done` then `Migrations complete.`

- [ ] **Step 3: Verify live**

Run (inline, one-off — do not commit a verify script):
```bash
bun -e '
const secrets = await Bun.file(".dlt/secrets.toml").text();
const t = (k) => secrets.match(new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, "m"))[1];
const url = `postgres://${t("username")}:${encodeURIComponent(t("password"))}@${t("host")}:5432/${t("database")}?sslmode=require`;
const sql = new Bun.SQL(url);
console.log(await sql`SELECT count(*) FROM public.dbpr_re_licensees`);
console.log(await sql`SELECT count(*) FROM public.new_re_agents`);
await sql.end();
'
```
Expected: both counts `0` (tables/view exist, empty — no rows landed yet).

- [ ] **Step 4: Commit**

```bash
git add docs/sql/20260711_dbpr_re_licensees.sql
git commit -m "feat(dbpr-re-licensees): add table + new_re_agents view"
```

---

### Task 2: `constants.py` — URL, column positions, filters

**Files:**
- Create: `ingest/pipelines/dbpr_re_licensees/__init__.py` (empty)
- Create: `ingest/pipelines/dbpr_re_licensees/constants.py`

**Interfaces:**
- Produces: `RE_RGN7_URL`, `CITATION_URL`, `COL_*` column-position ints, `MIN_ROW_LEN`, `SWFL_COUNTIES`, `INDIVIDUAL_PREFIX` — consumed by Task 3 (`parse.py`) and Task 5 (`pipeline.py`).

- [ ] **Step 1: Write constants.py**

```python
"""Constants for the DBPR RE licensee (new-agent radar) pipeline.

Column layout verified live 07/10/2026 via a byte-range curl of the real file — NOT the
DBPR public-records page's prose column list, which undercounts by 2 columns (missing the
license-type code-description merge at col 1 and the county_code column at col 11). See
docs/superpowers/specs/2026-07-11-new-agent-radar-design.md Sources section for the full
verification trail and a real sample row.
"""

# Weekly-refreshed Region 7 extract: Charlotte, Collier, DeSoto, Glades, Hendry, Highlands,
# Lee, Sarasota. We keep Lee + Collier only (CLAUDE.md SCOPE).
RE_RGN7_URL = "https://www2.myfloridalicense.com/sto/file_download/extracts/RE_rgn7.csv"

# Human-readable citation URL for provenance (matches fl_dbpr_licenses' DBPR_CITATION_URL pattern).
CITATION_URL = "https://www2.myfloridalicense.com/instant-public-records/"

# ── Column positions (0-indexed, RE_rgn7.csv — no header row) ──────────────────────────────
COL_BOARD_NUMBER = 0              # always "25" (Real Estate board)
COL_LICENSE_TYPE = 1              # CODE + label, e.g. "2501 Real Estate Broker or Sales"
COL_LICENSEE_NAME = 2             # raw "LAST, FIRST MIDDLE"
COL_DBA_NAME = 3
COL_RANK = 4                      # CODE + label, e.g. "SL Sales Associate"
COL_ADDRESS1 = 5
COL_ADDRESS2 = 6
COL_ADDRESS3 = 7
COL_CITY = 8
COL_STATE = 9
COL_ZIP = 10
COL_COUNTY_CODE = 11              # DBPR 2-digit, e.g. "46" (Lee), "21" (Collier)
COL_COUNTY_NAME = 12              # e.g. "Lee", "Collier"
COL_LICENSE_NUMBER = 13
COL_PRIMARY_STATUS = 14           # e.g. "Current"
COL_SECONDARY_STATUS = 15         # e.g. "Active", "Invol Inactive"
COL_ORIGINAL_LICENSE_DATE = 16
COL_STATUS_EFFECTIVE_DATE = 17
COL_LICENSE_EXPIRATION_DATE = 18
COL_ALTERNATE_LICENSE_NUMBER = 19  # e.g. "SL3014884"
COL_SELF_PROPRIETOR_NAME = 20
COL_EMPLOYER_NAME = 21
COL_EMPLOYER_LICENSE_NUMBER = 22

# Must have at least through the last column used.
MIN_ROW_LEN = COL_EMPLOYER_LICENSE_NUMBER + 1  # 23

# County filter — county_name (col 12) values kept.
SWFL_COUNTIES = {"Lee", "Collier"}

# Individual agents (as opposed to corporations "2502", branch offices "2504", schools,
# etc.) carry this prefix in COL_LICENSE_TYPE. Verified live: every individual row in the
# real file reads exactly "2501 Real Estate Broker or Sales".
INDIVIDUAL_PREFIX = "2501 "

# Volume-guard floors. Verified live 2026-07-10 against the full RE_rgn7.csv (51,364 total
# rows, all 23 columns): 30,100 kept individual Lee/Collier rows (Lee 18,015 / Collier
# 12,085), ALL statuses (this table keeps historical/inactive rows too — only license.md's
# `--- OUTPUT ---`-style "current only" views would filter status; "new" is keyed off
# original_license_date, not status). Floors set at ~50% of the observed count, matching the
# fl_dbpr_licenses precedent (loose bootstrap floor; catches collapse/scheme-drift, not
# week-to-week fluctuation — that lives in cadence_registry expected_rows_min).
FLOOR_TOTAL = 15_000
FLOOR_LEE = 9_000
FLOOR_COLLIER = 6_000
```

- [ ] **Step 2: Commit**

```bash
git add ingest/pipelines/dbpr_re_licensees/__init__.py ingest/pipelines/dbpr_re_licensees/constants.py
git commit -m "feat(dbpr-re-licensees): add pipeline constants (verified 23-col layout)"
```

---

### Task 3: `parse.py` — pure normalize functions (TDD)

**Files:**
- Create: `ingest/pipelines/dbpr_re_licensees/parse.py`
- Test: `ingest/pipelines/dbpr_re_licensees/test_parse.py`

**Interfaces:**
- Consumes: `constants.py`'s `COL_*`, `MIN_ROW_LEN`, `SWFL_COUNTIES`, `INDIVIDUAL_PREFIX`.
- Produces: `parse_dbpr_date(value: str) -> str | None` (ISO date string), `split_licensee_name(raw: str) -> tuple[str | None, str | None, str | None]` (last, first, middle), `normalize_row(row: list[str]) -> dict | None` — consumed by Task 5 (`pipeline.py`).

- [ ] **Step 1: Write the failing tests**

```python
# ingest/pipelines/dbpr_re_licensees/test_parse.py
"""Unit tests for the DBPR RE licensee parse module.

All fixtures are REAL rows sampled 2026-07-10 from a live download of RE_rgn7.csv (23
columns, verified — see constants.py docstring). One synthetic short-row fixture tests the
column-count guard.
"""
from .parse import parse_dbpr_date, split_licensee_name, normalize_row

# Lee, individual, Current/Active, has employer — the "full happy path" row.
AARNIO_LEE = [
    "25", "2501 Real Estate Broker or Sales", "AARNIO, KRISTEN LYNN", "",
    "SL Sales Associate", "1013 SE 43RD TERR", "", "", "CAPE CORAL", "FL", "33904",
    "46", "Lee", "3579344", "Current", "Active", "06/16/2023", "07/10/2023",
    "03/31/2027", "SL3579344", "", "NAUTICAL GULF REALTY INC", "1067315",
]

# Highlands (non-SWFL), individual — must be dropped by the county filter.
AARON_HIGHLANDS = [
    "25", "2501 Real Estate Broker or Sales", "AARON, KUMASI", "",
    "SL Sales Associate", "622 MARTIN LUTHER KING JR. BLVD", "", "", "SEBRING", "FL",
    "33870", "38", "Highlands", "3636733", "Current", "Active", "05/27/2025",
    "05/23/2025", "03/31/2027", "SL3636733", "", "STAR BAY REALTY CORP", "1055154",
]

# Lee, corporation (2502) — must be dropped by the individual filter.
CORP_LEE = [
    "25", "2502 Real Estate Corporation", "#1 REAL ESTATE SERVICES LLC", "",
    "CQ RE Corp.", "23004 SANABRIA LOOP", "", "", "BONITA SPRINGS", "FL", "34135",
    "46", "Lee", "1031298", "Current", "Active", "03/12/2008", "02/08/2010",
    "09/30/2027", "CQ1031298", "", "", "",
]

# Collier, individual, has employer, single-letter middle name ("LESLIE B").
AARON_COLLIER = [
    "25", "2501 Real Estate Broker or Sales", "AARON, LESLIE B", "",
    "SL Sales Associate", "692 PINE COURT", "", "", "NAPLES", "FL", "34102",
    "21", "Collier", "655507", "Current", "Active", "09/22/1997", "12/12/2012",
    "03/31/2027", "SL655507", "", "SUN REALTY USA INC", "1021728",
]

# Lee, individual, no employer, single first name (no middle name at all).
ABAL_NO_MIDDLE = [
    "25", "2501 Real Estate Broker or Sales", "ABAL, KATIUSKA", "",
    "SL Sales Associate", "917  PALMETTO AVE", "", "", "LEHIGH ACRES", "FL",
    "33972", "46", "Lee", "3588678", "Current", "Inactive", "09/18/2023",
    "04/02/2025", "03/31/2027", "SL3588678", "", "", "",
]

# Synthetic — truncated mid-row (only 10 of 23 columns). Tests the length guard.
SHORT_ROW = AARNIO_LEE[:10]


class TestParseDbprDate:
    def test_valid_date(self):
        assert parse_dbpr_date("06/16/2023") == "2023-06-16"

    def test_empty_string(self):
        assert parse_dbpr_date("") is None

    def test_none_input(self):
        assert parse_dbpr_date(None) is None

    def test_garbage_input(self):
        assert parse_dbpr_date("not-a-date") is None


class TestSplitLicenseeName:
    def test_first_and_middle(self):
        assert split_licensee_name("AARNIO, KRISTEN LYNN") == ("Aarnio", "Kristen", "Lynn")

    def test_single_letter_middle(self):
        assert split_licensee_name("AARON, LESLIE B") == ("Aaron", "Leslie", "B")

    def test_no_middle(self):
        assert split_licensee_name("ABAL, KATIUSKA") == ("Abal", "Katiuska", None)

    def test_no_comma_falls_back_to_last_only(self):
        assert split_licensee_name("SOME ORG NAME") == ("Some Org Name", None, None)


class TestNormalizeRowKept:
    def setup_method(self):
        self.row = normalize_row(AARNIO_LEE)

    def test_kept(self):
        assert self.row is not None

    def test_license_number(self):
        assert self.row["license_number"] == "3579344"

    def test_name_split(self):
        assert self.row["last_name"] == "Aarnio"
        assert self.row["first_name"] == "Kristen"
        assert self.row["middle"] == "Lynn"

    def test_county(self):
        assert self.row["county_code"] == "46"
        assert self.row["county_name"] == "Lee"

    def test_license_type_and_rank(self):
        assert self.row["license_type"] == "2501 Real Estate Broker or Sales"
        assert self.row["rank"] == "SL Sales Associate"

    def test_dates(self):
        assert self.row["original_license_date"] == "2023-06-16"
        assert self.row["status_effective_date"] == "2023-07-10"
        assert self.row["license_expiration_date"] == "2027-03-31"

    def test_employer(self):
        assert self.row["employer_name"] == "NAUTICAL GULF REALTY INC"
        assert self.row["employer_license_number"] == "1067315"

    def test_email_always_none(self):
        assert self.row["email"] is None


class TestNormalizeRowCollierKept:
    def test_collier_kept_with_single_letter_middle(self):
        row = normalize_row(AARON_COLLIER)
        assert row is not None
        assert row["county_name"] == "Collier"
        assert row["last_name"] == "Aaron"
        assert row["middle"] == "B"


class TestNormalizeRowNoMiddleNoEmployer:
    def test_kept_with_nulls(self):
        row = normalize_row(ABAL_NO_MIDDLE)
        assert row is not None
        assert row["middle"] is None
        assert row["employer_name"] is None
        assert row["employer_license_number"] is None


class TestNormalizeRowDropped:
    def test_non_swfl_county_dropped(self):
        assert normalize_row(AARON_HIGHLANDS) is None

    def test_corporation_dropped(self):
        assert normalize_row(CORP_LEE) is None

    def test_short_row_dropped(self):
        assert normalize_row(SHORT_ROW) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest ingest/pipelines/dbpr_re_licensees/test_parse.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ingest.pipelines.dbpr_re_licensees.parse'` (or `ImportError`, since `parse.py` doesn't exist yet).

- [ ] **Step 3: Write parse.py**

```python
"""Pure normalize functions for the DBPR RE licensee (new-agent radar) pipeline.

No I/O, no wall-clock — pipeline.py supplies source_url / as_of_date / timestamps at
upsert time. Every function here is unit-testable with plain lists/strings.
"""
from __future__ import annotations

from datetime import datetime

from .constants import (
    COL_ADDRESS1,
    COL_ADDRESS2,
    COL_ADDRESS3,
    COL_ALTERNATE_LICENSE_NUMBER,
    COL_CITY,
    COL_COUNTY_CODE,
    COL_COUNTY_NAME,
    COL_DBA_NAME,
    COL_EMPLOYER_LICENSE_NUMBER,
    COL_EMPLOYER_NAME,
    COL_LICENSE_EXPIRATION_DATE,
    COL_LICENSE_NUMBER,
    COL_LICENSE_TYPE,
    COL_LICENSEE_NAME,
    COL_ORIGINAL_LICENSE_DATE,
    COL_PRIMARY_STATUS,
    COL_RANK,
    COL_SECONDARY_STATUS,
    COL_STATE,
    COL_STATUS_EFFECTIVE_DATE,
    COL_ZIP,
    INDIVIDUAL_PREFIX,
    MIN_ROW_LEN,
    SWFL_COUNTIES,
)


def parse_dbpr_date(value: str | None) -> str | None:
    """Parse a DBPR MM/DD/YYYY date string to ISO YYYY-MM-DD. None on any failure."""
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return datetime.strptime(text, "%m/%d/%Y").date().isoformat()
    except ValueError:
        return None


def split_licensee_name(raw: str) -> tuple[str | None, str | None, str | None]:
    """Split a DBPR "LAST, FIRST MIDDLE" name into (last, first, middle).

    Title-cases each part. Falls back to (title-cased whole string, None, None) if there's
    no comma (defensive — every individual row observed live has one, but corp/branch rows
    that slip past the individual filter upstream would not).
    """
    if "," not in raw:
        return raw.strip().title(), None, None
    last, _, rest = raw.partition(",")
    last = last.strip().title()
    parts = rest.strip().split()
    if not parts:
        return last, None, None
    first = parts[0].title()
    middle = " ".join(parts[1:]).title() if len(parts) > 1 else None
    return last, first, middle


def normalize_row(row: list[str]) -> dict | None:
    """Normalize one RE_rgn7.csv row to the dbpr_re_licensees table shape.

    Returns None (drop) when: the row is shorter than MIN_ROW_LEN (layout-drift canary at
    the row level), the license type is not an individual agent (COL_LICENSE_TYPE doesn't
    start with "2501 "), or the county is outside Lee/Collier. `email` is always None —
    this pipeline never populates it (see constants.py / migration header).
    """
    if len(row) < MIN_ROW_LEN:
        return None

    license_type = row[COL_LICENSE_TYPE].strip()
    if not license_type.startswith(INDIVIDUAL_PREFIX):
        return None

    county_name = row[COL_COUNTY_NAME].strip()
    if county_name not in SWFL_COUNTIES:
        return None

    licensee_name = row[COL_LICENSEE_NAME].strip()
    last_name, first_name, middle = split_licensee_name(licensee_name)

    return {
        "license_number": row[COL_LICENSE_NUMBER].strip(),
        "alternate_license_number": row[COL_ALTERNATE_LICENSE_NUMBER].strip() or None,
        "licensee_name": licensee_name or None,
        "first_name": first_name,
        "middle": middle,
        "last_name": last_name,
        "dba_name": row[COL_DBA_NAME].strip() or None,
        "rank": row[COL_RANK].strip() or None,
        "license_type": license_type or None,
        "address1": row[COL_ADDRESS1].strip() or None,
        "address2": row[COL_ADDRESS2].strip() or None,
        "address3": row[COL_ADDRESS3].strip() or None,
        "city": row[COL_CITY].strip() or None,
        "state": row[COL_STATE].strip() or None,
        "zip": row[COL_ZIP].strip() or None,
        "county_code": row[COL_COUNTY_CODE].strip() or None,
        "county_name": county_name,
        "primary_status": row[COL_PRIMARY_STATUS].strip() or None,
        "secondary_status": row[COL_SECONDARY_STATUS].strip() or None,
        "original_license_date": parse_dbpr_date(row[COL_ORIGINAL_LICENSE_DATE]),
        "status_effective_date": parse_dbpr_date(row[COL_STATUS_EFFECTIVE_DATE]),
        "license_expiration_date": parse_dbpr_date(row[COL_LICENSE_EXPIRATION_DATE]),
        "employer_name": row[COL_EMPLOYER_NAME].strip() or None,
        "employer_license_number": row[COL_EMPLOYER_LICENSE_NUMBER].strip() or None,
        "email": None,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest ingest/pipelines/dbpr_re_licensees/test_parse.py -v`
Expected: PASS — all tests green (4 date + 4 name-split + 8 kept + 2 edge-case + 3 dropped = 21 tests).

- [ ] **Step 5: Commit**

```bash
git add ingest/pipelines/dbpr_re_licensees/parse.py ingest/pipelines/dbpr_re_licensees/test_parse.py
git commit -m "feat(dbpr-re-licensees): add parse.py with TDD coverage on real sampled rows"
```

---

### Task 4: `pipeline.py` — download, guard, upsert, `--dry-run`

**Files:**
- Create: `ingest/pipelines/dbpr_re_licensees/pipeline.py`

**Interfaces:**
- Consumes: `constants.RE_RGN7_URL`, `constants.FLOOR_TOTAL/FLOOR_LEE/FLOOR_COLLIER`, `parse.normalize_row`, `ingest.lib.guards.assert_min_rows` / `VolumeGuardError`.
- Produces: `run(dry_run: bool) -> int` (row count), `main(argv) -> int` — consumed by Task 5 (GHA workflow) via `python -m ingest.pipelines.dbpr_re_licensees.pipeline [--dry-run]`.

- [ ] **Step 1: Write pipeline.py**

```python
"""DBPR RE licensee (new-agent radar) ingest — weekly Lee/Collier.

Downloads https://www2.myfloridalicense.com/sto/file_download/extracts/RE_rgn7.csv,
filters to Lee/Collier individual agents, and upserts into public.dbpr_re_licensees.
`email` is always NULL from this pipeline — a separate records-request lane fills it later;
the upsert COALESCEs so this pipeline's weekly re-run never clobbers a populated email.

Usage:
    python -m ingest.pipelines.dbpr_re_licensees.pipeline [--dry-run]

Environment:
  DESTINATION__POSTGRES__CREDENTIALS — psycopg3 connection URI (required unless --dry-run)
"""
from __future__ import annotations

import argparse
import csv
import io
import os
import sys
from datetime import date, datetime, timezone

import psycopg
import requests

from ingest.lib.guards import VolumeGuardError, assert_min_rows

from .constants import FLOOR_COLLIER, FLOOR_LEE, FLOOR_TOTAL, RE_RGN7_URL
from .parse import normalize_row

_UA = "Mozilla/5.0 (compatible; SWFL-Data-Gulf/1.0; +https://www.swfldatagulf.com)"


def _stream_csv(url: str, timeout: int = 120) -> list[list[str]]:
    """Download the RE_rgn7.csv extract and return all rows as lists of strings.

    Comma-delimited, double-quoted, no header, BOM-aware (utf-8-sig). Returns [] if the
    server returned HTML instead of CSV (dead link / error page) so the caller aborts loud
    instead of parsing garbage.
    """
    resp = requests.get(url, headers={"User-Agent": _UA}, timeout=timeout)
    resp.raise_for_status()
    text = resp.content.decode("utf-8-sig")
    if text.lstrip().startswith("<"):
        return []
    return list(csv.reader(io.StringIO(text), delimiter=","))


def get_db_conn():
    conn_str = os.environ.get("DESTINATION__POSTGRES__CREDENTIALS")
    if not conn_str:
        raise RuntimeError("DESTINATION__POSTGRES__CREDENTIALS not set.")
    return psycopg.connect(conn_str)


UPSERT_SQL = """
INSERT INTO public.dbpr_re_licensees
  (license_number, alternate_license_number, licensee_name, first_name, middle, last_name,
   dba_name, rank, license_type, address1, address2, address3, city, state, zip,
   county_code, county_name, primary_status, secondary_status,
   original_license_date, status_effective_date, license_expiration_date,
   employer_name, employer_license_number, email,
   source_tag, source_url, as_of_date, first_seen_at, last_seen_at)
VALUES
  (%(license_number)s, %(alternate_license_number)s, %(licensee_name)s, %(first_name)s,
   %(middle)s, %(last_name)s, %(dba_name)s, %(rank)s, %(license_type)s, %(address1)s,
   %(address2)s, %(address3)s, %(city)s, %(state)s, %(zip)s, %(county_code)s,
   %(county_name)s, %(primary_status)s, %(secondary_status)s, %(original_license_date)s,
   %(status_effective_date)s, %(license_expiration_date)s, %(employer_name)s,
   %(employer_license_number)s, %(email)s, %(source_tag)s, %(source_url)s, %(as_of_date)s,
   %(first_seen_at)s, %(last_seen_at)s)
ON CONFLICT (license_number) DO UPDATE SET
  alternate_license_number = EXCLUDED.alternate_license_number,
  licensee_name             = EXCLUDED.licensee_name,
  first_name                = EXCLUDED.first_name,
  middle                    = EXCLUDED.middle,
  last_name                 = EXCLUDED.last_name,
  dba_name                  = EXCLUDED.dba_name,
  rank                      = EXCLUDED.rank,
  license_type              = EXCLUDED.license_type,
  address1                  = EXCLUDED.address1,
  address2                  = EXCLUDED.address2,
  address3                  = EXCLUDED.address3,
  city                      = EXCLUDED.city,
  state                     = EXCLUDED.state,
  zip                       = EXCLUDED.zip,
  county_code               = EXCLUDED.county_code,
  county_name                = EXCLUDED.county_name,
  primary_status             = EXCLUDED.primary_status,
  secondary_status           = EXCLUDED.secondary_status,
  original_license_date      = EXCLUDED.original_license_date,
  status_effective_date      = EXCLUDED.status_effective_date,
  license_expiration_date    = EXCLUDED.license_expiration_date,
  employer_name               = EXCLUDED.employer_name,
  employer_license_number     = EXCLUDED.employer_license_number,
  email                       = COALESCE(EXCLUDED.email, public.dbpr_re_licensees.email),
  source_tag                  = EXCLUDED.source_tag,
  source_url                  = EXCLUDED.source_url,
  as_of_date                  = EXCLUDED.as_of_date,
  last_seen_at                = EXCLUDED.last_seen_at
  -- first_seen_at intentionally NOT updated on conflict (preserves first-seen timestamp)
  -- email_source intentionally NOT touched here — only the (separate) email lane sets it
"""


def run(dry_run: bool = False) -> int:
    run_ts = datetime.now(timezone.utc)
    today = date.today()
    print(f"[dbpr-re-licensees] run_ts={run_ts.isoformat()} dry_run={dry_run}")

    print(f"[dbpr-re-licensees] downloading {RE_RGN7_URL}")
    raw_rows = _stream_csv(RE_RGN7_URL)
    if not raw_rows:
        print("[dbpr-re-licensees] ERROR: empty/HTML response — aborting", file=sys.stderr)
        sys.exit(1)
    print(f"[dbpr-re-licensees] {len(raw_rows)} total rows in extract")

    rows: list[dict] = []
    for raw in raw_rows:
        parsed = normalize_row(raw)
        if parsed is None:
            continue
        parsed["source_tag"] = "dbpr_re_rgn7"
        parsed["source_url"] = RE_RGN7_URL
        parsed["as_of_date"] = today
        parsed["first_seen_at"] = run_ts
        parsed["last_seen_at"] = run_ts
        rows.append(parsed)

    lee = sum(1 for r in rows if r["county_name"] == "Lee")
    collier = sum(1 for r in rows if r["county_name"] == "Collier")
    print(f"[dbpr-re-licensees] kept {len(rows)} Lee/Collier individual rows "
          f"(Lee {lee} / Collier {collier})")

    try:
        assert_min_rows(len(rows), FLOOR_TOTAL, "dbpr_re_licensees:total")
        assert_min_rows(lee, FLOOR_LEE, "dbpr_re_licensees:lee")
        assert_min_rows(collier, FLOOR_COLLIER, "dbpr_re_licensees:collier")
    except VolumeGuardError as exc:
        print(f"[dbpr-re-licensees] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    if dry_run:
        print(f"[dbpr-re-licensees] dry-run: would upsert {len(rows)} rows")
        if rows:
            print(f"  sample: {rows[0]}")
        return len(rows)

    with get_db_conn() as conn:
        with conn.cursor() as cur:
            for row in rows:
                cur.execute(UPSERT_SQL, row)
        conn.commit()

    print(f"[dbpr-re-licensees] upserted {len(rows)} rows")
    return len(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="DBPR RE licensee (new-agent radar) ingest.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch and validate only; skip all DB writes.")
    args = parser.parse_args(argv)
    run(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Write the dry-run smoke test**

```python
# ingest/pipelines/dbpr_re_licensees/test_dry_run.py
"""Dry-run smoke test — mocks the network fetch, exercises the real filter/guard/print path
without hitting DBPR or the DB. Live-file verification happens in Task 7."""
from unittest.mock import patch

from .test_parse import AARNIO_LEE, AARON_COLLIER


def _fake_rows():
    # 9,000 Lee + 6,000 Collier synthetic-but-shaped rows to clear the volume floors,
    # built by varying the license_number on the two real fixture rows.
    rows = []
    for i in range(9_000):
        row = list(AARNIO_LEE)
        row[13] = f"L{i}"
        rows.append(row)
    for i in range(6_000):
        row = list(AARON_COLLIER)
        row[13] = f"C{i}"
        rows.append(row)
    return rows


def test_dry_run_reports_count_and_skips_db():
    with patch(
        "ingest.pipelines.dbpr_re_licensees.pipeline._stream_csv",
        return_value=_fake_rows(),
    ), patch("ingest.pipelines.dbpr_re_licensees.pipeline.get_db_conn") as mock_conn:
        from ingest.pipelines.dbpr_re_licensees.pipeline import main

        result = main(["--dry-run"])

    assert result == 0
    mock_conn.assert_not_called()


def test_volume_guard_aborts_on_collapse():
    with patch(
        "ingest.pipelines.dbpr_re_licensees.pipeline._stream_csv",
        return_value=[AARNIO_LEE],  # 1 row — far below FLOOR_TOTAL
    ):
        from ingest.pipelines.dbpr_re_licensees.pipeline import main

        try:
            main(["--dry-run"])
            raised = False
        except SystemExit as exc:
            raised = exc.code == 1
    assert raised
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pytest ingest/pipelines/dbpr_re_licensees/ -v`
Expected: PASS — all `test_parse.py` tests plus both `test_dry_run.py` tests green.

- [ ] **Step 4: Commit**

```bash
git add ingest/pipelines/dbpr_re_licensees/pipeline.py ingest/pipelines/dbpr_re_licensees/test_dry_run.py
git commit -m "feat(dbpr-re-licensees): add pipeline.py (download, guard, upsert, --dry-run)"
```

---

### Task 5: GHA workflow — weekly cron

**Files:**
- Create: `.github/workflows/ingest-dbpr-re-licensees.yml`

**Interfaces:**
- Consumes: `python -m ingest.pipelines.dbpr_re_licensees.pipeline [--dry-run]` (Task 4).
- Produces: satisfies `ingest/tests/test_pipeline_drift.py::test_pipeline_has_workflow` for `dbpr_re_licensees`.

- [ ] **Step 1: Write the workflow**

```yaml
name: DBPR RE Licensees (New-Agent Radar) — Weekly

on:
  schedule:
    # Monday 12:00 UTC — weekly, staggered after the existing Monday DBPR cluster
    # (rebuild 06:00, dbpr-press-releases 09:00, dbpr-public-notices 10:00, lee-permits 11:00).
    # See docs/standards/pipeline-freshness.md §3.
    - cron: "0 12 * * 1"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Dry run — fetch and validate only; skip DB writes"
        required: false
        default: "false"

permissions:
  contents: read

jobs:
  ingest:
    if: ${{ vars.ENGINE_ENABLED != 'false' || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Python
        uses: actions/setup-python@v6
        with:
          python-version: "3.13"

      - name: Install ingest dependencies
        run: pip install -r ingest/requirements.txt

      - name: Run dbpr_re_licensees pipeline
        env:
          DESTINATION__POSTGRES__CREDENTIALS: ${{ secrets.DESTINATION__POSTGRES__CREDENTIALS }}
        run: |
          if [ "${{ github.event.inputs.dry_run }}" = "true" ]; then
            python -m ingest.pipelines.dbpr_re_licensees.pipeline --dry-run
          else
            python -m ingest.pipelines.dbpr_re_licensees.pipeline
          fi
```

- [ ] **Step 2: Run the drift-guard test**

Run: `pytest ingest/tests/test_pipeline_drift.py -v -k dbpr_re_licensees`
Expected: PASS (workflow found by module-reference search, `workflow_dispatch:` present, `DESTINATION__POSTGRES__CREDENTIALS` present).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ingest-dbpr-re-licensees.yml
git commit -m "feat(dbpr-re-licensees): add weekly GHA cron (Monday 12:00 UTC)"
```

---

### Task 6: cadence_registry + pipeline-freshness doc

**Files:**
- Modify: `ingest/cadence_registry.yaml` (append new entry, alphabetical/logical placement near the other `dbpr_*` entries)
- Modify: `docs/standards/pipeline-freshness.md` (append row to the §3 cron table)

**Interfaces:**
- Consumes: `FLOOR_TOTAL = 15_000` (Task 2) as `expected_rows_min`.

- [ ] **Step 1: Append the cadence_registry entry**

Insert after the `dbpr_public_notices` entry (found via `Grep -n "name: dbpr_public_notices" ingest/cadence_registry.yaml` — currently line 1085; re-check the line number before inserting, other sessions may have appended entries since):

```yaml
  - name: dbpr_re_licensees
    lane: tier-2
    cadence_days: 7
    tolerance_multiplier: 3.0
    freshness_table: public.dbpr_re_licensees
    freshness_column: last_seen_at # non-dlt table; last_seen_at bumped every run (merge, not replace)
    expected_rows_min: 15000 # ~50% of the 30,100 kept rows observed live 07/10/2026 (Lee 18,015 / Collier 12,085)
    # Non-dlt pipeline — freshness checked via MAX(last_seen_at) on the table directly.
    # Source: FL DBPR RE_rgn7.csv weekly extract (www2.myfloridalicense.com).
    # SWFL scope: Lee + Collier only (individual agents, license_type "2501 ...").
    # Cron: Monday 12:00 UTC via ingest-dbpr-re-licensees.yml.
    # Consuming surface: outreach (public.new_re_agents view) — NOT a brain, no answer-engine gate.
    # First run: <fill in after Task 7's live run>.
    note: "Feeds the new-agent outreach radar (docs/superpowers/specs/2026-07-11-new-agent-radar-design.md). email column always NULL from this pipeline — populated later by a separate Chapter 119 records-request lane."
    source_scope:
      confirmed_total:
        summary: "license_number, name (raw + split), address, county, license_type, rank, status, original/effective/expiration dates, employer name+license, alternate_license_number — Lee+Collier individual RE agents only"
        source: "our ingest"
      source_ceiling:
        summary: "No email or phone anywhere in RE_rgn7.csv (verified: 23 columns, mailing address only). The DBPR online license-detail lookup also does not render email (verified live 07/10/2026 browser check) — email is public record but only obtainable via a Chapter 119 records request, tracked outside this pipeline."
        as_of: "07/10/2026"
        source_url: "https://www2.myfloridalicense.com/sto/file_download/extracts/RE_rgn7.csv"
        source_label: "FL DBPR Real Estate Region 7 licensee bulk extract"
```

- [ ] **Step 2: Append the pipeline-freshness.md §3 row**

In the table under `## 3. Cron-Picking Rules`, add a row (placed with the other Monday entries):

```markdown
| Mondays 12:00                 | `ingest-dbpr-re-licensees.yml` | weekly                | RE_rgn7.csv weekly refresh; staggered after the 06:00/09:00/10:00/11:00 Monday cluster |
```

- [ ] **Step 3: Commit**

```bash
git add ingest/cadence_registry.yaml docs/standards/pipeline-freshness.md
git commit -m "feat(dbpr-re-licensees): register weekly cadence + cron slot"
```

---

### Task 7: Live verification — dry-run, then first live run

**Files:** none (verification only; may fill in the `# First run:` comment left in Task 6's cadence entry as a follow-up commit).

**Interfaces:** none — this task closes the `new_agent_radar_live_verify` check.

- [ ] **Step 1: Live dry-run against the real file**

Run: `python -m ingest.pipelines.dbpr_re_licensees.pipeline --dry-run`
Expected: no crash; log line `[dbpr-re-licensees] kept <N> Lee/Collier individual rows (Lee <L> / Collier <C>)` with N in the neighborhood of 30,100 (Lee ~18,015 / Collier ~12,085 — the file changes slightly week to week, so exact match isn't required, but N should clear `FLOOR_TOTAL=15,000` and both counties should clear their floors). If the guard raises `VolumeGuardError`, STOP — do not proceed to a live run; investigate the layout (re-run the Task 1-era byte-range curl check) before touching the table.

- [ ] **Step 2: First live run**

Run: `DESTINATION__POSTGRES__CREDENTIALS="$(...)" python -m ingest.pipelines.dbpr_re_licensees.pipeline`

(Pull the connection string the same way `scripts/run-migration.ts` does — from `.dlt/secrets.toml` — or export it from your shell env if already set for this session.)

Expected: `[dbpr-re-licensees] upserted <N> rows` matching the dry-run count.

- [ ] **Step 3: Verify live in Postgres**

```bash
bun -e '
const secrets = await Bun.file(".dlt/secrets.toml").text();
const t = (k) => secrets.match(new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, "m"))[1];
const url = `postgres://${t("username")}:${encodeURIComponent(t("password"))}@${t("host")}:5432/${t("database")}?sslmode=require`;
const sql = new Bun.SQL(url);
console.log("total:", await sql`SELECT count(*) FROM public.dbpr_re_licensees`);
console.log("by county:", await sql`SELECT county_name, count(*) FROM public.dbpr_re_licensees GROUP BY 1`);
console.log("new (90d):", await sql`SELECT count(*) FROM public.new_re_agents`);
console.log("email non-null:", await sql`SELECT count(*) FROM public.dbpr_re_licensees WHERE email IS NOT NULL`);
await sql.end();
'
```
Expected: total ≈ dry-run count; `by county` shows both Lee and Collier; `new (90d)` is small (real count observed 07/10/2026 was 309 — order of magnitude, not exact, since the file advances daily); `email non-null` is exactly `0` (this pipeline never sets it).

- [ ] **Step 4: Backfill the cadence_registry `# First run:` comment**

Edit `ingest/cadence_registry.yaml`'s `dbpr_re_licensees` entry, replacing `# First run: <fill in after Task 7's live run>.` with the real date and counts observed in Step 3 (e.g. `# First run: 2026-07-11 (N total, Lee L / Collier C).`).

```bash
git add ingest/cadence_registry.yaml
git commit -m "chore(dbpr-re-licensees): record first live run counts"
```

- [ ] **Step 5: Close the check and log**

```bash
node scripts/check.mjs close new_agent_radar_live_verify
```

Append a `SESSION_LOG.md` entry (per RULE 0, before the eventual push) summarizing: pipeline built + first live run counts, `new_re_agents` view live, email column confirmed empty (records-request lane still separate/unbuilt).

---

## Self-Review Notes

- **Spec coverage:** Problem/Goal → Task 1 (table) + Task 4 (pipeline); Sources (23-col layout) → Task 2 (constants); Decisions 1-5 → Task 2 (individual/county filters), Task 1 (email nullable + `public.*` placement); Data flow steps 1-5 → Task 4; Table shape → Task 1; "New agent" access → Task 1 view; Error handling → Task 4 guards; Testing → Task 3 unit tests + Task 4 dry-run smoke; Cadence/freshness → Task 5 + Task 6.
- **Placeholder scan:** the only intentionally-deferred value is the cadence_registry `# First run:` comment, which Task 7 Step 4 explicitly fills in with real observed numbers before commit — not left as TBD.
- **Type consistency:** `normalize_row` (Task 3) returns a dict whose keys are consumed verbatim by `UPSERT_SQL`'s `%(...)s` placeholders (Task 4) — checked field-by-field against the Task 1 table DDL column list.
