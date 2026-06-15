import pytest
import duckdb

from ingest.duckdb_pipelines.storm_history_swfl.pipeline import parse_damage_string
from ingest.duckdb_pipelines.storm_history_swfl.constants import swfl_filter_sql


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


def _rows(csv_text: str):
    con = duckdb.connect()
    con.execute("CREATE TABLE raw (state VARCHAR, cz_type VARCHAR, cz_name VARCHAR, event_type VARCHAR)")
    for line in csv_text.strip().splitlines():
        st, ct, cn, et = line.strip().split("|")
        con.execute("INSERT INTO raw VALUES (?,?,?,?)", [st, ct, cn, et])
    return con.execute(f"SELECT cz_name, event_type FROM raw WHERE {swfl_filter_sql()}").fetchall()


def test_filter_keeps_county_rows_and_hazard_zone_rows_drops_climatology():
    rows = _rows(
        """
        FLORIDA|C|LEE|Tornado
        FLORIDA|C|COLLIER|Flood
        FLORIDA|Z|COASTAL LEE|Hurricane (Typhoon)
        FLORIDA|Z|INLAND COLLIER COUNTY|Tropical Storm
        FLORIDA|Z|COASTAL CHARLOTTE|Drought
        FLORIDA|Z|INLAND LEE|Frost/Freeze
        FLORIDA|Z|COASTAL MANATEE|Hurricane (Typhoon)
        GEORGIA|C|LEE|Tornado
        """
    )
    kept = {(cz, et) for cz, et in rows}
    assert ("LEE", "Tornado") in kept                       # county row kept
    assert ("COASTAL LEE", "Hurricane (Typhoon)") in kept   # the bug fix: Ian zone row kept
    assert ("INLAND COLLIER COUNTY", "Tropical Storm") in kept
    assert ("COASTAL CHARLOTTE", "Drought") not in kept     # climatology excluded
    assert ("INLAND LEE", "Frost/Freeze") not in kept
    assert ("COASTAL MANATEE", "Hurricane (Typhoon)") not in kept  # out-of-footprint county
