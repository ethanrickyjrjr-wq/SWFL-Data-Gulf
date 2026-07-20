# Lane 15 — Social Pack & The Social Cut recipes (social-image / photo binding)

Question: does the same subject/photo-binding bug reach the social-image path, or is
that path independently broken/fine?

## What the two recipes actually are
`lib/deliverable/recipes.ts:359-384`
- `social-pack` and `social-cut`: `subject: "area"`, `chart: "none"`, `target: "social"`,
  `skeleton: null`, `prose: null`.
- They are AREA/ZIP recipes by design — there is no "address" subject in either. A user
  cannot ask them to feature a specific house; their `[[blank]]` is "your city or ZIP".
- `RECIPE_KEYS` header comment (lines 68-69): "Social — a different renderer. Confirm which
  social system is live before building; do not assume the email path applies."

## They are deliberately NOT wired into the recipe dispatch
`lib/deliverable/recipes/index.ts:93-103`
- `RECIPE_BUILDERS` has NO entry for social-pack/social-cut. `builderFor("social-pack")`
  returns null → falls through to the generic author.
- The comment there is the map: recon (07/13/2026) found TWO live social systems, NEITHER
  touches the recipe table:
  1. "Make this →" on a social slide → Konva composer (`authorSocialPost → SocialDesign`)
  2. "New Listing Socials" campaign → `buildWeek` (→ EmailDoc cards)
- Also flagged there: "the social path has NO no-invention gate at all" (tracked
  `social_path_has_no_no_invention_gate`). Out of my lane but noted.

## The email-lab AI route never dispatches to social
`app/api/email-lab/ai/route.ts:116-197`
- The block-canvas branch calls `authorDoc` (build) or `buildContentDoc` (fill). BOTH return
  an `EmailDoc`. There is NO branch on `recipe.target === "social"`.
- So if social-pack/social-cut is picked in the MAIN build panel, it produces a generic
  EmailDoc email (builderFor → null → generic author). It never reaches a social renderer.
- The social systems are reached from a DIFFERENT surface: `POST /api/email-lab/social/generate`
  (`app/api/email-lab/social/generate/route.ts`), which takes a free-text `prompt` + `scope`,
  NOT a recipeKey. `author:true` → `authorSocialPost(scope, prompt, ...)`.

## System 1 — render-social-image.ts (the stat-card rasterizer): NO photo binding exists
`lib/social/render-social-image.ts`
- `SocialModel` = { headline, ONE `stat`, optional `chart`, watermark }. Lines 62-76.
- There is NO property-photo / hero-image field ANYWHERE in the model or `composeCardSvg`.
  The card is a full-bleed brand-color background + headline text + one big stat number +
  optional chart + burned watermark. Logo is the only raster (`fetchLogo`, graceful).
- => The email bug (a listing hero photo failing to bind) CANNOT reach this path — it has
  no photo binding to break. It renders AREA stat cards; its subject is intrinsically a
  ZIP/area, never a house. This path is FINE w.r.t. the photo bug.
- Fed by the publish/schedule engine (`compose.ts` builds `post.media` from `content.image`;
  `build-content.ts` produces caption/hashtags, image "injected by build 02"). Scope = area.

## System 2 — authorSocialPost (Konva composer): HAS a photo binding, INDEPENDENTLY broken
`lib/social/design/author.ts:196-298`
- It DOES bind a real listing photo:
  - `loadListingContext(scope, today, { derivePhoto })` (line 222)
  - `featured = pickFeatured(listingCtx.ranked)` (line 224)
  - offers `listing-feature` template only if `hasListing: !!featured` (line 229)
  - `if (template.id === "listing-feature" && featured) design = attachListingPhoto(design, featured)`
    (lines 276-278)
- `attachListingPhoto` (author.ts:163-176) sets `listing.photoUrl` (or aerial fallback) into
  the template element `el.type === "image" && el.id === "image"`.
- Template confirmed to HAVE that element: `templates.ts:302` id "listing-feature",
  `templates.ts:317` `{ id: "image", type: "image", ... src: "" }`. So the photo DOES land.

