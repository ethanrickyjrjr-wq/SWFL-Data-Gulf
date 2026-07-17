"""Retarget tests — redfin_data_center/housing_market/monthly/all_zips.csv.

Locks the 07/16/2026 retarget off the frozen legacy dump (see
docs/superpowers/specs/2026-07-17-redfin-datacenter-retarget-design.md):
  - _load_and_filter maps the new quoted headers to snake_case columns
    AS-WRITTEN (percent stays percent — unit conversion happens once, in
    refinery/sources/housing-source.mts), filters to SWFL metros via the
    METRO column (the new feed has NO STATE_CODE), and TRY_CASTs numerics
    so Redfin's literal "NA" lands as SQL NULL.
  - _assert_volume / _assert_content_fresh_from wire the Gate-4 guards so a
    frozen source turns the cron RED instead of green (the 06/02–07/15
    silent-freeze postmortem).
  - _source_unchanged_note flags a byte-identical re-download LOUDLY.
"""
from datetime import date
from pathlib import Path

import duckdb
import pytest

import ingest.duckdb_pipelines.redfin_swfl.pipeline as mod
from ingest.lib.guards import ContentStaleError, VolumeGuardError

# The real header row of housing_market/monthly/all_zips.csv, read live 07/16/2026.
HEADER = (
    '"LAST UPDATED","FREQUENCY","PERIOD BEGIN","PERIOD END","REGION ID","REGION TYPE",'
    '"REGION NAME","METRO","HOMES SOLD","HOMES SOLD MOM (%)","HOMES SOLD YOY (%)",'
    '"MEDIAN SALE PRICE NSA ($)","MEDIAN SALE PRICE NSA MOM (%)","MEDIAN SALE PRICE NSA YOY (%)",'
    '"MEDIAN DAYS ON MARKET (DAYS)","MEDIAN DAYS ON MARKET MOM (%)","MEDIAN DAYS ON MARKET YOY (%)",'
    '"AVERAGE SALE TO LIST RATIO (%)","AVERAGE SALE TO LIST RATIO MOM (PPTS)","AVERAGE SALE TO LIST RATIO YOY (PPTS)",'
    '"SHARE SOLD ABOVE ORIGINAL LIST (%)","SHARE SOLD ABOVE ORIGINAL LIST MOM (PPTS)","SHARE SOLD ABOVE ORIGINAL LIST YOY (PPTS)",'
    '"NEW LISTINGS","NEW LISTINGS MOM (%)","NEW LISTINGS YOY (%)",'
    '"ACTIVE LISTINGS","ACTIVE LISTINGS MOM (%)","ACTIVE LISTINGS YOY (%)",'
    '"INVENTORY","INVENTORY MOM (%)","INVENTORY YOY (%)",'
    '"PENDING SALES","PENDING SALES MOM (%)","PENDING SALES YOY (%)",'
    '"MEDIAN NEW LISTING PRICE ($)","MEDIAN NEW LISTING PRICE MOM (%)","MEDIAN NEW LISTING PRICE YOY (%)",'
    '"MEDIAN NEW LISTING PRICE PER SQ.FT. ($)","MEDIAN NEW LISTING PRICE PER SQ.FT. MOM (%)","MEDIAN NEW LISTING PRICE PER SQ.FT. YOY (%)",'
    '"MEDIAN SALE PRICE PER SQ.FT. ($)","MEDIAN SALE PRICE PER SQ.FT. MOM (%)","MEDIAN SALE PRICE PER SQ.FT. YOY (%)",'
    '"MONTHS OF SUPPLY","MONTHS OF SUPPLY MOM (%)","MONTHS OF SUPPLY YOY (%)",'
    '"PERCENT OFF MARKET IN TWO WEEKS (%)","PERCENT OFF MARKET IN TWO WEEKS MOM (PPTS)","PERCENT OFF MARKET IN TWO WEEKS YOY (PPTS)"'
)


def _row(
    *,
    period_begin: str,
    period_end: str,
    zip_code: str,
    metro: str,
    homes_sold: str = "120",
    homes_sold_mom: str = "NA",
    median_sale_price: str = "365000",
    median_dom: str = "69",
    dom_yoy_pct: str = "-13.75",
    sale_to_list_pct: str = "96.12",
) -> str:
    """One CSV data row in the live file's mixed quoted/unquoted style."""
    return ",".join(
        [
            '"2026-07-03"',
            '"Rolling 3 Months"',
            f'"{period_begin}"',
            f'"{period_end}"',
            "15980",
            '"Zip"',
            f'"{zip_code}"',
            f'"{metro}"',
            homes_sold,
            homes_sold_mom,  # NA in the newest windows of the live file
            "-13.75",
            median_sale_price,
            "NA",
            "3.98",
            median_dom,
            "NA",
            dom_yoy_pct,
            sale_to_list_pct,
            "NA",
            "-0.4",
            "5.47",
            "NA",
            "0.17",
            "159",
            "NA",
            "4.99",
            "245",
            "NA",
            "1.37",
            "106",
            "NA",
            "-7.45",
            "118",
            "NA",
            "2.81",
            "378700",
            "NA",
            "11.64",
            "221.16",
            "NA",
            "1.97",
            "215.56",
            "NA",
            "4.34",
            "5",
            "NA",
            "27.4",
            "14.57",
            "NA",
            "3.09",
        ]
    )


