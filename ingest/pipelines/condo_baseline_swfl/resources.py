"""Fetch + normalize for condo_baseline_swfl.

Three deterministic sources → one `data_lake.condo_buildings_swfl` row shape.
No LLM here. The only judgment calls live in match.py.

Not dlt: this pipeline writes with psycopg against an explicit migration (see
pipeline.py docstring) — the same shape as dbpr_sirs, its upstream.
"""
from __future__ import annotations

import hashlib
import re
from datetime import date, datetime, timezone
from typing import Any, Iterable

import requests

from ingest.lib.arcgis_paginator import arcgis_count, paginate_arcgis_keyset

from .constants import (
    COLLIER_FIELDS,
    COLLIER_MILESTONE_DOC_URL,
    COLLIER_MILESTONE_QUERY_URL,
    COLLIER_MIN_ROWS,
    COLLIER_PDF_URL,
    LEE_FIELDS,
    LEE_FOOTPRINTS_DOC_URL,
    LEE_FOOTPRINTS_QUERY_URL,
    LEE_MIN_ROWS,
    LEE_WHERE,
)
from .match import normalize_assoc_name

# ── ArcGIS fetches ───────────────────────────────────────────────────────────


def _keyset_rows(query_url: str, where: str, fields: str, label: str, min_rows: int) -> list[dict[str, Any]]:
    """Attribute-only keyset walk with a count gate (no silent short pulls)."""
    expected = arcgis_count(query_url, where=where)
    rows = [
        ft.get("attributes") or {}
        for ft in paginate_arcgis_keyset(query_url, where=where, out_fields=fields, geometry=False)
    ]
    print(f"[{label}] {len(rows)} rows fetched ({expected} reported by returnCountOnly)")
    if len(rows) < min_rows:
        raise RuntimeError(
            f"[{label}] only {len(rows)} rows (< {min_rows}) — source pull is broken, refusing to write"
        )
    if expected and len(rows) < expected:
        raise RuntimeError(
            f"[{label}] fetched {len(rows)} < reported {expected} — dropped pages, refusing to write"
        )
    return rows


def fetch_lee_buildings() -> list[dict[str, Any]]:
    return _keyset_rows(LEE_FOOTPRINTS_QUERY_URL, LEE_WHERE, LEE_FIELDS, "lee-footprints", LEE_MIN_ROWS)


def fetch_collier_milestone() -> list[dict[str, Any]]:
    return _keyset_rows(COLLIER_MILESTONE_QUERY_URL, "1=1", COLLIER_FIELDS, "collier-milestone", COLLIER_MIN_ROWS)


# ── Collier PDF ──────────────────────────────────────────────────────────────

_PERMIT_RE = re.compile(r"^(PL\d{11})\b")
_DATES_RE = re.compile(r"(\d{2}/\d{2}/\d{4})\s+(\d{2}/\d{2}/\d{4})\s*$")
_AS_OF_RE = re.compile(r"As of\s+([A-Za-z]+\s+\d{4})")


def _mdy(s: str) -> date | None:
    try:
        return datetime.strptime(s, "%m/%d/%Y").date()
    except ValueError:
        return None


def parse_collier_pdf_text(text: str) -> tuple[str | None, list[dict[str, Any]]]:
    """Parse the extracted text of the Collier milestone PDF.

    Each data row starts with a PL permit number and ends with two m/d/Y dates
    (CO date, next milestone due). Long association names wrap onto a second
    line, so lines are accumulated per permit and the regex runs on the joined
    text. Returns (as_of_label, rows). Rows lacking both dates are kept with
    None dates so the join rate is honest about them.
    """
    as_of = None
    m = _AS_OF_RE.search(text)
    if m:
        as_of = m.group(1)

    rows: list[dict[str, Any]] = []
    current: list[str] = []

    def flush() -> None:
        if not current:
            return
        joined = " ".join(s.strip() for s in current if s.strip())
        pm = _PERMIT_RE.match(joined)
        if not pm:
            return
        dm = _DATES_RE.search(joined)
        middle = joined[pm.end(): dm.start()].strip() if dm else joined[pm.end():].strip()
        rows.append(
            {
                "permit_number": pm.group(1),
                "pdf_text": middle,
                "co_date": _mdy(dm.group(1)) if dm else None,
                "next_milestone_due": _mdy(dm.group(2)) if dm else None,
            }
        )

    for line in text.splitlines():
        if _PERMIT_RE.match(line.strip()):
            flush()
            current = [line]
        elif current:
            current.append(line)
    flush()
    return as_of, rows


def fetch_collier_pdf_rows(pdf_bytes: bytes | None = None) -> tuple[str | None, list[dict[str, Any]]]:
    if pdf_bytes is None:
        resp = requests.get(COLLIER_PDF_URL, timeout=120)
        resp.raise_for_status()
        pdf_bytes = resp.content
    import fitz  # pymupdf — in ingest/requirements.txt

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = "\n".join(page.get_text() for page in doc)
    as_of, rows = parse_collier_pdf_text(text)
    print(f"[collier-pdf] {len(rows)} rows parsed from {doc.page_count} pages (as of {as_of})")
    return as_of, rows


