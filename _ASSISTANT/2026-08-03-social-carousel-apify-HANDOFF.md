# HANDOFF (for Opus) — Social photo carousel from Apify listing photos, proven on Bluesky

**Status: NO CODE WRITTEN. Brief + verified wiring. 08/03/2026.**
Operator decree, verbatim: *"write up a handoff for opus to build us social carousel using apify
then, make one with photo carousel- home address, specs below on card and linked to realtor.com
site so people can get to it, but make sure carousel works and clicking it doesn't just bring you
to site. bottom of card invisible link to realtor listing. write a post about it and push to our
bluesky feed so i can see it work."*

**TWO OPERATOR DIRECTION CHANGES, SAME MESSAGE — do not lose these:**
1. **EMAIL comp layout is CLICK-THROUGH per card, NOT a grid.** *"i think email should still be
   click thru....not a grid, if possible. save that for a followup."* The grid spec
   (`docs/superpowers/specs/2026-08-03-listings-digest-grid-design.md`) is now the FOLLOWUP, not
   the near build. The comp email handoff
   (`_ASSISTANT/2026-08-03-apify-comp-email-HANDOFF.md`) must be read with this override.
2. **Carousel lives on SOCIAL, not email.** Settled by the 08/03 repo sweep: our email schema test
   uses a carousel block as the INVALID fixture — email rejects it by design.

---

## 1. THE DELIVERABLE
One real Bluesky post, live on our feed, that is a working multi-photo carousel of a real SWFL
listing. Each card: **the home's photos**, with **address and specs rendered on the card**, and the
realtor.com listing reachable from the post. Operator wants to *see it work* — the acceptance test
is the post in the feed, not a green test.

## 2. THE WIRING THAT ALREADY EXISTS (verified 08/03/2026, read the file — don't re-derive)
`lib/social/channels/bluesky.ts` — the posting lane is BUILT and tested (`bluesky.test.ts`):
- `postToBluesky(input)` supports **`images?: BlueskyImage[]` — multi-image post, lexicon cap 4**
  (`images` takes precedence over the single-image `image`). Over 4 returns a hard error.
- Upload contract, documented in the file header and NOT to be "improved": `POST
  /xrpc/com.atproto.repo.uploadBlob` with **RAW image bytes (Uint8Array)**, `Content-Type: <mime>`,
  Bearer accessJwt — **no multipart, no base64**. The returned `blob` is embedded **VERBATIM** in
  the post record, never reshaped.
- Embed is built as `$type: "app.bsky.embed.images"`, one entry per image, in post order.
- `detectLinkFacets(text)` exists — link facets are derived from the post TEXT.

**THIS IS THE CRUX OF THE OPERATOR'S ASK.** On Bluesky a post carries **ONE embed**. If you attach
`app.bsky.embed.images` you CANNOT also attach an external link-card embed. That is exactly what he
wants: with an images embed, **tapping a photo opens the image viewer — it does NOT navigate to the
site.** The carousel behaves like a carousel. The realtor.com link therefore rides in the post
**text** as a detected link facet — which is his "bottom of card invisible link to realtor
listing." Verify both behaviors on the live post: swipe between photos, and confirm a tap on the
image does not leave the app.

## 3. THE PHOTOS — where they come from (PROVEN this session, see the comp-email handoff §3)
`moving_beacon-owner1/realtor-com-property-scraper`, $0.01/result, returns **`alt_photos` — a FULL
GALLERY** (50 photos on 4627 SW 2nd Ave, 31 on 2619 SW 5th Ave) plus `primary_photo`.
- **`alt_photos` is a comma-space-joined STRING, not an array — split it.**
- For an ACTIVE listing the bulk call also returns `text` (real MLS remarks) — free caption source.
  PROVEN: 2601 SW 37th Ter, Cape Coral, FOR_SALE $385,000, ~1,800 chars of remarks.
- `property_url` is the realtor.com listing link for the post text.
- Specs for the card come off the same record: `beds`, `full_baths` + `half_baths` (separate),
  `sqft`, `year_built`, `price_per_sqft`, `list_price`.
- Photos are **rdcpix** — the same CDN our existing photos use. Not a new host.
- Pick **4 photos max** (lexicon cap). Choose deliberately: exterior first, then interior variety —
  don't just take the first four.

## 4. THE CARD — render, don't hotlink
Photos must be **composited into cards** (address + specs burned onto the image), then uploaded as
blobs. Do not post bare CDN URLs.
- Existing root: `renderSocialImage` (social render pipeline). **Open check
  `social_render_engine_off_system` says it runs a SECOND type scale off a different base** — read
  that before styling, or the cards will not match the system.
- Related open check `social_media_storage_upload` (PNG -> Supabase Storage, `social_posts.media_url`).
  For Bluesky you need **raw bytes for uploadBlob**, so a public URL is not required for the post
  itself — don't let that unfinished lane block this.
- **NO AERIAL VIEWS** (operator decree `8c66854a`) — the listing's own photos or nothing.
- Keep the virtual-staging disclosure if remarks are reused: one live record ended with "Some photos
  have been virtually staged and enhanced using AI."

## 5. FAILURE MODES TO NAME BEFORE BUILDING (RULE 3.5 — design gets no approval without this)
- **>4 images** -> hard error from `postToBluesky`. Guard: cap at 4 before calling.
- **Tapping a photo navigates away** -> means an external embed got attached alongside/instead of
  images. Guard: assert the record's embed `$type` is `app.bsky.embed.images` and that no external
  embed is set.
- **Blob reshaped** -> post silently renders without images. Guard: pass the returned `blob` through
  untouched; the file header calls this out explicitly.
- **Empty Apify run** -> 2 of 5 store actors tested were junk. Guard: treat 0 items as normal, abort
  the post, never publish a card with a missing photo.
- **A spec on the card is wrong** -> deterministic math only; the model writes prose, never a number.
- **Wrong account / test post on the live feed** -> confirm the target handle before posting.

## 6. ORDER OF WORK
1. RULE 3.5: `superpowers:brainstorming` + `node scripts/new-build.mjs social-photo-carousel
   "Social photo carousel from Apify listing photos"`, failure-modes section from §5. Then TDD.
2. Pull ONE real active SWFL listing via the bulk actor (~$0.01), keep 4 photos + specs + url.
3. Composite the 4 cards; assert bytes + mime.
4. `postToBluesky` with `images: [4]` and the realtor.com URL in the text.
5. **Acceptance = the operator opens the feed and swipes.** Report the post URL back to him.
   Do not claim it works from the function's return value — verify the post in the feed
   (`feedback_checks-prod-evidence-not-dev-attestation`).

## 7. LEDGER
- Companion: `_ASSISTANT/2026-08-03-apify-comp-email-HANDOFF.md` (comp email; now CLICK-THROUGH).
- Research: `_RESEARCH/competitor-and-strategy/2026-08-03-apify-actor-fit-assessment.md` ADDENDUM.
- Already-cited prior art: `docs/handoff/2026-07-11-socials-design-elevation-brief.md` — carousels
  are the highest-engagement Instagram post type (Buffer), and a repeatable slide shell has been
  queued-but-unbuilt since 07/11/2026. This build is that shell's first real instance.
- Apify spend proving all vendor mechanics: ~$0.90.
