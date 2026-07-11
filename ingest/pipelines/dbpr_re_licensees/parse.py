"""Pure normalize functions for the DBPR RE licensee (new-agent radar) pipeline.

No I/O, no wall-clock — pipeline.py supplies source_url / as_of_date / timestamps at
upsert time. Every function here is unit-testable with plain lists/strings.
"""
from __future__ import annotations

from datetime import datetime

from .constants import (
    COL_ADDRESS1,
    COL_ADDRESS2,
    COL_ADDRESS3,
    COL_ALTERNATE_LICENSE_NUMBER,
    COL_CITY,
    COL_COUNTY_CODE,
    COL_COUNTY_NAME,
    COL_DBA_NAME,
    COL_EMPLOYER_LICENSE_NUMBER,
    COL_EMPLOYER_NAME,
    COL_LICENSE_EXPIRATION_DATE,
    COL_LICENSE_NUMBER,
    COL_LICENSE_TYPE,
    COL_LICENSEE_NAME,
    COL_ORIGINAL_LICENSE_DATE,
    COL_PRIMARY_STATUS,
    COL_RANK,
    COL_SECONDARY_STATUS,
    COL_STATE,
    COL_STATUS_EFFECTIVE_DATE,
    COL_ZIP,
    INDIVIDUAL_PREFIX,
    MIN_ROW_LEN,
    SWFL_COUNTIES,
)


def parse_dbpr_date(value: str | None) -> str | None:
    """Parse a DBPR MM/DD/YYYY date string to ISO YYYY-MM-DD. None on any failure."""
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        return datetime.strptime(text, "%m/%d/%Y").date().isoformat()
    except ValueError:
        return None


def split_licensee_name(raw: str) -> tuple[str | None, str | None, str | None]:
    """Split a DBPR "LAST, FIRST MIDDLE" name into (last, first, middle).

    Title-cases each part. Falls back to (title-cased whole string, None, None) if there's
    no comma (defensive — every individual row observed live has one, but corp/branch rows
    that slip past the individual filter upstream would not).
    """
    if "," not in raw:
        return raw.strip().title(), None, None
    last, _, rest = raw.partition(",")
    last = last.strip().title()
    parts = rest.strip().split()
    if not parts:
        return last, None, None
    first = parts[0].title()
    middle = " ".join(parts[1:]).title() if len(parts) > 1 else None
    return last, first, middle


def normalize_row(row: list[str]) -> dict | None:
    """Normalize one RE_rgn7.csv row to the dbpr_re_licensees table shape.

    Returns None (drop) when: the row is shorter than MIN_ROW_LEN (layout-drift canary at
    the row level), the license type is not an individual agent (COL_LICENSE_TYPE doesn't
    start with "2501 "), or the county is outside Lee/Collier. `email` is always None —
    this pipeline never populates it (see constants.py / migration header).
    """
    if len(row) < MIN_ROW_LEN:
        return None

    license_type = row[COL_LICENSE_TYPE].strip()
    if not license_type.startswith(INDIVIDUAL_PREFIX):
        return None

    county_name = row[COL_COUNTY_NAME].strip()
    if county_name not in SWFL_COUNTIES:
        return None

    licensee_name = row[COL_LICENSEE_NAME].strip()
    last_name, first_name, middle = split_licensee_name(licensee_name)

    return {
        "license_number": row[COL_LICENSE_NUMBER].strip(),
        "alternate_license_number": row[COL_ALTERNATE_LICENSE_NUMBER].strip() or None,
        "licensee_name": licensee_name or None,
        "first_name": first_name,
        "middle": middle,
        "last_name": last_name,
        "dba_name": row[COL_DBA_NAME].strip() or None,
        "rank": row[COL_RANK].strip() or None,
        "license_type": license_type or None,
        "address1": row[COL_ADDRESS1].strip() or None,
        "address2": row[COL_ADDRESS2].strip() or None,
        "address3": row[COL_ADDRESS3].strip() or None,
        "city": row[COL_CITY].strip() or None,
        "state": row[COL_STATE].strip() or None,
        "zip": row[COL_ZIP].strip() or None,
        "county_code": row[COL_COUNTY_CODE].strip() or None,
        "county_name": county_name,
        "primary_status": row[COL_PRIMARY_STATUS].strip() or None,
        "secondary_status": row[COL_SECONDARY_STATUS].strip() or None,
        "original_license_date": parse_dbpr_date(row[COL_ORIGINAL_LICENSE_DATE]),
        "status_effective_date": parse_dbpr_date(row[COL_STATUS_EFFECTIVE_DATE]),
        "license_expiration_date": parse_dbpr_date(row[COL_LICENSE_EXPIRATION_DATE]),
        "employer_name": row[COL_EMPLOYER_NAME].strip() or None,
        "employer_license_number": row[COL_EMPLOYER_LICENSE_NUMBER].strip() or None,
        "email": None,
    }
