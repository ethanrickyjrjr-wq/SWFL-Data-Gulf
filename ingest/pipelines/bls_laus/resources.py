import os
from datetime import datetime, timezone

import dlt
import requests

from .constants import (
    BLS_API_BASE_URL,
    BLS_API_KEY,
    AREA_FIPS,
    MEASURE_CODES,
    SERIES_IDS,
    SERIES_META,
)

_BLS_LAUS_COLUMNS: dict = {
    "id":             {"data_type": "text",      "nullable": False, "primary_key": True},
    "series_id":      {"data_type": "text",      "nullable": False},
    "area_fips":      {"data_type": "text",      "nullable": False},
    "measure_code":   {"data_type": "text",      "nullable": False},
    "measure_label":  {"data_type": "text",      "nullable": True},
    "year":           {"data_type": "bigint",    "nullable": False},
    "period":         {"data_type": "text",      "nullable": False},
    "period_name":    {"data_type": "text",      "nullable": True},
    "value":          {"data_type": "double",    "nullable": True},
    "footnote_codes": {"data_type": "text",      "nullable": True},
    "_ingested_at":   {"data_type": "timestamp", "nullable": True},
}


def _make_id(series_id: str, year: str, period: str) -> str:
    return f"{series_id}|{year}|{period}"


def _coerce_value(v) -> float | None:
    if v in (None, "", "-"):
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


@dlt.resource(
    name="bls_laus",
    write_disposition="merge",
    primary_key="id",
    columns=_BLS_LAUS_COLUMNS,
)
def bls_laus_resource(start_year: str, end_year: str):
    """
    Fetches BLS LAUS (Local Area Unemployment Statistics) for FL state,
    Lee County, and Collier County for the requested year range.

    Makes one POST request per area (all 4 measure series batched per area,
    well within the 25-series/request public limit). Per-area batching
    provides failure isolation: if Lee County data is delayed, FL state
    and Collier still land.

    Filters out M13 (annual average) rows — only monthly observations (M01-M12)
    are stored, enabling calendar-month YoY delta in the TS source connector.
    """
    ingested_at = datetime.now(timezone.utc).isoformat()
    headers = {"Content-Type": "application/json"}

    for geo_key, fips in AREA_FIPS.items():
        series_for_area = list(SERIES_IDS[geo_key].values())  # 4 series

        payload: dict = {
            "seriesid": series_for_area,
            "startyear": start_year,
            "endyear": end_year,
        }
        if BLS_API_KEY:
            payload["registrationkey"] = BLS_API_KEY

        resp = requests.post(BLS_API_BASE_URL, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()

        body = resp.json()
        if body.get("status") != "REQUEST_SUCCEEDED":
            messages = body.get("message", [])
            raise RuntimeError(
                f"BLS LAUS API error for {geo_key} "
                f"{start_year}-{end_year}: {messages}"
            )

        for series_result in body.get("Results", {}).get("series", []):
            series_id = series_result["seriesID"]
            meta = SERIES_META.get(series_id)
            if meta is None:
                continue  # defensive: skip unexpected series IDs
            _, measure_code = meta

            for obs in series_result.get("data", []):
                year_str = obs.get("year", "")
                period = obs.get("period", "")
                # Skip annual averages (M13); store monthly observations only.
                if not period.startswith("M") or period == "M13":
                    continue

                footnotes = obs.get("footnotes", [{}])
                footnote_code = footnotes[0].get("code") if footnotes else None

                yield {
                    "id":             _make_id(series_id, year_str, period),
                    "series_id":      series_id,
                    "area_fips":      fips,
                    "measure_code":   measure_code,
                    "measure_label":  MEASURE_CODES.get(measure_code),
                    "year":           int(year_str),
                    "period":         period,
                    "period_name":    obs.get("periodName"),
                    "value":          _coerce_value(obs.get("value")),
                    "footnote_codes": footnote_code,
                    "_ingested_at":   ingested_at,
                }
