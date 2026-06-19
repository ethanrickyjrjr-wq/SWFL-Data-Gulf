# Ingest Pipelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 12 tasks, 27 files, keywords: schema, architecture

**Goal:** Ship four new ingest pipelines (census_cbp Tier 2, fema/leepa/fdot Tier 1) + TS CBP source connector that extends macro-florida with real Census business-sector data.

**Architecture:** Python `ingest/` pipelines write to Supabase (either `data_lake.*` Postgres for Tier 2, or Supabase Storage buckets + `_tier1_inventory` pointer rows for Tier 1). A new TS `macro-florida-cbp-source.mts` reads `data_lake.census_cbp` and slots into the existing `macro-florida` pack additively — zero changes to the FLUR/LBSSA12 path.

**Tech Stack:** Python 3.13, dlt[postgres]>=1.26.0, requests; TypeScript/bun, supabase-js, node:test

---

## File Map

**Create:**

- `ingest/lib/__init__.py`
- `ingest/lib/geo_utils.py`
- `ingest/lib/arcgis_paginator.py`
- `ingest/lib/storage_uploader.py`
- `ingest/tests/lib/__init__.py`
- `ingest/tests/lib/test_geo_utils.py`
- `ingest/tests/lib/test_arcgis_paginator.py`
- `ingest/tests/lib/test_storage_uploader.py`
- `ingest/pipelines/census_cbp/{__init__,constants,resources,pipeline}.py`
- `ingest/pipelines/fema/{__init__,constants,resources,pipeline}.py`
- `ingest/pipelines/leepa/{__init__,constants,resources,pipeline}.py`
- `ingest/pipelines/fdot/{__init__,constants,resources,pipeline}.py`
- `ingest/tests/pipelines/{census_cbp,fema,leepa,fdot}/__init__.py`
- `ingest/tests/pipelines/{census_cbp,fema,leepa,fdot}/test_resources.py`
- `ingest/.dlt/config.toml`
- `ingest/.env.example`
- `refinery/__fixtures__/macro-florida-cbp.sample.json`
- `refinery/sources/macro-florida-cbp-source.mts`
- `refinery/sources/macro-florida-cbp-source.test.mts`

**Modify:**

- `package.json` — append ingest scripts
- `refinery/packs/macro-florida.mts` — add CBP source, extend corpus/output (additive only)

---

## Task 1: Supabase Storage Buckets + dlt Config

No TDD — these are infra steps. Do these before any pipeline code.

**Files:**

- Create: `ingest/.dlt/config.toml`
- Create: `ingest/.env.example`

- [ ] **Step 1: Create Supabase Storage buckets**

In Supabase dashboard → Storage → New bucket:

- `raw-geometry` (private)
- `raw-tabular-cold` (private)

- [ ] **Step 2: Create `ingest/.dlt/` directory and config.toml**

```toml
[destination.postgres]
buffer_max_items = 5000

[pipeline.faf5]
pipeline_name = "faf5"
dataset_name  = "data_lake"

[pipeline.census_cbp]
pipeline_name = "census_cbp"
dataset_name  = "data_lake"

[pipeline.tier1_inventory]
pipeline_name = "tier1_inventory"
dataset_name  = "data_lake"
```

- [ ] **Step 3: Create `ingest/.env.example`**

```
DESTINATION__POSTGRES__CREDENTIALS=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
BRAINS_SUPABASE_URL=https://xxx.supabase.co
BRAINS_SUPABASE_SERVICE_KEY=xxx
CENSUS_API_KEY=xxx
```

- [ ] **Step 4: Verify `.dlt/secrets.toml` is gitignored**

Check `ingest/.gitignore` contains `.dlt/secrets.toml`. If the file doesn't exist, create it:

```
.dlt/secrets.toml
```

- [ ] **Step 5: Commit**

```bash
git add ingest/.dlt/config.toml ingest/.env.example ingest/.gitignore
git commit -m "chore(ingest): add dlt config.toml + .env.example for new pipelines"
```

---

## Task 2: Shared Lib — geo_utils.py

**Files:**

- Create: `ingest/lib/__init__.py`
- Create: `ingest/lib/geo_utils.py`
- Create: `ingest/tests/lib/__init__.py`
- Create: `ingest/tests/lib/test_geo_utils.py`

- [ ] **Step 1: Write failing tests**

`ingest/tests/lib/test_geo_utils.py`:

```python
from ingest.lib.geo_utils import FL_BBOX, FL_FIPS_STATE, geometry_hash


class TestGeoUtils:
    def test_fl_bbox_is_four_floats(self):
        assert len(FL_BBOX) == 4
        assert all(isinstance(v, float) for v in FL_BBOX)

    def test_fl_bbox_covers_florida(self):
        min_lon, min_lat, max_lon, max_lat = FL_BBOX
        # Miami is roughly -80.2, 25.8 — must be inside
        assert min_lon < -80.2 < max_lon
        assert min_lat < 25.8 < max_lat

    def test_fl_fips_state(self):
        assert FL_FIPS_STATE == "12"

    def test_geometry_hash_deterministic(self):
        g = {"type": "Point", "coordinates": [-81.5, 26.3]}
        assert geometry_hash(g) == geometry_hash(g)

    def test_geometry_hash_different_on_change(self):
        g1 = {"type": "Point", "coordinates": [-81.5, 26.3]}
        g2 = {"type": "Point", "coordinates": [-82.0, 26.0]}
        assert geometry_hash(g1) != geometry_hash(g2)

    def test_geometry_hash_returns_32_char_hex(self):
        h = geometry_hash({"type": "Point", "coordinates": [0, 0]})
        assert isinstance(h, str) and len(h) == 32
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd ingest && python -m pytest tests/lib/test_geo_utils.py -v
```

Expected: `ModuleNotFoundError: No module named 'ingest.lib'`

- [ ] **Step 3: Create `__init__.py` files**

`ingest/lib/__init__.py` — empty file
`ingest/tests/lib/__init__.py` — empty file

- [ ] **Step 4: Implement `geo_utils.py`**

`ingest/lib/geo_utils.py`:

```python
import hashlib
import json

FL_BBOX = (-87.6, 24.4, -79.9, 31.0)
LEE_COUNTY_BBOX = (-82.4, 26.3, -81.5, 26.8)
FL_FIPS_STATE = "12"


def geometry_hash(geojson_geometry: dict) -> str:
    stable = json.dumps(geojson_geometry, sort_keys=True, separators=(",", ":"))
    return hashlib.md5(stable.encode()).hexdigest()
```

- [ ] **Step 5: Run to verify PASS**

```bash
cd ingest && python -m pytest tests/lib/test_geo_utils.py -v
```

Expected: 6 passed

- [ ] **Step 6: Commit**

```bash
git add ingest/lib/__init__.py ingest/lib/geo_utils.py ingest/tests/lib/__init__.py ingest/tests/lib/test_geo_utils.py
git commit -m "feat(ingest/lib): add geo_utils — FL bbox, FIPS constant, geometry_hash"
```

---

## Task 3: Shared Lib — arcgis_paginator.py

**Files:**

- Create: `ingest/lib/arcgis_paginator.py`
- Create: `ingest/tests/lib/test_arcgis_paginator.py`

- [ ] **Step 1: Write failing tests**

`ingest/tests/lib/test_arcgis_paginator.py`:

