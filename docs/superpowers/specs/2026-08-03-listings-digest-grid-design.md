# Multi-category listings digest with a reusable `listing-grid` block

**Date:** 08/03/2026
**Status:** design, awaiting operator approval
**Check:** `listings_digest_grid_live_verify`
**Handoff this answers:** `_ASSISTANT/2026-08-03-listings-multi-category-HANDOFF.md`
**Operator ask, verbatim:** "We need to create the recipe to produce emails like realtor.com.
Categories. No dupes on homes in different categories. 4-6 thumbnails. Not sure if they are all
zip or city connected."

---

## Problem

We have one multi-home recipe, `listings-showcase.ts` (landed 08/03/2026) — three homes, one
editorial hook each, no price, no spec sheet. It was distilled from a Zillow curated-discovery
send and it does that job.

It is not the realtor.com saved-search digest, which is a different email entirely: several
**category sections**, each a bordered card holding a **2x2 grid of spec-forward home cards**,
each with its own header, city subtitle, and CTA. Five real screenshots of a real realtor.com
digest are the reference (`C:\Users\ethan\OneDrive\Documents\Pictures\Screenshots 1\`,
`Screenshot 2026-08-03 150322/150328/150347/150358/150406.png`), read directly with vision.

Structure taken (arrangement only — never the source's copy, images, or brand):
ZIP stat header -> repeated category sections -> per-section 2-across photo cards -> per-section
CTA -> closing CTA -> footer.

## Goal

A new recipe that builds a real, multi-category, multi-home digest from real inventory, where:

1. Each category is **one reusable grid block** so any category grid can be dropped into any
   email from the palette (operator decree: "Go each category as a grid so we can add any to any
   email easily").
2. **No home appears in two categories** in the same email.
3. Each category shows **4-6 real home thumbnails** — real listing photos, real click-through
   links, never a padded or invented card.
4. Scope is **ZIP-first, with a city expansion derived from ZIP polygons** (operator: "focus on
   zip and then add a city filter based on zip polygons").

---

## 1. Why a new block type, and what it costs

The binding constraint is not aesthetics — it is the **20-block cap**
(`lib/email/doc/schema.ts:399`, `z.array(BlockSchema).min(1).max(20)`, enforced by `capBlocks` in
`lib/email/doc/finalize-doc.ts:151`).

Rendering each home as an existing `listing` block at `span: 6` (2-across — `[6,6]` is already a
blessed row multiset, `block-contract.ts:120`) costs **6 blocks per category** (4 cards + title +
CTA). After header and footer that leaves 18, so the ceiling is **3 categories x 4 cards and
nothing else** — no hero, no intro, no closing CTA. At 6 cards per category only two categories
fit.

The operator chose the block-type route with that arithmetic in front of him. One `listing-grid`
block renders a whole category, so the budget becomes:

```
header + hero + 5 x listing-grid + closing CTA + footer = 9 blocks
```

Headroom instead of a ceiling, and the grid is reusable from the palette — which the
per-`listing` approach can never be, since a category there is six loose blocks the user would
have to assemble by hand.

**The cost, stated plainly.** A new block type touches `lib/email/doc/types.ts`,
`lib/email/doc/schema.ts`, `lib/email/doc/block-contract.ts`, `DEFAULT_BLOCK_PROPS`
(`lib/email/doc/default-docs.ts`), `lib/email/blocks/BlockRenderer.tsx`, a new
`lib/email/blocks/ListingGridBlock.tsx`, and **all three render engines**
(`docs/standards/emails.md` §5 — free-tier email, grid-tier email, PDF; a block that renders in
one and not the others is this repo's documented recurring failure). Four of those files were held
by a live parallel session (`0410bb23`) during this design pass — it moved
`lib/deliverable/recipes/market-comps.ts` 19 seconds into the session. See §9 for the landing
order that de-risks this.

### Rejected alternative: reuse the `list` block

`ListItem` already carries `imageUrl`/`imageAlt` (landed 08/03/2026) and `ListProps.items` allows
up to 8 — one `list` block per category would have been free. **Disqualified:** the thumbnail is
hardcoded 56x56 (`lib/email/blocks/ListBlock.tsx`, `width: 56` on both the `Img` and its wrapper
cell). That is an avatar, not a home photo, and widening it would retune the comp rows in
`market-comps` that share the block. Recorded so nobody re-proposes it.

---

## 2. The block — `listing-grid`

```ts
/** One home in a category grid. Every field is DATA-SEEDED from a real listing —
 *  outside the AI content-patch allowlist, exactly like ListingProps' price/beds. */
export interface ListingGridCard {
  /** REQUIRED. The listing's own photo, passed through verbatim — never constructed,
   *  never a map tile. A card without one is dropped, never rendered. */
  photoUrl: string;
  photoAlt?: string;
  /** REQUIRED. Real listing-detail URL. A card without one is dropped. */
  linkUrl: string;
  /** "For sale" / "Sold" — drives the status dot color via statusTone. */
  statusLabel?: string;
  statusTone?: "active" | "sold";
  price?: string;        // "$235,900"
  priceCut?: string;     // "$1,600" — rendered as a green cut badge beside price
  specs?: string;        // "3 bed  2 bath  1,295 sqft" — all three or absent (§5)
  addressLine1?: string; // "1442 Byron Rd"
  addressLine2?: string; // "Fort Myers, FL 33919"
}

export interface ListingGridProps extends BlockBase {
  title?: string;     // "New construction homes"
  subtitle?: string;  // "Fort Myers"
  cards: ListingGridCard[]; // 0-6; a structural exception ordered by array position
  ctaLabel?: string;
  ctaUrl?: string;
}
```

**Contract entry:** `{ authorable: false, bandable: true, zone: "body", menu: { label: "Listing
Grid", icon: "⊞" } }` — the same shape as `listing`: not AI-authorable (held listing data is
never model-written), but present in the palette so it is user-addable to any email.

**Card cap 6, min 0.** Schema `z.array(ListingGridCardSchema).max(6)` with **no `.min(1)`** —
deliberately unlike `ListProps.items`. A palette-added grid starts empty, which is the repo's
open-slot convention (`lib/email/CLAUDE.md`, THE SLOT RULE); a `.min(1)` would force
`DEFAULT_BLOCK_PROPS` to ship a placeholder card with a fabricated photo. The renderer emits
nothing for an empty grid in a sent email, and an empty-state outline only when `scope` is present
(canvas) — the same `props.badge || scope` pattern `ListingBlock.tsx` already uses.

**Layout:** cards tile 2-across inside the block via the Cerberus hybrid pattern already used by
`multi-column`. The grid is internal to the block, so it never interacts with `snapRowSpans`. An
odd card count leaves the last card half-width in its row; that is the accepted degradation, not a
bug to pad around.

---

## 3. Categories and the no-duplicate-home algorithm

Every category is guarded by a **real vendor field** verified present in `normalizeResult`
(`lib/listings/steadyapi.ts:166-283`). Priority order is **scarcest first** — this is
load-bearing, not cosmetic: a broad category assigned first eats the inventory and every narrow
category below it renders empty.

| # | Category | Title | Eligibility (real field) |
|---|---|---|---|
| 1 | `new-construction` | New construction homes | `isNewConstruction === true` |
| 2 | `price-drops` | Price drops | `isPriceReduced === true && (priceReduction ?? 0) > 0` |
| 3 | `just-listed` | Just listed | `isNewListing === true` |
| 4 | `big-lot` | Room to spread out | `lotSize != null && lotSize >= 0.5` (acres) |
| 5 | `more-homes` | More homes in {city} | always eligible — the catch-all, assigned last |

**The algorithm** (pure, exported, unit-tested):

```
pool = ranked, deduped, photo-and-link-bearing listings   // ZIP-filtered first (§4)
for each category in priority order:
    take = pool.filter(category.eligible).slice(0, MAX_CARDS)   // MAX_CARDS = 6
    if take.length < MIN_CARDS:                                 // MIN_CARDS = 4
        take = backfill from the city-wide pool, ranked order   // §4 lane 5
    if take.length < MIN_CARDS: skip this category entirely
    take = take.slice(0, largest even count <= take.length)     // 4 or 6, never 5
    pool = pool minus take                                      // <- the no-dupe guarantee
    emit a grid for the category
```

Removing each category's picks from the pool before the next category runs is the whole
no-duplicate mechanism. It is a single-pass greedy assignment, not an optimizer — deliberate
(RULE 11: our volume does not justify a matching algorithm here).

**`MIN_CARDS = 4`, matching the ask ("4-6 thumbnails") and the reference, which ships exactly 4
in every section of every screenshot.** A category that cannot reach four real qualifying homes —
**after** the city backfill in §4 has had its turn — is dropped from the email entirely, never
padded. RULE 0.7's no-invented-card rule applied at the section level. This makes the §4 backfill
load-bearing rather than decorative: at a 4-card floor it is the common path for scarce
categories in a thin ZIP, not an edge case.

**Emitted card count is 4 or 6 — never 5.** The grid tiles 2-across, so an odd count leaves an
orphan half-width card. The SCHEMA still allows 0-6 (§2) because a hand-built palette grid may
hold any count the user drags in; the RECIPE only ever emits an even one. An implementer reading
`MAX_CARDS = 6` alone would ship 5-card sections — hence this sentence.

**Dedupe key** is `addressLine1 || id`, verbatim from `listings-showcase.ts` — new-construction
spec homes come back with no confirmed street address (their permalink names a model, not an
address, `steadyapi.ts:193-205`), so keying on address alone would collapse distinct real homes
into one.

---

## 4. Scope — ZIP-first, city expansion via ZIP polygons

The operator's question ("Not sure if they are all zip or city connected") has a factual answer
and a live defect behind it.

**The fact:** SteadyAPI `/search` is **city-slug scoped** (`cityToSlug` -> `Fort-Myers_FL`,
`steadyapi.ts:35`). ZIP exists only per listing, parsed back out of the permalink slug
(`zipCode`, `steadyapi.ts:206`). The reference does the same split — header spined on the ZIP
("33919 by the numbers"), sections subtitled with the city ("Fort Myers"), and its own
"Recommended homes" section quietly crosses from 33919 into 33905.

**The defect found while confirming this — check `zip_scope_resolves_to_county_anchor_city`:**
`scopeCity()` (`lib/listings/select.ts:53-64`) does not resolve a ZIP to its city. It maps
ZIP -> county -> **the county's anchor city** (`COUNTY_ANCHOR_CITY`, line 33). So ZIP 33919
(Fort Myers) resolves to **Cape Coral**, and `listings-showcase.ts` — which calls `scopeCity` on
its ZIP today — builds Cape Coral homes for a user who named a Fort Myers ZIP. ZIP-strict
filtering on top of that would return zero cards, since no Cape Coral listing carries 33919. This
recipe must not use `scopeCity` for a ZIP.

**The lane, in provenance order (free before paid, both halves already in the repo):**

1. **ZIP -> city.** `fixtures/swfl-place-zip-crosswalk.json` is the sourced lane (USPS ZIP Code
   Lookup, `source` + `verified_date` per entry); 33919 is an `alt_zip` of Fort Myers.
   `cityForZip()` (`lib/swfl-zip-city.ts:140`) keys 33919 directly but carries no per-entry
   source. **Read the crosswalk first, fall back to `cityForZip`** — cited lane wins, and the
   fallback keeps the build total.
2. **Query** SteadyAPI for that city.
3. **ZIP-strict filter.** Keep listings whose parsed `zipCode === ctx.zip`. Free, no geometry.
4. **Polygon assist.** A listing whose permalink carries no parseable ZIP but does carry
   `latitude`/`longitude` gets its true ZIP by point-in-polygon against
   `fixtures/swfl-zip-polygons.json` (2020 TIGERweb ZCTA, tracked, 58 SWFL ZIPs). This is the
   operator's "zip polygons" half, and it matters most for exactly the address-less
   new-construction rows that lane 3 drops.
5. **City backfill.** A category short of `MIN_CARDS` (4) after the ZIP filter draws from the rest
   of the queried city, **in `rankListings` order — the same ranking the ZIP pool uses**, so
   backfill never reorders quality. **Every backfilled card states its own city and ZIP in
   `addressLine2`**, so the reader is never told a 33907 home is in 33919. This is the "add a city
   filter" half.

   **The no-duplicate guarantee spans both pools.** A backfilled home is removed from the shared
   pool exactly like a ZIP-local one, so F2 holds across the ZIP/city boundary — a home cannot
   appear as a ZIP-local card in one category and a backfilled card in another. The ZIP pool and
   the city pool are two views of one pool, not two pools.

**No ZIP named -> return null**, same as `listings-showcase` (never guess an area the user did not
name).

**New module:** `lib/geo/point-in-zip.ts` — a pure ray-casting point-in-polygon over the tracked
ZCTA fixture, MultiPolygon-aware (the fixture declares `multipolygon_zips: ["33956","34102"]`).
No TS point-in-polygon helper exists in the repo today (the only one is Python,
`ingest/lib/zcta_assign.py`). ~40 lines, unit-tested against known in/out coordinates. It touches
no shared file.

---

## 5. The spec line — where v1 falls short of the reference, honestly

Every card in every reference screenshot reads `{beds} bed  {baths} bath  {sqft} sqft`. The
operator was explicit: "WE CAN'T HAVE BED AND SQ FT WITHOUT BATHS."

**`/search` returns no bath count.** `normalizeResult` sets `bathrooms: null` unconditionally
(`steadyapi.ts:245`) — the raw `description` it parses declares only `beds`, `sqft`, `lot_sqft`.
Verified live in the prior session against real listings.

**Rule for v1: the spec line renders only when beds, baths, AND sqft are all real. Otherwise it is
omitted entirely** — never a two-field line, never a blank "bath" slot. The card then carries
photo, status, price, address, and link, which is still a complete honest card.

That means **every v1 card ships without a spec line** until the baths lane lands
(`_ASSISTANT/2026-08-03-listings-baths-HANDOFF.md`, an open Opus task: `withBaths()` in
`lib/listings/resolve-subject.ts` works only for listings with a parsed house number, and a live
sample had 2 of 3 picks address-less). This is the one place v1 does not match the reference. It
is stated, not buried, and it turns on automatically the moment `l.bathrooms` is populated — no
change to this recipe.

**`sold` is a v1 cut.** `/search` is a for-sale endpoint; a sold category needs
`lee_deed_official_records` / LEEPA per `docs/standards/data-roots.md`, a genuinely different
source. Worth noting the reference's own sold cards show **no price at all**, and one ships a
visible data bug ("do_not_use, FL 33919") — we will ship neither.

---

## 6. Failure modes and the guard that stops each (RULE 3.5)

No design is approvable without this section. Each guard is a test or a gate, never a comment.

| # | Failure mode | Guard |
|---|---|---|
| F1 | **Aerial/map tile shipped as a home photo.** Top of the scratchpad today: "WE CAN'T HAVE FUCKING ARIEL VIEWS....AGAIN!!!! PHOTOS OF THE FUCKING LIS…" — `ListItem.imageUrl` took Mapbox aerials hours ago. | Builder passes `l.photoUrl` through verbatim and never constructs a URL. **Test:** a listing whose `photoUrl` host is `api.mapbox.com` is DROPPED, not rendered. Assert the host on every emitted card. |
| F2 | **Same home in two categories.** The operator's explicit ask. | Pool-removal in the assignment loop (§3), over the SHARED ZIP+city pool. **Test (a):** across all emitted grids the multiset of dedupe keys has no repeat, on a fixture where one listing qualifies for three categories. **Test (b):** the same home cannot appear ZIP-local in one category and backfilled in another. |
| F2b | **A section ships with 2-3 cards, or 5.** The ask was 4-6; the reference is always 4. A thin section under a bold header is the same complaint pattern already on the scratchpad. | `MIN_CARDS = 4` enforced AFTER backfill; emitted count snapped to the largest even value (§3). **Test:** every emitted grid holds exactly 4 or 6 cards; a category that cannot reach 4 post-backfill emits no grid at all. |
| F3 | **Broad category eats inventory, narrow ones render empty.** | Scarcity-ordered assignment. **Test:** a pool where every home also matches `more-homes` still fills `new-construction` first. |
| F4 | **`capBlocks` silently truncates.** It runs before the zone sort and trims from plan-order tail, so an over-budget plan drops the last categories and the closing CTA while the footer survives — and it looks fine in code review. | **Test:** planned category count === rendered `listing-grid` block count, at max categories. |
| F5 | **Wrong city for a named ZIP.** `scopeCity` returns the county anchor (§4). | Recipe never calls `scopeCity` for a ZIP. **Test:** ZIP 33919 resolves to "Fort Myers", never "Cape Coral". |
| F6 | **A backfilled card implies it is in the named ZIP.** | Every card's `addressLine2` states its own city + ZIP. **Test:** a city-backfilled card renders its own ZIP, not the requested one. |
| F7 | **Dead card — missing photo or link.** | A listing missing either is skipped (RULE 0.7, verbatim from `listings-showcase`). **Test:** neither field is ever empty on an emitted card. |
| F8 | **Partial spec line ships (beds + sqft, no baths).** | All-three-or-omitted rule (§5). **Test:** a listing with `bathrooms: null` emits no `specs` field at all. |
| F9 | **Block renders in one engine, not the others** — this repo's documented recurring failure (`emails.md` §5). | `ListingGridBlock` wired into all three engines in the SAME commit, with a render-parity test per engine. |
| F10 | **Two cards read identically.** The hard no-repeat rule (commits `fc1b42b6`, `c7fe7bff`). | Distinct real homes carry distinct addresses/prices. **Test:** no two emitted cards are field-identical. |
| F11 | **Empty palette-added grid crashes or ships a hollow card.** | `cards` has no `.min(1)`; renderer returns null when empty, empty-state only under `scope`. **Test:** an empty grid renders nothing in the sent HTML. |
| F12 | **Vendor throttle silently reads as "no homes".** `/search` degrades to `[]` on 429 after bounded retry. | `onDegrade` is already available on `SteadyFetchDeps`. Recipe returns **null** (falls through to another recipe) rather than an email with zero categories. **Test:** a degraded fetch returns null, never an empty digest. |

---

## 7. Tests (TDD — RULE 3.5, each named for the failure mode it targets)

`lib/deliverable/recipes/listings-digest.test.ts`, mirroring `listings-showcase.test.ts`'s
FM-style coverage, all against fixtures with an injected `loadListings` dep — **zero vendor quota
in the dev loop** (`data-and-build-bible.md` §0.1-0.2).

- `assignCategories` pure-function tests: F2 (a and b), F2b (4-or-6, and the sub-4 category
  dropped after backfill), F3, backfill draw order, dedupe key.
- Builder tests: F1, F4, F5, F6, F7, F8, F10, F12.
- Block tests: F9 (three-engine parity), F11.
- `lib/geo/point-in-zip.test.ts`: known in/out points, a MultiPolygon ZIP, a point outside all.

Verification command is `bunx next build`, not `npx tsc` (this repo's ruled command).

---

## 8. Recipe registration

New `RecipeKey` `listings-digest`, builder `lib/deliverable/recipes/listings-digest.ts`,
registered in `RECIPE_KEYS` / `RECIPE_BUILDERS` / `index.ts` following `listings-showcase.ts`'s
own registration verbatim.

**`positioning: "story-side"`** — argued, not defaulted: the email pitches no specific property
and no agent brand. It is recurring discovery content for a saved-search audience, the same job
`listings-showcase` does. A sell-side reading would only hold if the agent's own listings were the
categories, which they are not. `FAVORABLE_FRAMING_POLICY` is therefore **not** pasted into
anything here — there is no LLM prompt in this recipe at all.

**No LLM call.** Every string is deterministic: category titles are fixed, prices/specs/addresses
are restated verbatim from held vendor fields, the subject is composed in code. Same doctrine as
`listings-showcase`'s `assignHighlights`. This also means nothing to add to
`repo-inventory-audit.md`'s `#llm-call-sites-email`.

**Subject** varies per build (a repeat subject invites client threading — caught live 08/03/2026):
composed in code from the real category and home counts, carried on `subjectVariants`, routed
through `lib/deliverable/recipes/subject-lines.ts`.

---

## 9. Landing order (parallel-session contention)

Session `0410bb23` held `types.ts`, `schema.ts`, and `ListBlock.tsx` during this design and was
actively editing `market-comps.ts`. RULE 1.5 applies.

1. **Confirm contention has cleared** (`repolith claim list`, `git status`) before touching any
   shared file. If it has not, do the work in a worktree via `scripts/worktree.mjs`.
2. **Commit A — the block, standalone and useful on its own:** `types.ts`, `schema.ts`,
   `block-contract.ts`, `DEFAULT_BLOCK_PROPS`, `ListingGridBlock.tsx`, `BlockRenderer.tsx`, all
   three engines, block tests. Shippable and reviewable by itself; the palette gains a Listing
   Grid the user can add to any email — the operator's stated reason for choosing this shape.
3. **Commit B — the scope lane:** `lib/geo/point-in-zip.ts` + tests. Touches nothing shared.
4. **Commit C — the recipe:** builder, registration, recipe tests.
5. **Proof send** to `hello@swfldatagulf.com` via a local-only `scripts/email/tmp-*.mts` (own
   copy, never mutating the existing showcase script). Evidence = pasted Resend id + grepped
   rendered HTML showing real rdcpix photo hosts and real realtor.com links.

`git add` explicit paths only, never `-A` (RULE 1.5). SESSION_LOG entry before push.

---

## 10. v1 cuts, stated not silent

- **Baths** — vendor gap, blocks the reference spec line (§5). Owned by the baths handoff.
- **A `sold` category** — needs a different source entirely (§5).
- **The ZIP stats header** ("33919 by the numbers": median DOM + median list price) — buildable
  from held data, but it is a separate figure lane with its own provenance; v1 uses a plain hero.
- **The financing cross-sell interstitial** — the reference's own monetization, not ours.
- **Cross-ZIP "Recommended homes"** — the reference crosses ZIPs there; our equivalent is the
  city backfill in §4, which is labeled honestly per card.
