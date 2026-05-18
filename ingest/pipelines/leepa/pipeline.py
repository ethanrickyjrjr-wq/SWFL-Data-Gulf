import dlt
from .resources import ingest_leepa_parcels, ingest_leepa_parcels_value


def run():
    inv = dlt.pipeline(pipeline_name="tier1_inventory", destination="postgres", dataset_name="data_lake")
    print("Ingesting LeePA parcels (layer 0 geometry → Tier 1)...")
    ingest_leepa_parcels(inv)
    print("Ingesting LeePA value/use/sale layers (9/12/10 → Tier 1 + Tier 2 leepa_parcels)...")
    ingest_leepa_parcels_value(inv)
    print("LeePA pipeline complete.")


if __name__ == "__main__":
    run()
