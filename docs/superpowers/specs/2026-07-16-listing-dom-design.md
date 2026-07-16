# Per-listing days on market off the observation spine (spell + cumulative)

**Date:** 2026-07-16 · **Check:** `listing_dom_live_verify` (companion `listing_dom_from_first_seen` closes at calibration promotion — §5)
**Approved by operator in-session 07/16/2026** (approach A of 3; surfaces + semantics chosen via Q&A).

## Problem

The vendor's daily `/search` sweep carries no per-listing list date (live-verified 07/07/2026 and
07/16/2026 — see `docs/steadyapi-capability-census.md` §4), and the vendor only sells an aggregate
`median_days_on_market`. So no surface can say "62 days on market" about a specific listing — the
single number a buyer/seller most expects, and (operator) "a big indicator in the right algos."

What we DO hold (evidence, lake query 07/16/2026):

- `listing_state.first_seen` — stamped on insert, preserved across merges (`distill.py upsert_state`).
  31,969 api_feed rows. Sweep coverage ramped 06/27→07/03; from 07/04 onward the steady ~50–300
  rows/day are true arrivals, so `first_seen` = the day the listing arrived on realtor.com ±1 day.
  ~30,200 rows first seen on/before 07/03/2026 are CENSORED — first_seen is the day our sweep reached
  them, not the day they listed (live example: 14977 Rivers Edge Ct #217, 33908 — our first_seen
  07/01, realtor.com shows 62 days).
- `listing_state.listed_date` — vendor truth for the CURRENT spell, persisted since commit `81e203f6`
  (07/16) off the `/property-tax-history` probes we already pay for (departures / holding rechecks /
  sold backfill). Opportunistic coverage; 0 rows populated until the first nightly run after that
  commit lands.
- `listing_transitions` — relists observable as `from_state = 'holding'` transitions
  (address_key is deliberately stable across relists — `address_key.py`).

## Research the design leans on (RULE 0.4, fetched 07/16/2026)

- realtor.com's counter ("days on Realtor.com"): starts when the data source provides a new listing,
  does NOT restart when a listing is pulled and returns under the same listing ID, DOES restart under
  a new listing ID, and keeps counting through pending (realtor.com spokesperson, via Brick
  Underground, "How accurate is the 'days on market' data...", crawl4ai fetch — local scratchpad,
  never committed). https://www.brickunderground.com/buy/days-on-market-counters
- MLS practice distinguishes DOM (current listing, resets on relist) from CDOM (cumulative across
  relists; reset only after 30–90 days off-market depending on the board). Most MLSs PAUSE DOM during
  pending — realtor.com does not; we match realtor.com because that's the number users cross-check.
  Sources: armls.com/days-on-market-calculations, support.canopymls.com DOM/CDOM vendor guide,
  onekeymls.com status/DOM impact article.
- Vendor field semantics: `property_history[].listing.list_date`; our extraction
  (`_pick_listed_date`, `extract_api.py`) takes the most recent "Listed" event — current-spell
  semantics, the same anchor realtor.com uses.

## Decisions (operator, 07/16/2026)

1. **Both numbers, spell as headline.** `dom_days` (current spell — matches what realtor.com shows;
   never contradicts the portal a client has open) + `cdom_days` (cumulative across relists — the
   anti-manipulation number, for analysis/sell-side framing).
