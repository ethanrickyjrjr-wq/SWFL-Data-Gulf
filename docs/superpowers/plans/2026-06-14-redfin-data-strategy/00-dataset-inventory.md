# Redfin Data Center — Full Dataset Inventory

Source: https://www.redfin.com/news/data-center/
S3 base: https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_data_center/

## Available Grains (confirmed live via HEAD probe 2026-06-14)

| Dataset | ZIP monthly | City monthly | Neighborhood monthly | Metro weekly | Metro monthly | Notes |
|---|---|---|---|---|---|---|
| housing_market | 567MB | 479MB | 700MB | 83MB | — | Main tracker — all core metrics |
| price_drops | 318MB | 259MB | 415MB | 39MB | — | Pct active w/drops, avg drop size |
| contract_cancellations | 265MB | 212MB | 356MB | 33MB | — | Cancel rate as % of pending |
| delistings_relistings | 312MB | 254MB | 408MB | 39MB | — | Share delisted/relisted |
| rhpi | — | — | — | — | 0.7MB | Redfin Home Price Index, metro only |
| buyers_and_sellers | — | — | — | — | census regions only | Balance of power |
| luxury | — | — | — | — | metro only | Top 5% market |
| starter_homes | — | — | — | — | metro only | First-time buyer segment |
| investors | — | — | — | — | metro only | Quarterly |
| ehs | — | — | — | — | census regions only | Existing home sales |
| financing_trends | — | — | — | — | metro only | Cash/loan/down payment mix |

## SWFL Confirmed Present

- ZIP: 126 ZIPs, Apr 2019–May 2026 (84 rolling 3-month periods) ✓
- City: Cape Coral FL confirmed at ~60MB offset ✓
- Metro weekly: 746 rows for Cape Coral + Naples MSAs ✓

## Pipelines Already Built (Tier-1 parquet)

- `redfin_price_drops` → `market/redfin_price_drops.parquet`
- `redfin_contract_cancellations` → `market/redfin_contract_cancellations.parquet`
- `redfin_delistings_relistings` → `market/redfin_delistings_relistings.parquet`

## Pipelines Needed

Per grain, per dataset — see `01-proposed-clusters.md` for priority order.
