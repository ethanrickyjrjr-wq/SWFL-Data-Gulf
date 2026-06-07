"""Census batch geocoder and corridor assignment for Lee County permits.

Uses the US Census Geocoding API (free, no key required, 10k rows/batch).
Lee Accela addresses are in the format "STREET, CITY, FL ZIP" — all three
components are passed to the Census API for higher match rates.
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
from pathlib import Path

import requests

CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
CENSUS_BATCH_SIZE = 9_999  # Census hard limit is 10,000 rows per request
MAX_RADIUS_MI = 1.5  # haversine threshold — matches Collier corridor-assignment

EARTH_RADIUS_MI = 3958.7613

_CENTROIDS_PATH = Path(__file__).resolve().parents[3] / "fixtures" / "corridor-centroids.json"
_ZIP_RE = re.compile(r"\b(\d{5})(?:-\d{4})?\b")
_FL_ZIP_RE = re.compile(r"\bFL\s+(\d{5})(?:-\d{4})?\b")


def load_lee_centroids() -> list[dict]:
    """Load the unified corridor centroids fixture and return only Lee rows."""
    with open(_CENTROIDS_PATH) as f:
        raw = json.load(f)
    return [c for c in raw if c.get("county") == "lee"]


def _haversine_mi(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return EARTH_RADIUS_MI * 2 * math.asin(math.sqrt(min(a, 1.0)))


def assign_corridor(
    lat: float | None,
    lon: float | None,
    centroids: list[dict],
) -> str | None:
    """Return nearest corridor_id within MAX_RADIUS_MI, or None."""
    if lat is None or lon is None or not math.isfinite(lat) or not math.isfinite(lon):
        return None
    best_id: str | None = None
    best_dist = float("inf")
    for c in centroids:
        d = _haversine_mi(lat, lon, c["center_lat"], c["center_lon"])
        if d < best_dist:
            best_dist = d
            best_id = c["corridor_id"]
    return best_id if best_dist <= MAX_RADIUS_MI else None


def _split_lee_address(address: str) -> tuple[str, str, str]:
    """Split 'STREET, CITY, FL ZIP' → (street, city, zip).

    Examples:
      '12345 US 41 N, FORT MYERS, FL 33903'  → ('12345 US 41 N', 'FORT MYERS', '33903')
      '100 LEE BLVD, LEHIGH ACRES, FL 33936' → ('100 LEE BLVD', 'LEHIGH ACRES', '33936')
    Falls back to (address, 'Fort Myers', '') when format doesn't match.
    """
    zip_match = _FL_ZIP_RE.search(address)
    zip_code = zip_match.group(1) if zip_match else ""
    # Strip ", FL 33903" or " FL 33903" suffix (with or without leading comma)
    cleaned = re.sub(r",?\s*FL\s+\d{5}(?:-\d{4})?", "", address).strip().rstrip(",").strip()
    parts = [p.strip() for p in cleaned.rsplit(",", 1)]
    if len(parts) == 2:
        return parts[0], parts[1], zip_code
    return cleaned, "Fort Myers", zip_code


def geocode_batch(
    addresses: list[str],
    session: requests.Session | None = None,
) -> dict[str, tuple[float, float] | None]:
    """Geocode site addresses via Census batch API.

    Returns {address: (lat, lon) | None}. Addresses that don't match return None.
    Deduplicates before sending; chunks at CENSUS_BATCH_SIZE.
    """
    unique = list(dict.fromkeys(a for a in addresses if a))
    result: dict[str, tuple[float, float] | None] = {a: None for a in unique}
    if not unique:
        return result

    http = session or requests.Session()

    for start in range(0, len(unique), CENSUS_BATCH_SIZE):
        chunk = unique[start : start + CENSUS_BATCH_SIZE]

        csv_lines = []
        for i, addr in enumerate(chunk):
            street, city, zip_code = _split_lee_address(addr)
            # id, street address, city, state, zip
            csv_lines.append(f"{i},{street},{city},FL,{zip_code}")
        payload = "\n".join(csv_lines)

        try:
            r = http.post(
                CENSUS_GEOCODER_URL,
                data={
                    "benchmark": "Public_AR_Current",
                    "returntype": "locations",
                },
                files={"addressFile": ("addresses.csv", payload.encode("utf-8"), "text/plain")},
                timeout=120,
            )
            r.raise_for_status()
        except requests.RequestException as exc:
            print(f"[geocoder] Census API error for chunk {start}-{start+len(chunk)}: {exc}")
            continue

        # Response CSV: id, input_addr, match, match_type, matched_addr, lon_lat, tiger_id, side
        reader = csv.reader(io.StringIO(r.text))
        for row in reader:
            if len(row) < 6:
                continue
            idx_str = row[0].strip()
            match_status = row[2].strip().lower()
            coords = row[5].strip() if len(row) > 5 else ""

            if match_status != "match" or not coords:
                continue
            try:
                lon_str, lat_str = coords.split(",")
                lat, lon = float(lat_str.strip()), float(lon_str.strip())
                result[chunk[int(idx_str)]] = (lat, lon)
            except (ValueError, IndexError):
                continue

    return result
