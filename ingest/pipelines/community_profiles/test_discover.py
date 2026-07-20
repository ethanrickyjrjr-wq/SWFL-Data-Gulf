from pathlib import Path

from ingest.pipelines.community_profiles.discover import (
    build_discovery_maps,
    parse_55places_directory,
    parse_naplesgolfguy_directory,
)

FIXTURES = Path(__file__).parent / "fixtures"
NGG_FIXTURE = FIXTURES / "naplesgolfguy_naples_directory.md"
FP_FIXTURE = FIXTURES / "fiftyfive_places_naples_bonita_directory.md"


def test_parse_naplesgolfguy_directory_keys_by_slug_derived_normalized_name():
    md = NGG_FIXTURE.read_text(encoding="utf-8")
    found = parse_naplesgolfguy_directory(md)
    # "grey-oaks-country-club" -> normalize_community_name strips the
    # COUNTRY CLUB suffix -> "GREY OAKS", matching a seed name of "Grey Oaks".
    assert found["GREY OAKS"] == "grey-oaks-country-club"
    assert found["BAY COLONY"] == "bay-colony-golf-club"
    assert found["HERITAGE BAY"] == "heritage-bay"


def test_parse_55places_directory_keys_by_slug_not_truncated_link_text():
    md = FP_FIXTURE.read_text(encoding="utf-8")
    found = parse_55places_directory(md)
    # Link text on the live page is "Gulf Harbour Yacht & ..." (truncated) —
    # the slug-derived key must still resolve correctly since the URL is whole.
    assert found["GULF HARBOUR YACHT"] == "gulf-harbour-yacht-country-club"
    assert found["FIDDLERS CREEK"] == "fiddlers-creek"
    assert found["LELY RESORT"] == "lely-resort"


def test_parse_directory_returns_empty_map_for_no_links():
    assert parse_naplesgolfguy_directory("# nothing here") == {}
    assert parse_55places_directory("# nothing here") == {}


def test_build_discovery_maps_fetches_every_directory_url():
    fetched_urls = []

    def fake_fetch(url: str) -> str:
        fetched_urls.append(url)
        if "naplesgolfguy" in url:
            return NGG_FIXTURE.read_text(encoding="utf-8")
        return FP_FIXTURE.read_text(encoding="utf-8")

    ngg_map, fp_map = build_discovery_maps(fake_fetch)
    assert ngg_map["GREY OAKS"] == "grey-oaks-country-club"
    assert fp_map["LELY RESORT"] == "lely-resort"
    # 3 naplesgolfguy regional pages + 2 55places area pages, per the design spec's Stage 1.
    assert len(fetched_urls) == 5


def test_build_discovery_maps_skips_empty_fetch_without_raising():
    ngg_map, fp_map = build_discovery_maps(lambda url: "")
    assert ngg_map == {}
    assert fp_map == {}
