from ingest.pipelines.city_pulse.pipeline import CITIES, slug


def test_seven_cities_including_lehigh():
    assert CITIES == [
        "Lehigh Acres", "Cape Coral", "Fort Myers", "Naples",
        "Estero", "Bonita Springs", "Fort Myers Beach",
    ]


def test_slug_is_filesystem_safe():
    assert slug("Fort Myers Beach") == "fort-myers-beach"
    assert slug("Lehigh Acres") == "lehigh-acres"


from ingest.pipelines.city_pulse.pipeline import _extract_citations, build_record


def test_extract_citations_dedupes_by_url_and_text():
    content = [
        {"citations": [
            {"url": "https://gulfshorebusiness.com/a", "title": "A", "cited_text": "Amazon bought 60M of land", "type": "web_search_result_location"},
            {"url": "https://gulfshorebusiness.com/a", "title": "A", "cited_text": "Amazon bought 60M of land", "type": "web_search_result_location"},
        ]},
        {"citations": None},
    ]
    out = _extract_citations(content)
    assert len(out) == 1
    assert out[0]["url"] == "https://gulfshorebusiness.com/a"


def test_build_record_shape():
    dump = {"content": [{"citations": [{"url": "https://x.com", "title": "T", "cited_text": "c"}]}],
            "usage": {"input_tokens": 10, "output_tokens": 5}, "stop_reason": "end_turn"}
    rec = build_record("Naples", "q", dump, "2026-05-30T00:00:00Z")
    assert rec["city"] == "Naples"
    assert rec["city_slug"] == "naples"
    assert rec["tool_version"] == "web_search_20250305"
    assert rec["cited_text_count"] == 1
    assert rec["response"] == dump
