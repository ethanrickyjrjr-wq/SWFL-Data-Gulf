import dlt

from .resources import faf_flows, faf_zone_lookup, faf_sctg_lookup


def run() -> None:
    pipeline = dlt.pipeline(
        pipeline_name="faf5",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run([faf_flows(), faf_zone_lookup(), faf_sctg_lookup()])
    print(load_info)


if __name__ == "__main__":
    run()
