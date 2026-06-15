"""Regenerate refinery/__fixtures__/storm-history-swfl.sample.parquet from NOAA.

A 2022-2024 SWFL slice using the production filter, so the fixture actually
contains Hurricane Ian's zone rows + narratives + the $7B Coastal Lee damage.
Run: python -m ingest.duckdb_pipelines.storm_history_swfl.make_fixture
"""
import re
import duckdb
import requests
from pathlib import Path

from ingest.duckdb_pipelines.storm_history_swfl.constants import (
    NOAA_BASE_URL, swfl_filter_sql,
)

OUT = (Path(__file__).parents[3] / "refinery" / "__fixtures__"
       / "storm-history-swfl.sample.parquet")
YEARS = (2022, 2023, 2024)


def _urls() -> list[str]:
    resp = requests.get(NOAA_BASE_URL, timeout=60)
    resp.raise_for_status()
    rx = re.compile(r"StormEvents_details-ftp_v1\.0_d(\d{4})_c(\d+)\.csv\.gz")
    best: dict[int, tuple[int, str]] = {}
    for m in rx.finditer(resp.text):
        y, c, name = int(m.group(1)), int(m.group(2)), m.group(0)
        if y in YEARS and (y not in best or c > best[y][0]):
            best[y] = (c, name)
    return [f"{NOAA_BASE_URL}{n}" for _, n in best.values()]


def run() -> None:
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    urls = ", ".join(f"'{u}'" for u in _urls())
    con.execute(f"""
        COPY (
            SELECT * FROM read_csv_auto([{urls}], union_by_name=true,
                                        ignore_errors=true, null_padding=true)
            WHERE {swfl_filter_sql()}
        ) TO '{OUT.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD);
    """)
    n = con.execute(f"SELECT count(*) FROM read_parquet('{OUT.as_posix()}')").fetchone()[0]
    ian = con.execute(
        f"SELECT count(*) FROM read_parquet('{OUT.as_posix()}') "
        "WHERE event_type='Hurricane (Typhoon)'"
    ).fetchone()[0]
    print(f"fixture rows: {n} | Ian hurricane rows: {ian}")
    assert ian >= 6, "fixture must contain Hurricane Ian zone rows"


if __name__ == "__main__":
    run()
