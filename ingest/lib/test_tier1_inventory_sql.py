"""Lock the inventory upsert contract for the source-staleness tripwire.

The redfin retarget (07/16/2026) extends data_lake._tier1_inventory with
source_etag / source_last_modified / max_period_end so a pipeline can compare
the source object against the prior pull and flag a frozen feed LOUDLY.
"""
import ingest.lib.tier1_inventory as inv


def test_upsert_sql_carries_staleness_columns():
    for col in ("source_etag", "source_last_modified", "max_period_end"):
        assert col in inv._UPSERT_SQL, f"missing {col} in upsert SQL"


def test_get_inventory_meta_exists():
    assert callable(inv.get_inventory_meta)
