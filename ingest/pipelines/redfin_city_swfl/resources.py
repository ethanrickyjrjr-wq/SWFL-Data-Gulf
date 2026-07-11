"""Stream the free Redfin CITY market tracker, keep the three SWFL desk-hero
cities, and merge them into data_lake.redfin_city_swfl (Tier 2).

No scraping, no metered API — a plain streaming GET of a public gzipped TSV
(~1 GB compressed). We decompress incrementally and filter line by line so the
full file is never held in memory.

write_disposition: merge with composite PK (region, period_end, property_type),
same idempotent contract as redfin_lee/redfin_collier — each monthly refresh
adds new rows or revises existing ones; re-running never re-ingests from scratch.
"""
from __future__ import annotations

import zlib
from typing import Iterator

import requests

from .constants import CITY_REGIONS, REDFIN_CITY_TRACKER_URL, REGION_TO_AREA

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

# Tier-2 column hints — pin explicit dlt types so the Postgres schema is stable
# across re-ingests. `area` is our desk slug derived from the exact REGION.
_TIER2_COLUMNS: dict = {
    "region":                {"data_type": "text",   "nullable": False, "primary_key": True},
    "period_end":            {"data_type": "date",   "nullable": False, "primary_key": True},
    "property_type":         {"data_type": "text",   "nullable": False, "primary_key": True},
    "area":                  {"data_type": "text",   "nullable": False},
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


def _row_from_cells(cells: list[str], idx: dict[str, int]) -> dict | None:
    """Build one kept row if REGION is EXACTLY one of our three cities, else None.
    Exact match (not the substring gate) so 'North Fort Myers, FL' etc. are dropped."""
    region_i = idx.get("REGION")
    if region_i is None or region_i >= len(cells):
        return None
    region = _unquote(cells[region_i])
    if region not in REGION_TO_AREA:
        return None
    row: dict = {"area": REGION_TO_AREA[region]}
    for src, dst in _KEEP.items():
        i = idx.get(src)
        row[dst] = _coerce(dst, cells[i]) if (i is not None and i < len(cells)) else None
    if row.get("period_end") and row.get("property_type"):
        return row
    return None


def iter_city_rows(url: str = REDFIN_CITY_TRACKER_URL) -> Iterator[dict]:
    """Yield the three SWFL cities' rows from the gzipped city tracker as dicts.

    Streams + decompresses incrementally; a cheap substring gate skips the
    ~99.9% of lines that aren't one of our cities before any tab-splitting.
    """
    resp = requests.get(url, stream=True, timeout=900)
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
            if not any(c in line for c in CITY_REGIONS):  # fast pre-filter
                continue
            row = _row_from_cells(line.split("\t"), idx)
            if row is not None:
                yield row
    # flush any final buffered line
    if have_header and pending and any(c in pending for c in CITY_REGIONS):
        row = _row_from_cells(pending.split("\t"), idx)
        if row is not None:
            yield row
    resp.close()


def _make_resource(rows: list[dict]):
    """Zero-arg dlt resource factory (closes over `rows` to dodge dlt's
    mutable-default-arg spec error — same pattern as redfin_lee)."""
    import dlt

    @dlt.resource(
        table_name="redfin_city_swfl",
        write_disposition="merge",
        primary_key=("region", "period_end", "property_type"),
        columns=_TIER2_COLUMNS,
    )
    def redfin_city_rows():
        yield from rows

    return redfin_city_rows


def ingest_redfin_city(url: str = REDFIN_CITY_TRACKER_URL) -> int:
    """Download + filter + merge the three SWFL cities into data_lake.redfin_city_swfl."""
    import dlt

    from ingest.lib.guards import VolumeGuardError, assert_content_fresh

    rows = list(iter_city_rows(url))
    if not rows:
        # An empty pull (Redfin renamed a REGION or moved the URL) is a REAL failure, not a
        # green no-op. Raise so the cron goes red instead of exiting 0 with stale data narrated live.
        raise VolumeGuardError(
            "redfin_city_swfl: returned 0 rows — no Cape Coral/Fort Myers/Naples rows found "
            "(check CITY_REGIONS filter / URL)"
        )
    # Content-freshness: the newest period_end the source produced THIS run (ISO text). Monthly
    # tracker -> 55d gate (content lag + one cadence + buffer), matching redfin_lee.
    newest_period_end = max(r["period_end"] for r in rows if r.get("period_end"))
    assert_content_fresh(newest_period_end, 55, label="redfin_city_swfl")
    pipeline = dlt.pipeline(
        pipeline_name="redfin_city_swfl",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(_make_resource(rows)())
    load_info.raise_on_failed_jobs()
    print(f"redfin_city_swfl: merged {len(rows)} SWFL city rows into data_lake.redfin_city_swfl")
    return len(rows)
