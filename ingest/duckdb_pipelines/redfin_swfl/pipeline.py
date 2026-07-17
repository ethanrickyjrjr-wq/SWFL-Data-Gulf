"""Redfin SWFL market tracker → Parquet in Tier 1 Storage.

Run with: python -m ingest.duckdb_pipelines.redfin_swfl.pipeline

What it does:
  1. HEADs the source and compares ETag/Last-Modified to the prior run's
     inventory row — a byte-identical source logs a LOUD "SOURCE UNCHANGED"
     (the legacy dump froze 06/02/2026 and served stale 200s for six weeks
     behind green crons; this makes that failure mode visible on run #1).
  2. Stream-downloads housing_market/monthly/all_zips.csv (~660 MB plain CSV)
     from Redfin Data Center's public S3 to a local temp file.
  3. DuckDB filters to SWFL metro ZIPs and maps the quoted vendor headers to
     snake_case columns AS-WRITTEN (percent stays percent; "NA" → NULL via
     TRY_CAST). Unit conversion to the brain's ratio/fraction contract happens
     ONCE, in refinery/sources/housing-source.mts.
  4. Guards before promote: volume floor (MIN_ROWS) + content freshness
     (newest PERIOD END within MAX_CONTENT_AGE_DAYS) — a frozen source exits 1
     RED instead of green.
  5. Writes Parquet to s3://lake-tier1/market/redfin_swfl.parquet and upserts
     the inventory row including source_etag / source_last_modified /
     max_period_end for the next run's comparison.

Update schedule: Redfin Data Center ships the monthly tracker ~the 13th–15th
(June data released Jul 13; S3 object stamped Jul 14). Cron target: 15th of
each month — after their drop, same slot as before the retarget.
"""

import argparse
import os
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

import duckdb
import requests

from .constants import (
    BUCKET,
    PACK_ID,
    PARQUET_PATH,
    PARQUET_TARGET,
    REDFIN_ZIP_URL,
    SWFL_METRO_SUBSTRINGS,
)
from ingest.lib.env_local import load_env_local
from ingest.lib.guards import assert_content_fresh, assert_min_rows
from ingest.lib.tier1_inventory import get_inventory_meta, upsert_inventory_row

# Volume floor: the live file landed 10,072 rows / 126 ZIPs on 07/16/2026
# (~80 monthly windows per ZIP; no property-type multiplication in the new
# feed — the old 67,536-row count included 5 property types). Floor sits well
# under a healthy ~10k pull and well over a truncated one.
MIN_ROWS = 6_000

# Content gate: healthy pulls are ≤ ~25 days behind (window closes end of
# month, release lands ~the 13th, cron runs the 15th). ONE frozen cycle puts
# the newest PERIOD END ≥ ~46 days back — 40 splits the two cleanly and trips
# the cron RED on the first missed cycle. Deliberately TIGHTER than the
# cadence_registry probe threshold (30d × 2.0), per guards.py doctrine.
MAX_CONTENT_AGE_DAYS = 40


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


def _head_source(url: str) -> tuple[str | None, str | None]:
    """HEAD the source; returns (etag, last_modified). Failures return Nones —
    the staleness NOTE degrades gracefully; the content GATE still protects."""
    try:
        resp = requests.head(url, timeout=60, allow_redirects=True)
        resp.raise_for_status()
        return resp.headers.get("ETag"), resp.headers.get("Last-Modified")
    except requests.RequestException as exc:
        print(f"  WARN: HEAD failed ({exc}) — skipping source-unchanged check", file=sys.stderr)
        return None, None


def _source_unchanged_note(
    prior: dict | None,
    etag: str | None,
    last_modified: str | None,
) -> str | None:
    """LOUD note when the source object is byte-identical to the prior pull.

    Not a failure by itself (mid-cycle reruns legitimately see an unchanged
    object) — the content-freshness gate decides whether it's fatal.
    """
    if not prior or not etag:
        return None
    if prior.get("source_etag") != etag:
        return None
    since = prior.get("source_last_modified") or "unknown date"
    return (
        f"SOURCE UNCHANGED: {last_modified or 'current object'} matches the prior "
        f"pull (ETag {etag}, unchanged since {since}) — this run re-lands data we "
        f"already hold. If the content gate also trips, the feed has moved or died: "
        f"check https://www.redfin.com/news/data-center/downloads/ for the current path."
    )


def _download_source(url: str, dest: Path) -> None:
    """Stream-download the source CSV to dest, showing progress."""
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
                    print(f"\r  {written / 1e6:.0f} MB / {total / 1e6:.0f} MB ({pct:.0f}%)", end="", flush=True)
    print()
    print(f"  download complete: {written / 1e6:.1f} MB")


def _build_metro_filter() -> str:
    """The new feed has NO STATE_CODE/CITY/STATE — SWFL scope rides METRO."""
    clauses = " OR ".join(
        f"\"METRO\" LIKE '%{s}%'" for s in SWFL_METRO_SUBSTRINGS
    )
    return f"\"REGION TYPE\" = 'Zip' AND ({clauses})"


