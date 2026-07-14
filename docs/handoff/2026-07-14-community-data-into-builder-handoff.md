# Community/parcel data → builder + AI commentary — handoff (07/14/2026)

**The ask:** get today's Lee+Collier parcel data flowing into AI commentary and into every
relevant email (new listing, coming-soon, under-contract, sold/closing) — pre-fill as much of
a home's community context as possible before the user writes their own description, or at
minimum offer it as an option in the builder.

**What exists after today's build, and what's still missing before any of that is possible.**
This is a handoff, not a build — the next session should read this before touching code.

---

## 1. What's live right now (07/14/2026)

- `data_lake.parcel_subdivision` — **604,362 rows** (Collier 220,875 + Lee 383,487). One row
  per home: `parcel_id`, `county`, `property_type`, `just_value`, `zip`, `subdivision_name`,
  `phy_addr1`. Both counties, same FDOR source, same retrieval code.
  (`docs/superpowers/plans/2026-07-14-lee-parcels-handoff.md`, `SESSION_LOG.md` same date.)
- `data_lake.neighborhood_stats` — **31,110 rows** (Collier 18,426 + Lee 12,684). One row per
  `(county, subdivision_name)`: `home_count`, `count_by_type` (jsonb), `median_just_value`.
  This is the UNIVERSAL backbone — every home in Lee+Collier rolls up here, gated community
  or not, golf course or not.
- `refinery/packs/communities-swfl.mts` **already exists** and is **already wired into
  `master`** (`refinery/packs/master.mts:265,361`) as an input brain. It already reads
  `neighborhood_stats` (`refinery/sources/communities-swfl-source.mts`) and is empty-tolerant
  by design — it was shipped 07/06 *before* the backbone table had rows, specifically so it
  would "light up automatically" once data landed. It now has data. **It needs a rebuild**
  (`pack_id=communities-swfl`, not `master --force` — see CLAUDE.md's GHA rebuild targeting
  rule) to pick that up; `brains/master.md` as of 07/13 still shows "no community data yet."

## 2. The three real gaps, in the order they block each other

### Gap 1 — no address→community join exists yet (blocks everything below)

Nothing in `lib/` or `app/` reads `parcel_subdivision` today (that's the still-open check
`parcel_subdivision_orphaned_no_readers`). There is no code path from "this listing's street
address" to "this listing's `subdivision_name`." The original plan already measured this on
Collier and specified the rule — **reuse it, don't re-derive it**:

- Use `addressKey()` (`lib/listings/address-key.ts`, Python twin
  `ingest/pipelines/listing_lifecycle/address_key.py`) for USPS-suffix-canonicalized matching.
  Measured: naive exact match 3.5%; with `addressKey()`, **80.2%** of Collier listings match a
  parcel, **77.2%** resolve to exactly one community.
- **Fan-out rule, non-negotiable:** condo towers share one street address (worst Collier case:
  273 parcels, one address). Take the DISTINCT `subdivision_name` across all parcels at that
  address key. Exactly one → that's the community. More than one → **no community, do not
  guess.** A wrong community fact is worse than an absent one, especially now that the "ships
  everywhere" rule (`lib/deliverable/recipes/community-facts.test.ts`) means naming a
  community is mandatory once one is attached to `ListingFacts`.

### Gap 2 — no per-community lookup surface for the other ~30,800 communities

This is the part worth flagging carefully — it is NOT solved by Gap 1 alone.
`communities-swfl`'s `detail_tables` (the "SWFL marketed golf/gated communities" lookup a
downstream Claude or a builder would query) is built from `community_profiles`
(`refinery/packs/communities-swfl.mts:215-240`) — the ~300-community golf/gated/amenity Tier-2
table. **`community_profiles` is still 0 rows** (`community_profiles_zero_coverage`, opened
today — separate, unbuilt Phase 2 scrape). So even after a rebuild, communities-swfl's lookup
surface stays empty; only its HEADLINE aggregate stats (total homes catalogued ≈604K,
subdivision count ≈31K) go live.

Most listings will NOT be in one of the ~300 marketed golf communities — they'll be in one of
the other ~30,800 `neighborhood_stats` rows (a plain platted subdivision with no golf/gated
data, just home_count + median_just_value). There's no queryable-by-name path into
`neighborhood_stats` today. Options, not yet decided:
- Extend `communities-swfl`'s detail_tables (or add a sibling brain output) to also emit from
  `neighborhood_stats` directly, keyed on `(county, subdivision_name)`, for communities absent
  from `community_profiles`.
