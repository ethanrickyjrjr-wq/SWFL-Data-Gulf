# DBPR SIRS Submissions — Ingest Pipeline + Pack

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax. Work on branch `feat/dbpr-sirs-submissions`. One PR. Brain-first gate applies — pack ships in the same PR as the pipeline.

**Session:** 2026-06-01 (Sonnet 4.6)  
**Status:** DDL LIVE in Supabase. Pipeline + pack + GHA not yet written.

---

## What's already done (do not redo)

- Table `data_lake.dbpr_sirs_submissions` is live in Supabase — 14 columns, 4 indexes.
- DDL on disk: `docs/sql/20260601_dbpr_sirs_submissions.sql` (idempotent; safe to re-run).
- **Do not** run `DROP TABLE` or alter the schema — the column list was locked after a full probe session.

### Locked column list (verified 2026-06-01)

| Column              | Type        | Nullable | Notes                                                         |
| ------------------- | ----------- | -------- | ------------------------------------------------------------- |
| `id`                | bigint      | NO       | identity PK                                                   |
| `database_period`   | text        | NO       | `'pre_july_2025'` \| `'july_2025_plus'`                       |
| `row_hash`          | text        | NO       | dedup key for July 2025+ rows (no ID column in that schema)   |
| `project_type`      | text        | YES      | present in pre-July only (`CONDOMINIUM` / `COOPERATIVE`)      |
| `project_name`      | text        | YES      |                                                               |
| `association_name`  | text        | YES      |                                                               |
| `city`              | text        | YES      |                                                               |
| `zip`               | text        | YES      | raw as submitted; inconsistent formatting                     |
| `county`            | text        | YES      | raw as submitted (mixed case: `LEE`, `Lee`, `MIAMI-DADE`)     |
| `county_normalized` | text        | YES      | always uppercase — use this for WHERE filters                 |
| `dbpr_id`           | text        | YES      | 6-digit DBPR integer string; **null for all July 2025+ rows** |
| `result_truncated`  | boolean     | NO       | `true` when "Load more" detected at scrape end                |
| `scraped_at`        | timestamptz | NO       |                                                               |
| `created_at`        | timestamptz | NO       |                                                               |

---

## Source reality (probe findings — read before writing any code)

Two separate Qlik Sense apps, different schemas:

| App           | URL appid                              | Columns                                                             | SWFL rows visible   | Has ID?                 |
| ------------- | -------------------------------------- | ------------------------------------------------------------------- | ------------------- | ----------------------- |
| Pre-July 2025 | `14f1ed21-7b21-4272-af14-9eaad7911440` | Project Type, Project Name, Association Name, City, Zip, County, ID | LEE=3, COLLIER=6    | ✅ 6-digit DBPR integer |
| July 2025+    | `d217126f-2edc-408b-bb98-2c355b6f0429` | Project Name, Association Name, City, Zip Code, County              | LEE=90, COLLIER=181 | ❌ none                 |

**Extraction approach (confirmed working):**

- Firecrawl scrape each app URL with `--wait-for 15000`
- Parse the markdown table — data lands in DOM, not canvas
- Filter to `county_normalized IN ('LEE', 'COLLIER')` in Python
- Set `result_truncated = True` when the string `"Load more"` appears in the scraped markdown

**URL-based county pre-filter (`select=County,LEE`) does not work** — Qlik ignores it. Filter in Python after scrape.

**Hypercube limit:** The statewide set exceeds Qlik's render threshold. A 15s wait gets ~1,774 rows for July 2025+ and ~1,208 for pre-July before the limit fires. Lee + Collier rows within that window: 9 (pre-July) and 271 (July 2025+). Rows beyond the limit are missed — hence `result_truncated`.

**Completion semantics:** Presence in the table = SIRS submitted and accepted by DBPR. Per DBPR's own disclosure: _"Only complete submissions of the SIRS Reporting Form are displayed."_ No status column exists. Every row is complete.

**Absence detection is out of scope** — this is a positive-signal-only dataset. Without a baseline registry of all Lee + Collier 3-story+ condos, you cannot derive who has NOT filed. Do not add `is_sirs_complete` or absence-detection logic.

