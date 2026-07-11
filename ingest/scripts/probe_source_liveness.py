"""Upstream SOURCE-liveness probe — the check the freshness probe CANNOT do.

WHY THIS EXISTS (the collier_parcels false-green, 06/06–07/11/2026):
  `check_freshness.py` reads `MAX(inserted_at) FROM _dlt_loads` — i.e. "when did we last
  WRITE" — and compares it to `cadence_days * tolerance_multiplier`. For collier_parcels
  that threshold is 365 * 1.5 = **547 days**. When the FDOR ArcGIS FeatureServer silently
  started 400-ing every attribute WHERE (`CO_NO=21`), the pipeline fetched 0 rows and
  aborted BEFORE writing — so no new `_dlt_loads` row appeared, and the probe kept reading
  the last good 06/06 load as FRESH. It would have stayed green until ~Dec 2027.

  The freshness probe is structurally blind to this: a source can be 100% dead and the DB
  still reads fresh. The ONLY way to catch it is to hit the UPSTREAM with the pipeline's
  REAL query and assert HTTP 200 + a plausible count. That is this script.

WHAT IT DOES:
  For each registered ArcGIS/REST source: GET {url}?where={real_where}&returnCountOnly=true
  and assert status 200 + count >= floor. Prints LIVE / BROKEN / DEGRADED. Read-only, hits
  no DB, never writes. Space calls (RULE F) — ArcGIS WAFs throttle rapid sequential probes.

RUN:
  C:\\Users\\ethan\\crawl4ai-venv\\Scripts\\python.exe -m ingest.scripts.probe_source_liveness
  (or any python with `requests`)

EXIT: 1 if any source is BROKEN (use in a weekly cron); 0 otherwise. Observability tool —
  do NOT wire it as a push gate; it's a morning alarm, not a merge blocker.
"""
from __future__ import annotations

import sys
import time

import requests

# Each source: the pipeline's REAL query (not 1=1 — probe what the pipeline actually asks
# for) + a floor well under the known-good count so a real drop trips it. `where=1=1` on a
# huge national service (FEMA NFHL) times out — you MUST use the pipeline's real filter.
SOURCES = [
    {
        "name": "collier_parcels (FDOR)",
        "url": "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query",
        "where": "CO_NO=21",
        "floor": 300_000,
        "note": "KNOWN BROKEN 07/11/2026 — republished statewide roll locks attribute WHERE. "
        "FIX: repoint to Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0 (same query works).",
    },
    {
        "name": "collier_parcels FIX (centroid twin)",
        "url": "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0/query",
        "where": "CO_NO=21",
        "floor": 300_000,
        "note": "The working replacement — CO_NO=21 = 364,827, carries SALE_PRC1/DOR_UC/PHY_ZIPCD.",
    },
    {
        "name": "leepa (Lee parcels)",
        "url": "https://gissvr.leepa.org/gissvr/rest/services/ParcelInfo/MapServer/12/query",
        "where": "1=1",
        "floor": 500_000,
        "note": "Live 548,330 on 07/11. This is our Lee parcel source — do NOT duplicate Lee from FDOR.",
    },
    {
        "name": "fdot (traffic AADT)",
        "url": "https://gis.fdot.gov/arcgis/rest/services/FTO/fto_PROD/MapServer/7/query",
        "where": "1=1",
        "floor": 90_000,
        "note": "Live 103,662 on 07/11.",
    },
    {
        "name": "fema (NFHL flood)",
        "url": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query",
        # NFHL is national — 1=1 504s. Replace with the pipeline's real state/bbox filter
        # (grep ingest/pipelines/fema for the DFIRM_ID / bbox it uses) before trusting this row.
        "where": "DFIRM_ID LIKE '12071%' OR DFIRM_ID LIKE '12021%'",
        "floor": 1,
        "note": "TODO: pin the exact filter the fema pipeline uses; 1=1 times out on the national service.",
    },
]

_SPACING_S = 4  # RULE F — space calls so a rapid sweep doesn't trip the host WAF.


def probe_one(src: dict, timeout: int = 45) -> dict:
    # Retry once on timeout: real ArcGIS services are slow under load, and a single
    # timeout must NOT be reported as if the source were fine. A persistent timeout is
    # DEGRADED (visible), never silently OK.
    resp = None
    last_exc = None
    for attempt in range(2):
        try:
            resp = requests.get(
                src["url"],
                params={"where": src["where"], "returnCountOnly": "true", "f": "json"},
                timeout=timeout,
            )
            break
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt == 0:
                time.sleep(_SPACING_S)
    if resp is None:
        return {**src, "status": "DEGRADED", "detail": f"request error/timeout (2x): {last_exc}"}

    if resp.status_code != 200:
        return {**src, "status": "BROKEN", "detail": f"HTTP {resp.status_code}"}
    try:
        body = resp.json()
    except Exception:
        return {**src, "status": "BROKEN", "detail": "non-JSON body"}
    # ArcGIS returns HTTP 200 with an {"error":{"code":400}} body on a rejected WHERE —
    # THIS is the exact false-green shape; a naive status-code check would miss it.
    if isinstance(body, dict) and "error" in body:
        return {**src, "status": "BROKEN", "detail": f"200-body-error: {body['error']}"}
    count = int(body.get("count", 0)) if isinstance(body, dict) else 0
    if count < src["floor"]:
        return {**src, "status": "DEGRADED", "detail": f"count {count:,} < floor {src['floor']:,}"}
    return {**src, "status": "LIVE", "detail": f"count {count:,}"}


def main() -> int:
    try:  # Windows console defaults to cp1252 — force UTF-8 so notes don't mojibake.
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    print("Upstream source-liveness probe - hits the SOURCE, not the DB\n")
    broken = 0
    for i, src in enumerate(SOURCES):
        if i:
            time.sleep(_SPACING_S)
        r = probe_one(src)
        icon = {"LIVE": "OK  ", "DEGRADED": "WARN", "BROKEN": "FAIL"}[r["status"]]
        print(f"[{icon}] {r['name']:38s} {r['status']:8s} {r['detail']}")
        if r["note"]:
            print(f"        note: {r['note']}")
        if r["status"] == "BROKEN":
            broken += 1
    print(f"\n{broken} broken source(s).")
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
