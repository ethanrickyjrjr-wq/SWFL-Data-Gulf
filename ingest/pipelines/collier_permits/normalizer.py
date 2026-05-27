"""Column normalization and bucket classification for Collier permits."""
from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd

from .constants import COLUMN_MAP

# ── bucket constants ───────────────────────────────────────────────────────────

BUCKET_COMMERCIAL_NEW = "commercial_new"
BUCKET_COMMERCIAL_ALT = "commercial_alteration"
BUCKET_RESIDENTIAL = "residential"
BUCKET_DEMOLITION = "demolition"
BUCKET_OTHER = "other"

_RESIDENTIAL_KEYWORDS = frozenset([
    "1 to 2 family", "single family", "multi-family", "multifamily",
    "res.1&2", "residential", "townhouse", "condominium", "mobile home",
])

# ── type parsers ───────────────────────────────────────────────────────────────

def _to_date(val: Any) -> date | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if hasattr(val, "date"):
        return val.date()
    try:
        return pd.Timestamp(val).date()
    except Exception:
        return None


def _to_float(val: Any) -> float | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, str):
        val = val.replace("$", "").replace(",", "").strip()
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _to_int(val: Any) -> int | None:
    f = _to_float(val)
    return None if f is None else int(f)


def _to_str(val: Any) -> str | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    return s or None


# ── bucket classifier ──────────────────────────────────────────────────────────

def classify_bucket(
    building_type: str | None,
    const_type: str | None,
    permit_type_desc: str | None,
) -> str:
    bt = (building_type or "").lower()
    ct = (const_type or "").lower()
    ptd = (permit_type_desc or "").lower()

    if "demo" in ct or "demo" in ptd:
        return BUCKET_DEMOLITION

    is_residential = any(kw in bt for kw in _RESIDENTIAL_KEYWORDS)

    if "new construction" in ct or "new" in ptd:
        return BUCKET_RESIDENTIAL if is_residential else BUCKET_COMMERCIAL_NEW

    if any(kw in ct or kw in ptd for kw in ("alteration", "addition", "revision", "tenant", "remodel", "renovation")):
        return BUCKET_RESIDENTIAL if is_residential else BUCKET_COMMERCIAL_ALT

    return BUCKET_OTHER


# ── main normalizer ────────────────────────────────────────────────────────────

def normalize_df(df: pd.DataFrame, source_file: str) -> list[dict]:
    """Rename XLSX columns, parse types, classify buckets. Returns list of row dicts."""
    df = df.rename(columns=COLUMN_MAP)
    known = list(COLUMN_MAP.values())
    df = df[[c for c in known if c in df.columns]]

    rows: list[dict] = []
    for _, row in df.iterrows():
        permit_number = _to_str(row.get("permit_number"))
        if not permit_number:
            continue

        building_type = _to_str(row.get("building_type"))
        const_type = _to_str(row.get("const_type"))
        permit_type_desc = _to_str(row.get("permit_type_desc"))

        rows.append({
            "permit_number": permit_number,
            "declared_value": _to_float(row.get("declared_value")),
            "building_type": building_type,
            "permit_class": _to_str(row.get("permit_class")),
            "permit_type_desc": permit_type_desc,
            "permit_status": _to_str(row.get("permit_status")),
            "site_address": _to_str(row.get("site_address")),
            "property_id": _to_str(row.get("property_id")),
            "date_issued": _to_date(row.get("date_issued")),
            "date_applied": _to_date(row.get("date_applied")),
            "total_sf": _to_int(row.get("total_sf")),
            "total_units": _to_int(row.get("total_units")),
            "const_type": const_type,
            "owner_name": _to_str(row.get("owner_name")),
            "owner_city": _to_str(row.get("owner_city")),
            "owner_state": _to_str(row.get("owner_state")),
            "owner_zip": _to_str(row.get("owner_zip")),
            "contractor_type": _to_str(row.get("contractor_type")),
            "license_number": _to_str(row.get("license_number")),
            "contractor_name": _to_str(row.get("contractor_name")),
            "contractor_city": _to_str(row.get("contractor_city")),
            "contractor_state": _to_str(row.get("contractor_state")),
            "contractor_zip": _to_str(row.get("contractor_zip")),
            "bucket": classify_bucket(building_type, const_type, permit_type_desc),
            "source_file": source_file,
        })

    return rows
