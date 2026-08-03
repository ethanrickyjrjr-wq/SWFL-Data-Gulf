"""SteadyAPI /neighborhood-amenities ingest — neighborhoods, nearby amenities,
and the property->neighborhood pairing edge.

Call economics (probe doc _RESEARCH/data-and-ingest/2026-08-03-neighborhood-
amenities-full-scope.md): one call per UNKNOWN neighborhood, not per property.
Before each vendor call the property is checked against every boundary polygon
already stored (including ones learned earlier in the same batch) — a hit is
assigned locally at zero vendor cost. Bounded per run via --max-calls.

No LLM anywhere. Non-200 responses are recorded as gaps, never fabricated.
Manual/chunked run:  python -m pipelines.neighborhood_amenities.pipeline --dry-run --max-calls 5
"""
from __future__ import annotations

import argparse
import json
from datetime import date
from typing import Callable

from ingest.pipelines.market_aggregates.steady_client import get_json

from .distill import parse_amenities_response, property_in_boundary

FetchFn = Callable[[str], "tuple[int, dict | None]"]

NEIGHBORHOODS_TABLE = "steadyapi_neighborhoods"
AMENITIES_TABLE = "steadyapi_neighborhood_amenities"
ASSIGNMENTS_TABLE = "steadyapi_property_neighborhood"
SCHEMA = "data_lake"


def fetch_amenities(property_id: str) -> tuple[int, dict | None]:
    """Live fetch (throttled ~1 req/s via the shared steady_client)."""
    return get_json("neighborhood-amenities", {"propertyId": property_id})


def plan_worklist(
    properties: list[dict], known: list[dict]
) -> tuple[list[dict], list[dict]]:
    """Split the spine into (locally_assigned, needs_call) against already-known
    boundaries. Properties without coordinates go to needs_call (the vendor
    resolves them by propertyId — coordinates are only needed for the skip)."""
    assigned: list[dict] = []
    to_call: list[dict] = []
    for prop in properties:
        lat, lon = prop.get("lat"), prop.get("lon")
        match = None
        if lat is not None and lon is not None:
            for nb in known:
                if property_in_boundary(float(lon), float(lat), nb.get("boundary")):
                    match = nb["slug_id"]
                    break
        if match:
            assigned.append({"property_id": prop["property_id"], "slug_id": match})
        else:
            to_call.append(prop)
    return assigned, to_call


def run_batch(
    properties: list[dict],
    *,
    known: list[dict],
    fetch: FetchFn,
    max_calls: int,
    as_of: str,
) -> dict:
    """Pure orchestration (network isolated behind `fetch`). Learns boundaries
    as it goes: a property inside a neighborhood fetched earlier in this same
    batch is assigned locally instead of costing a second call."""
    learned = list(known)
    assigned, to_call = plan_worklist(properties, learned)

    neighborhoods: list[dict] = []
    amenities: list[dict] = []
    assignments: list[dict] = [{**a, "as_of": as_of} for a in assigned]
    gaps: list[str] = []
    calls_made = 0
    remaining = 0

    for prop in to_call:
        # re-check against boundaries learned during this batch
        re_assigned, _still = plan_worklist([prop], learned)
        if re_assigned:
            assignments.append({**re_assigned[0], "as_of": as_of})
            continue
        if calls_made >= max_calls:
            remaining += 1
            continue
        status, data = fetch(prop["property_id"])
        calls_made += 1
        if status != 200 or data is None:
            gaps.append(prop["property_id"])
            continue
        nbhd, biz_rows, assignment = parse_amenities_response(data, as_of=as_of)
        if nbhd is None:
            gaps.append(prop["property_id"])
            continue
        if all(n["slug_id"] != nbhd["slug_id"] for n in neighborhoods):
            neighborhoods.append(nbhd)
            amenities.extend(biz_rows)
            learned.append({"slug_id": nbhd["slug_id"], "boundary": nbhd.get("boundary")})
        if assignment:
            assignments.append(assignment)

    return {
        "neighborhoods": neighborhoods,
        "amenities": amenities,
        "assignments": assignments,
        "gaps": gaps,
        "calls_made": calls_made,
        "remaining": remaining,
    }


