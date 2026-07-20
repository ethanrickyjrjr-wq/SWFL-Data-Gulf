from pathlib import Path

from ingest.pipelines.community_profiles.distill_realtyofnaplesfl import parse_hoa_comparison_page

FIXTURE = Path(__file__).parent / "fixtures" / "realtyofnaplesfl_hoa_comparison.md"


def test_parses_both_county_tables():
    md = FIXTURE.read_text(encoding="utf-8")
    rows = parse_hoa_comparison_page(md)
    by_name = {r["name"]: r for r in rows}
    assert len(rows) == 5

    pelican = by_name["Pelican Bay"]
    assert pelican["hoa_fee_range"] == "$175–$220/mo"
    assert pelican["cdd_flag"] is False
    assert pelican["golf_structure"] == "none"
    assert pelican["is_estimate"] is False

    bay_colony = by_name["Bay Colony"]
    assert bay_colony["is_estimate"] is True  # source page itself flags "(est.)"

    heritage = by_name["Heritage Bay"]
    assert heritage["cdd_flag"] is True
    assert heritage["golf_structure"] == "bundled"

    verandah = by_name["Verandah"]
    assert verandah["golf_structure"] == "bundled"


def test_no_tables_returns_empty_list():
    assert parse_hoa_comparison_page("# No tables here") == []
