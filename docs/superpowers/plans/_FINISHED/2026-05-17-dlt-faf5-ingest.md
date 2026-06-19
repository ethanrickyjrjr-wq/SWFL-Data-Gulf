# FAF5 dlt Ingest Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 8 files, keywords: schema, architecture

**Goal:** Build a three-resource dlt pipeline that downloads FAF5 freight flow data from ORNL, filters to Florida-zone rows, and writes `faf_flows`, `faf_zone_lookup`, and `faf_sctg_lookup` into the `data_lake` dataset on Supabase Postgres.

**Architecture:** Standalone Python package at `ingest/` — zero imports from the TypeScript refinery. Three `@dlt.resource` functions (flows + two lookup tables) run inside one `dlt.pipeline()` call with `replace` write disposition. dlt handles all Postgres writes; no custom loader code. All commands run from the `brain-platform/` root so `ingest` is importable as a package.

**Tech Stack:** Python 3.14, dlt 1.26.0 with postgres extra, requests, pytest

---

## File Map

| File                                            | Purpose                                              |
| ----------------------------------------------- | ---------------------------------------------------- |
| `ingest/__init__.py`                            | Makes ingest a top-level package                     |
| `ingest/pipelines/__init__.py`                  | Sub-package                                          |
| `ingest/pipelines/faf5/__init__.py`             | Sub-package                                          |
| `ingest/pipelines/faf5/constants.py`            | FL zone IDs, SCTG codes, download URL, year list     |
| `ingest/pipelines/faf5/resources.py`            | Three `@dlt.resource` functions                      |
| `ingest/pipelines/faf5/pipeline.py`             | `dlt.pipeline()` entry point                         |
| `ingest/requirements.txt`                       | Python dependencies                                  |
| `.dlt/config.toml`                              | pipeline_name, dataset_name (committed)              |
| `.dlt/secrets.toml`                             | Supabase credentials (gitignored)                    |
| `ingest/tests/__init__.py`                      | Makes tests a package                                |
| `ingest/tests/pipelines/__init__.py`            | Sub-package                                          |
| `ingest/tests/pipelines/faf5/__init__.py`       | Sub-package                                          |
| `ingest/tests/pipelines/faf5/test_resources.py` | Unit tests — filtering, type coercion, lookup tables |

---

## Task 1: Scaffold + gitignore + config

**Files:**

- Create: all `__init__.py` files above
- Create: `ingest/requirements.txt`
- Create: `.dlt/config.toml`
- Create: `.dlt/secrets.toml` (template, gitignored)
- Modify: `.gitignore`

- [ ] **Step 1: Create directory tree**

```bash
mkdir -p ingest/pipelines/faf5
mkdir -p ingest/tests/pipelines/faf5
mkdir -p .dlt
```

- [ ] **Step 2: Create all empty `__init__.py` files**

Create these six files, each empty:

- `ingest/__init__.py`
- `ingest/pipelines/__init__.py`
- `ingest/pipelines/faf5/__init__.py`
- `ingest/tests/__init__.py`
- `ingest/tests/pipelines/__init__.py`
- `ingest/tests/pipelines/faf5/__init__.py`

- [ ] **Step 3: Write `ingest/requirements.txt`**

```
dlt[postgres]>=1.26.0
requests>=2.31.0
pytest>=8.0.0
```

- [ ] **Step 4: Write `.dlt/config.toml`**

```toml
[pipeline]
pipeline_name = "faf5"
dataset_name = "data_lake"
```

- [ ] **Step 5: Write `.dlt/secrets.toml` — template only, fill in before running**

```toml
# Fill in your Supabase Postgres credentials before running.
# This file is gitignored — never commit it.

[destination.postgres.credentials]
database = "postgres"
username = "postgres"
password = "YOUR_SERVICE_ROLE_DB_PASSWORD"
host = "YOUR_PROJECT_REF.supabase.co"
port = 5432
```

- [ ] **Step 6: Add dlt secrets to root `.gitignore`**