```python
from unittest.mock import patch, MagicMock

FAKE_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
F1 = {"type": "Feature", "geometry": None, "properties": {"id": 1}}
F2 = {"type": "Feature", "geometry": None, "properties": {"id": 2}}


def _resp(features, status=200):
    r = MagicMock()
    r.status_code = status
    r.json.return_value = {"features": features}
    r.raise_for_status = MagicMock()
    return r


class TestPaginateArcgis:
    def test_yields_features_single_page(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis
        with patch("requests.get", return_value=_resp([F1, F2])):
            results = list(paginate_arcgis(FAKE_URL))
        assert results == [F1, F2]

    def test_stops_on_empty_page(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis
        with patch("requests.get", side_effect=[_resp([F1, F2]), _resp([])]):
            results = list(paginate_arcgis(FAKE_URL, page_size=2))
        assert len(results) == 2

    def test_paginates_multiple_full_pages(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis
        with patch("requests.get", side_effect=[_resp([F1, F2]), _resp([F1])]):
            results = list(paginate_arcgis(FAKE_URL, page_size=2))
        assert len(results) == 3

    def test_includes_bbox_in_params(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis
        with patch("requests.get", return_value=_resp([])) as mock_get:
            list(paginate_arcgis(FAKE_URL, bbox=(-87.6, 24.4, -79.9, 31.0)))
        params = mock_get.call_args[1]["params"]
        assert "geometry" in params

    def test_omits_geometry_without_bbox(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis
        with patch("requests.get", return_value=_resp([])) as mock_get:
            list(paginate_arcgis(FAKE_URL))
        params = mock_get.call_args[1]["params"]
        assert "geometry" not in params

    def test_retries_on_500(self):
        from ingest.lib.arcgis_paginator import paginate_arcgis
        err_resp = MagicMock(status_code=500)
        err_resp.raise_for_status.side_effect = Exception("500")
        with patch("requests.get", side_effect=[err_resp, err_resp, _resp([])]):
            with patch("time.sleep"):
                list(paginate_arcgis(FAKE_URL))
        # No exception = retried successfully on 3rd attempt
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd ingest && python -m pytest tests/lib/test_arcgis_paginator.py -v
```

Expected: `ModuleNotFoundError: No module named 'ingest.lib.arcgis_paginator'`

- [ ] **Step 3: Implement `arcgis_paginator.py`**

`ingest/lib/arcgis_paginator.py`:

```python
import time
import requests


def paginate_arcgis(base_url, where="1=1", out_fields="*", bbox=None, page_size=2000):
    """Sync generator. Yields GeoJSON Feature dicts. Retries 3x on 5xx."""
    params = {
        "where": where,
        "outFields": out_fields,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "outSR": "4326",
        "f": "geojson",
        "resultRecordCount": page_size,
    }
    if bbox is not None:
        params["geometry"] = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"

    offset = 0
    while True:
        params["resultOffset"] = offset
        resp = None
        for attempt in range(3):
            try:
                resp = requests.get(base_url, params=params, timeout=60)
                if resp.status_code >= 500 and attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                resp.raise_for_status()
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)

        features = resp.json().get("features", [])
        if not features:
            break
        yield from features
        if len(features) < page_size:
            break
        offset += len(features)
```

- [ ] **Step 4: Run to verify PASS**

```bash
cd ingest && python -m pytest tests/lib/test_arcgis_paginator.py -v
```

Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add ingest/lib/arcgis_paginator.py ingest/tests/lib/test_arcgis_paginator.py
git commit -m "feat(ingest/lib): add arcgis_paginator — sync ArcGIS REST paginator with retry"
```

---

## Task 4: Shared Lib — storage_uploader.py

**Files:**

- Create: `ingest/lib/storage_uploader.py`
- Create: `ingest/tests/lib/test_storage_uploader.py`

- [ ] **Step 1: Write failing tests**

`ingest/tests/lib/test_storage_uploader.py`:

```python
import csv
import gzip
import io
import json
import os
from unittest.mock import patch, MagicMock, call

os.environ.setdefault("BRAINS_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("BRAINS_SUPABASE_SERVICE_KEY", "test-service-key")


def _ok_resp():
    m = MagicMock()
    m.raise_for_status = MagicMock()
    return m


class TestUploadCsvGz:
    def test_calls_requests_post_with_bucket_and_path(self):
        from ingest.lib.storage_uploader import upload_csv_gz
        with patch("requests.post", return_value=_ok_resp()) as mock_post:
            upload_csv_gz("my-bucket", "test/file.csv.gz", [{"a": 1}], ["a"])
        url = mock_post.call_args[0][0]
        assert "my-bucket" in url
        assert "test/file.csv.gz" in url

    def test_returns_object_path(self):
        from ingest.lib.storage_uploader import upload_csv_gz
        with patch("requests.post", return_value=_ok_resp()):
            result = upload_csv_gz("b", "path/file.csv.gz", [{"x": 1}], ["x"])
        assert result == "path/file.csv.gz"

    def test_body_is_valid_gzipped_csv(self):
        from ingest.lib.storage_uploader import upload_csv_gz
        rows = [{"name": "Alice", "age": "30"}, {"name": "Bob", "age": "25"}]
        captured = {}
        def cap(url, **kw):
            captured["data"] = kw["data"]
            return _ok_resp()
        with patch("requests.post", side_effect=cap):
            upload_csv_gz("b", "p/f.csv.gz", rows, ["name", "age"])
        reader = csv.DictReader(io.StringIO(gzip.decompress(captured["data"]).decode()))
        result = list(reader)
        assert result[0]["name"] == "Alice"
        assert result[1]["age"] == "25"


class TestUploadGeojsonGz:
    def test_calls_requests_post(self):
        from ingest.lib.storage_uploader import upload_geojson_gz
        features = [{"type": "Feature", "geometry": None, "properties": {"id": 1}}]
        with patch("requests.post", return_value=_ok_resp()) as mock_post:
            result = upload_geojson_gz("geo-bucket", "fema/2026-01-01.geojson.gz", features)
        assert mock_post.called
        assert result == "fema/2026-01-01.geojson.gz"

    def test_body_is_valid_gzipped_geojson_feature_collection(self):
        from ingest.lib.storage_uploader import upload_geojson_gz
        features = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [0, 0]}, "properties": {}}]
        captured = {}
        def cap(url, **kw):
            captured["data"] = kw["data"]
            return _ok_resp()
        with patch("requests.post", side_effect=cap):
            upload_geojson_gz("b", "p/f.geojson.gz", features)
        parsed = json.loads(gzip.decompress(captured["data"]).decode())
        assert parsed["type"] == "FeatureCollection"
        assert len(parsed["features"]) == 1


class TestWriteTier1Pointer:
    def test_calls_pipeline_run(self):
        from ingest.lib.storage_uploader import write_tier1_pointer
        mock_pipeline = MagicMock()
        write_tier1_pointer(mock_pipeline, "fema_zones", "raw-geometry", "path.geojson.gz", 500, "https://src.com")
        assert mock_pipeline.run.called

    def test_inventory_row_has_required_fields(self):
        from ingest.lib.storage_uploader import write_tier1_pointer
        captured = []
        def cap_run(resource):
            captured.extend(list(resource))
        mock_pipeline = MagicMock()
        mock_pipeline.run.side_effect = cap_run
        write_tier1_pointer(mock_pipeline, "fema_zones", "raw-geometry", "path.geojson.gz", 100, "https://src.com")
        assert len(captured) == 1
        row = captured[0]
        assert row["table_name"] == "fema_zones"
        assert row["bucket"] == "raw-geometry"
        assert row["object_path"] == "path.geojson.gz"
        assert row["row_count"] == 100
        assert row["source_url"] == "https://src.com"
        assert "ingested_at" in row
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd ingest && python -m pytest tests/lib/test_storage_uploader.py -v
```

Expected: `ModuleNotFoundError: No module named 'ingest.lib.storage_uploader'`

- [ ] **Step 3: Implement `storage_uploader.py`**

`ingest/lib/storage_uploader.py`:

```python
import csv
import gzip
import io
import json
import os
from datetime import datetime, timezone

import dlt
import requests


def upload_csv_gz(bucket: str, object_path: str, rows: list[dict], fieldnames: list[str]) -> str:
    csv_buf = io.StringIO()
    writer = csv.DictWriter(csv_buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    gz_buf = io.BytesIO()
    with gzip.GzipFile(fileobj=gz_buf, mode="wb") as gz:
        gz.write(csv_buf.getvalue().encode("utf-8"))
    _upload_bytes(bucket, object_path, gz_buf.getvalue(), "application/gzip")
    return object_path


def upload_geojson_gz(bucket: str, object_path: str, features: list[dict]) -> str:
    geojson = json.dumps({"type": "FeatureCollection", "features": features})
    gz_buf = io.BytesIO()
    with gzip.GzipFile(fileobj=gz_buf, mode="wb") as gz:
        gz.write(geojson.encode("utf-8"))
    _upload_bytes(bucket, object_path, gz_buf.getvalue(), "application/gzip")
    return object_path


def _upload_bytes(bucket: str, object_path: str, data: bytes, content_type: str) -> None:
    url = f"{os.environ['BRAINS_SUPABASE_URL']}/storage/v1/object/{bucket}/{object_path}"
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {os.environ['BRAINS_SUPABASE_SERVICE_KEY']}",
            "Content-Type": content_type,
        },
        data=data,
        timeout=120,
    )
    resp.raise_for_status()


