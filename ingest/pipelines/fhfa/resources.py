from datetime import datetime, timezone

import dlt
import requests

from .constants import FHFA_HPI_MASTER_URL

# Pinned columns — keeps dlt from inferring types differently across runs.
_FHFA_HPI_COLUMNS: dict = {
    "id":           {"data_type": "text",      "nullable": False, "primary_key": True},
    "hpi_type":     {"data_type": "text",      "nullable": True},
    "hpi_flavor":   {"data_type": "text",      "nullable": True},
    "frequency":    {"data_type": "text",      "nullable": True},
    "level":        {"data_type": "text",      "nullable": True},
    "place_name":   {"data_type": "text",      "nullable": True},
    "place_id":     {"data_type": "text",      "nullable": True},
    "yr":           {"data_type": "bigint",    "nullable": True},
    "period":       {"data_type": "bigint",    "nullable": True},
    "index_nsa":    {"data_type": "double",    "nullable": True},
    "index_sa":     {"data_type": "double",    "nullable": True},
    # Data Tier Policy provenance fields
    "_source_url":  {"data_type": "text",      "nullable": True},
    "_ingested_at": {"data_type": "timestamp", "nullable": True},
}


def _make_id(row: dict) -> str:
    """Stable surrogate key — prevents duplicate rows across replace runs."""
    return "|".join([
        row.get("hpi_type", ""),
        row.get("hpi_flavor", ""),
        row.get("frequency", ""),
        str(row.get("place_id", "")),
        str(row.get("yr", "")),
        str(row.get("period", "")),
    ])


@dlt.resource(
    name="fhfa_hpi",
    write_disposition="replace",
    columns=_FHFA_HPI_COLUMNS,
)
def fhfa_hpi_resource():
    """
    Fetches FHFA hpi_master.json (~13 MB, full historical snapshot).
    replace disposition: FHFA overwrites the file monthly so we mirror that.
    """
    ingested_at = datetime.now(timezone.utc).isoformat()
    resp = requests.get(FHFA_HPI_MASTER_URL, timeout=120)
    resp.raise_for_status()

    for row in resp.json():
        yield {
            "id":           _make_id(row),
            "hpi_type":     row.get("hpi_type"),
            "hpi_flavor":   row.get("hpi_flavor"),
            "frequency":    row.get("frequency"),
            "level":        row.get("level"),
            "place_name":   row.get("place_name"),
            "place_id":     str(row.get("place_id", "")),
            "yr":           row.get("yr"),
            "period":       row.get("period"),
            "index_nsa":    row.get("index_nsa"),
            "index_sa":     row.get("index_sa"),
            "_source_url":  FHFA_HPI_MASTER_URL,
            "_ingested_at": ingested_at,
        }
