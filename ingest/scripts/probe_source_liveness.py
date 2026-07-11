"""Upstream SOURCE-liveness probe — the check the freshness probe CANNOT do.

WHY THIS EXISTS (the collier_parcels false-green, 06/06–07/11/2026):
  `check_freshness.py` reads `MAX(inserted_at) FROM _dlt_loads` — i.e. "when did we last
  WRITE" — and compares it to `cadence_days * tolerance_multiplier`. For collier_parcels
  that threshold is 365 * 1.5 = **547 days**. When the FDOR ArcGIS FeatureServer silently
  started 400-ing every attribute WHERE (`CO_NO=21`), the pipeline fetched 0 rows and
  aborted BEFORE writing — so no new `_dlt_loads` row appeared, and the probe kept reading
  the last good 06/06 load as FRESH. It would have stayed green until ~Dec 2027.

  A staleness threshold can NEVER catch this. An ANNUAL source legitimately has no new
  data for a year, so "days since last write" is silent by design. The only thing that
  proves a source is ALIVE is hitting the source. That is this script — and it runs
  DAILY even though the data is annual. Check liveness on the CLOCK, not the cadence.

DESIGN — no drift:
  Endpoints + WHERE clauses are IMPORTED from each pipeline's own constants, never
  retyped here. Repoint a pipeline and this probe follows it automatically. A probe that
  hardcodes a URL is a probe that silently checks the wrong thing after a repoint.

COVERAGE — every layer a pipeline actually reads:
  leepa reads FOUR MapServer layers (parcels/use-codes/last-sale/just-value). If the
  use-code layer dies, the homes-only sold median silently loses its filter while the
  parcel layer still looks fine. Probe every layer the pipeline depends on, not just one.

NOT IN SCOPE: non-ArcGIS sources (OpenFEMA REST, Census/BLS/FRED APIs, crawl sources).
  They fail differently and need their own class of check — see
  docs/handoff/2026-07-11-source-liveness-and-collier-handoff.md §5.

RUN:  python -m ingest.scripts.probe_source_liveness
EXIT: 1 if any source is BROKEN (wired into the DAILY freshness workflow so a lock is
  caught within 24h, not 18 months). Observability alarm — never a push gate.
"""
from __future__ import annotations

import os
import sys
import time

import requests

# Import the REAL configured endpoints — never retype a URL here (see DESIGN above).
from ingest.pipelines.collier_parcels.constants import (
    COLLIER_CADASTRAL_URL,
    COLLIER_CO_NO_WHERE,
)
from ingest.pipelines.fdot.constants import FDOT_AADT_URL
from ingest.pipelines.leepa.constants import (
    LEEPA_JUST_VALUE_URL,
    LEEPA_LAST_SALE_URL,
    LEEPA_USE_CODES_URL,
)

# We probe only the layers the pipeline actually FETCHES, with the fields it actually
# READS. (Deliberately absent: leepa MapServer layer 0 / LEEPA_PARCELS_URL — that layer
# is "Tangible Business Names", not parcels, and the pipeline never fetches it; it is
# only used as a citation string. The miscited URL is tracked separately.)
#
# floor = well under the known-good count, so a real collapse trips it while normal
# growth/shrink does not. Counts verified live 07/11/2026. A floor is only evaluated when
# the server can actually count (see probe_one) — never fail a source for slow counting.
SOURCES: list[dict] = [
    {
        "name": "collier_parcels (FDOR centroid)",
        "url": COLLIER_CADASTRAL_URL,
        "where": COLLIER_CO_NO_WHERE,
        "out_fields": "PARCEL_ID,SALE_PRC1,DOR_UC,PHY_ZIPCD",
        "floor": 300_000,
        "note": "364,827 live 07/11. Repointed off the locked polygon layer. If this BREAKS, check "
        "whether FloridaGIO locked the centroid twin too — and DO NOT tune the threshold, fix the source.",
    },
    # leepa fetches three layers and left-joins them on FOLIOID. A silent death in the
    # use-code layer breaks the homes-only filter while the value layer still looks fine.
    {
        "name": "leepa L9 use-codes",
        "url": LEEPA_USE_CODES_URL,
        "where": "1=1",
        "out_fields": "FOLIOID",
        "floor": 400_000,
        "note": "Feeds the homes-only (use_code 01/04) filter — a silent death here land-blends the median.",
    },
    {
        "name": "leepa L10 last-sale",
        "url": LEEPA_LAST_SALE_URL,
        "where": "1=1",
        "out_fields": "FOLIOID",
        "floor": 100_000,
        "note": "Feeds the Lee sold median (recorded deeds).",
    },
    {
        "name": "leepa L12 just-value",
        "url": LEEPA_JUST_VALUE_URL,
        "where": "1=1",
        "out_fields": "FOLIOID,Just",
        "floor": 400_000,
        "note": "Lee's parcel SPINE (the join anchor). Lee=LeePA — never duplicate Lee from FDOR. "
        "NB this server cannot reliably COUNT 548k rows (returnCountOnly intermittently 400s) — "
        "that is expected and is NOT a break; the row fetch is the real liveness signal.",
    },
    {
        "name": "fdot AADT (traffic)",
        "url": FDOT_AADT_URL,
        "where": "1=1",
        "out_fields": "OBJECTID",
        "floor": 90_000,
        "note": "103,662 live 07/11.",
    },
]

