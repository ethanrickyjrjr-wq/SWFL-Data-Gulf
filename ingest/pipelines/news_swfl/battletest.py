"""SOLO-14 battle-test: baseline (~40-cap + regex) vs adaptive (BestFirst frontier).

Live network. Measures, per strategy:
  yield      — # SWFL-relevant ArticleRows returned
  precision  — yield / pages actually turned into candidate rows (all returned rows are
               swfl_relevant by construction, so precision here = swfl-kept / total-considered
               is reported per strategy via the relevance pass; both apply the SAME filter, so
               the comparison is yield + freshness + per-source spread)
  freshness  — distinct published_date values (baseline passes None -> today for all, so this
               mostly reflects today's run; recorded for completeness)
  spread     — rows per source (the baseline's hard per-source cap vs the frontier's score-first)

Run:  python -m ingest.pipelines.news_swfl.battletest
Tolerates per-source blocks; prints what it got. Numbers are recorded in SESSION_LOG / the spec.
"""
from __future__ import annotations

import time
from collections import Counter


def _summarize(label: str, rows) -> dict:
    by_source = Counter(r["source_name"] for r in rows)
    dates = Counter(r["published_date"] for r in rows)
    urls = {r["article_url"] for r in rows}
    print(f"\n=== {label} ===")
    print(f"  yield (swfl rows): {len(rows)}")
    print(f"  distinct urls:     {len(urls)}")
    print(f"  by source:         {dict(by_source)}")
    print(f"  distinct pub dates:{len(dates)} -> {dict(dates)}")
    return {"label": label, "yield": len(rows), "by_source": dict(by_source), "urls": urls}


def main() -> None:
    from .fetcher import fetch_all_sources  # baseline (flag off)
    from .adaptive_fetcher import fetch_all_sources_adaptive

    print("[battle-test] running BASELINE (~40-cap + regex)...")
    t0 = time.monotonic()
    try:
        base_rows = fetch_all_sources()
    except Exception as e:  # noqa: BLE001 — battle-test must report, not crash
        print(f"[battle-test] baseline raised: {e}")
        base_rows = []
    t_base = time.monotonic() - t0
    base = _summarize("BASELINE", base_rows)
    print(f"  wall: {t_base:.1f}s")

    print("\n[battle-test] running ADAPTIVE (BestFirst frontier)...")
    t0 = time.monotonic()
    try:
        adapt_rows = fetch_all_sources_adaptive()
    except Exception as e:  # noqa: BLE001
        print(f"[battle-test] adaptive raised: {e}")
        adapt_rows = []
    t_adapt = time.monotonic() - t0
    adapt = _summarize("ADAPTIVE", adapt_rows)
    print(f"  wall: {t_adapt:.1f}s")

    print("\n=== VERDICT ===")
    print(f"  baseline yield={base['yield']}  adaptive yield={adapt['yield']}")
    new_urls = adapt["urls"] - base["urls"]
    print(f"  urls adaptive found that baseline missed: {len(new_urls)}")
    if base["urls"]:
        overlap = len(adapt["urls"] & base["urls"])
        print(f"  overlap: {overlap}")
    winner = "ADAPTIVE" if adapt["yield"] > base["yield"] else (
        "BASELINE" if base["yield"] > adapt["yield"] else "TIE"
    )
    print(f"  yield winner: {winner}")


if __name__ == "__main__":
    main()
