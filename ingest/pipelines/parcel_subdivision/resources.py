"""Pull Collier County parcel names from the FDOR centroid-version FeatureServer
and merge them into data_lake.parcel_subdivision (Tier 2).

Gives every Collier home its raw platted-subdivision name (`S_LEGAL`, stemmed) +
property_type + just_value, the backbone the alias reconciler
(refinery/lib/subdivision-aliases.mts) rolls up to marketed communities and
`ingest/duckdb_pipelines/neighborhood_stats` aggregates per subdivision.

Lee is NOT pulled here — FDOR's CO_NO=46 partition 400s on record queries on
this layer (see constants.py docstring). Lee lands via a separate pipeline
(follow-up F1).
"""
from __future__ import annotations

import re
import time

import requests

from ingest.lib.coercion import coerce_float as _coerce_float
from ingest.lib.guards import assert_vs_canonical

from .constants import (
    CENTROID_URL,
    CO_NO,
    DOR_HOME_TYPE,
    OUT_FIELDS,
    SUBDIVISION_QUALIFIER_PATTERN,
)

_QUALIFIER_RE = re.compile(SUBDIVISION_QUALIFIER_PATTERN)
_NON_ALNUM_RE = re.compile(r"[^A-Z0-9 ]")
_WHITESPACE_RE = re.compile(r"\s+")

# Tier-2 column hints — parcel_id is the key (PK).
_TIER2_COLUMNS: dict = {
    "parcel_id":        {"data_type": "text", "nullable": False, "primary_key": True},
    "county":           {"data_type": "text", "nullable": False},
    "property_type":    {"data_type": "text", "nullable": True},
    "just_value":       {"data_type": "double", "nullable": True},
    "zip":              {"data_type": "text", "nullable": True},
    "subdivision_name": {"data_type": "text", "nullable": True},
    "phy_addr1":        {"data_type": "text", "nullable": True},
}


def _stem(raw: str | None) -> str:
    """Port of `normalizeSubdivisionName` (refinery/lib/subdivision-aliases.mts) —
    keep both in lockstep or the alias reconciler's slugs drift apart across
    the TS (Phase 4/5 readers) and Python (this ingest) sides."""
    s = (raw or "").upper()
    s = _QUALIFIER_RE.sub("", s)
    s = _NON_ALNUM_RE.sub(" ", s)
    return _WHITESPACE_RE.sub(" ", s).strip()


def _normalize(feats: list[dict], county: str) -> list[dict]:
    """Map ArcGIS attribute rows -> parcel_subdivision rows. Drops non-home DOR
    use codes (commercial, vacant, etc.) — only the design spec's home types land."""
    out: list[dict] = []
    for ft in feats:
        a = ft.get("attributes", ft)  # tolerate bare-attribute dicts (tests)
        dor = str(a.get("DOR_UC") or "").zfill(3)
        property_type = DOR_HOME_TYPE.get(dor)
        if property_type is None:
            continue
        pid = a.get("PARCEL_ID")
        if not pid:
            continue
        zipcd = a.get("PHY_ZIPCD")
        out.append({
            "parcel_id": str(pid),
            "county": county,
            "property_type": property_type,
            "just_value": _coerce_float(a.get("JV")),
            "zip": (str(zipcd) if zipcd not in (None, "") else None),
            "subdivision_name": _stem(a.get("S_LEGAL")),
            "phy_addr1": (str(a["PHY_ADDR1"]).strip() or None) if a.get("PHY_ADDR1") else None,
        })
    return out


def _make_resource(chunk: list[dict]):
    """Zero-arg dlt resource factory — same closure pattern as collier_parcels
    (dodges dlt's mutable-default-arg spec error)."""
    import dlt

    @dlt.resource(
        table_name="parcel_subdivision",
        write_disposition="merge",
        primary_key="parcel_id",
        columns=_TIER2_COLUMNS,
    )
    def parcel_subdivision_rows():
        yield from chunk

    return parcel_subdivision_rows


