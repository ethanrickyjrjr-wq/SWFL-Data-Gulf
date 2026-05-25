from datetime import datetime, timezone

import dlt


def _window_years(_now_year: int | None = None) -> tuple[str, str]:
    """
    Returns (start_year, end_year) for a rolling ~24-month window.

    A 24-month window spans at most 3 calendar years. The BLS v2 API
    accepts up to a 20-year range per request, so a single (start, end)
    pair covers the full window without batching.

    _now_year: injection point for unit tests.
    """
    now = datetime.now(timezone.utc)
    end_year = _now_year if _now_year is not None else now.year
    start_year = end_year - 2
    return str(start_year), str(end_year)


def run() -> None:
    from .resources import bls_laus_resource

    start_year, end_year = _window_years()
    print(
        f"Ingesting BLS LAUS: {start_year}–{end_year} "
        f"for FL state + Lee County + Collier County..."
    )

    pipeline = dlt.pipeline(
        pipeline_name="bls_laus",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(bls_laus_resource(start_year, end_year))
    load_info.raise_on_failed_jobs()
    print("BLS LAUS pipeline complete.")


if __name__ == "__main__":
    run()
