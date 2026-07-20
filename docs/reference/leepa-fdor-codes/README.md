# LeePA / FDOR property code & rule reference

A lookup folder for the code lists and rule manuals Lee County Property Appraiser (LeePA) and the
Florida Department of Revenue (FDOR) publish to decode their own data fields — several of which
are fields we already pull raw and don't yet decode. Not wired into any pipeline; reference only.

Master catalog page: https://www.leepa.org/Systems/Codes.aspx (fetched 07/20/2026, "last updated
07/19/2026" per its own footer — re-check that page for newer links before treating this index as
current).

## Captured in this folder

| File | Source | As-of | Decodes |
|---|---|---|---|
| `leepa-condominium-codes.md` | [Condominium_Code_List.pdf](https://www.leepa.org/Docs/Codes/Condominium_Code_List.pdf) | 12/17/2012 | LeePA condo-unit attribute codes (balcony, extra feature, extra room, frontage, location, parking, quality, recreation, unit type, view) |
| `leepa-improvement-codes.md` | [Improvement_Code_List.pdf](https://www.leepa.org/Docs/Codes/Improvement_Code_List.pdf) | 06/01/2015 | LeePA building/structure-type code 0-130 — likely `PA_UC` on the FDOR NAL layer (unconfirmed, see gap below) |
| `leepa-property-neighborhood-codes.md` | [Property_Neighborhood_Code_List.pdf](https://www.leepa.org/Docs/Codes/Property_Neighborhood_Code_List.pdf) | 12/13/2012 | `NBRHD_CD` — already an `OUT_FIELDS` column in `ingest/pipelines/lee_parcels/constants.py` and `ingest/pipelines/collier_parcels` |
| `fdor-rptqc-manual.md` | [RPTQC_Manual.pdf](https://floridarevenue.com/property/Documents/RPTQC_Manual.pdf) (floridarevenue.com) | Oct 2025 | `QUAL_CD1` / `QUAL_CD2` sale-qualification codes — already an `OUT_FIELDS` column; `lee_parcels/constants.py` currently hardcodes `QUALIFIED_SALE_CODE = "01"` off a one-line comment, this manual is the full rule set behind it |

## Linked, not yet pulled (from the Codes.aspx catalog)

Per operator instruction (07/20/2026): saving links only for now, not transcribing.

| Label | URL |
|---|---|
| Appraisal Land Use Codes | https://www.leepa.org/Docs/Codes/Land_Use_Code_List.pdf |
| Building Permit Codes | https://www.leepa.org/Docs/Codes/Permit_Code_List.pdf |
| Condominium Neighborhood Codes | https://www.leepa.org/Docs/Codes/Condo_Neighborhood_Code_List.pdf |
| **Department of Revenue Property Classification Codes** | https://www.leepa.org/Docs/Codes/DOR_Code_List.pdf — **highest-value next pull: decodes `DOR_UC`, the statewide field already in every `lee_parcels`/`collier_parcels` row** |
| DOR Sale Qualification Codes (2025) | https://www.leepa.org/Docs/Codes/salequalcodes_aft01012025.pdf |
| DOR Sale Qualification Codes (2024) | https://www.leepa.org/Docs/Codes/salequalcodes_aft01012024.pdf |
| DOR Sale Qualification Codes (2023) | https://www.leepa.org/Docs/Codes/salequalcodes_aft01012023.pdf |
| DOR Sale Qualification Codes (2022) | https://www.leepa.org/Docs/Codes/salequalcodes_aft01012022.pdf |
| DOR Sale Qualification Codes (2020) | https://www.leepa.org/Docs/Codes/salequalcodes_aft01012020.pdf |
| DOR Sale Qualification Codes (2019) | https://www.leepa.org/Docs/Codes/salequalcodes_aft01012019.pdf |
| DOR Sale Qualification Codes (2018) | https://www.leepa.org/Docs/Codes/salequalcodes_aft01012018.pdf |
| DOR Sale Qualification Codes (2009-2017) | https://www.leepa.org/Docs/Codes/salequalcodes_aft01012017.pdf |
| DOR Sale Qualification Codes (Pre-2009) | https://www.leepa.org/Docs/Codes/Transfer_Code_List.pdf |
| Extra Feature Codes | https://www.leepa.org/Docs/Codes/Extra_Feature_Code_List.pdf |
| Garbage Collection Codes | https://www.leepa.org/Docs/Codes/Garbage_Code_List.pdf |
| Model Codes | https://www.leepa.org/Docs/Codes/Model_Code_List.pdf |
| NAICS Codes | https://www.leepa.org/Docs/Codes/NAICS_Code_List.pdf (see also https://www.census.gov/naics/) |
| Structural Element Codes (Res and Comm) | https://www.leepa.org/Systems/StructuralElementCodes.aspx (HTML page, not a PDF) |
| Sub Area Codes | https://www.leepa.org/Docs/Codes/Sub_Area_Code_List.pdf |
| Unit Of Measure Codes | https://www.leepa.org/Docs/Codes/Unit_Of_Measure_Code_List.pdf |

## Field cross-reference (what we already pull vs. what decodes it)

`OUT_FIELDS` in `ingest/pipelines/lee_parcels/constants.py` and `ingest/pipelines/collier_parcels`
(same FDOR statewide NAL layer, same 102-field scope) already carry these undecoded fields:

- `DOR_UC` — statewide DOR use code → decoded by **DOR_Code_List.pdf** (not yet pulled)
- `PA_UC` — county-assigned use code → likely decoded by `leepa-improvement-codes.md`, unconfirmed — LeePA's own MapServer Layer 9 ("State Use Codes per parcel") already ingested tabularly by `ingest/pipelines/leepa/constants.py` (`LEEPA_USE_CODES_URL`) may be the faster live cross-check
- `NBRHD_CD`, `MKT_AR` — neighborhood/market area → decoded by `leepa-property-neighborhood-codes.md` (captured above)
- `QUAL_CD1`, `QUAL_CD2` — sale transfer qualification → decoded by `fdor-rptqc-manual.md` (captured above) + the year-specific LeePA snapshots (linked, not pulled)
- `IMP_QUAL`, `CONST_CLAS` — improvement quality / construction class → not yet matched to a specific list in this catalog; candidates are Structural Element Codes or Model Codes (both link-only above)

None of this is wired into ingest code yet — it's reference material for whoever next works the
condo/property-type classification gap on `lee_parcels`/`collier_parcels`.
