import os

BLS_API_BASE_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"

# Optional v2 registration key — if set, BLS grants v2 limits (50 series/request,
# 20-year range). If absent, v1 limits apply (25 series/request, 10-year range).
# Our use case: 4 series/area × 3 areas = 12 series max — fits either tier.
BLS_API_KEY: str | None = os.environ.get("BLS_API_KEY")

# BLS LAUS measure codes (verified from download.bls.gov/pub/time.series/la/la.measure)
MEASURE_CODES = {
    "03": "unemployment rate",
    "04": "unemployment",
    "05": "employment",
    "06": "labor force",
}

# AREAS registry: geo_key -> (area_type, series_fips, zero_padding_count)
# Area code format: area_type + series_fips + "0"*zero_count = exactly 15 chars
# Series ID format: "LAU" + seasonal_adj("U") + area_code(15) + measure_code(2) = 20 chars
# Verified from download.bls.gov/pub/time.series/la/la.area:
#   Florida:         ST1200000000000  (area_type=ST, fips=12,    11 zeros)
#   Lee County:      CN1207100000000  (area_type=CN, fips=12071,  8 zeros)
#   Collier County:  CN1202100000000  (area_type=CN, fips=12021,  8 zeros)
AREAS: dict[str, tuple[str, str, int]] = {
    "florida": ("ST", "12",    11),
    "lee":     ("CN", "12071",  8),
    "collier": ("CN", "12021",  8),
}

# DB column FIPS values — 5-char conventional format matching QCEW convention.
# DISTINCT from AREAS series_fips above (state uses "12" in series ID, "12000" in DB).
AREA_FIPS: dict[str, str] = {
    "florida": "12000",
    "lee":     "12071",
    "collier": "12021",
}


def make_series_id(area_type: str, series_fips: str, zero_count: int, measure_code: str) -> str:
    """Build a 20-char BLS LAUS series ID from components.

    Series ID layout (verified from bls.gov/help/hlpforma.htm#LA):
      Pos 1-2:  LA  (prefix)
      Pos 3:    U   (not seasonally adjusted)
      Pos 4-18: area_code  (15 chars = area_type + series_fips + zero_padding)
      Pos 19-20: measure_code (2 chars)
    """
    area_code = f"{area_type}{series_fips}{'0' * zero_count}"
    assert len(area_code) == 15, (
        f"Area code must be 15 chars, got {len(area_code)}: {area_code!r}"
    )
    series_id = f"LAU{area_code}{measure_code}"
    assert len(series_id) == 20, (
        f"Series ID must be 20 chars, got {len(series_id)}: {series_id!r}"
    )
    return series_id


# Pre-built lookup: geo_key -> measure_code -> series_id
SERIES_IDS: dict[str, dict[str, str]] = {
    geo: {
        mc: make_series_id(area_type, fips, zeros, mc)
        for mc in MEASURE_CODES
    }
    for geo, (area_type, fips, zeros) in AREAS.items()
}

# Reverse lookup: series_id -> (geo_key, measure_code)
SERIES_META: dict[str, tuple[str, str]] = {
    sid: (geo, mc)
    for geo, mc_map in SERIES_IDS.items()
    for mc, sid in mc_map.items()
}
