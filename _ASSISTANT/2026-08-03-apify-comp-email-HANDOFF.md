# HANDOFF — Comp email built on Apify sold-comp data (08/03/2026)

**Status: NO CODE WRITTEN. This is the brief + the proven vendor mechanics.**
Operator decree this session. Everything marked PROVEN was verified with a real run this session —
run IDs included. Do not re-derive it; do not trust a schema over these.

---

## 1. THE EMAIL THE OPERATOR ASKED FOR (verbatim shape, top to bottom)

1. **Photo of the home being sold** (the subject property — its own listing photo, never an aerial).
2. **Specs on the home** — "like things are now," i.e. reuse the existing lifecycle spec strip
   (beds / baths / sqft / $ per sqft / year built). Do not invent a new spec component.
3. **Description of the home being sold** — the real MLS remarks (see §3 for where they come from).
4. **The comps, with thumbnails** — real photos of each comp home.
5. **Positive commentary from the AI builder, in the agent's voice**, at the bottom.
6. **A "Find Out More" button** — target is the agent's site URL; for now use the realtor.com
   listing URL (`property_url`, returned on every record).

Operator also asked about a **carousel** for new listings — see §6. Separate build, not this one.

---

## 2. WHY THIS EXISTS — the gap it closes

`lib/listings/comp-photos.ts` resolves comp photos from our own nightly sweep. **Photo capture
first shipped 06/30/2026** (`7c66a774`). The 98.5% coverage figure in that file
(34,673 / 35,202) is coverage **INSIDE the sweep window only** — the file says rows outside it
"simply do not resolve." A comp set reaches back 6-12 months, so **most of a comp set predates our
collection and has no photo.** Never quote that 98.5% against a comp lookback again.

Second gap it closes, from `_RESEARCH/data-and-ingest/2026-07-02-sold-price-backfill-findings.md`:
a listing stamped `sold` with price 0 is **terminal** (`plan_off_market_checks` re-probes only
`holding` rows), so the true closing price was only ever recoverable by a **paid call per build,
forever**. 11 of 19 captured sold transitions were price-0. A date-ranged Apify pull is the bulk
repair path that research had no answer for.

---

## 3. PROVEN VENDOR MECHANICS — two actors, two steps

### Step 1 - BULK: `moving_beacon-owner1/realtor-com-property-scraper` · $0.01/result
Takes an **explicit date range**: `date_from` / `date_to` (also `past_days`, `mls_only`, `radius`,
price/bed/sqft floors). Input `locations: ["33914"]`, `listing_type: "sold" | "for_sale" | ...`,
`max_results_per_location`.

- PROVEN run `fHcQih5wLt7isk75w` - 33914, sold, 01/01/2026-02/28/2026 -> 31 items,
  `last_sold_date` 2026-02-27.
- PROVEN run `GWVs3PePdm8MXF7cY` - 33914, sold, 06/01/2025-06/30/2025 -> 25 items,
  `last_sold_date` 2025-06-30. **14 months back.** e.g. 409 SW 44th St, Cape Coral - sold
  $227,500, 3bd / 2ba, 1,320 sqft, with photo.
- PROVEN run `tVbweWayE2veQ1DE0` - 33914, **for_sale**, 5 items.

**Fields returned:** `sold_price`, `last_sold_date`, `list_price`, `list_date`, `days_on_mls`,
`beds`, `full_baths` **and** `half_baths` (separate), `sqft`, `year_built`, `lot_sqft`,
`price_per_sqft`, `county`, `fips_code`, `zip_code`, lat/long, `hoa_fee`, `tax` + `tax_history`,
`assessed_value`, `estimated_value`, `style`, `stories`, `parking_garage`, `new_construction`,
`mls` / `mls_id` / `mls_status`, `agent_name` / `agent_email` / `agent_phones`, broker + office,
`nearby_schools`, `property_url`, **`primary_photo`**, **`alt_photos` (FULL GALLERY)**.

**Gallery is real:** 50 photos on 4627 SW 2nd Ave, 31 on 2619 SW 5th Ave. `alt_photos` arrives as a
**comma-space-joined STRING**, not an array - split it.

### The description split - THIS IS THE TRAP
- **ACTIVE / for-sale listings: `text` IS POPULATED in the bulk call.** No second step, no extra
  cost. PROVEN: 2601 SW 37th Ter (FOR_SALE, $385,000) returned ~1,800 chars of real remarks;
  4116 SW 6th Ave (PENDING, $189,000) likewise.
- **SOLD listings: `text` is `<NA>` in the bulk call.** Needs step 2.

