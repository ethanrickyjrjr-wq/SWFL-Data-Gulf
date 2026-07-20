from ingest.pipelines.community_profiles.pipeline import build_rows


def _fake_fetch(url: str) -> str:
    """Injected fetch stub — no network. Returns canned markdown per URL so
    build_rows' orchestration logic is tested without crawl4ai."""
    if "naplesgolfguy.com/golf-communities/fiddlers-creek" in url:
        return (
            "Membership Type:\n## Equity\n"
            "Number of Courses   | 1 (18 Holes)\n"
            "###  Amenities\n  * Clubhouse\n  * Resort-Style Pool\n"
        )
    if "55places.com/florida/communities/fiddlers-creek" in url:
        return ""  # simulate: not listed on 55places
    return ""


def test_build_rows_skips_a_source_with_no_page_without_raising():
    seed = [{"name": "Fiddler's Creek", "county": "Collier", "verified": True}]
    rows = build_rows(seed, hoa_table=[], fetch=_fake_fetch)
    assert len(rows) == 1
    row = rows[0]
    assert row["community_slug"] == "fiddlers-creek"
    assert row["golf_structure"] == "equity"
    assert row["clubhouse"] is True
    assert row["home_count"] is None  # 55places had nothing — never invented


def test_build_rows_applies_hoa_comparison_by_normalized_name():
    seed = [{"name": "Heritage Bay Golf & Country Club", "county": "Collier", "verified": False}]
    hoa_table = [
        {
            "name": "Heritage Bay",
            "hoa_fee_range": "$350–$550/mo",
            "cdd_flag": True,
            "golf_structure": "bundled",
            "is_estimate": False,
        }
    ]
    rows = build_rows(seed, hoa_table=hoa_table, fetch=lambda url: "")
    assert rows[0]["hoa_fee_range"] == "$350–$550/mo"
