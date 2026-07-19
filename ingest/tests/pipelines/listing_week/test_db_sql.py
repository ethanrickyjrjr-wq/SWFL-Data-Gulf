"""Pure tests over the SQL strings + row->params packing. No live DB."""
from datetime import date

from ingest.pipelines.listing_week.db import LABEL_SQL, MERGE_SQL, STATE_SQL, _merge_params

ROW = {"address_key": "123 MAIN ST:33904", "sale_or_rent": "sale",
       "week_start": date(2026, 6, 29), "listing_id": "L1", "zip_code": "33904",
       "county": "Lee", "property_type": "single_family", "beds": 3, "baths": 2.0,
       "sqft": 1500, "lot_acres": 0.25, "listed_date": date(2026, 6, 30),
       "dom_days": 5, "state_at_week_end": "active", "list_price": 420_000,
       "cuts_to_date": 0, "cut_depth_pct_to_date": 0.0, "weeks_since_last_cut": None,
       "relists_to_date": 0, "flag_foreclosure": False,
       "flag_new_construction": False, "sold_next_week": None,
       "holding_next_week": None, "price_cut_next_week": None}

def test_merge_is_upsert_not_replace():
    s = MERGE_SQL.lower()
    assert "insert into data_lake.listing_week" in s
    assert "on conflict (address_key, sale_or_rent, week_start) do update" in s
    assert "delete" not in s and "truncate" not in s

def test_merge_never_overwrites_labels():
    # A feature re-merge must not null out labels a later run already filled.
    assert "sold_next_week" not in MERGE_SQL.lower().split("do update")[1]

def test_label_sql_updates_only_labels():
    s = LABEL_SQL.lower()
    assert s.strip().startswith("update data_lake.listing_week")
    assert "list_price" not in s

def test_state_load_dedupes_deterministically():
    # 274 addresses live under two source rows — freshest must win, not scan order.
    s = STATE_SQL.lower()
    assert "distinct on (address_key, sale_or_rent)" in s
    assert "order by address_key, sale_or_rent, scraped_at desc" in s

def test_merge_params_order_matches_placeholders():
    params = _merge_params(ROW)
    assert params[0] == "123 MAIN ST:33904"
    assert len(params) == MERGE_SQL.count("%s")
