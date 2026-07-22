"""The DB seam for offline analysis — AGGREGATES ONLY, never rows.

WHY THIS FILE REFUSES TO SELECT ROWS (read before "optimizing" it)
------------------------------------------------------------------
The obvious implementation pulls the parcel tables into memory and lets numpy do
the statistics. That is 847,056 rows x 59 numeric columns ~= 400 MB per run.

Two reasons it is not what we do:

1. `db-max-rows = 1000` (refinery/lib/paginate.mts) bounds PostgREST only. A raw
   psycopg cursor bypasses it completely, so nothing structural would stop that
   pull. As of 07/22/2026 this project is at 311% of its Supabase egress quota
   with the spend cap ON, which converts overage into THROTTLING — the live
   incident behind the /desk + /charts outage. An analysis that is re-run as
   labels accumulate would be re-paying that cost every run.
2. Source-side is also more correct: `corr()` over every row beats a sample, and
   the result is deterministic.

So the statistics are computed by Postgres and only scalars cross the wire — a
59x59 correlation matrix is ~28 KB regardless of table size. Every query builder
below is aggregate-only, and test_sql.py asserts it (no bare column projection,
no SELECT *).

Column names are validated against information_schema before interpolation —
they cannot be attacker-controlled here, but identifiers cannot be parameterized
and an unvalidated one would be an injection seam.

Spec: docs/superpowers/specs/2026-07-22-offline-model-analysis-design.md
"""
from __future__ import annotations

import os
import re
from itertools import combinations
from pathlib import Path

import numpy as np

from ingest.analysis._stats import ColumnProfile

_NUMERIC_TYPES = (
    "'numeric','integer','bigint','double precision','real','smallint'"
)
_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")

# Chunk sizes keep any single statement modest. Each chunk is one sequential scan
# of the table; the payload is a handful of scalars either way. Probed 07/22/2026:
# 8 profile columns and 6 correlation pairs over 556,083 rows both returned
# immediately, so these are conservative rather than tuned.
PROFILE_CHUNK = 15
CORR_CHUNK = 150


def _safe(ident: str) -> str:
    """Reject anything that is not a plain lowercase SQL identifier."""
    if not _IDENT.match(ident):
        raise ValueError(f"unsafe SQL identifier: {ident!r}")
    return ident


def get_conn():
    """DATABASE_URL, else .dlt/secrets.toml — same resolution order as
    ingest/pipelines/listing_week/db.py. Lazy psycopg import so pure callers and
    --dry-run never need the driver."""
    import psycopg

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        import tomllib

        secrets = Path(".dlt/secrets.toml")
        if not secrets.exists():
            raise RuntimeError(
                "No DATABASE_URL and no .dlt/secrets.toml — cannot reach data_lake."
            )
        cfg = tomllib.loads(secrets.read_text(encoding="utf-8"))
        c = cfg["destination"]["postgres"]["credentials"]
        db_url = (
            f"postgresql://{c['username']}:{c['password']}"
            f"@{c['host']}:{c['port']}/{c['database']}"
        )
    return psycopg.connect(db_url)


# --------------------------------------------------------------- query builders
# Split out from the executors so tests can assert the SQL shape without a DB.

def numeric_columns_sql(schema: str, table: str) -> str:
    return (
        "SELECT column_name FROM information_schema.columns "
        f"WHERE table_schema = '{_safe(schema)}' AND table_name = '{_safe(table)}' "
        f"AND data_type IN ({_NUMERIC_TYPES}) ORDER BY ordinal_position"
    )


def profile_sql(schema: str, table: str, cols: list[str]) -> str:
    """count(*), plus non-null / distinct / zero counts per column.

    `count(*) FILTER (WHERE col = 0)` is the load-bearing one on this source:
    FDOR zero-fills, so null counts alone read every column as fully populated.
    """
    parts = ["count(*) AS n"]
    for c in cols:
        s = _safe(c)
        parts += [
            f"count({s}) AS {s}__non_null",
            f"count(DISTINCT {s}) AS {s}__distinct",
            f"count(*) FILTER (WHERE {s} = 0) AS {s}__zeros",
        ]
    return f"SELECT {', '.join(parts)} FROM {_safe(schema)}.{_safe(table)}"


def corr_sql(schema: str, table: str, pairs: list[tuple[str, str]]) -> str:
    """Pearson correlation for each (a, b) pair — one scalar each."""
    parts = [
        f"corr({_safe(a)}, {_safe(b)}) AS c{i}" for i, (a, b) in enumerate(pairs)
    ]
    return f"SELECT {', '.join(parts)} FROM {_safe(schema)}.{_safe(table)}"


def _chunks(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


# -------------------------------------------------------------------- executors

def fetch_numeric_columns(conn, schema: str, table: str) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(numeric_columns_sql(schema, table))
        return [r[0] for r in cur.fetchall()]


def fetch_profiles(conn, schema: str, table: str,
                   cols: list[str]) -> list[ColumnProfile]:
    profiles: list[ColumnProfile] = []
    for chunk in _chunks(cols, PROFILE_CHUNK):
        with conn.cursor() as cur:
            cur.execute(profile_sql(schema, table, chunk))
            row = cur.fetchone()
            names = [d.name for d in cur.description]
        got = dict(zip(names, row))
        n = int(got["n"])
        for c in chunk:
            profiles.append(
                ColumnProfile(
                    name=c,
                    n=n,
                    non_null=int(got[f"{c}__non_null"]),
                    distinct=int(got[f"{c}__distinct"]),
                    zeros=int(got[f"{c}__zeros"]),
                )
            )
    return profiles


def fetch_correlation_matrix(conn, schema: str, table: str,
                             cols: list[str]) -> np.ndarray:
    """Full symmetric correlation matrix, assembled from chunked pairwise reads.

    A NULL corr() (a constant column inside the window, or too few rows) becomes
    0.0 — no correlation rather than a NaN that would poison the clustering.
    """
    index = {c: i for i, c in enumerate(cols)}
    matrix = np.eye(len(cols), dtype=float)
    pairs = list(combinations(cols, 2))

    for chunk in _chunks(pairs, CORR_CHUNK):
        with conn.cursor() as cur:
            cur.execute(corr_sql(schema, table, chunk))
            values = cur.fetchone()
        for (a, b), v in zip(chunk, values):
            r = 0.0 if v is None else float(v)
            matrix[index[a], index[b]] = r
            matrix[index[b], index[a]] = r

    return matrix


def fetch_row_count(conn, schema: str, table: str) -> int:
    with conn.cursor() as cur:
        cur.execute(f"SELECT count(*) FROM {_safe(schema)}.{_safe(table)}")
        return int(cur.fetchone()[0])
