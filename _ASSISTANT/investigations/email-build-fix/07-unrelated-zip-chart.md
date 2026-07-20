# Lane 07 — Unrelated-ZIP bar chart injected into a single-property email

Investigation notebook. Diagnosis only (no edits, no git, no live runs).

## Symptom
"New listing announcement for 14189 Mindello Dr, Fort Myers, FL 33905 …" build
produced a bottom bar chart ranking unrelated ZIPs (33993, 33026, 33074, 34120 —
some not even SWFL, none the subject). Areawide ranking chart glued onto a
single-property announcement.

## Path traced (build:true → authorDoc)
- `app/api/email-lab/ai/route.ts:165-177` — "Build the email" with `build:true`
  (or `mode:"author"`) routes to `authorDoc` in `lib/email/build-doc.ts`.
- `authorDoc` (build-doc.ts:1114) has THREE lanes, in order:
  1. **Recipe lane** (1159-1284): `recipeByKey(recipeKey) ?? recipeFromPrompt(prompt)`.
     If a listing recipe resolves AND its builder returns a VALID doc → early
     return. No chart. (Good.)
  2. **Legacy subject-listing lane** (1289-1366): fires only when
     `!recipeBuilder && isNewListingRecipePrompt(prompt)` AND a subjectAddress
     resolves. This lane EXPLICITLY calls `dropEmptyChartSlot(flyer)` at
     **build-doc.ts:1335** with the comment "NO CHART ON A NEW LISTING
     (operator, 07/13/2026)". No chart. (Good.)
  3. **Generic author lane** (1368-1600): everything that falls through. THIS is
     where the chart gets injected.

## ROOT CAUSE — generic author lane always builds + force-injects a market chart
- **build-doc.ts:1386-1390** — `buildPromptChart(prompt, currentDoc, effectiveScope,
  chartType, chartZips)` is called UNCONDITIONALLY. There is no listing/single-property
  guard. A chart is always produced if the data exists.
- **build-doc.ts:1431-1434** — the chart is handed to the assembler for EVERY recipe
  except one:
  ```
  const chartSlot =
    chartRes && resolvedRecipe !== "agent-intro"
      ? { url: chartRes.image.url, ... }
      : null;
  ```
  `resolvedRecipe` is the PROSE recipe from `author-recipes.ts` (RECIPE_IDS). That set
  has NO single-property / new-listing / just-sold / open-house type at all — the only
  chart-suppressing special-case is `agent-intro`. For "New listing announcement …"
  `detectRecipe` returns null, so `resolvedRecipe !== "agent-intro"` is true → chart offered.
- **lib/email/author-doc.ts:783-799** (`assembleAuthoredDoc`) — if the author model did
  NOT place the offered chart, the assembler FORCE-RESERVES it just above the footer:
  ```
  if (chart && !chartPlaced) { ... splice the chart block above the footer ... }
  ```
  So the areawide chart lands even when the author never chose to place one. This is the
  literal "always append a market-activity chart" step the task asked about.

## Why the ZIPs are unrelated to the subject
Chart CONTENT comes from `buildChartForQuestion` (`lib/assistant/chart-for-question.ts`),
called by `buildPromptChart` (build-doc.ts:273). For the new-listing prompt:
- The prompt string contains "price" ("real price/specs"). Layer-1 `routeChart`
  (route-chart.ts:87) matches bare `price` → zhvi area-trend intent.
- If that yields nothing, Layer-2 (chart-for-question.ts:113-136) routes the question
  to a housing brain and tries `bindRankedDeltaSpec(scoped)` FIRST — which emits a
  ranked bar of the brain's full ZIP leaderboard (home-values-swfl / market-heat-swfl
  etc). That is the "bar ranking OTHER ZIP codes" (33993/33026/34120…).
- Crucially, the ranked-delta and generic-bar producers only filter by `opts.zips`
  (a multi-ZIP CITY allowlist, chart-for-question.ts:61-63), NOT by a single subject
  scope. `buildPromptChart` passes `scope` but it is not used to constrain these two
  producers → the chart shows the whole brain's cross-SWFL ZIP ranking, unrelated to
  14189 Mindello Dr. The coherence gate `assertHeroChartCoherence` (build-doc.ts:283)
  does NOT catch it: in the generic-author fallback the hero itself became a ZIP market
  stat, so hero and chart cohere.

## The existing correct rule is stranded
`dropEmptyChartSlot` / "NO CHART ON A NEW LISTING" (build-doc.ts:1327-1335) lives ONLY
in the legacy subject-listing lane (lane 2). The moment a listing ask falls through to
the generic author (lane 3) — recipe builder produced null/invalid, or `subjectAddress`
didn't resolve, or `recipeBuilder` was truthy so lane 2 was skipped — that rule no longer
applies and the chart returns.

Note: `isNewListingRecipePrompt("New listing announcement for …")` IS true
(listing-intent.ts:27 `\bnew[-\s]?listing\b`). So the intent is unambiguous at the point
the chart is injected — the generic lane simply doesn't check it.

## Concrete fix (for the later fix step)
Mirror the legacy lane's "NO CHART ON A NEW LISTING" rule into the generic author lane.
Minimal, single-point option: gate the chart at the source so a single-property intent
never even builds/offers one. In `authorDoc`, generic lane:
- Compute a listing flag once:
  `const isListing = isListingIntent(prompt) || isNewListingRecipePrompt(prompt) || activeRecipe?.subject === "address";`
- Skip `buildPromptChart` when `isListing` (pass null / short-circuit at build-doc.ts:1388),
  AND/OR extend the chartSlot gate at build-doc.ts:1431 to
  `chartRes && resolvedRecipe !== "agent-intro" && !isListing`.
Skipping at the source (1388) is cleaner — it also avoids the wasted chart build and the
force-reserve in assembleAuthoredDoc. `isListingIntent`/`isNewListingRecipePrompt` are
already imported in build-doc.ts (lines 44-48). `activeRecipe` is in scope (line 1159).

Anchor for the fix: `lib/email/build-doc.ts` around lines 1386-1390 and 1431-1434.
