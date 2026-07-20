# Lane 25 — second address code-trace verification (read-only, no execution)

Task: pick a real listing, trace new-listing.ts + preview-fill.ts by hand. Given
perfect facts, does AS-WRITTEN code fill photo/price/specs? Find the exact break point.

Chosen second listing for the trace: any row in `data_lake.listing_state` with
flag_new_listing=true, list_price/beds/sqft/photo_url populated. Not executing SQL —
tracing code logic only, treating the shape of `ListingFacts` as satisfied.

## Files read so far
- lib/deliverable/recipes/new-listing.ts — buildNewListing()
- lib/email/listing-flyer.ts — buildListingFlyer()

## Observations: new-listing.ts + listing-flyer.ts (assuming perfect ListingFacts)

Given a `facts: ListingFacts` object with photos[0], price, beds, baths, sqft, lotSize,
propertyType, remarks, sourceUrl, address all populated:

- buildNewListing() early-returns null ONLY if `!facts` (line 50). So facts existing at
  all is enough to proceed past the gate.
- daysOnMarket resolution: `facts.daysOnMarket ?? daysSinceListed(...)` — best-effort,
  never blocks.
- `buildListingFlyer(facts, currentDoc, daysOnMarket)` called directly — passes:
  - photo: `facts.photos[0] ? {url, alt, linkUrl} : null` — IF `facts.photos[0]` exists,
    this DOES build a real photo object with the real URL. Looks correct AS WRITTEN.
  - heroValue: `facts.price ?? ""`
  - heroLabel: address
  - specs: listingSpecs(facts, daysOnMarket) — beds/baths/sqft/lot/$-per-sqft/DOM|type,
    each computed straightforwardly from facts fields, degrading to open slot only if
    the specific facts field is missing/unparseable.
  - narrative: raw remarks (temporarily, cleared later)
- Back in new-listing.ts: dropEmptyChartSlot (chart never used for new-listing, correct
  per doc comment — operator ruling).
- clearNarrativeSlots(doc) then fillNarrative(doc, narrative) — replaces raw remarks
  with authored prose from authorListingNarrative(facts, {framing}).

CONCLUSION SO FAR: with a perfectly populated `ListingFacts`, `buildListingFlyer` +
`buildNewListing` DOES thread photo/price/specs into the EmailDoc it returns, at least
as far as building the JS object. No dropped fields visible in this slice.

## Continued trace — lifecycle-chrome.ts + inject-photo.ts + preview-fill.ts

Read `lib/email/lifecycle-chrome.ts` (`buildLifecycleEmail`) in full:
- `chrome.photo ? heroPhotoBlock(chrome.photo) : {open-slot image block}` — real photo IS
  wired into the doc's block list at the PHOTO row (step 3), full-bleed, real url/alt/linkUrl.
- hero row (step 4) uses `chrome.heroValue`/`chrome.heroLabel` directly — real price + address.
- spec strip (step 5) uses `chrome.specs` directly (from `listingSpecs`) — real beds/baths/
  sqft/lot/$-per-sqft/DOM.
- No stripping, no schema validation call visible in this function — it just builds
  `PlanEntry[]` and calls `finalizeDoc({ globalStyle, entries })`. `finalizeDoc` owns x/y only
  (per its own doc comment) — didn't find evidence it drops props here; out of lane's direct
  scope to fully re-verify finalizeDoc's zod strip behavior, but the block `props` objects
  passed in already contain the correctly-shaped keys the `image`/`hero`/`stats` schemas
  expect (matches the pattern used by every other lifecycle recipe, which the operator notes
  ARE enforced by `lifecycle-chrome.test.ts`).

Read `lib/email/inject-photo.ts` (`heroPhotoBlock`) — mints a well-formed `BlockOf<"image">`
with `kind: "photo"`, `url`, `alt`, `linkUrl`. Straightforward, no stripping.