Append to `.gitignore`:

```
# dlt secrets
.dlt/secrets.toml
.dlt/.pipeline/
```

- [ ] **Step 7: Verify `ingest` is importable from root**

```bash
python -c "import ingest; print('OK')"
```

Expected: `OK`

- [ ] **Step 8: Commit scaffold**

```bash
git add ingest/ .dlt/config.toml .gitignore
git commit -m "feat(ingest): scaffold faf5 dlt package + dlt config"
```

---

## Task 2: Verify FAF5 download URL and CSV headers

Do this before writing `constants.py` so the URL and column names are authoritative.

- [ ] **Step 1: Find the current download URL**

Open `https://faf.ornl.gov/faf5/` and navigate to the regional database download. The URL follows the pattern `https://faf.ornl.gov/faf5/data/FAF5.X.Y.zip`. Note the exact URL — you'll paste it into `constants.py`.

- [ ] **Step 2: Inspect the ZIP contents and CSV headers**

Download the ZIP to your Downloads folder, then run from the brain-platform root:

```python
# paste into a python -c "" or a scratch .py file
import zipfile, io

with zipfile.ZipFile(r"C:\Users\ethan\Downloads\FAF5.X.Y.zip") as zf:
    print("Files in ZIP:", zf.namelist())
    csv_name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
    with zf.open(csv_name) as f:
        header = f.readline().decode("utf-8").strip()
    print("CSV headers:", header)
```

Note:

1. The exact CSV filename inside the ZIP
2. The exact column names (especially `dms_orig`, `dms_dest`, `sctg2`, `trade_type`, `tons_YYYY`, `value_YYYY`, `tmiles_YYYY`)

If the column names differ from the expected ones above, update `constants.py` and `resources.py` accordingly.

---

## Task 3: Write `constants.py`

**Files:**

- Create: `ingest/pipelines/faf5/constants.py`

- [ ] **Step 1: Write `constants.py`**

Replace `FAF5_DOWNLOAD_URL` with the exact URL you found in Task 2.

`ingest/pipelines/faf5/constants.py`:

