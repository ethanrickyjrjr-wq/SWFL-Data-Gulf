from ingest.lib.pulse_lake import build_capture

ARTICLES = [
    {"article_url": "https://x/1", "headline": "Naples store opens",
     "body_text": "A new shop on 5th Ave in Naples.", "source_name": "s", "published_date": "2026-07-06"},
    {"article_url": "https://x/2", "headline": "Cape Coral bridge",
     "body_text": "Unrelated to Naples.", "source_name": "s", "published_date": "2026-07-06"},
]


def test_build_capture_city_filters_and_shapes_citations():
    cap = build_capture("city", "Naples", "2026-07-07T00:00:00Z", ARTICLES)
    assert cap["city"] == "Naples"
    assert cap["run_at"] == "2026-07-07T00:00:00Z"
    assert cap["source"] == "news_lake"
    assert len(cap["citations"]) == 2
    assert cap["citations"][0] == {
        "url": "https://x/1", "title": "Naples store opens",
        "cited_text": "A new shop on 5th Ave in Naples.", "type": "news_lake",
    }


def test_build_capture_empty_when_no_match():
    cap = build_capture("city", "Sanibel", "2026-07-07T00:00:00Z", ARTICLES)
    assert cap["citations"] == []


def test_build_capture_corridor_uses_corridor_field():
    arts = [{"article_url": "https://x/3", "headline": "Immokalee Road widening",
             "body_text": "", "source_name": "s", "published_date": "2026-07-06"}]
    cap = build_capture("corridor", "Immokalee Rd North Naples", "2026-07-07T00:00:00Z", arts)
    assert cap["corridor"] == "Immokalee Rd North Naples"
    assert len(cap["citations"]) == 1


from ingest.lib.pulse_lake import _evict_sql, _evict_count_sql

def test_evict_sql_targets_news_pool_by_published_date():
    assert "delete from data_lake.news_articles_swfl" in _evict_sql().lower()
    assert "published_date <" in _evict_sql().lower()
    assert "count(*)" in _evict_count_sql().lower()


from ingest.lib.pulse_lake import known_urls_by_unit


def test_build_capture_excludes_already_distilled_urls():
    # https://x/1 already distilled for Naples -> skipped before the paid call;
    # a NEW Naples article still comes through (recall preserved).
    arts = ARTICLES + [
        {"article_url": "https://x/9", "headline": "Naples land deal",
         "body_text": "New in Naples.", "source_name": "s", "published_date": "2026-07-07"},
    ]
    cap = build_capture("city", "Naples", "2026-07-07T00:00:00Z", arts,
                        exclude_urls={"https://x/1"})
    urls = [c["url"] for c in cap["citations"]]
    assert "https://x/1" not in urls          # already-distilled -> skipped
    assert "https://x/9" in urls               # new -> kept


def test_known_urls_by_unit_rejects_unknown_table():
    import pytest
    with pytest.raises(ValueError):
        known_urls_by_unit("news_articles_swfl", "city")  # not an allowlisted pulse table
