# communities-swfl — handoff (07/06/2026, after a bad session)

**Read this before touching anything in `ingest/pipelines/parcel_subdivision/`.**
The prior session (mine) burned a large chunk of time chasing an FDOR API bug through
three live-run attempts and a pile of manual diagnostic queries against the same
government server, in a loop, without stopping to report clearly. Don't repeat that.
This doc is the complete, honest state — verified against the live DB and git, not
memory.

## Do NOT do this

- **Do not just re-run `python -m ingest.pipelines.parcel_subdivision.pipeline` hoping
  it works this time.** It will fail again, deterministically, at the same place. See
  "The actual bug" below.
- **Do not fire a string of manual `requests.get` diagnostic scripts at the FDOR
  ArcGIS endpoint one after another.** That's what turned a real-but-narrow bug into a
  confusing mess last session — repeated rapid hammering plausibly triggered
  server-side rate-limiting that made results inconsistent between attempts and wasted
  hours re-diagnosing noise instead of the actual defect. If you need to probe it,
  space requests out and probe with a clear hypothesis, not a spray of variations.
- **Do not increase retry counts/backoff as the fix.** Already tried (6→10 attempts,
  longer backoff) — made no difference. This is not a transient/flaky-server problem.

## The actual bug (verified, reproducible)

Source: FDOR Statewide Parcel Centroid FeatureServer, layer 0
(`Florida_Statewide_Parcel_Centroid_Version`), `CO_NO=21` (Collier), OBJECTID-keyset
pagination (`ingest/pipelines/parcel_subdivision/resources.py`).

**Every live attempt (3 full runs) died at the exact same place: `OBJECTID>2274627`.**
This is not a coincidence and not a fluke — it's the same dead spot every time.

What was ruled out, with evidence:
- **Not a page-size limit.** `resultRecordCount=2000` fails; so does 1000, 500, 250,
  125, 100 — at some cursors shrinking helped (worked around one narrow point), at
  others (starting `OBJECTID>2275379`) it did NOT help at any size down to 100.
- **Not a field-selection issue.** Tested `outFields=*`, the full 6-field list, and a
  bare 2-field list (`OBJECTID,PARCEL_ID`) — all fail identically at the broken
  cursors.
- **Not a single "poison row."** A cursor-nudge fallback (advance the OBJECTID cursor
  by 1..50 past a fully-failed page) exhausted its entire 50-attempt budget —
  `OBJECTID>2275380` through `OBJECTID>2275429` **every one** failed at every page
  size. That's at least 50 consecutive unreadable OBJECTIDs, a real contiguous dead
  zone in the source data, not one bad record.
- **The failure shape:** HTTP 200 with a JSON body `{"error":{"code":400,"message":
  "Cannot perform query. Invalid query parameters."}}` — a "soft 400" from ArcGIS
  Server itself, not a network/timeout issue (though some manual probes later in the
  session DID also see genuine `ReadTimeout`s, which is very likely self-inflicted
  rate-limiting from repeated rapid probing, not part of the core bug).

**Best working theory:** somewhere in Collier's slice of this statewide layer, there is
a contiguous run of parcel records (at least ~50 wide, actual extent unknown — never
mapped past +50) that the ArcGIS Server backend cannot serve via this query shape,
regardless of page size or fields. This may be a known-bad OBJECTID range specific to
this layer (a corrupt geometry/attribute batch, an indexing gap) rather than anything
about our query.

