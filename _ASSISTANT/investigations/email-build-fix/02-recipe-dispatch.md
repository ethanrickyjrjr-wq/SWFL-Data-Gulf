# Lane 02 — Recipe dispatch / subject-binding

Investigation of why "New listing announcement for 14189 Mindello Dr, Fort Myers, FL 33905,
use the real listing photo and real price/specs" (typed into the Email Lab AI-build panel)
produced a generic ZIP market-stats email instead of a listing flyer.

## The dispatch chain (traced by hand)

Client: `components/email-lab/EmailLabGridShell.tsx`
- `runAuthor()` (line 496) POSTs to `/api/email-lab/ai` with `build: true` and
  `recipeKey: activeRecipeKey || undefined` (line 518).
- `activeRecipeKey` (line 319) initializes from `initialRecipe?.key ?? null` and is only ever
  set by `setActiveRecipeKey(recipe.key ?? null)` on a recipe ARRIVAL/pick (line 768).
- => A user who just TYPES a prompt and clicks Build has `activeRecipeKey === null`, so the
  request carries **`recipeKey: undefined`**. (verified by reading the state wiring)

Route: `app/api/email-lab/ai/route.ts`
- `body.doc` present + `build:true` => `isAuthor` true => calls `authorDoc(...)` (line 165-177),
  passing `recipeKey: body.recipeKey` (undefined here).

Dispatcher: `lib/email/build-doc.ts` `authorDoc()`
- Line 1159: `const activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt);`
  - `recipeByKey(undefined)` => null.
  - `recipeFromPrompt(prompt)` (`lib/deliverable/recipes.ts:412`) prefix-matches the prompt
    against each recipe's SEED-prompt head (everything before `[[`). The new-listing head is
    `"Build a new-listing announcement email for my listing at "`. The user's prompt begins
    `"New listing announcement for ..."` => `startsWith` FALSE => no match => **null**.
  - => `activeRecipe = null`, `recipeBuilder = null`. The whole recipe lane (1162-1284) is skipped.
- LEGACY subject lane, line 1289-1292:
  `subjectAddress = !recipeBuilder && isNewListingRecipePrompt(prompt) ? (scope?.address ?? subjectAddressFromPrompt(prompt)) : null;`
  - `!recipeBuilder` = true.
  - `isNewListingRecipePrompt(prompt)` (`lib/email/listing-intent.ts:29`) tests
    `/\bnew[-\s]?listing\b/i` => matches "New listing" => **TRUE**. So intent IS detected.
  - `scope?.address` — undefined for a free-typed prompt (address lives only in the prompt text).
  - `subjectAddressFromPrompt(prompt)` (`listing-intent.ts:44`) uses
    `SUBJECT_AT = /\b(?:listing|property|home|house)\s+at\s+(.+?)(?:\s*[—–]|\s+-\s+|$)/i`.
    The user wrote "…announcement **for** 14189 Mindello Dr…", not "…listing **at** … —", so the
    regex does NOT match => **null**.
  - => `subjectAddress = null`.
- The `if (subjectAddress)` block (1293) is skipped. Control falls to the **generic author**
  (1368+): `zipFromPromptPlace(prompt)` pulls "Fort Myers" -> a ZIP scope, `buildPromptChart`
  builds a ZIP bar chart, and the model authors a generic ZIP market email. Returns `applied:true`.

## Empirical confirmation (node, non-destructive)

```
isNewListingRecipePrompt: true          <- intent correctly detected
recipeFromPrompt startsWith head: false <- no recipe bound
subjectAddressFromPrompt: null          <- NO subject bound
--- seed prompt (what a recipe DOOR sends) ---
recipeFromPrompt startsWith head: true
subjectAddressFromPrompt: "14189 Mindello Dr, Fort Myers, FL 33905"  <- binds fine
```

Both binding paths are fitted to the machine-generated recipe seed shape
("Build a new-listing announcement email for my listing at <ADDR> —"). A human's natural
phrasing satisfies neither, even though the intent test fires.

## Root cause

Subject-binding for the address spine has NO lane that survives a free-form human prompt.
Binding requires EITHER an explicit `recipeKey` (only sent by a recipe door, never by the
type-and-Build panel) OR prompt text shaped exactly like the seed prompt. When
`isNewListingRecipePrompt` fires (we know it's a new listing) but `subjectAddressFromPrompt`
returns null, the code SILENTLY falls through to the generic ZIP author — `applied:true`,
no log, no user-facing message.

This is the silent substitution: a NEW-LISTING intent is positively detected, then abandoned
with zero signal, and the generic-area author's output (mismatched ZIP, ZIP bar chart, token-
truncated prose) is exactly the reported symptom.

Contrast: build-doc.ts:1198-1204 loudly logs when a recipe builder produces an INVALID doc,
but the "intent detected, subject unbindable" case has no equivalent loud path — it just vanishes.

## Anchor: `lib/email/build-doc.ts:1289` (+ the two matchers it depends on)

## Concrete fix (for the later fix pass; not applied — diagnosis only)

1. Make address binding survive human phrasing. `subjectAddressFromPrompt` must also catch the
   address after "for"/"announcement for"/a bare "<num> <street>, <city>, FL <zip>" pattern, not
   only "…(listing|home) at … —". A US-address regex (house number + street + optional city/FL/ZIP)
   is the robust anchor; the "listing at … —" shape becomes one case, not the only one.
2. Do not fall through silently. In the legacy lane (build-doc.ts:1289-1366), when
   `isNewListingRecipePrompt(prompt)` is true but no `subjectAddress` resolves, surface it — log
   loudly like the invalid-doc path (1199), and prefer returning the "paste your link or add a
   photo / confirm the address" ask over quietly emitting a generic ZIP email. A positively
   detected listing intent must never be answered with an area newsletter without a signal.
3. Best structural fix: route the free-typed panel through the SAME recipe identity as the doors.
   When `activeRecipeKey` is null, detect the recipe from intent (isNewListingRecipePrompt and
   siblings) and set `recipeKey` so the request enters the real recipe lane (build-doc.ts:1162),
   where `resolveSubject` + `buildNewListing` land the flyer with open slots on a resolve miss —
   instead of the generic author. This unifies the two binding paths onto one.

Shared root with Lane "subject resolution": the address extractor and the dispatch fallthrough
are the same defect surface — binding is over-fitted to the seed prompt and fails open (to
generic) instead of failing loud.
