**RESOLVED 08/03/2026 (Sonnet 5).** All 3 investigation questions answered from our own code +
a live query (no 3-6 listing sample needed): the property_id-keyed FREE lane (§ below, question 2)
already exists as `data_lake.listing_state.baths` — filled by the nightly ingest's lat/lon-clustered
`/nearby-home-values` batch enrich, never address-matched, so it resolves streetless listings too.
Live fill rate: 20.1% addressed / 15.2% streetless (a backlog-completeness gap, not an
address-availability one). Shipped `fetchLakeBathsByPropertyId()` (`select.ts`) +
`enrichBaths()` (`listings-showcase.ts`), TDD, additive only. Full writeup:
`_RESEARCH/data-and-ingest/2026-08-03-listings-baths-fill-rate-and-lake-lane.md`. Backfill
completeness gap tracked as check `listing_state_baths_backfill_completeness`, not fixed here
(real vendor quota, needs operator go-ahead). `comp-helper.ts`/`under-contract.ts` NOT touched,
per this doc's own instruction — same lane would likely help them too, separate PR.

---

# Real baths on every listing card — handoff for Opus

**Written:** 08/03/2026, Sonnet 5 session (listings-showcase build).
**Why this is its own handoff, not just a fix:** the obvious-looking fix (call the baths
helper we already have) only works for listings with a real street address. A chunk of
real inventory this session actually hit — new-construction spec homes — comes back with
NO usable address (see the companion fix, commit `c7fe7bff`), so the existing baths lane
structurally cannot fire for them. Proving out a real fix needs more than the 3-home
sample this session used; that's the part worth a fresh, deeper session.

## The complaint, verbatim

Operator: "WE CAN'T HAVE BED AND SQ FT WITHOUT BATHS. HERE IS HOW REALTOR.COM DOES IT" —
five real screenshots of realtor.com's own saved-search digest email. Every single card in
every screenshot reads `{beds} bed {baths} bath {sqft} sqft` as one line — beds and sqft
alone, no baths, is not a format they ever ship. Screenshots are in
`C:\Users\ethan\OneDrive\Documents\Pictures\Screenshots 1\Screenshot 2026-08-03 150322.png`
(and `150328`/`150347`/`150358`/`150406` — the other four, all confirming the same
3-field line).

## Where this shows up right now

`lib/deliverable/recipes/listings-showcase.ts` (commit `2c8c75c6` + fixes `fc1b42b6`,
`c7fe7bff`, this session) — the new recipe distilled from a real Zillow email. Its
`fallbackHighlight()` builds a spec-based title from whatever fields the `Listing` object
holds: `l.bedrooms`, `l.bathrooms`, `l.squareFootage`. **`l.bathrooms` is ALWAYS `null`**
for every listing this recipe sources, because of the next section.

## The root cause — verified live, not guessed

`fetchPhotoListings()` (`lib/listings/steadyapi.ts`) hits SteadyAPI's `/search` endpoint.
Its `normalizeResult()` sets `bathrooms: null` UNCONDITIONALLY (line ~233) — the raw
`RawResult.description` type it parses only declares `beds`, `sqft`, `lot_sqft`. Verified
against the actual live response shape used in this session (real Cape Coral listings) —
`/search` genuinely does not carry a bath count. This is a pre-existing, honest gap
(`bathrooms: null` is correct code for "we don't have it," not a bug in isolation) — the
bug is only that a card built without a real bath count still looked complete.

## A real baths lane ALREADY EXISTS — but only works for addressed listings

`lib/listings/resolve-subject.ts`, function `withBaths()` (~line 407-453), landed
08/02/2026 (per its own comment) specifically because "every listing in the product
shipped a blank Baths cell." Two lanes, in order:

1. **FREE — LeePA (Lee County Property Appraiser) tax-roll lake table**, function
   `fetchLeePaBathsFromLake()` (~line 125). Reads `data_lake` (a lee_comp_sales_v-backed
   view) for `baths` by exact street-address match. **Requires a parsed HOUSE NUMBER from
   the target address string** (line 430: `/^\d+$/.test(target.split(" ")[0])`) — no
   house number, no lookup attempted at all.
