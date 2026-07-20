# Lane 11 — Live-trace the "Coming Soon" recipe (subject-binding)

Diagnosis-only. Read code, no execution, no DB writes, no git.

## Question I was assigned
Is the Coming Soon recipe's subject-binding path different / more correct than the
AI-build endpoint's invocation of it? → tells us whether the bug is IN the recipe or in
HOW the endpoint invokes recipes.

## Answer (short)
The Coming Soon recipe does NOT bind its own subject. It is a pure consumer of
`ctx.facts` handed to it by the dispatcher (`authorDoc`). Its binding is therefore
IDENTICAL to every other address-spine recipe (new-listing, comps, etc.) — not
"different", not "more correct". **The bug is entirely in the INVOCATION layer**: for an
organically-typed panel prompt the dispatcher never resolves a subject at all, so
`facts` is null and every address recipe (Coming Soon included) is bypassed for the
generic ZIP author. The recipe itself is correct.

## Trace (files:line)

### 1. buildComingSoon consumes facts; never resolves
- `lib/deliverable/recipes/coming-soon.ts:433` `buildComingSoon(ctx)` reads
  `ctx.facts`; `:438` `if (!facts) return null;` → on null facts it FALLS THROUGH to
  the generic author. It reads `facts.price/photos[0]/beds/sqft/city/zip` — all correct
  once facts are populated.
- `lib/deliverable/recipes/index.ts:53-68` `RecipeBuildContext.facts` is `subject ===
  "address": the resolved house` — supplied BY the dispatcher, "do not re-resolve".
- buildComingSoon is ONLY reachable via `RECIPE_BUILDERS["coming-soon"]`
  (index.ts:81). There is NO legacy fallback lane for coming-soon (the legacy lane is
  hardcoded to new-listing — see §4). So without a proper recipe dispatch, coming-soon
  is unreachable.

### 2. Dispatcher binds the subject — the ONE place it happens
`lib/email/build-doc.ts` `authorDoc`:
- `:1159` `activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt)`
- `:1160` `recipeBuilder = activeRecipe ? builderFor(activeRecipe.key) : null`
- `:1168-1172` subject binding, gated on `activeRecipe && recipeBuilder`:
  `subject = scope?.address ?? subjectAddressFromPrompt(prompt)`;
  `resolvedSubject = subject ? await resolveSubject(subject, prompt) : null`
- `:1174-1181` builds the ctx with `facts: resolvedSubject?.facts ?? null`.

So facts flow ONLY if: (a) activeRecipe resolves, AND (b) subject string is extractable.

### 3. Why a free-typed prompt binds NEITHER
Confirmed live path for `"New listing announcement for 14189 Mindello Dr, Fort Myers,
FL 33905, use the real listing photo and real price/specs"`:

