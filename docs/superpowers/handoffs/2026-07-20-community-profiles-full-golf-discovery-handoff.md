# HANDOFF — community_profiles: full golf-community coverage, then all communities

**For:** whichever session picks this up next (this one or a fresh one — environment is already
built, nothing to re-set-up).
**Design spec:** `docs/superpowers/specs/2026-07-20-community-profiles-amenity-scrape-design.md`
(read it first — Stage 1 "Discover" is what this handoff finally runs at full scale).
**Implementation plan (DONE, all 9 tasks):** `docs/superpowers/plans/2026-07-20-community-profiles-amenity-scrape.md`.
**One-line goal:** every real golf community in Lee + Collier gets a `community_profiles` row with
real golf/amenity/HOA data — sourced from naplesgolfguy.com + 55places.com + realtyofnaplesfl.com
via crawl4ai, not from a hand-curated seed list. Operator: "get all community info, starting with
all golf communities using crawl4ai. I don't care how long it takes."

---

## Why this exists

Operator asked directly whether "all communities in Lee and Collier" were covered. The honest
answer was no, for three separate reasons, and this handoff exists to close the first one:

1. **`seed_communities.json`'s 96 names were never exhaustive.** They came from operator-supplied
   research rounds (AI-overview pastes), not a real enumeration. 29 of the 96 matched neither
   naplesgolfguy nor 55places under any name-matching heuristic tried this session.
2. **SteadyAPI was checked and confirmed to carry ZERO community/HOA/amenity data** — no
   subdivision, no HOA fee, no gated flag, no golf, no amenities, across all 18 endpoints audited
   (`docs/steadyapi-capability-census.md`). crawl4ai against these 3 sites is the only lane.
3. **The real, authoritative golf-community list already exists and has never been fully used.**
   `discover.py` (built this session, 30/30 tests pass) fetches naplesgolfguy's 3 regional pages +
   3 membership-type pages (bundled/equity/luxury — NOT redundant with regional, confirmed live) and
   returns a real name -> slug map. Verified live 07/20/2026: **158 unique golf communities** on
   naplesgolfguy, **51 unique communities** on 55places' two area pages (Naples-Bonita Springs +
   Fort Myers-Cape Coral). The static seed file is now the bottleneck, not the data source.

## What's already built (commits `1b33e1b9`, `866e9803`, `f85aeb99` — local only, not pushed)

- `ingest/pipelines/community_profiles/discover.py` — `build_discovery_maps(fetch)` returns
  `(ngg_map, fp_map)`, both `{normalized_name: real_slug}`, matched by the URL slug's own words
  (not link text — 55places truncates long names with "...").
- `merge.py` records the per-source slug ACTUALLY fetched (`naplesgolfguy_slug`/
  `fiftyfive_places_slug` params) — never silently reconstructs a source_url from the wrong slug.
- `pipeline.py`'s `build_rows()` already resolves the real per-source slug via the maps, falling
  back to `slugify(name)` only when a name isn't discovered anywhere.
- `normalize.py` strips apostrophes AND connector-less "GOLF COUNTRY CLUB" suffixes correctly now.
- `ingest/.venv` (Python 3.12, `uv venv --python 3.12 ingest/.venv` + `uv pip install -r
  ingest/requirements.txt`) — already has crawl4ai + playwright chromium working. Root `.venv` is
  broken for this (pinned 3.14, no lxml wheel) — a separate session already fixed that too
  (`465b1a59`), but `ingest/.venv` is the one that actually works for this pipeline.

**Do not re-derive any of the above. Use it.**

## Your scope

