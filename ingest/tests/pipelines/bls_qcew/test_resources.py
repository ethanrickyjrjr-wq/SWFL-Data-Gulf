from ingest.pipelines.bls_qcew.resources import _make_id


def test_make_id_stable():
    row = {
        "area_fips": "12071",
        "own_code": "5",
        "industry_code": "10",
        "size_code": "0",
        "year": "2024",
        "qtr": "3",
    }
    assert _make_id(row) == "12071|5|10|0|2024|3"


def test_make_id_different_areas_differ():
    base = {"area_fips": "12071", "own_code": "0", "industry_code": "10",
            "size_code": "0", "year": "2024", "qtr": "3"}
    other = {**base, "area_fips": "12021"}
    assert _make_id(base) != _make_id(other)


def test_make_id_different_qtrs_differ():
    base = {"area_fips": "12071", "own_code": "0", "industry_code": "10",
            "size_code": "0", "year": "2024", "qtr": "3"}
    other = {**base, "qtr": "4"}
    assert _make_id(base) != _make_id(other)
