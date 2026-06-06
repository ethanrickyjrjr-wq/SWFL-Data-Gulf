"""FBI Crime Data Explorer (CDE) acquisition for fdle_crime_swfl.

Replaces the unfit FIBRS county aggregation (issue #59). Florida law-enforcement
agencies report to FDLE, which submits to the FBI UCR/NIBRS program; CDE is the
public API access layer that also exposes the *participated population* — the
population CDE counts as actually covered by reporting agencies that year. That
lets us compute a coverage-matched county property-crime rate that lands at the
authoritative UCR baseline (Lee 2023 ~10.1/1k vs. the 10.82 UCR 2020 level),
instead of the ~2.3x FIBRS undercount.

Endpoint surface (verified live 2026-06-06):
  GET {BASE}/agency/byStateAbbr/FL
      -> { "<COUNTY_UPPER>": [ { ori, agency_name, counties, is_nibrs, ... }, ... ], ... }
  GET {BASE}/summarized/agency/{ORI}/property-crime?from=MM-YYYY&to=MM-YYYY
      -> offenses.actuals["<Agency> Offenses"][MM-YYYY]   (annual total parked in the
             December bucket, other months 0 — so a plain 12-month sum is the year total)
         populations.population["<Agency>"][MM-YYYY]
         populations.participated_population["<Agency>"][MM-YYYY]  (0 when not reporting)
Auth: API_KEY query param (api.data.gov key), env FBI_CDE_API_KEY.

Output: county-year Row dicts matching the public.fdle_crime_swfl UPSERT contract
(burglary/larceny/mvt/arson left null — CDE's property-crime bundle is the standard
3-offense UCR total; the per-offense breakdown is available via sibling endpoints but
the pack only consumes total_property_crimes + population + property_crime_per_1k).
"""
from __future__ import annotations

import sys
import time
from datetime import datetime, timezone
from typing import Any

import requests

from .constants import (
    CDE_BASE,
    CDE_CITATION_URL,
    COUNTIES,
    COUNTY_CDE_KEY,
)

Row = dict[str, Any]


def _get_json(path: str, api_key: str, retries: int = 4, timeout: int = 60) -> Any:
    """GET {CDE_BASE}{path} with the API key appended; retry transient 5xx/429."""
    sep = "&" if "?" in path else "?"
    url = f"{CDE_BASE}{path}{sep}API_KEY={api_key}"
    for attempt in range(retries):
        try:
            resp = requests.get(
                url, timeout=timeout, headers={"User-Agent": "swfl-data-gulf/1.0"}
            )
            if resp.status_code == 404:
                return None  # no data for this agency/year — caller treats as 0
            if resp.status_code in (429, 500, 502, 503, 504):
                raise requests.HTTPError(f"{resp.status_code}")
            resp.raise_for_status()
            return resp.json()
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError):
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise
    return None  # pragma: no cover


def county_agencies(api_key: str) -> dict[str, list[dict]]:
    """Return {county: [agency dicts]} for the configured COUNTIES, from CDE's roster."""
    data = _get_json("/agency/byStateAbbr/FL", api_key)
    if not data:
        raise RuntimeError("CDE agency roster for FL returned no data.")
    return {county: (data.get(COUNTY_CDE_KEY[county]) or []) for county in COUNTIES}


def _sum_months(series: dict | None) -> float:
    if not series:
        return 0.0
    return sum(v for v in series.values() if isinstance(v, (int, float)))


def _max_months(series: dict | None) -> float:
    if not series:
        return 0.0
    vals = [v for v in series.values() if isinstance(v, (int, float))]
    return max(vals) if vals else 0.0


def agency_property_crime(
    ori: str, year: int, api_key: str
) -> tuple[int, int, int]:
    """(offenses, population, participated_population) for one agency-year.

    participated_population is 0 when the agency did not report that year, which is
    how a non-reporting agency (e.g. Naples PD) is excluded from the denominator.
    """
    d = _get_json(
        f"/summarized/agency/{ori}/property-crime?from=01-{year}&to=12-{year}",
        api_key,
    )
    if not d:
        return 0, 0, 0
    off = (d.get("offenses") or {}).get("actuals") or {}
    pops = (d.get("populations") or {}).get("population") or {}
    part = (d.get("populations") or {}).get("participated_population") or {}
    off_keys = [k for k in off if k.endswith(" Offenses")]
    if not off_keys:
        return 0, 0, 0
    name = off_keys[0][: -len(" Offenses")]
    offenses = _sum_months(off[off_keys[0]])
    population = _max_months(pops.get(name))
    participated = _max_months(part.get(name))
    return int(round(offenses)), int(round(population)), int(round(participated))


def fetch_cde_rows(years: list[int], api_key: str) -> dict[int, list[Row]]:
    """Aggregate CDE agency property-crime into county-year Row dicts.

    Denominator is the coverage-matched participated_population (summed across only
    the agencies CDE marks as reporting that year), matching the per-1k convention
    the safety-swfl pack and its coverage-shift guard expect.
    """
    rosters = county_agencies(api_key)
    now_iso = datetime.now(timezone.utc).isoformat()
    out: dict[int, list[Row]] = {}
    for year in years:
        rows: list[Row] = []
        for county in COUNTIES:
            tot_off = 0
            tot_cov = 0
            reporting: list[str] = []
            for ag in rosters.get(county, []):
                ori = ag.get("ori")
                if not ori:
                    continue
                offenses, _pop, participated = agency_property_crime(
                    ori, year, api_key
                )
                if participated > 0:
                    tot_off += offenses
                    tot_cov += participated
                    reporting.append(ag.get("agency_name", ori))
            if tot_cov <= 0:
                print(
                    f"  CDE {county} {year}: no reporting agencies — skipped.",
                    file=sys.stderr,
                )
                continue
            per_1k = round(tot_off / tot_cov * 1000, 2)
            print(
                f"  CDE {county} {year}: {tot_off} offenses / {tot_cov:,} covered pop "
                f"= {per_1k}/1k ({len(reporting)} agencies).",
                file=sys.stderr,
            )
            rows.append(
                {
                    "county": county,
                    "period": f"{year}-01-01",
                    "data_year": year,
                    "burglary": None,
                    "larceny_theft": None,
                    "motor_vehicle_theft": None,
                    "arson": None,
                    "total_property_crimes": tot_off,
                    "population": tot_cov,
                    "property_crime_per_1k": per_1k,
                    "source_url": CDE_CITATION_URL,
                    "retrieved_at": now_iso,
                }
            )
        if rows:
            out[year] = rows
    return out
