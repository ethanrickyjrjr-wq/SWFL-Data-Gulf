# Lane 12 — Live-trace: Market Comps + Under Contract recipes (subject binding)

Investigator notebook. Diagnosis-only (no writes, no git, no browser). file:line citations.

## Task
Read both recipe files. Trace subject binding for each the same way the other recipe
lanes did. Note what these two SHARE structurally with the broken New Listing / Just
Sold paths vs. anything more correct.

## Files read
- lib/deliverable/recipes/market-comps.ts (buildMarketComps)
- lib/deliverable/recipes/under-contract.ts (buildUnderContract)
- lib/deliverable/recipes/index.ts (RecipeBuildContext, RECIPE_BUILDERS, builderFor)
- lib/deliverable/recipes/shared.ts (resolveSubject — THE one resolver)
- lib/deliverable/recipes.ts (RECIPES registry, recipeByKey, recipeFromPrompt)
- lib/email/build-doc.ts (authorDoc dispatch + buildContentDoc)
- app/api/email-lab/ai/route.ts (POST wrapper)
- lib/email/listing-intent.ts (subjectAddressFromPrompt, isNewListingRecipePrompt)

## KEY ARCHITECTURAL FACT: the recipes DON'T bind their own subject
Both `buildMarketComps` and `buildUnderContract` are pure CONSUMERS of `ctx.facts`.
They never resolve a subject themselves (correct — shared.ts forbids a 2nd resolver).

- market-comps.ts:1043-1047 — `buildMarketComps(ctx)`: `if (!facts?.address) return null;`
  then uses `facts.address`, `facts.photos[0]`, `facts.price`, `facts.zip` etc.
- under-contract.ts:1050-1054 — `buildUnderContract(ctx)`: `if (!facts) return null;`
  then reads `facts.zip`, `facts`, `facts.remarks`, `facts.community`.

So subject binding for BOTH is done ENTIRELY UPSTREAM in the dispatcher
(build-doc.ts `authorDoc`). If `ctx.facts` is null, both return null and the build
falls through to the generic author. Ruled out: any subject-binding bug inside the
two recipe files themselves — there is none; they consume a pre-resolved `facts`.

## The upstream subject-binding chain (build-doc.ts authorDoc)
1. build-doc.ts:1159 — `activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt)`
2. build-doc.ts:1160 — `recipeBuilder = activeRecipe ? builderFor(activeRecipe.key) : null`
3. build-doc.ts:1162 — dispatch block runs ONLY if `activeRecipe && recipeBuilder`
4. build-doc.ts:1168-1171 — `subject = activeRecipe.subject === "address"
     ? (scope?.address ?? subjectAddressFromPrompt(prompt)) : null`
5. build-doc.ts:1172 — `resolvedSubject = subject ? await resolveSubject(subject, prompt) : null`
6. build-doc.ts:1174-1181 — builder called with `facts: resolvedSubject?.facts ?? null`

Both recipes are registered (index.ts:82-83) and both are `subject: "address"`
(recipes.ts:194, 212). So the wiring is present. Failure is upstream of the builder.

## THREE independent upstream gates, ALL of which the reproduced prompt fails
Reproduced prompt: `New listing announcement for 14189 Mindello Dr, Fort Myers, FL 33905,
use the real listing photo and real price/specs`

### Gate A — the build must reach `authorDoc` at all — RESOLVED: it IS reached
`authorDoc` (the ONLY place recipe dispatch + subject resolution lives) runs ONLY when
`isAuthor = body.build === true || body.mode === "author"` (route.ts:119). VERIFIED the
panel's "Build the whole email" path (components/email-lab/EmailLabGridShell.tsx
`runAuthor` and `runAutoBuild`) POSTs `build: true` (EmailLabGridShell.tsx:513 and :602)
AND `recipeKey: activeRecipeKey || undefined` (:519, :607). So Gate A PASSES — the build
does reach `authorDoc` and recipe dispatch does run. Gate A is NOT the blocker.
(Note: the separate default fill lane `buildContentDoc`, route.ts:178, has no recipe
dispatch and would emit the ZIP grab-bag — but the author panel does not use it.)

### Gate B — recipe identification (recipes.ts:412-426 recipeFromPrompt)
Applies ONLY when `activeRecipeKey` is empty (an organically typed prompt with no active
recipe selected — EmailLabGridShell.tsx:519 sends `recipeKey: activeRecipeKey || undefined`).
When a recipe IS selected, `recipeByKey` (recipes.ts:396) identifies it directly and Gate B
is a non-issue. With no `recipeKey`, identity falls to
`recipeFromPrompt(prompt)`, which ONLY prefix-matches the STABLE SEED-PROMPT HEAD (the
text before `[[`):
  - market-comps head: "Build a market-comps email for my listing at " (recipes.ts:202-203)
  - under-contract head: "Build an under-contract announcement email for my listing at " (recipes.ts:228-229)
