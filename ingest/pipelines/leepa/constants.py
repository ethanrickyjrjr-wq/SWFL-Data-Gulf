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

# ParcelsWFS — a SIBLING SERVICE to ParcelInfo on the same host (not one of its 24 layers).
# Layer 0 "FabricParcels" (probed live 07/19/2026): 564,339 rows, `Name` + `FolioID` both
# zero-NULL, zero Historical rows, maxRecordCount 1000. `Name` IS the Lee STRAP in FDOR form —
# byte-identical to data_lake.lee_parcels.parcel_id (5/5 live-join verified). We pull ONLY
# Name+FolioID as the folio->strap crosswalk. NEVER pull its Address*/City/State/ZIP — those
# are OWNER-MAILING fields (a CA ZIP appears on a Lee parcel), a G1 violation if ever used as
# situs; FDOR phy_zipcd stays the situs-ZIP authority.
LEEPA_FABRIC_PARCELS_URL = (
    "https://gissvr.leepa.org/gissvr/rest/services/ParcelsWFS/MapServer/0/query"
)

TABULAR_BUCKET = "raw-tabular-cold"
