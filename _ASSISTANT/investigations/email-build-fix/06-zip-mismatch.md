# Lane 06 — Headline ZIP vs body-stats ZIP mismatch

## Symptom (ground truth)
One build showed headline "NEW LISTING — FORT MYERS, FL 33905" but the paragraph +
stat blocks analyzed ZIP 33901. Two different ZIPs in one document.

## Hypothesis
Two code paths compute "the relevant ZIP" independently and disagree:
- one from the subject address's true ZIP (→ headline)
- another from a nearby/default/fallback ZIP (→ body stats)

## Map of ZIP-deriving code paths (build-doc.ts)
- `fetchMasterDossier(scope)` — sets `?zip=scope.value` when scope.kind==="zip". build-doc.ts:132-143
- `fetchLakeParts(scope)` — loadMarketFigures(scope), loadLifecycleDigest(scope), master dossier, loadAddressCompContext(scope.address). :148-165
- `buildPromptChart(prompt, doc, scope, chartType, zips?)` — chart derives its own ZIP set. :264
- `cityZipsFor(promptPlace)` / `zipFromPromptPlace` (place-from-prompt.ts) — multi-ZIP city chart. :256-262
- `loadListingContext(scope, ...)` — inventory feed. :790
- author path: resolveSubject / resolveSubjectListing — subject address's true ZIP.

## Running notes — ROOT CAUSE FOUND

### The two disagreeing ZIP paths (author path = authorDoc, build:true / "Build the email")
Reproduces every symptom: body stats for 33901, headline 33905, AND the
"bar chart ranking OTHER ZIP codes".

**Path A — headline ZIP (33905):** the raw prompt text
"New listing announcement for 14189 Mindello Dr, Fort Myers, FL 33905 …" is passed
to the author model verbatim (build-doc.ts:1458-1460 `baseUser`). The model
transcribes the address — including its real ZIP 33905 — into the headline.

**Path B — body-stats ZIP (33901):** build-doc.ts:1375
`const promptPlace = !scope?.value ? zipFromPromptPlace(prompt) : undefined;`
- Client sends `scope = { address: addr }` with NO `value` for a listing/address
  arrival (EmailLabGridClient.tsx:308-314 — "the feed is NOT narrowed to a ZIP").
  So `scope?.value` is falsy → `zipFromPromptPlace(prompt)` runs.
- `zipFromPromptPlace` (place-from-prompt.ts:70-99) matches the needle "fort myers"
  and returns `{ place:"Fort Myers", zip: n.zips[0], zips:[...] }`.
  **It returns `zips[0]` = the CITY PRIMARY ZIP, and NEVER inspects the explicit
  5-digit ZIP already present in the text.**
- Fort Myers primary ZIP in fixtures/swfl-place-zip-crosswalk.json = **33901**,
  and **33905 is one of its alt_zips** (verified:
  `zip=33901, alt=[33902,33905,33907,33908,33912,33913,33916,33919]`).
- build-doc.ts:1376-1378 → `effectiveScope = { kind:"zip", value:"33901" }`.
  This scopes `fetchLakeParts` (loadMarketFigures + master dossier `?zip=33901`),
  the metric-card seed pool, and the figure menu — ALL to 33901.
- baseUser (1459) then literally tells the model `Scope: zip 33901` while the user
  request in the same message says `…33905`. The build hands the model two
  conflicting ZIPs.

### Also explains the ranking chart
build-doc.ts:1385 `cityZipsFor(promptPlace)` — because promptPlace kept the whole
Fort Myers `zips` list (9 ZIPs) and Fort Myers is in VERIFIED_MULTI_ZIP_CITIES
(build-doc.ts:245-251), the chart becomes the ZIP-by-ZIP city chart ranking OTHER
Fort Myers ZIPs (33907, 33912, …) under the listing's name. Matches the symptom.

### What I ruled out
- buildContentDoc (non-author) path does NOT call zipFromPromptPlace and has no
  cityZipsFor ranking chart → not the fired path.
- No explicit-ZIP extractor exists anywhere in lib/email that would have pre-set
  scope.value to 33905 (grep for `[0-9]{5}` / zipFromPromptPlace: only caller is
  build-doc.ts:1375). So the explicit ZIP in the prompt is silently discarded.

### Fix (single root, in zipFromPromptPlace)
Before returning, scan the ORIGINAL text for an explicit `\b(\d{5})\b`. If a 5-digit
ZIP is present AND it belongs to the matched entry (`n.zips.includes(hit)`), return
`{ place: n.place, zip: hit, zips: [hit] }` — the explicit ZIP wins over the city
primary, and narrowing `zips` to `[hit]` also makes `cityZipsFor` fall through
(length 1 → undefined), killing the wrong ranking chart in the same change.
Result: effectiveScope = 33905, one ZIP throughout, headline == body stats.

Fixing it in zipFromPromptPlace (not at the call site) keeps it the ONE root that
both effectiveScope AND cityZipsFor read, and covers any future caller.

Note (other lane's concern, flagged not owned): a NEW LISTING email should ideally
route to the listing-flyer path (loadListingContext / resolveSubjectListing off
scope.address) and never reach this generic ZIP author at all — but even once it
does reach it, THIS mismatch is a genuine, independent bug.
