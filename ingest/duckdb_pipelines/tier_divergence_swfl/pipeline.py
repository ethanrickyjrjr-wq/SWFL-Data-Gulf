"""Zillow ZHVI tier-divergence SWFL (top vs bottom tier) → Parquet in Tier 1 Storage.

Run with: python -m ingest.duckdb_pipelines.tier_divergence_swfl.pipeline

What it does:
  1. Stream-downloads BOTH ZIP-level all-homes RAW ZHVI tier CSVs from
     files.zillowstatic.com (bottom 0.0–0.33 + top 0.67–1.0) to local temp files.
  2. DuckDB filters each to FL + four SWFL MSAs, UNPIVOTs the wide month columns
     to long form (zip × period_end × value), then FULL OUTER JOINs the two
     tiers on (zip_code, period_end) — COALESCEing metadata across them — and
     writes ZSTD Parquet to s3://lake-tier1/market/tier_divergence_swfl.parquet.
     Rows where BOTH tiers are NULL are dropped; single-tier history is kept.
  3. Upserts one row in data_lake._tier1_inventory.

RAW (not seasonally adjusted): Zillow ships no `_sm_sa` tier variant — the
consuming brain leans on YoY (cancels seasonality); raw level / MoM are noisy.

The temp-file step mirrors zhvi_swfl — keeps S3-write credentials cleanly
isolated from the public source-bucket fetch.

Update schedule: Zillow Research refreshes monthly (~3rd week of the month
for the prior month). Cron target: 21st of each month.
"""

import os
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

import duckdb
import requests

from .constants import (
    BOTTOM_CSV_URL,
    BUCKET,
    METADATA_COLUMNS,
    PACK_ID,
    PARQUET_PATH,
    PARQUET_TARGET,
    REGION_TYPE,
    STATE_CODE,
    SWFL_METRO_SUBSTRINGS,
    TOP_CSV_URL,
)
from ingest.lib.tier1_inventory import upsert_inventory_row


