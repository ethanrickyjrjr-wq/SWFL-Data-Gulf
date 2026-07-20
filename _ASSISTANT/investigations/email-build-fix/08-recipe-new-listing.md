# Lane 08 — Live-trace the "New Listing" recipe

Repro prompt (confirmed live twice): typed ORGANICALLY into the Email Lab AI-build panel:
> "New listing announcement for 14189 Mindello Dr, Fort Myers, FL 33905, use the real listing photo and real price/specs"

Ground truth: 14189 Mindello Dr IS in `data_lake.listing_state` (price 599000, 5 bd, 2925 sqft,
flag_new_listing, real photo_url). Data exists; build never used it.

## What SHOULD happen (intended path)

1. `buildNewListing(ctx)` (lib/deliverable/recipes/new-listing.ts:46) receives `ctx.facts` (a
   resolved `ListingFacts` for the subject house).
2. `buildListingFlyer(facts, currentDoc, daysOnMarket)` (line 68) lays the coded flyer grid:
   hero photo + price/beds/baths/sqft/$-per-sqft cells.
3. `dropEmptyChartSlot` (no chart on a new listing), then `authorListingNarrative` → tightened
   prose. Returns a real property flyer with the photo.

This ONLY runs if `ctx.facts` is non-null. `buildNewListing` line 50: `if (!facts) return null;`
=> null facts => builder returns null => build falls through to the GENERIC author.

## Where the subject facts come from (build-doc.ts authorDoc)

Client (`EmailLabGridShell.tsx` runAuthor ~line 500) posts `build:true`, `scope`,
`recipeKey: activeRecipeKey || undefined`. For an ORGANIC typed prompt `activeRecipeKey` is
`initialRecipe?.key ?? null` = **null** (grid client line 319) => `recipeKey` sent = undefined.

Route (`app/api/email-lab/ai/route.ts:119`) `isAuthor = build===true` => calls `authorDoc`.

`authorDoc` (build-doc.ts:1159):
```
const activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt);   // 1159
const recipeBuilder = activeRecipe ? builderFor(activeRecipe.key) : null;  // 1160
```
- `recipeByKey(undefined)` = null.
- `recipeFromPrompt(prompt)` (recipes.ts:412) does `p.startsWith(head)` where
  head = "Build a new-listing announcement email for my listing at". The organic prompt
  "New listing announcement for 14189 Mindello Dr..." does NOT start with that rigid seed head
  => returns **null**.
=> `activeRecipe` = null. **The whole recipe-dispatch block (buildNewListing) is SKIPPED.**

Legacy lane (build-doc.ts:1289):
```
const subjectAddress =
  !recipeBuilder && isNewListingRecipePrompt(prompt)
    ? (scope?.address ?? subjectAddressFromPrompt(prompt))
    : null;
```
- `!recipeBuilder` = true.
- `isNewListingRecipePrompt(prompt)` (listing-intent.ts:29) regex `/\bnew[-\s]?listing\b/i` matches
  "New listing" => **true**.
- `scope?.address` — undefined for an organic lab prompt (address spine not set).
- `subjectAddressFromPrompt(prompt)` (listing-intent.ts:42-50):
  `SUBJECT_AT = /\b(?:listing|property|home|house)\s+at\s+(.+?)(?:\s*[—–]|\s+-\s+|$)/i`
  The prompt says "New listing announcement **for** 14189 ..." — "listing" is followed by
  "announcement", NOT "at". No "<noun> at <addr>" anywhere => returns **null**.
=> `subjectAddress` = null => legacy flyer lane (1293) SKIPPED.

=> Falls through to the generic author (build-doc.ts:1368+): `fetchLakeParts`, `buildPromptChart`
(the ZIP bar chart), `loadLifecycleDigest` (the "lifecycle" paragraph). = the observed generic
ZIP-stats email, other-ZIP bar chart, no photo, no price. Exactly the symptom.

## ROOT CAUSE (lane 08)

The subject address is never extracted from a NATURAL-language "New listing announcement **for**
<address>" prompt. Two independent extractors both fail on this phrasing, so `facts` is null and
`buildNewListing` returns null:

- PRIMARY (lane-specific): `subjectAddressFromPrompt` — lib/email/listing-intent.ts:42-50.
  `SUBJECT_AT` only matches the rigid template `(listing|property|home|house) at <addr>` terminated
  by an em-dash / " - " / end. The natural "…for 14189 Mindello Dr, Fort Myers, FL 33905, use the
  real…" uses "for" (not "at") and comma delimiting (no em-dash) => no match => null. This is the
  ONLY prompt-side address source in the legacy lane AND the recipe lane
  (build-doc.ts:1170 `scope?.address ?? subjectAddressFromPrompt(prompt)`).

- SECONDARY (shared with recipe-identity lane): `recipeFromPrompt` — lib/deliverable/recipes.ts:412
  uses `startsWith(head)` against the exact seed head, so an organic prompt never resolves the
  `new-listing` recipe and the buildNewListing dispatch is skipped entirely.

`resolveSubject`/`resolveSubjectListing` (shared.ts:147) is robust — given the address string it
would hit `data_lake.listing_state`, return the real photo+price for 14189 Mindello, and even a
vendor miss degrades to an address-only flyer. The break is purely address EXTRACTION, upstream of
resolution.

## FIX

Make `subjectAddressFromPrompt` (listing-intent.ts:42-50) recognize a US-address token regardless
of the "at"/"for" verb and comma delimiting — anchor on an address shape
(house-number + street + optional city/ST ZIP) instead of the "<noun> at <addr> —" template. Accept
"for <addr>", "announcement for <addr>", bare "<addr>". Keep the `/\d/` + length guards.
Secondary: loosen `recipeFromPrompt` (recipes.ts) so an organic "new listing … <address>" resolves
the new-listing recipe (or route the legacy lane on the extracted address alone, which already
happens once the extractor is fixed).

Verify with the two existing tests: lib/email/listing-intent.test.ts (add the "for"/comma repro
prompt) and lib/listings/resolve-subject.test.ts.
