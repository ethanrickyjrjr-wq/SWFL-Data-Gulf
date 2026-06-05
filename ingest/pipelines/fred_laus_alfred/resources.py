"""Fetch helpers for fred_laus_alfred (ALFRED point-in-time vintage pulls)."""
from __future__ import annotations

import os
from datetime import date

import requests

from .constants import OBSERVATION_START, REALTIME_END_ALL, REALTIME_START_ALL, SERIES_AREA_MAP, SOURCE_URL


def fetch_alfred_laus() -> list[dict]:
    """Pull all vintages for FLLEEC7URN + FLCOLL0URN from the FRED ALFRED API.

    Each row = one (observation_date, vintage window) pair. Rows where value == "."
    (FRED missing-value sentinel) are excluded.
    """
    key = os.environ["FRED_API_KEY"]
    ingested_at = date.today().isoformat()
    rows: list[dict] = []
    for series_id, area in SERIES_AREA_MAP.items():
        resp = requests.get(
            SOURCE_URL,
            params={
                "series_id": series_id,
                "api_key": key,
                "file_type": "json",
                "observation_start": OBSERVATION_START,
                "realtime_start": REALTIME_START_ALL,
                "realtime_end": REALTIME_END_ALL,
                "sort_order": "asc",
            },
            timeout=60,
        )
        resp.raise_for_status()
        for obs in resp.json().get("observations", []):
            if obs["value"] == ".":
                continue
            rows.append(
                {
                    "series_id": series_id,
                    "area": area,
                    "observation_date": obs["date"],
                    "value": float(obs["value"]),
                    "realtime_start": obs["realtime_start"],
                    "realtime_end": obs["realtime_end"],
                    "_ingested_at": ingested_at,
                }
            )
    return rows
