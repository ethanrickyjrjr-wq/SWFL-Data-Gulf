"""Helper for writing pointer rows to data_lake._tier1_inventory.

Used by every DuckDB-ingest pipeline that lands a Parquet file in Tier 1
Supabase Storage. Required by Data Tier Policy rule §2 (every Tier 1 file
has an audit-trail row).
"""
import os
from pathlib import Path
from typing import Optional

import psycopg


def _load_dlt_secrets() -> dict[str, str]:
    """Read .dlt/secrets.toml -- same credentials the dlt pipelines already use."""
    secrets_path = Path(__file__).parent.parent.parent / ".dlt" / "secrets.toml"
    out: dict[str, str] = {}
    if not secrets_path.exists():
        return out
    section = None
    for line in secrets_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1]
            continue
        if "=" in line and section and "credentials" in section:
            k, _, v = line.partition("=")
            out[k.strip()] = v.strip().strip("'\"")
    return out


def _get_connection() -> psycopg.Connection:
    conninfo = os.environ.get("DESTINATION__POSTGRES__CREDENTIALS")
    if conninfo:
        return psycopg.connect(conninfo, sslmode="require")
    # Fallback: parse .dlt/secrets.toml (local dev without the bundled URL secret)
    secrets = _load_dlt_secrets()
    return psycopg.connect(
        host=secrets["host"],
        port=int(secrets.get("port", "5432")),
        dbname=secrets.get("database", "postgres"),
        user=secrets["username"],
        password=secrets["password"],
        sslmode="require",
    )


# Module-level so the contract is testable: the source-staleness tripwire
# (redfin retarget, 07/16/2026) depends on these three columns persisting.
_UPSERT_SQL = """
    INSERT INTO data_lake._tier1_inventory
        (id, bucket, path, vintage, byte_size, pack_id, source_url,
         source_etag, source_last_modified, max_period_end, updated_at)
    VALUES
        (%(id)s, %(bucket)s, %(path)s, %(vintage)s, %(byte_size)s, %(pack_id)s, %(source_url)s,
         %(source_etag)s, %(source_last_modified)s, %(max_period_end)s, now())
    ON CONFLICT (id) DO UPDATE SET
        vintage              = EXCLUDED.vintage,
        byte_size            = EXCLUDED.byte_size,
        pack_id              = EXCLUDED.pack_id,
        source_url           = EXCLUDED.source_url,
        source_etag          = COALESCE(EXCLUDED.source_etag, data_lake._tier1_inventory.source_etag),
        source_last_modified = COALESCE(EXCLUDED.source_last_modified, data_lake._tier1_inventory.source_last_modified),
        max_period_end       = COALESCE(EXCLUDED.max_period_end, data_lake._tier1_inventory.max_period_end),
        updated_at           = now();
"""


def upsert_inventory_row(
    *,
    bucket: str,
    path: str,
    vintage: Optional[str],
    byte_size: Optional[int],
    pack_id: Optional[str],
    source_url: Optional[str],
    source_etag: Optional[str] = None,
    source_last_modified: Optional[str] = None,
    max_period_end: Optional[str] = None,
) -> None:
    """Insert or update one row in data_lake._tier1_inventory.

    The id is composed as f"{bucket}/{path}" -- same Parquet file overwritten
    in place => same inventory row updated. The three optional source-staleness
    fields COALESCE on conflict so pipelines that don't pass them never blank
    another pipeline's recorded values.
    """
    row_id = f"{bucket}/{path}"
    params = {
        "id": row_id,
        "bucket": bucket,
        "path": path,
        "vintage": vintage,
        "byte_size": byte_size,
        "pack_id": pack_id,
        "source_url": source_url,
        "source_etag": source_etag,
        "source_last_modified": source_last_modified,
        "max_period_end": max_period_end,
    }
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_UPSERT_SQL, params)
        conn.commit()
    finally:
        conn.close()


def get_inventory_meta(*, bucket: str, path: str) -> Optional[dict]:
    """Read the prior run's source-staleness fields for one inventory row.

    Returns {source_etag, source_last_modified, max_period_end} or None when
    the row doesn't exist yet (bootstrap run).
    """
    row_id = f"{bucket}/{path}"
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT source_etag, source_last_modified, max_period_end
                FROM data_lake._tier1_inventory
                WHERE id = %(id)s
                """,
                {"id": row_id},
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {
        "source_etag": row[0],
        "source_last_modified": row[1],
        "max_period_end": row[2],
    }
