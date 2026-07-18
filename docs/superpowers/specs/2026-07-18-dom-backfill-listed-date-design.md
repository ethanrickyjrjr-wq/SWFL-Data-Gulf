# One-time /property-tax-history backfill of listed_date to de-floor active DOM (desk-safe: update_listed_date only)

**Date:** 2026-07-18
**Check:** `dom_backfill_listed_date_live_verify`
**Related (approved) checks:** `steadyapi_persist_listed_date` (07/16, the free departure-path half),
`listing_dom_from_first_seen`, `assistant_property_urgency_tax_history_wiring`

## Problem

`listing_dom.dom_days` was a censored **floor** ("138+ days", `dom_is_floor=true`) on ~80% of the
active for-sale book. Live probe 07/18/2026: of 29,538 active/sale rows, only **5** carried a vendor
`listed_date` and **5,892** had an exact (non-floored) DOM — the rest anchor on `first_seen`, which is
only a floor for the ~23.6k listings first seen on/before the 07/03/2026 coverage boundary.

Root cause (probed, not remembered): the weekly `/search` sweep **never returns `list_date`** (verified
07/07/2026, `extract_api.parse_steadyapi` line ~192). The vendor list date exists only on the
per-property `/property-tax-history` endpoint (`property_history[].listing.list_date`), which we call
only when a listing *departs* — never for still-active listings. So the active book stayed floored.

Consequence for the benchmark this unblocks (listing-momentum median DOM, `buyer_leverage_zip_dom_authority_audit`):
"typical DOM here" over the thin non-floored cohort read **~60 days** vs **~170** over the full book —
the exclude-floored cohort is all recent arrivals and undersamples the long-sitting inventory, dragging
"typical" low and *overstating* a buyer's leverage gap. De-flooring is the real fix, not a caveat.

## Goal

Populate the vendor `listed_date` for every active for-sale listing that lacks one, so `listing_dom`
de-floors those rows automatically — **without** the backfill registering as listing activity** (no
phantom transitions, nothing that reads as a new listing, no "24,000 changes today" on the /desk).

## What we're building

`ingest/pipelines/listing_lifecycle/backfill_listed_date.py` — a one-time, resumable, paced job:

1. **Select targets** — `listing_state` where `source_name='api_feed' AND state='active' AND
   sale_or_rent='sale' AND listed_date IS NULL AND property_id IS NOT NULL`, oldest `first_seen` first
   (longest-sitting = most censored + most valuable to de-floor).
2. **Probe** each via the existing `extract_api.fetch_sold_event` (paced ~1 req/s module-wide), taking
   **only** `listed_date` from the response — the sold/holding/withdrawn classification is ignored
   entirely (`fold_updates`, pure + unit-tested).
3. **Write** via `distill.update_listed_date` **only** — nothing else.

### Desk-safety (the load-bearing constraint — proven, not asserted)

`update_listed_date` is `UPDATE listing_state SET listed_date=… WHERE … AND listed_date IS NULL`. One
column. It emits **zero** `listing_transitions`, does **not** bump `last_seen`/`scraped_at`, never
inserts (so `first_seen` — insert-only — can't reset, nothing reads as new), and never runs through
`diff_states` (which diffs only `state`+`list_price`, so it can't manufacture a transition on the next
daily sweep either). The /desk's activity/movers board reads `listing_transitions`; its "moved today"
reads `scraped_at`; this job touches neither.

**Canary (15 live probes, 07/18/2026) — before → after:**
- transitions dated today: **416 → 416** (unchanged); new-listing (from_state IS NULL) today: **158 → 158** (unchanged) — invisible to the desk.
- active rows with a real list date: **5 → 20**; non-floored active DOM: **5,892 → 5,907** — the 15 de-floored automatically via the view.
- Newly surfaced real DOMs on the oldest cohort: 661, 302, 243, 186 days (`dom_is_floor=false`) — long-sitting listings that were invisible as ~21-day floors.
- 15/15 had a real vendor list date (100%): the data was always there, we just never asked.

### Cost / cadence

**Quota, not dollars** — SteadyAPI is a flat 50k-req/mo subscription, `/property-tax-history` is
weight-1. ~29.5k one-time against ~34k unused monthly headroom; won't starve the daily sweeps
(~350/day). Runs safely alongside the daily cron (both guard `listed_date IS NULL`, no write conflict).

**Self-liquidating — one-time, not a recurring pipeline.** The floor exists only for the pre-07/03
seed cohort; every arrival after is caught fresh by the nightly sweep (`first_seen` accurate ±1 day),
so no new floored rows accumulate. After this backfill the floored set only shrinks. Hence no cron
wrapper — resumability (via the `listed_date IS NULL` guard) is the operational story, `--limit`
chunks it.

### Idempotent / resumable

Target query + write both guard `listed_date IS NULL`; a done row drops out of every later run. Re-run
with `--limit` to chunk; each run continues where the last stopped. No offset bookkeeping.

## Testing
- `ingest/tests/pipelines/listing_lifecycle/test_backfill_listed_date.py` — pure `fold_updates`:
  writes only `listed_date` (ignores a `sold` classification + price), skips no-date/gap/None
  (rows stay floored, retried later), empty-safe. The I/O reuses already-tested
  `update_listed_date` + `fetch_sold_event`.

## Done / close
Full run de-floors the book; verify `active_non_floored` climbs toward the true book and transitions-
today is untouched by the job; then land the benchmark (median DOM into `listing_momentum_stats` +
listing-momentum brain) so "typical here" renders a true number. Close `dom_backfill_listed_date_live_verify`.
