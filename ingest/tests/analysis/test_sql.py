"""SQL-shape tests for the analysis DB seam. No database is touched — these
assert the generated SQL, which is exactly where the guarantees live.

Targets FM 12 (run-time egress), added to the spec 07/22/2026 after the build
probe: the spec's 11 failure modes all cover ANALYTICAL correctness and none
covered what the run itself pulls, while the project sits at 311% of its egress
quota under an active throttle.
"""
from __future__ import annotations

import re

import pytest

from ingest.analysis import _sql


COLS = ["jv", "av_sd", "land_sqft"]


# ---------------------------------------------------------------- FM 12
# The analysis must never pull rows. 847,056 x 59 numeric ~= 400 MB per run, on
# a psycopg path that db-max-rows does not bound.

@pytest.mark.parametrize("sql", [
    _sql.profile_sql("data_lake", "lee_parcels", COLS),
    _sql.corr_sql("data_lake", "lee_parcels", [("jv", "av_sd")]),
    _sql.numeric_columns_sql("data_lake", "lee_parcels"),
])
def test_no_query_selects_raw_rows(sql):
    assert "*" not in sql.split(" FROM ")[0].replace("count(*)", "")
    assert "SELECT *" not in sql


def test_profile_query_is_aggregate_only():
    """Every projected term is wrapped in an aggregate — nothing bare."""
    sql = _sql.profile_sql("data_lake", "lee_parcels", COLS)
    projection = sql.split("SELECT ")[1].split(" FROM ")[0]
    for term in projection.split(", "):
        assert term.startswith("count("), term


def test_correlation_query_is_aggregate_only():
    # NB: a corr() term contains ", " itself, so the projection is matched whole
    # rather than split on commas.
    sql = _sql.corr_sql("data_lake", "lee_parcels", [("jv", "av_sd"),
                                                     ("jv", "land_sqft")])
    projection = sql.split("SELECT ")[1].split(" FROM ")[0]
    term = r"corr\([a-z_][a-z0-9_]*, [a-z_][a-z0-9_]*\) AS c\d+"
    assert re.fullmatch(rf"{term}(, {term})*", projection), projection


def test_profile_query_counts_zeros_not_just_nulls():
    """FDOR zero-fills: a null-only profile reads every column as fully
    populated. Probed live 07/22/2026 — jv_hist_commercial is 100.00% zero with
    0 true NULLs."""
    sql = _sql.profile_sql("data_lake", "lee_parcels", ["jv"])
    assert "FILTER (WHERE jv = 0)" in sql
    assert "count(jv)" in sql
    assert "count(DISTINCT jv)" in sql


# ---------------------------------------------------------------- injection
# Identifiers cannot be parameterized, so they are validated instead.

@pytest.mark.parametrize("bad", [
    "jv; DROP TABLE data_lake.lee_parcels",
    "jv)) , (SELECT password FROM users",
    "JV",           # uppercase is not a real column here
    "1_leading",
    "has-dash",
    "",
])
def test_unsafe_identifiers_are_rejected(bad):
    with pytest.raises(ValueError):
        _sql.profile_sql("data_lake", "lee_parcels", [bad])


def test_unsafe_schema_or_table_rejected():
    with pytest.raises(ValueError):
        _sql.corr_sql("data_lake", "lee_parcels; DROP TABLE x", [("jv", "av_sd")])


# ---------------------------------------------------------------- chunking
# One statement per chunk; the payload is scalars either way.

def test_pairs_are_chunked_not_one_giant_statement():
    assert _sql.CORR_CHUNK < 1711   # 59 choose 2
    assert _sql.PROFILE_CHUNK < 59


def test_correlation_sql_emits_one_term_per_pair():
    pairs = [("jv", "av_sd"), ("jv", "land_sqft"), ("av_sd", "land_sqft")]
    sql = _sql.corr_sql("data_lake", "lee_parcels", pairs)
    assert len(re.findall(r"corr\(", sql)) == len(pairs)
