import dlt
from .resources import fhfa_hpi_resource


def run():
    pipeline = dlt.pipeline(
        pipeline_name="fhfa_hpi",
        destination="postgres",
        dataset_name="data_lake",
    )
    print("Ingesting FHFA HPI master (~133k records)...")
    load_info = pipeline.run(fhfa_hpi_resource())
    load_info.raise_on_failed_jobs()
    print("FHFA HPI pipeline complete.")


if __name__ == "__main__":
    run()
