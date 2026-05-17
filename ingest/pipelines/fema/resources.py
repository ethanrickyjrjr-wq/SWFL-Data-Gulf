from datetime import date

import requests

from ingest.lib.arcgis_paginator import paginate_arcgis
from ingest.lib.geo_utils import FL_BBOX
from ingest.lib.storage_uploader import upload_csv_gz, upload_geojson_gz, write_tier1_pointer
from .constants import GEOMETRY_BUCKET, NFIP_CLAIMS_URL, TABULAR_BUCKET


def ingest_nfhl_layer(pipeline, layer: dict) -> None:
    today = date.today().isoformat()
    name = layer["name"]
    features = list(paginate_arcgis(layer["url"], bbox=FL_BBOX))
    object_path = f"fema/{name}/{today}.geojson.gz"
    upload_geojson_gz(GEOMETRY_BUCKET, object_path, features)
    write_tier1_pointer(pipeline, f"fema_{name}", GEOMETRY_BUCKET, object_path, len(features), layer["url"])


def ingest_nfip_claims(pipeline) -> None:
    today = date.today().isoformat()
    rows, skip, page_size = [], 0, 1000
    while True:
        resp = requests.get(
            NFIP_CLAIMS_URL,
            params={"$skip": skip, "$top": page_size, "$format": "json"},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        batch = data.get("value") or data.get("FimaNfipClaims", [])
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        skip += len(batch)

    if not rows:
        return
    object_path = f"fema/nfip_claims/{today}.csv.gz"
    upload_csv_gz(TABULAR_BUCKET, object_path, rows, list(rows[0].keys()))
    write_tier1_pointer(pipeline, "fema_nfip_claims", TABULAR_BUCKET, object_path, len(rows), NFIP_CLAIMS_URL)
