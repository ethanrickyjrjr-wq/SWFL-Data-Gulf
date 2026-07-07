from ingest.pipelines.city_pulse.pipeline import CITIES, slug


def test_cities_list():
    assert "Lehigh Acres" in CITIES
    assert "Fort Myers Beach" in CITIES
    assert len(CITIES) >= 7


def test_slug_is_filesystem_safe():
    assert slug("Fort Myers Beach") == "fort-myers-beach"
    assert slug("Lehigh Acres") == "lehigh-acres"


from ingest.pipelines.city_pulse.pipeline import build_city_capture


def test_build_city_capture_from_lake_articles():
    articles = [
        {"article_url": "https://n/1", "headline": "Naples land deal",
         "body_text": "Company bought 20 acres in Naples for $5M.",
         "source_name": "gulfshorebusiness", "published_date": "2026-07-06"},
        {"article_url": "https://n/2", "headline": "Estero news",
         "body_text": "Nothing about the target city.", "source_name": "s", "published_date": "2026-07-06"},
    ]
    cap = build_city_capture("Naples", "2026-07-07T00:00:00Z", articles)
    assert cap["city"] == "Naples"
    assert cap["source"] == "news_lake"
    assert [c["url"] for c in cap["citations"]] == ["https://n/1"]
    assert set(["city", "run_at", "citations"]).issubset(cap)


from ingest.pipelines.city_pulse.pipeline import to_ndjson, tier1_path


def test_to_ndjson_round_trips():
    import json
    body = to_ndjson([{"city": "Naples", "a": 1}])
    assert json.loads(body.decode("utf-8").strip()) == {"city": "Naples", "a": 1}


def test_tier1_path_is_date_partitioned_and_slugged():
    p = tier1_path("Fort Myers Beach", "20260530T091500Z", "2026", "05")
    assert p == "city_pulse/fort-myers-beach/year=2026/month=05/run-20260530T091500Z.ndjson"


