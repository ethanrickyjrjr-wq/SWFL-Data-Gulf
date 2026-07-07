# Property Watch — nearby market movement nudges, any tracked address

**Date:** 2026-07-07
**Check:** `property_watch_live_verify`
**Status:** approved design (operator, 07/07/2026) — sub-project from
`docs/handoff/2026-07-06-property-watch-handoff.md`, carved out of the PLATFORM_ARC auto-advance
nudges spec (`2026-07-06-platform-arc-auto-advance-nudges-design.md`, item 4: "Property Watch...
is OUT of scope here — different subsystems, each gets its own spec").

## Problem

Right now the only "your properties" surface is the 5-step sell campaign
(`lib/email/sequence/*`), and it only reacts to the tracked property's OWN lifecycle (new listing
→ under contract → sold). Nothing tells a user what's happening to properties AROUND theirs — a
new listing a mile away, a price cut on a comp, a nearby sale — and nothing lets a user track an
address that isn't running a sell campaign at all (a rental, a property they're just watching, a
house they almost bought).

The operator's motivating example: a nearby comp cuts its price to $22/sqft, lower than the
tracked property's $25/sqft, but the comp has 4 bedrooms against the tracked property's 3 — a real
computed delta, not a market platitude. **Governing constraint, verbatim: "we don't analyze it, we
just send updates on movement."** Every line in a Property Watch nudge is either a raw fact from
the lake or a direct subtraction between two already-held numbers. No inserted commentary.

## Operator decisions (locked 07/07/2026)

1. **Shared engine first, both modes as thin wrappers.** Mode 1 (Selling) reuses the sell
   campaign's own lifecycle signal — that's `lib/project/lifecycle-nudge.ts` /
   `lifecycle_nudges` (shipped 2026-07-06, sibling spec above) — Property Watch does not rebuild
   it. Mode 2 (Just watching) has no campaign, no arc, no lifecycle-nudge dependency — it's the
   radius/comp engine standing alone. This spec is about that shared radius/comp engine; mode 1
   only needs a UI toggle to also surface the existing lifecycle-nudge feed.
2. **Comparative delta from day one**, not raw-movement-first. A nearby event without a subject
   spec to compare against is half the value the operator's own example describes.
3. **Small form for the subject spec** (beds/baths/sqft/price) when the tracked address isn't
   itself a listing in the lake. When it is (an active `data_lake.listing_state` row matches by
   `address_key`), auto-fill from the lake and skip the form.
4. **0.5 mile default radius**, user-configurable per tracked address (overriding the ~1-mile
   appraisal-industry convention this session's crawl4ai research found — Fannie Mae Selling Guide
   B4-1.3-08 and multiple appraisal-industry sources cite ~1 mile as the common urban/suburban
   comp-search convention; the operator chose tighter for v1).
5. **Notify-worthy events, v1:** new listing within radius, price cut within radius, sale/closing
   within radius. Price-cut notification has a threshold filter (starting point 2%+, user-visible
   and adjustable) so small list-price wiggles don't spam.
6. **Hybrid cadence:** immediate for sale, daily digest for new-listing/price-cut — see the signal
   latency section below for what "immediate" actually means for the sale case.
7. **UI: new "Watch" tab on `/project/[id]`.** Not a new top-level page, not a modal.

## Signal provenance — where each event actually comes from, and how far to trust it

No confidence percentage is asserted anywhere in this design — a fabricated one would violate the
platform's no-invention rule just as much as a fabricated dollar figure would. What follows is
what the ingest code actually guarantees, read directly from
`ingest/pipelines/listing_lifecycle/transitions.py` and `extract_api.py`.

**New listing** (`from_state IS NULL` in `data_lake.listing_transitions`) — a direct appearance in
a scan, not an inference. The only known noise source is the first-ever ingest sweep for a scope,
which the pipeline already tags `seed=True` specifically so downstream consumers can exclude
day-1 baseline rows from being read as real churn. Property Watch's detection query MUST filter
`seed = false` — omitting this was a gap in this design's first draft.

**Price cut** (`price_delta < 0` within the same state, same table) — also direct: both scans
have to show the property present, and the price fields are compared as-is. Reliability is bounded
by the scrape's own price-field accuracy, which is not a number we hold or can cite, so none is
attached.