# ── Normalize to the buildings row shape ─────────────────────────────────────


def _hash(*parts: Any) -> str:
    return hashlib.sha256("|".join("" if p is None else str(p) for p in parts).encode()).hexdigest()


def _int(v: Any) -> int | None:
    try:
        return int(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _epoch_ms_to_iso(v: Any) -> str | None:
    try:
        return datetime.fromtimestamp(int(v) / 1000, tz=timezone.utc).date().isoformat() if v else None
    except (TypeError, ValueError, OSError):
        return None


def _split_collier_location(loc: str | None) -> tuple[str | None, str | None]:
    """'35 Bluebill AVE B,  (BLDG) , Naples' → ('35 Bluebill AVE B', 'Naples')."""
    if not loc:
        return None, None
    parts = [p.strip() for p in loc.split(",")]
    parts = [p for p in parts if p and p != "(BLDG)"]
    if not parts:
        return None, None
    street = parts[0]
    city = parts[-1] if len(parts) > 1 else None
    return street, city


def normalize_lee(rows: Iterable[dict[str, Any]], scraped_at: datetime) -> list[dict[str, Any]]:
    out = []
    for a in rows:
        assoc = (a.get("SubCondoName") or "").strip() or None
        strap = a.get("STRAP")
        bkey = a.get("BuildingKey")
        yb = _int(a.get("ActualYearBuilt"))
        out.append(
            {
                "building_id": f"lee:{strap}:{bkey}",
                "county": "LEE",
                "source": "lee_footprints",
                "association_name": assoc,
                "assoc_name_norm": normalize_assoc_name(assoc),
                "building_label": (a.get("CondoBldgNo") or a.get("ParcelBldgNo") or None),
                "street_address": a.get("StreetAddress"),
                "city": a.get("PostalCity"),
                "zip": (a.get("PostalCode") or None),
                "residential_units": _int(a.get("ResidentialUnits")),
                "stories": a.get("MaxStories"),
                "year_built": yb if yb and yb > 1800 else None,
                "co_date": None,
                "milestone_status": None,
                "milestone_status_detail": None,
                "next_milestone_year": None,
                "next_milestone_due": None,
                "permit_number": None,
                "parcel_strap": strap,
                "folio_id": _int(a.get("FolioID")),
                "site_address_id": None,
                "source_object_id": _int(a.get("OBJECTID")),
                "source_url": LEE_FOOTPRINTS_DOC_URL,
                "source_as_of": _epoch_ms_to_iso(a.get("ModifyDate")),
                "row_hash": _hash(strap, bkey, assoc, a.get("StreetAddress"), a.get("MaxStories"),
                                  a.get("ResidentialUnits")),
                "scraped_at": scraped_at,
            }
        )
    return out


def normalize_collier(
    rows: Iterable[dict[str, Any]],
    pdf_rows: Iterable[dict[str, Any]],
    pdf_as_of: str | None,
    scraped_at: datetime,
) -> tuple[list[dict[str, Any]], float]:
    """Returns (rows, pdf_join_rate) — join rate is over PDF rows, i.e. how many
    of the county's own list we could attach to a live permit."""
    by_permit = {r["permit_number"]: r for r in pdf_rows}
    joined = 0
    out = []
    for a in rows:
        permit = a.get("PermitNumber")
        pdf = by_permit.get(permit)
        if pdf:
            joined += 1
        street, city = _split_collier_location(a.get("PermitLocation"))
        co = pdf["co_date"] if pdf else None
        assoc = (a.get("AssociationName") or "").strip() or None
        out.append(
            {
                "building_id": f"collier:{permit}",
                "county": "COLLIER",
                "source": "collier_milestone",
                "association_name": assoc,
                "assoc_name_norm": normalize_assoc_name(assoc),
                "building_label": a.get("ApplicationName"),
                "street_address": street,
                "city": city,
                "zip": None,  # not in the service or the PDF
                "residential_units": None,
                "stories": None,  # program entry implies 3+ under 553.899; not stated per row
                "year_built": co.year if co else None,
                "co_date": co,
                "milestone_status": a.get("ApplicationStatus"),
                "milestone_status_detail": a.get("Application_Status"),
                "next_milestone_year": _int(a.get("NextMilestoneInspectionYear")),
                "next_milestone_due": pdf["next_milestone_due"] if pdf else None,
                "permit_number": permit,
                "parcel_strap": None,
                "folio_id": None,
                "site_address_id": _int(a.get("SiteAddressID")),
                "source_object_id": _int(a.get("OBJECTID")),
                "source_url": COLLIER_MILESTONE_DOC_URL,
                "source_as_of": pdf_as_of,
                "row_hash": _hash(permit, assoc, a.get("ApplicationStatus"),
                                  a.get("NextMilestoneInspectionYear"), co),
                "scraped_at": scraped_at,
            }
        )
    pdf_total = len(by_permit)
    rate = (joined / pdf_total) if pdf_total else 0.0
    print(f"[collier] {joined}/{pdf_total} PDF rows joined to the feature service on PermitNumber ({rate:.1%})")
    return out, rate