def _promote_to_tier2(rows: list[dict], chunk_size: int = 5_000) -> None:
    """Chunked merge into data_lake.parcel_subdivision (mirrors collier_parcels'
    chunking — stays under the Supabase pooler connection timeout)."""
    import dlt

    pipeline = dlt.pipeline(
        pipeline_name="parcel_subdivision",
        destination="postgres",
        dataset_name="data_lake",
    )
    total = len(rows)
    n_chunks = (total + chunk_size - 1) // chunk_size
    for i in range(0, total, chunk_size):
        chunk = rows[i : i + chunk_size]
        load_info = pipeline.run(_make_resource(chunk)())
        load_info.raise_on_failed_jobs()
        print(f"  parcel_subdivision chunk {i // chunk_size + 1}/{n_chunks} ({len(chunk)} rows)")


_MAX_ATTEMPTS = 3
# OBJECTIDs per objectIds fetch. This CENTROID layer's backend is slow: live
# 07/06/2026 an objectIds batch of 500 (and 1000) reliably 504'd at the ArcGIS
# gateway (~60s to time out) while 250–327 returned in ~2s. So 250 sits safely
# under that ceiling and avoids the 60s-per-504 split tax on every batch. A batch
# that does 504/soft-400 anyway is still halved + retried (_fetch_object_id_batch)
# for correctness — 250 is the size that makes the common path fast, not a limit.
# (Must also stay <= the layer's maxRecordCount of 2000 or a batch would truncate.)
_BATCH_SIZE = 250
SKIPPED_OBJECT_IDS: list[int] = []  # audit trail — every OBJECTID that was unservable