1. **Enumerate the golf-community master list from `ngg_map` directly — not from
   `seed_communities.json`.** For golf communities, the static seed file is now legacy: `ngg_map`
   IS the exhaustive, live golf-community list (158 entries, verified above). Derive a clean
   `label` per entry from its slug (title-case the hyphen-split words — it's a real name pulled
   from the site's own URL, not invented) and build a fresh master list of
   `{slug, label, county: UNRESOLVED}` from every `ngg_map` entry.
2. **Resolve county per community — don't hand-guess it for 158 names.** naplesgolfguy's own
   regional pages (Naples/Bonita Springs-Estero = mostly Collier + part of Lee; Fort Myers = Lee)
   are a rough signal but not authoritative at the ZIP/county line. Prefer joining against
   `fixtures/community-aliases.json` / `ingest.lib.community_aliases.community_for_subdivision()`
   where a match exists (parcel-derived, real county); log `county: null` for anything that can't be
   resolved rather than guessing — a null county is honest, a wrong one is an invented fact.
3. **Run the full pipeline live against all 158** — no `--limit`. For each: fetch naplesgolfguy
   detail page (guaranteed real slug via `ngg_map`), attempt 55places detail page (real slug via
   `fp_map` when the normalized name matches, naive-guess fallback otherwise — expect misses here,
   55places only had 51 communities total across both counties), reuse the realtyofnaplesfl HOA
   table (one fetch, already-built parser, applies to all 158).
4. **Pace it — this is 150+ real fetches against two small commercial sites, not our own
   infrastructure.** Add a modest delay between detail-page fetches (0.5-1.5s is enough; see
   `ingest.lib.crawl_client.fetch_sequential`'s jitter pattern for precedent) so this reads as
   normal traffic, not a burst. Operator said cost-in-time is fine; cost-in-rate-limiting or getting
   IP-blocked from a legitimate small business site is not the same tradeoff — don't skip this.
5. **Report real completeness numbers when done** — not a vibe, actual counts: N/158 with real
   golf data, N/158 with amenities, N/158 with home_count/gated (55places-only field, expect this to
   be well under 158 since 55places only has 51 total communities — that's a source-coverage
   ceiling, not a bug), N/158 with HOA fee, N/158 entirely null (log the names, don't drop them).
6. **Commit the new master list + real fetch results as a proper PR-sized change** — new fixture(s)
   if useful, tests for anything new, SESSION_LOG entry. Same TDD discipline as the rest of this
   pipeline (see `docs/superpowers/plans/2026-07-20-community-profiles-amenity-scrape.md` for the
   established pattern this session followed).

## Explicitly NOT in this handoff's scope (later phases)

- **Non-golf communities.** `fp_map` (55places) already captures every community that site lists
  regardless of golf status — 51 total, a strict subset of the 158 golf ones plus a few non-golf
  entries. A real "all communities" pass needs a THIRD discovery source for non-golf residential
  communities (realtyofnaples.com's own community-type filters, per the design spec's Stage 1 list)
  — separate handoff, after this one lands.
- **communitypay.us's ~1,537-name completeness check** (design spec step 3) — cross-reference the
  final merged set against it once golf + non-golf discovery both exist. Don't fetch it yet; it's a
  completeness AUDIT of the finished set, not a discovery source itself.
- **The real write to `data_lake.community_profiles`.** Still needs explicit operator sign-off
  after real completeness numbers are in hand (RULE 1 — ingest writes to `data_lake.*` require
  asking first; Gate 4 guard via `ingest.lib.guards.assert_min_rows` applies regardless).

## Hard rules (this repo will block you otherwise)

- **crawl4ai only**, no Firecrawl, no LLM anywhere in this pipeline (ingest/CLAUDE.md decree).
- **No invented figures.** A null field with no source stays null — log it as a gap, never guess.
- **Never push without the operator's explicit OK, asked fresh for each commit** — approval doesn't
  carry from a prior push. SESSION_LOG entry before any push (RULE 0).
- **Full `git status` (not scoped to your own directory) before every commit.** This session hit
  the same mistake twice — sweeping in files from other concurrent sessions' uncommitted work.
  Stage explicit paths only.
- **This repo runs many concurrent Claude Code sessions on the same local checkout.** File-claim
  warnings from Bash/Edit hooks about "another active session" are frequently false positives on
  read-only commands (confirmed 3x this session via `git status` on the flagged path showing an
  unrelated session's own unstaged work) — verify with `git status --short -- <path>` before
  assuming you caused it, but don't ignore it either; a real collision is possible.

## Done when

- Every one of the 158 discovered golf communities has been run through `build_rows` for real
  (live fetches, not `--limit`), with a reported completeness breakdown (golf/amenities/home_count/
  HOA/all-null counts, names of the all-null ones).
- The new master list (from `ngg_map`, with resolved or explicitly-null county) is committed.
- 30+ tests still pass; anything new is TDD'd the same way the rest of this pipeline was.
- Still no live write to `data_lake.community_profiles` without a fresh explicit go-ahead.
- Report back to the operator with real numbers before proposing the next phase (non-golf, then
  communitypay completeness check).
