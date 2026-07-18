# FL DOR Sale Data File (SDF) — PARKED (confirmed downloadable, not built)

**Status:** PARKED 07/18/2026. Not built — superseded by wiring the already-current
`data_lake.market_details_swfl.median_sold_price` into `loadMarketFigures` instead
(see SESSION_LOG 07/18). Kept because the download path + field scope are proven live
and this is the right source IF we ever want arms-length / transaction-flow / sub-ZIP depth.

## Why parked (RULE 0.5 chain)

- The FDOR NAL (incl. `SALE_PRC1/2`, sale year/month) is **already ingested** via the ArcGIS
  Statewide Parcel Centroid layer (`parcel_subdivision`, ~82k Collier+Lee parcels with a sale;
  `collier_parcels` too). The ArcGIS layer *is* "the full 120-field DOR NAL file."
- A rolling-12-month homes-only sold-median view for **both** counties already shipped
  (`docs/sql/20260714_sold_median_recency_window.sql`) — the "stock-blend ships 6.6% high"
  defect is already fixed, and both `properties-{lee,collier}-value` brains already consume it.
- That same migration points at `market_details_swfl` (realtor.com, per-ZIP `median_sold_price`,
  both counties, ~monthly) as the **current** sold source — fresher than the FDOR annual roll.
- The SDF (2025 **Final** roll; no 2026 preliminary posted as of 07/18) carries sales only
  through ~mid-2025, so it is ~a year **less recent** than what we already use. Its genuine adds
  are the **arms-length QUAL_CD filter**, true **transaction flow** (all sales, not last-2/parcel),
  deed references, and **census-block** grain — a quality/detail cross-check, not a fresher headline.

## What's proven (so a future build starts at "wire it")

- **Download path (no form, no auth):** SharePoint REST on `floridarevenue.com/property/dataportal`.
  `_api/web/GetFolderByServerRelativeUrl('/property/dataportal/Documents/PTO Data Portal/Tax Roll Data Files/SDF/<roll>F')/Files`
  → one zip per county, e.g. `Collier 21 Final SDF  2025.zip`, `Lee 46 Final SDF 2025.zip`.
  Download `https://floridarevenue.com` + `ServerRelativeUrl` (URL-encode spaces).
- **Verified live 07/18/2026:** Collier zip (1.15 MB) → `SDF21F202502VAB.csv`, **54,695 sale rows**.
  FDOR county codes match ArcGIS `CO_NO`: Collier=21, Lee=46.
- **23 columns:** CO_NO, PARCEL_ID, ASMNT_YR, ATV_STRT, GRP_NO, DOR_UC, NBRHD_CD, MKT_AR, CENSUS_BK,
  SALE_ID_CD, SAL_CHG_CD, VI_CD, OR_BOOK, OR_PAGE, CLERK_NO, QUAL_CD, SALE_YR, SALE_MO, SALE_PRC,
  MULTI_PAR_SAL, RS_ID, MP_ID, STATE_PARCEL_ID.
- **Filters for a clean sold set:** DOR_UC IN ('001','004') homes · QUAL_CD='01' arms-length
  (drops ~27,858 QUAL_CD='11' disqualified) · VI_CD='I' improved · MULTI_PAR_SAL≠'01' · SALE_PRC>20000.
  Collier 2024: n≈10,439 qualified home sales; 2025 partial. Join `PARCEL_ID` → `parcel_subdivision.zip`
  for situs ZIP (both counties). NO address/ZIP in the SDF itself.

## If unparked

Ingest → `data_lake.fdor_sales` (transaction grain, annual cadence ~Oct final roll, GHA cron +
`--dry-run` + guard) → `data_lake.fdor_sold_median_by_zip` (qualified arms-length flow, most-recent
complete roll year, clearly dated) → surface in `properties-{lee,collier}-value` as an ADDITIONAL,
dated arms-length cross-check — never replacing the fresher market_details/LeePA number (advisor
07/18: add, don't replace; don't rip Lee off its reality-verified source).