def _load_env() -> None:
    env_path = Path(__file__).parent.parent.parent.parent / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def _configure_s3(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("INSTALL httpfs; LOAD httpfs;")
    endpoint = (
        os.environ["SUPABASE_S3_ENDPOINT"]
        .replace("https://", "")
        .replace("http://", "")
    )
    con.execute(f"""
        SET s3_endpoint='{endpoint}';
        SET s3_access_key_id='{os.environ["SUPABASE_S3_ACCESS_KEY_ID"]}';
        SET s3_secret_access_key='{os.environ["SUPABASE_S3_SECRET_ACCESS_KEY"]}';
        SET s3_region='us-east-1';
        SET s3_url_style='path';
        SET s3_use_ssl=true;
    """)


def _download_source(url: str, dest: Path) -> None:
    print(f"  downloading {url}")
    with requests.get(url, stream=True, timeout=300) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        written = 0
        with dest.open("wb") as f:
            for chunk in resp.iter_content(chunk_size=8 * 1024 * 1024):
                f.write(chunk)
                written += len(chunk)
                if total:
                    pct = written / total * 100
                    print(
                        f"\r  {written / 1e6:.1f} MB / {total / 1e6:.1f} MB ({pct:.0f}%)",
                        end="",
                        flush=True,
                    )
    print()
    print(f"  download complete: {written / 1e6:.2f} MB")


def _build_metro_filter() -> str:
    clauses = " OR ".join(
        f"Metro LIKE '%{s}%'" for s in SWFL_METRO_SUBSTRINGS
    )
    return (
        f"State = '{STATE_CODE}' AND RegionType = '{REGION_TYPE}' AND ({clauses})"
    )


def _exclude_clause() -> str:
    """`EXCLUDE (col1, col2, …)` fragment for the UNPIVOT — preserves
    metadata columns while melting everything else."""
    return "(" + ", ".join(METADATA_COLUMNS) + ")"


def _tier_cte(alias: str, csv_path: Path, metro_filter: str, exclude_clause: str) -> str:
    """One tier's wide→melted→typed CTE chain, aliased so the two tiers can be
    declared side-by-side and FULL OUTER JOINed. Yields columns
    (zip_code, period_end, value, metro, county_name, city) for `alias`."""
    return f"""
        {alias} AS (
            WITH wide AS (
                SELECT *
                FROM read_csv_auto('{csv_path.as_posix()}', header=true, quote='"')
                WHERE {metro_filter}
            ),
            melted AS (
                UNPIVOT wide
                ON COLUMNS(* EXCLUDE {exclude_clause})
                INTO NAME period_end_str VALUE value_raw
            )
            SELECT
                CAST(RegionName AS VARCHAR)    AS zip_code,
                CAST(period_end_str AS DATE)   AS period_end,
                CAST(value_raw AS DOUBLE)      AS value,
                Metro                          AS metro,
                CountyName                     AS county_name,
                City                           AS city
            FROM melted
            WHERE value_raw IS NOT NULL
        )
    """


def run(
    *,
    target: str = PARQUET_TARGET,
    bottom_source_csv: str | None = None,
    top_source_csv: str | None = None,
) -> None:
    """Run the pipeline.

    Args:
        target: Parquet target. Defaults to the Tier 1 S3 path; tests pass
            a local file path to keep the run hermetic.
        bottom_source_csv: Optional pre-downloaded bottom-tier CSV path. When
            set, skips the HTTP download (useful for tests and re-runs).
        top_source_csv: Optional pre-downloaded top-tier CSV path. When set,
            skips the HTTP download (useful for tests and re-runs).
    """
    _load_env()
    ingested_at = datetime.now(timezone.utc).isoformat()
    vintage = date.today().isoformat()

    print("tier-divergence-swfl: starting ingest")
    print(f"  bottom source: {bottom_source_csv or BOTTOM_CSV_URL}")
    print(f"  top source:    {top_source_csv or TOP_CSV_URL}")
    print(f"  target: {target}")

    con = duckdb.connect()
    if target.startswith("s3://"):
        _configure_s3(con)

    with tempfile.TemporaryDirectory() as tmp_dir:
        if bottom_source_csv:
            bottom_path = Path(bottom_source_csv)
            if not bottom_path.exists():
                print(f"  ERROR: bottom source CSV not found: {bottom_path}", file=sys.stderr)
                sys.exit(1)
        else:
            bottom_path = Path(tmp_dir) / "zhvi_zip_bottom_tier.csv"
            _download_source(BOTTOM_CSV_URL, bottom_path)

        if top_source_csv:
            top_path = Path(top_source_csv)
            if not top_path.exists():
                print(f"  ERROR: top source CSV not found: {top_path}", file=sys.stderr)
                sys.exit(1)
        else:
            top_path = Path(tmp_dir) / "zhvi_zip_top_tier.csv"
            _download_source(TOP_CSV_URL, top_path)

        metro_filter = _build_metro_filter()
        exclude_clause = _exclude_clause()
        print(f"  filtering: {metro_filter}")

        # CTE chain (per tier):
        #   wide:   filter the wide CSV down to SWFL ZIPs (still wide).
        #   melted: UNPIVOT every non-metadata column into (period_end_str, value).
        #   typed:  cast + clean.
        # Then FULL OUTER JOIN the two tiers on (zip_code, period_end), COALESCE
        # metadata across them, and keep rows where ≥1 tier is non-null.
        bottom_cte = _tier_cte("bottom", bottom_path, metro_filter, exclude_clause)
        top_cte = _tier_cte("top", top_path, metro_filter, exclude_clause)
        con.execute(f"""
            CREATE TABLE tier_divergence_swfl AS
            WITH
            {bottom_cte},
            {top_cte}
            SELECT
                COALESCE(t.zip_code, b.zip_code)        AS zip_code,
                COALESCE(t.period_end, b.period_end)    AS period_end,
                t.value                                 AS top_tier_value,
                b.value                                 AS bottom_tier_value,
                COALESCE(t.metro, b.metro)              AS metro,
                COALESCE(t.county_name, b.county_name)  AS county_name,
                COALESCE(t.city, b.city)                AS city,
                '{ingested_at}'                         AS ingested_at
            FROM top t
            FULL OUTER JOIN bottom b
                ON t.zip_code = b.zip_code
               AND t.period_end = b.period_end
            WHERE t.value IS NOT NULL OR b.value IS NOT NULL
        """)

        row_count = con.execute("SELECT COUNT(*) FROM tier_divergence_swfl").fetchone()[0]
        zip_count = con.execute(
            "SELECT COUNT(DISTINCT zip_code) FROM tier_divergence_swfl"
        ).fetchone()[0]
        metro_count = con.execute(
            "SELECT COUNT(DISTINCT metro) FROM tier_divergence_swfl"
        ).fetchone()[0]
        date_range = con.execute(
            "SELECT MIN(period_end), MAX(period_end) FROM tier_divergence_swfl"
        ).fetchone()
        print(
            f"  rows loaded: {row_count:,} across {zip_count} ZIPs in {metro_count} MSAs"
        )
        print(f"  period range: {date_range[0]} to {date_range[1]}")

        if row_count == 0:
            print("  ERROR: zero rows matched the filter — aborting", file=sys.stderr)
            sys.exit(1)

        con.execute(
            f"COPY tier_divergence_swfl TO '{target}' (FORMAT PARQUET, COMPRESSION ZSTD)"
        )
        print(f"  Parquet written: {target}")

    if target.startswith("s3://"):
        byte_size = con.execute(
            f"SELECT total_compressed_size FROM parquet_metadata('{target}') LIMIT 1"
        ).fetchone()
        upsert_inventory_row(
            bucket=BUCKET,
            path=PARQUET_PATH,
            vintage=vintage,
            byte_size=int(byte_size[0]) if byte_size else None,
            pack_id=PACK_ID,
            source_url=f"{BOTTOM_CSV_URL} + {TOP_CSV_URL}",
        )
        print("  inventory row upserted")

    print("tier-divergence-swfl: ingest complete")


def main() -> None:
    try:
        run()
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        sys.exit(130)


if __name__ == "__main__":
    main()
