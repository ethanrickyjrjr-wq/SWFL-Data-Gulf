"""Stream the free Redfin CITY market tracker, keep EVERY Florida city, and
merge them into data_lake.redfin_city_swfl (Tier 2). Separation (desk-hero trio,
future Bonita/Estero/Marco reads) happens in the lake, not at ingest.

No scraping, no metered API — a plain streaming GET of a public CSV (~536 MB).
We parse line by line so the full file is never held in memory.

RETARGETED 08/10/2026 to redfin_data_center/housing_market/monthly/all_cities.csv
(the legacy gzipped TSV froze at Last-Modified 06/02/2026 — see constants.py).
New-feed contract, verified against the live bytes 08/10/2026:
  - plain CSV, quoted headers like "REGION NAME" / "MEDIAN SALE PRICE NSA ($)"
  - literal "NA" as the null marker (legacy used empty strings)
  - YoY is PERCENT (e.g. -5.51); legacy stored FRACTIONS (e.g. -0.0551) — we
    convert /100 at ingest so the column's contract survives the retarget
  - no PROPERTY_TYPE column (all-residential rollup) — HEADLINE_PROPERTY_TYPE
    is stamped so the desk filter + merge PK keep working
  - duplicate REGION NAMEs with distinct REGION IDs exist (two "Aaronsburg, PA"
    rows in one period, live 08/10/2026) — dedupe_city_rows keeps the fattest
    twin per (region, period_end) so the merge PK can't silently clobber

write_disposition: merge with composite PK (region, period_end, property_type),
same idempotent contract as redfin_lee/redfin_collier — each monthly refresh
adds new rows or revises existing ones; re-running never re-ingests from scratch.
"""
from __future__ import annotations

import csv
import re
from typing import Iterator

import requests

from .constants import (
    DESK_HERO_REGIONS,
    FL_REGION_SUFFIX,
    HEADLINE_PROPERTY_TYPE,
    REDFIN_CITY_TRACKER_URL,
    REGION_TO_AREA,
)

# dlt is imported lazily inside the write path so the dry-run / streaming reader
# (requests + csv only) works without the dlt dependency installed.