**Sale — the one that needs its own subsection, because it is NOT same-day.** A listing
disappearing from a scan is never read as "sold" — it becomes ambiguous `holding`
(`transitions.py`, "we don't assert WHY it left"), and even that requires a *complete* scan pull
(`scan_complete`); an incomplete pull leaves the row untouched rather than falsely flagging a
departure. `to_state = 'sold'` is only written after a live `/property-tax-history` probe
(`extract_api.py: fetch_sold_event` → `classify_off_market`) resolves it — and per the code's own
comment, that endpoint is SteadyAPI's wrapper around realtor.com's `property_history`, an
MLS/public-record blend, not a courthouse recording feed.

The probe schedule itself has a real, code-defined lag: a departure gets exactly one same-day
probe attempt. If the source hasn't caught up yet, the outcome is `"gap"` (explicitly: an API
failure or an unresolved status "must never fabricate a sold/withdrawn") and the NEXT attempt
doesn't happen until the recheck loop picks it up — 21 to 180 days of holding age, at a 30-day
recheck interval (`plan_off_market_checks`: `recheck_min_days=21, recheck_max_days=180,
recheck_interval_days=30`). Even after a sold event is found, the price itself can stay
unconfirmed (`sold_price` null/zero) for up to 60 more days
(`load_price_pending_solds max_age_days=60`).