def _load_and_filter(
    con: duckdb.DuckDBPyConnection, csv_path: str, ingested_at: str
) -> None:
    """CREATE TABLE redfin_swfl from the vendor CSV, SWFL rows only.

    Columns are stored AS-WRITTEN (percent stays percent, PPTS stays PPTS) with
    snake_case names carrying the unit suffix. TRY_CAST turns Redfin's literal
    "NA" into SQL NULL. Full 50-column source scope is pulled — nothing dropped
    (FULL-SCOPE-FIRST).
    """
    metro_filter = _build_metro_filter()
    print(f"  filtering: {metro_filter}")
    con.execute(f"""
        CREATE TABLE redfin_swfl AS
        SELECT
            CAST("PERIOD BEGIN" AS VARCHAR)                                  AS period_begin,
            CAST("PERIOD END" AS VARCHAR)                                    AS period_end,
            "FREQUENCY"                                                      AS frequency,
            TRY_CAST("REGION ID" AS BIGINT)                                  AS region_id,
            "REGION NAME"                                                    AS zip_code,
            "METRO"                                                          AS metro,
            TRY_CAST("HOMES SOLD" AS DOUBLE)                                 AS homes_sold,
            TRY_CAST("HOMES SOLD MOM (%)" AS DOUBLE)                         AS homes_sold_mom_pct,
            TRY_CAST("HOMES SOLD YOY (%)" AS DOUBLE)                         AS homes_sold_yoy_pct,
            TRY_CAST("MEDIAN SALE PRICE NSA ($)" AS DOUBLE)                  AS median_sale_price,
            TRY_CAST("MEDIAN SALE PRICE NSA MOM (%)" AS DOUBLE)              AS median_sale_price_mom_pct,
            TRY_CAST("MEDIAN SALE PRICE NSA YOY (%)" AS DOUBLE)              AS median_sale_price_yoy_pct,
            TRY_CAST("MEDIAN DAYS ON MARKET (DAYS)" AS DOUBLE)               AS median_dom,
            TRY_CAST("MEDIAN DAYS ON MARKET MOM (%)" AS DOUBLE)              AS median_dom_mom_pct,
            TRY_CAST("MEDIAN DAYS ON MARKET YOY (%)" AS DOUBLE)              AS median_dom_yoy_pct,
            TRY_CAST("AVERAGE SALE TO LIST RATIO (%)" AS DOUBLE)             AS avg_sale_to_list_pct,
            TRY_CAST("AVERAGE SALE TO LIST RATIO MOM (PPTS)" AS DOUBLE)      AS avg_sale_to_list_mom_ppts,
            TRY_CAST("AVERAGE SALE TO LIST RATIO YOY (PPTS)" AS DOUBLE)      AS avg_sale_to_list_yoy_ppts,
            TRY_CAST("SHARE SOLD ABOVE ORIGINAL LIST (%)" AS DOUBLE)         AS sold_above_list_pct,
            TRY_CAST("SHARE SOLD ABOVE ORIGINAL LIST MOM (PPTS)" AS DOUBLE)  AS sold_above_list_mom_ppts,
            TRY_CAST("SHARE SOLD ABOVE ORIGINAL LIST YOY (PPTS)" AS DOUBLE)  AS sold_above_list_yoy_ppts,
            TRY_CAST("NEW LISTINGS" AS DOUBLE)                               AS new_listings,
            TRY_CAST("NEW LISTINGS MOM (%)" AS DOUBLE)                       AS new_listings_mom_pct,
            TRY_CAST("NEW LISTINGS YOY (%)" AS DOUBLE)                       AS new_listings_yoy_pct,
            TRY_CAST("ACTIVE LISTINGS" AS DOUBLE)                            AS active_listings,
            TRY_CAST("ACTIVE LISTINGS MOM (%)" AS DOUBLE)                    AS active_listings_mom_pct,
            TRY_CAST("ACTIVE LISTINGS YOY (%)" AS DOUBLE)                    AS active_listings_yoy_pct,
            TRY_CAST("INVENTORY" AS DOUBLE)                                  AS inventory,
            TRY_CAST("INVENTORY MOM (%)" AS DOUBLE)                          AS inventory_mom_pct,
            TRY_CAST("INVENTORY YOY (%)" AS DOUBLE)                          AS inventory_yoy_pct,
            TRY_CAST("PENDING SALES" AS DOUBLE)                              AS pending_sales,
            TRY_CAST("PENDING SALES MOM (%)" AS DOUBLE)                      AS pending_sales_mom_pct,
            TRY_CAST("PENDING SALES YOY (%)" AS DOUBLE)                      AS pending_sales_yoy_pct,
            TRY_CAST("MEDIAN NEW LISTING PRICE ($)" AS DOUBLE)               AS median_new_listing_price,
            TRY_CAST("MEDIAN NEW LISTING PRICE MOM (%)" AS DOUBLE)           AS median_new_listing_price_mom_pct,
            TRY_CAST("MEDIAN NEW LISTING PRICE YOY (%)" AS DOUBLE)           AS median_new_listing_price_yoy_pct,
            TRY_CAST("MEDIAN NEW LISTING PRICE PER SQ.FT. ($)" AS DOUBLE)    AS median_new_listing_ppsf,
            TRY_CAST("MEDIAN NEW LISTING PRICE PER SQ.FT. MOM (%)" AS DOUBLE) AS median_new_listing_ppsf_mom_pct,
            TRY_CAST("MEDIAN NEW LISTING PRICE PER SQ.FT. YOY (%)" AS DOUBLE) AS median_new_listing_ppsf_yoy_pct,
            TRY_CAST("MEDIAN SALE PRICE PER SQ.FT. ($)" AS DOUBLE)           AS median_ppsf,
            TRY_CAST("MEDIAN SALE PRICE PER SQ.FT. MOM (%)" AS DOUBLE)       AS median_ppsf_mom_pct,
            TRY_CAST("MEDIAN SALE PRICE PER SQ.FT. YOY (%)" AS DOUBLE)       AS median_ppsf_yoy_pct,
            TRY_CAST("MONTHS OF SUPPLY" AS DOUBLE)                           AS months_of_supply,
            TRY_CAST("MONTHS OF SUPPLY MOM (%)" AS DOUBLE)                   AS months_of_supply_mom_pct,
            TRY_CAST("MONTHS OF SUPPLY YOY (%)" AS DOUBLE)                   AS months_of_supply_yoy_pct,
            TRY_CAST("PERCENT OFF MARKET IN TWO WEEKS (%)" AS DOUBLE)        AS off_market_in_two_weeks_pct,
            TRY_CAST("PERCENT OFF MARKET IN TWO WEEKS MOM (PPTS)" AS DOUBLE) AS off_market_in_two_weeks_mom_ppts,
            TRY_CAST("PERCENT OFF MARKET IN TWO WEEKS YOY (PPTS)" AS DOUBLE) AS off_market_in_two_weeks_yoy_ppts,
            CAST("LAST UPDATED" AS VARCHAR)                                  AS last_updated,
            '{ingested_at}'                                                  AS ingested_at
        FROM read_csv('{csv_path}', header=true, quote='"')
        WHERE {metro_filter}
    """)


