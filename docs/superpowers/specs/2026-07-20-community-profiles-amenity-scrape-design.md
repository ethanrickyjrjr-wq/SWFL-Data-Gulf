# community_profiles amenity scrape — design

**Status:** design, awaiting operator review
**Author:** session 02e59052, 2026-07-20

## Problem

`data_lake.community_profiles` — golf structure, HOA fee range, gated flag, pool/tennis/
pickleball/fitness/clubhouse/on_site_dining/boating_marina — has been at **0 rows** since the
migration landed 07/06/2026 (`migrations/20260706_community_profiles.sql`). Verified live via
`mcp__lake__query_lake` (`SELECT count(*)`) this session, not assumed from a stale check.

Everything downstream of the table already exists and is wired, null-safe, and waiting:
- `refinery/sources/communities-swfl-source.mts` reads the table defensively (`readTable` → `[]`
  on missing/empty, never throws).
- `refinery/packs/communities-swfl.mts` already turns rows into key_metrics (gated-homes count,
  bundled-golf share, median HOA midpoint) and a `marketed_communities` detail_table with every
  field this design fills.
- `app/r/communities-swfl/communities.ts` — the website drill pages. Per its own comment: "the
  set of communities that have a live page is exactly the set of `community_profiles` rows." Zero
  rows today means zero live drill pages.

So the only missing piece is the **writer**. This design specs that writer only — no schema
change, no pack change, no website change.

## Research (crawl4ai, live 07/19–07/20/2026 — not memory)

Sources checked this session, each verified by hand on a real live page, not assumed:

| Source | Role | Verified coverage | Verified fields | Verified gaps |
|---|---|---|---|---|
| `naplesgolfguy.com` | Golf detail | Golf communities only. Naples, Bonita Springs/Estero, Fort Myers — both counties. | Membership type (bundled/equity/optional → direct `golf_structure` enum match), hole count, club type, per-community amenities checklist, address. | No home_count, no HOA. |
| `55places.com` | Gated/amenities/home_count | Not golf-restricted. "Naples-Bonita Springs Area" AND "Fort Myers-Cape Coral Area" pages — both counties. | Exact home count, gated yes/no, price range, year built range, age-restriction flag, full amenities checklist. | **Confirmed live, on-page disclaimer:** "55places does not provide or maintain community HOA information." Zero HOA fields. |
| `realtyofnaples.com` (Premiere Plus Realty IDX) | Per-listing HOA fee (aggregate) | City list: Ave Maria, Bonita Springs, Estero, Fort Myers Beach, Marco Island, Miromar Lakes, Naples. Weak for Cape Coral/Fort Myers proper/Lehigh. | Per-listing `HOA Fees: $X Annually` — confirmed live (Lely Country Club, $240/yr). Aggregate several listings per community → a real fee range. | Geography-limited; null elsewhere, never fabricated. |
| `realtyofnaplesfl.com/hoa-fee-comparison-by-community/` | HOA/golf/CDD seed (curated) | 20 named communities, 13 Collier + 7 Lee — a curated top-tier list, not exhaustive. | Per-community HOA fee **range**, what's included, CDD fee, golf structure — all three in one page, already tabular. | Editorial ranges, at least one row explicitly marked "(est.)" on the page itself — must carry that uncertainty flag through, not silently treat as a precise figure. Only 20 communities. |
| `communitypay.us/directory/florida/naples/` | **Identity/completeness list, not amenity data** | 1,537 individually-linked, individually-typed (Condo/HOA/POA) communities in Naples alone; same directory structure implies full SWFL-city coverage. | Name, type, formation year, Sunbiz link — real and comprehensive for "does this community exist and what's its legal name." | **Confirmed on a real detail page (Bay Colony):** "None of these items are confirmed for [this association] — Set up this community on CommunityPay..." Unless a community is an actual paying customer, the page is boilerplate Florida statute text. Zero fee/amenity data platform-wide except for (rare) live customers. |

Ruled out this session, documented so the next reader doesn't re-check: SteadyAPI
`/neighborhood-amenities` (real, but **off the table — operator instruction, no SteadyAPI spend**),
Sunbiz corporate search (legal-entity data), DBPR CAM license file + condo registry + manager-
directory cross-reference (all real, all entity/ownership data, zero amenity fields — condo
registry *does* give per-condo unit counts, already covered by our own parcel-based home counts),
Lee County NAL/GIS subdivision layer (same FDOR NAL data `lee_parcels`/`collier_parcels` already
ingest, confirmed via `docs/handoff/2026-07-18-parcel-consolidation.md` — not a new source),
propertychecker.com (lead-gen aggregator pointing at sources we already hold more completely).

## Approach

