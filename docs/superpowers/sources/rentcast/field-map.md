# RentCast Field Map

## Listings Sale Endpoint

`GET https://api.rentcast.io/v1/listings/sale`

Auth: `X-Api-Key: <key>` header

### Query parameters used by vendor script

| Param   | Type   | Notes |
|---------|--------|-------|
| city    | string | URL-encoded city name |
| state   | string | Two-letter state (always "FL") |
| status  | string | "Active" or "Inactive" |
| limit   | int    | Vendor uses 500 (API max unknown — no X-Total-Count header returned) |

No native ZIP filter. No cursor/since param. No pagination beyond limit.

Two passes per city (Active + Inactive) = 44 API calls per run across 22 cities.

### Response fields used

Response is a flat JSON array. Fields the vendor reads:

| API field          | Sheet column      | Col # | Notes |
|--------------------|-------------------|-------|-------|
| formattedAddress   | Address           | 5     | Full street address string |
| price              | Price             | 6     | Numeric, list price |
| daysOnMarket       | Days On Market    | 7     | Integer |
| listedDate         | Listed Date       | 8     | ISO date string |
| removedDate        | Removed Date      | 9     | ISO date string, present on Inactive |
| mlsNumber          | MLS Number        | 10    | String, used as dedup key for price-cut detection |

City and state are injected from the request (not taken from the API response).
Status ("Active"/"Inactive") is injected from the request parameter.
Pull date is set to today's ISO date at script runtime.

### Full sheet column layout (1-indexed)

| Col | Header         | Source |
|-----|----------------|--------|
| 1   | Pull Date      | Script (today) |
| 2   | City           | Request param |
| 3   | State          | Request param ("FL") |
| 4   | Status         | Request param ("Active"/"Inactive") |
| 5   | Address        | `formattedAddress` |
| 6   | Price          | `price` |
| 7   | Days On Market | `daysOnMarket` |
| 8   | Listed Date    | `listedDate` |
| 9   | Removed Date   | `removedDate` |
| 10  | MLS Number     | `mlsNumber` |

Row 1: dashboard (schedule / last refresh / next refresh / countdown)
Row 2: headers (frozen)
Row 3+: data

### Color coding

| Color  | Cell       | Condition |
|--------|------------|-----------|
| Green  | Listed Date (col 8) | listedDate starts with today's date |
| Yellow | Price (col 6)       | current price < previous price for same MLS# |
| Red    | Status (col 4)      | status === "Inactive" |

---

## Rent Estimate Endpoint (on-demand, not daily)

`GET https://api.rentcast.io/v1/avm/rent/long-term`

Auth: same `X-Api-Key` header

### Query parameters

| Param   | Type   | Notes |
|---------|--------|-------|
| address | string | Full address, URL-encoded |

### Response fields used

| API field      | Notes |
|----------------|-------|
| rent           | Estimated monthly rent |
| rentRangeLow   | Low end of range |
| rentRangeHigh  | High end of range |
| comparables[]  | Array of rental comps |

Comparables sub-fields:

| API field        | Sheet column |
|------------------|--------------|
| formattedAddress | Address |
| price            | Listed Rent |
| listedDate       | Last Seen (falls back to lastSeenDate) |
| lastSeenDate     | Last Seen (fallback) |
| correlation      | Similarity (displayed as %) |
| distance         | Distance (mi) |
| bedrooms         | Beds |
| bathrooms        | Baths |
| squareFootage    | Sq Ft |
| propertyType     | Type |

Results land in a separate "Rent Comparables" sheet tab, not the main listings tab.

---

## Coverage

22 cities across 4 counties:

Lee: Fort Myers, Cape Coral, Bonita Springs, Estero, Fort Myers Beach, Sanibel, North Fort Myers, Lehigh Acres
Collier: Naples, Marco Island, Immokalee, Golden Gate, Ave Maria
Charlotte: Punta Gorda, Port Charlotte, Rotonda West, Englewood (straddles Charlotte/Sarasota)
Sarasota: Sarasota, Venice, North Port, Nokomis, Siesta Key

Missing vs SWFL 6-county scope: Glades and Hendry counties not covered. Charlotte and Sarasota are included here but not in the platform's 6-county scope (Charlotte 12015, Collier 12021, Glades 12043, Hendry 12051, Lee 12071, Sarasota 12115 — Charlotte and Sarasota ARE in scope). Glades and Hendry have no cities in the vendor feed.
