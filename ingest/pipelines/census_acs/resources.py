import dlt
import requests
import os
import json
import pathlib
from datetime import datetime, timezone

from ingest.lib.guards import assert_min_rows
from .constants import (
    CENSUS_ACS_BASE_URL,
    ACS_LATEST_YEAR,
    ACS_RAW_VARS,
    ACS_ZCTA_MIN_ROWS,
)

# Repo-root/fixtures/swfl-zip-county.json — the in-scope ZIP list (Census is the sole
# scope authority; G1/G7 moat). __file__ = ingest/pipelines/census_acs/resources.py.
_FIXTURE = pathlib.Path(__file__).resolve().parents[3] / "fixtures" / "swfl-zip-county.json"


def _in_scope_zips() -> list[tuple[str, str, str]]:
    data = json.loads(_FIXTURE.read_text())
    out: list[tuple[str, str, str]] = []
    for e in data["entries"]:
        names = e.get("county_names") or [""]
        out.append((e["zip"], e.get("primary_county", ""), names[0]))
    return out


def _num(v) -> float | None:
    """Census cell → float, or None for suppression sentinels. Every cut-1 field is
    non-negative in reality, so ANY negative value is a Census annotation sentinel
    (-666666666 etc.) → NULL, never zero (design §4)."""
    if v is None:
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return None if n < 0 else n


def _int(v) -> int | None:
    n = _num(v)
    return int(n) if n is not None else None


def _pct(num, den) -> float | None:
    n, d = _num(num), _num(den)
    if n is None or d is None or d == 0:
        return None
    return round(n / d * 100, 2)


def _moved_pct(universe, same_house) -> float | None:
    """Moved-in-past-year % = (universe − same-house) / universe. B07003_004E is
    "Same house 1 year ago" (NON-movers); the universe is B07003_001E (pop 1 yr+),
    NOT total population. Verified against the live ACS B07003 group 2026-06-24 — the
    design's B07003_004E="moved" mapping was wrong (it rendered ~83%, i.e. the stayers)."""
    u, s = _num(universe), _num(same_house)
    if u is None or s is None or u == 0:
        return None
    return round((u - s) / u * 100, 2)


@dlt.resource(name="census_acs_zcta", write_disposition="replace")
def census_acs_zcta():
    """Per-ZCTA ACS 5-year demographics for the in-scope SWFL ZIPs. One API call per
    ZIP (state-nested ZCTA queries are deprecated — see constants). ZIPs with no ZCTA
    (PO-box) or a transient error are skipped, never crash the run."""
    try:
        api_key = dlt.secrets["CENSUS_API_KEY"]
    except KeyError:
        api_key = os.environ.get("CENSUS_API_KEY", "")

    ingested_at = datetime.now(timezone.utc).isoformat()
    year = ACS_LATEST_YEAR
    url = CENSUS_ACS_BASE_URL.format(year=year)
    rows: list[dict] = []

    for zip_code, county_fips, county_name in _in_scope_zips():
        params = {
            "get": "NAME," + ",".join(ACS_RAW_VARS),
            "for": f"zip code tabulation area:{zip_code}",
        }
        if api_key:
            params["key"] = api_key

        try:
            resp = requests.get(url, params=params, timeout=60)
        except requests.RequestException:
            continue
        if resp.status_code != 200 or not resp.text.startswith("["):
            continue  # ZIP without a ZCTA, or transient error — skip, don't crash
        try:
            data = resp.json()
        except ValueError:
            continue
        if len(data) < 2:
            continue

        rec = dict(zip(data[0], data[1]))
        rows.append(
            {
                "geo_id": zip_code,
                "geo_name": rec.get("NAME", ""),
                "county_fips": county_fips,
                "county_name": county_name,
                "acs_year": year,
                "total_population": _int(rec.get("B01003_001E")),
                "median_household_income": _int(rec.get("B19013_001E")),
                "median_age": _num(rec.get("B01002_001E")),
                "owner_occupied_pct": _pct(rec.get("B25003_002E"), rec.get("B25003_001E")),
                "moved_in_past_year_pct": _moved_pct(rec.get("B07003_001E"), rec.get("B07003_004E")),
                "poverty_rate": _pct(rec.get("B17001_002E"), rec.get("B17001_001E")),
                "employment_rate": _pct(rec.get("B23025_004E"), rec.get("B23025_002E")),
                "avg_household_size": _num(rec.get("B25010_001E")),
                "ingested_at": ingested_at,
            }
        )

    # Volume guard — runs to completion BEFORE the first row is yielded, so a partial
    # pull raises before dlt's destructive `replace` truncates the table (THE BIBLE §0.2).
    assert_min_rows(len(rows), ACS_ZCTA_MIN_ROWS, label="census_acs_zcta")
    print(f"  census_acs_zcta: {len(rows)} ZCTAs, ACS 5-year {year}")
    yield from rows
