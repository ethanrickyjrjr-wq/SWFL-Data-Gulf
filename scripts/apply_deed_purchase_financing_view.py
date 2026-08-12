"""Apply docs/sql/20260812_lee_deed_purchase_financing_v.sql and verify live.

Creates data_lake.lee_deed_purchase_financing_v — cash-vs-financed classification
of arm's-length Lee County recorded deeds (financed / no_recorded_financing /
unclassifiable). See docs/superpowers/specs/2026-08-12-deed-cash-financed-split-design.md
and docs/handoff/2026-08-12-deed-cash-financed-split-build-handoff.md.

Reads credentials from .dlt/secrets.toml (same pattern as
apply_collier_sold_median_view.py). Run from repo root:
    python scripts/apply_deed_purchase_financing_view.py
"""
import os
import sys
from pathlib import Path

import psycopg


def _get_repo_root() -> Path:
    import subprocess

    result = subprocess.run(
        ["git", "rev-parse", "--git-common-dir"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return Path(result.stdout.strip()).parent
    return Path(__file__).parent.parent


def _get_connection():
    conninfo = os.environ.get("DESTINATION__POSTGRES__CREDENTIALS")
    if conninfo:
        return psycopg.connect(conninfo, sslmode="require", connect_timeout=15)
    secrets_path = _get_repo_root() / ".dlt" / "secrets.toml"
    secrets: dict[str, str] = {}
    if secrets_path.exists():
        section = None
        for line in secrets_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("[") and line.endswith("]"):
                section = line[1:-1]
                continue
            if "=" in line and section and "credentials" in section:
                k, _, v = line.partition("=")
                secrets[k.strip()] = v.strip().strip("'\"")
    return psycopg.connect(
        host=secrets["host"],
        port=int(secrets.get("port", "5432")),
        dbname=secrets.get("database", "postgres"),
        user=secrets["username"],
        password=secrets["password"],
        sslmode="require",
        connect_timeout=15,
    )


def main() -> int:
    root = _get_repo_root()
    view_sql = (root / "docs" / "sql" / "20260812_lee_deed_purchase_financing_v.sql").read_text()

    conn = _get_connection()
    try:
        # Precondition: parcel_strap must exist, else the view is a silent no-op join.
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM information_schema.columns"
                " WHERE table_schema='data_lake' AND table_name='lee_deed_official_records'"
                " AND column_name='parcel_strap'"
            )
            if (cur.fetchone() or [0])[0] == 0:
                print("ABORT: data_lake.lee_deed_official_records has no parcel_strap column.")
                return 1
            cur.execute(
                "SELECT count(*) FROM data_lake.lee_deed_official_records"
                " WHERE doc_type = 'DEED' AND consideration_usd > 100"
            )
            arms_length = (cur.fetchone() or [0])[0]
            if arms_length == 0:
                print("ABORT: zero arm's-length DEED rows — the load has not run yet.")
                return 1
            print(f"precondition OK — {arms_length:,} arm's-length DEED rows on file")

        with conn.cursor() as cur:
            cur.execute(view_sql)
        conn.commit()
        print("view applied: data_lake.lee_deed_purchase_financing_v")

        # Live verification — print the real numbers, never assume.
        with conn.cursor() as cur:
            cur.execute(
                "SELECT financing_class, count(*)"
                " FROM data_lake.lee_deed_purchase_financing_v"
                " GROUP BY financing_class ORDER BY financing_class"
            )
            rows = cur.fetchall()
            if not rows:
                print("WARNING: view created but returns ZERO rows.")
                return 1
            counts = {cls: n for cls, n in rows}
            total = sum(counts.values())
            classifiable = counts.get("financed", 0) + counts.get("no_recorded_financing", 0)
            print(f"\ntotal rows: {total:,}")
            for cls, n in rows:
                print(f"  {cls}: {n:,}")
            if classifiable > 0:
                share = counts.get("no_recorded_financing", 0) / classifiable
                print(f"\nno_recorded_financing share (of classifiable): {share:.1%}")
            unclass_share = counts.get("unclassifiable", 0) / total if total else 0
            print(f"unclassifiable share: {unclass_share:.1%} (suppression floor: 15%)")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
