"""storm-history-swfl ingest: NOAA Storm Events -> Parquet in Tier 1 Storage.

Run with: python -m ingest.duckdb_pipelines.storm_history_swfl.pipeline

Outputs:
  - s3://lake-tier1/environmental/storm_events_swfl.parquet
  - one row in data_lake._tier1_inventory
"""
import os
import re

import duckdb
import requests

from ingest.duckdb_pipelines.storm_history_swfl.constants import (
    BUCKET,
    MIN_HURRICANE_ROWS,
    MIN_TOTAL_ROWS,
    NOAA_BASE_URL,
    NOAA_URL_GLOB,
    PACK_ID,
    PARQUET_PATH,
    PARQUET_TARGET,
    SWFL_COUNTIES_CZ,
    VINTAGE,
    YEAR_RANGE_END,
    YEAR_RANGE_START,
    swfl_filter_sql,
)
from ingest.lib.guards import assert_min_rows
from ingest.lib.tier1_inventory import upsert_inventory_row
from ingest.lib.env_local import load_env_local


_DAMAGE_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*([KMB]?)\s*$", re.IGNORECASE)
_MULT = {"": 1.0, "K": 1_000.0, "M": 1_000_000.0, "B": 1_000_000_000.0}


def parse_damage_string(raw: str | None) -> float | None:
    """Parse NOAA damage_property values like '1.5M', '10K', '2B', '500', '0'.

    Returns None for empty, None input, or unparseable values (so callers
    can skip damage-based aggregation without raising).
    """
    if raw is None:
        return None
    m = _DAMAGE_RE.match(raw)
    if m is None:
        return None
    return float(m.group(1)) * _MULT[m.group(2).upper()]


_NCEI_FILE_RE = re.compile(r"StormEvents_details-ftp_v1\.0_d(\d{4})_c(\d+)\.csv\.gz")


def _list_noaa_urls(start_year: int, end_year: int) -> list[str]:
    """Enumerate NOAA NCEI 'details' file URLs from the index page.

    HTTP doesn't support glob expansion, so we scrape NCEI's Apache directory
    listing and pick the latest compile-date file per year in [start, end].
    """
    resp = requests.get(NOAA_BASE_URL, timeout=60)
    resp.raise_for_status()
    by_year: dict[int, tuple[int, str]] = {}
    for m in _NCEI_FILE_RE.finditer(resp.text):
        year = int(m.group(1))
        compile_date = int(m.group(2))
        full_name = m.group(0)
        if start_year <= year <= end_year:
            if year not in by_year or compile_date > by_year[year][0]:
                by_year[year] = (compile_date, full_name)
    return sorted(f"{NOAA_BASE_URL}{name}" for _, (_, name) in by_year.items())


def _load_env() -> None:
    """Load .env.local for SUPABASE_S3_* credentials."""
    load_env_local()


def run() -> None:
    _load_env()

    endpoint = os.environ["SUPABASE_S3_ENDPOINT"].replace("https://", "").replace("http://", "")

    print(f"storm-history-swfl: starting ingest")
    print(f"  source: NCEI index at {NOAA_BASE_URL}")
    print(f"  target: {PARQUET_TARGET}")
    print(f"  counties: {SWFL_COUNTIES_CZ}")

    urls = _list_noaa_urls(YEAR_RANGE_START, YEAR_RANGE_END)
    print(f"  files: {len(urls)} (years {YEAR_RANGE_START}-{YEAR_RANGE_END})")
    if not urls:
        raise RuntimeError(f"No NOAA files found in {YEAR_RANGE_START}-{YEAR_RANGE_END} range")

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute(f"""
        SET s3_endpoint='{endpoint}';
        SET s3_access_key_id='{os.environ["SUPABASE_S3_ACCESS_KEY_ID"]}';
        SET s3_secret_access_key='{os.environ["SUPABASE_S3_SECRET_ACCESS_KEY"]}';
        SET s3_region='us-east-1';
        SET s3_url_style='path';
        SET s3_use_ssl=true;
    """)

    urls_sql_list = ", ".join(f"'{u}'" for u in urls)
    con.execute(f"""
        CREATE TABLE staged AS
        SELECT *
        FROM read_csv_auto(
            [{urls_sql_list}],
            union_by_name=true,
            ignore_errors=true,
            null_padding=true
        )
        WHERE {swfl_filter_sql()};
    """)

    total = con.execute("SELECT count(*) FROM staged").fetchone()[0]
    hurricane = con.execute(
        "SELECT count(*) FROM staged WHERE event_type IN ('Hurricane (Typhoon)', 'Tropical Storm')"
    ).fetchone()[0]
    print(f"  staged rows: {total:,} (hurricane/TS: {hurricane:,})")
    assert_min_rows(total, MIN_TOTAL_ROWS, "storm_events_swfl total")
    assert_min_rows(hurricane, MIN_HURRICANE_ROWS, "storm_events_swfl hurricane/TS rows")

    con.execute(f"COPY staged TO '{PARQUET_TARGET}' (FORMAT PARQUET, COMPRESSION ZSTD);")

    # Get the written file's size for inventory record
    size_rows = con.execute(
        f"SELECT total_compressed_size FROM parquet_metadata('{PARQUET_TARGET}') LIMIT 1;"
    ).fetchall()
    byte_size = int(size_rows[0][0]) if size_rows else None

    # Audit-trail row
    upsert_inventory_row(
        bucket=BUCKET,
        path=PARQUET_PATH,
        vintage=VINTAGE,
        byte_size=byte_size,
        pack_id=PACK_ID,
        source_url=NOAA_URL_GLOB,
    )

    print(f"storm-history-swfl: ingest complete")
    print(f"  parquet bytes (compressed): {byte_size}")
    print(f"  inventory row upserted: id={BUCKET}/{PARQUET_PATH}")


if __name__ == "__main__":
    run()
