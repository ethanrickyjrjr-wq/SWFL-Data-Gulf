# Handoff — fix rental contamination in active_listings_residential (tag listing_type)

> **✅ IMPLEMENTED 2026-06-26 — DO NOT re-do this in the active-listings session.** The fix landed
> (extract.py + distill.py + tests + `migrations/20260626_active_listings_listing_type.sql`) and a
> full local scrape re-tagged every live listing. **One correction to the plan below:** the
> `.listing__price-suffix` signal exists ONLY on Sarasota-region cards; Collier-region
> rental cards omit it entirely, so a **price-floor backstop** (residential < $50k ⇒ rent; land never
> reclassified) was added alongside the suffix. Result: fresh for-sale homes = 6,502, median asking
> **$475k** (was a contaminated $315k), DOM 101, min $50k. Open follow-up (separate concern): the
> shared view `active_listings_residential_zip_stats` still filters neither `listing_type` nor
> `scraped_at`, so consumers (incl. the live active-listings-swfl brain) need that to read clean.

**Date:** 2026-06-26
**For:** the session that owns active-listings ingest (`ingest/pipelines/active_listings/`)
**Owner of this finding:** housing-daily-layer session (consumer side; blocked on this)
**Status:** Root cause confirmed against the LIVE source via crawl4ai. Exact edits below. **No ingest code touched by me** (your files — avoiding the parallel-session collision).

---

## One-line

`data_lake.active_listings_residential` mixes **monthly rentals** into the for-sale feed because the normalizer never classifies rent vs sale. The site DOES expose the signal on every card; the scraper throws it away. Capture it → tag `listing_type` → the for-sale median stops being garbage.

## Why it matters (the contamination, quantified)

10,276 active rows today:
- 2,376 `property_type='land'` (median list $39.5k) — already separated, fine.
- ~1,971 `property_type='residential'` rows under $50k are **monthly rentals** ($1,100–$5,500/mo, e.g. "3006 Caring Way Unit 301" @ $1,100) scraped into the for-sale table.
- A handful of `$18`/`$19` junk cards (empty details — broken placeholders).

Effect: region "median list price" reads **$315k**, which is *below* the regional benchmark sold median (~$400k+) — backwards (asking should sit above sold). With rentals/land/junk excluded (`property_type='residential' AND list_price>=50000`): **5,929 listings, median list $485k, median DOM 98 days** — and the median is stable across $25k/$50k/$75k floors ($479.9k/$485k/$489k), so the contamination is entirely the sub-$50k rentals.

**Live-brain bug this also fixes:** `refinery/packs/active-listings-swfl.mts` is RIGHT NOW emitting the contaminated $315k as "SWFL median asking price," and its `grain_boundary.not_available` literally claims `"Rental listings — sale listings only"` — which is false. After this fix that claim becomes true.

## Root cause (one line in distill.py)

`ingest/pipelines/active_listings/distill.py:125`:
```python
"property_type": "land" if (beds is None and "land" in details.lower()) else "residential",
```
That is the ENTIRE classifier: land vs everything-else. No rent/sale distinction exists. A `$1,200/mo` apartment parses as `beds=1` → `"residential"`, rent in the `list_price` column.

## The signal — CONFIRMED on the live cards (crawl4ai, 2026-06-26)

The index card the scraper parses carries a price-suffix span ONLY for rentals:

```html
<!-- RENTAL card (Sarasota p.165, $2,300/mo) -->
<p class="listing__price">
  <span class="listing__price-value" data-usm-currency="">$2,300</span>
  <span class="listing__price-suffix">/<!-- -->month</span>
</p>

<!-- SALE card ($29,995,000) -->
<p class="listing__price">
  <span class="listing__price-value" data-usm-currency="">$29,995,000</span>
</p>
```