- A dedicated single-community "drill" read, mirroring the existing per-ZIP detail-row drill
  pattern already live in `app/api/mcp/server.ts` (`resolveOrigin()` / single-brain drill,
  Fix B) — same shape, different key (community_slug instead of zip).

### Gap 3 — nothing wires a resolved community's stats into the four places that actually need it

Once Gap 1 + Gap 2 are closed, a listing can resolve to `{ subdivision_name, home_count,
median_just_value, count_by_type }`. Four concrete injection points, in the order they'd
likely get built:

1. **`ListingFacts`** (`lib/email/listing-scrape.ts:24-54`). Today `facts.community` is
   `ListingDetailFacts` — golf/gated/pool/amenities/subdivision, but ONLY populated when we've
   scraped that specific listing's detail page (opportunistic, per-listing coverage). The
   parcel-backed data is UNIVERSAL (every home, always available once Gap 1 resolves) but
   coarser (no golf/gated/amenity flags, just count + value). These are different provenance
   and must stay labeled apart — don't merge them into one field. Likely a sibling field, e.g.
   `facts.communityStats?: { subdivisionName, homeCount, medianJustValue, countByType,
   sourceUrl, asOf }`, populated independently of whether the detail-page scrape succeeded.
2. **A universal recipe-level line**, parallel to `communitySourceLine()`
   (`lib/listings/listing-detail.ts:173-190`). SESSION_LOG 07/14 ("THE COMMUNITY NAME SHIPS
   EVERYWHERE") already made the scrape-based community line mandatory across every recipe,
   no per-recipe opt-in, no `deIdentify` escape hatch. The natural move is the same universal
   treatment for the parcel-backed stats — but keep the citation language distinct: "the
   listing's own detail page says X" (per-listing, scraped, can describe amenities) vs. "the
   tax roll says N homes exist in this community, median value $Y" (parcel aggregate,
   universal, can't describe amenities). Never let one impersonate the other.
3. **The Email Lab AUTHOR engine's MENU** (`MenuFigure` in `lib/email/author-doc.ts`). This is
   the "Fill with AI" moat — the model picks a figure id, the engine writes that figure's
   value verbatim, so a number can never be invented. `home_count` and `median_just_value` per
   resolved community are exactly the shape of a citable `MarketFigure` and would slot in
   directly, letting AI-authored commentary reference real per-community numbers.
4. **A builder-UI option** — matching "or at least the option to." A "pull community stats"
   affordance in the Email Lab / listing builder that a user can invoke explicitly even before
   (1)-(3) are fully automatic, so the capability ships incrementally rather than waiting on
   the whole chain.

## 3. What's NOT a gap (don't re-litigate)

- Condo/parcel dedup: dlt's `merge` write disposition on `primary_key="parcel_id"` already
  handles any duplicate rows at the source — this was the real landmine on the Collier side
  (§3a of the original handoff) and it's structurally covered, not something the builder
  wiring needs to re-solve.
- Lee vs. LeePA: `parcel_subdivision`/`neighborhood_stats` are community-identity only.
  `properties-lee-value`'s sold-price/value metric stays 100% LeePA-sourced
  (`refinery/packs/properties-lee-value.mts`) — untouched by any of this, and should stay that
  way. Don't route community-stats work through `leepa_parcels`.
- A separate, real gap exists linking Lee's FDOR parcel data to LeePA's own value data
  (`lee_fdor_leepa_no_join_key`, opened 07/14) — that's about connecting VALUE data across
  sources, not about the community-identity wiring this handoff covers. Different problem,
  don't conflate them.

## 4. Recommended order

1. Rebuild `communities-swfl` (`pack_id=communities-swfl`) — cheap, immediate, lights up the
   headline aggregate stats (total homes catalogued, subdivision count) in master's dossier
   even before anything else here is built.
2. Build the address→community join (Gap 1) — this is the actual `parcel_subdivision_orphaned_no_readers`
   check, already tracked, already fully specced (reuse `addressKey()`, one-community-or-none).
3. Decide + build the per-community lookup path (Gap 2) — needs a real design decision
   (extend communities-swfl's detail_tables vs. a dedicated drill route); brainstorm before
   building per RULE 3.5, this is genuinely two different shapes with different tradeoffs.
4. Wire into `ListingFacts` first (injection point 1) — every other consumer (recipe line,
   AUTHOR MENU, builder UI) reads off `ListingFacts`, so this is the one shared root.
5. Recipe line + AUTHOR MENU + builder UI option can then ship independently/in parallel.
