"""storm-history-swfl ingest: NOAA Storm Events -> Parquet in Tier 1 Storage.

Run with: python -m ingest.duckdb_pipelines.storm_history_swfl.pipeline

Outputs:
  - s3://lake-tier1/environmental/storm_events_swfl.parquet
  - one row in data_lake._tier1_inventory
"""
import os
import re
from pathlib import Path

import duckdb

from ingest.duckdb_pipelines.storm_history_swfl.constants import (
    BUCKET,
    NOAA_URL_GLOB,
    PACK_ID,
    PARQUET_PATH,
    PARQUET_TARGET,
    SWFL_COUNTIES_CZ,
    VINTAGE,
)
from ingest.lib.tier1_inventory import upsert_inventory_row


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


def _load_env() -> None:
    """Load .env.local for SUPABASE_S3_* credentials."""
    env_path = Path(__file__).parent.parent.parent.parent / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def run() -> None:
    _load_env()

    endpoint = os.environ["SUPABASE_S3_ENDPOINT"].replace("https://", "").replace("http://", "")

    print(f"storm-history-swfl: starting ingest")
    print(f"  source: {NOAA_URL_GLOB}")
    print(f"  target: {PARQUET_TARGET}")
    print(f"  counties: {SWFL_COUNTIES_CZ}")

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

    counties_sql_list = ", ".join(f"'{c}'" for c in SWFL_COUNTIES_CZ)
    con.execute(f"""
        COPY (
            SELECT *
            FROM read_csv_auto(
                '{NOAA_URL_GLOB}',
                union_by_name=true,
                ignore_errors=true,
                null_padding=true
            )
            WHERE state = 'FLORIDA'
              AND cz_name IN ({counties_sql_list})
        ) TO '{PARQUET_TARGET}' (FORMAT PARQUET, COMPRESSION ZSTD);
    """)

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