### Step 2 - DETAIL (sold descriptions only): `one-api/realtor-property-scraper` · $0.007/result
Input `property_inputs: ["<realtor.com detail URL>"]` (the `property_url` from step 1).
- PROVEN run `y6PbRIwA5FJvbOUfP` -> 92,784-byte `Raw` field whose **`details.text` is the
  3,000-char full MLS description on an ALREADY-SOLD home** ("<< MULTIPLE OFFERS >> Some waterfront
  homes impress..."). Description **survives the sale.**
- `Raw` also holds `property_history[]` with per-event photos, `street_view_url`, schools, tax
  assessments, estimates.
- **`details.text` is NOT a first-class column - you must parse it out of `Raw`.**

**Cost shape for this email:** the subject home + ~4 comps = 5 bulk records ($0.05) + description
fetches only where needed. Do NOT pull descriptions for every comp - the operator's layout only
calls for the SUBJECT home's description. Comps need thumbnail + price + specs, nothing more.

---

## 4. WHAT FAILED - do not re-propose without re-testing
- `scrapeworks/realtor-property-scraper` - **FAILED 2/2** (exit 1, 0 items, <6s), despite the
  best-looking schema. This was my first recommendation and it was wrong.
- `grimnir/real-estate-aggregator` - SUCCEEDED with **0 items**.
- `parseforge/realtor-com-scraper` - output schema is `{error, scrapedAt}`; recent runs all error.
- `themineworks/zillow-recently-sold` - works ($0.00084/rec) but **newest-first only**; it ignored
  a 180-day request and returned homes sold within ~3 days. **One image, no gallery, no
  description, no county.** Not suitable for a comp backfill.

**2 of 5 store actors tested were junk.** This is the fragile-source class the 08/02 greenfield
decree named. Failed items are never billed - that is the mitigation, not a guarantee it won't
break. **Any consumer must treat an empty run as normal, not as an error.**

---

## 5. RULES THE BUILD MUST OBEY (repo, not vendor)
- **READ `docs/standards/emails.md` §0 "BEFORE YOU CODE A RECIPE" IN FULL FIRST.** ~200-word copy
  target (operator decree 08/03/2026), 5-part skeleton, ONE CTA, type scale + 8px grid + 600px
  canvas, **102 KB render ceiling**, Outlook + dark-mode constraints, CAN-SPAM.
- **NO AERIAL VIEWS, EVER.** A property visual is the listing's own photo or nothing
  (`8c66854a`, operator decree). `lib/listings/comp-photos.ts` is the existing root for comp
  photos - extend it, do not write a second photo resolver.
- **Photos are rdcpix** - the SAME CDN our existing SteadyAPI photos use. No new host, no new brand
  surface. Rot falsified at ~5 months: the 02/27/2026 sale's `primary_photo` returned HTTP 200
  image/webp 21,164 B and its full-size `.jpg` HTTP 200 image/jpeg 56,334 B on 08/03/2026
  (relevant to open check `rdcpix_rot_head_reprobe`).
- **The AI writes prose only, never a number** - deterministic math, narrative prose. The bottom
  commentary is synthesis in the agent's voice; every figure in it must trace to a real field.
  Agent voice goes through the existing voice guard (`lib/email/voice-guard.ts`), NOT the personal
  `ricky-voice` skill.
- **Virtual-staging disclosure travels with the copy.** One live record ended with "Some photos
  have been virtually staged and enhanced using AI." If we republish remarks, that sentence rides
  along - do not strip it.
- **Data lands in our tables with the source stamped** (operator strategy: fetch on demand, keep it
  in house, coverage compounds). New root goes in `docs/standards/data-roots.md` in the SAME pass -
  a new root was built and left out of the catalog three times already (scratchpad 0ae).
- RULE 3.5: `superpowers:brainstorming` + `node scripts/new-build.mjs <slug> "<label>"` before code,
  with a failure-modes section. Then TDD.

## 6. CAROUSEL - separate question, answered separately
Operator asked for a carousel picture email for NEW listings. No carousel exists anywhere in
`lib/email/` or `lib/deliverable/`; email clients run no JavaScript and the CSS-only version breaks
in Outlook and Gmail; the 102 KB ceiling bites on a multi-photo block. The already-specced shape is
the grid - `docs/superpowers/specs/2026-08-03-listings-digest-grid-design.md` (4-6 real thumbnails
per category, `MIN_CARDS = 4`, no-duplicate guarantee across categories). An animated GIF cycling
3-4 photos is the only true-motion option that renders broadly; size it against 102 KB before
promising it. **Full repo carousel sweep owed - see §7.**

## 7. OPEN LEDGER
- OPEN: `apify_sold_comp_backfill_wire` - wire the 2-step lane.
- CLOSED w/ evidence: `apify_sold_comp_lookback_depth`, `apify_sold_property_description_unproven`.
- Full research: `_RESEARCH/competitor-and-strategy/2026-08-03-apify-actor-fit-assessment.md`
  (ADDENDUM 08/03/2026), indexed in `_RESEARCH/INDEX.md`.
- Total Apify spend proving all of the above: **~$0.90.**

## 8. CAROUSEL SWEEP — RUN 08/03/2026, §6's "owed" item is now DONE
Tree-wide grep (`carousel|slider|swipe|lightbox`) over `lib/ components/ app/ docs/`:
- **EMAIL: it does not exist, and the one hit proves it deliberately.**
  `lib/email/doc/schema.test.ts:247` uses `{ type: "carousel", props: {} }` as the **invalid-block
  negative fixture** — carousel is literally our example of a block type the email schema REJECTS.
- **SOCIAL: carousel is real and already MEASURED, but not authored.** `lib/social-pulse/types.ts`
  (vendor contract: mediaType 1 image · 2 video/clips · 8 carousel), `digest.ts` buckets performance
  by format, `lib/social/persist-schedule.ts` + `types.ts` carry `media_kind: "image" | "carousel"`.
  We track how carousels perform; we cannot build one.
- **ALREADY RESEARCHED + QUEUED, NEVER BUILT:** `docs/handoff/2026-07-11-socials-design-elevation-
  brief.md` — "Carousels have the highest engagement rate of any Instagram post type" (Buffer,
  cited) and calls for a repeatable slide shell (cover + N slides, one visual system) because
  `tip-stack` crams the whole list onto one card. `2026-07-11-socials-round2-direction.md` still
  lists the carousel shell as queued.
- **WEB UI only:** `app/_design/04-context-decision-tree.md` + `QUICK-REFERENCE.md` point at
  animejs `createDraggable()` infinite/snap carousel patterns — site surfaces, not email.

**Verdict: "carousel" means two different builds.** In EMAIL it is not buildable as a carousel —
ship the specced grid (4-6 thumbnails) or a size-checked GIF. On SOCIAL it is a real, already-
justified, still-unbuilt slide shell with our own cited research behind it. Do not conflate them.