def write_tier1_pointer(
    pipeline,
    table_name: str,
    bucket: str,
    object_path: str,
    row_count: int,
    source_url: str,
) -> None:
    @dlt.resource(
        table_name="_tier1_inventory",
        write_disposition="merge",
        primary_key=["table_name", "object_path"],
    )
    def _row():
        yield {
            "table_name": table_name,
            "bucket": bucket,
            "object_path": object_path,
            "row_count": row_count,
            "source_url": source_url,
            "ingested_at": datetime.now(timezone.utc).isoformat(),
            "deleted_at": None,
        }

    pipeline.run(_row())
```

- [ ] **Step 4: Run to verify PASS**

```bash
cd ingest && python -m pytest tests/lib/test_storage_uploader.py -v
```

Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add ingest/lib/storage_uploader.py ingest/tests/lib/test_storage_uploader.py
git commit -m "feat(ingest/lib): add storage_uploader — CSV.gz/GeoJSON.gz Supabase Storage + _tier1_inventory pointer"
```

---

## Task 5: Census CBP Pipeline (Tier 2)

**Files:**

- Create: `ingest/pipelines/census_cbp/__init__.py`
- Create: `ingest/pipelines/census_cbp/constants.py`
- Create: `ingest/pipelines/census_cbp/resources.py`
- Create: `ingest/pipelines/census_cbp/pipeline.py`
- Create: `ingest/tests/pipelines/census_cbp/__init__.py`
- Create: `ingest/tests/pipelines/census_cbp/test_resources.py`

- [ ] **Step 1: Create `__init__.py` files (both empty)**

`ingest/pipelines/census_cbp/__init__.py` — empty
`ingest/tests/pipelines/census_cbp/__init__.py` — empty

- [ ] **Step 2: Create `constants.py`**

`ingest/pipelines/census_cbp/constants.py`:

```python
CENSUS_CBP_BASE_URL = "https://api.census.gov/data/{year}/cbp"
CBP_YEARS = list(range(2017, 2023))  # 2017–2022 inclusive
CBP_FIELDS = ["NAICS2022", "NAICS2022_LABEL", "ESTAB", "EMP", "PAYANN", "NAME"]
FL_STATE_FIPS = "12"
```

- [ ] **Step 3: Write failing tests**

`ingest/tests/pipelines/census_cbp/test_resources.py`:

```python
from unittest.mock import patch, MagicMock

from ingest.pipelines.census_cbp.constants import CBP_YEARS

FAKE_RESPONSE = [
    ["NAICS2022", "NAICS2022_LABEL", "ESTAB", "EMP", "PAYANN", "NAME", "state", "county"],
    ["--", "Total for all sectors", "50000", "500000", "10000000", "Lee County", "12", "071"],
    ["44-45", "Retail trade", "5000", "50000", "1000000", "Lee County", "12", "071"],
]


def _mock_get():
    m = MagicMock()
    m.json.return_value = FAKE_RESPONSE
    m.raise_for_status = MagicMock()
    return m


class TestCensusCbpFl:
    def test_yields_one_row_per_naics_per_year(self):
        from ingest.pipelines.census_cbp.resources import census_cbp_fl
        with patch("requests.get", return_value=_mock_get()):
            rows = list(census_cbp_fl())
        assert len(rows) == 2 * len(CBP_YEARS)

    def test_field_mapping(self):
        from ingest.pipelines.census_cbp.resources import census_cbp_fl
        with patch("requests.get", return_value=_mock_get()):
            rows = list(census_cbp_fl())
        row = next(r for r in rows if r["naics_code"] == "--")
        assert row["establishment_count"] == 50000
        assert row["employment"] == 500000
        assert row["annual_payroll"] == 10000000
        assert row["fips_state"] == "12"
        assert row["fips_county"] == "071"
        assert row["county_name"] == "Lee County"

    def test_natural_key_fields_present(self):
        from ingest.pipelines.census_cbp.resources import census_cbp_fl
        with patch("requests.get", return_value=_mock_get()):
            rows = list(census_cbp_fl())
        for row in rows:
            for key in ("naics_code", "year", "fips_state", "fips_county"):
                assert key in row, f"missing key: {key}"

    def test_loops_all_cbp_years(self):
        from ingest.pipelines.census_cbp.resources import census_cbp_fl
        with patch("requests.get", return_value=_mock_get()):
            rows = list(census_cbp_fl())
        years = sorted({r["year"] for r in rows})
        assert years == sorted(CBP_YEARS)

    def test_int_coercion(self):
        from ingest.pipelines.census_cbp.resources import census_cbp_fl
        with patch("requests.get", return_value=_mock_get()):
            rows = list(census_cbp_fl())
        row = rows[0]
        assert isinstance(row["establishment_count"], int)
        assert isinstance(row["employment"], int)
        assert isinstance(row["year"], int)

    def test_ingested_at_present(self):
        from ingest.pipelines.census_cbp.resources import census_cbp_fl
        with patch("requests.get", return_value=_mock_get()):
            rows = list(census_cbp_fl())
        assert all("ingested_at" in r for r in rows)
```

- [ ] **Step 4: Run to verify FAIL**

```bash
cd ingest && python -m pytest tests/pipelines/census_cbp/test_resources.py -v
```

Expected: `ModuleNotFoundError: No module named 'ingest.pipelines.census_cbp'`

- [ ] **Step 5: Implement `resources.py`**

`ingest/pipelines/census_cbp/resources.py`:

```python
import os
from datetime import datetime, timezone

import dlt
import requests

from .constants import CENSUS_CBP_BASE_URL, CBP_YEARS, CBP_FIELDS, FL_STATE_FIPS

_CBP_COLUMNS = {
    "naics_code":          {"data_type": "text"},
    "naics_label":         {"data_type": "text"},
    "county_name":         {"data_type": "text"},
    "establishment_count": {"data_type": "bigint"},
    "employment":          {"data_type": "bigint"},
    "annual_payroll":      {"data_type": "bigint"},
    "year":                {"data_type": "bigint"},
    "fips_state":          {"data_type": "text"},
    "fips_county":         {"data_type": "text"},
    "ingested_at":         {"data_type": "timestamp"},
}


@dlt.resource(
    table_name="census_cbp",
    write_disposition="merge",
    primary_key=["naics_code", "year", "fips_state", "fips_county"],
    columns=_CBP_COLUMNS,
)
def census_cbp_fl():
    api_key = os.environ.get("CENSUS_API_KEY", "")
    ingested_at = datetime.now(timezone.utc).isoformat()

    for year in CBP_YEARS:
        url = CENSUS_CBP_BASE_URL.format(year=year)
        params = {"get": ",".join(CBP_FIELDS), "for": "county:*", "in": f"state:{FL_STATE_FIPS}"}
        if api_key:
            params["key"] = api_key

        resp = requests.get(url, params=params, timeout=60)
        resp.raise_for_status()

        data = resp.json()
        headers = data[0]
        for row_arr in data[1:]:
            row = dict(zip(headers, row_arr))
            yield {
                "naics_code":          row.get("NAICS2022", ""),
                "naics_label":         row.get("NAICS2022_LABEL", ""),
                "county_name":         row.get("NAME", ""),
                "establishment_count": int(row.get("ESTAB") or 0),
                "employment":          int(row.get("EMP") or 0),
                "annual_payroll":      int(row.get("PAYANN") or 0),
                "year":                year,
                "fips_state":          row.get("state", FL_STATE_FIPS),
                "fips_county":         row.get("county", ""),
                "ingested_at":         ingested_at,
            }
```