def _request(params: dict, retries: int = _MAX_ATTEMPTS) -> dict:
    """One ArcGIS /query POST, retried up to `retries` times on transport/5xx.
    Returns the parsed JSON body (may itself carry an {"error": ...} key — the
    caller decides). POST (form-encoded body) not GET: an objectIds batch is a
    long parameter and POST sidesteps any URL-length limit.

    A multi-id batch passes retries=1 (fail fast): a 504 there means the batch is
    too heavy, so retrying the SAME size can't help — the caller splits instead.
    Only a lone id retries, where a 504 may be a genuine transient blip."""
    for attempt in range(retries):
        last_attempt = attempt == retries - 1
        try:
            resp = requests.post(CENTROID_URL, data=params, timeout=120)
            if resp.status_code >= 500 and not last_attempt:
                time.sleep(2 * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception:
            if last_attempt:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")  # loop always returns or raises on last_attempt


def _fetch_all_object_ids() -> list[int]:
    """All Collier OBJECTIDs via `returnIdsOnly=true` — the official Esri pattern
    for a layer that won't paginate (docs: returnIdsOnly returns up to 1M
    conforming IDs in one response, then fetch by objectIds).

    Verified live 07/06/2026: this layer soft-400s ("Invalid query parameters")
    on `where=(CO_NO=21) AND OBJECTID>N` + orderByFields + resultRecordCount deep
    pagination at specific cursors, but returnIdsOnly returned all 364,827 Collier
    OIDs cleanly in a single request, and every one of those "failing" OIDs proved
    individually queryable via objectIds (with S_LEGAL intact). The bug was the
    keyset-pagination query shape, not the source data — there is no dead zone."""
    body = _request({"where": f"CO_NO={CO_NO['collier']}", "returnIdsOnly": "true", "f": "json"})
    if "objectIds" not in body:
        raise RuntimeError(f"collier parcel_subdivision returnIdsOnly failed: {body.get('error', body)}")
    return sorted(int(x) for x in (body["objectIds"] or []))


def _fetch_object_id_batch(oids: list[int]) -> list[dict]:
    """Fetch a batch of parcels by explicit `objectIds` (no where/orderBy/
    resultRecordCount — the path that 400s on this layer). Adaptive to both of
    the layer's failure modes: a soft-400 ({"error": ...} in a 200 body) and a
    hard gateway 504/timeout on a too-heavy batch. Either way, if the batch has
    more than one id, halve it and recurse — smaller batches serialize faster
    and stay under the gateway timeout. A LONE OBJECTID that still soft-400s is
    logged + skipped (a genuinely unservable row must never abort the ingest —
    per the 07/06/2026 probe none exist, so this is a safety net); a lone id that
    fails at the transport level (504/timeout) is re-raised, because losing a
    real row to a transient network blip would be silent data loss."""
    if not oids:
        return []
    lone = len(oids) == 1
    try:
        body = _request({
            "objectIds": ",".join(map(str, oids)),
            "outFields": OUT_FIELDS,
            "returnGeometry": "false",
            "f": "json",
        }, retries=_MAX_ATTEMPTS if lone else 1)  # multi-id: fail fast -> split; lone: retry a blip
        reason = body.get("error")  # soft-400 inside a 200, or None on success
    except Exception as exc:
        if lone:
            raise  # a single real row failing at the transport level is not skippable
        reason = f"transport/5xx: {exc}"
        body = None

    if body is not None and reason is None:
        return body.get("features", [])
    if lone:  # only reachable via a soft-400 (transport raised above)
        SKIPPED_OBJECT_IDS.append(oids[0])
        print(f"  parcel_subdivision (collier): OBJECTID {oids[0]} unservable even alone — skipped: {reason}")
        return []
    mid = len(oids) // 2
    print(f"  parcel_subdivision (collier): objectIds batch of {len(oids)} failed ({reason}) — splitting")
    return _fetch_object_id_batch(oids[:mid]) + _fetch_object_id_batch(oids[mid:])


def _iter_collier_attrs(batch_size: int = _BATCH_SIZE):
    """Retrieve every Collier parcel: one returnIdsOnly call for the full OBJECTID
    list, then fetch in batches by objectIds."""
    oids = _fetch_all_object_ids()
    total_batches = (len(oids) + batch_size - 1) // batch_size
    for n, i in enumerate(range(0, len(oids), batch_size), start=1):
        if n % 20 == 0:
            print(f"  parcel_subdivision (collier): objectIds batch {n}/{total_batches}")
        yield from _fetch_object_id_batch(oids[i : i + batch_size])


def fetch_collier_parcel_subdivisions() -> list[dict]:
    """Fetch all Collier (CO_NO=21) parcel names via returnIdsOnly + objectIds batching, normalized."""
    return _normalize(list(_iter_collier_attrs()), "collier")


def arcgis_count(where: str) -> int:
    """Canonical row count via returnCountOnly — NOTE this layer 400s on some
    shapes (see constants.py); returnCountOnly is confirmed to work."""
    resp = requests.get(CENTROID_URL, params={"where": where, "returnCountOnly": "true", "f": "json"}, timeout=60)
    resp.raise_for_status()
    return int(resp.json().get("count", 0))


def ingest_collier_parcel_subdivisions() -> int:
    """Pull Collier parcel names from the FDOR centroid layer and promote to Tier 2."""
    where = f"CO_NO={CO_NO['collier']}"
    canonical = arcgis_count(where)
    rows = fetch_collier_parcel_subdivisions()
    if SKIPPED_OBJECT_IDS:
        print(
            f"parcel_subdivision (collier): WARNING - {len(SKIPPED_OBJECT_IDS)} OBJECTID(s) "
            f"unqueryable on the source layer, skipped: {SKIPPED_OBJECT_IDS}"
        )
    if not rows:
        print("parcel_subdivision (collier): 0 rows — aborting Tier 2 promotion")
        return 0
    # canonical counts ALL Collier parcels (incl. non-home/vacant); rows is home-only
    # after the DOR filter, so compare against a floor, not a 1:1 assertion.
    assert_vs_canonical(len(rows), canonical, floor=0.5, label="collier parcel_subdivision (home subset)")
    _promote_to_tier2(rows)
    print(f"parcel_subdivision (collier): merged {len(rows)} homes into data_lake.parcel_subdivision")
    return len(rows)