```python
# Update URL when ORNL publishes a new FAF5 vintage.
FAF5_DOWNLOAD_URL = "https://faf.ornl.gov/faf5/data/FAF5.5.5.zip"  # verify in Task 2

# All FL FAF5 zone IDs. Ingest rule: keep rows where orig OR dest is in this set.
# Downstream SWFL filter (done in brain, not here): dms_dest = 129 AND trade_type = 1.
FL_ZONE_IDS: frozenset[int] = frozenset({121, 122, 123, 124, 129})

# Historical (2017-2022) and forecast years present in the FAF5 regional flow CSV.
FAF5_YEARS: list[int] = [2017, 2018, 2019, 2020, 2021, 2022, 2025, 2030, 2035, 2040, 2045, 2050]

# FAF5 zone reference data. FL entries are authoritative per API_BLUEPRINTS.md.
# Non-FL entries are representative — expand from the FAF5 zone definition file if needed.
FAF_ZONE_LOOKUP: list[dict] = [
    {"zone_id": 11,  "zone_name": "New England",                "state_abbr": "CT/MA/ME/NH/RI/VT"},
    {"zone_id": 12,  "zone_name": "New York",                   "state_abbr": "NY"},
    {"zone_id": 13,  "zone_name": "Philadelphia",               "state_abbr": "PA/NJ"},
    {"zone_id": 14,  "zone_name": "Baltimore",                  "state_abbr": "MD"},
    {"zone_id": 19,  "zone_name": "Remainder of Mid-Atlantic",  "state_abbr": "DE/MD/PA/VA/WV"},
    {"zone_id": 21,  "zone_name": "Chicago",                    "state_abbr": "IL"},
    {"zone_id": 22,  "zone_name": "Detroit",                    "state_abbr": "MI"},
    {"zone_id": 29,  "zone_name": "Remainder of Great Lakes",   "state_abbr": "IL/IN/MI/MN/OH/WI"},
    {"zone_id": 31,  "zone_name": "Minneapolis",                "state_abbr": "MN"},
    {"zone_id": 39,  "zone_name": "Remainder of Plains",        "state_abbr": "IA/KS/MO/NE/ND/SD"},
    {"zone_id": 41,  "zone_name": "Atlanta",                    "state_abbr": "GA"},
    {"zone_id": 49,  "zone_name": "Remainder of Southeast",     "state_abbr": "AL/GA/MS/SC/TN"},
    {"zone_id": 51,  "zone_name": "Dallas",                     "state_abbr": "TX"},
    {"zone_id": 52,  "zone_name": "Houston",                    "state_abbr": "TX"},
    {"zone_id": 59,  "zone_name": "Remainder of South Central", "state_abbr": "AR/LA/OK/TX"},
    {"zone_id": 61,  "zone_name": "Denver",                     "state_abbr": "CO"},
    {"zone_id": 69,  "zone_name": "Remainder of Mountain",      "state_abbr": "AZ/CO/ID/MT/NM/NV/UT/WY"},
    {"zone_id": 71,  "zone_name": "Los Angeles",                "state_abbr": "CA"},
    {"zone_id": 72,  "zone_name": "San Francisco",              "state_abbr": "CA"},
    {"zone_id": 73,  "zone_name": "Seattle",                    "state_abbr": "WA"},
    {"zone_id": 79,  "zone_name": "Remainder of Pacific",       "state_abbr": "AK/CA/HI/OR/WA"},
    # Florida — all five zones required for FL-zone filtering
    {"zone_id": 121, "zone_name": "Miami",                      "state_abbr": "FL"},
    {"zone_id": 122, "zone_name": "Jacksonville",               "state_abbr": "FL"},
    {"zone_id": 123, "zone_name": "Tampa-St. Petersburg",       "state_abbr": "FL"},
    {"zone_id": 124, "zone_name": "Orlando",                    "state_abbr": "FL"},
    {"zone_id": 129, "zone_name": "Remainder of Florida",       "state_abbr": "FL"},
]

# All 43 SCTG 2-digit commodity codes. SWFL targets (12, 31, 32, 33) are noted.
SCTG_LOOKUP: list[dict] = [
    {"sctg_code": 1,  "commodity_name": "Live animals and fish"},
    {"sctg_code": 2,  "commodity_name": "Cereal grains"},
    {"sctg_code": 3,  "commodity_name": "Other agricultural products"},
    {"sctg_code": 4,  "commodity_name": "Animal feed"},
    {"sctg_code": 5,  "commodity_name": "Meat and seafood"},
    {"sctg_code": 6,  "commodity_name": "Milled grain products"},
    {"sctg_code": 7,  "commodity_name": "Other prepared foodstuffs"},
    {"sctg_code": 8,  "commodity_name": "Alcoholic beverages"},
    {"sctg_code": 9,  "commodity_name": "Tobacco products"},
    {"sctg_code": 10, "commodity_name": "Building stone"},
    {"sctg_code": 11, "commodity_name": "Natural sands"},
    {"sctg_code": 12, "commodity_name": "Gravel and crushed stone"},       # SWFL target
    {"sctg_code": 13, "commodity_name": "Nonmetallic minerals"},
    {"sctg_code": 14, "commodity_name": "Metallic ores"},
    {"sctg_code": 15, "commodity_name": "Coal"},
    {"sctg_code": 16, "commodity_name": "Crude petroleum"},
    {"sctg_code": 17, "commodity_name": "Gasoline and aviation fuel"},
    {"sctg_code": 18, "commodity_name": "Fuel oils"},
    {"sctg_code": 19, "commodity_name": "Natural gas and other fuels"},
    {"sctg_code": 20, "commodity_name": "Basic chemicals"},
    {"sctg_code": 21, "commodity_name": "Pharmaceutical products"},
    {"sctg_code": 22, "commodity_name": "Fertilizers"},
    {"sctg_code": 23, "commodity_name": "Chemical products"},
    {"sctg_code": 24, "commodity_name": "Plastics and rubber"},
    {"sctg_code": 25, "commodity_name": "Logs and rough wood"},
    {"sctg_code": 26, "commodity_name": "Wood products"},
    {"sctg_code": 27, "commodity_name": "Pulp and paper"},
    {"sctg_code": 28, "commodity_name": "Paper articles"},
    {"sctg_code": 29, "commodity_name": "Printed products"},
    {"sctg_code": 30, "commodity_name": "Textiles and leather"},
    {"sctg_code": 31, "commodity_name": "Nonmetallic mineral products"},   # SWFL target
    {"sctg_code": 32, "commodity_name": "Base metals"},                    # SWFL target
    {"sctg_code": 33, "commodity_name": "Articles of base metal"},         # SWFL target
    {"sctg_code": 34, "commodity_name": "Machinery"},
    {"sctg_code": 35, "commodity_name": "Electronics"},
    {"sctg_code": 36, "commodity_name": "Motorized vehicles"},
    {"sctg_code": 37, "commodity_name": "Transportation equipment"},
    {"sctg_code": 38, "commodity_name": "Precision instruments"},
    {"sctg_code": 39, "commodity_name": "Furniture"},
    {"sctg_code": 40, "commodity_name": "Miscellaneous manufactured products"},
    {"sctg_code": 41, "commodity_name": "Waste and scrap"},
    {"sctg_code": 43, "commodity_name": "Mixed freight"},
]
```