2. **Censored back catalog: floor + probe-on-use.** Bulk contexts render an honest floor ("15+
   days"). A censored listing surfaced anywhere user-facing gets ONE `/property-tax-history` call to
   fetch its true list date, persisted forever. No bulk backfill (~30k calls rejected as unnecessary;
   cohort also self-heals via departure probes + sell-through).
3. **Calibration = a quality contract**, not a new surface: fresh-cohort rows holding both dates must
   keep median |listed_date − first_seen| ≤ 1 day.
4. **Surfaces now: chat comps + deliverables.** Everything else (brain aggregate, charts/algos, desk)
   = follow-up checks opened at ship, not built now.

## What we're building

### 1. SQL view `data_lake.listing_dom` (migration `docs/sql/20260717_listing_dom.sql`)

Over `listing_state` api_feed rows (all statuses — a sold row's DOM is its final spell length),
LEFT JOIN a one-row-per-key rollup of `listing_transitions` for `last_relist_at`
(`max(at) WHERE from_state = 'holding'`). Computed per row, at read time — nothing stored:

- `spell_anchor` = `listed_date` when it's from the current spell (`listed_date >= last_relist_at`,
  or no relist ever) · else `last_relist_at` (we observed the relist but haven't re-probed) · else
  `first_seen`.
- `dom_days` = `current_date − spell_anchor`.
- `dom_is_floor` = anchor fell back to a censored `first_seen`: `listed_date IS NULL AND
  last_relist_at IS NULL AND first_seen::date <= DATE '2026-07-03'`. (Censor boundary is a literal
  in ONE place — the view.)
- `cdom_days` = `current_date − LEAST(COALESCE(listed_date, first_seen), first_seen)::date`. Never
  resets. Known limit: cumulative counts from the earliest evidence WE hold; pre-06/27 off-market
  spells are invisible until a probe supplies an older list_date.
- Pass-through keys/display columns (`address_key`, `sale_or_rent`, `source_name`, `state`,
  `zip_code`, `county`, `list_price`, `status`, `property_id`, `listed_date`, `first_seen`).
- Pending counts (matches realtor.com); no pause states.
- `GRANT SELECT TO service_role;` + `NOTIFY pgrst, 'reload schema';` — same shape as
  `20260712_listing_active_homes_authority.sql`. Apply via `bun scripts/run-migration.ts` (psql not
  installed). Idempotent (`CREATE OR REPLACE VIEW`).

### 2. One formatter — `lib/listings/dom.ts`

`formatDom({domDays, isFloor, cdomDays})` →
- exact: `"62 days on market"` · floor: `"62+ days on market"`
- relist context appended only when it changes the story (`cdomDays − domDays >= 14`):
  `"12 days on market (relisted — 140 days total)"`.
- Pure, unit-tested, imported by every surface. No other file composes DOM wording (one authority
  per shared concept).

### 3. Probe-on-use — `lib/listings/steadyapi.ts` + narrow write

- `parseListedEvent(body)` — most recent "Listed" event's `listing.list_date`; mirrors Python
  `_pick_listed_date` including the case-insensitive event match. A SHARED FIXTURE (one JSON
  tax-history sample checked in once, loaded by both the `bun:test` and the Python test) pins the two
  implementations to identical outputs.
- `fetchListedDate(propertyId, ...)` — same auth/hour-cache/never-throws/1-req-s-pacing shape as the
  existing `fetchSoldEvent` in the same file. Weight 1. NOT a new vendor surface (endpoint already
  live in production probes) — no first-live-run spend gate applies.
- `persistListedDate(key, isoDate)` — service-role UPDATE of `listing_state.listed_date` ONLY, keyed
  `(source_name, address_key, sale_or_rent)`, no-op unless the fetched date is non-null and the
  column is currently NULL or older. First write path from TS into `data_lake` — deliberately
  single-column, guarded, and unit-tested against widening.
- Trigger rule: a surface about to RENDER a listing whose view row says `dom_is_floor` calls
  `fetchListedDate` (≤3 per request, same budget discipline as the comps lane), persists, renders the
  exact number on success, the floor string on any failure. Never blocks a render.

### 4. Surface wiring

- **Chat comps** (`lib/assistant/comp-helper.ts` + the `select.ts` lake-read path): comp rows carry
  `dom_days/dom_is_floor/cdom_days` from the view; floored rows probe-on-use; wording via
  `formatDom`. Provenance in answers stays "SWFL Data Gulf" / realtor.com — the access layer is never
  named (existing rule).
- **Deliverables**: the recipes already touching tax-history/comps (`new-listing`, `just-sold`,
  `under-contract`, `market-comps`, `listing-flyer`) surface subject/comp DOM through `formatDom`.
  Recipe copy decides WHERE it appears; this build only guarantees the number is available and
  correctly worded. Coherence rule per element (existing standard): a DOM figure renders only with
  its as-of date context (MM/DD/YYYY) already carried by each recipe's citation block.

### 5. Calibration — quality contract (ingest quality registry)

On `data_lake.listing_state`, `content_contracts` entry, `type: sql_expectation`, `locus: probe`:
median `|listed_date − first_seen|` over rows with BOTH dates AND `first_seen::date > '2026-07-03'`
must be ≤ 1 day, evaluated only once ≥ 20 such rows exist (else pass). `severity: warn` at ship;
promote to `error` once it has held green ~2 weeks (that promotion = closing
`listing_dom_from_first_seen`). This is the operator's "track a few until we're caught up," running
nightly, forever.

### 6. Follow-up checks (opened at ship, NOT built now)

- `listing_active_stats_dom_repoint` — `listing_active_stats.avg_days_on_market` currently averages
  the dead RentCast-era column (NULL on every api_feed row); re-point to the view's `dom_days`.
- `active_listings_brain_dom` — inventory DOM stats into the active-listings brain, with discrepancy
  framing vs the two vendor aggregates we already publish (market-temperature, market-heat).
- `dom_in_charts_and_algos` — DOM as a chart shape + model input (operator: "a big indicator in the
  right algos").
- `desk_dom_calibration_line` — desk visibility for the calibration deltas if wanted after watching
  the contract.

## Testing

- View: migration applies idempotently; a fixture-row query asserts anchor precedence
  (vendor date > relist > first_seen), floor flag, cdom, and the sold-row final-spell case.
- `formatDom`: unit tests for exact/floor/relist-context/edge (0 days, null cdom).
- `parseListedEvent`: shared-fixture parity test with Python `_pick_listed_date` output.
- `persistListedDate`: unit test that it updates ONLY `listed_date`, and skips when fetched date is
  null/older.
- Comp-helper + one recipe: test that a floored row triggers exactly one probe and falls back to the
  floor string on probe failure.
- Live verify (closes `listing_dom_live_verify`): after the first nightly run lands `listed_date`
  rows, query the view for the Rivers Edge Ct #217 example (or any probed row) and confirm exact DOM
  vs realtor.com's displayed counter within ±1 day.

## Non-goals

- No bulk backfill of the ~30k censored rows.
- No MLS-style pending-pause semantics.
- No brain/pack changes in this build (brain-first gate applies to the follow-ups when they ship).
- No storing computed days anywhere; the RentCast-era `days_on_market` column stays untouched.
