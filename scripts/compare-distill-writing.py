"""Haiku-vs-Sonnet distill writing comparison — READ-ONLY on the lake.

Operator ask (07/05/2026): "Run haiku and then show me the difference between
results over the next few days against old sonnet writings."

Method (isolates the MODEL variable):
  1. Pull live rows from data_lake.city_pulse distilled BEFORE 07/05/2026
     (Sonnet-era: the distill model switched to Haiku in cost mode that day).
  2. Rebuild each city's capture from those rows' own citation spans
     (title + cited_text + url) — the exact spans Sonnet wrote from.
  3. Run the CURRENT distill (ingest.pipelines.city_pulse.distill, Haiku,
     same prompt, same tool schema) on the rebuilt capture, in memory.
  4. Pair write-ups by source_url and append verbatim side-by-sides to
     verification/haiku-vs-sonnet-distill.md.

NOTHING is written to the lake. The only API spend is the Haiku distill
(~$0.01/city, metered to api_usage_log by the distill itself). Honors the
$5 daily-ceiling preflight before any call. Run through the valve:

  OPERATOR_APPROVED_PAID_RUN=1 node scripts/paid-run.mjs python scripts/compare-distill-writing.py

Known bias, stated in the output: rebuilt captures only contain spans Sonnet
KEPT, so this measures writing differences on shared spans (fidelity, wording,
classification), not recall on spans Sonnet dropped.
"""

from __future__ import annotations

import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env.local")  # same source pipeline.py uses

from ingest.lib.tier1_inventory import _get_connection  # noqa: E402
from ingest.pipelines.city_pulse import distill  # noqa: E402

NEW_LABEL = distill.MODEL.split("-2")[0].upper()  # e.g. CLAUDE-SONNET-4-6 / CLAUDE-HAIKU-4-5

OUT = ROOT / "verification" / "haiku-vs-sonnet-distill.md"
SONNET_ERA_CUTOFF = "2026-07-05"  # distill switched to Haiku this day (cost mode)
MAX_CITIES = 3
DAILY_CEILING_USD = 5.0


def preflight_ceiling(conn) -> float:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COALESCE(SUM(cost_usd), 0) FROM public.api_usage_log "
            "WHERE created_at >= date_trunc('day', now() at time zone 'utc')"
        )
        return float(cur.fetchone()[0])


def sonnet_rows(conn):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT city, topic, fact, source_url, source_title, cited_text, captured_at "
            "FROM data_lake.city_pulse "
            "WHERE captured_at < %(cutoff)s AND cited_text IS NOT NULL "
            "ORDER BY city, captured_at DESC",
            {"cutoff": SONNET_ERA_CUTOFF},
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


