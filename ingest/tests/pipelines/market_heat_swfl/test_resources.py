from ingest.pipelines.market_heat_swfl.constants import CORE_COLUMNS
from ingest.pipelines.market_heat_swfl.resources import (
    filter_csv_to_swfl,
    in_scope_zips,
)

# Minimal realtor-shaped CSV: an in-scope SWFL ZIP, an out-of-scope CA ZIP,
# and a second SWFL ZIP carrying a literal "NA".
CSV = (
    "month_date_yyyymm,postal_code,zip_name,active_listing_count,active_listing_count_yy,pending_ratio\n"
    '202605,33901,"fort myers, fl",300,-0.15,0.25\n'
    '202605,90210,"beverly hills, ca",100,0.05,0.30\n'
    '202605,34102,"naples, fl",200,0.30,NA\n'
)


class TestFilterCsvToSwfl:
    def test_keeps_only_swfl_zips(self):
        rows = filter_csv_to_swfl(CSV, CORE_COLUMNS, {"33901", "34102"})
        assert {r["postal_code"] for r in rows} == {"33901", "34102"}  # 90210 dropped

    def test_na_and_blank_become_none(self):
        rows = filter_csv_to_swfl(CSV, CORE_COLUMNS, {"33901", "34102"})
        r34102 = next(r for r in rows if r["postal_code"] == "34102")
        assert r34102["pending_ratio"] is None  # literal "NA" → None

    def test_projects_all_requested_columns(self):
        rows = filter_csv_to_swfl(CSV, CORE_COLUMNS, {"33901"})
        r = rows[0]
        # Every requested column is present even when absent from the CSV (→ None).
        for col in CORE_COLUMNS:
            assert col in r
        assert r["median_days_on_market"] is None
        assert r["active_listing_count"] == "300"  # value kept verbatim; DuckDB coerces

    def test_empty_zip_set_keeps_nothing(self):
        assert filter_csv_to_swfl(CSV, CORE_COLUMNS, set()) == []


class TestInScopeZips:
    def test_reads_real_fixture(self):
        zips = in_scope_zips()
        assert "33901" in zips
        assert "90210" not in zips
        assert len(zips) > 50  # ~120 SWFL ZCTAs