# Redfin column (new-feed header verbatim) -> our snake_case column.
_KEEP = {
    "REGION NAME": "region",
    "REGION ID": "region_id",
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
_INT_COLS = {"homes_sold", "inventory", "region_id"}
_FLOAT_COLS = {"median_sale_price", "median_sale_price_yoy", "months_of_supply", "median_dom"}
# New feed publishes these as PERCENT; the table's contract (and every prior row)
# is a FRACTION. Converted here, once, at ingest.
_PCT_TO_FRACTION_COLS = {"median_sale_price_yoy"}

# Tier-2 column hints — pin explicit dlt types so the Postgres schema is stable
# across re-ingests. `area` is our desk slug derived from the exact REGION NAME.
# `region_id` is new-feed provenance (nullable — legacy rows predate it).
_TIER2_COLUMNS: dict = {
    "region":                {"data_type": "text",   "nullable": False, "primary_key": True},
    "period_end":            {"data_type": "date",   "nullable": False, "primary_key": True},
    "property_type":         {"data_type": "text",   "nullable": False, "primary_key": True},
    "area":                  {"data_type": "text",   "nullable": False},
    "region_id":             {"data_type": "bigint", "nullable": True},
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


def _area_slug(region: str) -> str:
    """Derived desk slug for ANY FL region: 'Cape Coral, FL' -> 'cape_coral',
    'Port St. Lucie, FL' -> 'port_st_lucie'. Pinned against REGION_TO_AREA by
    tests so the hero trio's slugs can never drift."""
    name = region[: -len(FL_REGION_SUFFIX)] if region.endswith(FL_REGION_SUFFIX) else region
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def _row_from_cells(cells: list[str], idx: dict[str, int]) -> dict | None:
    """Build one kept row if REGION TYPE is City and REGION NAME is a Florida
    city (suffix-exact ', FL'), else None — 'Naples, ME' / other states are
    dropped on the parsed cell, never on the raw line."""
    region_i = idx.get("REGION NAME")
    type_i = idx.get("REGION TYPE")
    if region_i is None or region_i >= len(cells):
        return None
    if type_i is not None and type_i < len(cells) and cells[type_i].strip() != "City":
        return None
    region = cells[region_i].strip()
    if not region.endswith(FL_REGION_SUFFIX):
        return None
    row: dict = {"area": _area_slug(region), "property_type": HEADLINE_PROPERTY_TYPE}
    for src, dst in _KEEP.items():
        i = idx.get(src)
        row[dst] = _coerce(dst, cells[i]) if (i is not None and i < len(cells)) else None
    if row.get("period_end"):
        return row
    return None


def iter_city_rows(url: str = REDFIN_CITY_TRACKER_URL) -> Iterator[dict]:
    """Yield every Florida city's rows from the CSV city tracker as dicts.

    Streams line by line; a cheap substring gate skips the ~97% of lines that
    aren't Florida before any CSV parsing (the parsed-cell suffix check in
    _row_from_cells is the correctness filter). csv.reader handles the quoted
    embedded comma in "Cape Coral, FL"; the feed has no quoted newlines
    (verified against the live bytes 08/10/2026).
    """
    resp = requests.get(url, stream=True, timeout=900)
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
            if FL_REGION_SUFFIX not in line:  # fast pre-filter
                continue
            row = _row_from_cells(next(csv.reader([line])), idx)
            if row is not None:
                yield row
    # flush any final buffered line
    final = pending.rstrip("\r")
    if have_header and final and FL_REGION_SUFFIX in final:
        row = _row_from_cells(next(csv.reader([final])), idx)
        if row is not None:
            yield row
    resp.close()


def dedupe_city_rows(rows: list[dict]) -> list[dict]:
    """One row per (region, period_end): the new feed carries duplicate REGION
    NAMEs with distinct REGION IDs (live 08/10/2026: two 'Aaronsburg, PA' rows
    in the same period). The merge PK is name-grain, so without this the last
    twin written wins ARBITRARILY. Keep the fattest twin (most homes_sold, then
    highest region_id as the deterministic tie-break) — same rule the desk
    already applies to duplicate rollups (lib/desk/loaders.ts reduceActiveStats).
    """
    best: dict[tuple, dict] = {}
    for r in rows:
        key = (r["region"], r["period_end"])
        prev = best.get(key)
        if prev is None or _fatness(r) > _fatness(prev):
            best[key] = r
    return list(best.values())


def _fatness(r: dict) -> tuple:
    return (r.get("homes_sold") or -1, r.get("region_id") or -1)


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
    """Download + filter + merge every FL city into data_lake.redfin_city_swfl."""
    import dlt

    from ingest.lib.guards import VolumeGuardError, assert_content_fresh

    rows = dedupe_city_rows(list(iter_city_rows(url)))
    if not rows:
        # An empty pull (Redfin changed the REGION format or moved the URL) is a REAL failure,
        # not a green no-op. Raise so the cron goes red instead of exiting 0 with stale data.
        raise VolumeGuardError(
            "redfin_city_swfl: returned 0 rows — no ', FL' regions found (check URL / REGION format)"
        )
    # Landing guard on the load-bearing consumer: the desk hero reads these three. A pull that
    # is broadly fine but lost one of them (Redfin renamed a REGION) must go red, not green.
    got_regions = {r["region"] for r in rows}
    missing = [c for c in DESK_HERO_REGIONS if c not in got_regions]
    if missing:
        raise VolumeGuardError(f"redfin_city_swfl: desk-hero region(s) missing from pull: {missing}")
    # Content-freshness: the newest period_end the source produced THIS run (ISO text). Monthly
    # tracker -> 55d gate (content lag + one cadence + buffer), matching redfin_lee. THIS is the
    # tripwire that catches a frozen-but-200 source: the legacy dump froze 06/02/2026 and the
    # 07/18 run passed only because May was still 48 days old at the time.
    newest_period_end = max(r["period_end"] for r in rows if r.get("period_end"))
    assert_content_fresh(newest_period_end, 55, label="redfin_city_swfl")
    pipeline = dlt.pipeline(
        pipeline_name="redfin_city_swfl",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(_make_resource(rows)())
    load_info.raise_on_failed_jobs()
    print(
        f"redfin_city_swfl: merged {len(rows)} FL city rows "
        f"({len(got_regions)} regions) into data_lake.redfin_city_swfl"
    )
    return len(rows)
