import dlt
import requests
import os
from datetime import datetime, timezone

from ingest.lib.guards import assert_min_rows, VolumeGuardError

# Constants
CENSUS_CBP_BASE_URL = "https://api.census.gov/data/{year}/cbp"
CBP_YEARS = [2017, 2018, 2019, 2020, 2021, 2022]
FL_STATE_FIPS = "12"

# Volume-guard floors before the destructive `replace` (THE BIBLE §0.2 rule 5).
# 230_006 = 90% of the 255,563 rows live 2026-06-13 — catches a partial pull when a
# vintage is skipped on the per-year API error below. The establishment_count non-zero
# rate catches a silent vendor field rename (ESTAB missing → int(... or 0) → all zeros),
# which assert_min_rows alone would not see.
_MIN_ROWS = 230_006
_ESTAB_NONZERO_FLOOR = 0.50


@dlt.resource(name="census_cbp_fl", write_disposition="replace")
def census_cbp_fl():
    # Fix: Try dlt's secret manager first, then fallback to environment variables
    try:
        api_key = dlt.secrets["CENSUS_API_KEY"]
    except KeyError:
        api_key = os.environ.get("CENSUS_API_KEY", "")

    ingested_at = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []

    for year in CBP_YEARS:
        url = CENSUS_CBP_BASE_URL.format(year=year)

        # CBP uses NAICS 2017 codes across all vintages 2017-2022
        naics_var = "NAICS2017"
        naics_label_var = "NAICS2017_LABEL"
        fields = [naics_var, naics_label_var, "ESTAB", "EMP", "PAYANN", "NAME"]

        params = {"get": ",".join(fields), "for": "county:*", "in": f"state:{FL_STATE_FIPS}"}
        if api_key:
            params["key"] = api_key

        resp = requests.get(url, params=params, timeout=60)

        # Helpful error logging if Census still complains
        if resp.status_code != 200 or not resp.text.startswith('['):
            print(f"\n[CRASH AVOIDED] API ERROR for year {year}: {resp.text}\n")
            continue  # Skip this year instead of crashing the whole pipeline

        try:
            data = resp.json()
        except ValueError:
            print(f"\nJSON Error for year {year}. Raw text: {resp.text}\n")
            continue

        headers = data[0]
        for row_arr in data[1:]:
            row = dict(zip(headers, row_arr))
            rows.append({
                "naics_code":          row.get(naics_var, ""),
                "naics_label":         row.get(naics_label_var, ""),
                "county_name":         row.get("NAME", ""),
                "establishment_count": int(row.get("ESTAB") or 0),
                "employment":          int(row.get("EMP") or 0),
                "annual_payroll":      int(row.get("PAYANN") or 0),
                "year":                year,
                "fips_state":          row.get("state", FL_STATE_FIPS),
                "fips_county":         row.get("county", ""),
                "ingested_at":         ingested_at,
            })

    # ── Volume guard — gate the REAL pull before dlt's destructive replace.
    # The generator body (fetch + this guard) runs to completion before the first
    # row is yielded, so a failure raises BEFORE dlt truncates the table — no silent
    # wipe. THE BIBLE §0.2 rule 5.
    assert_min_rows(len(rows), _MIN_ROWS, label="census_cbp_fl")
    nonzero = sum(1 for r in rows if r["establishment_count"] > 0)
    rate = nonzero / len(rows) if rows else 0.0
    print(f"  census_cbp_fl establishment_count non-zero rate: {rate:.1%} ({nonzero:,}/{len(rows):,})")
    if rate < _ESTAB_NONZERO_FLOOR:
        raise VolumeGuardError(
            f"[volume-guard] census_cbp_fl: establishment_count non-zero {rate:.1%} "
            f"< {_ESTAB_NONZERO_FLOOR:.0%} floor — likely a vendor field rename; "
            f"aborting before replace to avoid wiping good data"
        )

    yield from rows
