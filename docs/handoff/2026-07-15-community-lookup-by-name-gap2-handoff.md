# Gap 2 — a name-keyed community lookup surface (handoff, 07/15/2026)

**What this is NOT:** the address-resolved neighborhood stats now flowing into deliverables
(this session's build — see `docs/superpowers/specs/2026-07-15-community-stats-deliverable-
wiring-design.md`, `docs/superpowers/plans/2026-07-15-community-stats-deliverable-wiring.md`,
and its `-BUILD-LOG.md`). That work is done: a listing's street address resolves to its
neighborhood's home count and median assessed value via `lib/listings/community-lookup.ts`,
and it now rides into every listing-lifecycle email through the shared narrator (six of seven
recipes; `market-comps` deliberately excluded).

**What this IS:** a different consumer, a different shape. `data_lake.neighborhood_stats` holds
~31,000 rows (one per Lee/Collier subdivision, alias-folded where the fixture covers it — see
Task 2 of the plan above, and `fixtures/community-aliases.json`). Only ~300 of those are the
marketed golf/gated communities `communities-swfl`'s `detail_tables` surfaces today (and that
table, `data_lake.community_profiles`, is still 0 rows — separate, tracked gap:
`community_profiles_zero_coverage`). The other ~30,800 rows have NO lookup path by name at all
today — nothing in `lib/` or `app/` lets a chat/MCP answer resolve "what's the deal with
Livingston Woods" to a real row, the way an address resolves for a listing.

## Why this wasn't built this round

It serves a different consumer (chat/MCP general-knowledge answers) than what this round's build
served (a specific listing's deliverable, which only ever needs ITS OWN resolved address — Gap 1
+ the wiring above is sufficient for that). Building a general name-keyed lookup is a genuinely
different design decision with real tradeoffs, not a mechanical extension of the address resolver.

## Two shapes to brainstorm (per RULE 3.5 — do not skip straight to building)

1. **Extend `communities-swfl`'s `detail_tables`** (`refinery/packs/communities-swfl.mts`) to also
   emit rows from `neighborhood_stats` directly, keyed on `(county, subdivision_name)`, for
   communities absent from `community_profiles`. Keeps everything in the one brain's output; the
   tradeoff is `detail_tables` growing from ~300 rows to ~31,000, which may need its own
   pagination/grain thinking before it fits the existing `BrainOutput` contract.
2. **A dedicated single-community "drill" read**, mirroring the existing per-ZIP detail-row drill
   pattern already live in `app/api/mcp/server.ts` (`resolveOrigin()` / single-brain drill, Fix
   B) — same shape, different key (`community_slug`/subdivision name instead of ZIP). Keeps
   `communities-swfl`'s own output small; the tradeoff is a new route/surface to build and
   maintain.

## Before building either shape: check the source-supply note

`lib/listings/community-lookup.ts` carries a 07/15/2026 comment listing exactly what
`data_lake.parcel_subdivision` already supplies beyond `home_count`/`median_just_value` (sale
price/date, living area, year built, land value, building count, etc.) — real tax-roll data,
zero extra ingest. Whichever shape gets built, check that comment (and `cadence_registry.yaml`'s
`parcel_subdivision` `source_scope`, which renders on `/ops/census`) before reaching for
crawl4ai for anything that turns out to already be sitting in that table.

## One more thing found during this build, relevant to whichever shape gets picked

`under-contract.ts`'s `inventedAttributes` word-guard checks `ATTRIBUTE_CLAIMS` (waterfront,
canal, bay, gulf, etc.) against the full narrator source text — and the neighborhood-stats
settled sentence embeds the community's raw NAME. A community named with a water word (Heritage
Bay, Bonita Bay, Miromar Lakes — common in SWFL) can "legitimize" the model claiming that water
feature about the HOUSE, not just the neighborhood. Tracked as check
`community_name_water_word_legitimizes_invented_attribute` (project `under-contract`). If Gap 2's
lookup surface starts feeding community names into any other narrator or claim-checked surface,
the same hole applies there too — worth fixing at the source (stripping the community-name
segment before the `inventedAttributes` check, the way `BRAND_NAME` is already stripped) rather
than re-discovering it per surface.
