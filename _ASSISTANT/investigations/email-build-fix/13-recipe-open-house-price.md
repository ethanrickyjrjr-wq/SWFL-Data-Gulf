# Lane 13 — Open House + Price Reduced/Improved recipes: subject-binding + BEFORE/AFTER price

Investigator notes. Diagnosis-only (read code, no browser, no DB writes, no git).

## Files read (the trace, end to end)
- `lib/deliverable/recipes.ts` — registry (RECIPE_KEYS, RECIPES, recipeByKey, recipeFromPrompt)
- `lib/deliverable/recipes/open-house.ts` — buildOpenHouse
- `lib/deliverable/recipes/price-reduced.ts` — buildPriceReduced (+ previousPrice, priceCutKicker, priceVsAreaDotSpec)
- `lib/deliverable/recipes/index.ts` — RECIPE_BUILDERS dispatch table + RecipeBuildContext
- `app/api/email-lab/ai/route.ts` — HTTP wrapper; isAuthor gate
- `lib/email/build-doc.ts` — authorDoc (recipe dispatch) + buildContentDoc (no dispatch)
- `lib/deliverable/recipes/shared.ts` — resolveSubject, authorListingNarrative
- `lib/listings/resolve-subject.ts` — resolveSubjectListing (lake-first) + toFacts
- `lib/listings/select.ts` — lakeRowToListing, LAKE_LISTING_COLUMNS
- `lib/email/listing-intent.ts` — subjectAddressFromPrompt (SUBJECT_AT), isNewListingRecipePrompt
- `components/email-lab/EmailLabGridShell.tsx` — the "Build the email" client
- `ingest/pipelines/listing_lifecycle/extract_api.py` — reduced_amount source semantic

## The dispatch path (both my recipes reach their builder ONLY here)
Route `POST /api/email-lab/ai`: `isAuthor = body.build === true || body.mode === "author"`.
Client "Build the email" panel sends `build: true` (EmailLabGridShell.tsx:513) → authorDoc.

authorDoc (build-doc.ts:1159):
```
const activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt);
const recipeBuilder = activeRecipe ? builderFor(activeRecipe.key) : null;
```
If a builder resolves (1162): subject = scope.address ?? subjectAddressFromPrompt(prompt) (1168-1171),
then resolveSubject(subject) → facts → buildOpenHouse/buildPriceReduced. THAT path is correct.

## ROOT CAUSE (shared w/ new-listing lane): a free-typed listing ask binds NO subject → generic ZIP email
The recipe builders are reachable ONLY through the recipe DOOR. Two gates, both fail on a
natural-language prompt typed straight into the AI-build panel (the confirmed reproduction):

1. **recipeKey.** Client sends `recipeKey: activeRecipeKey || undefined` (EmailLabGridShell.tsx:519).
   `activeRecipeKey` is `initialRecipe?.key ?? null` (line 319) — set ONLY when the user arrived via a
   recipe door/pill. A free-typed prompt → `activeRecipeKey = null` → `recipeKey = undefined`.
   Then `recipeByKey(undefined)` = null.

2. **recipeFromPrompt fallback.** recipes.ts:412 prefix-matches the STABLE HEAD of the seed prompt
   ("Build an open-house invitation email for my listing at" / "Build a price-improved email for my
   listing at"). A human typing "Open house for 14189 Mindello Dr…" or "New listing announcement for
   <addr>" does NOT start with that head → null. So activeRecipe = null, no builder.

3. **Legacy fallback lane** (build-doc.ts:1289): fires only for `isNewListingRecipePrompt(prompt)`
   AND a subject address. `subjectAddressFromPrompt` (listing-intent.ts:42) uses
   `SUBJECT_AT = /\b(?:listing|property|home|house)\s+at\s+(.+?)…/` — it requires the word "**at**"
   and REJECTS the natural "…**for** <address>". So subjectAddress = null even for a new-listing
   phrasing → falls through to the **generic author** (build-doc.ts:1368+) → generic ZIP market email
   with a bar chart of OTHER ZIPs. EXACTLY the confirmed symptom, and it applies identically to
   open-house and price-reduced (which don't even have a legacy lane — they have ONLY the door path).

Net: open-house / price-reduced work when launched from their recipe door (activeRecipeKey set +
seed-prompt "…my listing at <ADDR> —" shape preserved so SUBJECT_AT matches). A user who describes
the email in their own words gets no subject bound and no photo/price/specs — the generic ZIP email.
Shared root cause with the confirmed new-listing failure: subject binding is regex/prefix-gated on the
exact seed-prompt shape + activeRecipeKey; there is no natural-language address extractor.

## PRICE-REDUCED BEFORE/AFTER price — VERIFIED REAL, not fabricated / not wrongly blank
- previous = current + cut (price-reduced.ts:110-116 `previousPrice`). Both operands vendor-stated.
- cut = `facts.priceReduction`, set from lake `reduced_amount`:
  - select.ts:292-294: `flag_price_reduced === true && reduced_amount != null → priceReduction: reduced_amount`
  - LAKE_LISTING_COLUMNS (select.ts:302) DOES select `reduced_amount` + `flag_price_reduced`.
  - resolve-subject toFacts (resolve-subject.ts:255): `l.priceReduction != null → usd(l.priceReduction)`.
- Semantic consistency: extract_api.py:197 `"reduced_amount": _int(price.get("reduced_amount"))` — the
  SteadyAPI `price.reduced_amount` field. price-reduced.ts header documents a live probe (326 Shore Dr:
  reduced_amount=104975, price=595000 → previous=699975) confirming reduced_amount = SIZE OF THE CUT,
  not the old price. End-to-end consistent. previousPrice arithmetic is correct.
- No cut on record → priceReduction undefined → kicker "" → Previous Price cell = OPEN SLOT, no chart,
  narrator gets the "not reduced" framing. Honest degradation. Correct.
- Test address 14189 Mindello Dr is flag_new_listing (not price_reduced), so a Price-Improved build of
  it correctly shows no cut — not a bug.

## Minor secondary observation (NOT the shipping bug — safe direction)
`flag_price_reduced=True` WITH `reduced_amount=None` is a real vendor state
(ingest/tests/.../test_extract_api.py:66-67 asserts exactly this). Then facts.isPriceReduced=true but
priceReduction=undefined → `priceCutKicker` returns "" (price-reduced.ts:207-210) → the narrator's
`reduced = Boolean(kicker)` is false → it uses the "listing update / price is CURRENT, was NOT reduced"
framing (price-reduced.ts:507-516) even though isPriceReduced=true. Internally inconsistent, but the
SAFE direction: with no cut amount we can't quantify/verify a before price, so shipping silence beats an
unquantified reduction claim. Worth tightening later; not a fabrication and not the confirmed bug.

## Confidence
HIGH on root cause (dispatch/subject-binding: free-typed prompt binds no subject → generic author).
HIGH on price-reduced BEFORE/AFTER being real-sourced and correctly-degrading.
Shares root cause with the new-listing lane (same dispatch gate).
