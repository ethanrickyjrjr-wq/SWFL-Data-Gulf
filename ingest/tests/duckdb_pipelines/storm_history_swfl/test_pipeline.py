import pytest

from ingest.duckdb_pipelines.storm_history_swfl.pipeline import parse_damage_string


@pytest.mark.parametrize("raw,expected", [
    ("0", 0.0),
    ("500", 500.0),
    ("10K", 10_000.0),
    ("1.5M", 1_500_000.0),
    ("2B", 2_000_000_000.0),
    ("112B", 112_000_000_000.0),   # Hurricane Ian, 2022
    ("", None),
    (None, None),
    ("???", None),                  # unparseable -> None, NOT an exception
    ("1.5M ", 1_500_000.0),         # trailing whitespace tolerated
])
def test_parse_damage_string(raw, expected):
    assert parse_damage_string(raw) == expected