**Not yet tried:** whether pulling with `returnGeometry=true` (accepting the
reprojection cost) behaves differently, whether the plain **cadastral** layer
(`Florida_Statewide_Cadastral`, the one `collier_parcels` already uses successfully in
production) has the same dead zone at an equivalent point (it wouldn't — it doesn't
expose `S_LEGAL` — but if this really is a dead-OBJECTID-range issue and not
query-shape-specific, a raw feature count comparison between the two layers around
this OBJECTID could confirm/refute "the range is just missing from this layer
entirely" vs "the range exists but 400s on read").

## What's actually landed vs. what only looks landed

- **`data_lake.parcel_subdivision`: DOES NOT EXIST.** Zero rows landed. Every attempt
  crashed before any dlt write happened (the fetch builds the full row list in memory
  before promoting to Tier 2 — a crash mid-fetch loses everything, nothing partial was
  ever written). Verified live 07/06/2026 via a direct query — table doesn't exist.
- **`data_lake.neighborhood_stats` and `data_lake.community_profiles`: EXIST, 0 rows,
  GRANT SELECT + NOTIFY pgrst done.** These were created via hand-written migrations
  (`migrations/20260706_neighborhood_stats.sql`, `migrations/20260706_community_profiles.sql`),
  NOT by the ingest pipeline — verified live, both queryable, both empty. This was to
  unblock the Opus session working on Phase 4 (brain pack), whose pack code can now at
  least read an empty, correctly-shaped table instead of erroring on a missing
  relation.
- **The code IS correct and tested** — 10/10 offline unit tests pass
  (`ingest/pipelines/parcel_subdivision/test_resources.py`), including two tests that
  specifically lock in the shrink and nudge behavior against this exact bug (mocked,
  no network). The bug is in the FDOR data/service, not (as far as has been shown) in
  our code's logic.

## Everything else from this session that DID land cleanly (verified on origin/main)

All six commits below are confirmed present on `origin/main` (checked via
`git merge-base --is-ancestor <sha> origin/main`):

- `b4dce3d1` — T2 Collier ingest (code+tests) + T4 aggregation (code+tests)
- `27dde50f` — F1 finding: Lee needs a spatial join, not a name-join (see below)
- `ba855278` — SESSION_LOG entry for the above
- `339d06de` — live migrations for `neighborhood_stats` + `community_profiles`; F2
  (condo grain) resolved — 169,047 is the correct Collier condo count (per-unit),
  spec's old `100,847` was stale/different-grain. Collier total homes is **289,212**,
  not ~221K. Both the design spec and the phase-1 plan were annotated in place.
- `06ba2e1f` — the page-size shrink fix (works for SOME broken cursors, not this one)
- `6e5d7d5c` — the cursor-nudge fix (works for a single poison row, not a wide dead
  zone — this is the fix that exhausted its cap and proved the zone is wider than 50)

None of this needs to be redone. The F1/F2 findings and the migrations are real,
verified, and correct regardless of how the Collier dead-zone question resolves.

## What's still open

1. **T3 — Lee.** Separate issue, unrelated to the Collier dead zone above. Live-probed
   07/06/2026: Lee has no per-home subdivision-name field anywhere (neither
   `ParcelDetails` layer 33 nor any of `ParcelInfo`'s 24 layers carry one) — needs a
   scoped spatial join (548,389 parcel centroids × ~7,387 subdivision polygons, DuckDB
   `ST_Contains`, CRS 2237→4326). Full writeup:
   `verification/communities-lee-source-probe.md`. Not started.
2. **The Collier dead zone (this doc's main subject).** Needs a decision before
   `parcel_subdivision` can ever hold real Collier data:
   - **Option A — bounded skip-and-log.** When the nudge cap is exhausted, jump the
     cursor forward by a large fixed increment (e.g. 5,000) instead of raising, log
     every OBJECTID range skipped this way loudly (to stdout AND ideally into a
     tracked table, not just console output that scrolls away), and let the ingest
     finish. Accepts a permanent, documented, bounded gap in the data. Simple, ships
     today.
   - **Option B — investigate the dead zone's true extent and cause first.** Map how
     wide it actually is (nudge cap was only 50; the zone could be 60 rows or 6,000)
     and whether it's specific to this layer before deciding how much data loss
     Option A would actually cause. Slower, no guaranteed answer (it's FDOR's server,
     not ours).
   - Whoever picks this up should decide which, not default into another multi-hour
     live-debugging loop. If probing live again: rate-limit yourself (a few seconds
     between requests minimum), and stop and report after ONE unexpected result
     instead of chaining more probes.
3. **T4 pipeline glue** — `agg.py`'s pure `aggregate_stats(con)` is done and tested;
   the Postgres→DuckDB read glue for `pipeline.py` isn't written. No precedent in this
   repo for DuckDB reading a Tier-2 Postgres table directly — simplest fix is probably
   a plain Postgres `GROUP BY` instead of a DuckDB round-trip (still satisfies
   aggregate-at-source). Not decided, not started.
4. **T5** — alias fixture (`fixtures/community-aliases.json`) extracted and wired into
   both TS and Python, done. Coverage growth (more than the one seeded `heritage-bay`
   entry) is blocked on Phase 2's scrape producing a marketed-community name list,
   which doesn't exist yet.
5. **T6 (cadence/cron)** — blocked on a real landed row count from T2, which doesn't
   exist yet per this doc. Do not write `expected_rows_min` from an estimate.
6. **Phase 2 (scrape → `community_profiles`)** — not started. Independent of the
   Collier dead zone; could be picked up in parallel.
7. **Phase 3 (Mapbox enrichment)** — not started, gated on `neighborhood_stats` having
   real rows (it doesn't yet).
8. **Phase 4 (brain pack + master wiring)** — Opus was working this in parallel this
   session. Check its state before touching `refinery/packs/communities-swfl*` or
   `refinery/__fixtures__/communities-swfl*`.
9. **Phase 5 (Lab AI + chat grounding)** — not started, gated on Phase 4.

## Files touched this session (all on origin/main already)

- `ingest/pipelines/parcel_subdivision/` — full pipeline, code+tests only, never
  successfully run to completion live.
- `ingest/duckdb_pipelines/neighborhood_stats/agg.py` + test — pure function, tested,
  not wired to anything live yet.
- `ingest/lib/community_aliases.py` + test — Python side of the shared alias fixture.
- `fixtures/community-aliases.json` — shared alias data (TS + Python both read it).
- `refinery/lib/subdivision-aliases.mts` — now reads the shared fixture instead of an
  inline literal.
- `migrations/20260706_neighborhood_stats.sql`, `migrations/20260706_community_profiles.sql`
  — live, applied, verified.
- `verification/communities-lee-source-probe.md` — the Lee F1 finding.
- `docs/superpowers/specs/2026-07-05-communities-swfl-design.md` — F2 correction
  annotated in place.
- `docs/superpowers/plans/2026-07-05-communities-swfl-phase1-namejoin.md` — F1/F2
  follow-up entries updated to reflect resolution.
- `SESSION_LOG.md` — has an entry from earlier in this session; it is now
  **superseded by this doc** for anything about the Collier ingest — that entry was
  written before the dead zone was fully understood and reads more optimistically
  than the real state.

## Checks

`communities_swfl_live_verify` should stay open — nothing in this program is live to a
user yet. No sub-checks for F1/F2/the dead zone have been opened in the `checks`
ledger; whoever picks this up should open one for the dead-zone decision so it isn't
lost.
