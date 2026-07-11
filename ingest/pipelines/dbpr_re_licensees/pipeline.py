"""DBPR RE licensee (new-agent radar) ingest — weekly Lee/Collier.

Downloads https://www2.myfloridalicense.com/sto/file_download/extracts/RE_rgn7.csv,
filters to Lee/Collier individual agents, and upserts into public.dbpr_re_licensees.
`email` is always NULL from this pipeline — a separate records-request lane fills it later;
the upsert COALESCEs so this pipeline's weekly re-run never clobbers a populated email.

Usage:
    python -m ingest.pipelines.dbpr_re_licensees.pipeline [--dry-run]

Environment:
  DESTINATION__POSTGRES__CREDENTIALS — psycopg3 connection URI (required unless --dry-run)
"""
from __future__ import annotations

import argparse
import csv
import io
import os
import sys
from datetime import date, datetime, timezone

import psycopg
import requests

from ingest.lib.guards import VolumeGuardError, assert_min_rows

from .constants import FLOOR_COLLIER, FLOOR_LEE, FLOOR_TOTAL, RE_RGN7_URL
from .parse import normalize_row

_UA = "Mozilla/5.0 (compatible; SWFL-Data-Gulf/1.0; +https://www.swfldatagulf.com)"


def _stream_csv(url: str, timeout: int = 120) -> list[list[str]]:
    """Download the RE_rgn7.csv extract and return all rows as lists of strings.

    Comma-delimited, double-quoted, no header, BOM-aware (utf-8-sig). Returns [] if the
    server returned HTML instead of CSV (dead link / error page) so the caller aborts loud
    instead of parsing garbage.
    """
    resp = requests.get(url, headers={"User-Agent": _UA}, timeout=timeout)
    resp.raise_for_status()
    text = resp.content.decode("utf-8-sig")
    if text.lstrip().startswith("<"):
        return []
    return list(csv.reader(io.StringIO(text), delimiter=","))


def get_db_conn():
    conn_str = os.environ.get("DESTINATION__POSTGRES__CREDENTIALS")
    if not conn_str:
        raise RuntimeError("DESTINATION__POSTGRES__CREDENTIALS not set.")
    return psycopg.connect(conn_str)


UPSERT_SQL = """
INSERT INTO public.dbpr_re_licensees
  (license_number, alternate_license_number, licensee_name, first_name, middle, last_name,
   dba_name, rank, license_type, address1, address2, address3, city, state, zip,
   county_code, county_name, primary_status, secondary_status,
   original_license_date, status_effective_date, license_expiration_date,
   employer_name, employer_license_number, email,
   source_tag, source_url, as_of_date, first_seen_at, last_seen_at)
VALUES
  (%(license_number)s, %(alternate_license_number)s, %(licensee_name)s, %(first_name)s,
   %(middle)s, %(last_name)s, %(dba_name)s, %(rank)s, %(license_type)s, %(address1)s,
   %(address2)s, %(address3)s, %(city)s, %(state)s, %(zip)s, %(county_code)s,
   %(county_name)s, %(primary_status)s, %(secondary_status)s, %(original_license_date)s,
   %(status_effective_date)s, %(license_expiration_date)s, %(employer_name)s,
   %(employer_license_number)s, %(email)s, %(source_tag)s, %(source_url)s, %(as_of_date)s,
   %(first_seen_at)s, %(last_seen_at)s)
ON CONFLICT (license_number) DO UPDATE SET
  alternate_license_number = EXCLUDED.alternate_license_number,
  licensee_name             = EXCLUDED.licensee_name,
  first_name                = EXCLUDED.first_name,
  middle                    = EXCLUDED.middle,
  last_name                 = EXCLUDED.last_name,
  dba_name                  = EXCLUDED.dba_name,
  rank                      = EXCLUDED.rank,
  license_type              = EXCLUDED.license_type,
  address1                  = EXCLUDED.address1,
  address2                  = EXCLUDED.address2,
  address3                  = EXCLUDED.address3,
  city                      = EXCLUDED.city,
  state                     = EXCLUDED.state,
  zip                       = EXCLUDED.zip,
  county_code               = EXCLUDED.county_code,
  county_name                = EXCLUDED.county_name,
  primary_status             = EXCLUDED.primary_status,
  secondary_status           = EXCLUDED.secondary_status,
  original_license_date      = EXCLUDED.original_license_date,
  status_effective_date      = EXCLUDED.status_effective_date,
  license_expiration_date    = EXCLUDED.license_expiration_date,
  employer_name               = EXCLUDED.employer_name,
  employer_license_number     = EXCLUDED.employer_license_number,
  email                       = COALESCE(EXCLUDED.email, public.dbpr_re_licensees.email),
  source_tag                  = EXCLUDED.source_tag,
  source_url                  = EXCLUDED.source_url,
  as_of_date                  = EXCLUDED.as_of_date,
  last_seen_at                = EXCLUDED.last_seen_at
  -- first_seen_at intentionally NOT updated on conflict (preserves first-seen timestamp)
  -- email_source intentionally NOT touched here — only the (separate) email lane sets it
"""


def run(dry_run: bool = False) -> int:
    run_ts = datetime.now(timezone.utc)
    today = date.today()
    print(f"[dbpr-re-licensees] run_ts={run_ts.isoformat()} dry_run={dry_run}")

    print(f"[dbpr-re-licensees] downloading {RE_RGN7_URL}")
    raw_rows = _stream_csv(RE_RGN7_URL)
    if not raw_rows:
        print("[dbpr-re-licensees] ERROR: empty/HTML response — aborting", file=sys.stderr)
        sys.exit(1)
    print(f"[dbpr-re-licensees] {len(raw_rows)} total rows in extract")

    rows: list[dict] = []
    for raw in raw_rows:
        parsed = normalize_row(raw)
        if parsed is None:
            continue
        parsed["source_tag"] = "dbpr_re_rgn7"
        parsed["source_url"] = RE_RGN7_URL
        parsed["as_of_date"] = today
        parsed["first_seen_at"] = run_ts
        parsed["last_seen_at"] = run_ts
        rows.append(parsed)

    lee = sum(1 for r in rows if r["county_name"] == "Lee")
    collier = sum(1 for r in rows if r["county_name"] == "Collier")
    print(f"[dbpr-re-licensees] kept {len(rows)} Lee/Collier individual rows "
          f"(Lee {lee} / Collier {collier})")

    try:
        assert_min_rows(len(rows), FLOOR_TOTAL, "dbpr_re_licensees:total")
        assert_min_rows(lee, FLOOR_LEE, "dbpr_re_licensees:lee")
        assert_min_rows(collier, FLOOR_COLLIER, "dbpr_re_licensees:collier")
    except VolumeGuardError as exc:
        print(f"[dbpr-re-licensees] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    if dry_run:
        print(f"[dbpr-re-licensees] dry-run: would upsert {len(rows)} rows")
        if rows:
            print(f"  sample: {rows[0]}")
        return len(rows)

    with get_db_conn() as conn:
        with conn.cursor() as cur:
            for row in rows:
                cur.execute(UPSERT_SQL, row)
        conn.commit()

    print(f"[dbpr-re-licensees] upserted {len(rows)} rows")
    return len(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="DBPR RE licensee (new-agent radar) ingest.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch and validate only; skip all DB writes.")
    args = parser.parse_args(argv)
    run(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
