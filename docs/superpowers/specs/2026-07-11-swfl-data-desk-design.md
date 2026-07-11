# SWFL Data Desk — live market terminal page (/desk)

**Date:** 2026-07-11 · **Check:** `swfl_data_desk_live_verify` · **Slug:** `swfl-data-desk`
**Origin:** parked idea `desk_showpiece_parked`, unblocked once the /charts glow-up landed
(it reuses the vendored bklit components). Operator picked the full-terminal scope and the
`/desk` route on 07/10/2026.

## Problem

We have genuinely daily-refreshing SWFL data — daily sourced median sale prices, a daily
mortgage rate, a daily listing state-machine (new / price-cut / sold), daily news — but nowhere
that shows it off with any energy. /charts is a good static panel page; it does not feel alive,
and it does not surface the daily event stream at all. The brand wants a showpiece: a
Bloomberg-terminal-style "data desk" that makes the platform's data depth feel live — without
faking a real-time market feed we don't have.

## Goal

One dark, data-dense page at `/desk` ("SWFL Data Desk") that reads like a live market terminal:
a scrolling wire ticker, a liveness header, category tabs, a count-up KPI row, a hero price line
with a gauge cluster, and a timestamped flash feed. Every number is real, cited, and as-of
stamped; the "live" feel comes from honest motion (scroll, count-up, animated line draw) over
daily-fresh data plus page revalidation — never from synthetic ticks.

## Research findings (crawl4ai, 07/10/2026)

Crawled real professional references (RULE 0.4). Sources and what we took:

- **MARKETWIRE live terminal** (`marketwire-terminal.com`) — concrete anatomy of a working live
  terminal: a horizontally-scrolling top ticker of symbols with ▲/▼ colored deltas (repeated for
  seamless loop); a `● LIVE` badge + dual clocks; category tabs (ALL / EQUITIES / MACRO / CRYPTO
  / FX); a KPI tile grid; and a timestamped news-flash feed with severity tags (FLASH / URGENT /
  BREAKING). A "25s NEWS REFRESH / 100% WEB SOURCED" liveness line. This is the template our six
  zones map onto.
- **Fintech/trading dashboard pattern catalog** (`adminlte.io/blog/fintech-banking-dashboard-templates`,
  2026) — the standard finance-desk surfaces are KPI/net-worth tiles, a cash-flow line, a
  transactions feed, and (for trading) P&L-by-desk + yield curve. Dark-first, data-dense is the
  Bloomberg-terminal signature. Confirms our KPI-row + line + feed decomposition is the
  professional norm, and that `@number-flow`-style count-ups and reveal animation are expected.
- **Bloomberg Terminal UX ("conceal complexity")** — bot-walled on fetch, but the well-known
  principle we adopt: extreme density is fine if complexity is progressively disclosed
  (hover-for-detail, tabs to filter), not dumped at once.
- Award-end references for the "cool" bar (Awwwards data-visualization collection, 2026 Webby
  best-data-visualization winners) — noted for visual polish direction, not copied.

**Translation to our context:** a real-estate market desk, not a trading terminal. Stock tickers
→ SWFL daily prices + mortgage + listing events; equities red/green → mangrove/coral (our design
language forbids stock red/green); "streaming" → daily-fresh + revalidate, honestly stamped.

## Data — verified live in the lake (07/10/2026)

Every zone is backed by a table confirmed present and current (latest row 07/10/2026):

- **`data_lake.daily_truth`** (17 cols; `metric_key, area, period, value, unit, source_url,
  source_title, retrieved_at, ...`). Recent metrics present in the last 4 days:
  `median_sale_price` for `cape_coral` / `fort_myers` / `naples`, and `mortgage_30yr_fixed:swfl`.
  **Caveat:** 61 rows total — the daily feed is ~2 months deep (started ~early May 2026). The
  hero line shows a real but short window; label it, do not pad it.
- **`data_lake.listing_transitions`** (15 cols; `from_state, to_state, "at", price, price_delta,
  sold_price, sold_date, address_key, ...`). 48,179 rows, current. Recent transitions include
  `active→sold`, `active→holding`, `holding→active`. Event definitions for the wire:
  - **SOLD** = `to_state = 'sold'` (has `sold_price` / `sold_date`).
  - **PRICE CUT** = `price_delta < 0` on an active listing.
  - **NEW** = first appearance as active (`to_state = 'active'` from a seed/new/empty prior
    state) — confirm exact `from_state` sentinel for new during implementation.
- **`data_lake.active_listings_residential`** (20 cols; `list_price, days_on_market, status,
  zip_code, county, scraped_at, ...`). 38,728 rows across 92 ZIPs, current. **Caveat:** 92 ZIPs
  includes non-core; apply the same core-scope (57) filter /charts uses (`refinery/lib/core-scope.mts`,
  `isCoreScope`) for any "SWFL" count so we don't inflate inventory with Sarasota/Charlotte.
- **`data_lake.news_articles_swfl`** (11 cols; `headline, article_url, source_name,
  published_date, scraped_at, swfl_relevance, ...`). Published through 07/10/2026. **Caveat:**
  94 rows total — sparse. The flash feed must be empty-tolerant and show the most-recent N
  regardless of day, never require a per-day minimum.

