# FINDINGS — the comps email was built and looked at. 0 of 6 photos.

**08/04/2026.** Answers `_ASSISTANT/2026-08-04-comp-photos-PROVE-IT-HANDOFF.md`.
Artifact: `runs/campaign-sim/2026-08-04-mse88gas/04-market-comps.html`
Command: `bun scripts/email/campaign-sim.mts --only market-comps` (dry run, nothing sent).

## The count, honestly

**0 of 6 comp rows show a photo.** Not a partial fill. Zero.
Whole doc carries 4 `<img>`: subject hero photo, chart PNG, brand logo, agent avatar.
Zero rdcpix/realtor.com images anywhere.

**0 of 6 comp rows carry a listing link either.** The doc has 11 hrefs total and none is a
per-comp listing URL. The decree's fallback — "no photo -> still a link" — is ALSO not happening.

Good news, narrow: **zero aerials** (grep for aerial/satellite/staticmap/streetview/tile = 0), and
the rows degrade to clean text with NO broken-image icons. The operator's 08/03 broken-slot
screenshot does not reproduce. The per-row open-slot contract works; there is simply nothing to put in it.

## Root cause — NOT the env fix, and NOT a wiring miss

The Apify lane RUNS and WORKS. Probed live: `fetchApifyComps({location:"33908", listingType:"sold",
maxResults:24})` returned **24 records in 5.3s, every one with a real rdcpix `primary_photo`**.
`apifyPhotoIndex` built 24 keys cleanly. No warn line printed. `APIFY_KEY` reads fine.

**The two sets are disjoint. The join hits zero, every time, by construction.**

- Comp set (from `compsForAddress`, a lake/deed sold lane): 6 SPECIFIC addresses, ALL-CAPS,
  first-of-month sale dates 03/2026-05/2026 — e.g. `14503 DOLCE VISTA RD`, `16686 WATERS EDGE CT`.
- Apify query: a **ZIP-WIDE sample** of 24 arbitrary sold homes in 33908, with **no date window**
  and no address targeting — e.g. `12078 TERRA VERDE CT`, `8978 BRISTOL BND`.
- Key intersection: **0 of 6.**

ZIP 33908 has hundreds of sales in that window. Asking for 24 arbitrary ones and hoping our 6
specific houses are among them is a lottery we lose every build. `maxResults` is
`min(missing.length*4, 40)` = a slice, not a lookup.

Lane 1 (lake `listing_state`) correctly missed all 6: the sweep window opened 06/30/2026 and every
comp sold before it. That part is working as documented.

**So: we pay for 24 photos of the wrong houses and discard all 24.** The empty map is
byte-identical to "no photos exist" — the same silent-failure shape the env bug had.

## SECOND DEFECT, found while looking — a WRONG-HOUSE link, live

`market-comps.ts:1400` fetches the subject's own record:

    fetchApifyComps({ location: facts.address, listingType: "for_sale", maxResults: 1 })[0] ?? null

It takes record `[0]` with **no check that the returned record is the address we asked for.** The
actor treats `location` as a search AREA, not an exact-address lookup.

Result in this build: subject is **8348 Southwindbay Cir, Fort Myers, FL 33908**. The record
returned — and used for BOTH the hero photo link and the "Find Out More" CTA — is
**306 Chattanooga Dr, Fort Myers, FL 33905**. Different street, different ZIP, someone else's house.
It also fed `subjectStyle`, so the style-comparison footnote is sourced from the wrong property.

Same bug pattern as the photo defect: **a vendor AREA SEARCH consumed as an EXACT ADDRESS LOOKUP,
with no identity verification on the way back.** One root cause, two symptoms.

## What the fix has to do (design, not yet built)

Per-address targeting, not ZIP sampling. Our own research
(`_RESEARCH/competitor-and-strategy/2026-08-03-apify-actor-fit-assessment.md`) and the vendor note
in `apify-comps.ts`'s own header both say `radius` works ONLY when `location` is a specific ADDRESS.
Options, in cost order — needs a brainstorm + operator call, not a unilateral edit:
1. One actor call per missing comp, location = that comp's address, then VERIFY the returned
   `street`/`city` matches before accepting. ~$0.01 x 6 = ~$0.06/email.
2. Bulk ZIP + explicit `date_from`/`date_to` covering the comp window, pulled deep enough to
   actually contain the set (research proved date-range works: 31 items for 33914 over 2 months).
   Cheaper per photo, but unbounded and still not guaranteed.
Either way the identity check on `[0]` is mandatory and fixes the wrong-house link too.

## Also observed, not chased

- The comp set is **non-deterministic between runs** — the probe minutes later returned a different
  6 (`16341 FAIRWAY WOODS DR`, `14514 DOLCE VISTA RD`, `16237 COCO HAMMOCK WAY`). Ranking is
  unstable; a price-defense email that shows different evidence each build is its own problem.