### The break: the featured listing is NEVER the user's requested address
`lib/listings/select.ts`
- `scopeCity(scope)` (lines 54-65) reads ONLY `scope.kind` (county/zip) and `scope.value`.
  It NEVER reads `scope.address`. Anything not county/zip → `DEFAULT_CITY = "Cape Coral"`.
  A zip resolves to its county's ANCHOR city (Lee → "Cape Coral").
- `loadListingContext` (lines 391-405): `city = scopeCity(scope)`, then
  `fetchLakeListings(city)` = `data_lake.listing_dom` filtered `.eq("city", city)` — ALL
  active for-sale listings in the ANCHOR city (lines 349-368).
- `pickFeatured` (lines 100-103) = highest-RANKED listing with coords; `rankListings`
  (84-98) = priced + coords + residential, then NEWEST-listed. => the newest listing in the
  anchor city.
- NET: there is NO subject-address resolution in this path at all. For the exact test
  address (14189 Mindello Dr, Fort Myers, 33905 → Lee → anchor "Cape Coral"), the query is
  `.eq("city","Cape Coral")` — the Fort Myers listing is not even IN the result set. The
  composer attaches a photo of some random newest Cape Coral home, never the requested house.

### Contrast with the email address path (why this is INDEPENDENT, not the same code)
- `recipes/index.ts:9-13` dispatcher does `resolveSubject` for an "address" spine (vendor
  record, bath count, hero photo mirrored). The social author path does NOT call resolveSubject
  — it calls `loadListingContext` directly with an area/city scope. It bypasses the subject
  resolver entirely, so it can never feature a named address even when one is supplied.

## CORRECTION (post-advisor) — the composer never sends an address; this is v1-by-design
Before calling authorSocialPost "broken" I had to verify the social path ever RECEIVES an
address subject. It does not, by design:
- `useSocialComposer` arg type (`useSocialComposer.ts:20`): `scope?: { kind?: string; value?: string }`
  — NO `address` field. `author()` (line 199) posts that scope verbatim to /social/generate.
- The email-lab shell scope DOES carry `address?` (`EmailLabGridShell.tsx:224`) and passes the
  same object to the hook (line 420), so at RUNTIME an address string could ride through — BUT
  `scopeCity`/`loadListingContext` ignore `scope.address` entirely, so it is discarded either way.
- The v1 area-scoping is DOCUMENTED intent, not a defect: `select.ts:30-33` — "A zip scope
  broadens to the county anchor (v1): every listing is still labeled by its TRUE address/city,
  so citations stay truthful." The resulting post is INTERNALLY CONSISTENT: real photo + real
  caption + truthful "SWFL Data Gulf" citation, all about the SAME real anchor-city listing.
- `buildWeek` (System 2b, `lib/email/social-calendar/build-week.ts:284-315`) is the same design:
  `loadListingContext(scope,...)` → anchor-city listings, features top-ranked (or a campaign-
  pinned `listingId`), never resolves `scope.address`. Its subject is also area/anchor-city.

That is categorically different from the reported email bug (generic ZIP email, NO photo,
mismatched ZIP, cut-off sentences, garbled chart). The social path SHIPS a coherent real post
with a real photo — just not guaranteed to be the specific named house.

## Verdict (final)
- render-social-image.ts stat-card path: FINE. No property-photo binding exists — nothing to
  break. Area/ZIP subject only; renders a headline + one stat + watermark.
- authorSocialPost / buildWeek listing-photo binding: WORKS AS DESIGNED for area scope. It
  features (and photographs) the anchor-city's top-ranked live listing, coherently.
- The reported subject/photo-binding bug DOES NOT REACH the social path. The social recipes
  (social-pack/social-cut) are `subject:"area"` + unwired in RECIPE_BUILDERS, and the composer
  only ever carries an area scope — so a named-address subject never enters this path.
- SEPARATE, MILDER, DOCUMENTED v1 LIMITATION (not the reported defect): the social path has no
  per-address subject resolver, so it cannot feature a specific requested house even if one were
  handed to it (`scopeCity` at `select.ts:54-65` reads only kind/value). If product later wants
  "social post about THIS address," that is the seam to build — but today it is by-design, and
  it produces a truthful post, not garbage. Do NOT over-escalate it as "the same bug."
