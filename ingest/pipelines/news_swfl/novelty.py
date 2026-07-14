"""First-seen carry-forward for the news_swfl novelty guard.

news captures no real content date: the fetcher passes published_date=None and the
normalizer coerces it to today, so the stored published_date is a scrape timestamp in
disguise — and dlt merge (delete-insert) re-bumps it on every re-seen article_url.
Staleness for news therefore means "no NEW article_url has appeared", not "content too old".

carry_first_seen restores first-seen semantics pre-write: a re-seen URL keeps the
published_date already stored in data_lake.news_articles_swfl, a never-seen URL keeps
today. After the carry, MAX(published_date) across the batch IS the last-novelty date, so
the pipeline reuses assert_content_fresh as a novelty guard with zero new guard machinery.
"""
from __future__ import annotations

import logging
import os

from .normalizer import ArticleRow

log = logging.getLogger(__name__)

# Cadence is 1d, but the registry documents legitimate 0-1 article days and the two govt
# sources are weekday-only. Zero new URLs across all sources for a full week = broken
# scrape (LINK_RE regression, markup change, WAF block), not a slow news week.
NEWS_NOVELTY_MAX_AGE_DAYS = 7

_TABLE = "data_lake.news_articles_swfl"


def _get_conn():
    import psycopg

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        try:
            import tomllib
            from pathlib import Path

            s = Path(".dlt/secrets.toml")
            if s.exists():
                with s.open("rb") as f:
                    data = tomllib.load(f)
                pg = data.get("destination", {}).get("postgres", {}).get("credentials", {})
                host, pw = pg.get("host", ""), pg.get("password", "")
                db, user = pg.get("database", "postgres"), pg.get("username", "postgres")
                port = pg.get("port", 5432)
                if host and pw:
                    db_url = f"postgresql://{user}:{pw}@{host}:{port}/{db}?sslmode=require"
        except Exception:
            pass
    if not db_url:
        raise RuntimeError("No DB URL. Set DATABASE_URL or ensure .dlt/secrets.toml is present.")
    return psycopg.connect(db_url)


def fetch_stored_first_seen(urls: list[str]) -> dict[str, str]:
    """Map article_url -> stored published_date (ISO text) for URLs already in Tier 2."""
    if not urls:
        return {}
    with _get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"SELECT article_url, published_date FROM {_TABLE} WHERE article_url = ANY(%s)",
            (urls,),
        )
        return {u: d for u, d in cur.fetchall() if d}


def carry_first_seen(rows: list[ArticleRow]) -> list[ArticleRow]:
    """Overwrite each re-seen row's published_date with its stored first-seen value.

    Fail-open on infra error (BASELINE_UNAVAILABLE spirit of assert_vs_baseline): if the
    pre-query cannot reach the DB, every row keeps today and the guard passes — the merge
    itself will surface a real connection problem moments later.
    """
    try:
        stored = fetch_stored_first_seen([r["article_url"] for r in rows])
    except Exception as exc:
        log.warning(
            "[novelty-guard] BASELINE_UNAVAILABLE for news_swfl (%s) — skipping first-seen carry",
            exc,
        )
        return rows
    for r in rows:
        prior = stored.get(r["article_url"])
        if prior:
            r["published_date"] = prior
    return rows