**One Python ingest pipeline, crawl4ai as the fetch engine (proven pattern — crawl4ai already
replaced Firecrawl for Accela permits), no LLM in the extraction path.** Every source above renders
clean, labeled HTML with a consistent per-community structure — a DOM/regex distill is sufficient.
This keeps marginal cost at effectively zero per run and satisfies `ingest/CLAUDE.md`'s "no paid
web_search in scheduled pipelines" by construction: no LLM call happens at all.

### Stages

1. **Discover.** Crawl each source's own directory/nav pages to build a checkpointed list of
   community detail-page URLs — naplesgolfguy's three regional golf-community nav pages;
   55places' two area pages; realtyofnaples' per-city community-type filter results;
   realtyofnaplesfl's single comparison page (already a complete list of its 20, no further
   discovery needed there); communitypay's per-city directory pages (used ONLY for name/type/
   year — see step 3).
2. **Fetch + distill per community, per source.** One crawl4ai fetch per detail page → regex/DOM
   extraction into the `CommunityProfileRow` shape (mirrors `communities-swfl-source.mts`'s
   existing interface). Each source writes only the fields it actually has.
3. **Reconcile identity.** Match each scraped community name to the canonical `CommunitySlug` via
   the **existing** alias system (`refinery/lib/subdivision-aliases.mts`, `fixtures/community-
   aliases.json` — named directly in the 07/06 migration comment as the intended key).
   `communitypay.us`'s 1,537-name list is used here as a **completeness check**: after the other
   four sources are merged, diff their matched-community set against communitypay's full name list
   per city — anything present there but missing from every amenity source gets logged as a known
   gap (a community that exists but has zero amenity color), not silently dropped and not invented.
4. **Merge.** For a given `community_slug`, merge field groups from whichever sources have data —
   golf group from naplesgolfguy (or realtyofnaplesfl if naplesgolfguy has no golf entry); fees
   group from realtyofnaples' aggregated per-listing fees, falling back to realtyofnaplesfl's
   curated range when realtyofnaples has no coverage for that city (label which lane a given row's
   fee came from — a precise aggregate vs. a curated editorial range are not the same confidence
   class, and the realtyofnaplesfl page's own "(est.)" flags carry through verbatim where present);
   gated/amenities/home_count group from 55places. Each field GROUP keeps its own `source_url` +
   `as_of`, matching the existing table schema exactly — no new columns needed.
5. **Upsert.** Idempotent `INSERT ... ON CONFLICT (community_slug) DO UPDATE` — safe to re-run.
   Guarded per `ingest.lib.guards` since this is a write to a Tier-2 table (Gate 4).

### Scope for v1

Full Lee + Collier marketed-community catalog (not narrowed to just the newsletter's ~14) — the
discovery stage's cost is wall-clock, not spend, so there's no reason to hand-pick a subset.
Running the full discovery naturally covers the newsletter's needed communities (Fiddler's Creek,
Heritage Bay, etc. already confirmed present across multiple sources this session) as a side
effect. Hendry County is in scope per the standing SCOPE rule but will very likely resolve to
near-zero rows — no special-casing.

### HOA fee: best-effort, two-lane, labeled

`hoa_fee_range` gets filled from realtyofnaples' per-listing aggregate where that site has
coverage; from realtyofnaplesfl's curated table for its 20 named communities where realtyofnaples
doesn't reach; `null` everywhere else. The existing null-safe per-field-group design already
treats a gap as first-class, not a special case — the only new requirement is a confidence label
distinguishing "aggregated from live MLS listings" vs. "cited editorial range" so the two are never
displayed as if they were the same precision.

### Cadence

One-time backfill script, run manually — matches the pack's own `ttl_seconds: 180 * 24 * 60 * 60`
comment ("golf/fees/amenities rarely move"). No cadence_registry entry needed yet; a recurring
refresh is a separate later decision.

### Testing

- Unit tests per source's distill function against saved fixture HTML (avoid re-crawling live
  sites on every test run).
- One dry-run against known communities (Fiddler's Creek, Heritage Bay, Bay Colony, Pelican Bay)
  with `--dry-run` printing the row without writing, per the probe-first-then-ingest standard.
- After a real (small) write: confirm the `communities-swfl` pack output renders the new fields
  (`bun run refinery -- communities-swfl --target-only`), and confirm one `/r/communities-swfl/
  <slug>` page goes from "coming soon" to live.

### Discovery seed — Lee County golf communities (operator-supplied, unverified)

Operator pasted a Google AI Overview synthesis (07/20/2026) naming ~35 Lee County golf
communities pre-sorted bundled vs. equity/optional, citing a mix of sources — several already in
this design's source list (`naplesgolfguy.com/golf-community/bundled-golf-communities/`,
`55places.com`, `realtyofnaplesfl.com`), plus new candidates worth adding to the discovery crawl:
`mysanibelrealestate.com`, `doreendoyle.com`, `steven-mihalik.remax.com`, `golfhomes.com`,
`homes.com`, `newhomesource.com` (has a `golfcourse=true` filter for Lee County), the clubs' own
sites (e.g. `heronsglencc.com`), `naplescoastalconnection.com`. Two cited sources are NOT usable
(a Facebook group post, a Yelp search-results page — neither is a checkable named source).