Market-temperature gauge already live from `data_lake.market_details_swfl_latest` (reuse the
existing `MarketTemperatureGauge`).

## What we're building — six zones (top → bottom)

1. **Wire ticker** — a horizontally-scrolling strip. Content: per-city median price + 30-yr
   mortgage (each with a real day-over-day ▲/▼ delta from `daily_truth`), plus today's NEW /
   PRICE CUT / SOLD counts from `listing_transitions`. Colored mangrove (up) / coral (down),
   never stock red/green. Duplicated track for a seamless CSS scroll loop. Respects
   `prefers-reduced-motion` (pauses).
2. **Liveness header** — "SWFL DATA DESK · as of MM/DD/YYYY · ● LIVE". The `● LIVE` carries a
   one-line tooltip: "freshest daily data; last refreshed <token>" (proof-of-live, data protocol
   v3 rule 2). No raw `SWFL-…-YYYYMMDD` token in visible copy — formatted date only.
3. **Category tabs** — ALL / PRICES / LISTINGS / MORTGAGE / NEWS. Filter which zones/feed rows
   show. STORMS and PERMITS are intentionally excluded (historical/periodic, not daily — they
   stay on /charts; including them would dilute the live frame).
4. **KPI stat-flow row** — tiles: median sale price, active listings (core-scope 57), median
   days-on-market, 30-yr mortgage, new-vs-sold today. Each: real value + ▲/▼ delta + as-of.
   Count-up animation on mount via `@number-flow/react` (already vendored).
5. **Hero live line + gauge cluster** — the `daily_truth` median-price line (3 cities), animated
   draw on load (vendored bklit `Line` / `LineChart` with its built-in reveal), ~2-month window
   labeled honestly; beside it a gauge cluster (market temperature + mortgage + active-inventory)
   using the vendored `Gauge`.
6. **Flash feed** — `news_articles_swfl` headlines interleaved with `listing_transitions` events,
   newest first, each timestamped (MM/DD/YYYY) and severity-tagged (NEW / PRICE CUT / SOLD /
   NEWS). Empty-tolerant: a zone with no fresh rows hides itself; never sample data.

## Components — reuse vs. new build

- **Reuse (no new vendoring):** `MarketTemperatureGauge`, the vendored bklit `Gauge` +
  `Line`/`LineChart`, `@number-flow/react`. **Do NOT vendor bklit "Live Line"** — our data is
  daily, so an animated `Line` draw + page revalidate is the honest equivalent; a streaming
  component would imply ticks we don't have. (Operator confirmed 07/10/2026.)
- **New components (client):** `WireTicker` (CSS-scroll strip), `FlashFeed` (timestamped
  severity-tagged list), `DeskKpiRow` (count-up stat tiles), `DeskTabs` (category filter),
  and the `/desk` page server component that composes them.
- **New server loaders** (in `app/desk/` or `lib/desk/`, mirroring /charts loader style —
  service-role client, `data_lake` schema, empty-tolerant try/catch, paginate over the 1000-row
  PostgREST cap where needed):
  - daily price line + mortgage series from `daily_truth`
  - ticker deltas (latest vs prior day per metric) from `daily_truth` + today's event counts from
    `listing_transitions`
  - KPI aggregates (active count core-scope, median DOM, latest price, mortgage, new/sold today)
  - flash feed (recent news + recent transitions, merged + sorted)

## Refresh & motion (honest "live")

Server component with `export const revalidate = 300` (5 min) so each visit reflects the day's
freshest data. All motion is presentational: ticker + feed scroll via CSS; KPI numbers count up
on mount; the hero line draws itself once. No client polling that implies real-time; no synthetic
value movement. `prefers-reduced-motion` disables scroll/count-up.

## Honesty guardrails (rules of engagement)

- Every figure names a real source + carries an as-of MM/DD/YYYY (stated once per zone). No
  invented numbers — a gap hides its element, never fabricates (RULE 0.7 four-lane; FOCUS rule 1).
- Deltas are real day-over-day moves from `daily_truth` / `listing_state`, never synthetic ticks.
- Core-scope (57) on every "SWFL" ZIP count (`isCoreScope`).
- Mangrove/coral for up/down, never stock red/green.
- `● LIVE` means freshest-daily + last-refreshed stamp, disclosed in the tooltip — not a claim of
  a streaming market feed.
- No system nouns / internal IDs / raw freshness tokens in visible copy.

## Out of scope (v2)

- STORMS / PERMITS tabs; per-ZIP drill from a ticker row; "add to project" on desk zones;
  a homepage-embeddable ticker band (component C from brainstorm); social/OG card of the desk.
- Vendoring bklit Live Line (revisit only if a genuinely streaming feed lands).

## Verification plan (closes `swfl_data_desk_live_verify`)

Live-verify on the deployed `/desk`: all six zones render with real values; ticker scrolls with
real deltas; KPI numbers count up to verified figures; hero line draws the `daily_truth` series;
flash feed shows real dated news/events; every zone shows an as-of MM/DD/YYYY and named source;
empty-tolerance confirmed (no sample data on a dead feed); `prefers-reduced-motion` honored.
Browser screenshot + a11y snapshot as artifact-level evidence (prod evidence, not dev attestation).