**Data quality issues in source (handle gracefully, don't reject rows):**

- Some Lee County rows show Collier/Naples zip codes (county mismatch — data entry by association)
- Some zips are malformed: `"FL"`, `"4119"`, `"NAPLES 34103"`
- July 2025+ uses mixed case city names (`naples`, `Fort Myers`, `FT. MYERS`)

---

## File structure

| File                                      | Responsibility                        | Create/Modify |
| ----------------------------------------- | ------------------------------------- | ------------- |
| `ingest/pipelines/dbpr_sirs/__init__.py`  | package marker                        | Create        |
| `ingest/pipelines/dbpr_sirs/pipeline.py`  | scrape → parse → filter → upsert      | Create        |
| `refinery/sources/dbpr-sirs-source.mts`   | typed Supabase query for the pack     | Create        |
| `refinery/packs/condo-sirs-swfl.mts`      | leaf brain — SIRS confirmation counts | Create        |
| `refinery/packs/condo-sirs-swfl.test.mts` | pack unit tests                       | Create        |
| `refinery/packs/index.mts`                | register condo-sirs-swfl              | Modify        |
| `refinery/vocab/brain-vocabulary.json`    | add metric vocab slugs                | Modify        |
| `.github/workflows/dbpr-sirs-monthly.yml` | monthly cron + `--dry-run`            | Create        |
| `ingest/cadence_registry.yaml`            | add `dbpr_sirs_submissions` entry     | Modify        |

**Branch:** `feat/dbpr-sirs-submissions` — do NOT work on `main`.

---

## Task 1: Pipeline

**File:** `ingest/pipelines/dbpr_sirs/pipeline.py`

- [ ] **Step 1: Write scraper + parser**

```python
#!/usr/bin/env python3
"""DBPR SIRS Submissions ingest — SWFL monthly.

Usage:
    python -m ingest.pipelines.dbpr_sirs.pipeline [--dry-run]

Scrapes the two DBPR SIRS Qlik apps (pre-July 2025 and July 2025+),
filters to Lee + Collier counties, and upserts into data_lake.dbpr_sirs_submissions.

Extraction notes:
- URL-based county pre-filter does not work; filter in Python after scrape.
- 15s wait needed for Qlik to render rows into DOM.
- result_truncated=True when "Load more" still visible at scrape end (hypercube limit fired).
- July 2025+ schema has no ID column; row_hash is the dedup key.
- row_hash = SHA256(project_name + '|' + association_name + '|' + zip + '|' + county)
"""
import argparse
import hashlib
import json
import os
import subprocess
import re
import sys
from datetime import datetime, timezone

import psycopg

SWFL_COUNTIES = {'LEE', 'COLLIER'}

APPS = [
    {
        'period': 'pre_july_2025',
        'appid': '14f1ed21-7b21-4272-af14-9eaad7911440',
        'sheet': 'mcprvJW',
        'has_id': True,
    },
    {
        'period': 'july_2025_plus',
        'appid': 'd217126f-2edc-408b-bb98-2c355b6f0429',
        'sheet': 'HUGAcyE',
        'has_id': False,
    },
]

BASE_URL = 'https://dbpr-publicrecords.myfloridalicense.com/qpr/single/'


def firecrawl_scrape(url: str, wait_ms: int = 15000) -> str:
    result = subprocess.run(
        ['firecrawl', 'scrape', url, '--format', 'markdown', '--wait-for', str(wait_ms)],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Firecrawl failed for {url}: {result.stderr[:300]}")
    return result.stdout


def row_hash(project_name: str, association_name: str, zip_: str, county: str) -> str:
    raw = '|'.join([
        (project_name or '').strip().upper(),
        (association_name or '').strip().upper(),
        (zip_ or '').strip(),
        (county or '').strip().upper(),
    ])
    return hashlib.sha256(raw.encode()).hexdigest()


def normalize_county(raw: str) -> str | None:
    if not raw:
        return None
    return raw.strip().upper()


def parse_pre_july_rows(markdown: str) -> list[dict]:
    """Parse table rows from pre-July 2025 app.
    Columns: Project Type | (empty) | Project Name | (empty) | Association Name
             | (empty) | City | (empty) | Zip | (empty) | County | (empty) | ID | (empty) | (empty)
    """
    rows = []
    for line in markdown.splitlines():
        if not (line.startswith('| CONDOMINIUM') or line.startswith('| COOPERATIVE')):
            continue
        parts = [p.strip() for p in line.split('|')]
        parts = [p for p in parts if p != '']
        if len(parts) < 7:
            continue
        rows.append({
            'project_type': parts[0] if len(parts) > 0 else None,
            'project_name': parts[1] if len(parts) > 1 else None,
            'association_name': parts[2] if len(parts) > 2 else None,
            'city': parts[3] if len(parts) > 3 else None,
            'zip': parts[4] if len(parts) > 4 else None,
            'county': parts[5] if len(parts) > 5 else None,
            'dbpr_id': parts[6] if len(parts) > 6 else None,
        })
    return rows


def parse_july_plus_rows(markdown: str) -> list[dict]:
    """Parse table rows from July 2025+ app.
    Columns: Project Name | (empty) | Association Name | (empty) | City
             | (empty) | Zip Code | (empty) | County | (empty) | (empty)
    Rows start with '| ' followed by a non-header value (not 'Project Name').
    """
    rows = []
    in_table = False
    for line in markdown.splitlines():
        if '| Project Name |' in line:
            in_table = True
            continue
        if not in_table:
            continue
        if line.startswith('| ---'):
            continue
        if not line.startswith('| '):
            in_table = False
            continue
        parts = [p.strip() for p in line.split('|')]
        parts = [p for p in parts if p != '']
        if len(parts) < 5:
            continue
        rows.append({
            'project_type': None,
            'project_name': parts[0] if len(parts) > 0 else None,
            'association_name': parts[1] if len(parts) > 1 else None,
            'city': parts[2] if len(parts) > 2 else None,
            'zip': parts[3] if len(parts) > 3 else None,
            'county': parts[4] if len(parts) > 4 else None,
            'dbpr_id': None,
        })
    return rows


def get_db_conn():
    import tomllib
    secrets_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', '.dlt', 'secrets.toml')
    with open(secrets_path, 'rb') as f:
        s = tomllib.load(f)
    c = s['destination']['postgres']['credentials']
    return psycopg.connect(
        f"postgresql://{c['username']}:{c['password']}@{c['host']}:{c.get('port', 5432)}/{c['database']}"
    )


UPSERT_SQL = """
INSERT INTO data_lake.dbpr_sirs_submissions
  (database_period, row_hash, project_type, project_name, association_name,
   city, zip, county, county_normalized, dbpr_id, result_truncated, scraped_at)
VALUES
  (%(database_period)s, %(row_hash)s, %(project_type)s, %(project_name)s, %(association_name)s,
   %(city)s, %(zip)s, %(county)s, %(county_normalized)s, %(dbpr_id)s,
   %(result_truncated)s, %(scraped_at)s)
ON CONFLICT (row_hash, database_period) DO UPDATE SET
  project_type       = EXCLUDED.project_type,
  project_name       = EXCLUDED.project_name,
  association_name   = EXCLUDED.association_name,
  city               = EXCLUDED.city,
  zip                = EXCLUDED.zip,
  county             = EXCLUDED.county,
  county_normalized  = EXCLUDED.county_normalized,
  dbpr_id            = COALESCE(EXCLUDED.dbpr_id, data_lake.dbpr_sirs_submissions.dbpr_id),
  result_truncated   = EXCLUDED.result_truncated,
  scraped_at         = EXCLUDED.scraped_at
"""


def run(dry_run: bool = False):
    run_ts = datetime.now(timezone.utc)
    print(f"[dbpr-sirs] run_ts={run_ts.isoformat()} dry_run={dry_run}")

    all_rows = []

    for app in APPS:
        url = (
            f"{BASE_URL}?appid={app['appid']}"
            f"&sheet={app['sheet']}&opt=ctxmenu"
        )
        print(f"[dbpr-sirs] scraping {app['period']}: {url}")
        try:
            markdown = firecrawl_scrape(url, wait_ms=15000)
        except RuntimeError as e:
            print(f"[dbpr-sirs] ERROR scraping {app['period']}: {e}")
            continue

        truncated = 'Load more' in markdown
        if truncated:
            print(f"[dbpr-sirs] WARNING: {app['period']} hit hypercube limit — result_truncated=True")

        rows = (
            parse_pre_july_rows(markdown)
            if app['has_id']
            else parse_july_plus_rows(markdown)
        )

        swfl_rows = [
            r for r in rows
            if normalize_county(r.get('county')) in SWFL_COUNTIES
        ]
        print(f"[dbpr-sirs] {app['period']}: {len(rows)} total rows, {len(swfl_rows)} SWFL")

        for r in swfl_rows:
            cn = normalize_county(r['county'])
            h = row_hash(r['project_name'], r['association_name'], r['zip'], r['county'])
            all_rows.append({
                **r,
                'database_period': app['period'],
                'row_hash': h,
                'county_normalized': cn,
                'result_truncated': truncated,
                'scraped_at': run_ts,
            })

    if dry_run:
        print(f"[dbpr-sirs] dry-run: would upsert {len(all_rows)} rows")
        for r in all_rows:
            print(f"  {r['database_period']} | {r['county_normalized']} | "
                  f"{r['association_name']} | {r['city']} | id={r['dbpr_id']}")
        return

    if not all_rows:
        print("[dbpr-sirs] no SWFL rows found — check Firecrawl output above")
        sys.exit(1)

    with get_db_conn() as conn:
        with conn.cursor() as cur:
            for row in all_rows:
                cur.execute(UPSERT_SQL, row)
        conn.commit()

    print(f"[dbpr-sirs] upserted {len(all_rows)} rows")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    run(dry_run=args.dry_run)
```

- [ ] **Step 2: Create `ingest/pipelines/dbpr_sirs/__init__.py`** (empty)

- [ ] **Step 3: Dry-run test** — `python -m ingest.pipelines.dbpr_sirs.pipeline --dry-run`
  - Expect ≥3 SWFL rows printed (probe found 9 pre-July, 271 July+)
  - Expect `result_truncated=True` for both apps (hypercube limit fires statewide)
  - Expect no DB writes

- [ ] **Step 4: Live run** — `python -m ingest.pipelines.dbpr_sirs.pipeline`
  - Verify: `SELECT database_period, county_normalized, COUNT(*) FROM data_lake.dbpr_sirs_submissions GROUP BY 1,2 ORDER BY 1,2;`
  - Expect: pre_july_2025/LEE=3, pre_july_2025/COLLIER=6, july_2025_plus/LEE≥90, july_2025_plus/COLLIER≥181

---

## Task 2: Source file

**File:** `refinery/sources/dbpr-sirs-source.mts`

- [ ] **Step 1: Write typed Supabase source**

```typescript
import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.mts";
import type { RawFragment } from "../types/fragment.mts";

export interface DbprSirsRow {
  database_period: string;
  project_name: string | null;
  association_name: string | null;
  city: string | null;
  zip: string | null;
  county_normalized: string | null;
  dbpr_id: string | null;
  result_truncated: boolean;
  scraped_at: string;
}

export async function fetchDbprSirsRows(): Promise<DbprSirsRow[]> {
  const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey);
  const { data, error } = await supabase
    .from("dbpr_sirs_submissions")
    .select(
      "database_period,project_name,association_name,city,zip,county_normalized,dbpr_id,result_truncated,scraped_at",
    )
    .schema("data_lake")
    .in("county_normalized", ["LEE", "COLLIER"])
    .order("database_period", { ascending: true })
    .order("association_name", { ascending: true });

  if (error) throw new Error(`dbpr-sirs fetch error: ${error.message}`);
  return (data ?? []) as DbprSirsRow[];
}

export const dbprSirsSource = {
  id: "dbpr_sirs_submissions",
  fetch: fetchDbprSirsRows,
} as const;
```

---

## Task 3: Pack

**File:** `refinery/packs/condo-sirs-swfl.mts`

Signal: counts of SWFL condo/co-op associations that have confirmed SIRS submission to DBPR.
This is a **positive-signal-only** pack — presence = filed, absence has no meaning without a baseline registry.
Direction is neutral/informational; leaf brain; fully deterministic.

- [ ] **Step 1: Write pack**

Key metrics to produce:

- `sirs_confirmed_swfl` — total Lee + Collier associations confirmed
- `sirs_lee_count` — Lee County only
- `sirs_collier_count` — Collier County only
- `sirs_july2025_plus_count` — from HB 913 compliance push (July 2025+ app)
- `sirs_result_truncated` — boolean; true if either app hit hypercube limit this run

Vocab slugs to register in `brain-vocabulary.json` (add all five):

```
sirs_confirmed_swfl
sirs_lee_count
sirs_collier_count
sirs_july2025_plus_count
sirs_result_truncated
```

PackDefinition shape (follow `econ-dev-swfl.mts` as the template):

```typescript
export const condoSirsSwfl: PackDefinition = {
  id: "condo-sirs-swfl",
  brain_id: "condo-sirs-swfl",
  domain: "regulatory",
  scope:
    "SWFL condominium and cooperative associations that have confirmed Structural Integrity Reserve Study (SIRS) submission to DBPR. Lee + Collier counties. Source: DBPR SIRS Reporting Database (two Qlik apps: pre-July 2025 and July 2025+ submissions). Monthly scrape. Positive signal only — presence = confirmed; absence has no meaning without a baseline registry.",
  ttl_seconds: 2592000, // 30 days — monthly ingest cadence

  sources: [dbprSirsSource],
  input_brains: [],

  fitScore: () => 0.6,
  compositeCutoff: 0,
  skipTriageAgent: true,
  skipSynthesisAgent: true,
  synthesisStrategy: "deterministic",
  // ...
};
```

- [ ] **Step 2: Register in `refinery/packs/index.mts`** — add `condoSirsSwfl` import + export
- [ ] **Step 3: Add vocab slugs** to `refinery/vocab/brain-vocabulary.json` (5 slugs)
- [ ] **Step 4: Write `condo-sirs-swfl.test.mts`** — unit test the outputProducer with fixture rows

---

## Task 4: GHA workflow

**File:** `.github/workflows/dbpr-sirs-monthly.yml`

- [ ] **Step 1: Write workflow**

```yaml
name: DBPR SIRS Submissions — Monthly SWFL

on:
  schedule:
    - cron: "0 7 1-7 * 1" # first Monday of month, 07:00 UTC
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Dry run (no DB writes)"
        required: false
        default: "false"

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"

      - name: Install Python deps
        run: pip install psycopg[binary] tomli

      - name: Install Firecrawl CLI
        run: npm install -g @mendableai/firecrawl-cli

      - name: Configure Firecrawl
        run: firecrawl config:set --api-key "${{ secrets.FIRECRAWL_API_KEY }}"

      - name: Run ingest
        env:
          FIRECRAWL_API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}
        run: |
          DRY_RUN_FLAG=""
          if [ "${{ github.event.inputs.dry_run }}" = "true" ]; then
            DRY_RUN_FLAG="--dry-run"
          fi
          python -m ingest.pipelines.dbpr_sirs.pipeline $DRY_RUN_FLAG
```

---

## Task 5: Cadence registry

**File:** `ingest/cadence_registry.yaml`

- [ ] **Step 1: Add entry** (non-dlt, tier-2 section)

```yaml
- name: dbpr_sirs_submissions
  lane: tier-2
  cadence_days: 30
  tolerance_multiplier: 2.0
  freshness_table: data_lake.dbpr_sirs_submissions
  expected_rows_min: 50 # floor at 50; Lee+Collier from July 2025+ alone is 271+
  # Non-dlt pipeline — freshness via MAX(scraped_at) on the table.
  # Source: DBPR SIRS Reporting Database (two Qlik apps).
  # Coverage: Lee + Collier counties (statewide scrape, Python filter).
  # truncation_risk: true — Qlik hypercube limit may exclude rows near sort tail.
  #   result_truncated flag on each row records whether limit fired for that run.
  # Cron: first Monday of month 07:00 UTC via dbpr-sirs-monthly.yml.
  # Consuming brain: condo-sirs-swfl (ships in same PR as this pipeline).
  # Positive signal only — presence = confirmed SIRS; absence has no meaning.
```

---

## Acceptance criteria

- [ ] `python -m ingest.pipelines.dbpr_sirs.pipeline --dry-run` exits 0, prints ≥50 SWFL rows
- [ ] Live run upserts rows; verify with:
  ```sql
  SELECT database_period, county_normalized, COUNT(*), BOOL_OR(result_truncated) as truncated
  FROM data_lake.dbpr_sirs_submissions
  GROUP BY 1,2 ORDER BY 1,2;
  ```
  Expected: pre_july_2025/LEE=3, pre_july_2025/COLLIER=6, july_2025_plus/LEE≥90, july_2025_plus/COLLIER≥181
- [ ] Re-run is idempotent — row count does not increase on second run
- [ ] `result_truncated` is `true` on all rows from both apps (hypercube limit expected statewide)
- [ ] Pre-July rows have non-null `dbpr_id`; July 2025+ rows have null `dbpr_id`
- [ ] `county_normalized` is uppercase for all rows
- [ ] Pack `condo-sirs-swfl` builds without typecheck errors
- [ ] 5 vocab slugs present in `brain-vocabulary.json`
- [ ] Cadence registry entry present
- [ ] GHA `workflow_dispatch` dry-run succeeds in CI before merge
