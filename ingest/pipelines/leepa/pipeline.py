import dlt
from .resources import ingest_leepa_parcels


def run():
    inv = dlt.pipeline(pipeline_name="tier1_inventory", destination="postgres", dataset_name="data_lake")
    print("Ingesting LeePA parcels...")
    ingest_leepa_parcels(inv)
    print("LeePA pipeline complete.")


if __name__ == "__main__":
    run()