@pytest.fixture()
def swfl_csv(tmp_path: Path) -> Path:
    """Fixture CSV: two SWFL windows for 33904, one Naples ZIP, one non-SWFL ZIP."""
    rows = [
        HEADER,
        _row(
            period_begin="2026-04-01",
            period_end="2026-06-30",
            zip_code="33904",
            metro="Cape Coral, FL metro area",
        ),
        _row(
            period_begin="2026-03-01",
            period_end="2026-05-31",
            zip_code="33904",
            metro="Cape Coral, FL metro area",
            median_sale_price="360000",
            homes_sold_mom="1.5",
        ),
        _row(
            period_begin="2026-04-01",
            period_end="2026-06-30",
            zip_code="34102",
            metro="Naples, FL metro area",
            median_sale_price="1800000",
        ),
        _row(
            period_begin="2026-04-01",
            period_end="2026-06-30",
            zip_code="07002",
            metro="New York, NY metro area",
        ),
    ]
    p = tmp_path / "housing_market_all_zips.csv"
    p.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return p


def _load(swfl_csv: Path) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    mod._load_and_filter(con, str(swfl_csv), "2026-07-16T00:00:00+00:00")
    return con


def test_metro_filter_uses_new_columns():
    """The new feed has no STATE_CODE — filter rides REGION TYPE + METRO."""
    f = mod._build_metro_filter()
    assert "\"REGION TYPE\" = 'Zip'" in f
    assert "\"METRO\" LIKE '%Cape Coral%'" in f
    assert "STATE_CODE" not in f


def test_load_and_filter_keeps_swfl_only(swfl_csv: Path):
    con = _load(swfl_csv)
    n = con.execute("SELECT COUNT(*) FROM redfin_swfl").fetchone()[0]
    zips = {
        r[0] for r in con.execute("SELECT DISTINCT zip_code FROM redfin_swfl").fetchall()
    }
    assert n == 3  # two 33904 windows + 34102; 07002 filtered out
    assert zips == {"33904", "34102"}


def test_load_maps_values_as_written_and_na_to_null(swfl_csv: Path):
    """Percent columns stay percent (96.12, not 0.9612); 'NA' lands as SQL NULL."""
    con = _load(swfl_csv)
    row = con.execute(
        """
        SELECT median_sale_price, avg_sale_to_list_pct, median_dom_yoy_pct,
               homes_sold_mom_pct, metro, period_begin
        FROM redfin_swfl
        WHERE zip_code = '33904' AND period_begin = '2026-04-01'
        """
    ).fetchone()
    assert row[0] == 365000
    assert row[1] == pytest.approx(96.12)
    assert row[2] == pytest.approx(-13.75)
    assert row[3] is None  # literal "NA" → NULL, not a string
    assert "Cape Coral" in row[4]
    assert row[5] == "2026-04-01"


def test_volume_floor_trips_below_minimum():
    with pytest.raises(VolumeGuardError):
        mod._assert_volume(mod.MIN_ROWS - 1)
    mod._assert_volume(mod.MIN_ROWS)  # must not raise


def test_content_freshness_gate(swfl_csv: Path):
    """Newest period_end 2026-06-30: fine on 07/16, RED after a frozen cycle."""
    con = _load(swfl_csv)
    mod._assert_content_fresh_from(con, today=date(2026, 7, 16))  # 16d — passes
    with pytest.raises(ContentStaleError):
        mod._assert_content_fresh_from(con, today=date(2026, 9, 15))  # 77d — trips


def test_source_unchanged_note():
    prior = {"source_etag": '"abc123"', "source_last_modified": "Tue, 02 Jun 2026 18:19:04 GMT"}
    note = mod._source_unchanged_note(prior, '"abc123"', "Tue, 02 Jun 2026 18:19:04 GMT")
    assert note is not None and "SOURCE UNCHANGED" in note
    assert mod._source_unchanged_note(prior, '"def456"', "Tue, 14 Jul 2026 16:54:48 GMT") is None
    assert mod._source_unchanged_note(None, '"abc123"', "x") is None
    assert mod._source_unchanged_note({}, '"abc123"', "x") is None
