"""Stream the free Redfin county market tracker, keep Collier County FL rows,
and merge them into data_lake.redfin_collier_market (Tier 2).

No scraping, no metered API — a plain streaming GET of a public gzipped TSV.
The file is ~240 MB compressed; we decompress incrementally and filter line by
line so the full file is never held in memory.
"""
from __future__ import annotations

import zlib
from typing import Iterator

import requests

from .constants import COLLIER_REGION, REDFIN_COUNTY_TRACKER_URL

# dlt is imported lazily inside the write path so the dry-run / streaming reader
# (requests + zlib only) works without the dlt dependency installed.

# Redfin column (uppercase, header verbatim) -> our snake_case column.
_KEEP = {
    "REGION": "region",
    "PERIOD_BEGIN": "period_begin",
    "PERIOD_END": "period_end",
    "PROPERTY_TYPE": "property_type",
    "MEDIAN_SALE_PRICE": "median_sale_price",
    "MEDIAN_SALE_PRICE_YOY": "median_sale_price_yoy",
    "HOMES_SOLD": "homes_sold",
    "INVENTORY": "inventory",
    "MONTHS_OF_SUPPLY": "months_of_supply",
    "MEDIAN_DOM": "median_dom",
    "LAST_UPDATED": "last_updated",
}
_INT_COLS = {"homes_sold", "inventory"}
_FLOAT_COLS = {"median_sale_price", "median_sale_price_yoy", "months_of_supply", "median_dom"}

# Tier-2 column hints — pin the Collier market row to explicit dlt types so the
# Postgres schema is stable across re-ingests. Composite PK (region, period_end,
# property_type): one row per region/month/property-type, idempotent merge.
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


def _unquote(s: str) -> str:
    s = s.strip()
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        return s[1:-1]
    return s


def _coerce(col: str, raw: str):
    v = _unquote(raw)
    if v == "":
        return None
    if col in _INT_COLS:
        try:
            return int(float(v))
        except ValueError:
            return None
    if col in _FLOAT_COLS:
        try:
            return float(v)
        except ValueError:
            return None
    return v


def iter_collier_rows(url: str = REDFIN_COUNTY_TRACKER_URL) -> Iterator[dict]:
    """Yield Collier County, FL rows from the gzipped county tracker as dicts.

    Streams + decompresses incrementally; a cheap substring gate skips the
    ~99.9% of lines that aren't Collier before any tab-splitting.
    """
    resp = requests.get(url, stream=True, timeout=600)
    resp.raise_for_status()
    dec = zlib.decompressobj(31)  # 31 = gzip wbits
    idx: dict[str, int] = {}
    have_header = False
    pending = ""
    for chunk in resp.iter_content(1 << 20):
        if not chunk:
            continue
        pending += dec.decompress(chunk).decode("utf-8", "replace")
        lines = pending.split("\n")
        pending = lines.pop()  # last (possibly partial) line carries to next chunk
        for line in lines:
            if not have_header:
                header = [_unquote(c) for c in line.split("\t")]
                idx = {name: i for i, name in enumerate(header)}
                have_header = True
                continue
            if COLLIER_REGION not in line:  # fast pre-filter
                continue
            cells = line.split("\t")
            region_i = idx.get("REGION")
            if region_i is None or region_i >= len(cells):
                continue
            if _unquote(cells[region_i]) != COLLIER_REGION:
                continue
            row = {}
            for src, dst in _KEEP.items():
                i = idx.get(src)
                row[dst] = _coerce(dst, cells[i]) if (i is not None and i < len(cells)) else None
            if row.get("period_end") and row.get("property_type"):
                yield row
    # flush any final buffered line
    if have_header and pending and COLLIER_REGION in pending:
        cells = pending.split("\t")
        region_i = idx.get("REGION")
        if region_i is not None and region_i < len(cells) and _unquote(cells[region_i]) == COLLIER_REGION:
            row = {}
            for src, dst in _KEEP.items():
                i = idx.get(src)
                row[dst] = _coerce(dst, cells[i]) if (i is not None and i < len(cells)) else None
            if row.get("period_end") and row.get("property_type"):
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

    Collier is a single county (~hundreds of rows across periods/property types),
    so a single merge run is well under the pooler timeout — no chunking needed.
    """
    import dlt

    from ingest.lib.guards import VolumeGuardError, assert_content_fresh

    rows = list(iter_collier_rows(url))
    if not rows:
        # An empty pull (Redfin renamed the region or moved the URL) is a REAL failure, not a
        # green no-op. Raise so the cron goes red instead of exiting 0 with stale data narrated live.
        raise VolumeGuardError(
            "redfin_collier: returned 0 rows — no Collier County rows found (check REGION filter / URL)"
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