_SPACING_S = 4  # space calls — ArcGIS hosts throttle rapid sequential probes.


def _get(url: str, params: dict, timeout: int) -> tuple[dict | None, str | None]:
    """GET + parse. Returns (body, error_detail). Retries once — a single timeout must
    never be reported as if the source were fine, and deterministic breakage (the FDOR
    case) survives a retry while transient server load does not."""
    last = None
    for attempt in range(2):
        try:
            r = requests.get(url, params=params, timeout=timeout)
            if r.status_code != 200:
                last = f"HTTP {r.status_code}"
            else:
                try:
                    body = r.json()
                except Exception:
                    last = "non-JSON body"
                else:
                    # ArcGIS returns HTTP 200 with an {"error":{"code":400}} body on a
                    # rejected query — the exact false-green shape a status-code-only
                    # check would miss.
                    if isinstance(body, dict) and "error" in body:
                        last = f"200-body-error: {body['error'].get('message') or body['error']}"
                    else:
                        return body, None
        except Exception as exc:  # noqa: BLE001
            last = f"request error/timeout: {exc}"
        if attempt == 0:
            time.sleep(_SPACING_S)
    return None, last


def probe_one(src: dict, timeout: int = 45) -> dict:
    """Liveness = can we run THE QUERY THE PIPELINE RUNS (a row fetch), not a count.

    WHY NOT returnCountOnly (learned the hard way 07/11/2026): LeePA's server cannot
    reliably COUNT its 548k-row just-value layer — `returnCountOnly` intermittently 400s
    ("Failed to execute query") while a normal row fetch on the SAME layer works fine.
    A count-based probe would have cried wolf on Lee every day. Meanwhile it buys nothing
    for detection: the FDOR lockdown rejects the row fetch too. So probe the row fetch
    (cheap, and it is literally the pipeline's code path); treat the count as a
    best-effort VOLUME signal only, and never fail a source because counting is expensive.
    """
    body, err = _get(
        src["url"],
        {
            "where": src["where"],
            "outFields": src.get("out_fields", "*"),
            "resultRecordCount": 1,
            "returnGeometry": "false",
            "f": "json",
        },
        timeout,
    )
    if body is None:
        return {**src, "status": "BROKEN", "detail": f"row fetch failed — {err}"}
    if not body.get("features"):
        return {**src, "status": "BROKEN", "detail": "row fetch returned 0 features"}

    # Alive. Now a BEST-EFFORT count for volume — a count that fails/times out is NOT a
    # broken source (see docstring), it just means this server can't count cheaply.
    time.sleep(_SPACING_S)
    cbody, cerr = _get(
        src["url"], {"where": src["where"], "returnCountOnly": "true", "f": "json"}, timeout
    )
    if cbody is None or "count" not in cbody:
        return {**src, "status": "LIVE", "detail": "row fetch OK (count unavailable on this server)"}
    count = int(cbody["count"])
    if count < src["floor"]:
        return {**src, "status": "DEGRADED", "detail": f"count {count:,} < floor {src['floor']:,}"}
    return {**src, "status": "LIVE", "detail": f"count {count:,}"}


def main() -> int:
    try:  # Windows console defaults to cp1252 — force UTF-8 so notes don't mojibake.
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    results = []
    for i, src in enumerate(SOURCES):
        if i:
            time.sleep(_SPACING_S)
        results.append(probe_one(src))

    lines = ["## Upstream source-liveness probe\n", "Hits each SOURCE with the pipeline's real query — the check `check_freshness` structurally cannot do.\n"]
    lines += ["| Source | Status | Detail |", "| --- | --- | --- |"]
    broken = 0
    print("Upstream source-liveness probe - hits the SOURCE, not the DB\n")
    for r in results:
        icon = {"LIVE": "OK  ", "DEGRADED": "WARN", "BROKEN": "FAIL"}[r["status"]]
        print(f"[{icon}] {r['name']:32s} {r['status']:8s} {r['detail']}")
        if r["note"]:
            print(f"        note: {r['note']}")
        emoji = {"LIVE": "✅", "DEGRADED": "⚠️", "BROKEN": "🚨"}[r["status"]]
        lines.append(f"| {r['name']} | {emoji} {r['status']} | {r['detail']} |")
        if r["status"] == "BROKEN":
            broken += 1
    print(f"\n{broken} broken source(s).")

    if broken:
        lines.append(
            f"\n🚨 **{broken} BROKEN source(s)** — the ingest is silently no-op'ing. "
            "Freshness will keep reading FRESH until the staleness window ages out "
            "(547 days for an annual source). Fix the source, do not tune the threshold.\n"
        )
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