Read `lib/email/doc/preview-fill.ts` in FULL (per assignment). CRITICAL FINDING: this module's
own header comment (lines 1-14) states it is called ONLY by
`scripts/capture-seed-previews.mts` (and its tests), explicitly for the STATIC /showcase
template-gallery captures — NOT the live email-lab "Build the email" AI path. Its own test
suite (`preview-fill.test.ts`) "fails the suite if any lab entry path imports this module."
So `previewFill()` / `SEED_PREVIEW_FILL` / `SEED_ASSIGNMENTS` are NOT in the code path that
handles a user's "New listing announcement for <address>..." prompt in Email Lab. This file
is unrelated to the live confirmed bug (it may be what powers /showcase's static gallery, a
DIFFERENT surface from /dev-emails and from live Email Lab AI-build).

## CONCLUSION

Traced `new-listing.ts` → `listing-flyer.ts` → `lifecycle-chrome.ts` → `inject-photo.ts` byte
by byte, assuming a `ListingFacts` object with every field populated (photos[0], price, beds,
baths, sqft, lotSize, propertyType, remarks, sourceUrl, address all present — the exact shape
a real, current listing like 14189 Mindello Dr would produce if `resolveSubject` succeeded).

**Found NO line in this slice where the code, as written, would fail to fill photo/price/specs
given perfect data.** Every one of the four "answers" (skeleton/cells/chart/prose) genuinely
threads facts.* values straight into the EmailDoc's blocks: real photo url, real price, real
beds/baths/sqft, no invented figures, chart correctly dropped per the operator's own new-listing
policy.

The ONE conditional in the whole path that can silently produce a NON-listing email is line 50
of `new-listing.ts`:
```
if (!facts) return null;
```
`buildNewListing` returns `null` — falls through to "the generic author" — whenever `facts` is
null. Given the confirmed symptom (generic ZIP-level stats email, a bar chart of OTHER ZIPs,
cut-off sentences, once a mismatched ZIP) this looks EXACTLY like the generic-author fallback
path firing instead of this recipe, which only happens if:
  (a) the dispatcher never resolves the intent/recipe KEY to `"new-listing"` for this prompt
      shape ("New listing announcement for <address>, use the real listing photo..."), and/or
  (b) the dispatcher resolves the key correctly but `resolveSubject` (upstream of this file,
      in build-doc.ts per this file's own top-of-file doc comment) fails to populate `facts`
      for the named address even though the row genuinely exists in `data_lake.listing_state`.

Both (a) and (b) are OUTSIDE this lane's assigned files — new-listing.ts/listing-flyer.ts/
lifecycle-chrome.ts/inject-photo.ts are not where the bug lives. They correctly consume
`facts` when given it. The break is upstream of this recipe, in the dispatch/resolution layer
(`app/api/email-lab/ai/route.ts`, and whatever calls `resolveSubject`) — consistent with other
lanes' likely focus, and this lane's role was exactly to rule these files IN or OUT. Ruling OUT.

Next (not done, out of lane): would need to read `build-doc.ts`'s `resolveSubject` and the
route's intent-classification step to find the actual line where `facts` ends up null (or the
wrong recipe key is chosen) for a valid, real, current address.

1. Where does `facts: ListingFacts` actually GET populated from — is it actually
   populated with real listing_state data for a *named-address* build request, or does
   the dispatcher only build `facts` for some other path (e.g. campaign path) and fall
   through to a different, generic recipe for the "new listing announcement for <addr>"
   phrasing? This is the other lanes' focus (recipes dispatch / route.ts) — but I must
   verify by reading, not assume.
2. Whether `buildLifecycleEmail` (the actual grid renderer consuming these fields)
   preserves `photo`/`heroValue`/`specs` through to the final EmailDoc blocks, or drops
   them via the EmailDoc/block zod schema strip-mode (per bug brief: "a prop missing
   from a schema is silently dropped").
3. preview-fill.ts's role — is it invoked in this recipe path at all, or only for the
   SEED_DOCS/default-docs path (a different lane, e.g. /dev-emails capture script)?
