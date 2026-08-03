# Multi-category listings digest — handoff for a fresh Sonnet session

**Written:** 08/03/2026, Sonnet 5 session (listings-showcase build).
**Ask, verbatim:** "HAVE ANOTHER SONNET WORK ON THIS LONGER EMAIL STRUCTURE WITH DIFFERENT
CATAGORIES AND THUMBNAILS OF HOMES IN THEIR REPSECTIVE CATAGORIES."

This is real design + build work — run `superpowers:brainstorming` first (RULE 3.5), same
as any new recipe. This handoff hands you VERIFIED FACTS to brainstorm from, not a
pre-baked plan — don't skip the brainstorm because the facts below feel like enough.

## The reference — realtor.com's OWN real saved-search digest email

Five real screenshots the operator captured, in
`C:\Users\ethan\OneDrive\Documents\Pictures\Screenshots 1\`:
`Screenshot 2026-08-03 150322.png`, `150328.png`, `150347.png`, `150358.png`, `150406.png`.
Read them directly (vision, no paid API) before starting — this description is a summary,
not a substitute.

**Structure, top to bottom:**
1. realtor.com logo header.
2. Optional area-stats block: "33919 by the numbers" — median days on market, median
   list price, one CTA button ("See more data").
3. **Multiple category sections, each its own bordered card**, in this order in the
   captures: "50+ new listings" (with a city subtitle, "Fort Myers"), "New construction
   homes" (own city subtitle), "Recommended homes", "50+ sold listings", "50+ price
   drops". Each section = a bold header, optional city subtitle, a 2×2 grid of home
   cards, and its own CTA button ("View new listings" / "View more" / "View price drops").
4. **Every card, identical shape across every category:** photo → status dot + label
   (green "• For sale" or red "• Sold") → price in bold, WITH a green "↓ $N,NNN" cut badge
   inline next to it when the listing has a real price reduction → spec line
   `{beds} bed  {baths} bath  {sqft} sqft` (all three, space-separated — see the companion
   baths handoff, `2026-08-03-listings-baths-HANDOFF.md`, that gap blocks this one from
   matching the reference exactly) → two-line address (street, then "City, ST ZIP") → a
   red underlined "View listing" link.
5. An interstitial financing cross-sell banner ("Get a mortgage rate quote without
   impacting your credit — Get started") between some sections.
6. A final broad CTA ("Keep searching").
7. Footer: logo, tagline, real postal address, Privacy/Unsubscribe links, copyright.

**This is genuinely different from `listings-showcase.ts`** (this session's build,
`lib/deliverable/recipes/listings-showcase.ts`, commit `2c8c75c6` + fixes `fc1b42b6`,
`c7fe7bff`) — that recipe is deliberately minimal (3 homes, no price/spec sheet, one
editorial hook each, distilled from a DIFFERENT source — a Zillow curated-discovery send).
This handoff is for realtor.com's format instead: spec-sheet-forward, MULTIPLE homes per
category, MULTIPLE categories. Don't try to make one recipe do both jobs — the operator
asked for "another Sonnet" on "this longer email structure," reading as a second, distinct
recipe, not a rewrite of the first.

## What we already have, ready to reuse — don't rebuild these

- **Real listing supply at scale.** `fetchPhotoListings()` (`lib/listings/steadyapi.ts`)
  already returns up to `limit` (default 200) real photo-bearing listings per city from
  SteadyAPI's live `/search`, each with `photoUrl`, `listingUrl` (real realtor.com detail
  link — see `canonicalRealtorUrl`), `price`, `bedrooms`, `squareFootage`, `lotSize`,
  `isNewConstruction`, `isPriceReduced`, `priceReduction`, `isNewListing`,
  `daysOnMarket`. 200 is plenty of raw material for 3-5 categories × 4 cards each.
- **A categorization pattern already exists.** `listings-showcase.ts`'s `CANDIDATES` array
  (new-construction / big-lot / low-maintenance / price-cut / just-listed / big-house) is
  eligibility-rule-per-category logic keyed on real fields — the SAME shape you need here,
  just used to SORT listings into sections instead of picking one highlight per home. New
  construction and price-cut map directly onto realtor.com's own "New construction homes"
  and "50+ price drops" sections. You'll need to invent "Sold" as a category too — that's a
  DIFFERENT data shape (see the gap below).
- **A card block that already renders price + specs**, unlike `listings-showcase.ts`'s
  `signal`/`image` combo: the **`listing` block type** (`ListingProps` in
  `lib/email/doc/types.ts`, renderer `lib/email/blocks/ListingBlock.tsx`) already has
  `photoUrl`, `price`, `beds`, `baths`, `sqft`, `address`, `badge`, `linkUrl` and renders
  `{beds} bd {baths} ba {sqft} sqft` as one line (currently abbreviated "bd"/"ba" — check
  whether to match realtor.com's fuller "bed"/"bath" or keep our existing abbreviation,
  that's a real design call, not a given). `badge` is built for exactly a "Just Sold" /
  "Price Reduced" tag per the type comment — a plausible home for the green ↓cut indicator,
  though the screenshots show it inline next to price, not as a badge; look at both and
  decide, don't assume the closest existing field is automatically the right one.
- **The multi-column block** (`MultiColumnProps`, 2-3 `columns[]`, each with `imageUrl`/
  `heading`/`body`/`linkUrl`/`linkLabel`) is the closest existing 2-per-row layout
  primitive if `listing` blocks turn out not to tile the way the screenshots show — check
  `GRID_COLS` (`lib/email/grid-schema.ts`) and how `listings-showcase.ts`'s `push()` helper
  assigns `span` to understand whether two `listing` blocks at `span: GRID_COLS/2` sit side
  by side the way the reference's 2×2 grid does, or whether they stack full-width instead
  (this session never tested a non-full-width span — verify, don't assume).
- **The builder-composes-own-grid pattern.** `back-on-market.ts` and `community-info.ts`
  (both landed 08/03/2026, same day) are the freshest precedent for an area-spined recipe
  that builds its own layout via `finalizeDoc`/`PlanEntry` rather than a fixed
  `default-docs.ts` skeleton — `listings-showcase.ts` follows the same pattern and is the
  most directly relevant one to fork from, since it's already wired into `RECIPE_KEYS`/
  `RECIPE_BUILDERS`/`index.ts` and already proven to build+send end to end.

## A real gap this handoff does NOT resolve — "Sold" needs its own data source

`fetchPhotoListings` only returns ACTIVE for-sale listings (`/search` is a for-sale
endpoint). A "50+ sold listings" category needs a genuinely different source — check
`docs/standards/data-roots.md`'s "sold" section FIRST (RULE 0.55, this is the ONE catalog
for which table feeds any concept) before wiring anything; `lee_deed_official_records` /
LEEPA lanes are named there as the sold-price authority, NOT SteadyAPI. Do not assume a
sold category is in scope for a first version — it may be a deliberate v2 cut, decide and
say so explicitly rather than silently dropping it.

## Real constraints already governing every recipe in this file — read before designing

- **No-invention gate, everywhere.** Every card's every field must trace to a real held
  value — same doctrine `listings-showcase.ts` already follows (see its own PROVENANCE
  comment and `assignHighlights`' "never invents" discipline). A category with too few
  real qualifying listings shows fewer cards, never a padded/invented one.
- **`positioning: "sell-side" | "story-side"`** is a required field on every `Recipe`
  (`lib/deliverable/recipes.ts`) — decide which this is; a multi-listing discovery digest
  reads story-side like `listings-showcase`, but a case could be made either way — argue
  it, don't default silently.
- **The hard no-repeat rule** landed this session (commit `fc1b42b6`, `c7fe7bff`) applies
  here too if any two cards could ever read identically — same class of bug, same
  standard: never ship it.
- **CAN-SPAM footer, url-lint, real send-lane parity** — follow `docs/standards/emails.md`
  §6 exactly as `listings-showcase.ts`'s own proof script did
  (`scripts/email/tmp-listings-showcase-send.mts`, gitignored local-only,
  `scripts/email/tmp-*.mts` — a good template for a first proof send of this new recipe,
  but write your OWN copy; don't mutate the existing one out from under a possible future
  re-run of it).
- **Verify with `bunx next build`, not `npx tsc`** (this repo's ruled command) — and check
  `git status`/`git log` for concurrent-session files before touching anything shared
  (`schema.ts`, `types.ts`, block renderers) — this session hit a live concurrent-session
  collision on exactly those files; read `SESSION_LOG.md`'s most recent entries for current
  state before assuming the tree is clean.

## What to actually deliver

A NEW recipe (new `RecipeKey`, new builder file under `lib/deliverable/recipes/`,
registered in `index.ts` — follow `listings-showcase.ts`'s own registration as the
template) that builds a real, multi-category, multi-home-per-category digest from real
SteadyAPI inventory, verified with real tests (mirror `listings-showcase.test.ts`'s
FM1-style failure-mode coverage) and a real send proof to `hello@swfldatagulf.com`, same
standard of evidence this session held itself to (pasted resend id, grepped rendered HTML,
not just "it built"). Brainstorm the exact category set, card density, and whether to
reuse `listing` blocks or something new — that decision is yours to make and justify, not
pre-made here.
