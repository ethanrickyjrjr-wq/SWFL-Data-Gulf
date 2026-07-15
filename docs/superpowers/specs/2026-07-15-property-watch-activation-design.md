# Property Watch activation — entry point + live-verify + cron on

**Date:** 2026-07-15
**Check:** `property_watch_live_verify` (already open since 2026-07-07 — no new check; this spec closes it)
**Supersedes nothing** — extends `docs/superpowers/specs/2026-07-07-property-watch-design.md`, which is
the authority for the engine, schema, and Watch-tab UI. This spec covers only what's left to make that
already-built feature live and reachable.

## Problem

Property Watch (nearby comp activity — new listings, price cuts, sales within a radius of a tracked
address, daily digest email) was designed and coded 2026-07-07. Probed 2026-07-15 and confirmed still
true:

- Both GHA workflows (`watch-scan-daily.yml`, `watch-digest-daily.yml`) are dispatch-only, no schedule,
  explicitly parked pending `property_watch_live_verify` — which has never been run.
- The feature works correctly as a tab (`Watch`) inside an existing project's cockpit
  (`lib/project/tool-tabs.ts`, `app/project/[id]/watch/`), but there is no way to START tracking an
  address without first creating a generic project and finding that tab. The project list
  (`app/project/page.tsx`) has quick-create buttons for New Listing, Newsletter, New Listing Socials, and
  Showing Prep (`ShowingPrepButton`) — nothing for "just watch this address."

Operator confirmed (2026-07-15): this is exactly the "track a property with email updates" feature
requested — turn on what's built, do not build subject-listing-status tracking (that's a different,
unbuilt feature and explicitly out of scope here, same as it was out of scope in the original spec).

## Goal

A user can start tracking an address from the project list in one click, and the daily scan + digest
actually run and actually send.

## What we're building

**1. "Track a property" quick-create button** — `app/project/TrackPropertyButton.tsx`, placed in the
same button row as `ShowingPrepButton` on `app/project/page.tsx`. Same shape as `ShowingPrepButton`:
prompts for an address inline, then:
- `POST /api/projects` — `{ kind: "general", title: address, subject_address: address }` (no new `kind`
  value; Property Watch is keyed by the `watch_*` columns on any project, not by `kind`).
- `POST /api/projects/{id}/watch` — `{ mode: "watching" }`. Both the 0.5mi radius and 2% price-cut
  threshold defaults are already applied server-side (`app/api/projects/[id]/watch/route.ts`) when
  `radius_miles`/`price_cut_threshold_pct` are omitted — the button sends neither.
- Routes to `/project/{id}/watch` (not `projectHome()` — a watch-only project should land the user on
  the tab they came here for, not an empty email canvas).
- On failure of either call: leave the form open so the user can retry, same as `ShowingPrepButton`.

No schema changes, no new API routes — both calls already exist and are exercised today by
`WatchClient.tsx`'s own enable flow.

**2. Live-verify** (closes `property_watch_live_verify`) — operator-run, real spend:
- Enable watch on one real tracked project (via the new button or the existing tab).
- Manually dispatch `watch-scan-daily.yml` — confirm it inserts real `project_events` rows (or zero,
  honestly, if nothing nearby moved) via `insertProjectEvent`, `seed=false` filter applied.
- Manually dispatch `watch-digest-daily.yml` — confirm a real digest email sends for that project (via
  `scripts/project-feed/watch-digest.mts`) with accurate, non-fabricated copy (raw facts / direct
  subtractions only, per the original spec's governing constraint), and `notified_at` stamps correctly
  on exactly the events included.
- **This is the first live run on this surface — flag to the operator for go-ahead before dispatching,
  per the paid-API-spend rule. Not run silently.**

**3. Flip both GHA workflows to a real schedule** — once #2 passes, replace the "PARKED... dispatch-only,
no schedule" comment + missing `schedule:` trigger in `watch-scan-daily.yml` and `watch-digest-daily.yml`
with a real daily cron (mirroring the `schedule:` shape already used by
`project-feed-change-detection-daily.yml` / `lifecycle-nudges-daily.yml` in the same directory).

## Out of scope

- Subject-listing-status tracking (this specific property going pending/price-cut/sold) — a different,
  unbuilt feature; explicitly ruled out by the operator this session.
- Map visualization, per-event-type radius override — already out of scope per the 07/07 spec.
- Any change to the detection/classification/digest-composition logic — it's already correct.