- [ ] **Step 2: Commit**

```bash
git add ingest/pipelines/faf5/constants.py
git commit -m "feat(ingest/faf5): add constants — FL zones, SCTG codes, download URL"
```

---

## Task 4: Write failing tests

**Files:**

- Create: `ingest/tests/pipelines/faf5/test_resources.py`

- [ ] **Step 1: Write `test_resources.py`**

`ingest/tests/pipelines/faf5/test_resources.py`:

```python
import io
import csv
import zipfile
from unittest.mock import patch, MagicMock

from ingest.pipelines.faf5.constants import FL_ZONE_IDS


def _make_fake_zip(rows: list[dict]) -> bytes:
    csv_buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(csv_buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w") as zf:
        zf.writestr("faf5_flows.csv", csv_buf.getvalue())
    return zip_buf.getvalue()


def _fake_response(rows: list[dict]) -> MagicMock:
    fake = MagicMock()
    fake.raise_for_status = MagicMock()
    fake.iter_content = MagicMock(return_value=iter([_make_fake_zip(rows)]))
    return fake


FL_ORIG_ROW = {
    "dms_orig": "129", "dms_dest": "51", "sctg2": "12", "trade_type": "1",
    "tons_2017": "100.5", "tons_2022": "110.0", "tons_2025": "120.0",
    "value_2017": "500.0", "value_2022": "550.0", "value_2025": "600.0",
    "tmiles_2017": "10.0", "tmiles_2022": "11.0", "tmiles_2025": "12.0",
}
FL_DEST_ROW = {
    "dms_orig": "51", "dms_dest": "124", "sctg2": "31", "trade_type": "1",
    "tons_2017": "50.0", "tons_2022": "55.0", "tons_2025": "60.0",
    "value_2017": "300.0", "value_2022": "320.0", "value_2025": "340.0",
    "tmiles_2017": "5.0", "tmiles_2022": "5.5", "tmiles_2025": "6.0",
}
NON_FL_ROW = {
    "dms_orig": "21", "dms_dest": "51", "sctg2": "32", "trade_type": "1",
    "tons_2017": "200.0", "tons_2022": "210.0", "tons_2025": "220.0",
    "value_2017": "700.0", "value_2022": "750.0", "value_2025": "800.0",
    "tmiles_2017": "15.0", "tmiles_2022": "16.0", "tmiles_2025": "17.0",
}


class TestFafFlows:
    def test_yields_fl_origin_rows(self):
        from ingest.pipelines.faf5.resources import faf_flows
        with patch("ingest.pipelines.faf5.resources.requests.get",
                   return_value=_fake_response([FL_ORIG_ROW, NON_FL_ROW])):
            rows = list(faf_flows())
        assert len(rows) == 1
        assert rows[0]["dms_orig"] == 129

    def test_yields_fl_destination_rows(self):
        from ingest.pipelines.faf5.resources import faf_flows
        with patch("ingest.pipelines.faf5.resources.requests.get",
                   return_value=_fake_response([FL_DEST_ROW, NON_FL_ROW])):
            rows = list(faf_flows())
        assert len(rows) == 1
        assert rows[0]["dms_dest"] == 124

    def test_excludes_non_fl_rows(self):
        from ingest.pipelines.faf5.resources import faf_flows
        with patch("ingest.pipelines.faf5.resources.requests.get",
                   return_value=_fake_response([NON_FL_ROW])):
            rows = list(faf_flows())
        assert rows == []

    def test_coerces_int_fields(self):
        from ingest.pipelines.faf5.resources import faf_flows
        with patch("ingest.pipelines.faf5.resources.requests.get",
                   return_value=_fake_response([FL_ORIG_ROW])):
            row = list(faf_flows())[0]
        assert isinstance(row["dms_orig"], int)
        assert isinstance(row["dms_dest"], int)
        assert isinstance(row["sctg2"], int)
        assert isinstance(row["trade_type"], int)

    def test_coerces_float_fields(self):
        from ingest.pipelines.faf5.resources import faf_flows
        with patch("ingest.pipelines.faf5.resources.requests.get",
                   return_value=_fake_response([FL_ORIG_ROW])):
            row = list(faf_flows())[0]
        assert isinstance(row["tons_2017"], float)
        assert isinstance(row["value_2022"], float)
        assert isinstance(row["tmiles_2025"], float)


class TestFafZoneLookup:
    def test_yields_all_fl_zones(self):
        from ingest.pipelines.faf5.resources import faf_zone_lookup
        zone_ids = {r["zone_id"] for r in faf_zone_lookup()}
        assert FL_ZONE_IDS.issubset(zone_ids), f"Missing FL zones: {FL_ZONE_IDS - zone_ids}"

    def test_zone_129_is_remainder_of_florida(self):
        from ingest.pipelines.faf5.resources import faf_zone_lookup
        rows = {r["zone_id"]: r for r in faf_zone_lookup()}
        assert rows[129]["zone_name"] == "Remainder of Florida"
        assert rows[129]["state_abbr"] == "FL"

    def test_all_rows_have_required_keys(self):
        from ingest.pipelines.faf5.resources import faf_zone_lookup
        for row in faf_zone_lookup():
            assert "zone_id" in row
            assert "zone_name" in row
            assert "state_abbr" in row


class TestFafSctgLookup:
    def test_yields_swfl_target_commodities(self):
        from ingest.pipelines.faf5.resources import faf_sctg_lookup
        codes = {r["sctg_code"] for r in faf_sctg_lookup()}
        for target in (12, 31, 32, 33):
            assert target in codes, f"SCTG code {target} missing"

    def test_all_rows_have_required_keys(self):
        from ingest.pipelines.faf5.resources import faf_sctg_lookup
        for row in faf_sctg_lookup():
            assert "sctg_code" in row
            assert "commodity_name" in row

    def test_sctg_code_is_int(self):
        from ingest.pipelines.faf5.resources import faf_sctg_lookup
        for row in faf_sctg_lookup():
            assert isinstance(row["sctg_code"], int)
```