Web research (crawl4ai, 07/07/2026) found a real, citable general figure for the adjacent
question — how long a **deed** takes to record after closing — from legalclarity.org (published
04/01/2026): most county recorders process a deed 1-14 business days after closing; e-recorded
deeds are commonly indexed same-day to within 24 hours; mail submissions can push the total to 2-3
weeks. That figure describes the county recording step, which is not the step our pipeline
actually reads (SteadyAPI reads realtor.com's `property_history`, not a courthouse feed) — it's
included here as sourced context, not as the number that governs our latency. Two other queries,
searching specifically for a realtor.com/MLS sold-status lag figure, returned zero usable results
(hijacked by unrelated dictionary-definition SEO pages) — a genuine research gap, reported rather
than papered over with an estimate.

**Design consequence:** `nearby_sale` never fires on a bare `to_state='holding'` guess, and it
never uses "just sold!" language. It fires only once `sold_date` is a real, non-null value from
the source, and the nudge copy is anchored to that date ("sold on [sold_date]"), not to the day we
detected it. A late detection reads as accurately late, never as falsely immediate.

## Architecture — extend `project_events`, don't build a parallel system

Mid-brainstorm the operator flagged: "we should have some types of notifications set up already."
Checking confirmed it: `lib/project/event-insert.ts` (`insertProjectEvent`) + `public.project_events`
+ `lib/signals/types.ts` already solve cooldown windows (`COOLDOWN_DAYS` per `EventType`, 14-90
days), a 48-hour notify-batch cap (max one `notify_user` insert per project per window), and
brand/distance scoring — currently wired for CRE-style events (openings, closings, permits,
zoning). Property Watch extends this rather than standing up a parallel `watch_events` table.

**`lib/signals/types.ts`:** extend the `EventType` union with `nearby_new_listing`,
`nearby_price_cut`, `nearby_sale`. Extend `EventSource` with a value identifying the lake join
(e.g. `listing_lifecycle_lake`). `brand_tier`/`brand_weight` don't apply to a residential comp, so
they're written as fixed neutral values rather than stretched to fit the CRE brand-scoring concept.

**`public.projects`:** new columns — `watch_enabled boolean default false`, `watch_mode text`
(`'selling' | 'watching'`), `watch_lat numeric`, `watch_lon numeric`, `watch_radius_miles numeric
default 0.5`. Resolved once at watch-enable time via the existing `geocodeAddress()`
(`refinery/lib/geocode.mts`), mirroring the arm-time pattern the sell-campaign's
`address_key` resolution already uses (`app/api/projects/[id]/sequence/route.ts`) — never
re-geocoded on every cron pass.

**Subject spec:** new columns on `projects` (1:1 with a project, same pattern as the existing
`subject_address`/`property_url`): `watch_beds`, `watch_baths`, `watch_sqft`, `watch_price`,
`watch_price_is_estimate boolean`. Auto-filled from `data_lake.listing_state` when the tracked
address resolves to an active listing row by `address_key`; otherwise the small form captures them
directly from the user (four-lane rule, lane 4).

**`lib/project/watch-delta.ts` (new, pure)** — mirrors `lifecycle-nudge.ts`'s style exactly: no
DB, no disk, no `Date.now()`, everything injected. Computes price/sqft delta and beds/baths delta
between the subject spec and a comp listing. **Ruled out entirely for v1:** any "homes with pools
sell at a premium" claim. No `has_pool` column exists anywhere in the lake, and this session's
crawl4ai research found no citable general pool-premium figure — this is not deferred with a
caveat, it is excluded until a real column and a real computed split both exist.

**Detection — daily scan (new cron adapter, `scripts/project-feed/watch-scan.mts`, same shape as
the lifecycle-nudges adapter):** for every `projects` row with `watch_enabled = true`, pull
`data_lake.listing_transitions` since the adapter's last run, `AND seed = false`, joined to
`data_lake.listing_state` on `(source_name, address_key, sale_or_rent)` for lat/lon/price/sqft/
beds/baths. Haversine-filter to `watch_radius_miles` (reuse `haversineDistanceMiles` from
`lib/signals/event-evaluator.ts` — one implementation, not a second one). Classify: `from_state IS
NULL` → `nearby_new_listing`; `price_delta < 0` in a same-state row → `nearby_price_cut` (apply the
2%+ threshold here); `to_state = 'sold' AND sold_date IS NOT NULL` → `nearby_sale`. Insert via the
existing `insertProjectEvent`.

**Send mechanics:**
- `nearby_sale` — bypasses the existing 48-hour batch window entirely (it's not a repeat-signal
  fatigue risk the way permits/openings are); sends as soon as the platform detects it, which per
  the latency section above may itself be same-day or may be weeks after the actual close — the
  copy says "sold on [sold_date]," never "just sold."
- `nearby_new_listing` / `nearby_price_cut` — a new daily digest cron
  (`scripts/project-feed/watch-digest.mts`) queries `project_events` for
  `notify_user=true, notified_at IS NULL`, groups by project, sends one email per project per day,
  stamps `notified_at`. This reuses the cadence-scheduling pattern in `lib/email/recurring-report.ts`
  rather than inventing a second scheduler. Zero qualifying events that day → no email, no filler.
- Shared content rule: every line is a raw fact or a direct subtraction of two held numbers. No
  inserted market commentary in either send path.

**UI — new "Watch" tab on `/project/[id]`:** a setup card (mode toggle, radius, the subject-spec
form when not auto-filled) that collapses to a summary once configured, and an event feed —
reverse-chron list of the project's own `nearby_*` `project_events` rows, same query the digest
sender uses so there's one source of truth, not two. Toggling watch off stops future scans; past
rows stay visible.

## Standing follow-up — always be looking for more trackable signals

Per the operator's explicit instruction mid-brainstorm ("always thinking about more things that
would be good to track with the data we have"), this is a living list, not a commitment:

- Residential permits near the tracked property (`permits_swfl` already feeds `project_events` for
  CRE — same join, new event type, once a residential permit source exists).
- Subdivision-level price trend (`data_lake.listing_state.subdivision` already carries this key).
- DOM-percentile shift for the property's ZIP, once a percentile baseline is computed.
- Rental-comp movement, if `sale_or_rent = 'rent'` rows get their own watch mode later.
- Real pool-premium computation, once a real `has_pool` column exists in the lake — until then,
  this specific claim stays excluded per the ruling above.

## Out of scope for v1

- Auto-advancing the sell campaign off a Property Watch signal (that's `lifecycle-nudge.ts`'s job,
  a separate signal keyed on the tracked property's OWN state, not nearby properties).
- Any per-event-type radius override (`RadiusConfig`/`ProjectTypeConfig` in `lib/signals/types.ts`
  is per-project-TYPE today; Property Watch's per-instance radius is a new column, not a rewrite of
  that YAML system).
- Map visualization of nearby events (event feed is a list in v1).