- [ ] **Step 6: Create `pipeline.py`**

`ingest/pipelines/census_cbp/pipeline.py`:

```python
import dlt
from .resources import census_cbp_fl


def run():
    pipeline = dlt.pipeline(
        pipeline_name="census_cbp",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(census_cbp_fl())
    print(load_info)


if __name__ == "__main__":
    run()
```

- [ ] **Step 7: Run to verify PASS**

```bash
cd ingest && python -m pytest tests/pipelines/census_cbp/test_resources.py -v
```

Expected: 6 passed

- [ ] **Step 8: Commit**

```bash
git add ingest/pipelines/census_cbp/ ingest/tests/pipelines/census_cbp/
git commit -m "feat(ingest/census_cbp): add Tier 2 Census CBP pipeline — FL counties 2017-2022, merge to data_lake.census_cbp"
```

---

## Task 6: FEMA Pipeline (Tier 1)

**Files:**

- Create: `ingest/pipelines/fema/{__init__,constants,resources,pipeline}.py`
- Create: `ingest/tests/pipelines/fema/{__init__,test_resources.py}`

- [ ] **Step 1: Create `__init__.py` files (both empty)**

- [ ] **Step 2: Create `constants.py`**

`ingest/pipelines/fema/constants.py`:

```python
NFHL_LAYERS = [
    {"name": "flood_zones", "url": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"},
    {"name": "lomr",        "url": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/1/query"},
    {"name": "loma",        "url": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/34/query"},
    {"name": "bfe",         "url": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/16/query"},
]
NFIP_CLAIMS_URL = "https://www.fema.gov/api/open/v1/FimaNfipClaims"
GEOMETRY_BUCKET = "raw-geometry"
TABULAR_BUCKET  = "raw-tabular-cold"
```

- [ ] **Step 3: Write failing tests**

`ingest/tests/pipelines/fema/test_resources.py`:

```python
from unittest.mock import patch, MagicMock

FAKE_FEATURE = {"type": "Feature", "geometry": None, "properties": {"OBJECTID": 1}}
FAKE_CLAIM   = {"claimId": "1", "countyCode": "12071", "buildingDamageAmount": "5000"}


class TestIngestNfhlLayer:
    def test_uploads_to_geometry_bucket(self):
        from ingest.pipelines.fema.resources import ingest_nfhl_layer
        layer = {"name": "flood_zones", "url": "https://hazards.fema.gov/..."}
        with patch("ingest.pipelines.fema.resources.paginate_arcgis", return_value=iter([FAKE_FEATURE])), \
             patch("ingest.pipelines.fema.resources.upload_geojson_gz") as mock_upload, \
             patch("ingest.pipelines.fema.resources.write_tier1_pointer"):
            ingest_nfhl_layer(MagicMock(), layer)
        assert mock_upload.call_args[0][0] == "raw-geometry"

    def test_object_path_contains_layer_name_and_date(self):
        from ingest.pipelines.fema.resources import ingest_nfhl_layer
        layer = {"name": "lomr", "url": "https://hazards.fema.gov/..."}
        with patch("ingest.pipelines.fema.resources.paginate_arcgis", return_value=iter([FAKE_FEATURE])), \
             patch("ingest.pipelines.fema.resources.upload_geojson_gz") as mock_upload, \
             patch("ingest.pipelines.fema.resources.write_tier1_pointer"):
            ingest_nfhl_layer(MagicMock(), layer)
        path = mock_upload.call_args[0][1]
        assert "lomr" in path and path.endswith(".geojson.gz")

    def test_writes_tier1_pointer_with_correct_table_name(self):
        from ingest.pipelines.fema.resources import ingest_nfhl_layer
        layer = {"name": "bfe", "url": "https://hazards.fema.gov/..."}
        mock_pipeline = MagicMock()
        with patch("ingest.pipelines.fema.resources.paginate_arcgis", return_value=iter([FAKE_FEATURE])), \
             patch("ingest.pipelines.fema.resources.upload_geojson_gz"), \
             patch("ingest.pipelines.fema.resources.write_tier1_pointer") as mock_ptr:
            ingest_nfhl_layer(mock_pipeline, layer)
        assert mock_ptr.call_args[0][1] == "fema_bfe"


class TestIngestNfipClaims:
    def test_uploads_csv_gz_to_tabular_cold(self):
        from ingest.pipelines.fema.resources import ingest_nfip_claims
        with patch("requests.get", return_value=MagicMock(json=lambda: {"value": [FAKE_CLAIM]}, raise_for_status=MagicMock())), \
             patch("ingest.pipelines.fema.resources.upload_csv_gz") as mock_upload, \
             patch("ingest.pipelines.fema.resources.write_tier1_pointer"):
            ingest_nfip_claims(MagicMock())
        assert mock_upload.call_args[0][0] == "raw-tabular-cold"
        assert "nfip_claims" in mock_upload.call_args[0][1]

    def test_skips_when_no_claims(self):
        from ingest.pipelines.fema.resources import ingest_nfip_claims
        with patch("requests.get", return_value=MagicMock(json=lambda: {"value": []}, raise_for_status=MagicMock())), \
             patch("ingest.pipelines.fema.resources.upload_csv_gz") as mock_upload, \
             patch("ingest.pipelines.fema.resources.write_tier1_pointer"):
            ingest_nfip_claims(MagicMock())
        assert not mock_upload.called
```

- [ ] **Step 4: Run to verify FAIL**

```bash
cd ingest && python -m pytest tests/pipelines/fema/test_resources.py -v
```

- [ ] **Step 5: Implement `resources.py`**

`ingest/pipelines/fema/resources.py`:

```python
from datetime import date

import requests

from ingest.lib.arcgis_paginator import paginate_arcgis
from ingest.lib.geo_utils import FL_BBOX
from ingest.lib.storage_uploader import upload_csv_gz, upload_geojson_gz, write_tier1_pointer
from .constants import GEOMETRY_BUCKET, NFIP_CLAIMS_URL, TABULAR_BUCKET


def ingest_nfhl_layer(pipeline, layer: dict) -> None:
    today = date.today().isoformat()
    name = layer["name"]
    features = list(paginate_arcgis(layer["url"], bbox=FL_BBOX))
    object_path = f"fema/{name}/{today}.geojson.gz"
    upload_geojson_gz(GEOMETRY_BUCKET, object_path, features)
    write_tier1_pointer(pipeline, f"fema_{name}", GEOMETRY_BUCKET, object_path, len(features), layer["url"])


def ingest_nfip_claims(pipeline) -> None:
    today = date.today().isoformat()
    rows, skip, page_size = [], 0, 1000
    while True:
        resp = requests.get(
            NFIP_CLAIMS_URL,
            params={"$skip": skip, "$top": page_size, "$format": "json"},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        batch = data.get("value") or data.get("FimaNfipClaims", [])
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        skip += len(batch)

    if not rows:
        return
    object_path = f"fema/nfip_claims/{today}.csv.gz"
    upload_csv_gz(TABULAR_BUCKET, object_path, rows, list(rows[0].keys()))
    write_tier1_pointer(pipeline, "fema_nfip_claims", TABULAR_BUCKET, object_path, len(rows), NFIP_CLAIMS_URL)
```

- [ ] **Step 6: Create `pipeline.py`**

`ingest/pipelines/fema/pipeline.py`:

```python
import dlt
from .constants import NFHL_LAYERS
from .resources import ingest_nfhl_layer, ingest_nfip_claims


def run():
    inv = dlt.pipeline(pipeline_name="tier1_inventory", destination="postgres", dataset_name="data_lake")
    for layer in NFHL_LAYERS:
        print(f"Ingesting NFHL layer: {layer['name']}")
        ingest_nfhl_layer(inv, layer)
    print("Ingesting NFIP Claims...")
    ingest_nfip_claims(inv)
    print("FEMA pipeline complete.")


if __name__ == "__main__":
    run()
```

- [ ] **Step 7: Run to verify PASS**

```bash
cd ingest && python -m pytest tests/pipelines/fema/test_resources.py -v
```

Expected: 5 passed