def _assert_volume(row_count: int) -> None:
    assert_min_rows(row_count, MIN_ROWS, label="redfin_swfl")


def _assert_content_fresh_from(
    con: duckdb.DuckDBPyConnection, today: date | None = None
) -> str | None:
    """Gate: newest PERIOD END must be recent, or the run exits RED."""
    newest = con.execute("SELECT MAX(period_end) FROM redfin_swfl").fetchone()[0]
    assert_content_fresh(newest, MAX_CONTENT_AGE_DAYS, label="redfin_swfl", today=today)
    return newest


def run(*, target: str = PARQUET_TARGET) -> None:
    load_env_local()
    ingested_at = datetime.now(timezone.utc).isoformat()
    vintage = date.today().isoformat()

    print("redfin-swfl: starting ingest")
    print(f"  source: {REDFIN_ZIP_URL}")
    print(f"  target: {target}")

    # Tripwire note: is the source object the same bytes we already pulled?
    etag, last_modified = _head_source(REDFIN_ZIP_URL)
    prior = None
    if target.startswith("s3://"):
        try:
            prior = get_inventory_meta(bucket=BUCKET, path=PARQUET_PATH)
        except Exception as exc:  # DB unreachable → note degrades, gate still runs
            print(f"  WARN: inventory meta read failed ({exc})", file=sys.stderr)
    note = _source_unchanged_note(prior, etag, last_modified)
    if note:
        print(f"  ⚠ {note}", file=sys.stderr)

    con = duckdb.connect()
    if target.startswith("s3://"):
        _configure_s3(con)

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_file = Path(tmp_dir) / "housing_market_all_zips.csv"

        _download_source(REDFIN_ZIP_URL, tmp_file)
        _load_and_filter(con, str(tmp_file), ingested_at)

        row_count = con.execute("SELECT COUNT(*) FROM redfin_swfl").fetchone()[0]
        zip_count = con.execute(
            "SELECT COUNT(DISTINCT zip_code) FROM redfin_swfl"
        ).fetchone()[0]
        print(f"  rows loaded: {row_count:,} across {zip_count} ZIP codes")

        # Guards (Gate 4): both raise → non-zero exit → cron RED.
        _assert_volume(row_count)
        max_period_end = _assert_content_fresh_from(con)
        print(f"  newest window ends: {max_period_end}")

        con.execute(f"COPY redfin_swfl TO '{target}' (FORMAT PARQUET, COMPRESSION ZSTD)")
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
            source_url=REDFIN_ZIP_URL,
            source_etag=etag,
            source_last_modified=last_modified,
            max_period_end=max_period_end,
        )
        print("  inventory row upserted")

    print("redfin-swfl: ingest complete")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip download, filter, and S3 write; print what would run.",
    )
    args = p.parse_args(argv)

    if args.dry_run:
        print(f"redfin_swfl dry-run: would download {REDFIN_ZIP_URL}")
        print(f"redfin_swfl dry-run: would write to {PARQUET_TARGET}")
        return 0

    try:
        run()
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        sys.exit(130)
    return 0


if __name__ == "__main__":
    main()
