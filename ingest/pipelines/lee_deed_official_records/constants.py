"""Constants for the lee_deed_official_records LOAD pipeline.

FETCH is manual (Akamai Bot Manager blocks unattended access — see this
directory's README.md "Delivery mechanism — the actual blocker"). This module
serves the LOAD half only: read the human-captured raw/*.json files and merge
them into data_lake.lee_deed_official_records.
"""
from __future__ import annotations

from pathlib import Path

# Directory of human-captured daily pulls (one file per date, raw/<YYYY-MM-DD>.json).
RAW_DIR = Path(__file__).parent / "raw"

TABLE_NAME = "lee_deed_official_records"

# Stable numeric doc id (row position 25, README column map) — the merge/dedup key.
# Chosen over clerk_file_number because it is stable across years (README).
PRIMARY_KEY = "internal_doc_id"

# ODD provenance (Operation Dumbo Drop, seam 4). Stamped on every row so a brain
# can report "manual-drop, needs review" and never blend it blind with auto-feeds.
SOURCE_TAG = "lee_clerk_landmarkweb_manual"

# The live search surface the raw files are captured from (README "How to pull").
# Doubles as the human-facing citation homepage URL (there is no public vendor API doc).
SOURCE_URL = (
    "https://or.leeclerk.org/LandMarkWeb/search/index"
    "?theme=.blue&section=searchCriteriaDocuments&quickSearchSelection="
)
