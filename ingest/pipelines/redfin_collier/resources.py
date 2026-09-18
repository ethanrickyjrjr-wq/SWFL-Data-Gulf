"""Stream the free Redfin county market tracker, keep Collier County rows,
and merge them into data_lake.redfin_collier_market (Tier 2).

No scraping, no metered API — a plain streaming GET of a public CSV. We parse
line by line so the full file is never held in memory.

RETARGETED 09/17/2026 to redfin_data_center/housing_market/monthly/all_counties.csv
(the legacy gzipped TSV froze at Last-Modified ~06/02/2026 — see constants.py).
New-feed contract, verified against the live bytes 09/17/2026:
  - plain CSV, quoted headers like "REGION NAME" / "MEDIAN SALE PRICE NSA ($)"
  - literal "NA" as the null marker (legacy used empty strings)
  - YoY is PERCENT (e.g. 0.5); legacy stored FRACTIONS (e.g. 0.005) — we
    convert /100 at ingest so the column's contract survives the retarget
  - no PROPERTY_TYPE column (all-residential rollup) — HEADLINE_PROPERTY_TYPE
    is stamped so the merge PK keeps working
"""
from __future__ import annotations

import csv
from typing import Iterator

import requests

from .constants import COLLIER_REGION, HEADLINE_PROPERTY_TYPE, MIN_ROWS, REDFIN_COUNTY_TRACKER_URL

# dlt is imported lazily inside the write path so the dry-run / streaming reader
# (requests + csv only) works without the dlt dependency installed.

# Redfin column (new-feed header verbatim) -> our snake_case column.
_KEEP = {
    "REGION NAME": "region",
    "PERIOD BEGIN": "period_begin",
    "PERIOD END": "period_end",
    "MEDIAN SALE PRICE NSA ($)": "median_sale_price",
    "MEDIAN SALE PRICE NSA YOY (%)": "median_sale_price_yoy",
    "HOMES SOLD": "homes_sold",
    "INVENTORY": "inventory",
    "MONTHS OF SUPPLY": "months_of_supply",
    "MEDIAN DAYS ON MARKET (DAYS)": "median_dom",
    "LAST UPDATED": "last_updated",
}
_INT_COLS = {"homes_sold", "inventory"}
_FLOAT_COLS = {"median_sale_price", "median_sale_price_yoy", "months_of_supply", "median_dom"}
# New feed publishes these as PERCENT; the table's contract (and every prior row)
# is a FRACTION. Converted here, once, at ingest.
_PCT_TO_FRACTION_COLS = {"median_sale_price_yoy"}

# Tier-2 column hints — pin the Collier market row to explicit dlt types so the
# Postgres schema is stable across re-ingests. Composite PK (region, period_end,
# property_type): one row per region/month (property_type is a constant stamp
# post-retarget, kept in the PK so it merges cleanly over legacy per-type rows).
_TIER2_COLUMNS: dict = {
    "region":                {"data_type": "text",   "nullable": False, "primary_key": True},
    "period_end":            {"data_type": "date",   "nullable": False, "primary_key": True},
    "property_type":         {"data_type": "text",   "nullable": False, "primary_key": True},
    "period_begin":          {"data_type": "date",   "nullable": True},
    "median_sale_price":     {"data_type": "double", "nullable": True},
    "median_sale_price_yoy": {"data_type": "double", "nullable": True},  # fraction, e.g. 0.0378
    "homes_sold":            {"data_type": "bigint", "nullable": True},
    "inventory":             {"data_type": "bigint", "nullable": True},
    "months_of_supply":      {"data_type": "double", "nullable": True},
    "median_dom":            {"data_type": "double", "nullable": True},
    "last_updated":          {"data_type": "text",   "nullable": True},
}


def _coerce(col: str, raw: str):
    v = raw.strip()
    if v == "" or v == "NA":  # new feed writes literal "NA"; legacy wrote ""
        return None
    if col in _INT_COLS:
        try:
            return int(float(v))
        except ValueError:
            return None
    if col in _FLOAT_COLS:
        try:
            f = float(v)
        except ValueError:
            return None
        return f / 100.0 if col in _PCT_TO_FRACTION_COLS else f
    return v


