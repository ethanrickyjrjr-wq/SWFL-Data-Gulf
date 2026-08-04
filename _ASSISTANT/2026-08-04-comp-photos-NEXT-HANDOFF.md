# HANDOFF — land comp photos, send the email, write the recipe

**Written 08/04/2026** by the session that built the comps email and looked at it.
**Status:** the wrong-house link and the missing comp links are FIXED and proven. Photos are NOT,
and the reason is a vendor ceiling that is already proven — do not re-derive it.

Predecessors, read in this order:
1. `_ASSISTANT/2026-08-04-comp-photos-FINDINGS.md` — the measurements, including the UPDATE section
   at the bottom which corrects an earlier claim in the same file.
2. `_ASSISTANT/2026-08-04-apify-record-cache-HANDOFF.md` — the record cache. Its §3.4 ("a sweep is
   not a lookup") is the same finding, reached independently. Its §2.1 is now PARTLY done (below).
3. `lib/listings/apify-identity.ts` — read the file header before touching any Apify call.

---

## 1. What shipped this session — DO NOT REBUILD

**`lib/listings/apify-identity.ts`** (new, uncommitted) + `apify-identity.test.ts` (14 tests green).

- `matchesAddress(record, addressLine, city)` — the identity check that was missing everywhere.
- `pickAddressMatch(records, …)` — the ONLY sanctioned way to take one record out of an area
  search. Replaces the blind `[0]`.
- `apifyListingUrlIndex(records)` — `property_url` keyed by `compPhotoKey`. This is the comp row's
  LINK, which the Lee lake lane cannot supply (`comp-helper.ts:291` sets `sourceUrl: null` because
  deed data carries no listing page).
- `resolveCompEnrichment(comps, opts)` — **cache first, then a ceilinged paid lane.** Reads
  `data_lake.apify_property_records` before spending. Partly closes `apify_cached_records_unread`
  for this surface.

**Wired into `lib/deliverable/recipes/market-comps.ts`** (uncommitted, and that file also holds a
PARALLEL SESSION's uncommitted style work — coordinate before committing it):
- `resolveCompThumbnails` now returns `{ thumbnails, styles, listingUrls }` and no longer does a
  ZIP-wide sample.
- `compRow` / `compsMiddle` / `buildCompsGrid` thread `listingUrls` to the row.
- The subject-record fetch is guarded by `pickAddressMatch`.

**Proven live:**
- Wrong-house link GONE — `Chattanooga` 0 occurrences in the rebuild (was the hero photo link AND
  the "Find Out More" CTA, pointing at 306 Chattanooga Dr 33905 for a 33908 subject).
- Comp links WORK — run `2026-08-04-mseal24v` rendered 4 distinct real realtor.com detail pages.
- Zero aerials, still. `no-aerial.test.ts` green.

---

## 2. THE VENDOR CEILING — proven, do not retry per-address lookup

`moving_beacon-owner1/realtor-com-property-scraper` **ignores the street address.** Measured live,
`location: "14503 DOLCE VISTA RD, FORT MYERS, FL 33908"`, `radiusMiles: 0.3`:

    [sold]     -> 12078 Terraverde Ct, 16820 Sanibel Sunset Ct, 18200 Creekside View Dr,
                  16299 San Carlos Blvd, 12423 McGregor Woods Cir     0 of 5 match
    [for_sale] -> 9140 Southmont Cv, 6012 Timberwood Cir, ...          0 of 5 match

It returns the SAME area sample the ZIP sweep returned. `radius` is ignored. The note in
`apify-comps.ts`'s header saying "radius ONLY works when the location is a specific ADDRESS" is
MISLEADING — the address is accepted and silently treated as an area centre whose own record is not
returned. **One call per comp address does not work. That was my earlier recommendation and it is
wrong.**

---

## 3. THE JOB

### 3.1 Photos — bulk ZIP + explicit date window (the only option that stands alone)

Pull the ZIP with `date_from`/`date_to` covering the comp set's actual sale window, deep enough to
contain the set, then join on `compPhotoKey`. Date ranges are proven: 31 items for 33914 over two
months (`_RESEARCH/competitor-and-strategy/2026-08-03-apify-actor-fit-assessment.md`).
`buildActorInput` already passes `date_from`/`date_to` — no new plumbing needed.

- Derive the window from the comps themselves (min/max `priceDate`), never a hardcoded span.
- Every row lands in the record cache, so cost amortises across builds AND across the other
  surfaces in the cache handoff (descriptions, HOA, sold price, 50 alt_photos for social).
- **Name the spend ceiling before running it.** At $0.01/result a deep ZIP+6-month pull is real
  money. Get the operator's number first.
- The alternative — `one-api/realtor-property-scraper`, $0.007/result, `property_inputs:
  [<detail URL>]` — is a TRUE per-property lookup but needs the detail URL, which lake comps do not
  carry. Only viable downstream of 3.1 or of the vendor comp lane.

### 3.2 Send the email to hello@swfldatagulf.com

The operator asked for this twice and it has not happened. `bun scripts/email/campaign-sim.mts
--only market-comps --send --now` builds and sends one stage; confirm the recipient wiring before
firing. Report the photo count IN THE INBOX, not from the HTML.

### 3.3 Write the recipe — "all the recipes and data in one place"

Operator, 08/04/2026: *"write the fucking recipe so no one fucks up any more"* and *"make sure it is
all the same and we have all the recipes and data in one place!!!!"*

This means a single durable doc, not another handoff. Fold in: the area-vs-lookup rule, the two
address normalizers, the cache-read-before-pay rule, which actor answers which question, and what
each surface (comp photos, descriptions, HOA, sold price, social carousel) reads. `docs/standards/`
is where it belongs — `emails.md` §0 and `data-roots.md` are the existing roots; extend one, do not
create a third.

---

## 4. FAILURE MODES ALREADY PAID FOR — do not rediscover

1. **A sweep is not a lookup.** Asking for an area returns a sample; the house you want is usually
   not in it. Restated from the cache handoff §3.4 and re-proven twice here.
2. **TWO ADDRESS NORMALIZERS EXIST AND THEY ARE NOT INTERCHANGEABLE.**
   `listingAddressKey("14503 DOLCE VISTA RD","FORT MYERS")` -> `"14503 dolce vista rd fort myers"`
   keys the CACHE TABLE. `compPhotoKey(...)` -> `"14503DOLCEVISTARD@FORTMYERS"` keys the PHOTO
   INDEXES. Using the wrong one returns **zero rows and no error.** This is the single most likely
   way to lose another session.
3. **An empty result is byte-identical to "this house has no photos."** Every silent-zero in this
   saga wore that disguise. Any new lane must be able to say WHICH it was.
4. **The comp set is NON-DETERMINISTIC across runs.** Three consecutive builds: 33908 sold comps ->
   33967 valuations -> 33908 sold comps. A photo-coverage number measured on one build does not
   describe the next. **Fix or characterise this BEFORE quoting any coverage percentage** — it is
   arguably a worse defect than the photos, and it silently changes the evidence in a
   price-defence email.
5. **`market-comps.ts` is co-occupied.** A parallel session holds uncommitted style work in it.
   Never `git add` it wholesale; never commit their lines as yours.
6. **Enriching data changes selection** (cache handoff §3.3). If style/photos start feeding
   `isComparableHome`, re-check that the comp set survives — photos must NEVER select the set
   (the header block in `apify-comps.ts` explains why: it moves the median and the claim).

---

## 5. Open checks

- `apify_comp_email_live_verify` — answered NEGATIVE (0 of 6 photos). Close it when photos land in
  an inbox, with the count.
- `apify_cached_records_unread` — partly closed (comp lane reads the cache now); the digest lane
  still does not.
- `comp_email_rules_card_conformance` — still unaudited against a built comps doc.
- `comp_email_font_scale_unverified` — closable now on the 08/04 scale-census evidence.

## 6. Test commands that must stay green

```
bun test lib/listings/apify-identity.test.ts
bun test lib/deliverable/recipes/market-comps.test.ts
bun test lib/deliverable/no-aerial.test.ts
bun scripts/email/campaign-sim.mts --only market-comps
```

The build writes to `runs/campaign-sim/<runId>/04-market-comps.html`. Count photos with
`grep -o 'Listing photo of' <file> | wc -l` — never by counting `<img>`, which also catches the
subject photo, the chart, the logo and the avatar.
