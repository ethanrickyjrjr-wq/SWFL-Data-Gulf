from ingest.lib.pulse_match import (
    normalize_road, article_matches_city,
    road_tokens_from_corridor, article_matches_corridor,
)


def test_normalize_road_expands_abbreviations():
    assert normalize_road("Immokalee Rd") == "immokalee road"
    assert normalize_road("Cleveland Ave.") == "cleveland avenue"
    assert normalize_road("Bonita Beach Blvd") == "bonita beach boulevard"


def test_city_match_is_permissive_and_case_insensitive():
    assert article_matches_city("Naples", "NAPLES sees new store", "")
    assert article_matches_city("Fort Myers", "downtown update", "A shop opened in fort myers today.")
    assert not article_matches_city("Sanibel", "Cape Coral bridge news", "Nothing about the island here.")


def test_corridor_road_tokens_and_match():
    assert road_tokens_from_corridor("Immokalee Rd North Naples") == ["immokalee road"]
    assert article_matches_corridor("Immokalee Rd North Naples", "Immokalee Road widening approved", "")
    assert article_matches_corridor("Cleveland Ave Fort Myers", "New lease on Cleveland Avenue", "")
    assert not article_matches_corridor("Immokalee Rd North Naples", "Daniels Parkway construction", "")
