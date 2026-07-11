# SWFL Data Desk — live market terminal at /desk (Spec A: product + money path)

**Date:** 2026-07-11 · **Check:** `swfl_data_desk_live_verify` · **Slug:** `swfl-data-desk`
**Companion:** Spec B — `2026-07-11-desk-discovery-flywheel-design.md` (GEO / Dataset schema /
embeddable widget / llms.txt / robots decision — cross-cutting, applies to /r/* too).
**Origin:** parked idea `desk_showpiece_parked`, unblocked once /charts glow-up landed. Operator
picked full-terminal scope + `/desk` route (07/10/2026), then asked for deep research on whether
this earns paying users / brand / AI-discovery / deliverable reuse, or is just eye candy.

## The verdict (why we build it)

**Not eye candy — but only if we build the connective tissue, not just the pretty terminal.**
The research (4 parallel streams: design, GEO/growth, SteadyAPI capability, deliverable reuse)
converged on one answer: the desk is worth building because it is three compounding assets at
once — **(1)** a live product demo that funnels into our existing free-build → paid-send paywall,
**(2)** a uniquely-cited daily dataset that is the highest-value content type for AI citation and
the proven backlink-magnet pattern (Redfin Data Center / Zillow Research), and **(3)** a
first-class research input, because the desk reads the same `data_lake` views the deliverable
engine grounds on. **The make-or-break:** without the filing bridge (below), the desk is a
beautiful dead-end — the one reuse path that works on a greenfield page (the site-wide
highlighter) strips provenance and files sourceless numbers. With it, every desk figure becomes
"pin this to my weekly client email," auto-refreshed and gate-checked each send. So the filing
bridge is **core Phase 1, not a deferred nicety.**

## Goal

One dark, data-dense page at `/desk` ("SWFL Data Desk") that reads like a live market terminal
AND is wired into the deliverable funnel. Every number real, cited, and carrying **its own** as-of
date (the feeds have different vintages — never one blended "our data" stamp). The "live" feel is
honest motion (scroll, count-up, on-load line-draw) over daily-fresh data plus revalidate — never
synthetic ticks. The page is a **server component** that renders real values into SSR HTML (so the
numbers are real for users AND readable by the AI crawlers we allow — client-hydrated numbers are
invisible to them).

## Data sources — verified live 07/10/2026 (corrected from the first draft)

Correction that governs the build: the inventory KPI must NOT come from
`active_listings_residential` — that is a legacy scrape covering out-of-scope Charlotte/Sarasota
with an untrusted, inflated days-on-market column. Use the SteadyAPI spine and its aggregate views.

- **`data_lake.listing_state`** — the SteadyAPI spine. 34,405 rows, 29,413 active across 67 core
  ZIPs (Lee/Collier/Hendry), fresh daily (07/10/2026). Per-listing fill (active): photo 99%,
  lat/lon 99%, list_price ~100%, beds 72%, sqft 69%, `reduced_amount` 45% (13,137 rows). Flags:
  price_reduced 4,632, new_construction 4,293, pending 4,276, new_listing 2,347, foreclosure 129.
  **No days-on-market, no listed_date, no baths (0.3%)** — DROP any DOM zone; the spine can't feed it.
- **`data_lake.listing_transitions`** — the daily event/flow log. Fresh 07/10; real (non-seed)
  flow spans 07/01–07/10. Fields: `from_state→to_state`, `price`, `price_delta`, `sold_price`,
  `sold_date`, `seed`, `days_in_prev_state`. Example day (07/08/2026): 309 new · 488 price-cuts ·
  703 → holding · 9 sold.
- **`data_lake.listing_active_stats`** (per ZIP+county): `median_list_price`, `avg_list_price`,
  `listing_count`. Market median list $339,000 (Lee $295,945 / Collier $610,000), fresh 07/10.
- **`data_lake.listing_momentum_stats`** (per ZIP+county): `price_reduced_share`,
  `new_listing_share`, `active_listing_count`. Market 15.7% reduced / 8% new, fresh 07/10.
- **`data_lake.daily_truth`** — web-verified metric table (NOT listings). `median_sale_price` for
  57 areas + `mortgage_30yr_fixed`, fresh 07/10. Independent lane; cite as web-verified. ~2 months
  deep, so any price line is a real but short window — label it, don't pad.
- **`data_lake.news_articles_swfl`** — daily headlines through 07/10; low volume (94 rows) → the
  feed must be empty-tolerant, show most-recent N regardless of day.
- **`data_lake.market_details_swfl_latest`** — market-temperature gauge (reuse `MarketTemperatureGauge`).

## Honesty guardrails (non-negotiable — the whole value prop is credibility)

- **Per-zone as-of, never one global stamp.** Spine 07/10, daily_truth 07/10, momentum 07/10,
  histogram 07/06 — each zone shows its own MM/DD/YYYY. Blending them into one "as of" is a lie.
- **Partial-scan annotation on the Daily Market Pulse.** Some days are incomplete sweeps (e.g.
  07/07 showed only 3 new — an incomplete scan, not a market lull). Detect low-coverage days and
  label them, or the flagship zone quietly discredits the page.
- **"Holding" is an ambiguous departure, never "sold"/"delisted".** The state machine does not
  assert why a listing left active.
- **Solds = "recent notable closings" with the luxury caveat.** The sold set is budget-sampled,
  prioritized by highest list price (median sampled sold ~$1.975M vs. market median list ~$339K).
  Never label it market median sale price. Each sold carries its honesty tag (`sold` vs
  `sold_price_pending` vs `last_list`, per `lib/listings/sold-price.ts`).
- **Provenance scrub (reuse comp-helper's path):** citation says "SWFL Data Gulf" (+ realtor.com
  homepage optionally); NEVER the vendor name, an MLS number, a permalink, or internal
  `property_id`. **Photos via the watermark path** (`lib/media/listing-photo`), never the raw CDN URL.
- **Clamp outliers:** e.g. one `reduced_amount` = $222M is a bad row — lead with median, not max/avg.
- Every figure real + sourced; a dead feed hides its zone, never fabricates. No system nouns /
  internal IDs / raw freshness tokens in visible copy. Up/down uses the gulf palette (mangrove/coral
  direction), never stock red/green, and delta is always paired with an arrow — never color alone.

## Zones — Phase 1a (the terminal)

1. **Wire ticker** — daily median price per city + 30-yr mortgage (day-over-day ▲/▼ from
   `daily_truth`) + today's pulse counts (new / price-cut / sold from `listing_transitions`).
   CSS scroll, `prefers-reduced-motion` pauses.
2. **Liveness header** — "SWFL DATA DESK · ● LIVE"; ● tooltip = "freshest daily data; updated
   <formatted date>". Per-zone as-of stamps live in each zone, not here.
3. **Hero — stat-hero + gradient area (default).** Big count-up median price + ▲/▼ delta over a
   gradient-filled `daily_truth` trend (reuse `AreaChart` gradient + `ChartStatFlow` — both
   vendored, zero new component). Secondary tab: **rebased % change from day-0** for the 3 cities
   (reuse Profit/Loss Line with 0 = baseline, so a short window reads as "who's outperforming").
4. **KPI stat-flow row** — median list price (`listing_active_stats`), active listings core-67
   (`listing_state`), price-reduced share (`listing_momentum_stats`), 30-yr mortgage
   (`daily_truth`), new-vs-sold today (`listing_transitions`). Count-up via `@number-flow/react`.
   No DOM tile.
5. **Daily Market Pulse** (flagship) — new / price-cut / departures / sold per day from
   `listing_transitions`; partial-scan + "holding = ambiguous departure" labeling baked in.
6. **Movers board** — top/bottom core ZIPs by price-reduced share / new-listing share / median
   list (`listing_momentum_stats` + `listing_active_stats`). Horizontal Bar or delta+sparkline rows.
7. **Flash feed** — `news_articles_swfl` headlines interleaved with notable listing events
   (price cuts; recent notable closings with the luxury caveat). Timestamped, severity-tagged,
   empty-tolerant.
8. **Gauge cluster** — market-temperature (existing `MarketTemperatureGauge`) + a price-reduced-share
   / inventory gauge (reuse vendored `Gauge`).

## Filing bridge — Phase 1b (the money path, CORE not optional)

Everything reuses `ProjectItem` (`lib/project/items.ts`) and the existing deliverable engine.

1. **`DeskHighlightBridge`** — twin of `ReportHighlightBridge`; publishes each KPI/zone datum's
   `label / value / sourceLabel / asOf` to `report-context-store` so the already-site-wide
   "File this figure" captures **real provenance** instead of an empty token. Highest leverage,
   ~1 component.
2. **Frame-backed "pin" on brain-backed tiles.** Active-listings count, busiest ZIP, and metro
   home-value/rent are mirrored by brains (`active-listings-swfl.mts` emits
   `key_metrics.active_listings_count_swfl` + `detail_tables.active_listings_by_zip`; ZHVI/ZORI
   likewise). File these as **`frame`** items (`brain_id`, `frame_id`, `metric_keys`) — they
   re-bind live at every send via `bindFrameSpec`, unchanged. This is the flywheel: "pin this to
   my weekly client email" → `deliverableToScheduleRecipe` → auto-refreshed, gate-checked send.
3. **Register desk charts for save.** Add desk chart rootIds to `PANEL_CONFIGS`
   (`lib/charts/gallery-loaders.ts`) and drop `AddChartToProject` beside each desk chart → frozen
   `chart` path via `saved_charts` works.
4. **"Turn this into a branded report" CTA** per module → the free build flow (the PLG wedge;
   the showpiece is a live demo, free build → paid send is the paywall).

Pure lake-view desk-only data (news story-count) is frozen-snapshot only unless later routed
through a brain or `bindFrameSpec` is extended to accept a lake-view source (RULE C2: extend the
binder seam, don't erect a new gate).

## Refresh & motion (honest "live")

Server component, `export const revalidate = 300`. Motion is presentational: ticker + feed scroll
(CSS), KPI count-ups on mount (200–400 ms), hero line-draw once (`chart-reveal-clip`). Pair every
delta with an arrow + label. Offer a pause/snapshot control. No client polling implying real-time;
no synthetic movement; `prefers-reduced-motion` disables scroll/count-up. Dark-mode density rules:
base `#0A0A0A–#111827`, elevation by 1px border not shadow, off-white text (`#F3F4F6`), tabular
numerals so count-up digits don't shift width.

## Seams for Spec B (build A so B is a bolt-on, not a rewrite)

Spec A must leave these hooks in place so the discovery/backlink flywheel needs no reshaping of
the desk:

- **Numbers live in SSR HTML.** The page is a server component; every figure + as-of is rendered
  server-side (client components only animate what the server already emitted). B's whole
  citability premise depends on this — never hydrate a number from a client fetch.
- **Per-zone provenance contract.** Every zone loader returns a typed result carrying
  `{ label, value, unit, sourceLabel, asOf }` plus an optional `takeaway?: string` (empty in A).
  B fills the takeaway with the quotable one-liner and reads the same shape to emit Dataset
  `variableMeasured` and the embed payload — no loader reshaping.
- **Emit the existing Dataset JSON-LD on /desk from day 1** (reuse `lib/jsonld.ts`, even minimal).
  B enriches it (temporalCoverage / spatialCoverage / license); the hook must already be wired.
- **Shared "turn this into a report" CTA slot** (Spec A Phase 1b builds it; B reuses it for the
  email-capture / deep-link variants).
- **Each zone is a standalone component reading one loader**, so B's embeddable attributed widget
  can reuse a single zone (e.g., the price ticker) without extracting it from the page.
- **Leave /desk fully indexable** (no `noindex`), so B's robots decision is a pure `robots.ts`
  edit with nothing to undo on the page.

## Out of scope (v2 additive — named to control sprawl)

Watchlist (pinned ZIPs), ⌘K command bar, ZIP×metric correlation heatmap, mini-map choropleth
(Mapbox), threshold-alert rail (condition-driven, distinct from the chronological feed), price-band
affordability histogram, new-construction/foreclosure filter tabs, STORMS/PERMITS tabs, flash-event
→ project-item bridge. All are real ideas; deferred to keep Phase 1 shippable.

## Phasing

- **1a — terminal:** zones 1–8, corrected sources, per-zone as-of + partial-scan honesty, SSR
  numbers, reuse existing Dataset JSON-LD from `lib/jsonld.ts` on /desk.
- **1b — filing bridge:** DeskHighlightBridge, frame-backed pins, chart-save registration, "turn
  into report" CTA. Ship close behind 1a; the ROI case needs it.
- Discovery/backlink flywheel (Dataset schema extension, widget, llms.txt, robots) → **Spec B**.

## Verification (closes `swfl_data_desk_live_verify`)

Live-verify deployed `/desk`: all zones render real values; each shows its OWN as-of MM/DD/YYYY
and named source; Daily Market Pulse annotates partial-scan days; solds labeled "notable closings"
with luxury caveat, never market-median; inventory sourced from `listing_state` (67 core ZIPs, not
the legacy scrape); no DOM tile; photos watermarked; provenance scrub holds (no vendor/MLS#/IDs);
filing bridge works end-to-end (pin a brain-backed tile → schedule → a send re-binds fresh);
numbers present in SSR HTML; `prefers-reduced-motion` honored. Browser screenshot + a11y snapshot
as prod evidence.
