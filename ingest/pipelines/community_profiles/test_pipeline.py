import json

from ingest.pipelines.community_profiles.pipeline import (
    build_full_discovery_urls,
    build_rows,
    maybe_register_alias,
    run_full_discovery,
)


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


def test_build_rows_uses_discovered_slug_when_naive_guess_is_wrong():
    # naplesgolfguy's real URL for "Grey Oaks" is grey-oaks-country-club, not
    # the naive slugify("Grey Oaks") == "grey-oaks" — discover.py's map must
    # win, and the wrong naive guess must never even be fetched.
    seed = [{"name": "Grey Oaks", "county": "Collier", "verified": True}]
    ngg_map = {"GREY OAKS": "grey-oaks-country-club"}
    fetched_urls = []

    def fake_fetch(url: str) -> str:
        fetched_urls.append(url)
        if "grey-oaks-country-club" in url:
            return "Membership Type:\n## Optional\n"
        return ""

    rows = build_rows(seed, hoa_table=[], fetch=fake_fetch, ngg_map=ngg_map, fp_map={})
    row = rows[0]
    assert row["community_slug"] == "grey-oaks"  # our own identity key is unaffected
    assert row["golf_structure"] == "optional"
    assert row["golf_source_url"] == "https://naplesgolfguy.com/golf-communities/grey-oaks-country-club/"
    assert any("grey-oaks-country-club" in u for u in fetched_urls)
    assert not any(u.endswith("/golf-communities/grey-oaks/") for u in fetched_urls)


def test_build_rows_falls_back_to_naive_slug_when_not_in_discovery_map():
    seed = [{"name": "Some New Place", "county": "Lee", "verified": False}]
    rows = build_rows(seed, hoa_table=[], fetch=lambda url: "", ngg_map={}, fp_map={})
    assert rows[0]["community_slug"] == "some-new-place"


def test_maybe_register_alias_adds_new_entry():
    aliases = {"heritage-bay": {"label": "Heritage Bay", "patterns": ["HERITAGE BAY"]}}
    updated = maybe_register_alias("fiddlers-creek", "Fiddler's Creek", aliases)
    assert updated["fiddlers-creek"] == {"label": "Fiddler's Creek", "patterns": ["FIDDLERS CREEK"]}
    assert updated["heritage-bay"] == aliases["heritage-bay"]  # untouched


def test_maybe_register_alias_is_a_noop_for_existing_slug():
    aliases = {"heritage-bay": {"label": "Heritage Bay", "patterns": ["HERITAGE BAY"]}}
    updated = maybe_register_alias("heritage-bay", "Heritage Bay Golf & Country Club", aliases)
    assert updated["heritage-bay"]["label"] == "Heritage Bay"  # original label wins, not overwritten


def test_build_full_discovery_urls_skips_entries_with_no_slug_for_that_source():
    master_list = [
        {"slug": "fiddlers-creek", "label": "Fiddler's Creek", "county": "Collier",
         "naplesgolfguy_slug": "fiddlers-creek", "fiftyfive_places_slug": None},
        {"slug": "heritage-bay", "label": "Heritage Bay", "county": "Collier",
         "naplesgolfguy_slug": "heritage-bay", "fiftyfive_places_slug": "heritage-bay"},
    ]
    ngg_urls = build_full_discovery_urls(master_list, source="naplesgolfguy")
    assert ngg_urls == {
        "fiddlers-creek": "https://naplesgolfguy.com/golf-communities/fiddlers-creek/",
        "heritage-bay": "https://naplesgolfguy.com/golf-communities/heritage-bay/",
    }
    fp_urls = build_full_discovery_urls(master_list, source="55places")
    assert fp_urls == {
        "heritage-bay": "https://www.55places.com/florida/communities/heritage-bay",
    }  # fiddlers-creek skipped: no fiftyfive_places_slug -- a real coverage ceiling, not invented


def test_run_full_discovery_missing_master_list_is_a_noop_not_a_crash(tmp_path):
    missing = tmp_path / "does_not_exist.json"
    out = tmp_path / "out.json"
    assert run_full_discovery(source="naplesgolfguy", master_list_path=missing, out_path=out) == 0
    assert not out.exists()


def test_run_full_discovery_writes_partials_via_paced_fetch(tmp_path, monkeypatch):
    from ingest.pipelines.community_profiles import raw_cache

    master_list_path = tmp_path / "master.json"
    master_list_path.write_text(
        json.dumps(
            [
                {
                    "slug": "fiddlers-creek",
                    "label": "Fiddler's Creek",
                    "county": "Collier",
                    "naplesgolfguy_slug": "fiddlers-creek",
                    "fiftyfive_places_slug": None,
                }
            ]
        ),
        encoding="utf-8",
    )
    out_path = tmp_path / "out.json"

    captured_urls: list[str] = []

    def fake_fetch_all_paced(urls, *, source, **kwargs):
        captured_urls.extend(urls)
        return {u: "Membership Type:\n## Equity\n" for u in urls}

    monkeypatch.setattr(raw_cache, "fetch_all_paced", fake_fetch_all_paced)

    rc = run_full_discovery(source="naplesgolfguy", master_list_path=master_list_path, out_path=out_path)
    assert rc == 0
    assert captured_urls == ["https://naplesgolfguy.com/golf-communities/fiddlers-creek/"]
    partials = json.loads(out_path.read_text(encoding="utf-8"))
    assert partials["fiddlers-creek"]["golf_structure"] == "equity"