2. **PAID — SteadyAPI `/nearby-home-values`**, function type `FetchNearbyFn`. Calls the
   endpoint with the subject's own `lat`/`lon`, then finds the subject IN the returned
   "nearby" set by matching `canonStreet(c.addressLine) === target` (line 447) — i.e. it
   STILL requires a known target address string to pick itself out of the nearby list. One
   vendor call, verified live 07/13/2026 (326 Shore Dr → baths 3.5, per the code comment).

**Both lanes require a real target street address to match against.** `withBaths()` is
called from `resolveSubjectListing()` for the single-address flyer path (new-listing,
just-sold, etc.) where the address is always known — that's why it works there. It has
never been used against a BATCH of `/search`-sourced listings, and it CANNOT be dropped
in as-is for any listing whose `addressLine1` is empty — which, per this session's other
fix (commit `c7fe7bff`), is exactly the new-construction/spec-home listings that
`fetchPhotoListings` also returns. A live Cape Coral sample this session pulled had 2 of 3
picked listings in that address-less bucket.

## Why this needs a real investigation, not a 3-home patch

1. **How often does each lane actually fire, at real scale?** This session only ever
   looked at 3-6 listings from one ZIP. Before building anything, pull `fetchPhotoListings`
   for a few different SWFL cities (Cape Coral, Fort Myers, Naples — the constants already
   in `lib/listings/select.ts`'s `COUNTY_ANCHOR_CITY`), count how many rows have a real
   `addressLine1` vs. empty, and of the addressed ones, what fraction LeePA actually
   resolves vs. falls to the paid `/nearby-home-values` lane. That ratio decides whether
   this is "wire the existing helper, done" or "most real inventory needs a second idea."
2. **Is there a per-`property_id` detail call that sidesteps the address-match problem
   entirely?** We already hold `raw.property_id` per `/search` row (see `normalizeResult`,
   `id: sa_${id}`) even for address-less listings. `docs/steadyapi-research/` (gitignored,
   local-only — check it first, RULE 0.4) and the vendor's own docs may have a
   `/property-details?id=` or similar endpoint keyed by ID, not address — if SteadyAPI can
   return a bath count for a KNOWN property_id, that's a clean third lane that works for
   EVERY listing this recipe (and any future one) ever returns, address or not. Verify live
   via crawl4ai against SteadyAPI's docs before assuming this exists or building around it.
3. **Cost/rate reality at the scale the next handoff (multi-category recipe) will need.**
   The companion Sonnet handoff (`2026-08-03-listings-multi-category-HANDOFF.md`) wants
   MANY more than 3 homes across MULTIPLE categories in one email. If baths enrichment
   needs one paid vendor call per listing, that's N calls per send, N sends per day, against
   a 50,000/month, 1 req/s quota (`docs/standards/emails.md` §8 vendor reality). Whatever
   lane you land on here needs to say, explicitly, what it costs at that volume — this
   session's fix must not silently make the next one impossible to ship within quota.

## What NOT to do

- Do not fake, estimate, or infer a bath count from beds/sqft/price — a miss stays an
  honest gap (the existing `withBaths()` doctrine: "Any miss leaves baths undefined and
  the cell simply doesn't render. Never invents a count." — keep that exact standard).
- Do not change `withBaths()`'s existing single-address callers' behavior — new-listing,
  just-sold, etc. already work; this is additive.
- Do not spend real vendor quota in the dev loop — mock/cache during investigation, real
  spend only on the final verified serve (`docs/standards/data-and-build-bible.md` §0.1-0.2,
  already governs every pipeline in this repo).

## Where to land it

Once you know the real fill-rate and have picked a lane (or lanes, in provenance order —
free before paid, same doctrine as `withBaths()`), wire it into
`lib/deliverable/recipes/listings-showcase.ts`'s highlight/card-building path (and note in
the commit that `lib/assistant/comp-helper.ts` + `lib/deliverable/recipes/under-contract.ts`
are the other two `fetchPhotoListings` consumers — check whether they'd benefit too, but
don't touch them speculatively). Match the realtor.com card format from the screenshots:
`{beds} bed {baths} bath {sqft} sqft`, all three or the card is asking for a spec it can't
back up — if baths still can't be resolved for a given listing after all lanes, that
listing's spec line should honestly show only what it has (never a blank "bath" slot
either — drop the field, don't render an empty one), consistent with this repo's
open-slot-not-a-guess convention everywhere else.