- [ ] **Step 8: Commit**

```bash
git add ingest/pipelines/fema/ ingest/tests/pipelines/fema/
git commit -m "feat(ingest/fema): add Tier 1 FEMA pipeline — NFHL layers + NFIP claims to Supabase Storage"
```

---

## Task 7: LeePA Pipeline (Tier 1)

**Files:**

- Create: `ingest/pipelines/leepa/{__init__,constants,resources,pipeline}.py`
- Create: `ingest/tests/pipelines/leepa/{__init__,test_resources.py}`

- [ ] **Step 1: Create `__init__.py` files**

- [ ] **Step 2: Create `constants.py`**

`ingest/pipelines/leepa/constants.py`:

```python
LEEPA_PARCELS_URL = "https://gissvr.leepa.org/gissvr/rest/services/ParcelInfo/MapServer/0/query"
TABULAR_BUCKET = "raw-tabular-cold"
```

- [ ] **Step 3: Write failing tests**

`ingest/tests/pipelines/leepa/test_resources.py`:

```python
from unittest.mock import patch, MagicMock

FAKE_PARCEL = {"type": "Feature", "geometry": None, "properties": {"STRAP": "01-42-24-01-00001.0000"}}


class TestIngestLeepaParces:
    def test_uploads_to_tabular_cold(self):
        from ingest.pipelines.leepa.resources import ingest_leepa_parcels
        with patch("ingest.pipelines.leepa.resources.paginate_arcgis", return_value=iter([FAKE_PARCEL])), \
             patch("ingest.pipelines.leepa.resources.upload_geojson_gz") as mock_upload, \
             patch("ingest.pipelines.leepa.resources.write_tier1_pointer"):
            ingest_leepa_parcels(MagicMock())
        assert mock_upload.call_args[0][0] == "raw-tabular-cold"

    def test_object_path_pattern(self):
        from ingest.pipelines.leepa.resources import ingest_leepa_parcels
        with patch("ingest.pipelines.leepa.resources.paginate_arcgis", return_value=iter([FAKE_PARCEL])), \
             patch("ingest.pipelines.leepa.resources.upload_geojson_gz") as mock_upload, \
             patch("ingest.pipelines.leepa.resources.write_tier1_pointer"):
            ingest_leepa_parcels(MagicMock())
        path = mock_upload.call_args[0][1]
        assert "leepa/parcels/" in path and path.endswith(".geojson.gz")

    def test_writes_tier1_pointer(self):
        from ingest.pipelines.leepa.resources import ingest_leepa_parcels
        with patch("ingest.pipelines.leepa.resources.paginate_arcgis", return_value=iter([FAKE_PARCEL])), \
             patch("ingest.pipelines.leepa.resources.upload_geojson_gz"), \
             patch("ingest.pipelines.leepa.resources.write_tier1_pointer") as mock_ptr:
            ingest_leepa_parcels(MagicMock())
        assert mock_ptr.call_args[0][1] == "leepa_parcels"

    def test_no_bbox_filter(self):
        from ingest.pipelines.leepa.resources import ingest_leepa_parcels
        with patch("ingest.pipelines.leepa.resources.paginate_arcgis", return_value=iter([FAKE_PARCEL])) as mock_pag, \
             patch("ingest.pipelines.leepa.resources.upload_geojson_gz"), \
             patch("ingest.pipelines.leepa.resources.write_tier1_pointer"):
            ingest_leepa_parcels(MagicMock())
        # LeePA is already Lee County — no bbox arg passed
        call_kwargs = mock_pag.call_args[1] if mock_pag.call_args else {}
        assert "bbox" not in call_kwargs
```

- [ ] **Step 4: Run to verify FAIL**

```bash
cd ingest && python -m pytest tests/pipelines/leepa/test_resources.py -v
```

- [ ] **Step 5: Implement `resources.py` + `pipeline.py`**

`ingest/pipelines/leepa/resources.py`:

```python
from datetime import date

from ingest.lib.arcgis_paginator import paginate_arcgis
from ingest.lib.storage_uploader import upload_geojson_gz, write_tier1_pointer
from .constants import LEEPA_PARCELS_URL, TABULAR_BUCKET


def ingest_leepa_parcels(pipeline) -> None:
    today = date.today().isoformat()
    features = list(paginate_arcgis(LEEPA_PARCELS_URL))
    object_path = f"leepa/parcels/{today}.geojson.gz"
    upload_geojson_gz(TABULAR_BUCKET, object_path, features)
    write_tier1_pointer(pipeline, "leepa_parcels", TABULAR_BUCKET, object_path, len(features), LEEPA_PARCELS_URL)
```

`ingest/pipelines/leepa/pipeline.py`:

```python
import dlt
from .resources import ingest_leepa_parcels


def run():
    inv = dlt.pipeline(pipeline_name="tier1_inventory", destination="postgres", dataset_name="data_lake")
    print("Ingesting LeePA parcels...")
    ingest_leepa_parcels(inv)
    print("LeePA pipeline complete.")


if __name__ == "__main__":
    run()
```

- [ ] **Step 6: Run to verify PASS**

```bash
cd ingest && python -m pytest tests/pipelines/leepa/test_resources.py -v
```

Expected: 4 passed

- [ ] **Step 7: Commit**

```bash
git add ingest/pipelines/leepa/ ingest/tests/pipelines/leepa/
git commit -m "feat(ingest/leepa): add Tier 1 LeePA parcel pipeline — GeoJSON.gz to Supabase Storage"
```

---

## Task 8: FDOT Pipeline (Tier 1)

**Files:**

- Create: `ingest/pipelines/fdot/{__init__,constants,resources,pipeline}.py`
- Create: `ingest/tests/pipelines/fdot/{__init__,test_resources.py}`

- [ ] **Step 1: Create `__init__.py` files**

- [ ] **Step 2: Create `constants.py`**

`ingest/pipelines/fdot/constants.py`:

```python
FDOT_AADT_URL = "https://gis.fdot.gov/arcgis/rest/services/FTO/fto_PROD/MapServer/7/query"
TABULAR_BUCKET = "raw-tabular-cold"
```

- [ ] **Step 3: Write failing tests**

`ingest/tests/pipelines/fdot/test_resources.py`:

```python
from unittest.mock import patch, MagicMock

FAKE_STATION = {"type": "Feature", "geometry": None, "properties": {"SITE_ID": "FL001", "AADT": "15000"}}


class TestIngestFdotAadt:
    def test_uploads_csv_gz_to_tabular_cold(self):
        from ingest.pipelines.fdot.resources import ingest_fdot_aadt
        with patch("ingest.pipelines.fdot.resources.paginate_arcgis", return_value=iter([FAKE_STATION])), \
             patch("ingest.pipelines.fdot.resources.upload_csv_gz") as mock_upload, \
             patch("ingest.pipelines.fdot.resources.write_tier1_pointer"):
            ingest_fdot_aadt(MagicMock())
        assert mock_upload.call_args[0][0] == "raw-tabular-cold"
        assert "fdot_aadt/" in mock_upload.call_args[0][1]
        assert mock_upload.call_args[0][1].endswith(".csv.gz")

    def test_extracts_properties_as_rows(self):
        from ingest.pipelines.fdot.resources import ingest_fdot_aadt
        captured = {}
        def cap(bucket, path, rows, fieldnames):
            captured["rows"] = rows
        with patch("ingest.pipelines.fdot.resources.paginate_arcgis", return_value=iter([FAKE_STATION])), \
             patch("ingest.pipelines.fdot.resources.upload_csv_gz", side_effect=cap), \
             patch("ingest.pipelines.fdot.resources.write_tier1_pointer"):
            ingest_fdot_aadt(MagicMock())
        assert captured["rows"][0]["SITE_ID"] == "FL001"
        assert captured["rows"][0]["AADT"] == "15000"

    def test_writes_tier1_pointer(self):
        from ingest.pipelines.fdot.resources import ingest_fdot_aadt
        with patch("ingest.pipelines.fdot.resources.paginate_arcgis", return_value=iter([FAKE_STATION])), \
             patch("ingest.pipelines.fdot.resources.upload_csv_gz"), \
             patch("ingest.pipelines.fdot.resources.write_tier1_pointer") as mock_ptr:
            ingest_fdot_aadt(MagicMock())
        assert mock_ptr.call_args[0][1] == "fdot_aadt"

    def test_skips_when_no_features(self):
        from ingest.pipelines.fdot.resources import ingest_fdot_aadt
        with patch("ingest.pipelines.fdot.resources.paginate_arcgis", return_value=iter([])), \
             patch("ingest.pipelines.fdot.resources.upload_csv_gz") as mock_upload, \
             patch("ingest.pipelines.fdot.resources.write_tier1_pointer"):
            ingest_fdot_aadt(MagicMock())
        assert not mock_upload.called
```

