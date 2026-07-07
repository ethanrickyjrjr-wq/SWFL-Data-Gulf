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
    unit_field: str, unit_value: str, run_at: str, articles: list[LakeArticle]
) -> dict[str, Any]:
    if unit_field == "city":
        matched = [a for a in articles if article_matches_city(unit_value, a["headline"], a["body_text"])]
    elif unit_field == "corridor":
        matched = [a for a in articles if article_matches_corridor(unit_value, a["headline"], a["body_text"])]
    else:
        raise ValueError(f"unit_field must be 'city' or 'corridor', got {unit_field!r}")
    citations = [
        {"url": a["article_url"], "title": a["headline"],
         "cited_text": a["body_text"], "type": "news_lake"}
        for a in matched
    ]
    return {unit_field: unit_value, "run_at": run_at, "citations": citations, "source": "news_lake"}
