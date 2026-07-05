# Mirror email hero photos into our storage at build time

**Date:** 2026-07-05
**Check:** `email_hero_mirror_to_storage` (opened 07/05/2026, see `docs/standards/email-images.md`)
**Evidence:** SESSION_LOG 2026-07-05 research entry (crawl4ai + lake HEAD probe, RULE 0.4).

## Problem

Email/social hero photos hotlink third-party CDNs (`ap.rdcpix.com` via og:image and listing
scrape; SteadyAPI/lake photo_urls). If the source dies after a closing, a scheduled occurrence
re-send ships red X's. Empirically (07/05/2026): 12/12 sold/withdrawn lake photo URLs still
serve `200 image/webp` days after close — rot is INFERRED at months scale (no published rdcpix
retention policy; falsifier = re-run the HEAD probe at 60–90 days of sold history). We mirror
NOW because the durable fix is cheap and the failure lands in the operator's flagship surface
(scheduled re-sends).

The existing mirror root (`lib/media/listing-photo.ts` `deriveListingPhoto`: fetch → watermark
crop → JPEG → upsert `email-media/listing-photos/`) already covers `build-doc.ts` and
social-calendar `build-week.ts` top-5 ranked listings. The leaks:

1. `resolveHeroPhoto` (`lib/email/build-doc.ts`) — og:image heroes land in the doc VERBATIM
   (newsletter path line ~432 + author path line ~635).
2. Listing-flyer branch — `facts.photos[0]` from the scraped listing page lands verbatim.
3. `lib/social/design/author.ts` — calls `loadListingContext` WITHOUT `derivePhoto`; publish
   engine socials ship raw rdcpix.
4. Static `public/showcase/listing-to-close/live/*.html` hardcode rdcpix (live pages).

## Goal

Every hero image URL a build writes into a doc/artifact points at OUR public `email-media`
bucket (Supabase CDN-cached, 50 MB/file floor — vendor docs fetched 07/05/2026). Degradation
stays the existing convention: mirror failure keeps the original remote URL — degraded, never
blocked. Occurrence safety falls out by construction: the FIRST build saves our durable URL
into the doc, so even when a later refresh can't re-resolve the source, the saved block still
references our copy.

## What we're building

1. **NEW `lib/media/hero-photo.ts` — `mirrorHeroPhoto(url, deps?)`** (one root, DI like
   `deriveListingPhoto`): fetch the URL verbatim → require `image/*` content-type + ≤10 MB →
   upsert `email-media/hero-photos/{sha256(url) prefix}.{ext}` via `hostEmailMedia` → public
   URL; null on ANY failure. **No crop** — og:image provenance is unknown (an agent's own site
   hero must never be cropped); the watermark crop stays scoped to listing-feed photos
   (`deriveListingPhoto`, operator policy 07/02 — uncrop revisited "when we get a person").
   Keyed by source-URL hash → idempotent upsert; occurrence rebuilds refresh the same object.
2. **`lib/email/build-doc.ts`:** `resolveHeroPhoto` returns the mirrored URL (fallback:
   original) — covers newsletter + author paths in one seam. Flyer branch mirrors
   `facts.photos[0]` before `buildListingFlyer` (the flyer builder stays pure).
3. **`lib/social/design/author.ts`:** thread `{ derivePhoto: deriveListingPhoto }` into its
   `loadListingContext` call (same wiring as build-doc/build-week; crop applies — listing photos).
4. **One-off:** `scripts/email/tmp-mirror-showcase-heroes.mts` — mirror every rdcpix URL in
   `public/showcase/listing-to-close/live/*.html` to `hero-photos/` and rewrite the files.

Out of scope: raising `PHOTO_ENRICH_LIMIT` (social features ONE listing — the 5-cap covers all
photo-rendering surfaces); `download_artifact_inline_images` (parked, viable — WebKit data-URL
limit 2 GB, MDN 07/05/2026); relitigating the crop.

## Tests

- `lib/media/hero-photo.test.ts` — DI mocks: success → hashed key + ext from content-type;
  non-image / oversize / fetch-fail / upload-throw → null (caller keeps original).
- Existing suites stay green; `bunx next build` is the compile bar.
