from ingest.lib.community_aliases import (
    build_pattern_index,
    community_for_subdivision,
    load_community_aliases,
)


def test_load_reads_the_shared_fixture():
    aliases = load_community_aliases()
    assert aliases["heritage-bay"]["label"] == "Heritage Bay"
    assert "HERITAGE BAY" in aliases["heritage-bay"]["patterns"]


def test_community_for_subdivision_resolves_known_pattern():
    idx = build_pattern_index(load_community_aliases())
    assert community_for_subdivision("HERITAGE BAY", idx) == "heritage-bay"


def test_community_for_subdivision_returns_none_for_unknown():
    idx = build_pattern_index(load_community_aliases())
    assert community_for_subdivision("SOME UNKNOWN NAME", idx) is None