def _load_spine_and_known() -> tuple[list[dict], list[dict]]:
    """Live DB reads: unassigned active api_feed properties + known boundaries."""
    from ingest.lib.tier1_inventory import _get_connection

    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ls.property_id, ls.lat, ls.lon
                FROM data_lake.listing_state ls
                LEFT JOIN data_lake.steadyapi_property_neighborhood pn
                  ON pn.property_id = ls.property_id
                WHERE ls.source_name = 'api_feed'
                  AND ls.property_id IS NOT NULL
                  AND pn.property_id IS NULL
                ORDER BY ls.last_seen DESC
                """
            )
            spine = [{"property_id": r[0], "lat": r[1], "lon": r[2]} for r in cur.fetchall()]
            cur.execute(f"SELECT slug_id, boundary FROM {SCHEMA}.{NEIGHBORHOODS_TABLE}")
            known = [
                {
                    "slug_id": r[0],
                    "boundary": r[1]
                    if isinstance(r[1], dict)
                    else (json.loads(r[1]) if r[1] else None),
                }
                for r in cur.fetchall()
            ]
        return spine, known
    finally:
        conn.close()


def to_load_rows(result: dict) -> tuple[list[dict], list[dict], list[dict]]:
    """Convert batch results into dlt-ready rows with NATIVE types. Regression
    guard for the 08/03/2026 first-write failure: json.dumps'd boundary/scores
    and ISO-string as_of made dlt infer varchar against the pre-created
    jsonb/date columns. dicts/lists stay dicts/lists; as_of becomes date."""
    from datetime import date as _date

    def _d(value: str) -> "_date":
        return _date.fromisoformat(value)

    nbhds = [
        {**row, "as_of": _d(row["as_of"])} for row in result["neighborhoods"]
    ]
    amenities = [
        {**row, "categories": row.get("categories") or [], "as_of": _d(row["as_of"])}
        for row in result["amenities"]
    ]
    # Dedupe assignments on property_id: listing_state can carry the same
    # property on multiple rows (sale + rent lanes), and Postgres rejects the
    # in-batch PK duplicate (live failure 08/03/2026, property 5002407404).
    seen: set[str] = set()
    assignments = []
    for row in result["assignments"]:
        if row["property_id"] in seen:
            continue
        seen.add(row["property_id"])
        assignments.append({**row, "as_of": _d(row["as_of"])})
    return nbhds, amenities, assignments


def _write(result: dict) -> None:
    import dlt

    from ingest.lib.guards import assert_min_rows

    total = len(result["neighborhoods"]) + len(result["assignments"])
    assert_min_rows(total, minimum=1, label="neighborhood_amenities")

    nbhd_rows, amenity_rows, assignment_rows = to_load_rows(result)

    pipeline = dlt.pipeline(
        pipeline_name="neighborhood_amenities",
        destination="postgres",
        dataset_name=SCHEMA,
    )

    @dlt.resource(
        name=NEIGHBORHOODS_TABLE,
        primary_key="slug_id",
        write_disposition="merge",
        columns={"boundary": {"data_type": "json"}, "scores": {"data_type": "json"}},
    )
    def neighborhoods_resource():
        yield from nbhd_rows

    @dlt.resource(
        name=AMENITIES_TABLE,
        primary_key=("slug_id", "category", "name", "address_line"),
        write_disposition="merge",
        columns={"categories": {"data_type": "json"}},
    )
    def amenities_resource():
        yield from amenity_rows

    @dlt.resource(name=ASSIGNMENTS_TABLE, primary_key="property_id", write_disposition="merge")
    def assignments_resource():
        yield from assignment_rows

    load_info = pipeline.run(
        [neighborhoods_resource(), amenities_resource(), assignments_resource()]
    )
    load_info.raise_on_failed_jobs()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true", help="Plan + a few probe fetches, print counts, skip the write.")
    p.add_argument("--max-calls", type=int, default=250, help="Vendor-call ceiling this run (default 250).")
    args = p.parse_args(argv)

    spine, known = _load_spine_and_known()
    print(f"spine: {len(spine)} unassigned properties; known neighborhoods: {len(known)}")

    max_calls = min(args.max_calls, 5) if args.dry_run else args.max_calls
    result = run_batch(
        spine,
        known=known,
        fetch=fetch_amenities,
        max_calls=max_calls,
        as_of=date.today().isoformat(),
    )
    print(
        f"calls={result['calls_made']} neighborhoods={len(result['neighborhoods'])} "
        f"amenities={len(result['amenities'])} assignments={len(result['assignments'])} "
        f"gaps={len(result['gaps'])} remaining={result['remaining']}"
    )
    if args.dry_run:
        print("dry-run: write skipped")
        return 0
    _write(result)
    return 0


if __name__ == "__main__":
    main()
