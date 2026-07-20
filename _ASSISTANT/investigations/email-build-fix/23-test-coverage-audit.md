# Lane 23 — Test coverage audit for email-build path

## Anomaly noted (not my lane, not touched)
After running `mkdir` + `find` (both read-only/dir-creation, no file edits), a PostToolUse hook
flagged that "last Bash command modified components/email-lab/EmailLabGridShell.tsx" claimed by
another session. I did not touch that file — command was `mkdir -p ... && find ...`. Likely a
false positive from the hook's diffing against a concurrent session's live edits, not something I
caused. Per safety rules I'm not running any git commands to inspect/verify this. Flagging it in
this note for the record; not investigating further since it's out of my assigned lane
(test-coverage audit) and touching git is prohibited for this pass.

## Test files found under lib/deliverable/, lib/email/, app/api/email-lab/
(~200 files, see full `find` output). Notably present:
- lib/email/doc/preview-fill.test.ts
- lib/email/doc/default-props-slots.test.ts, default-docs.subject.test.ts
- lib/email/listing-intent.test.ts, listing-scrape.test.ts, listing-cascade.test.ts, listing-flyer.test.ts, listing-jsonld.test.ts
- lib/email/parse-intent.test.ts, place-from-prompt.wrong-city.test.ts
- lib/email/inject-photo.test.ts, inject-chart.test.ts
- lib/email/build-doc.test.ts, build-doc-listing.test.ts
- lib/deliverable/recipes/*.test.ts (one per recipe)
- lib/deliverable/recipes.parity.test.ts, seed-recipe-parity.test.ts

Notably ABSENT:
- No test file for `app/api/email-lab/ai/route.ts` itself (the actual AI-build endpoint). Only
  `app/api/email-lab/social/chart/route.test.ts` and `app/api/email-lab/social/__tests__/upload.test.ts`
  exist under app/api/email-lab/ — neither touches the `/ai` route.

## Test run results (read-only, no DB writes; all these files mock their DB/network deps)

`bun test lib/email/listing-intent.test.ts lib/listings/resolve-subject.test.ts lib/listings/select.test.ts lib/email/build-doc.test.ts`
→ **60 pass / 0 fail** (122 expect() calls).

`bun test lib/deliverable lib/email app/api/email-lab` (full scoped run)
→ **2617 pass / 0 fail** across 235 files (7322 expect() calls, 15.9s). Some expected console noise
(mortgage-rate tolerance fallback, missing PEXELS key, one intentionally-broken brand fixture,
AMBIGUOUS FARM AREA refusal) — none of it is a failure, all asserted/expected behavior.

**Everything green. This is itself the finding: full green with the confirmed live bug present
proves the suite doesn't exercise the failing path at all — a coverage gap, not a broken test.**

## Root cause cross-reference (lane 08 already nailed it; I'm confirming from the test side)

Lane 08 (`08-recipe-new-listing.md`) traced the bug to `subjectAddressFromPrompt`
(`lib/email/listing-intent.ts:42-50`): its `SUBJECT_AT` regex only matches the rigid template
`(listing|property|home|house) at <addr>` terminated by an em-dash/" - "/end. The real, organic
prompt "New listing announcement **for** 14189 Mindello Dr, Fort Myers, FL 33905, use the real
listing photo and real price/specs" uses "for" (not "at") and comma delimiting (no em-dash) →
no match → null → `authorDoc`'s recipe-dispatch (`buildNewListing`) never gets `ctx.facts` →
falls through to the generic ZIP-stats author. Exactly the observed symptom.

I read `lib/email/listing-intent.test.ts` end to end (lines 1-65 — the whole file). EVERY existing
`subjectAddressFromPrompt` test uses the SAME rigid seed-template phrasing:
- `"Build a new-listing announcement email for my listing at 326 Shore Dr, ... — key specs..."`
  (the literal campaign-button seed string, `SEED` at line 37-38)
- a geocoder-long-form variant of the same "listing at <addr> —" template (line 50-56)
- two null-case tests, still keyed off "listing at ..." phrasing (line 58-64)

**Not one test in the file uses "for <addr>" instead of "at <addr>", and not one uses comma
delimiting instead of an em-dash terminator — i.e., not one test exercises an ORGANIC, freely-typed
prompt shape.** The test file's own comment at line 32-36 already names the exact failure mode in
the abstract ("every prior test injected [the address] via scope.address... every in-lab campaign
build silently fell through to the free author") but the fix that comment describes only covers the
CAMPAIGN-SEED phrasing, not organic typed phrasing — so the class of bug it was written to catch
recurred one level up, in a shape the test suite still doesn't reach.

Same gap, one level up, in `lib/deliverable/recipes.ts` `recipeFromPrompt`'s `startsWith(head)`
matching against the exact seed head (lane 08, line 75-77) — I did not find a dedicated test file
for `recipeFromPrompt`'s prompt-matching behavior itself (`recipes.parity.test.ts` and
`seed-recipe-parity.test.ts` test recipe/seed correspondence, not prompt→recipe string matching).

## THE test-coverage gap, stated directly

**No test anywhere in `lib/deliverable/`, `lib/email/`, or `app/api/email-lab/` asserts that a
freely-typed, non-templated "new listing" prompt naming a real address ends up with that address's
photo/price/beds/baths in the final built doc.** The closest tests stop one layer short of the
real failure:
- `resolve-subject.test.ts` — tests `resolveSubjectListing(address, deps)` directly, i.e. GIVEN an
  address string, does it resolve correctly. It never calls the address-EXTRACTION step
  (`subjectAddressFromPrompt`) first, so it can't catch an extraction failure.
- `listing-intent.test.ts` — tests `subjectAddressFromPrompt` only against the one rigid phrasing
  the seed system produces, never against organic user phrasing.
- `build-doc.test.ts` — tests `authorDoc`/`buildContentDoc` internals (voice-cleaning, patch
  parsing, docSkeleton figure visibility) but the one `authorDoc` call it makes uses NO scope and
  a generic market-spotlight prompt — it never exercises the new-listing recipe dispatch branch,
  the `recipeFromPrompt` match, or `subjectAddressFromPrompt` at all.
- There is no route-level test for `app/api/email-lab/ai/route.ts` and no end-to-end
  ("prompt string in" → "doc with populated hero/price/photo out") test anywhere in this tree.

## What a regression test for this SHOULD assert

A new test (natural home: `lib/email/listing-intent.test.ts`, extending the existing
`subjectAddressFromPrompt` suite; ideally paired with an `authorDoc`-level integration test in
`build-doc.test.ts`) should assert, at minimum:

1. **Extraction, organic phrasing** — `subjectAddressFromPrompt` returns the address for prompts
   shaped like the real repro, not just the seed template:
   - `"New listing announcement for 14189 Mindello Dr, Fort Myers, FL 33905, use the real listing
     photo and real price/specs"` → `"14189 Mindello Dr, Fort Myers, FL 33905"`.
   - Cover the two structural axes lane 08 named: the verb ("for" not just "at") and the
     terminator (comma-delimited trailing clause, not just an em-dash).
2. **Recipe dispatch, organic phrasing** — `recipeFromPrompt` (or whatever replaces its
   `startsWith` match) resolves the `new-listing` recipe key for the same organic prompt, not only
   the exact seed head.
3. **End-to-end doc population** — an `authorDoc`/`buildNewListing` level test that, given the
   organic prompt above and a stubbed `resolveSubjectListing`/lake lookup returning a fixture with a
   real `photoUrl`/`price`/`beds`/`sqft` (mirroring the 14189 Mindello Dr ground truth in the bug
   report), asserts the RETURNED DOC contains: a hero/listing block with that exact photo URL, that
   exact price, and those exact specs — and explicitly asserts it does NOT fall through to the
   generic ZIP-stats/lifecycle/bar-chart author path (e.g. assert no `multi-column`/bar-chart ZIP-
   ranking block appears when a subject address was successfully named). This is the test that
   would have caught the actual reported failure; (1) and (2) alone would only catch it if someone
   remembered to wire them together.
4. **Negative control** — a prompt naming NO address (pure market-update ask) should still fall
   through to the generic author, so the fix doesn't overcorrect and hijack every prompt into the
   listing lane.