- [ ] **Step 4: Run to verify FAIL**

```bash
cd ingest && python -m pytest tests/pipelines/fdot/test_resources.py -v
```

- [ ] **Step 5: Implement `resources.py` + `pipeline.py`**

`ingest/pipelines/fdot/resources.py`:

```python
from datetime import date

from ingest.lib.arcgis_paginator import paginate_arcgis
from ingest.lib.geo_utils import FL_BBOX
from ingest.lib.storage_uploader import upload_csv_gz, write_tier1_pointer
from .constants import FDOT_AADT_URL, TABULAR_BUCKET


def ingest_fdot_aadt(pipeline) -> None:
    today = date.today().isoformat()
    features = list(paginate_arcgis(FDOT_AADT_URL, bbox=FL_BBOX))
    if not features:
        print("FDOT AADT: 0 features returned — skipping upload")
        return
    rows = [f.get("properties", {}) for f in features]
    object_path = f"fdot_aadt/{today}.csv.gz"
    upload_csv_gz(TABULAR_BUCKET, object_path, rows, list(rows[0].keys()))
    write_tier1_pointer(pipeline, "fdot_aadt", TABULAR_BUCKET, object_path, len(rows), FDOT_AADT_URL)
```

`ingest/pipelines/fdot/pipeline.py`:

```python
import dlt
from .resources import ingest_fdot_aadt


def run():
    inv = dlt.pipeline(pipeline_name="tier1_inventory", destination="postgres", dataset_name="data_lake")
    print("Ingesting FDOT AADT stations...")
    ingest_fdot_aadt(inv)
    print("FDOT pipeline complete.")


if __name__ == "__main__":
    run()
```

- [ ] **Step 6: Run all ingest tests to catch regressions**

```bash
cd ingest && python -m pytest tests/ -v
```

Expected: All green (faf5 + geo_utils + arcgis_paginator + storage_uploader + census_cbp + fema + leepa + fdot)

- [ ] **Step 7: Commit**

```bash
git add ingest/pipelines/fdot/ ingest/tests/pipelines/fdot/
git commit -m "feat(ingest/fdot): add Tier 1 FDOT AADT pipeline — CSV.gz to Supabase Storage"
```

---

## Task 9: Wiring — package.json Scripts

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add ingest scripts to `package.json`**

In `package.json`, add to the `scripts` object:

```json
"ingest:cbp":   "cd ingest && python -m pipelines.census_cbp.pipeline",
"ingest:fema":  "cd ingest && python -m pipelines.fema.pipeline",
"ingest:leepa": "cd ingest && python -m pipelines.leepa.pipeline",
"ingest:fdot":  "cd ingest && python -m pipelines.fdot.pipeline",
"ingest:all":   "npm run ingest:fema && npm run ingest:leepa && npm run ingest:fdot && npm run ingest:cbp"
```

- [ ] **Step 2: Verify scripts parse correctly**

```bash
node -e "require('./package.json')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add ingest npm scripts — cbp, fema, leepa, fdot, all"
```

---

## Task 10: TS — Fixture + macro-florida-cbp-source.mts

**Files:**

- Create: `refinery/__fixtures__/macro-florida-cbp.sample.json`
- Create: `refinery/sources/macro-florida-cbp-source.mts`
- Create: `refinery/sources/macro-florida-cbp-source.test.mts`

- [ ] **Step 1: Create fixture**

`refinery/__fixtures__/macro-florida-cbp.sample.json`:

```json
{
  "__meta": {
    "source": "Census Bureau CBP (synthetic fixture — not for production analysis)",
    "verified": "2026-05-17",
    "note": "Florida state-level CBP aggregates (all counties summed). 10 representative NAICS sectors."
  },
  "sectors": [
    {
      "naics_code": "44-45",
      "naics_label": "Retail Trade",
      "fl_establishments": 52000,
      "fl_employment": 580000,
      "fl_annual_payroll": 13000000,
      "year": 2022
    },
    {
      "naics_code": "72",
      "naics_label": "Accommodation and Food Services",
      "fl_establishments": 40000,
      "fl_employment": 650000,
      "fl_annual_payroll": 11000000,
      "year": 2022
    },
    {
      "naics_code": "23",
      "naics_label": "Construction",
      "fl_establishments": 38000,
      "fl_employment": 310000,
      "fl_annual_payroll": 16000000,
      "year": 2022
    },
    {
      "naics_code": "62",
      "naics_label": "Health Care and Social Assistance",
      "fl_establishments": 35000,
      "fl_employment": 550000,
      "fl_annual_payroll": 26000000,
      "year": 2022
    },
    {
      "naics_code": "54",
      "naics_label": "Professional, Scientific, and Technical Services",
      "fl_establishments": 48000,
      "fl_employment": 360000,
      "fl_annual_payroll": 27000000,
      "year": 2022
    },
    {
      "naics_code": "52",
      "naics_label": "Finance and Insurance",
      "fl_establishments": 22000,
      "fl_employment": 210000,
      "fl_annual_payroll": 19000000,
      "year": 2022
    },
    {
      "naics_code": "56",
      "naics_label": "Administrative and Support and Waste Management",
      "fl_establishments": 20000,
      "fl_employment": 380000,
      "fl_annual_payroll": 10000000,
      "year": 2022
    },
    {
      "naics_code": "53",
      "naics_label": "Real Estate and Rental and Leasing",
      "fl_establishments": 30000,
      "fl_employment": 100000,
      "fl_annual_payroll": 5000000,
      "year": 2022
    },
    {
      "naics_code": "31-33",
      "naics_label": "Manufacturing",
      "fl_establishments": 14000,
      "fl_employment": 280000,
      "fl_annual_payroll": 16000000,
      "year": 2022
    },
    {
      "naics_code": "42",
      "naics_label": "Wholesale Trade",
      "fl_establishments": 16000,
      "fl_employment": 190000,
      "fl_annual_payroll": 13000000,
      "year": 2022
    }
  ]
}
```

- [ ] **Step 2: Write failing tests**

`refinery/sources/macro-florida-cbp-source.test.mts`:

```typescript
import { test, before } from "node:test";
import assert from "node:assert/strict";

// Set fixture mode before any source import so env.source resolves correctly.
process.env["REFINERY_SOURCE"] = "fixture";

const { macroFloridaCbpSource } =
  await import("./macro-florida-cbp-source.mts");

test("fixture mode returns at least one fragment", async () => {
  const fragments = await macroFloridaCbpSource.fetch();
  assert.ok(fragments.length > 0);
});

test("every fragment has kind = fl-cbp-aggregate", async () => {
  const fragments = await macroFloridaCbpSource.fetch();
  for (const f of fragments) {
    const n = f.normalized as { kind: string };
    assert.equal(n.kind, "fl-cbp-aggregate");
  }
});

test("every fragment has required CBP fields with correct types", async () => {
  const fragments = await macroFloridaCbpSource.fetch();
  for (const f of fragments) {
    const n = f.normalized as Record<string, unknown>;
    assert.equal(typeof n["naics_code"], "string");
    assert.equal(typeof n["naics_label"], "string");
    assert.equal(typeof n["fl_establishments"], "number");
    assert.equal(typeof n["fl_employment"], "number");
    assert.equal(typeof n["fl_annual_payroll"], "number");
    assert.equal(typeof n["year"], "number");
  }
});

test("fragment_ids are unique", async () => {
  const fragments = await macroFloridaCbpSource.fetch();
  const ids = fragments.map((f) => f.fragment_id);
  assert.equal(new Set(ids).size, ids.length);
});

test("citationMeta returns source containing census_cbp", () => {
  const meta = macroFloridaCbpSource.citationMeta("2026-05-17", 86400);
  assert.ok(meta.source.includes("census_cbp"));
  assert.equal(typeof meta.verified, "string");
  assert.equal(typeof meta.expires, "string");
});
```