- **Rule: `.listing__price-suffix` present & non-empty ⇒ rental; absent ⇒ for-sale.** (BeautifulSoup `get_text(" ", strip=True)` on the suffix yields `"/ month"`.)
- Independent confirmation on the detail page: `<span class="price">Rental Price: $1,195</span>` + JSON-LD `"price":1195`. (Detail pages are NOT fetched per-listing by design — use the card suffix, no extra requests.)
- `extract.py:36, robots note` — the scraper uses the HTTP strategy on the `/listings/` index; this suffix is in that raw HTML (verified, no browser needed).

## Exact edits

### 1. `ingest/pipelines/active_listings/extract.py` — capture the suffix in `_parse_cards`
Add one field to the dict (alongside `list_price`):
```python
"price_suffix": _text(a, ".listing__price-suffix"),   # "/ month" on rentals, None on sales
```

### 2. `ingest/pipelines/active_listings/distill.py` — derive `listing_type` in `normalize()`
After `beds = _int_from(_RE_BEDS, details)`:
```python
suffix = (raw.get("price_suffix") or "").strip()
listing_type = "rent" if suffix else "sale"   # any per-period suffix (/month, /week, /season) = rental
```
Add to the emitted row dict:
```python
"listing_type": listing_type,
```
And drop broken placeholder cards (the `$18`/`$19` junk) — skip a row that has no detail at all AND a nonsensical price:
```python
list_price = _num(raw.get("list_price"))
if listing_type == "sale" and (list_price is None or list_price < 1000) and not details:
    continue   # broken placeholder card, not a real listing
```

### 3. Migration (idempotent — run directly per RULE 1; verify row count after)
```sql
ALTER TABLE data_lake.active_listings_residential
  ADD COLUMN IF NOT EXISTS listing_type text;

-- One-time backfill of EXISTING rows (historical rows never stored the suffix).
-- Price-band cleanup; the next daily scrape overwrites listing_type from the REAL
-- suffix for every re-seen mls_id (the upsert ON CONFLICT updates all columns).
UPDATE data_lake.active_listings_residential
  SET listing_type = CASE WHEN list_price < 25000 THEN 'rent' ELSE 'sale' END
  WHERE listing_type IS NULL;
```
(25k threshold: nothing real sits between the top rental ~$5.5k/mo and the cheapest home ~$50k.)

### 4. `distill.py` `upsert_rows` — add `listing_type` to INSERT columns, VALUES, and `ON CONFLICT DO UPDATE SET` (so a re-seen rental flips correctly if it ever changes).

### 5. Test (`ingest/tests/.../test_active_listings.py`)
- a card raw dict with `price_suffix="/ month"` → normalized `listing_type == "rent"`.
- a card with no `price_suffix` → `listing_type == "sale"`.
- a `$18` no-details no-suffix card → dropped.

## Out of scope for you (the consumer side — I do this AFTER your fix lands)

- The for-sale aggregation view + the `housing-swfl` daily layer read `listing_type='sale' AND property_type='residential'`. I'll create the filtered view (`..._forsale_zip_stats` or update the shared `active_listings_residential_zip_stats` — we'll coordinate so active-listings-swfl drops rentals too, which its own caveat already promises).
- Do NOT build the housing pack — that's mine, gated on this.

## Verify after fix
```sql
SELECT listing_type, property_type, count(*),
       median(list_price) FILTER (WHERE list_price>=1000) AS med
FROM pg.data_lake.active_listings_residential GROUP BY 1,2 ORDER BY 3 DESC;
-- expect: residential/sale median ~$485k; residential/rent in the $1k–$5.5k band.
```

## Evidence trail
Confirmed live via crawl4ai (HTTP strategy, home IP) 2026-06-26: index cards (Sarasota p.1 sale, p.150/165 rentals, p.175 junk) + rental detail page. The `.listing__price-suffix` element is the load-bearing signal; the `/mo`-on-price-value idea was checked and is WRONG (the suffix is a separate sibling span).
