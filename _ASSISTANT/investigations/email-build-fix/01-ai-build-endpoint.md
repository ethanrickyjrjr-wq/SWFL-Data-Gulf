# Lane 01 — Core AI-build endpoint subject resolution

Investigator notebook. Question: when a user types "New listing announcement for
14189 Mindello Dr, Fort Myers, FL 33905, use the real listing photo and real
price/specs" into the Email Lab AI-build panel and clicks Build, where does the
named property get dropped on the floor?

## Path map (traced end to end)

- `app/api/email-lab/ai/route.ts` — thin HTTP wrapper. Dispatches on
  `isAuthor = body.build === true || body.mode === "author"` (route.ts:119).
  - `isAuthor` true → `authorDoc(...)`
  - else → `buildContentDoc(...)`
  - Address never parsed here. Subject address only read from `body.scope?.address`
    (showing-prep branch, route.ts:126-127). Free-text prompt is passed through
    untouched to the build fn.
- Client: `components/email-lab/EmailLabGridShell.tsx` `runAuthor()` (line 496) and
  `runAutoBuild()` (line 588) both POST with **`build: true`** (lines 512, 593).
  → The "Build the email" button hits `authorDoc`, NOT buildContentDoc.
  - `recipeKey: activeRecipeKey || undefined` (line 518). `activeRecipeKey` inits from
    `initialRecipe?.key ?? null` (line 319). A user who just TYPES a prompt (no recipe
    arrival) → `initialRecipe` null → `activeRecipeKey` null → **recipeKey undefined**.
  - `scope` is a prop; `scope.address` only set when arrival/project carried a subject
    address (kind:"listing" project). A plain typed prompt → **scope.address undefined**.

## authorDoc subject resolution (lib/email/build-doc.ts:1114-1366)

Two lanes can resolve a subject listing. BOTH fail on the reproduced prompt:

### Lane A — recipe dispatch (build-doc.ts:1159-1284)
`activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt)`
- `recipeByKey(undefined)` → null (recipes.ts:396).
- `recipeFromPrompt(prompt)` (recipes.ts:412-426) does a **prefix match**:
  `p.startsWith(head)` where `head` = the recipe seed text before `[[`. For "new-listing"
  the head is literally **"Build a new-listing announcement email for my listing at "**
  (recipes.ts:169-170).
  The TYPED prompt "New listing announcement for 14189 Mindello Dr..." does NOT start
  with that seed head → **returns null**.
- → `activeRecipe = null` → entire recipe-dispatch block SKIPPED. `resolveSubject` (which
  would hit the real record) never called.

### Lane B — legacy subject lane (build-doc.ts:1289-1366)
```
subjectAddress = !recipeBuilder && isNewListingRecipePrompt(prompt)
    ? (scope?.address ?? subjectAddressFromPrompt(prompt))
    : null
```
- `recipeBuilder` null → `!recipeBuilder` true.
- `isNewListingRecipePrompt("New listing announcement for...")` → regex
  `/\bnew[-\s]?listing\b/i` (listing-intent.ts:27) matches "New listing" → **true**.
  So we DO enter the ternary's truthy branch — the intent is correctly detected.
- `scope?.address` → undefined (typed prompt).
- `subjectAddressFromPrompt(prompt)` (listing-intent.ts:42-50): regex
  `SUBJECT_AT = /\b(?:listing|property|home|house)\s+at\s+(.+?)(?:\s*[—–]|\s+-\s+|$)/i`.
  It requires the literal token **"listing/property/home/house" immediately followed by
  "at"**. The typed prompt says "listing announcement **for** 14189 Mindello Dr" — there
  is no "...at <address>". → **returns null**.
- → `subjectAddress = undefined ?? null = null` → the subject-listing flyer lane
  (build-doc.ts:1293) is SKIPPED. `resolveSubjectListing` never called.

### Result
Falls through to the **generic author** (build-doc.ts:1368+): `fetchLakeParts(scope)` +
`buildPromptChart(prompt, ...)` + generic `authorSystem`. That produces exactly the
reported symptom: a ZIP-level market-stats email with a bar chart ranking other ZIPs,
headline stats, a lifecycle paragraph — no house photo, no price, no beds/baths/sqft.

## Root cause (my lane)

The endpoint **never extracts the address "14189 Mindello Dr, Fort Myers, FL 33905" out
of a free-text prompt.** The only three inputs that can seed the subject resolver are:
1. `scope.address` — only from the homepage hero's address FIELD / a kind:listing project.
2. `recipeFromPrompt` — only matches a prompt that STARTS WITH the exact recipe seed head.
3. `subjectAddressFromPrompt` — only matches the literal pattern "(listing|property|home|
   house) at <addr>".

A user typing their OWN phrasing satisfies none of them, so the address the user typed
lands nowhere, no lookup against `data_lake.listing_state` (via `resolveSubject` /
`resolveSubjectListing`) is ever attempted, and the build defaults to the generic
market-snapshot lane.

The extractors were built around the EXACT recipe seed text ("...for my listing at
[[blank]]"), on the assumption the address arrives via scope.address (hero field) or a
prompt byte-matching that seed. Organic free-text ("announcement for <addr>", "just
listed <addr>", "<addr> — new listing") defeats the narrow regex.

Confirmed grounding: `resolveSubjectListing` / `resolveSubject` are imported at
build-doc.ts:49,52 and called ONLY at 1172 and 1300 — both gated on
`scope.address ?? subjectAddressFromPrompt(prompt)`. There is no looser address parser
anywhere on the build path.

## Fix (concrete)

Widen deterministic address extraction so a free-text prompt that clearly names a subject
address still resolves it — WITHOUT letting a model infer the subject (playbook Part 3
rule 1 forbids model-inferred subjects; keep it deterministic).

Add a general US-address extractor as a fallback in `subjectAddressFromPrompt` (or a new
sibling `addressFromPrompt`) that matches a street-number + street-name (+ optional city/
state/ZIP) pattern anywhere in the prompt, e.g.
`/\b\d{1,6}\s+[A-Za-z0-9.\s]+?(?:St|Street|Dr|Drive|Ave|Avenue|Rd|Road|Blvd|Ln|Lane|Ct|
Court|Way|Ter|Terrace|Cir|Circle|Pl|Place|Pkwy|Hwy|Trl|Trail)\b[^—–]*?(?:FL|Florida)?\s*\d{5}?/i`
and feed the captured span to the SAME `resolveSubjectListing` (geocode → Lee/Collier gate
→ vendor/listing_state match) that already exists. Keep the tight "...at <addr>" pattern as
the first, highest-confidence match; the general pattern is the fallback.

This makes `isNewListingRecipePrompt` (which already correctly fires on "New listing") and
the address extraction agree, so the legacy lane at build-doc.ts:1289-1293 actually reaches
`resolveSubjectListing(subjectAddress)` and builds the real flyer (photo + price + specs)
that `data_lake.listing_state` already holds for 14189 Mindello Dr.

Verify no false positives on area prompts ("...for 33905", a bare ZIP has no street number
so won't match) and that the Lee/Collier gate inside resolveSubjectListing still fences
out-of-area addresses.
