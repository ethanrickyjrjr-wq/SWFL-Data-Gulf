# Realtor.com Data Library — SWFL ZIP Ingest

**Status:** Spec (ready to build)
**Date:** 2026-06-27
**Prompted by:** FGCU RERI dashboard uses this exact source; we need the same data to power homepage hero cards, map pills, and ZIP reports with real YoY context.

---

## What FGCU RERI Is Doing

FGCU's Regional Economic Research Institute publishes a "Residential Active Listings" dashboard at `https://www.fgcu.edu/cob/reri/dashboard/active-listings`. The page footer says:

> **Source: Realtor.com residential listings database**
> Note: Southwest Florida includes Charlotte, Collier, Glades, Hendry and Lee counties.

Their dashboard is a static chart with no drill-down, no ZIP-level view, no deliverable. Same public data we can pull directly.

---

## The Source

**URL:** `https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_Zip_History.csv`

**License:** Attribution-only (cite "Realtor.com"). Free for any use including commercial. No API key needed.
**Grain:** ZIP code × month (monthly history)
**Coverage:** All US ZIP codes with sufficient data
**Update cadence:** Monthly — new month typically drops ~3rd week of following month
**File size:** ~100MB+ (full national history)

---

## Columns (verified from header)

| Column | What it is | Use |
|--------|-----------|-----|
| `month_date_yyyymm` | Month (e.g. 202605 = May 2026) | Time filter |
| `postal_code` | 5-digit ZIP | Join key |
| `zip_name` | Place name | Labels |
| `median_listing_price` | Median asking price | Map pill, hero card |
| `median_listing_price_yy` | YoY % change | Chip on hero card |
| `active_listing_count` | # active listings | Map choropleth, hero card |
| `active_listing_count_yy` | YoY % change | Trend chip |
| `median_days_on_market` | Median DOM | **The missing DOM column** |
| `median_days_on_market_yy` | YoY DOM change | Trend chip |
| `new_listing_count` | New listings this month | Fresh supply signal |
| `new_listing_count_yy` | YoY new listings | |
| `price_reduced_count` | # homes with price cuts | Buyer opportunity signal |
| `price_reduced_share` | % of listings with cuts | Market softness |
| `price_increased_count` | # homes with price increases | Seller strength |
| `pending_listing_count` | # pending | Absorption |
| `pending_ratio` | pending / active | Absorption speed |
| `pending_ratio_yy` | YoY pending ratio | |
| `median_listing_price_per_square_foot` | $/sqft | Price quality |
| `median_square_feet` | Median home size | |
| `average_listing_price` | Average (vs median) | |
| `total_listing_count` | Total (active + pending) | |
| `quality_flag` | 1.0 = reliable data | Filter on this |

---

## What This Unlocks for the Homepage

With this data in the lake, every hero card gets a **YoY chip** and every map pill shows **real context**:

**Map pill "Homes for Sale":**
- Choropleth: `active_listing_count` per ZIP
- Rail on click: count + `active_listing_count_yy` chip ("↑12% vs last year")

**Map pill new "Days on Market":**
- Choropleth: `median_days_on_market` per ZIP (hotter = darker)
- This is the DOM we've been leaving NULL

**Hero card 1:**
- "X homes for sale" + `active_listing_count_yy` chip (YoY direction)

**Hero card 2:**
- "$X median asking" + `median_listing_price_yy` chip

**Hero card 3 (new — price cuts):**
- "X% of listings cut their price" — buyer opportunity signal
- Uses `price_reduced_share` regionwide

**Stats bar:**
- Can add: median DOM, pending ratio (how fast homes are absorbing)

**ZIP report pages:**
- Every ZIP gets DOM, price cut rate, pending ratio, YoY for all metrics

---

## Ingest Plan

### Step 1 — Download filter (Python script)

The file is ~100MB. Don't load into memory. Stream-filter to SWFL ZIPs as it downloads, write a compact SWFL-only CSV.

```python
# ingest/pipelines/realtor_zip/extract.py
import csv, urllib.request, io

SWFL_ZIPS = {...}  # from fixtures/swfl-zip-county.json
URL = "https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_Zip_History.csv"

def extract_swfl(output_path):
    req = urllib.request.Request(URL, headers={"User-Agent": "SWFL-Data-Gulf/1.0"})
    with urllib.request.urlopen(req) as f, open(output_path, "w", newline="") as out:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))
        writer = None
        for row in reader:
            if row["postal_code"] in SWFL_ZIPS and float(row.get("quality_flag") or 0) >= 1.0:
                if writer is None:
                    writer = csv.DictWriter(out, fieldnames=reader.fieldnames)
                    writer.writeheader()
                writer.writerow(row)
```

### Step 2 — Supabase table

```sql
-- migrations/20260627_realtor_zip_metrics.sql
CREATE TABLE IF NOT EXISTS data_lake.realtor_zip_metrics (
    month_date        date NOT NULL,          -- first day of month
    zip_code          text NOT NULL,
    median_list_price bigint,
    median_list_price_yy numeric(8,4),
    active_listing_count int,
    active_listing_count_yy numeric(8,4),
    median_days_on_market int,
    median_days_on_market_yy numeric(8,4),
    new_listing_count int,
    new_listing_count_yy numeric(8,4),
    price_reduced_count int,
    price_reduced_share numeric(6,4),
    price_increased_count int,
    price_increased_share numeric(6,4),
    pending_listing_count int,
    pending_ratio numeric(6,4),
    pending_ratio_yy numeric(8,4),
    median_sqft int,
    avg_list_price bigint,
    total_listing_count int,
    ingested_at timestamptz DEFAULT now(),
    PRIMARY KEY (month_date, zip_code)
);
GRANT SELECT ON data_lake.realtor_zip_metrics TO service_role;
NOTIFY pgrst, 'reload schema';
```

### Step 3 — Load script (idempotent UPSERT)

Monthly run: download → filter → upsert. Full history on first run, only latest month thereafter.

### Step 4 — Brain

New pack: `realtor-market-swfl` — reads `realtor_zip_metrics` for latest month, surfaces:
- Regional: median DOM, price cut %, pending ratio
- County: same breakdown
- ZIP detail_tables: per-ZIP DOM + price cut rate

### Step 5 — Homepage wiring

- Add `"days_on_market"` as a 5th map pill pulling `median_days_on_market` per ZIP
- Hero card 1 gets `active_listing_count_yy` chip: "↑8% YoY"
- Hero card 2 gets `median_listing_price_yy` chip
- New hero card 3: "X% of SWFL homes cut their price this month"

---

## Why We Beat FGCU RERI

| FGCU RERI | SWFL Data Gulf |
|-----------|----------------|
| Static chart, county-level | Interactive map, ZIP-level drill |
| No deliverable | "Build market report" → AI writes it |
| Monthly refresh, no automation | Daily listing data + monthly Realtor.com overlay |
| No DOM, no price cuts shown | Full dashboard: DOM, cuts, pending ratio, YoY |
| No user personalization | Saved ZIPs, client reports, auto-send |

---

## Data citation

> Active listing data: Realtor.com residential listings database, via SWFL Data Gulf.

---

## Next steps

1. Run `extract.py` locally — filters ~100MB to ~5MB SWFL CSV
2. Write migration + load script
3. Build `realtor-market-swfl` pack
4. Wire to homepage hero cards + add DOM pill
5. Monthly cron in GHA (runs ~3rd week of month, after Realtor.com update)