**Named communities this seed adds that weren't yet confirmed present in the locked source list:**
Colonial Country Club, Legends Golf & Country Club, Lexington Country Club, Olde Hickory Golf &
Country Club, Cross Creek Country Club, Kelly Greens, Seven Lakes Golf & Tennis, Herons Glen, Six
Lakes Country Club, The Club at Pelican Preserve, Fiddlesticks Country Club, The Forest Country
Club, Eagle Ridge, The Club at Gateway, Country Creek, Wildcat Run, Grandezza, Stoneybrook, River
Hall Country Club (Alva), Highland Woods, Copperleaf at The Brooks, Spring Run at The Brooks,
Vasari, Worthington, Spanish Wells, The Colony at Pelican Landing.

**Use:** discovery-stage input only (step 1) — names to search for across the locked sources
during the crawl, and a completeness check (if the crawl finds zero data for a name on this list,
that's a logged gap, not a reason to invent a figure from this paste). None of the fee figures
attached to these names in the paste get written to `community_profiles` without independently
confirming them on the community's own page during the actual fetch+distill step.

**Second seed pass (operator, same session):** a wider AI-synthesized list combining Lee +
Collier, citing Teresa Kinkead's `johnrwood.com` blog among its sources (a fifth discovery
candidate site — note `johnrwood.com`'s LISTING detail pages are already confirmed to lack an HOA
field per `listing_detail_no_hoa_fee`; this is different content, a community guide, worth its own
discovery pass). Adds roughly 55 more names beyond the first seed, mostly Collier County golf
communities not yet covered: Cedar Hammock, Countryside, Cypress Woods, Esplanade Golf & CC
(Naples), Forest Glen, Foxfire, Glades Golf & CC, Glen Eagle, Naples Heritage, Naples Lakes, Royal
Wood, Stonebridge, The National at Ave Maria, Treviso Bay, Wilderness Country Club, Tiburon, Lely
Resort, The Quarry, Mediterra, The Strand, The Vineyards, Colliers Reserve, Kensington, TwinEagles,
Quail West, Pelican Marsh, Windstar on Naples Bay, Bear's Paw, Audubon Country Club, Wyndemere,
Eagle Creek, Imperial Golf Club, Quail Creek Village — plus additional Lee County names: Hunter's
Ridge, Breckenridge, Fountain Lakes, Cape Royal, Coral Oaks, The Landings, Myerlee, Hideaway
Country Club, San Carlos Golf Club, Fort Myers Country Club Area (the last several explicitly
Public/Daily-Fee — HOA does not govern the course, a distinct `golf_structure` case worth keeping
as its own enum value alongside bundled/equity/optional/none, since "the course is public, the HOA
isn't the club" is a real, different structure from all four already in the schema's CHECK
constraint — flag for the implementation plan, may need a fifth enum value or a `none`-with-note).
Same rule as the first pass: names are discovery targets, not data.

**Third seed pass (operator, same session) — treat "complete" claims skeptically.** A third
AI-synthesized list added ~15 more names, claiming the combined total is now "~82" — directly
contradicting the second pass's own claim of "nearly 100." That inconsistency, from the same tool
two answers apart, is the reason an AI chat overview can never BE the completeness check for this
build — it doesn't know what it's missing and asserts "complete" regardless. The real
completeness check stays the one already in step 3: cross-reference the merged discovery set
against `communitypay.us`'s full per-city name registry (1,537 for Naples alone; check its Lee
County city pages the same way) — real registries, not another chat round.

Names added this pass (unverified, discovery-only, same as above): Aqualane Shores/Royal
Poinciana, Calusa Pines, Hammock Bay, The Estates at Classics Plantation (Lely sub-HOA), Old
Collier Golf Club, Quail Creek Estates (distinct from Quail Creek Village per the source), The
Hideout Golf Club, The Rookery at Marco, Valencia Golf & Country Club, Crown Colony Golf & Country
Club, Miromar Lakes Beach & Golf Club, Savona/Grande Oaks (Grandezza sub-neighborhoods), Palmetto-
Pine Country Club Area, Shell Point Golf Club, Town and River/Landings subsections.

### Out of scope for this design

- Drive-times / nearby-dining (Mapbox enrichment, Phase 3 in the original migration comment) —
  separate follow-up pass, not blocked by this one.
- SteadyAPI `/neighborhood-amenities` — explicitly not used, per operator instruction this session.
- A recurring cadence/cron — deferred to a follow-up decision once the backfill is live.
- Using `communitypay.us` for anything beyond the completeness check in step 3 — it has no amenity
  data to contribute, confirmed live.