- [ ] **Step 3: Run to verify FAIL**

```bash
npm run refinery:typecheck 2>&1 | head -5
bun test refinery/sources/macro-florida-cbp-source.test.mts 2>&1 | head -10
```

Expected: import error (file doesn't exist yet)

- [ ] **Step 4: Implement `macro-florida-cbp-source.mts`**

`refinery/sources/macro-florida-cbp-source.mts`:

```typescript
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawFragment } from "../types/fragment.mts";
import type { SourceConnector, CitationRow } from "../types/pack.mts";
import { env } from "../config/env.mts";
import { getSupabase } from "./supabase.mts";
import { fragmentId } from "../lib/ids.mts";
import { isoTimestamp, expiresDate } from "../lib/dates.mts";

const SOURCE_ID = "census_cbp_fl";
const SCHEMA = "data_lake";
const TABLE = "census_cbp";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "refinery",
  "__fixtures__",
  "macro-florida-cbp.sample.json",
);

export interface MacroFloridaCbpNormalized {
  kind: "fl-cbp-aggregate";
  naics_code: string;
  naics_label: string;
  fl_establishments: number;
  fl_employment: number;
  fl_annual_payroll: number;
  year: number;
}

interface CbpRow {
  naics_code: string;
  naics_label: string;
  fl_establishments: number;
  fl_employment: number;
  fl_annual_payroll: number;
  year: number;
}

interface FixtureShape {
  sectors: CbpRow[];
}

async function loadFixture(): Promise<CbpRow[]> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return (JSON.parse(raw) as FixtureShape).sectors;
}

async function fetchLive(): Promise<CbpRow[]> {
  const sb = getSupabase().schema(SCHEMA);

  // Step 1: find latest year
  const { data: yearData, error: yearErr } = await sb
    .from(TABLE)
    .select("year")
    .eq("fips_state", "12")
    .order("year", { ascending: false })
    .limit(1)
    .single();
  if (yearErr)
    throw new Error(`census_cbp: max-year query failed — ${yearErr.message}`);
  const maxYear = (yearData as { year: number }).year;

  // Step 2: fetch all FL rows for that year
  const { data, error } = await sb
    .from(TABLE)
    .select(
      "naics_code,naics_label,establishment_count,employment,annual_payroll,year",
    )
    .eq("fips_state", "12")
    .eq("year", maxYear);
  if (error)
    throw new Error(`census_cbp: data query failed — ${error.message}`);

  // Step 3: aggregate by naics_code in TS (sum across all FL counties)
  const byNaics = new Map<string, CbpRow>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const key = String(row["naics_code"] ?? "");
    const existing = byNaics.get(key);
    const estab = Number(row["establishment_count"]) || 0;
    const emp = Number(row["employment"]) || 0;
    const pay = Number(row["annual_payroll"]) || 0;
    if (existing) {
      existing.fl_establishments += estab;
      existing.fl_employment += emp;
      existing.fl_annual_payroll += pay;
    } else {
      byNaics.set(key, {
        naics_code: key,
        naics_label: String(row["naics_label"] ?? ""),
        fl_establishments: estab,
        fl_employment: emp,
        fl_annual_payroll: pay,
        year: maxYear,
      });
    }
  }

  return Array.from(byNaics.values()).sort(
    (a, b) => b.fl_establishments - a.fl_establishments,
  );
}

export const macroFloridaCbpSource: SourceConnector = {
  source_id: SOURCE_ID,
  trust_tier: 1,
  async fetch(): Promise<RawFragment[]> {
    const sectors =
      env.source === "fixture" ? await loadFixture() : await fetchLive();
    const fetched_at = isoTimestamp();
    return sectors.map(
      (s): RawFragment<MacroFloridaCbpNormalized> => ({
        fragment_id: fragmentId(SOURCE_ID, `${s.naics_code}-${s.year}`),
        source_id: SOURCE_ID,
        source_trust_tier: 1,
        fetched_at,
        raw: s,
        normalized: { kind: "fl-cbp-aggregate", ...s },
      }),
    );
  },
  citationMeta(verifiedDate, ttlSeconds): Omit<CitationRow, "id"> {
    const src =
      env.source === "fixture"
        ? `Census CBP FL (fixture; ${SCHEMA}.${TABLE} county aggregation) — fixture://refinery/__fixtures__/macro-florida-cbp.sample.json`
        : `Census CBP FL via ${SCHEMA}.${TABLE} (dlt-ingested from Census Bureau CBP API, all FL counties aggregated) — ${env.supabaseUrl ?? "supabase"}/rest/v1/${TABLE}`;
    return {
      source: src,
      verified: verifiedDate,
      expires: expiresDate(verifiedDate, ttlSeconds),
    };
  },
};
```

- [ ] **Step 5: Typecheck**

```bash
npm run refinery:typecheck
```

Expected: 0 errors

- [ ] **Step 6: Run tests**

```bash
bun test refinery/sources/macro-florida-cbp-source.test.mts
```

Expected: 5 passed

- [ ] **Step 7: Commit**

```bash
git add refinery/__fixtures__/macro-florida-cbp.sample.json refinery/sources/macro-florida-cbp-source.mts refinery/sources/macro-florida-cbp-source.test.mts
git commit -m "feat(refinery): add macro-florida-cbp-source — Census CBP FL aggregation + fixture"
```

---

## Task 11: Update macro-florida.mts (Additive CBP Extension)

**Files:**

- Modify: `refinery/packs/macro-florida.mts`

The existing FLUR/LBSSA12 path is untouched. All changes are additive.

- [ ] **Step 1: Add import + module-level CBP state**

At the top of `refinery/packs/macro-florida.mts`, after existing imports, add:

```typescript
import {
  macroFloridaCbpSource,
  type MacroFloridaCbpNormalized,
} from "../sources/macro-florida-cbp-source.mts";
```

After `let lastMacroUsOutput: BrainOutput | null = null;`, add:

```typescript
let lastCbpSectors: MacroFloridaCbpNormalized[] = [];
let lastCbpFetchedAt: string | null = null;
```

- [ ] **Step 2: Add CBP NAICS metric map**

After the `METRIC_MAP` declaration, add:

```typescript
const CBP_NAICS_METRICS: Array<{
  naics: string;
  metric: string;
  label: string;
}> = [
  {
    naics: "44-45",
    metric: "fl_estab_count_retail",
    label: "Florida retail establishments",
  },
  {
    naics: "72",
    metric: "fl_estab_count_food_service",
    label: "Florida food service & accommodation establishments",
  },
  {
    naics: "23",
    metric: "fl_estab_count_construction",
    label: "Florida construction establishments",
  },
  {
    naics: "62",
    metric: "fl_estab_count_healthcare",
    label: "Florida healthcare establishments",
  },
  {
    naics: "54",
    metric: "fl_estab_count_professional",
    label: "Florida professional services establishments",
  },
];
```

- [ ] **Step 3: Add CBP fragment extractor**

After `function brainInputFrom(...)`, add:

```typescript
function cbpFragmentsFrom(
  fragments: RawFragment[],
): MacroFloridaCbpNormalized[] {
  return fragments
    .map((f) => f.normalized as unknown as MacroFloridaCbpNormalized)
    .filter((n) => n?.kind === "fl-cbp-aggregate");
}
```

- [ ] **Step 4: Extend `macroFloridaCorpusSummary` to handle CBP**

At the end of `macroFloridaCorpusSummary`, before `return facts;`, add:

```typescript
const cbpSectors = cbpFragmentsFrom(allFragments);
lastCbpSectors = cbpSectors;
lastCbpFetchedAt =
  allFragments.find(
    (f) =>
      (f.normalized as unknown as MacroFloridaCbpNormalized)?.kind ===
      "fl-cbp-aggregate",
  )?.fetched_at ?? null;