`p.startsWith(head)` (recipes.ts:421). A free-typed "New listing announcement for
14189 Mindello Dr…" (or "Market comps for…", "Under contract at…") does NOT start with
either head → returns null → `activeRecipe` null → whole dispatch block (1162-1284)
SKIPPED. Builder never called; `facts` never resolved.

### Gate C — address extraction (listing-intent.ts:42-50 subjectAddressFromPrompt)
Even if identified, the address extractor requires the literal word "at":
  `SUBJECT_AT = /\b(?:listing|property|home|house)\s+at\s+(.+?)(?:\s*[—–]|\s+-\s+|$)/i`
The reproduced prompt says "…announcement FOR 14189 Mindello Dr" — "for", not
"…listing AT". `subjectAddressFromPrompt` returns null → `subject` null →
`resolveSubject` never called (build-doc.ts:1172) → `facts: null` → both recipes
`return null` → generic author → ZIP grab-bag.

## What Market Comps + Under Contract SHARE with the broken New Listing / Just Sold path
- ALL FOUR are `subject: "address"` and depend on the identical upstream chain
  (recipe id via recipeKey/recipeFromPrompt → subjectAddressFromPrompt → resolveSubject).
  There is ONE shared point of failure feeding all four; the two I traced have no
  private binding logic that could diverge.
- All four produce the SAME degraded output when the subject fails to bind: `facts` is
  null, builder returns null, build-doc falls through to the generic author, which emits
  the ZIP market-stats email (mismatched ZIP, other-ZIP bar chart, lifecycle paragraph,
  mid-word truncation) — the reported symptoms. Those symptoms are hallmarks of the
  generic/buildContentDoc path, NOT of anything inside the two recipe files. Confirms:
  the recipe never ran.

## Where Market Comps + Under Contract are STRICTLY WORSE (more exposed) than New Listing
build-doc.ts has a LEGACY fallback lane (build-doc.ts:1289-1366) that resolves a subject
and builds the flyer even with no recipe key — BUT it fires ONLY for
`isNewListingRecipePrompt(prompt)` (build-doc.ts:1290; regex listing-intent.ts:27
`/\bnew[-\s]?listing\b|\bjust[-\s]listed\b|\bnewly listed\b/`).

CRUCIAL nuance: the legacy fallback computes its address as
`scope?.address ?? subjectAddressFromPrompt(prompt)` (build-doc.ts:1291) — it RE-USES
Gate C. So it is an IDENTIFICATION backstop (Gate B), NOT an address backstop (Gate C).

- New Listing gets an IDENTIFICATION backstop: even if recipeFromPrompt/recipeKey miss,
  `isNewListingRecipePrompt("New listing announcement for…")` returns true (regex
  listing-intent.ts:27 matches "new listing"), so the fallback lane fires. But it STILL
  dies on the reproduced "for 14189…" prompt, because that lane calls the same "at"-only
  `subjectAddressFromPrompt`, which returns null → address-only skeleton, no resolve.
- Market Comps and Under Contract have NEITHER backstop: no identification fallback and
  (like everyone) no address fallback. On a free-typed prompt they fail at Gate B first
  and Gate C second — two failure modes vs New Listing's one.
- THE SINGLE LINCHPIN across all four address recipes is Gate C: `subjectAddressFromPrompt`
  is "at"-only (listing-intent.ts:42), so a naturally phrased "…for <address>" defeats BOTH
  the primary dispatch path AND the New Listing legacy fallback. Fixing Gate C is the
  highest-leverage change.

## Ruled out (NOT the cause, in my lane)
- Double-resolution / wrong-subject inside the recipes: neither re-resolves; both read
  ctx.facts only. Clean.
- The ZIP mismatch / other-ZIP chart / mid-word cutoff symptoms are not produced by
  either recipe file's code — they come from the generic author + buildPromptChart.
- market-comps.ts and under-contract.ts, when handed a resolved `facts`, produce the
  correct comps / under-contract deliverable (verified by reading the build bodies).
  The bug is purely that `facts` never arrives.

## Proposed fix (belongs UPSTREAM, not in the two recipe files)
Root cause is subject-binding fragility in the dispatcher/intent layer, shared across
all address-spine recipes. Concrete, minimal options (for the later human-reviewed fix):
1. Ensure the AI-build panel Build sends `build:true` (or `mode:"author"`) AND the
   `recipeKey` for the selected deliverable, so `authorDoc` runs and identity comes from
   the key (recipes.ts:396) rather than fragile prompt-prefix matching. (Client lane.)
2. Broaden `subjectAddressFromPrompt` (listing-intent.ts:42) to accept "for <address>"
   and bare "<address>" spans (currently "at"-only), so a naturally-phrased prompt still
   yields the subject.
3. Give address-spine recipes a legacy fallback parallel to `isNewListingRecipePrompt`
   (build-doc.ts:1289) — or better, when an address IS extractable from the prompt but no
   recipe id matched, still resolve the subject and route to a sensible address builder
   instead of the generic ZIP author.
The fix does NOT live in market-comps.ts or under-contract.ts — those files are correct.
