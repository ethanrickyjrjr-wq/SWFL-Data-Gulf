# Lane 10 — Agent Brand Intro / Agent Launch recipes

Working notebook. Diagnosis-only. No git, no DB writes, no browser.

## Dispatch map (verified by reading, not memory)

- `app/api/email-lab/ai/route.ts` POST → if `body.doc !== undefined`:
  - `isAuthor = body.build === true || body.mode === "author"`
  - author path → `authorDoc(...)`; else → `buildContentDoc(...)` (skeleton fill).
- Recipe builders (buildAgentBrandIntro / buildAgentLaunch) are reached ONLY inside
  `authorDoc` (`lib/email/build-doc.ts:1114`).
  - `const activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt)` (build-doc.ts:1159)
  - `const recipeBuilder = activeRecipe ? builderFor(activeRecipe.key) : null` (1160)
  - Both agent recipes have `subject !== "address"`, so `subject = null`,
    `resolvedSubject = null`; builder receives `facts:null, resolved:false, zip`.
- So for these recipes to fire at all: EITHER `recipeKey` is passed as
  "agent-brand-intro"/"agent-launch", OR `recipeFromPrompt(prompt)` matches.
  If neither, falls through to the generic author (grab-bag).

KEY QUESTION for this lane: do the agent recipes ignore explicit user-provided
specifics (the endpoint bug)? These recipes are NOT listing-bound. Trace what they
DO expect and whether user specifics get dropped.

## FINDINGS

### What the two recipes expect (subject/data)
- Neither is listing-bound. Both are `subject: "agent"` (recipes.ts:291,303), so in
  authorDoc `subject=null`, `resolvedSubject=null`; builder gets `facts:null,
  resolved:false, zip` (build-doc.ts:1168-1181). By design.
- agent-launch (agent-launch.ts:441): reads AREA from `ctx.zip` else the prompt
  (`areaFor`, :138); loads ONE lake figure (`pickOneFigure`); hands the narrator the
  user's prompt VERBATIM (`authorLetter` opts.prompt, :302-303). Claim-gated. It does
  NOT ignore user specifics — the letter is written from the user's own words.
- agent-brand-intro (agent-brand-intro.ts:891): farm area from prompt/zip
  (`resolveFarmArea`), anchor listing ADDRESS from the prompt (`anchorAddressFromPrompt`
  → `resolveSubject`), headshot/name from sticky brand. Also reads the user's prompt.
  Well-defended (fails to OPEN SLOTS, never wrong-city).

CONCLUSION on the recipes themselves: they are meticulously built and DO honor
user-provided specifics. No recipe-internal defect produces the generic-ZIP symptom.

### Does the same endpoint bug apply? YES — but via the SHARED dispatch gap, not the recipes
The garbled generic-ZIP email is the GENERIC AUTHOR fallback (build-doc.ts:1368+ →
assembleAuthoredDoc + injected ZIP chart/figures). The coded agent builders never
produce cut-off sentences or a chart-behind-the-headline; those are generic-author
artifacts. So the symptom = the recipe was NOT dispatched and the build fell through.

The recipe only dispatches when `authorDoc` resolves a recipe:
  `activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt)` (build-doc.ts:1159)

Two ways this returns null for an agent request, both SHARED with the confirmed bug:
1. `recipeKey` is `activeRecipeKey || undefined` (EmailLabGridShell.tsx:519). But
   `activeRecipeKey` is set ONLY from an arriving `initialRecipe?.key` (:319) or the
   recipe PICKER (`setActiveRecipeKey`, :773). Typing into the AI box updates only
   `aiPrompt` (:300) — it NEVER infers/sets a recipe key. So an organically typed
   "write me an agent launch letter for Cape Coral" posts `recipeKey: undefined`.
2. `recipeFromPrompt` (recipes.ts:412-426) matches ONLY when the typed prompt
   `startsWith` the recipe's ~140-char seed head (text before `[[`). Organic typing
   essentially never matches the agent-launch/agent-brand-intro heads (recipes.ts
   :293-294, :307-308).

Result: `activeRecipe=null` → recipe block skipped → generic author → generic ZIP
grab-bag, ignoring the user's explicit "agent launch / brand intro" ask. Same
root-cause class as the confirmed new-listing bug (identity carried by rkey, never
inferred from the user's words).

Button path verified: "Build the email" (EmailLabGridShell.tsx:1897,1901) →
buildFromPanel(:846) → proceedBuild(:855) → runAuthor(aiPrompt)(:859), which posts
`build:true` + `recipeKey: activeRecipeKey || undefined` (:509-521).

### Fix direction (concrete)
Server-side, in authorDoc's resolution, add a THIRD fallback after `recipeFromPrompt`
that does an intent/keyword match to a RecipeKey when no rkey and no seed-head prefix
match (e.g. "agent launch"/"introduce me to my sphere" → agent-launch; "agent
introduction"/"farm area" + headshot → agent-brand-intro). OR client-side: infer and
`setActiveRecipeKey` from the typed prompt in the AI box. The recipe builders need no
change — they already honor specifics once reached.
