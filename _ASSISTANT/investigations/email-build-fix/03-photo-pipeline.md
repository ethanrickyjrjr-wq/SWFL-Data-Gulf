# Lane 03 — Listing photo resolution/mirroring pipeline

Question: why did a build against 14189 Mindello Dr (real photo_url in
data_lake.listing_state) produce an email with NO photo block? Is the photo lookup
never called, called against the wrong key, or called-but-result-lost?

## Answer: the photo lookup is NEVER CALLED — no subject address is ever extracted from the prompt.

## The photo pipeline itself is SOUND (ruled out as the fault)

Traced the full address→photo path; every hop is correct GIVEN a resolved subject:

- `resolveSubjectListing` (lib/listings/resolve-subject.ts) lane-1 reads our own lake:
  `data_lake.listing_dom` filtered `sale_or_rent=sale`, `state=active`,
  `street_address ilike '<houseNo> %'`, `zip_code=<geo.zip>` (resolve-subject.ts:83-99).
- `listing_dom` view = `SELECT anchored.*` where `anchored = SELECT s.*, …` over
  `data_lake.listing_state s WHERE source_name='api_feed'` (docs/sql/20260717_listing_dom.sql:19-54).
  → it carries **photo_url** (s.*), so the column is present in the view. Not the fault.
- `lakeRowToListing` maps `...(row.photo_url ? { photoUrl: row.photo_url } : {})` (select.ts:286).
- `toFacts` sets `photos: l.photoUrl ? [l.photoUrl] : []` (resolve-subject.ts:256).
- `resolveSubject` mirrors it: `mirrorHeroPhoto(facts.photos[0])` (shared.ts:181-184).
- `buildNewListing` → `buildListingFlyer(facts, …)` attaches the hero photo block
  (new-listing.ts:68); `attachFeaturedAerial`/`heroPhotoBlock` prefer photoUrl (select.ts:187-196).
- `mirrorHeroPhoto` / `deriveListingPhoto` degrade to null → keep original (hero-photo.ts,
  listing-photo.ts). No silent drop.

So IF a subject address reaches `resolveSubject`, the photo is fetched, mirrored, and
placed. It does not.

## Root cause: subject-address extraction fails for natural "…for <address>" phrasing

Prompt under test (typed into the Email Lab AI-build panel, no recipe card clicked):
"New listing announcement **for** 14189 Mindello Dr, Fort Myers, FL 33905, use the real
listing photo and real price/specs"

Two independent gates in `authorDoc` (lib/email/build-doc.ts) both yield a null subject:

1. Recipe branch (build-doc.ts:1159-1172):
   - `activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt)`.
   - Typed panel sends no recipeKey → `recipeByKey`=null. `recipeFromPrompt` only matches a
     recipe SEED prompt prefix via `p.startsWith(head)` (recipes.ts:412-426) — an organic
     typed prompt doesn't → null. So activeRecipe=null, branch not entered.
2. Legacy lane (build-doc.ts:1289-1293):
   - `subjectAddress = !recipeBuilder && isNewListingRecipePrompt(prompt)
       ? (scope?.address ?? subjectAddressFromPrompt(prompt)) : null`.
   - `isNewListingRecipePrompt` = TRUE ("New listing" matches NEW_LISTING_RECIPE).
   - `scope.address` is UNDEFINED for a typed prompt — scope is arrival-derived only
     (EmailLabGridClient.tsx:308-314: `addr ? { address: addr } : undefined`, addr from
     URL/address-popup, never from the typed Build box).
   - `subjectAddressFromPrompt(prompt)` → **null**. THE BUG:
     `SUBJECT_AT = /\b(?:listing|property|home|house)\s+at\s+(.+?)(?:\s*[—–]|\s+-\s+|$)/i`
     (lib/email/listing-intent.ts:42) only anchors on "listing/property/home/house **at**
     <addr>". The prompt says "announcement **for** 14189 Mindello Dr" — no "… at …" → no
     match → returns null (listing-intent.ts:44-50).
   - subjectAddress = `undefined ?? null` = null → `if (subjectAddress)` skipped.

Both gates null → build falls to the GENERIC AUTHOR (build-doc.ts:1368+). Its ONLY photo
source is `resolveHeroPhoto(prompt, currentDoc)` (build-doc.ts:1389), which needs a URL in
the prompt (`extractUrls`) or a saved brand website. The prompt has neither an http URL nor
(for an anon/typed build) a brand site → `resolveHeroPhoto` returns null → `photoSlot` null →
no hero photo block. Exactly the reported photo-less generic ZIP grab-bag (the generic author
also produces the ZIP stats / bar-chart-of-other-ZIPs body).

## Classification: "photo lookup NEVER CALLED" (not wrong-key, not result-lost).

The address→listing_state→photo_url→mirror→heroPhotoBlock pipeline is gated behind subject
resolution, and subject resolution never runs because the address is never parsed out of a
natural-language prompt that uses "for <address>" instead of the rigid "…at <address> —"
recipe-seed shape `subjectAddressFromPrompt` was written for.

## Proposed fix (surgical, in my lane)

Broaden `subjectAddressFromPrompt` (lib/email/listing-intent.ts:42-50) to recognize natural
address phrasings, not just "…{listing|property|home|house} at <addr>":
- accept "for <addr>" / "announcement for <addr>" / "at <addr>";
- or, more robustly, extract the first "<houseNumber> <street…>, <city>, FL <ZIP>" span
  directly (a US-address regex), independent of the connective word.
Keep the existing guards (must contain a digit, min length, strip trailing punctuation, and
stop before a requirements clause). Once a real address is returned, the entire existing photo
pipeline runs unchanged and the hero photo lands.

Companion (other lane, note only): the Email Lab AI-build panel not sending a `recipeKey`
means even correct recipe intent falls to `recipeFromPrompt`'s seed-prefix match, which a typed
prompt can't satisfy. That's a recipe-dispatch gap; it is NOT what strips the photo — the
photo is stripped by the null subject address, which also breaks the legacy lane that does not
depend on recipe dispatch at all.
