LEEPA_MAPSERVER_BASE = "https://gissvr.leepa.org/gissvr/rest/services/ParcelInfo/MapServer"

# Layer 0 — Tangible Business Names (geometry-bearing; original ingest target).
LEEPA_PARCELS_URL = f"{LEEPA_MAPSERVER_BASE}/0/query"

# Layer 9 — State Use Codes per parcel (Code, Description). Tabular-only.
LEEPA_USE_CODES_URL = f"{LEEPA_MAPSERVER_BASE}/9/query"

# Layer 10 — Last Qualified Sale per parcel (Amount, DoS, Instrument, ORBookPage). Tabular-only.
LEEPA_LAST_SALE_URL = f"{LEEPA_MAPSERVER_BASE}/10/query"

# Layer 12 — Just Value bundle per parcel (Just, Market, Assessed, Taxable, SOHCap, Building, Land,
# CapDifference). Layers 13/14/15 carry identical fields with different choropleth styling —
# ingest layer 12 once and skip the duplicates.
LEEPA_JUST_VALUE_URL = f"{LEEPA_MAPSERVER_BASE}/12/query"

TABULAR_BUCKET = "raw-tabular-cold"
