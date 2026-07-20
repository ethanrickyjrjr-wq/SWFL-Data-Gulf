"""dlt resource for lee_deed_official_records — LOAD half only.

This is a LOCAL-FILE MERGE source, NOT a live-fetch one (contrast lee_permits,
which scrapes Accela). The FETCH is manual (Akamai — see README); a human drops
raw/<YYYY-MM-DD>.json files into this directory. This resource reads every such
file and merges the rows in.

Design (per ingest/CLAUDE.md + the ODD standard):
  • write_disposition="merge" + primary_key="internal_doc_id" IS the idempotency —
    re-running over the same files never duplicates, so there is NO incremental
    cursor and NO assert_content_fresh guard here (content only advances on a manual
    drop; a freshness guard would false-fail, which is why the cadence entry is
    parked / probe-excluded).
  • Empty-tolerant: zero raw files (or an empty raw dir) yields zero rows and the
    merge is a clean no-op — safe to run on a schedule even when nothing new landed.
  • Gate 4 does not require a non-null guard for merge (only for replace/truncate),
    and adding one that raises on zero rows would break ODD empty-tolerance — so
    there is deliberately no volume guard that aborts an empty load.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Iterator, Optional

import dlt

from .constants import PRIMARY_KEY, RAW_DIR, SOURCE_TAG, SOURCE_URL, TABLE_NAME
from .normalize import normalize_row


def _read_raw_files(raw_dir: Path) -> list[dict]:
    """Read every raw/*.json, normalize, and dedup on internal_doc_id (newest file wins).

    Files are processed in filename order (raw/<YYYY-MM-DD>.json sorts chronologically),
    so a doc that appears in two daily captures keeps the row from the LATER file.
    """
    if not raw_dir.exists():
        return []
    by_id: dict[str, dict] = {}
    passthrough: list[dict] = []  # rows with no internal_doc_id (never dedup-collapsed)
    for path in sorted(raw_dir.glob("*.json")):
        try:
            records = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if not isinstance(records, list):
            continue
        for raw in records:
            if not isinstance(raw, dict):
                continue
            row = normalize_row(raw, source_file=path.name)
            doc_id = row.get("internal_doc_id")
            if doc_id:
                by_id[doc_id] = row  # later file overwrites earlier (newest wins)
            else:
                passthrough.append(row)
    return list(by_id.values()) + passthrough


@dlt.resource(
    name=TABLE_NAME,
    primary_key=PRIMARY_KEY,
    write_disposition="merge",
    columns={
        "record_date": {"data_type": "date"},
        "consideration_usd": {"data_type": "decimal"},
        # json data_type keeps grantor/grantee lists as a single JSONB column instead
        # of spawning dlt child tables — preserves the source "..." truncation marker.
        "grantors": {"data_type": "json"},
        "grantees": {"data_type": "json"},
    },
)
def lee_deed_official_records_resource(
    rows: Optional[Iterable[dict]] = None,
) -> Iterator[dict]:
    """Emit normalized deed rows, source-tagged, for the merge.

    Live (rows is None): read + normalize every raw/*.json in RAW_DIR.
    Tests inject `rows=` (already-normalized dicts) to exercise the merge without disk.
    """
    if rows is None:
        rows = _read_raw_files(RAW_DIR)
    for row in rows:
        yield {
            **row,
            "source_tag": SOURCE_TAG,
            "source_url": SOURCE_URL,
        }
