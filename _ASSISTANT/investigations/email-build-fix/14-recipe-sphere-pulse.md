# Lane 14 — Live-trace "Weekly Sphere Update" (sphere-weekly) & "Monthly Market Pulse" (market-pulse)

## Mandate
Read both recipe files. Confirm whether their chart/stat sourcing is legitimately area-wide (correct)
or whether they're symptomatic of the SAME bug (a single-listing ask degrading into one of these).

## Running notes

### recipes.ts (registry) — read
- `sphere-weekly`: subject=area, chart=`none`, prose=`sphere-weekly`, skeleton=null, positioning=story-side.
  Prompt: national/FL headline number beside area's number, one honest gap read, REVIEW CTA. "Schedule every Tuesday."
- `market-pulse`: subject=area, chart=`zip-mom-move`, prose=`monthly-newsletter`, skeleton=null, story-side.
  Prompt: every ZIP's MoM home-value move, one snapshot chart, one honest read.
- Both are AREA recipes — subject spine "area" (ZIP or city), NOT listing. By design they are ZIP-wide.
- KEY OBSERVATION: the live-bug symptom (ZIP market stats + bar chart ranking OTHER ZIPs + lifecycle
  paragraph, no listing photo/price) EXACTLY matches market-pulse (zip-mom-move chart) or a ZIP snapshot.
  So the question is: does a `new-listing` (address) ask get MIS-ROUTED to market-pulse/sphere-weekly?

### VERDICT: the two recipes are CLEAN. The symptom is the GENERIC AUTHOR mimicking them.

**sphere-weekly.ts:1193-1255 (`buildSphereWeekly`)** — subject is AREA. `resolveArea(prompt,zip)`;
returns null (→ generic author) when no area named. `ctx.facts` is null and MUST stay null. Chart
policy `none` (no chart at all). Legitimately area-wide.

**market-pulse.ts:742-761 (`buildMarketPulse`)** — subject AREA. `resolveArea(ctx)`; returns null
when no place. Chart `zip-mom-move` built IN CODE (`momChartSpec`, line 793) from held brain rows for
the area's ZIPs — the file explicitly notes (line 54) it does NOT use `buildChartForQuestion`.
Legitimately area-wide by design.

**Neither is reachable by a single-listing ask.** Dispatch (build-doc.ts:1159-1162):
`activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt)`, then `builderFor(key)`. To reach
these builders `activeRecipe.key` must be `sphere-weekly`/`market-pulse`, which requires either an
explicit recipeKey OR `recipeFromPrompt` matching THEIR seed-prompt heads. A new-listing typed ask
can never resolve to those keys. So the actual builders are NEVER invoked for the buggy ask.

### Why the output LOOKS like market-pulse/sphere-weekly — it's the generic author fallback

Trace of the confirmed live prompt `"New listing announcement for 14189 Mindello Dr, Fort Myers, FL 33905, use the real listing photo and real price/specs"` typed into a FRESH lab:
1. `activeRecipeKey` in EmailLabGridShell.tsx:319 = `initialRecipe?.key ?? null` → null for a fresh
   lab, so request carries `recipeKey: undefined` (shell lines 516-519).
2. build-doc.ts:1159 → `recipeByKey(undefined)` = null; `recipeFromPrompt(prompt)` = null because
   recipes.ts:412-426 PREFIX-matches the registry head `"Build a new-listing announcement email for
   my listing at "`, and the user wrote `"New listing announcement for …"` — no match. → activeRecipe null.
3. Legacy lane, build-doc.ts:1289-1292:
   `subjectAddress = !recipeBuilder && isNewListingRecipePrompt(prompt) ? (scope?.address ?? subjectAddressFromPrompt(prompt)) : null`
   - `isNewListingRecipePrompt` (listing-intent.ts:29-31) matches `"New listing"` → TRUE. Good — we KNOW it's a listing.
   - `scope?.address` is undefined (fresh typed ask; address lives only in the prompt).
   - **`subjectAddressFromPrompt` (listing-intent.ts:42-50) RETURNS NULL** — its `SUBJECT_AT` regex
     (line 42) `/\b(?:listing|property|home|house)\s+at\s+(.+?)…/i` requires the literal "…listing/
     property/home/house **at** <addr>" phrasing, which only matches the REGISTRY SEED prompt
     ("…for my listing **at** [[address]]…"). The user wrote "announcement **for** 14189 Mindello Dr" —
     "for", not "at" — so the address is silently dropped.
   - Result: `subjectAddress = undefined ?? null = null` → the subject-listing flyer lane at
     build-doc.ts:1293 is SKIPPED entirely.
4. Falls through to the GENERIC AUTHOR, build-doc.ts:1368-1599:
   - `zipFromPromptPlace(prompt)` (line 1375) resolves "Fort Myers" → a ZIP scope.
   - Fort Myers ∈ `VERIFIED_MULTI_ZIP_CITIES` (build-doc.ts:245) → `cityZipsFor` returns its ZIP set →
     `buildPromptChart` builds a ZIP-by-ZIP bar chart = "bar chart ranking OTHER ZIP codes".
   - `fetchLakeParts` (line 151) pulls `loadLifecycleDigest` → the "lifecycle" paragraph.
   - multi-ZIP figure merge (lines 1400-1407) seats different Fort Myers ZIPs into different stat
     cells = "headline one ZIP, body stats a DIFFERENT ZIP".
   Every element of the symptom is produced HERE, not by the two recipe builders.

### Conclusion
- sphere-weekly & market-pulse chart/stat sourcing IS legitimately area-wide (correct). NOT the bug.
- The single-listing ask degrades into a generic-author market-pulse/sphere-weekly LOOK-ALIKE, not the
  real builders.
- SHARED ROOT CAUSE (upstream routing/intent): a free-typed listing ask never reaches `buildNewListing`
  because (a) fresh lab sends no recipeKey, (b) `recipeFromPrompt` needs the exact seed head, and — the
  precise reachable defect — (c) `subjectAddressFromPrompt` requires "…at <addr>" and the user wrote
  "…for <addr>", so the address is dropped even though `isNewListingRecipePrompt` matched.