def main() -> int:
    conn = _get_connection()
    try:
        spent = preflight_ceiling(conn)
        if spent >= DAILY_CEILING_USD:
            print(f"ABORT: today's ledger spend ${spent:.2f} >= ${DAILY_CEILING_USD} ceiling")
            return 1
        rows = sonnet_rows(conn)
    finally:
        conn.close()

    by_city: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_city[r["city"]].append(r)
    if not by_city:
        print("No Sonnet-era rows left in the lake (TTL pruning) — nothing to compare.")
        return 1
    cities = sorted(by_city, key=lambda c: len(by_city[c]), reverse=True)[:MAX_CITIES]

    stamp = datetime.now(timezone.utc).strftime("%m/%d/%Y %H:%M UTC")
    lines = [f"\n## Comparison run — {stamp}\n"]
    total_pairs = 0

    for city in cities:
        crows = by_city[city]
        # one citation span per distinct url, preserving Sonnet-era span text
        seen: dict[str, dict] = {}
        for r in crows:
            u = (r["source_url"] or "").strip()
            if u and u not in seen:
                seen[u] = {
                    "title": r["source_title"],
                    "cited_text": r["cited_text"],
                    "url": u,
                }
        citations = list(seen.values())
        run_at = max(r["captured_at"] for r in crows).isoformat()
        capture = {"city": city, "run_at": run_at, "citations": citations}

        try:
            haiku_rows = distill.distill_capture(capture)  # Haiku, in-memory, no writes
        except Exception as exc:  # 400 no-credits lands here — record and stop
            lines.append(f"### {city} — {NEW_LABEL} CALL FAILED: {exc!r}\n")
            lines.append("(harness ready; re-run once credits exist)\n")
            append(lines)
            print(f"Haiku call failed for {city}: {exc!r}")
            return 1

        haiku_by_url: dict[str, list[dict]] = defaultdict(list)
        for h in haiku_rows:
            haiku_by_url[h["source_url"]].append(h)

        lines.append(
            f"### {city} — {len(citations)} shared spans · OLD-SONNET kept {len(crows)} facts · "
            f"{NEW_LABEL} kept {sum(len(v) for v in haiku_by_url.values())} facts\n"
        )
        for r in crows:
            u = (r["source_url"] or "").strip()
            hk = haiku_by_url.get(u, [])
            lines.append(f"- SPAN: {r['source_title'] or u}")
            lines.append(f"  - SONNET ({r['topic']}): {r['fact']}")
            if hk:
                for h in hk:
                    lines.append(f"  - {NEW_LABEL}  ({h['topic']}): {h['fact']}")
            else:
                lines.append(f"  - {NEW_LABEL}  : (dropped this span)")
            total_pairs += 1
        extra = [u for u in haiku_by_url if u not in {(r["source_url"] or "").strip() for r in crows}]
        for u in extra:
            for h in haiku_by_url[u]:
                lines.append(f"- {NEW_LABEL}-ONLY ({h['topic']}): {h['fact']} [{u}]")
        lines.append("")

    lines.append(f"_{total_pairs} span pairs this run; spend metered to api_usage_log (call_type ingest_city_pulse_distill)._\n")
    append(lines)
    print(f"OK: {total_pairs} span pairs across {len(cities)} cities -> {OUT}")
    return 0


def append(lines: list[str]) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    is_new = not OUT.exists()
    with OUT.open("a", encoding="utf-8") as f:
        if is_new:
            f.write(HEADER)
        f.write("\n".join(lines) + "\n")


HEADER = """# Haiku vs Sonnet — pulse distill writing comparison

**Purpose (operator, 07/05/2026):** show how different Haiku's fact write-ups are
from the old Sonnet writings, on identical citation spans, over several days —
evidence for the pulse retrofit's model choice.

## The specs to change (what the retrofit swaps)

- CAPTURE: `claude-sonnet-4-6` + paid `web_search_20250305` (max_uses 8/unit)
  → crawl4ai fetch of articles matched from the news_swfl lake ($0).
  Files: `ingest/pipelines/city_pulse/pipeline.py`, `ingest/pipelines/city_pulse_corridors/pipeline.py`.
- DISTILL: already `claude-haiku-4-5-20251001` (cost mode 07/05/2026); prompt +
  forced-tool schema unchanged. THIS FILE tests exactly that swap's writing cost.
- BUDGET: corridor RunBudget default $16 → $1 (decree; handoff in flight),
  city already capped; $5/day ceiling preflight everywhere.
- RE-ENABLE GATE: dry-run green on the runner + console shows zero web-search
  billing segments (`pulse_crawl4ai_retrofit_live_verify`).

## Method + known bias

Same spans, same prompt, same schema — only the model differs. Spans are
rebuilt from Sonnet-era lake rows, so spans Sonnet DROPPED are invisible here:
this measures wording/fidelity/classification on shared spans, not recall.
Sonnet-era = rows with captured_at < 07/05/2026. No lake writes; Haiku output
stays in this file.

Daily protocol: run the command below once a day for a few days (fresh
Sonnet-era rows keep aging out via TTL, so earlier runs cover more ground);
read the pairs; judge.

```
OPERATOR_APPROVED_PAID_RUN=1 node scripts/paid-run.mjs python scripts/compare-distill-writing.py
```
"""


if __name__ == "__main__":
    raise SystemExit(main())
