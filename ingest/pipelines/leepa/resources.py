from datetime import date

from ingest.lib.arcgis_paginator import paginate_arcgis
from ingest.lib.storage_uploader import upload_geojson_gz, write_tier1_pointer
from .constants import LEEPA_PARCELS_URL, TABULAR_BUCKET


def ingest_leepa_parcels(pipeline) -> None:
    today = date.today().isoformat()
    features = list(paginate_arcgis(LEEPA_PARCELS_URL))
    object_path = f"leepa/parcels/{today}.geojson.gz"
    upload_geojson_gz(TABULAR_BUCKET, object_path, features)
    write_tier1_pointer(pipeline, "leepa_parcels", TABULAR_BUCKET, object_path, len(features), LEEPA_PARCELS_URL)