if (cbpSectors.length > 0) {
  const year = cbpSectors[0].year;
  const top3 = cbpSectors
    .slice(0, 3)
    .map(
      (s) =>
        `${s.naics_label} (${s.fl_establishments.toLocaleString()} estab.)`,
    )
    .join(", ");
  facts.push({
    topic: "fl_cbp_sector_snapshot",
    fact: "Florida business sector counts from Census CBP",
    value: `Florida CBP ${year}: top sectors by establishment count — ${top3}. Source: Census Bureau County Business Patterns, all FL counties aggregated.`,
    source_fragment_ids: [],
  });
  for (const s of cbpSectors) {
    const m = CBP_NAICS_METRICS.find((x) => x.naics === s.naics_code);
    if (!m) continue;
    facts.push({
      topic: `metric:${m.metric}`,
      fact: m.label,
      value:
        `${m.label}: ${s.fl_establishments.toLocaleString()} establishments, ` +
        `${s.fl_employment.toLocaleString()} employees, ` +
        `$${(s.fl_annual_payroll / 1_000_000).toFixed(1)}B annual payroll (${s.year}).`,
      source_fragment_ids: [],
    });
  }
}
```

- [ ] **Step 5: Extend `macroFloridaOutputProducer` to include CBP metrics**

After the line `const key_metrics: BrainOutputMetric[] = indicators.map(...).filter(...);` and after building the `conclusionParts` array, add CBP metrics to key_metrics before `return`:

After the `.filter((m): m is BrainOutputMetric => m !== null);` line, add:

```typescript
const cbpFetchedAt =
  lastCbpFetchedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
for (const s of lastCbpSectors) {
  const m = CBP_NAICS_METRICS.find((x) => x.naics === s.naics_code);
  if (!m) continue;
  key_metrics.push({
    metric: m.metric,
    value: s.fl_establishments,
    direction: "stable",
    label: m.label,
    source: {
      url: `https://api.census.gov/data/${s.year}/cbp?get=NAICS2022,ESTAB&for=county:*&in=state:12`,
      fetched_at: cbpFetchedAt,
      tier: 1,
      citation:
        `${m.label}: ${s.fl_establishments.toLocaleString()} FL establishments in ${s.year} ` +
        `(Census CBP, NAICS ${s.naics_code}, all FL counties aggregated).`,
    },
  });
}
```

Also extend `sourceCaveats` to mention CBP when it's present:

```typescript
const sourceCaveats: string[] =
  env.source === "fixture"
    ? [
        "Florida macro indicators in this build are synthetic fixture data (FRED-shaped) — unset REFINERY_SOURCE or set it to `live` for the live FRED API.",
      ]
    : [
        "FRED can revise recent observations within ~30 days of first publication — treat the most recent reading as directional, not final.",
        ...(lastCbpSectors.length > 0
          ? [
              "Census CBP data is an annual snapshot; establishment and employment counts may lag up to 18 months behind current conditions.",
            ]
          : []),
      ];
```

- [ ] **Step 6: Add `macroFloridaCbpSource` to pack sources + update scope**

In the `macroFlorida` pack definition, update `sources`:

```typescript
  sources: [macroFloridaSource, macroFloridaCbpSource, makeBrainInputSource("macro-us")],
```

Update `scope`:

```typescript
  scope:
    "Florida state-level macro context — labor market (FLUR, FL LFPR) and business sector counts (Census CBP). " +
    "Mid-tier of the three-tier macro denominator chain (macro-us → macro-florida → macro-swfl). Future branches: IRS SOI.",
```

- [ ] **Step 7: Typecheck**

```bash
npm run refinery:typecheck
```

Expected: 0 errors

- [ ] **Step 8: Run refinery in fixture mode**

```bash
npm run refinery macro-florida
```

Expected: `brains/macro-florida.md` written with `fl_estab_count_retail` and other CBP metrics in the `--- OUTPUT ---` block.

- [ ] **Step 9: Verify CBP metrics appear in output**

```bash
grep -c "fl_estab_count" brains/macro-florida.md
```

Expected: ≥5 (one per mapped NAICS sector)

- [ ] **Step 10: Commit**

```bash
git add refinery/packs/macro-florida.mts brains/macro-florida.md
git commit -m "feat(macro-florida): add CBP source — FL business sector counts from Census CBP (additive, FLUR path unchanged)"
```

---

## Task 12: Run census_cbp Pipeline + GRANT + Validate

This task requires Supabase credentials in environment. Do after all code is committed.

- [ ] **Step 1: Set env vars for census_cbp run**

In your shell (or `.dlt/secrets.toml`):

```
DESTINATION__POSTGRES__CREDENTIALS=postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres
CENSUS_API_KEY=<your key>
```

- [ ] **Step 2: Run census_cbp pipeline**

```bash
npm run ingest:cbp
```

Expected: dlt prints load summary. ~6 years × ~hundreds of NAICS × 67 FL counties = ~tens of thousands of rows.

- [ ] **Step 3: Validate row counts in Supabase SQL editor**

```sql
SELECT year, COUNT(DISTINCT naics_code) AS sectors,
       COUNT(DISTINCT fips_county) AS counties
FROM data_lake.census_cbp
WHERE fips_state = '12'
GROUP BY year ORDER BY year;
```

Expected: 6 rows (2017–2022), each with ~1000+ sectors and 67 counties.

- [ ] **Step 4: GRANT service_role access**

In Supabase SQL editor, run exactly:

```sql
GRANT SELECT ON data_lake.census_cbp TO service_role;
```

- [ ] **Step 5: Verify GRANT works**

```sql
SET ROLE service_role;
SELECT COUNT(*) FROM data_lake.census_cbp;
RESET ROLE;
```

Expected: returns row count without error.

- [ ] **Step 6: Smoke-test macro-florida in live mode**

```bash
REFINERY_SOURCE=live npm run refinery macro-florida
```

Expected: `brains/macro-florida.md` updated with real Census CBP data — CBP metrics show actual FL establishment counts.

- [ ] **Step 7: Verify \_tier1_inventory GRANTs (after first Tier 1 pipeline run)**

After running any of `npm run ingest:fema/leepa/fdot`, run in Supabase:

```sql
GRANT SELECT ON data_lake._tier1_inventory TO service_role;
```

- [ ] **Step 8: Final commit**

```bash
git add docs/superpowers/specs/2026-05-17-ingest-pipelines-design.md
git commit -m "feat(ingest): ship FEMA/LeePA/FDOT Tier 1 + Census CBP Tier 2 + macro-florida CBP extension"
```

---

## Self-Review

**Spec coverage check:**

- ✅ `census_cbp` Tier 2 → Task 5
- ✅ `fema` Tier 1 (NFHL 4 layers + NFIP claims) → Task 6
- ✅ `leepa` Tier 1 → Task 7
- ✅ `fdot` Tier 1 → Task 8
- ✅ Shared lib (`arcgis_paginator`, `geo_utils`, `storage_uploader`) → Tasks 2–4
- ✅ `data_lake._tier1_inventory` — auto-created by dlt on first Tier 1 run; GRANT in Task 12
- ✅ `macro-florida-cbp-source.mts` + fixture → Task 10
- ✅ `macro-florida.mts` CBP extension → Task 11
- ✅ `.dlt/config.toml` → Task 1
- ✅ `.env.example` → Task 1
- ✅ `package.json` scripts → Task 9
- ✅ `GRANT SELECT ON data_lake.census_cbp TO service_role` → Task 12 (also added to spec doc)
- ✅ Co-existence guarantee: faf5/ unchanged, macro-us/macro-swfl/logistics-swfl untouched

**Type consistency check:**

- `MacroFloridaCbpNormalized.kind` = `"fl-cbp-aggregate"` — consistent across source, test, and pack
- `CBP_NAICS_METRICS[].metric` strings used in both `corpusSummary` and `outputProducer` — same array, no drift
- `macroFloridaCbpSource` export name used identically in source file and pack import

**Placeholder scan:** None found — all steps include actual code.
