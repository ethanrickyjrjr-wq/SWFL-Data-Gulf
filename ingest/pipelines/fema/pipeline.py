import dlt
from .constants import NFHL_LAYERS
from .resources import ingest_nfhl_layer, ingest_nfip_claims


def run():
    inv = dlt.pipeline(pipeline_name="tier1_inventory", destination="postgres", dataset_name="data_lake")
    for layer in NFHL_LAYERS:
        print(f"Ingesting NFHL layer: {layer['name']}")
        ingest_nfhl_layer(inv, layer)
    print("Ingesting NFIP Claims...")
    ingest_nfip_claims(inv)
    print("FEMA pipeline complete.")


if __name__ == "__main__":
    run()
