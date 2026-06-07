"""One-time backfill: geocode existing lee_building_permits rows where lat IS NULL.

Usage:
    python scripts/backfill_lee_permit_geocodes.py [--dry-run]

Reads credentials from .dlt/secrets.toml (same as all other ingest scripts).
Updates lat, lon, corridor in data_lake.lee_building_permits in-place.
"""
from __future__ import annotations

import argparse
import sys
import tomllib
from pathlib import Path


def _load_db_url() -> str:
    secrets_path = Path(__file__).resolve().parents[1] / ".dlt" / "secrets.toml"
    with open(secrets_path, "rb") as f:
        secrets = tomllib.load(f)
    pg = secrets["destination"]["postgres"]["credentials"]
    host = pg["host"]
    password = pg["password"]
    database = pg.get("database", "postgres")
    port = pg.get("port", 5432)
    username = pg.get("username", "postgres")
    return f"postgresql://{username}:{password}@{host}:{port}/{database}"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Backfill lat/lon/corridor for Lee permits")
    p.add_argument("--dry-run", action="store_true", help="Print what would change; no writes")
    args = p.parse_args(argv)

    try:
        import psycopg
    except ImportError:
        print("psycopg3 not installed — run: pip install psycopg[binary]", file=sys.stderr)
        return 1

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from ingest.pipelines.lee_permits.geocoder import (
        assign_corridor,
        geocode_batch,
        load_lee_centroids,
    )

    db_url = _load_db_url()

    with psycopg.connect(db_url) as conn:
        rows = conn.execute(
            "SELECT permit_id, address FROM data_lake.lee_building_permits WHERE lat IS NULL"
        ).fetchall()

    print(f"Found {len(rows)} rows with lat IS NULL")
    if not rows:
        print("Nothing to do.")
        return 0

    addresses = [r[1] for r in rows if r[1]]
    print(f"Geocoding {len(addresses)} unique addresses via Census batch API...")
    geo = geocode_batch(addresses)

    matched = sum(1 for v in geo.values() if v is not None)
    print(f"Census matched {matched}/{len(addresses)} addresses")

    centroids = load_lee_centroids()
    updates: list[tuple[float | None, float | None, str | None, str]] = []
    for permit_id, address in rows:
        lat_lon = geo.get(address) if address else None
        lat, lon = lat_lon if lat_lon else (None, None)
        corridor = assign_corridor(lat, lon, centroids)
        updates.append((lat, lon, corridor, permit_id))

    corridor_counts: dict[str | None, int] = {}
    for lat, lon, corridor, _ in updates:
        corridor_counts[corridor] = corridor_counts.get(corridor, 0) + 1

    print(f"\nCorridor assignment preview:")
    for cid, count in sorted(corridor_counts.items(), key=lambda x: -(x[1])):
        print(f"  {cid or '(none)'}: {count}")

    geocoded = sum(1 for lat, _, _, _ in updates if lat is not None)
    print(f"\nWill update {geocoded}/{len(updates)} rows with coordinates")

    if args.dry_run:
        print("\n--dry-run: no writes performed")
        return 0

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                UPDATE data_lake.lee_building_permits
                SET lat = %s, lon = %s, corridor = %s
                WHERE permit_id = %s
                """,
                updates,
            )
        conn.commit()
    print(f"Done — updated {len(updates)} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
