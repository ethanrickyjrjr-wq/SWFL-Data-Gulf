import argparse
import csv
import io
import sys
import requests
from datetime import datetime, timezone

import dlt

from .constants import BLS_QCEW_BASE_URL, AREA_FIPS, BLS_HEADERS


def _find_latest_quarter(
    probe_fips: str = "12071",
    _now_year: int | None = None,
    _now_month: int | None = None,
) -> tuple[int, str]:
    """
    Back-step from the previous calendar quarter until BLS returns a
    non-empty JSON array for probe_fips. QCEW typically lags 2 quarters.
    _now_year/_now_month are injection points for unit tests.
    """
    now = datetime.now(timezone.utc)
    year = _now_year if _now_year is not None else now.year
    month = _now_month if _now_month is not None else now.month

    # Start one quarter before the current calendar quarter (current Q is never ready)
    qtr = (month - 1) // 3 + 1   # 1–4, current quarter
    qtr -= 1
    if qtr == 0:
        qtr, year = 4, year - 1

    # Run 31316526508 (08/09/2026) died here with only "could not find latest
    # available quarter within 6 back-steps": no URL, no status, every exception
    # swallowed, so the cause was unknowable from the log. Every probe now names
    # itself and its outcome in the error. 200-empty (BLS published nothing yet)
    # must stay distinguishable from 403 (blocked) and 404 (not published).
    attempts: list[str] = []
    for _ in range(6):
        url = f"{BLS_QCEW_BASE_URL}/{year}/{qtr}/area/{probe_fips}.csv"
        try:
            resp = requests.get(url, timeout=30, headers=BLS_HEADERS)
            if resp.ok:
                # The header check is load-bearing: csv.DictReader yields a "row"
                # for an HTML interstitial too, so a non-CSV 200 would pass as a
                # hit, the real fetch would then filter every row out on
                # industry_code != "10", and dlt would load ZERO rows and exit 0.
                reader = csv.DictReader(io.StringIO(resp.text))
                has_row = ("area_fips" in (reader.fieldnames or [])
                           and next(reader, None) is not None)
                attempts.append(f"{year}Q{qtr}={resp.status_code}{'' if has_row else '-empty'}")
                if has_row:
                    return year, str(qtr)
            else:
                attempts.append(f"{year}Q{qtr}={resp.status_code}")
        except Exception as e:  # noqa: BLE001
            attempts.append(f"{year}Q{qtr}=EXC:{type(e).__name__}")
        qtr -= 1
        if qtr == 0:
            qtr, year = 4, year - 1

    raise RuntimeError(
        "BLS QCEW: could not find latest available quarter within 6 back-steps; "
        f"tried {' '.join(attempts)}"
    )


def run() -> None:
    from .resources import bls_qcew_resource  # local import: pipeline.py is importable before Task 4

    latest_year, latest_qtr = _find_latest_quarter()
    prior_year = latest_year - 1
    prior_qtr = latest_qtr   # same quarter number, one year back

    quarters: list[tuple[int, str]] = [(latest_year, latest_qtr), (prior_year, prior_qtr)]
    print(
        f"Ingesting BLS QCEW: "
        f"{latest_year}-Q{latest_qtr} + {prior_year}-Q{prior_qtr} "
        f"for {len(AREA_FIPS)} areas..."
    )

    pipeline = dlt.pipeline(
        pipeline_name="bls_qcew",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(bls_qcew_resource(quarters))
    load_info.raise_on_failed_jobs()
    print("BLS QCEW pipeline complete.")


def main(argv: list[str] | None = None) -> int:
    """bls-qcew-quarterly.yml has always passed --dry-run on a dispatched dry run,
    but this module had no argparse, so the flag was silently ignored and the
    "dry run" wrote to data_lake. Matches the bls_laus/bls_ppi shape."""
    parser = argparse.ArgumentParser(description="BLS QCEW ingest pipeline.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch and validate only; skip the dlt write.")
    args = parser.parse_args(argv)

    if args.dry_run:
        from .resources import bls_qcew_resource

        latest_year, latest_qtr = _find_latest_quarter()
        quarters = [(latest_year, latest_qtr), (latest_year - 1, latest_qtr)]
        print(f"bls_qcew dry-run: latest available = {latest_year}-Q{latest_qtr}; "
              f"fetching {quarters} for {len(AREA_FIPS)} areas...")
        rows = list(bls_qcew_resource(quarters))
        print(f"bls_qcew dry-run: {len(rows)} rows")
        if rows:
            print("first row:", rows[0])
        return 0

    run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