def _row_from_cells(cells: list[str], idx: dict[str, int]) -> dict | None:
    """Build one kept row if REGION TYPE is County and REGION NAME is Collier."""
    region_i = idx.get("REGION NAME")
    type_i = idx.get("REGION TYPE")
    if region_i is None or region_i >= len(cells):
        return None
    if type_i is not None and type_i < len(cells) and cells[type_i].strip() != "County":
        return None
    if cells[region_i].strip() != COLLIER_REGION:
        return None
    row: dict = {"property_type": HEADLINE_PROPERTY_TYPE}
    for src, dst in _KEEP.items():
        i = idx.get(src)
        row[dst] = _coerce(dst, cells[i]) if (i is not None and i < len(cells)) else None
    if row.get("period_end"):
        return row
    return None


def iter_collier_rows(url: str = REDFIN_COUNTY_TRACKER_URL) -> Iterator[dict]:
    """Yield Collier County, FL rows from the CSV county tracker as dicts.

    Streams line by line; a cheap substring gate skips the ~99.7% of lines
    that aren't Collier before any CSV parsing (the parsed-cell check in
    _row_from_cells is the correctness filter).
    """
    resp = requests.get(url, stream=True, timeout=600)
    resp.raise_for_status()
    idx: dict[str, int] = {}
    have_header = False
    pending = ""
    for chunk in resp.iter_content(1 << 20):
        if not chunk:
            continue
        pending += chunk.decode("utf-8", "replace")
        lines = pending.split("\n")
        pending = lines.pop()  # last (possibly partial) line carries to next chunk
        for line in lines:
            line = line.rstrip("\r")
            if not line:
                continue
            if not have_header:
                header = next(csv.reader([line]))
                idx = {name.strip(): i for i, name in enumerate(header)}
                have_header = True
                continue
            if COLLIER_REGION not in line:  # fast pre-filter
                continue
            row = _row_from_cells(next(csv.reader([line])), idx)
            if row is not None:
                yield row
    # flush any final buffered line
    final = pending.rstrip("\r")
    if have_header and final and COLLIER_REGION in final:
        row = _row_from_cells(next(csv.reader([final])), idx)
        if row is not None:
            yield row
    resp.close()


def _make_resource(rows: list[dict]):
    """Zero-arg dlt resource factory (closes over `rows` to dodge dlt's
    mutable-default-arg spec error — same pattern as the leepa loader)."""
    import dlt

    @dlt.resource(
        table_name="redfin_collier_market",
        write_disposition="merge",
        primary_key=("region", "period_end", "property_type"),
        columns=_TIER2_COLUMNS,
    )
    def redfin_collier_rows():
        yield from rows

    return redfin_collier_rows


def ingest_redfin_collier(url: str = REDFIN_COUNTY_TRACKER_URL) -> int:
    """Download + filter + merge Collier rows into data_lake.redfin_collier_market.

    Collier is a single county (~hundreds of rows across periods), so a single
    merge run is well under the pooler timeout — no chunking needed.
    """
    import dlt

    from ingest.lib.guards import VolumeGuardError, assert_content_fresh

    rows = list(iter_collier_rows(url))
    if len(rows) < MIN_ROWS:
        # A thin pull (Redfin renamed the region, moved the URL, or the merge table's
        # cumulative count is masking a quiet source) is a REAL failure, not a green
        # no-op — the count_table floor alone never catches this on a merge write.
        raise VolumeGuardError(
            f"redfin_collier: returned {len(rows)} rows, below MIN_ROWS={MIN_ROWS} "
            "(check REGION filter / URL)"
        )
    # Content-freshness: the newest period_end the source produced THIS run (ISO text). Monthly
    # tracker → 55d gate (content lag + one cadence + buffer), tighter than the daily probe's 62d
    # so a multi-month Redfin stall trips the cron red pre-promote instead of re-merging stale rows.
    newest_period_end = max(r["period_end"] for r in rows if r.get("period_end"))
    assert_content_fresh(newest_period_end, 55, label="redfin_collier")
    pipeline = dlt.pipeline(
        pipeline_name="redfin_collier",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(_make_resource(rows)())
    load_info.raise_on_failed_jobs()
    print(f"redfin_collier: merged {len(rows)} Collier rows into data_lake.redfin_collier_market")
    return len(rows)
