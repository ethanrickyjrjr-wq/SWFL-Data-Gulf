"""news_swfl novelty (new-URL) guard — deterministic DONE-WHEN proof.

news has no real content date (fetcher passes published_date=None, normalizer coerces to
today, delete-insert merge re-bumps it), so staleness = "no NEW article_url appeared".
carry_first_seen restores first-seen semantics from Tier 2, then the existing
assert_content_fresh gates on MAX(published_date) as a novelty age. These tests mock the
Tier-2 lookup — no Postgres/creds needed.
"""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import patch

import pytest

from ingest.lib.guards import ContentStaleError, assert_content_fresh
from ingest.pipelines.news_swfl.normalizer import normalize
from ingest.pipelines.news_swfl.novelty import NEWS_NOVELTY_MAX_AGE_DAYS, carry_first_seen


def _row(url: str) -> dict:
    return normalize(
        article_url=url,
        headline="Naples development update",
        body_text="Collier county project",
        source_name="naples_daily_news",
        published_date=None,
    )


def _newest(batch: list[dict]) -> str | None:
    return max((r["published_date"] for r in batch if r.get("published_date")), default=None)


OLD = (date.today() - timedelta(days=NEWS_NOVELTY_MAX_AGE_DAYS + 5)).isoformat()
RECENT = (date.today() - timedelta(days=2)).isoformat()


def test_carry_keeps_stored_first_seen_and_leaves_new_urls_at_today():
    batch = [_row("https://x.test/a"), _row("https://x.test/b")]
    with patch(
        "ingest.pipelines.news_swfl.novelty.fetch_stored_first_seen",
        return_value={"https://x.test/a": OLD},
    ):
        out = carry_first_seen(batch)
    assert out[0]["published_date"] == OLD  # re-seen: stored first-seen carried forward
    assert out[1]["published_date"] == date.today().isoformat()  # new URL: stays today


def test_all_reseen_and_old_trips_content_stale():
    """The stall this guard exists for: every listed URL is already in Tier 2 and none of
    them first appeared within the window — the scrape runs green but finds nothing new."""
    batch = [_row("https://x.test/a"), _row("https://x.test/b")]
    stored = {"https://x.test/a": OLD, "https://x.test/b": OLD}
    with patch(
        "ingest.pipelines.news_swfl.novelty.fetch_stored_first_seen", return_value=stored
    ):
        out = carry_first_seen(batch)
    with pytest.raises(ContentStaleError):
        assert_content_fresh(_newest(out), NEWS_NOVELTY_MAX_AGE_DAYS, label="news_swfl")


def test_recent_novelty_passes():
    batch = [_row("https://x.test/a"), _row("https://x.test/b")]
    stored = {"https://x.test/a": OLD, "https://x.test/b": RECENT}
    with patch(
        "ingest.pipelines.news_swfl.novelty.fetch_stored_first_seen", return_value=stored
    ):
        out = carry_first_seen(batch)
    assert_content_fresh(_newest(out), NEWS_NOVELTY_MAX_AGE_DAYS, label="news_swfl")


def test_brand_new_url_passes_even_when_everything_else_is_old():
    batch = [_row("https://x.test/a"), _row("https://x.test/new")]
    with patch(
        "ingest.pipelines.news_swfl.novelty.fetch_stored_first_seen",
        return_value={"https://x.test/a": OLD},
    ):
        out = carry_first_seen(batch)
    assert_content_fresh(_newest(out), NEWS_NOVELTY_MAX_AGE_DAYS, label="news_swfl")


def test_empty_batch_trips_immediately():
    """All 4 sources failing used to be a green no-op merge; newest=None now raises."""
    with pytest.raises(ContentStaleError):
        assert_content_fresh(_newest([]), NEWS_NOVELTY_MAX_AGE_DAYS, label="news_swfl")


def test_db_unavailable_fails_open_with_warning(caplog):
    batch = [_row("https://x.test/a")]
    with patch(
        "ingest.pipelines.news_swfl.novelty.fetch_stored_first_seen",
        side_effect=RuntimeError("no DB"),
    ):
        out = carry_first_seen(batch)
    assert out[0]["published_date"] == date.today().isoformat()
    assert any("BASELINE_UNAVAILABLE" in r.message for r in caplog.records)
    assert_content_fresh(_newest(out), NEWS_NOVELTY_MAX_AGE_DAYS, label="news_swfl")