- [ ] **Step 2: Run tests — expect `ImportError` (resources.py doesn't exist yet)**

```bash
python -m pytest ingest/tests/pipelines/faf5/test_resources.py -v
```

Expected: `ImportError: No module named 'ingest.pipelines.faf5.resources'`

- [ ] **Step 3: Commit failing tests**

```bash
git add ingest/tests/
git commit -m "test(ingest/faf5): add failing resource tests (TDD red)"
```

---

## Task 5: Write `resources.py` — make tests pass

**Files:**

- Create: `ingest/pipelines/faf5/resources.py`

- [ ] **Step 1: Write `resources.py`**

`ingest/pipelines/faf5/resources.py`:

```python
import io
import zipfile
import csv

import requests
import dlt

from .constants import (
    FAF5_DOWNLOAD_URL,
    FL_ZONE_IDS,
    FAF5_YEARS,
    FAF_ZONE_LOOKUP,
    SCTG_LOOKUP,
)

_YEAR_COLS: list[str] = (
    [f"tons_{y}"   for y in FAF5_YEARS]
    + [f"value_{y}"  for y in FAF5_YEARS]
    + [f"tmiles_{y}" for y in FAF5_YEARS]
)

_FLOW_COLUMNS: dict = {
    "dms_orig":   {"data_type": "bigint"},
    "dms_dest":   {"data_type": "bigint"},
    "sctg2":      {"data_type": "bigint"},
    "trade_type": {"data_type": "bigint"},
    **{col: {"data_type": "double"} for col in _YEAR_COLS},
}


def _download_faf5_rows() -> csv.DictReader:
    resp = requests.get(FAF5_DOWNLOAD_URL, stream=True, timeout=180)
    resp.raise_for_status()
    raw = b"".join(resp.iter_content(chunk_size=1024 * 1024))
    zf = zipfile.ZipFile(io.BytesIO(raw))
    csv_name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
    return csv.DictReader(io.TextIOWrapper(zf.open(csv_name), encoding="utf-8"))


@dlt.resource(
    table_name="faf_flows",
    write_disposition="replace",
    columns=_FLOW_COLUMNS,
)
def faf_flows():
    for row in _download_faf5_rows():
        orig = int(row["dms_orig"])
        dest = int(row["dms_dest"])
        if orig not in FL_ZONE_IDS and dest not in FL_ZONE_IDS:
            continue
        out: dict = {
            "dms_orig":   orig,
            "dms_dest":   dest,
            "sctg2":      int(row["sctg2"]),
            "trade_type": int(row["trade_type"]),
        }
        for col in _YEAR_COLS:
            val = row.get(col, "")
            if val not in ("", None):
                out[col] = float(val)
        yield out


@dlt.resource(
    table_name="faf_zone_lookup",
    write_disposition="replace",
    columns={
        "zone_id":    {"data_type": "bigint"},
        "zone_name":  {"data_type": "text"},
        "state_abbr": {"data_type": "text"},
    },
)
def faf_zone_lookup():
    yield from FAF_ZONE_LOOKUP


@dlt.resource(
    table_name="faf_sctg_lookup",
    write_disposition="replace",
    columns={
        "sctg_code":      {"data_type": "bigint"},
        "commodity_name": {"data_type": "text"},
    },
)
def faf_sctg_lookup():
    yield from SCTG_LOOKUP
```

- [ ] **Step 2: Run tests — all 11 should pass**

```bash
python -m pytest ingest/tests/pipelines/faf5/test_resources.py -v
```

Expected output:

```
PASSED tests/.../TestFafFlows::test_yields_fl_origin_rows
PASSED tests/.../TestFafFlows::test_yields_fl_destination_rows
PASSED tests/.../TestFafFlows::test_excludes_non_fl_rows
PASSED tests/.../TestFafFlows::test_coerces_int_fields
PASSED tests/.../TestFafFlows::test_coerces_float_fields
PASSED tests/.../TestFafZoneLookup::test_yields_all_fl_zones
PASSED tests/.../TestFafZoneLookup::test_zone_129_is_remainder_of_florida
PASSED tests/.../TestFafZoneLookup::test_all_rows_have_required_keys
PASSED tests/.../TestFafSctgLookup::test_yields_swfl_target_commodities
PASSED tests/.../TestFafSctgLookup::test_all_rows_have_required_keys
PASSED tests/.../TestFafSctgLookup::test_sctg_code_is_int
11 passed
```

- [ ] **Step 3: Commit**

```bash
git add ingest/pipelines/faf5/resources.py
git commit -m "feat(ingest/faf5): add three dlt resources — faf_flows, zone_lookup, sctg_lookup"
```

---

## Task 6: Write `pipeline.py`

**Files:**

- Create: `ingest/pipelines/faf5/pipeline.py`

- [ ] **Step 1: Write `pipeline.py`**

`ingest/pipelines/faf5/pipeline.py`:

```python
import dlt

from .resources import faf_flows, faf_zone_lookup, faf_sctg_lookup


def run() -> None:
    pipeline = dlt.pipeline(
        pipeline_name="faf5",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run([faf_flows(), faf_zone_lookup(), faf_sctg_lookup()])
    print(load_info)


if __name__ == "__main__":
    run()
```

- [ ] **Step 2: Verify import is clean**

```bash
python -c "from ingest.pipelines.faf5.pipeline import run; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add ingest/pipelines/faf5/pipeline.py
git commit -m "feat(ingest/faf5): add pipeline entry point"
```

---

## Task 7: End-to-end run against Supabase

- [ ] **Step 1: Fill in `.dlt/secrets.toml`**

Open `.dlt/secrets.toml` and replace the placeholders:

- `host`: Your Supabase project ref + `.supabase.co` (e.g. `abcdefghijklmnop.supabase.co`)
- `password`: The database password (Supabase Dashboard → Project Settings → Database → Database password). This is the direct Postgres password, NOT the anon or service_role API key.

- [ ] **Step 2: Run the pipeline**

```bash
python -m ingest.pipelines.faf5.pipeline
```

Expected: dlt prints a load summary:

```
Pipeline faf5 load step completed in X.XX seconds
1 load package(s) were loaded to destination postgres and into dataset data_lake
The following load packages were loaded:
...
```

If you see a connection error, double-check the host and password in `secrets.toml`. The host must be the direct Postgres host (port 5432), not the Supabase REST API URL.

- [ ] **Step 3: Verify tables in Supabase SQL editor**

```sql
-- Row counts
SELECT COUNT(*) AS flow_rows    FROM data_lake.faf_flows;
SELECT COUNT(*) AS zone_rows    FROM data_lake.faf_zone_lookup;
SELECT COUNT(*) AS sctg_rows    FROM data_lake.faf_sctg_lookup;

-- Smoke check: top inbound SWFL freight by 2022 tons
SELECT
    z.zone_name   AS origin,
    s.commodity_name,
    f.tons_2022
FROM data_lake.faf_flows f
JOIN data_lake.faf_zone_lookup  z ON z.zone_id = f.dms_orig
JOIN data_lake.faf_sctg_lookup  s ON s.sctg_code = f.sctg2
WHERE f.dms_dest = 129
  AND f.trade_type = 1
ORDER BY f.tons_2022 DESC
LIMIT 10;
```

`faf_flows` should have several thousand rows. `faf_zone_lookup` ~25 rows. `faf_sctg_lookup` 43 rows.

- [ ] **Step 4: Grant `service_role` SELECT**

Brain-platform pattern: new tables need explicit grants (discovered Session 7).

```sql
GRANT USAGE ON SCHEMA data_lake TO service_role;
GRANT SELECT ON data_lake.faf_flows       TO service_role;
GRANT SELECT ON data_lake.faf_zone_lookup TO service_role;
GRANT SELECT ON data_lake.faf_sctg_lookup TO service_role;
```

- [ ] **Step 5: Final commit**

```bash
git add ingest/
git commit -m "feat(ingest/faf5): ship FAF5 dlt pipeline — faf_flows + zone/sctg lookups in data_lake"
```
