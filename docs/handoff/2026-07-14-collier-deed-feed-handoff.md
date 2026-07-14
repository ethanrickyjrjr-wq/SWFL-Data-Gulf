# Handoff — find Collier a deed-grade, CURRENT sold-price feed (mirror the Lee lane)

**Date:** 07/14/2026
**Decision (operator, this session):** go straight for the deed feed. **Ship no interim figure.**
**Related:** `docs/handoff/2026-07-14-zip-sold-price-VERDICT.md` (how we got here)
**Checks:** `collier_sold_median_is_a_year_stale` · `leepa_sold_count_undercount_vs_mls`
**Researched with crawl4ai + live probes, 07/14/2026. Not memory.**

## The problem in one paragraph

Lee has a current, deed-grade sold price per ZIP. Collier cannot have one today. Lee reads the
county appraiser's **own live GIS server** (`gissvr.leepa.org`, Layer 10 = "Last Qualified Sale per
parcel") and runs about **6 weeks** behind. Collier reads the **Florida DOR statewide NAL** — the
annual tax roll — which is assessed Jan 1 and submitted mid-year, so `data_lake.collier_parcels` has
**zero 2026 sales; its newest sale is June 2025.** That is not an ingest bug we can fix; it is what an
annual roll *is*. `collier_parcels/constants.py` calls the FDOR feed "the auto-ingestable equivalent
of Lee's LeePA appraiser feed" — on coverage it is, on **freshness it is not**, and that line is the
seed of the whole misunderstanding.

## What NOT to do — and this one is a trap, so read it

**Do not wire `data_lake.market_details_swfl` (realtor.com, via SteadyAPI) as Collier's sold figure.**
It is already ingested, it is current (captured 07/01/2026–07/04/2026), it carries a per-ZIP
`median_sold_price` for both counties, and it will look like the obvious free win. It is not.

Its `median_sold_price` has **no property-type filter** (the vendor exposes property type as a
*search filter*, never as an output field), so it is an all-types median with **vacant land in it** —
the exact $35k land-blend defect our homes-only views were built to avoid.

We proved this by calibrating it against recorded deeds in **Lee**, the one county where we hold both
methods. Across the 34 Lee ZIPs with both:

- 13 of 34 agree within 7% (33904 exact, 33967 exact, 33928 −0.9%) — it is fine in dense, homogeneous, homes-only ZIPs
- **9 of 34 are off by more than 25%**
- Worst: **33972 — realtor.com says $30,000, recorded deeds say $345,000 (−91%).** That is Lehigh Acres vacant land.
- Also bad: 33920 −78% · 33903 −48% · 33921 −48% · 33956 −47% · 33957 +37% · 34134 +30%

The failure mode tracks **thin, coastal, and land-heavy ZIPs** — which is precisely Collier's
character (Marco Island, Everglades City, Immokalee, Big Cypress). Lee, where it looks best, is the
easy county. Collier is the hard one, and we would have **no deed truth there to catch it with.**

A value-index plausibility band (reject if sold falls outside ~55–160% of ZHVI) catches the
catastrophic cases — including a Collier one we would otherwise have shipped blind (**34138, sold at
41% of its value index**) — but it does **not** catch the ±25–50% mid-range errors. A guard that only
catches the disasters is not a license to publish the merely-wrong.

Ship nothing rather than ship that.

## The target: Collier's equivalent of LeePA Layer 10

Find a Collier feed that gives, per parcel: **sale price, sale date, a use/property-type code, and a
situs ZIP** — refreshed on a timescale of weeks, not years. That is all the Lee view needs, and the
whole downstream pipe already exists.

### Leads (probed live 07/14/2026)

- **`maps.collierappraiser.com`** — host **resolves** (404 on `/arcgis/rest/services`, so it exists but the service path differs). Best lead.
- **`gis.colliercountyfl.gov`** — returns **503** on the ArcGIS REST root. Exists; may be blocking or differently pathed.
- **`www.collierappraiser.com/downloads/`** — returns **200** but renders a "Page Unavailable" splash. The site is live and actively maintained (assets cache-busted 07/13/2026), so this path is real but gated.
- **`cor.collierclerk.com`** (302) and **`www.collierclerk.com/records/official-records/`** (301) — Clerk of Courts official records: real-time recorded deeds. A heavier lane (deed documents carry consideration + legal description, but no DOR use code and no clean situs ZIP), so treat as the fallback, not the first try.

### The technique that will actually crack it — don't guess URLs, I already burned that

Every Collier appraiser surface is a **JavaScript app**, which is why crawl4ai returns empty markdown
and why blind URL guessing produced 404s and a splash page. **Use Claude-in-Chrome**: open CCPA's
public property search, run one real parcel search, and **watch the network tab.** The app has to call
*some* data endpoint to render a result — that XHR is the feed. Read its request shape and response
JSON. That is a 20-minute job with a browser and an unbounded one without.

If it turns out to be an ArcGIS service, we already have the ingest pattern (keyset paging on
OBJECTID, `returnIdsOnly` + `objectIds` — see the Lee parcel-subdivision fix, and note per memory
that the Collier `returnIdsOnly` approach works on Lee too, so the two are structurally alike).

## How to validate whatever you find — Lee is the calibration county

Do not trust a new Collier feed on its own say-so. We now have a repeatable method:

1. **Cross-check at county grain.** We already hold `data_lake.redfin_collier_market` — Redfin's
   **current** Collier county median sale price. A correct new ZIP-grain feed must roll up to
   approximately that. (This is how the Lee fix was validated: our new county median $355,298 vs
   Redfin's $360,000 — 1.3% apart.)
2. **Cross-check in the dense ZIPs.** realtor.com is *unreliable in aggregate* but *close in dense
   homes-only ZIPs*. In Naples' dense ZIPs it is a reasonable sanity floor — a new feed disagreeing
   with it by 50% there is a bug in the new feed.
3. **Apply the same shape as Lee.** Homes-only use codes, a >$20k nominal-consideration floor, a
   **rolling 12-month window anchored on max(sale date) in the data** (never `current_date` — every
   one of these feeds lags), a min-N=20 gate with county fallback, and a **`data_through` column** so
   the as-of travels with the number. All of this is already written in
   `docs/sql/20260714_sold_median_recency_window.sql` — copy its Collier half and only swap the source table.

## If no live Collier feed exists

Then say so plainly and stop — do not reach for realtor.com as a consolation prize. The honest floor,
which requires no new ingest, is: publish Redfin's **current Collier county** sold price at county
grain, and keep the deed-based ZIP median while **labelling it "through 06/2025"** using the
`data_through` column that now exists on the view. A correct county number beats a wrong ZIP number.
That was the operator's explicit standard this session.

## What is already done (don't redo it)

- Both sold-median views were fixed to a rolling 12-month window + `data_through` (commit `97f36d82`).
  They were publishing a 2.5-year stock blend, ~6.6% high in a falling market.
- Lee's number is confirmed correct against four independent sources (recorded deeds $337,450 ·
  Redfin $337,000 · Zillow value index $339,699 · realtor.com $340,000 — spread under 1%).
- The `market_details_swfl` dupe bug (exactly 2 rows per ZIP) is tracked separately in
  `market_details_swfl_land_blend_and_dupes`. It is **not** the reason to avoid that table — the
  land-blend is. Fixing the dupes would not make it usable.
