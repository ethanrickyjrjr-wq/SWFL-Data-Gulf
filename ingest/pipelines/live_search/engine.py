"""Provenance + anomaly engine for data_lake.daily_truth.

Two fetch modes:
  api  — deterministic pull from an authoritative API we hold the URL for (FRED).
  lake — deterministic median from OUR OWN cleaned inventory view (no search, no LLM).

Integrity gates: a real source URL on every row, expected_range, and an anomaly check vs
OUR OWN prior value — a big day-over-day move is stored FLAGGED and held for human review,
never narrated.

The web-search fetch mode (Gemini grounded cascade + Firecrawl/Spider/Claude failsafe legs)
was REMOVED 07/12/2026 with the retirement of its only consumer, the median_sale_price
web-search (19 straight NULL days — no daily source exists; spec
docs/superpowers/specs/2026-07-11-daily-price-dual-signal-design.md). Spider is retired
(crawl4ai replaced it) and Anthropic never runs search — crawl4ai captures, Anthropic
writes (operator decree; twin of the no-paid-web_search-on-cron rule in ingest/CLAUDE.md).

External IO (_prior_value, _fred_latest, _lake_median_asking) is monkeypatched in tests;
the pure logic + orchestration is fully unit-tested.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date

import requests


@dataclass
class Candidate:
    value: float
    domain: str
    source_url: str
    engine: str
    grounded: bool = False  # True only if the value traces to a real fetched source URL (not model memory)
    source_title: str = ""


@dataclass
class DailyTruthRow:
    metric_key: str
    area: str
    period: str
    value: float | None
    unit: str | None
    source_url: str | None = None
    source_title: str | None = None
    engine: str | None = None
    query_text: str | None = None
    agreement_n: int = 0
    verified_on_page: bool = False
    source_tag: str = "live_search"
    status_reason: str | None = None
    anomaly_flag: bool = False
    anomaly_delta_pct: float | None = None
    metric_config: dict = field(default_factory=dict)


def _today() -> str:
    return date.today().isoformat()


def _question(cfg: dict, area: str) -> str:
    label = area.replace("_", " ").title()
    q = (cfg.get("questions") or ["{area_label}"])[0]
    return q.replace("{area_label}", label)


# --- ANOMALY (vs OUR OWN prior daily_truth row; NOT the vendor) ---
def _prior_value(metric_key: str, area: str) -> float | None:
    import psycopg

    from ingest.scripts.migrate_nfip_flood_zone_current import _uri

    try:
        with psycopg.connect(_uri(), connect_timeout=15) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT value FROM data_lake.daily_truth "
                "WHERE metric_key=%s AND area=%s AND value IS NOT NULL "
                "ORDER BY retrieved_at DESC LIMIT 1",
                (metric_key, area),
            )
            row = cur.fetchone()
            return float(row[0]) if row and row[0] is not None else None
    except Exception:  # noqa: BLE001 - no prior / DB unreachable -> treat as no baseline
        return None


def _snapshot(cfg: dict) -> dict:
    keys = ("unit", "vendor_anchor_table", "tolerance_pct", "expected_range", "denylist_domains", "anomaly_threshold_pct")
    return {k: cfg.get(k) for k in keys}


def _null_row(cfg: dict, area: str, reason: str) -> DailyTruthRow:
    return DailyTruthRow(
        metric_key=cfg["metric_key"], area=area, period=_today(), value=None,
        unit=cfg.get("unit"), status_reason=reason, metric_config=_snapshot(cfg),
    )


def _row(winner: Candidate, cfg: dict, area: str, anomaly_flag: bool, anomaly_delta_pct: float | None, agreement_n: int) -> DailyTruthRow:
    return DailyTruthRow(
        metric_key=cfg["metric_key"], area=area, period=_today(), value=winner.value,
        unit=cfg.get("unit"), source_url=winner.source_url, source_title=winner.source_title,
        engine=winner.engine, query_text=_question(cfg, area), agreement_n=agreement_n,
        verified_on_page=False, source_tag="live_search", anomaly_flag=anomaly_flag,
        anomaly_delta_pct=anomaly_delta_pct, metric_config=_snapshot(cfg),
    )


def finalize_with_anomaly(winner: Candidate | None, cfg: dict, area: str) -> DailyTruthRow:
    if winner is None or not winner.source_url:
        return _null_row(cfg, area, "no sourced number")
    lo, hi = cfg["expected_range"]
    if not (lo <= winner.value <= hi):
        return _null_row(cfg, area, f"value {winner.value} outside expected_range")
    prior = _prior_value(cfg["metric_key"], area)
    delta = None if not prior else (winner.value - prior) / prior * 100.0
    if delta is not None and abs(delta) > cfg["anomaly_threshold_pct"]:
        return _row(winner, cfg, area, True, delta, 1)  # stored, FLAGGED, held for human review
    return _row(winner, cfg, area, False, delta, 1)


def _fred_latest(series_id: str) -> tuple[float, str] | None:
    key = os.environ.get("FRED_API_KEY")
    if not key:
        return None
    try:
        resp = requests.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params={"series_id": series_id, "api_key": key, "file_type": "json", "sort_order": "desc", "limit": 1},
            timeout=30,
        )
        resp.raise_for_status()
        for o in resp.json().get("observations", []):
            if o.get("value") not in (".", None):
                return float(o["value"]), o["date"]
    except (requests.RequestException, ValueError, KeyError):
        return None
    return None


def resolve_metric_api(cfg: dict, area: str) -> DailyTruthRow:
    """API mode: deterministic pull from an authoritative API we HAVE the URL for (FRED). No cascade."""
    api = cfg.get("api_config") or {}
    got = _fred_latest(api.get("series_id"))
    if not got:
        return _null_row(cfg, area, "authoritative API returned no observation")
    value, period = got
    lo, hi = cfg["expected_range"]
    if not (lo <= value <= hi):
        return _null_row(cfg, area, f"value {value} outside expected_range")
    return DailyTruthRow(
        metric_key=cfg["metric_key"], area=area, period=period, value=value, unit=cfg.get("unit"),
        source_url=api.get("source_url"), source_title="FRED", engine="fred",
        agreement_n=1, verified_on_page=True, source_tag="live_search", metric_config=_snapshot(cfg),
    )


def _lake_median_asking(area: str) -> float | None:
    """Median list price for one city from OUR OWN cleaned active inventory
    (data_lake.listing_active_homes — THE authority view: api_feed + active +
    sale + Lee/Collier + homes-only + >=20k; see docs/sql/20260712_*.sql).
    Area slug -> city label mirrors the desk convention: cape_coral -> 'Cape Coral'."""
    import psycopg

    from ingest.scripts.migrate_nfip_flood_zone_current import _uri

    city = area.replace("_", " ").title()
    try:
        with psycopg.connect(_uri(), connect_timeout=15) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY list_price) "
                "FROM data_lake.listing_active_homes WHERE upper(btrim(city)) = upper(%s)",
                (city,),
            )
            row = cur.fetchone()
            return float(row[0]) if row and row[0] is not None else None
    except Exception:  # noqa: BLE001 - DB unreachable -> NULL row + reason, never a guess
        return None


def resolve_metric_lake(cfg: dict, area: str) -> DailyTruthRow:
    """LAKE mode: deterministic median from our own lake — no search, no LLM, no
    vendor. Provenance is SWFL Data Gulf's live active-listing inventory. Reuses
    the range + anomaly-vs-own-prior machinery so a contamination regression
    (e.g. land blending back into the rollup) is flagged, not narrated."""
    value = _lake_median_asking(area)
    if value is None:
        return _null_row(cfg, area, "lake: no active home rows for city (view empty or DB unreachable)")
    lake = cfg.get("lake_config") or {}
    winner = Candidate(
        value,
        "swfldatagulf.com",
        lake.get("source_url", "https://www.swfldatagulf.com/desk"),
        "lake",
        grounded=True,
        source_title="SWFL Data Gulf active-listing inventory",
    )
    return finalize_with_anomaly(winner, cfg, area)