- Sale dates are all first-of-month (05/01, 04/01, 03/01) — month-granularity stamps being rendered
  as exact "Sold 05/01/2026" dates.
- `market-comps.ts` imports `@/lib/listings/apify-style`, which is **untracked** in git. If the
  parallel session commits the recipe without that module, CI breaks in the same
  committed-consumer/uncommitted-dependency shape as the 08/02-08/04 red run.
- Subject $333/sq ft sits above ALL six comps ($111-$266). The extreme tier fires correctly and the
  email states it plainly — the direction-symmetric honesty rule is working.

## Check status

- `apify_comp_email_live_verify` — ANSWERED, and the answer is negative. Artifact path + count above.
- `comp_email_font_scale_unverified` — closable per the handoff's 08/04 scale-census evidence.
- `comp_email_rules_card_conformance` — NOT audited. Ran out of scope this pass; still open.

---

# UPDATE — after the fix attempt (same session, 08/04/2026)

## What is FIXED and proven

**1. The wrong-house link is dead.** `pickAddressMatch` now verifies every vendor record against
the address we asked for. Rebuilt: `Chattanooga` appears 0 times. The subject lookup returns NULL
rather than a stranger's listing — an open slot instead of a lie.

**2. Comp rows link when the vendor comp lane supplies the set.** Run `2026-08-04-mseal24v` rendered
**4 distinct real realtor.com detail pages**, one per comp row (18601 Marco Blvd, 18626 Coconut Rd,
19006 Coconut Rd, 7386 Pine Dr). Previously 0 of 6.

**3. Cache-first is wired.** `resolveCompEnrichment` reads `data_lake.apify_property_records` before
paying — closing §2.1 of the cache handoff for this surface. Spend is ceilinged by `maxPaidLookups`.

**4. A third instance of the same bug class, caught before it shipped.** The cache table is keyed
with `listingAddressKey` ("14503 dolce vista rd fort myers"); the photo indexes are keyed with
`compPhotoKey` ("14503DOLCEVISTARD@FORTMYERS"). **Two different normalizers for one concept.**
Anyone wiring the cache handoff's §2.3 with the wrong one gets zero rows and no error. Documented at
the head of `apify-identity.ts`; both keys imported there so the pairing is explicit.

## What is NOT fixed, and the reason is a VENDOR CEILING, not our code

**Photos are still 0.** Per-address lookup is NOT a capability this actor has. Proven live —
`location: "14503 DOLCE VISTA RD, FORT MYERS, FL 33908"`, `radiusMiles: 0.3`:

    [sold]     -> 12078 Terraverde Ct, 16820 Sanibel Sunset Ct, 18200 Creekside View Dr,
                  16299 San Carlos Blvd, 12423 McGregor Woods Cir   (0 match)
    [for_sale] -> 9140 Southmont Cv, 6012 Timberwood Cir, ...       (0 match)

The street address is **ignored**. It returns the same area sample the ZIP sweep returned — the
identical five homes. `radius` is ignored too. So `moving_beacon-owner1/realtor-com-property-scraper`
answers AREAS ONLY. The note in `apify-comps.ts`'s header ("radius ONLY works when the location is a
specific ADDRESS") is misleading: the address is *accepted*, and silently treated as an area centre
whose own record is not returned.

**Correcting my own earlier claim in this file:** I wrote that the fix was "one actor call per
missing comp, location = that comp's address." That is wrong and I proved it wrong. Do not try it.

## The two real options for photos (needs an operator call)

1. **Bulk ZIP + explicit `date_from`/`date_to` covering the comp window, pulled DEEP enough to
   actually contain the set**, then join on `compPhotoKey`. Research proved date ranges work
   (31 items, 33914, 2 months). Cost scales with window depth, but every row lands in the cache, so
   it amortises across builds and across the other surfaces in the cache handoff.
2. **The second actor** — `one-api/realtor-property-scraper`, $0.007/result, keyed on
   `property_inputs: [<realtor.com detail URL>]`. A true per-property lookup, but it needs the
   DETAIL URL, which the Lee lake comp lane does not carry. Chicken-and-egg unless option 1 or the
   vendor comp lane supplies the URL first.

Option 1 is the only one that stands alone today.

## Still not done

- Email NOT sent to hello@swfldatagulf.com.
- The consolidated recipe doc is NOT written.
- `comp_email_rules_card_conformance` still unaudited.
- The comp set remains NON-DETERMINISTIC across runs (33908 sold comps / 33967 valuations / back to
  33908 across three consecutive builds). Until that settles, any photo-coverage number measured on
  one build does not describe the next one. This is arguably the biggest remaining defect.
