# PLATFORM_ARC auto-advance nudges — real MLS events surfaced, never auto-sent

**Date:** 2026-07-06
**Check:** `platform_arc_nudges_live_verify`
**Status:** approved design (operator, 07/06/2026) — sub-project 2 of the campaign-automation
follow-ups (`docs/handoff/2026-07-06-campaign-automation-followups.md`).

## Problem

`lib/email/sequence/types.ts`'s five arc steps (`coming-soon`, `new-listing`, `market-comps`,
`under-contract`, `sold`) advance only when an agent manually calls `markBuilt` / `markScheduled`
/ `markSent` (`lib/email/sequence/state.ts`). `ingest/pipelines/listing_lifecycle/transitions.py`
already emits the real event rows (`from_state`/`to_state`/`price`/`price_delta`) that tell us a
listing went live, left the active market, or resolved to sold/withdrawn — but nothing in the
product surfaces those events to the agent running the campaign. The agent has to remember to
check MLS status by hand and click the matching milestone.

Two things make "just auto-advance it" the wrong first move:

- The 2026-07-05 lifecycle-sequences design **locked** "auto-detect ships later as a NUDGE at
  most... never an auto-send" — a wrong "Just Sold" email on a specific address is the category's
  loudest churn driver (that spec's own research citation). The lock stands.
- **Under contract has no reliable direct signal.** A listing leaving the active feed only becomes
  ambiguous `holding` (`transitions.py`: "sold / pending / withdrawn — the source doesn't say, so
  we don't claim"). It's later resolved to `sold`/`withdrawn` via a budget-capped paid probe
  (`plan_off_market_checks` / `apply_off_market_resolutions`) — sometimes weeks later — but
  "under contract" itself is never confirmed by the data at all.

## Operator decisions (locked 07/06/2026)

1. **Nudge-only, always — no exceptions in v1.** Auto-advance never marks step state, never
   builds, never schedules, never sends. It only surfaces a dismissible chip; every action still
   goes through the existing manual milestone flow (`app/api/projects/[id]/sequence/{route,fire}`).
   Explicitly written to leave a seam for a stronger tier later, instrumented so a future decision
   ("should X event auto-build/auto-schedule?") is made from real precision/latency data, not a
   guess.
2. **market-comps has no MLS event — anchor strictly on `new-listing`'s `sent_at`.** No fallback
   to the lake's raw "appeared" event, no per-setup configurable day count in v1. Default 14 days.
3. **Dedicated table, not `project_feed`.** Own columns (`step_key`, `event_kind`, `from_state`,
   `to_state`, `price`, etc.) rather than a jsonb payload — cleaner for the instrumentation join
   this build exists partly to enable.
4. **2b (maps deep-link injection) and "Property Watch" (radius-based nearby-market tracking for
   any address, not just an armed arc) are OUT of scope here** — different subsystems, each gets
   its own spec. Property Watch is brainstormed next, immediately after this spec is written.

## What we're building

### Data model — `public.lifecycle_nudges` (new table, owner-RLS like `email_schedules`)

`id uuid pk, user_id uuid, project_id text (soft-link, no FK), sequence_id uuid (soft-link to
email_sequences.id), step_key text, event_kind text ('appeared'|'departed_holding'|
'resolved_sold'|'resolved_withdrawn'|'time_elapsed'), from_state text null, to_state text null,
at date (the underlying lake event's date, or the computed trigger date for time_elapsed),
price int null, price_delta int null, dedup_key text UNIQUE, created_at timestamptz, dismissed_at
timestamptz null`.

`dedup_key = "<sequence_id>:<step_key>:<event_kind>:<to_state>:<at>"` — a daily cron rerun hits
the same key and no-ops (`ON CONFLICT DO NOTHING`); a genuinely new event (a later price cut, a
relist, a later-resolved sold) gets its own row. A nudge persists until dismissed — no daily
re-insert churn, no need to re-nudge while the agent just hasn't acted yet.

RLS: `auth.uid() = user_id`, owner-only, mirrors `email_sequences`/`email_schedules`.

### Address matching — snapshot at arm time, not resolved per cron run

`projects.subject_address` is free text with no stored ZIP; the Python `address_key()`
(street+ZIP canonicalization — suffix/directional collapsing, `ingest/pipelines/listing_lifecycle/
address_key.py`) has no TS twin. Rather than re-resolving on every cron pass:

- At arm time (`POST /api/projects/[id]/sequence`), resolve `subject_address` through the existing
  one-shot geocoder `geocodeAddress()` (`refinery/lib/geocode.mts` — Mapbox forward-geocode
  primary, Census single-line fallback, no session/billing pairing needed) to get a clean ZIP.
  (Correction from the first draft: `/api/address-retrieve` needs a live Mapbox session token from
  a prior `/api/address-suggest` autocomplete call — it can't resolve an already-stored address
  string after the fact. `geocodeAddress` takes plain free text directly.)
- Port `address_key()` faithfully to TS: `lib/listings/address-key.ts`, with a test file mirroring
  `ingest/tests/pipelines/listing_lifecycle/test_address_key.py` case-for-case so the two
  implementations can't silently drift.
- Store the computed key on a new `email_sequences.address_key` column at arm time. The nudge
  cron reads that column directly and joins into `data_lake.listing_state` /
  `data_lake.listing_transitions` — no repeated geocoding, no drift between arm time and cron time.
- A resolve failure (bad/incomplete address) leaves `address_key` null — that sequence is simply
  never a candidate for nudges (fail closed, no invented match).

### Event → step mapping

| Step | Trigger | `event_kind` | Confidence |
|---|---|---|---|
| `new-listing` | `listing_transitions` row `from_state IS NULL` (APPEARED) for this `address_key`, `sale_or_rent='sale'` | `appeared` | high |
| `under-contract` | `listing_transitions` row `to_state='holding'` | `departed_holding` | **ambiguous** — copy says so explicitly |
| `sold` | `listing_state.state='sold'` (only reached via the off-market probe's real county-record resolution) | `resolved_sold` | high, but can lag real life by days–weeks (probe is budget-capped) |
| `market-comps` | 14 days after `new-listing` step's `sent_at` | `time_elapsed` | n/a (not event-driven) |

A nudge only fires when its step is still actionable (`pending` or `built`, never `sent`/
`skipped`) — checked against the live `email_sequences.steps` state at cron time, not cached.
Rental listings (`sale_or_rent='rent'`) are out of scope for v1 (the arc's copy assumes a sale).

### Cron

New `.github/workflows/lifecycle-nudges-daily.yml`, `0 16 * * *` UTC — after all three staggered
`listing-lifecycle-daily` county runs (9/12/15 UTC) have committed their day's transitions.
Adapter script `scripts/project-feed/lifecycle-nudges.mts` (mirrors the split in
`scripts/project-feed/change-detection.mts`): a pure decision core
(`lib/project/lifecycle-nudge.ts`, unit-tested, no I/O) fed by the adapter's live reads
(`email_sequences` where `status='armed'` and `address_key IS NOT NULL`, plus the matching
`data_lake.listing_state`/`listing_transitions` rows via `createServiceRoleClientUntyped`, same
pattern `lib/listings/select.ts` already uses for the `data_lake` schema).

### UI

`ArcNudgeChip` (new component, mirrors `components/project/CollisionChip.tsx`) renders inside the
matching step card in `ArcStrip.tsx` when an un-dismissed `lifecycle_nudges` row exists for that
step. One action ("Build it →", reuses the existing `arcStepDestination` navigation — identical
click target to today's manual "Build" button) plus a dismiss (×) that sets `dismissed_at`. The
chip never touches step state itself. Copy is deliberately hedged for `under-contract`
("may have gone under contract — worth checking before you send") vs. confident for `sold`/
`new-listing`.

### Instrumentation (the dataset for a later auto-tier decision)

No extra write path needed — `lifecycle_nudges` (event + `created_at`) and `email_sequences.steps`
(state + `sent_at`/etc.) already carry everything a later analysis needs. Follow-up (not this
build): a join of nudge `created_at`/`event_kind` against the step's next state-change timestamp
tells you precision (did a `departed_holding` nudge actually precede a real send of the
under-contract step?) and latency (how long before the agent acted). That's the real data your
side-builds would use to decide whether any event graduates to a stronger tier later.

### Testing

- `lib/listings/address-key.ts` — unit tests ported 1:1 from the Python fixture cases.
- `lib/project/lifecycle-nudge.ts` — pure decision core, unit-tested per event kind (appeared /
  holding / sold / time-elapsed), including the "step already sent/skipped → never fires" guard
  and the dedup-key stability under a rerun.
- Cron adapter script — mocked DB seams, mirrors `change-detection.mts`'s test shape.
- `ArcNudgeChip` — render + dismiss interaction test.
- `bunx next build` green. No new pack slugs (vocab gate not in play — this never touches a
  `PackDefinition` or `--- OUTPUT ---` shape).

## Non-goals

- No auto-build, auto-schedule, or auto-send for any event, in v1 (locked).
- No per-setup-configurable market-comps day count.
- No rental (`sale_or_rent='rent'`) matching.
- No maps deep-link injection (2b — separate spec).
- No radius-based nearby-market tracking for addresses outside an armed arc (Property Watch —
  separate spec, brainstormed next).

## Success criteria

- An armed sequence gets an `address_key` at arm time; a bad/unresolvable address leaves it null
  and the sequence is simply skipped by the nudge cron (no crash, no invented match).
- A real MLS appear/holding/sold event for a tracked address produces exactly one
  `lifecycle_nudges` row (idempotent across daily reruns) within one cron cycle of the transition
  landing in `data_lake.listing_transitions`.
- The matching step card shows a dismissible chip; "Build it" reaches the same destination as
  today's manual Build button; dismiss persists (doesn't reappear on refresh).
- market-comps nudges fire exactly 14 days after `new-listing`'s `sent_at`, never before, never
  based on the raw lake "appeared" event.
- Existing manual milestone flow (`markBuilt`/`markScheduled`/`markSent`, the fire route)
  completely untouched — this is additive, no changes to `state.ts` transitions.
- `bunx next build` green; `platform_arc_nudges_live_verify` closed by the operator on prod.

## Follow-ups (checks, not this build)

- Nudge precision/latency analysis once nudges accumulate (see Instrumentation above) — the
  evidence base for whether any event should graduate past nudge-only.
- **Property Watch** (brainstormed next): a radius-based tracking feature for ANY address in a
  user's account — independent of whether it's running the sell arc. User picks per-tracked-
  address mode: "selling — full marketing updates" (ties into this build's nudges) vs. "just
  watch — price/sale movement only." Surfaces comparative real-data facts about nearby listings
  (new listings, price cuts, sales within a radius) against the tracked property's own specs.
  Real open questions: default radius, how the tracked property's own price/sqft/beds/baths are
  sourced without inventing (may need the user to enter their own specs — four-lane "user writes
  it in" lane), what counts as nearby-worthy movement, send frequency/dedup. Explicitly NOT
  analysis — every comparative line must be a real computed number from held data, never a general
  market claim we can't source.
