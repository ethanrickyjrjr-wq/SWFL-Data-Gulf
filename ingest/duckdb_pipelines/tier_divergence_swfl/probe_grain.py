"""Step-0 PROBE for the tier-divergence-swfl brain — gate the grain BEFORE building.

Run with:
    # Default: DuckDB streams the two RAW Zillow tier CSVs directly from the URL
    # via httpfs — no download, no disk staging.
    python ingest/duckdb_pipelines/tier_divergence_swfl/probe_grain.py

    # Or read pre-downloaded local copies:
    python ingest/duckdb_pipelines/tier_divergence_swfl/probe_grain.py \
        --bottom-csv /path/to/bottom.csv --top-csv /path/to/top.csv

WHY THIS EXISTS (cardinal ingest rule — PROBE FIRST ALWAYS):
    A tier "divergence" needs BOTH a bottom-tier and a top-tier value in the SAME
    ZIP. Uniform ZIPs may carry only one tier (all-luxury Naples; all-modest inland
    Lehigh). This probe answers, before any pipeline is wired:
      (a) how many SWFL ZIPs have a bottom-tier value,
      (b) how many have a top-tier value,
      (c) how many have BOTH (the per-ZIP divergence universe), and
      (d) which ZIPs are missing one tier (+ their Metro label),
    so we can set the detail-table grain, expected_rows_min, and the GATE B
    MIN_VIEW_ROWS floor from evidence — and fall back to a county rollup for the
    held-out ZIPs instead of silently truncating (ZIP gate G2).

VENDOR NOTE (resolved 2026-06-14): Zillow publishes NO smoothed+seasonally-adjusted
    (_sm_sa) variant of the top/bottom ZHVI tiers — the RAW month files below are the
    only form. (The existing middle-tier zhvi_swfl brain uses the _sm_sa file.) The
    tier-divergence math therefore leans on YoY, which cancels seasonality by
    construction; the raw vs sm_sa mismatch is a documented caveat, not a blocker.

Self-contained (no project imports) so it can run before the rest of the pipeline
package exists. DuckDB's httpfs extension streams the remote CSV directly — only the
rows/columns scanned are pulled across the wire; nothing is written to disk.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import duckdb

# ── Source: RAW Zillow ZHVI tier CSVs (ZIP grain, monthly) ─────────────────────
# Verified live 2026-06-14: 200 OK, ~130/139 MB, last-modified 2026-05-16, latest
# month column 2026-04-30. Tier percentiles are encoded in the filename:
#   bottom = 0.0–0.33 (5th–35th pct, "starter"), top = 0.67–1.0 (65th–95th, "luxury").
_BASE = "https://files.zillowstatic.com/research/public_csvs/zhvi"
BOTTOM_CSV_URL = f"{_BASE}/Zip_zhvi_uc_sfrcondo_tier_0.0_0.33_month.csv"
TOP_CSV_URL = f"{_BASE}/Zip_zhvi_uc_sfrcondo_tier_0.67_1.0_month.csv"

# ── Geographic filter (verbatim from the zhvi_swfl pipeline) ───────────────────
STATE_CODE = "FL"
REGION_TYPE = "zip"
SWFL_METRO_SUBSTRINGS = ("Cape Coral", "Naples", "Punta Gorda", "North Port")

# CSV metadata columns to preserve through the UNPIVOT (everything not month-shaped).
# Names match the Zillow tier CSV header verbatim (identical to ZHVI/ZORI).
METADATA_COLUMNS: tuple[str, ...] = (
    "RegionID",
    "SizeRank",
    "RegionName",
    "RegionType",
    "StateName",
    "State",
    "City",
    "Metro",
    "CountyName",
)


def _metro_like_clause() -> str:
    return "(" + " OR ".join(f"Metro LIKE '%{s}%'" for s in SWFL_METRO_SUBSTRINGS) + ")"


def _latest_tier(con: duckdb.DuckDBPyConnection, source: str) -> list[tuple[str, str, float]]:
    """Return [(zip_code, metro, latest_value)] at the source's latest non-null month.

    `source` is either a remote https URL (streamed by httpfs) or a local CSV path.
    Filters State='FL' + RegionType='zip' + SWFL metros, UNPIVOTs the wide month
    columns to long, drops nulls, then keeps only the single globally-latest month.
    """
    exclude = "(" + ", ".join(METADATA_COLUMNS) + ")"
    where = f"State = '{STATE_CODE}' AND RegionType = '{REGION_TYPE}' AND {_metro_like_clause()}"
    rows = con.execute(f"""
        WITH wide AS (
            SELECT * FROM read_csv_auto('{source}', header=true, quote='"')
            WHERE {where}
        ),
        melted AS (
            UNPIVOT wide ON COLUMNS(* EXCLUDE {exclude})
            INTO NAME period_end_str VALUE v
        ),
        typed AS (
            SELECT CAST(RegionName AS VARCHAR) AS zip_code,
                   Metro                        AS metro,
                   CAST(period_end_str AS DATE) AS period_end,
                   CAST(v AS DOUBLE)            AS val
            FROM melted
            WHERE v IS NOT NULL
        )
        SELECT zip_code, metro, val
        FROM typed
        WHERE period_end = (SELECT MAX(period_end) FROM typed)
        ORDER BY zip_code
    """).fetchall()
    return [(str(z), str(m), float(v)) for z, m, v in rows]


def _report(
    bottom: list[tuple[str, str, float]],
    top: list[tuple[str, str, float]],
) -> None:
    bottom_map = {z: (m, v) for z, m, v in bottom}
    top_map = {z: (m, v) for z, m, v in top}
    both = sorted(set(bottom_map) & set(top_map))
    only_bottom = sorted(set(bottom_map) - set(top_map))
    only_top = sorted(set(top_map) - set(bottom_map))

    print("\n" + "=" * 70)
    print("TIER-DIVERGENCE STEP-0 GRAIN PROBE — SWFL (Lee/Collier/Charlotte/Sarasota)")
    print("=" * 70)
    print(f"(a) ZIPs with a BOTTOM-tier value (latest month): {len(bottom_map)}")
    print(f"(b) ZIPs with a TOP-tier value    (latest month): {len(top_map)}")
    print(f"(c) ZIPs with BOTH tiers (per-ZIP divergence universe): {len(both)}")
    print(f"    -> {len(only_bottom)} bottom-only, {len(only_top)} top-only (held-out)")

    print("\n(d) ZIPs MISSING one tier (would fall back to county rollup):")
    if not (only_bottom or only_top):
        print("    none — every SWFL ZIP carries both tiers.")
    else:
        for z in only_bottom:
            m, _ = bottom_map[z]
            print(f"    {z:<7} bottom-only (no luxury tier)   metro={m}")
        for z in only_top:
            m, _ = top_map[z]
            print(f"    {z:<7} top-only (no starter tier)     metro={m}")

    # ── bonus: is the signal meaningful? median top/bottom spread on both-tier ZIPs
    if both:
        spreads = sorted(top_map[z][1] / bottom_map[z][1] for z in both)
        mid = spreads[len(spreads) // 2]
        print(
            f"\n[bonus] both-tier spread (top/bottom): "
            f"min {spreads[0]:.2f}x  median {mid:.2f}x  max {spreads[-1]:.2f}x"
        )

    print("\nDECISION RULE (from the plan):")
    print("  (c) >= ~40 both-tier ZIPs  -> ship per-ZIP divergence (primary grain)")
    print("  (c) thin                   -> per-ZIP where both exist + county rollup")
    print("                                 for the held-out (d) list; no silent drop.")
    print("  Set expected_rows_min and GATE B MIN_VIEW_ROWS (~80% of (c)) from (c).")
    print("=" * 70)


def _resolve_source(local: str | None, url: str, label: str) -> str:
    """Return a local CSV path (validated) or the remote URL to stream."""
    if local:
        p = Path(local)
        if not p.exists():
            print(f"ERROR: {label} CSV not found: {p}", file=sys.stderr)
            sys.exit(1)
        return p.as_posix()
    return url


def main() -> None:
    ap = argparse.ArgumentParser(description="Step-0 grain probe for tier-divergence-swfl")
    ap.add_argument("--bottom-csv", help="local path to the bottom-tier CSV (else stream the URL)")
    ap.add_argument("--top-csv", help="local path to the top-tier CSV (else stream the URL)")
    args = ap.parse_args()

    bottom_src = _resolve_source(args.bottom_csv, BOTTOM_CSV_URL, "bottom-tier")
    top_src = _resolve_source(args.top_csv, TOP_CSV_URL, "top-tier")

    con = duckdb.connect()
    # httpfs lets read_csv_auto stream straight from the https URLs (no disk staging).
    if bottom_src.startswith("http") or top_src.startswith("http"):
        con.execute("INSTALL httpfs; LOAD httpfs;")

    print(f"  bottom (starter, 0.0–0.33): {bottom_src}")
    bottom = _latest_tier(con, bottom_src)
    print(f"  top (luxury, 0.67–1.0):     {top_src}")
    top = _latest_tier(con, top_src)
    _report(bottom, top)


if __name__ == "__main__":
    main()
