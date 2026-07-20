# Lane 09 — Live-trace the "Just Sold" recipe

Incident tie-in: real project "Just Sold · 26000 Hickory BLVD #705" got its content
REPLACED by generic `$—` placeholder stat blocks + an unrelated Naples-area ZIP
price-ranking chart. Goal: why a Just Sold build ends with blank `$—` instead of the
actual sale price.

## Files traced
- `lib/deliverable/recipes/just-sold.ts` (buildJustSold)
- `lib/deliverable/recipes/index.ts` (RECIPE_BUILDERS dispatch table)
- `lib/email/build-doc.ts` (authorDoc — the paid "Build the email" path, l.1114-1393)
- `lib/deliverable/recipes/shared.ts` (resolveSubject, l.147-187)
- `lib/email/listing-intent.ts` (subjectAddressFromPrompt, l.44-50)
- `lib/deliverable/recipes.ts` (just-sold def l.232-243, recipeFromPrompt l.412-426)
- `lib/listings/resolve-subject.ts` (canonStreet l.177-188)

## Dispatch flow (authorDoc, build-doc.ts)
1. l.1159 `activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt)`
2. l.1160 `recipeBuilder = builderFor(activeRecipe.key)` → buildJustSold
3. l.1168-1172 `subject = scope?.address ?? subjectAddressFromPrompt(prompt)`;
   `resolvedSubject = subject ? await resolveSubject(...) : null`
4. l.1174-1181 `built = await recipeBuilder({ facts: resolvedSubject?.facts ?? null, ... }).catch(()=>null)`
5. l.1183 `if (built)` + l.1205 `if (parsed.success)` → return recipe doc
6. If `built` is null / throws / invalid → fall through → legacy lane (l.1289) →
   **generic author** (l.1368+), which returns `replacedLayout:true` and composes a
   ZIP price-ranking chart + generic market stats. NO error surfaced to the user.

## ROOT CAUSE A — the actual sale price is structurally unreachable → `$—`
buildJustSold (by design, "THE CLOSE-PRICE PROBE" header) REFUSES `facts.price` (the
ask) for the close. Its ONLY close source is:
- `close = closeFrom(subjectRow(allComps, street))` (just-sold.ts:346-347)
- `subjectRow` (l.158-162) finds the comp whose `canonStreet(addressLine)` === the
  subject's `canonStreet(street)`.
- `closeFrom` (l.169-172) requires `priceKind === "sold"`.

Two independent ways this yields `close = null` → every price cell an open `$—` slot
(soldSpecs l.229-246: hero close blank, List Price / List-to-Sale / $/Sq Ft all
undefined):

1. CONDO UNIT BREAKS THE SELF-MATCH. `canonStreet` (resolve-subject.ts:177-188) only
   strips `apt|unit|ste|suite|lot`-prefixed tokens. A bare `#705` → token `705`
   SURVIVES: `canonStreet("26000 Hickory Blvd #705") = "26000 hickory blvd 705"`.
   The comp helper's building-level addressLine canonizes to `"26000 hickory blvd"`.
   `"...705" !== "..."` → subjectRow returns null → close null → `$—`. Every condo
   (#unit) Just Sold hits this.

2. ENRICHMENT CAP. Even for a non-condo, `compsForAddress` enriches at most 2 comps
   with their exact recorded sale (just-sold.ts:139-141 cites `Math.min(enrichN,2)`),
   and the subject may not be among the 2 → its own row lacks priceKind "sold" →
   close null → `$—`. County recording also lags weeks, so this is the COMMON case.

buildJustSold NEVER consults the lake (`data_lake.listing_state` or any sold table)
for the subject's OWN close — it relies entirely on the comp-helper self-match. So a
real, recorded sale price that exists in our data is never surfaced.

## ROOT CAUSE B — silent fall-through overwrites the project with the ZIP grab-bag
The incident's Naples ZIP price-ranking chart is NOT something buildJustSold can
produce (it only makes a comps-bar, and only when close is sourced). That chart is a
GENERIC-AUTHOR artifact. So in the incident, the build did NOT return the just-sold
doc — it fell through to the generic author. Triggers:

- `ctx.facts` null → buildJustSold `if (!resolved) return null` (just-sold.ts:330) →
  built null → fall-through. facts is null only when `subject` was null, i.e.
  `scope.address` absent AND `subjectAddressFromPrompt(prompt)` missed AND no recipe
  seed prompt carried the address.
- OR activeRecipe null entirely: an existing-project rebuild that posts the project
  TITLE ("Just Sold · 26000 Hickory Blvd #705") as the prompt and NO `rkey`.
  `recipeFromPrompt` prefix-matches the seed head "Build a just-sold email for my
  listing at " (recipes.ts:412-426) — the title doesn't start with it → null →
  recipe dispatch skipped → generic author. legacy lane also skips (isNewListing
  regex doesn't match "Just Sold").

Either way the generic author runs, returns `replacedLayout:true`, and REPLACES the
existing project content with a ZIP ranking chart + `$—`/generic stat blocks — no
error, no signal. That is the destructive content-replacement in the incident.

Note: resolveSubject (shared.ts:147-187) NEVER returns null facts — a vendor miss
still yields an address-only skeleton (`resolved:false`). So the null-facts path is
driven by the DISPATCHER failing to extract a subject address, not by resolveSubject.

## What's NOT the cause (ruled out)
- resolveSubject returning null → ruled out (always returns address-only skeleton).
- buildJustSold producing the ZIP ranking chart → impossible (comps-bar only, needs
  close). The ranking chart pins the incident to the generic-author fall-through.

## Fix direction (for the later human-reviewed fix pass — NOT applied)
1. Give the close a lake lane: query the subject's own recorded sale from our data
   (listing_state / a sold-events table) keyed on the resolved subject, before
   falling back to the comp-helper self-match — so the actual sale price fills the
   hero instead of `$—` when we hold it.
2. Fix subjectRow for condos: match unit-aware, or strip the bare trailing
   `#<num>`/number token in canonStreet (or match building-level and carry the unit
   separately) so a unit'd subject can still find its own row.
3. Stop the silent destructive fall-through: when a recipe was identified but its
   builder returns null / invalid, do NOT hand the existing project to the generic
   author with `replacedLayout:true`. Surface "couldn't resolve <address> for Just
   Sold" and keep the project's current content, OR land the just-sold chrome with
   open slots (never the ZIP grab-bag) for an address-spine recipe.
4. Ensure the rebuild path carries `rkey`/seed prompt so activeRecipe is never null
   for a known project (cross-lane w/ AutoCreateProject).
