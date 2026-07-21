"""One-time live ship of finalize.py's merged output, operator-approved 07/20/2026.

Loads `.raw_cache/final_rows.json` (158 rows, already merged + tested via
`merge_community_row`), ships ONLY the rows with a resolved Lee/Collier county
to `data_lake.community_profiles` via the already-tested dlt resource, and
registers an alias fixture entry for each shipped row so neighborhood_stats'
`label_by_pattern` fold can find it. The 89 rows with no resolved county
(several are out-of-scope clubs outside Lee/Collier/Hendry — the discovery
scrape wasn't geo-filtered) are deliberately excluded: shipping them would
either violate the NOT NULL county column or plant an out-of-scope community
in a SWFL table. They stay in golf_communities_master.json / final_rows.json,
unshipped, pending county resolution.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from ingest.lib.community_aliases import _FIXTURE_PATH, load_community_aliases

from .pipeline import community_profiles_resource, maybe_register_alias

_OUT_PATH = Path(__file__).parent / ".raw_cache" / "final_rows.json"

# The table types these 4 provenance columns `date`; finalize.py's merge emits
# ISO strings ("2026-07-20") because that's what json round-trips as. dlt's
# schema inference sees `str` and generates a staging column dlt can't
# implicitly cast into the pre-existing `date` column (Postgres rejects
# varchar->date in an INSERT...SELECT without an explicit cast) — parse to a
# real `datetime.date` here so dlt infers the correct type.
_DATE_FIELDS = ("amenities_as_of", "golf_as_of", "fees_as_of", "home_count_as_of")


def _coerce_dates(row: dict) -> dict:
    row = dict(row)
    for field in _DATE_FIELDS:
        value = row.get(field)
        if isinstance(value, str):
            row[field] = date.fromisoformat(value)
    return row


def main() -> int:
    import dlt

    rows = json.loads(_OUT_PATH.read_text(encoding="utf-8"))
    shippable = [_coerce_dates(r) for r in rows if r.get("county") is not None]
    skipped = [r["community_slug"] for r in rows if r.get("county") is None]

    print(f"loaded {len(rows)} merged rows, shipping {len(shippable)} with a resolved county")
    print(f"skipping {len(skipped)} (no resolved Lee/Collier county): {skipped}")

    # Distinct pipeline_name (dlt's own local+remote bookkeeping identity, unrelated
    # to the destination table) — the shared "community_profiles" identity's staging
    # table + pending-package state was poisoned by an earlier failed attempt (varchar
    # vs date column mismatch) and wouldn't reset via `dlt pipeline ... drop-pending-
    # packages`. dataset_name stays "data_lake" so this still writes the real table.
    pipeline = dlt.pipeline(
        pipeline_name="community_profiles_ship_20260720",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(community_profiles_resource(shippable))
    load_info.raise_on_failed_jobs()
    print("dlt write complete:", load_info)

    aliases = load_community_aliases()
    before = len(aliases)
    for row in shippable:
        aliases = maybe_register_alias(row["community_slug"], row["label"], aliases)
    _FIXTURE_PATH.write_text(json.dumps(aliases, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"alias fixture: {before} -> {len(aliases)} entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