Client POST (`components/email-lab/EmailLabGridShell.tsx:497-521` `runAuthor`):
- `build: true` → `route.ts:119` isAuthor=true → **authorDoc** (NOT buildContentDoc).
- `recipeKey: activeRecipeKey || undefined`. `activeRecipeKey` = `initialRecipe?.key ??
  null` (`:319`). Free-typed on a blank canvas → initialRecipe null → **recipeKey
  undefined**. (Explicit comment `:517-519`: "Absent for an organically typed prompt —
  that still falls through to the generic author exactly as before.")
- `scope`: from `EmailLabGridClient.tsx:308-314` = `addr ? { address: addr } :
  undefined`. No arrival address → **scope undefined** → `scope.address` undefined.

authorDoc then:
- `:1159` recipeByKey(undefined) → null. `recipeFromPrompt(prompt)`
  (`lib/deliverable/recipes.ts:412`) prefix-matches the SEED head, e.g. new-listing's
  `"Build a new-listing announcement email for my listing at "`. The typed prompt starts
  with "New listing announcement for" → **no prefix match → null**. So activeRecipe=null,
  recipeBuilder=null → **the entire recipe dispatch block (incl. subject resolve) is
  skipped**.

### 4. Legacy fallback also misses (hardcoded new-listing + "at"-anchored regex)
`build-doc.ts:1289-1292`:
`subjectAddress = !recipeBuilder && isNewListingRecipePrompt(prompt) ? (scope?.address ??
subjectAddressFromPrompt(prompt)) : null`
- `!recipeBuilder` = true; `isNewListingRecipePrompt` (`listing-intent.ts:27-31`,
  `/\bnew[-\s]?listing\b/i`) matches "New listing" → true.
- `scope?.address` undefined → `subjectAddressFromPrompt(prompt)`
  (`listing-intent.ts:42-50`): `SUBJECT_AT =
  /\b(?:listing|property|home|house)\s+at\s+(.+?).../`. The prompt says "announcement
  **FOR** 14189 Mindello Dr" — there is NO "...at <addr>" → **returns null**.
- So subjectAddress = null → legacy lane skipped → generic author →
  **generic ZIP market email + ZIP-ranking bar chart** = the reported symptom.

Note also: this legacy lane only ever builds `buildListingFlyer` (a New Listing flyer,
`:1320`). Even if it fired, it could never produce a Coming Soon teaser.

### 5. If it HAD bound, the recipe would be correct
`resolveSubject` (`recipes/shared.ts:147`) → `resolveSubjectListing`
(`lib/listings/resolve-subject.ts:268`) is LAKE-FIRST as of 07/19 (`:301-332`): queries
`data_lake.listing_dom` by house number + ZIP with canonical street match. For 14189
Mindello Dr / 33905 (Lee 12071, in footprint) this WOULD return the real row the task
confirms exists (price 599000, beds 5, sqft 2925, photo_url). So the resolver is not the
failure — it is simply never called.

## Comparison to the "more correct" binding (watch route)
The task's premise that `app/api/projects/[id]/watch/route.ts` uses
`loadListingContext`/coming-soon is INACCURATE — it uses neither. But it demonstrates the
robust binding: `autoFillSpec(address_key)` (`watch/route.ts:49-77`) does an EXACT
`address_key` lookup against `data_lake.listing_state` (`street + zip → addressKey()`),
i.e. deterministic subject resolution from the same table that holds 14189 Mindello Dr.
The email-build path instead depends on (a) a recipeKey/seed-prefix match and (b) an
"at"-anchored prompt regex — both of which a natural-language request defeats.

## Root cause (this lane's verdict)
Bug is in HOW the AI-build endpoint invokes recipes, NOT in the Coming Soon recipe.
Specifically: an organically-typed panel prompt satisfies neither subject-binding gate —
no `recipeKey` (only set via a recipe door), no seed-prompt prefix (`recipeFromPrompt`),
and `subjectAddressFromPrompt` extracts an address only after the literal token "at",
which "…for <addr>" does not contain. `resolveSubject` is never called → `facts` null →
buildComingSoon (and every address recipe) is bypassed → generic ZIP author.

## Proposed fix (concrete)
Make subject-binding independent of seed-prompt shape and the "at" keyword. Two
low-risk, additive changes in `authorDoc` (fix step, not this pass):
1. Extract an address from ANY prompt: add a general address extractor (house-number +
   street + city/ZIP), or broaden `subjectAddressFromPrompt`'s `SUBJECT_AT` to accept
   "for/at/on <addr>" and a bare leading address. Feed it to `resolveSubject` whenever
   the active recipe is address-spine OR `isNewListingRecipePrompt` matches.
2. Route intent to a recipe from a free prompt: when no recipeKey, map obvious listing
   intent ("new listing", "coming soon", "just sold", "open house", "price
   reduced/improved") to the matching RecipeKey so the correct builder (e.g.
   buildComingSoon) is dispatched — not only the hardcoded new-listing legacy lane.
Best fix aligns the email path with the watch route: resolve the typed address to its
`address_key` and read `data_lake.listing_state` directly (lake-first is already what
`resolveSubjectListing` does — just ensure it is actually CALLED for typed asks).
