from ingest.pipelines.community_profiles.normalize import slugify, normalize_community_name


def test_slugify_strips_apostrophe_and_lowercases():
    assert slugify("Fiddler's Creek") == "fiddlers-creek"


def test_slugify_collapses_whitespace_and_ampersand():
    assert slugify("Heritage Palms Golf & Country Club") == "heritage-palms-golf-country-club"


def test_normalize_strips_country_club_suffix():
    assert normalize_community_name("Heritage Bay Golf & Country Club") == "HERITAGE BAY"
    assert normalize_community_name("Heritage Bay") == "HERITAGE BAY"


def test_normalize_strips_cc_and_inc_suffixes():
    assert normalize_community_name("Grey Oaks Country Club") == "GREY OAKS"
    assert normalize_community_name("BAY COLONY COMMUNITY ASSOCIATION, INC.") == "BAY COLONY"


def test_normalize_strips_golf_country_club_with_no_connector():
    # A real naplesgolfguy slug word-split ("forest-glen-golf-country-club" ->
    # "forest glen golf country club") has no "&"/"and" between GOLF and
    # COUNTRY — found live 07/20/2026 when this collapsed to "FOREST GLEN
    # GOLF" instead of "FOREST GLEN", breaking the seed-name match.
    assert normalize_community_name("Forest Glen Golf Country Club") == "FOREST GLEN"
    assert normalize_community_name("Royal Wood Golf Country Club") == "ROYAL WOOD"
