"""Fetch + SWFL-filter helpers for market_heat_swfl.

Streams the realtor.com History CSVs and keeps only rows whose postal_code is
in the 6-county SWFL footprint (fixtures/swfl-zip-county.json — Census is the
SOLE scope authority, G1/G7 moat). postal_code is the LISTING's site ZIP, not a
mailing ZIP (G1 satisfied).
"""
from __future__ import annotations

import csv
import io
import json
import pathlib

import requests

from .constants import (
    CORE_COLUMNS,
    CORE_CSV_URL,
    HOTNESS_COLUMNS,
    HOTNESS_CSV_URL,
)

# Repo-root/fixtures/swfl-zip-county.json. __file__ = ingest/pipelines/market_heat_swfl/resources.py
_FIXTURE = pathlib.Path(__file__).resolve().parents[3] / "fixtures" / "swfl-zip-county.json"


def in_scope_zips() -> set[str]:
    """The set of in-scope SWFL ZIPs (Census ZCTA crosswalk)."""
    data = json.loads(_FIXTURE.read_text())
    return {str(e["zip"]) for e in data["entries"]}


def _clean(value: str) -> str | None:
    """Realtor.com leaves blanks and occasional literal 'NA' for thin ZIPs."""
    v = (value or "").strip()
    if v == "" or v.upper() == "NA":
        return None
    return v


def filter_csv_to_swfl(text: str, columns: list[str], zips: set[str]) -> list[dict]:
    """Parse a realtor.com CSV body, keep SWFL rows, project to `columns`.

    Pure over its inputs so the unit tests can exercise it with a fixed CSV
    string (no network). Blank/'NA' cells become None.
    """
    reader = csv.DictReader(io.StringIO(text))
    out: list[dict] = []
    for raw in reader:
        zip_code = (raw.get("postal_code") or "").strip()
        if zip_code not in zips:
            continue
        out.append({col: _clean(raw.get(col, "")) for col in columns})
    return out


def _fetch_and_filter(url: str, columns: list[str], zips: set[str]) -> list[dict]:
    resp = requests.get(url, timeout=180)
    resp.raise_for_status()
    return filter_csv_to_swfl(resp.text, columns, zips)


def fetch_core_swfl() -> list[dict]:
    return _fetch_and_filter(CORE_CSV_URL, CORE_COLUMNS, in_scope_zips())


def fetch_hotness_swfl() -> list[dict]:
    return _fetch_and_filter(HOTNESS_CSV_URL, HOTNESS_COLUMNS, in_scope_zips())
