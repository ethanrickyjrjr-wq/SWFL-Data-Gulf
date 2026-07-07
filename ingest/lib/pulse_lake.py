# ingest/lib/pulse_lake.py
"""Read the free news lake (data_lake.news_articles_swfl, crawl4ai-fed by the
news_swfl pipeline) and pack matched articles into the `capture` shape the pulse
distill already consumes. This REPLACES the paid web_search capture: same
downstream contract, $0 gather.

READ-ONLY on news_articles_swfl (owned by the news_swfl session). The only
writer is evict_stale_pool (see the eviction runner), coordinated separately."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, TypedDict

from ingest.lib.pulse_match import article_matches_city, article_matches_corridor
from ingest.lib.tier1_inventory import _get_connection


class LakeArticle(TypedDict):
    article_url: str
    headline: str
    body_text: str
    source_name: str
    published_date: str


_SELECT = (
    "SELECT article_url, headline, body_text, source_name, published_date "
    "FROM data_lake.news_articles_swfl "
    "WHERE published_date >= %(since)s "
    "ORDER BY published_date DESC"
)


def load_recent_articles(window_days: int = 7, conn=None) -> list[LakeArticle]:
    since = (date.today() - timedelta(days=window_days)).isoformat()
    own = conn is None
    conn = conn or _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_SELECT, {"since": since})
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, r)) for r in cur.fetchall()]  # type: ignore[misc]
    finally:
        if own:
            conn.close()


def build_capture(
    unit_field: str,
    unit_value: str,
    run_at: str,
    articles: list[LakeArticle],
    exclude_urls: frozenset[str] | set[str] = frozenset(),
) -> dict[str, Any]:
    """Pack this unit's matched lake articles into the distill `capture` shape.

    `exclude_urls` drops articles already distilled for this unit (their url is
    already a source_url in the pulse table) — dedup BEFORE the paid Sonnet call,
    so overlapping daily windows never re-pay for the same article. Recall is
    preserved: only already-processed urls are skipped, every NEW article stays.
    write_rows' ON CONFLICT(dedup_key) remains the after-the-fact safety net."""
    if unit_field == "city":
        matched = [a for a in articles if article_matches_city(unit_value, a["headline"], a["body_text"])]
    elif unit_field == "corridor":
        matched = [a for a in articles if article_matches_corridor(unit_value, a["headline"], a["body_text"])]
    else:
        raise ValueError(f"unit_field must be 'city' or 'corridor', got {unit_field!r}")
    matched = [a for a in matched if a["article_url"] not in exclude_urls]
    citations = [
        {"url": a["article_url"], "title": a["headline"],
         "cited_text": a["body_text"], "type": "news_lake"}
        for a in matched
    ]
    return {unit_field: unit_value, "run_at": run_at, "citations": citations, "source": "news_lake"}


# Only these (table, unit_col) pairs are queryable — the values interpolate into
# SQL, so the allowlist is the injection guard (they are internal constants).
_PULSE_TABLES = {("city_pulse", "city"), ("city_pulse_corridors", "corridor")}


def known_urls_by_unit(table: str, unit_col: str, conn=None) -> dict[str, set[str]]:
    """Every source_url already written to the pulse table, grouped by unit, so
    build_capture can skip already-distilled articles (dedup before the paid call).
    Mirrors what write_rows' ON CONFLICT would reject, but before the spend."""
    if (table, unit_col) not in _PULSE_TABLES:
        raise ValueError(f"unknown pulse (table, unit_col): {(table, unit_col)!r}")
    own = conn is None
    conn = conn or _get_connection()
    out: dict[str, set[str]] = {}
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT {unit_col}, source_url FROM data_lake.{table}")
            for unit, url in cur.fetchall():
                out.setdefault(unit, set()).add(url)
        return out
    finally:
        if own:
            conn.close()


def _evict_count_sql() -> str:
    return "SELECT count(*) FROM data_lake.news_articles_swfl WHERE published_date < %(cutoff)s"


def _evict_sql() -> str:
    return "DELETE FROM data_lake.news_articles_swfl WHERE published_date < %(cutoff)s"


def evict_stale_pool(window_days: int = 45, dry_run: bool = True, conn=None) -> int:
    """Drop raw-pool rows older than window_days. Lossless: city_pulse facts copy
    their own source_url + cited_text; Tier-1 cold storage keeps the raw audit."""
    cutoff = (date.today() - timedelta(days=window_days)).isoformat()
    own = conn is None
    conn = conn or _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_evict_count_sql(), {"cutoff": cutoff})
            n = cur.fetchone()[0]
            if not dry_run and n:
                cur.execute(_evict_sql(), {"cutoff": cutoff})
                conn.commit()
        return n
    finally:
        if own:
            conn.close()
