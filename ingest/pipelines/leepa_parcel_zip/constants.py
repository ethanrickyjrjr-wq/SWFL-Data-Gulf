"""Pinned source + asset paths for the Lee parcel -> ZIP crosswalk.

The site ZIP (G1: parcel centroid, never a mailing ZIP) is not a column on any of
LeePA's 24 MapServer layers, so we derive it: pull parcel polygon geometry from
ParcelInfo layer 12, take each parcel's outer-ring centroid, and point-in-polygon
it against the TIGER ZCTA polygons already vendored in the repo.
"""
from __future__ import annotations

import os

# LeePA ParcelInfo MapServer layer 12 serves parcel polygon geometry keyed by FOLIOID.
LEEPA_PARCEL_LAYER_URL = (
    "https://gissvr.leepa.org/gissvr/rest/services/ParcelInfo/MapServer/12/query"
)

# TIGER ZCTA polygons already vendored (see ingest/utils/zip_approx.py provenance).
ZCTA_ASSET_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "public", "maps", "fl_zips.geojson")
)

# ZCTA feature property carrying the 5-digit ZIP code.
ZCTA_PROP = "ZCTA5CE10"

PAGE_SIZE = 2000

# Tier-2 landing table column spec (dlt merge on folioid PK).
TIER2_COLUMNS = {
    "folioid": {"data_type": "text", "nullable": False, "primary_key": True},
    "zip_code": {"data_type": "text", "nullable": True},
    "method": {"data_type": "text", "nullable": True},
}
