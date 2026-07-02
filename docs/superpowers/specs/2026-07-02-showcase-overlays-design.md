# Deliverable showcase overlays — 3-company example carousels

> **Recommended model:** ⚡ Sonnet — keywords: architecture

**Date:** 2026-07-02
**Check:** `showcase_overlays_live_verify`
**Status:** spec approved in session (operator: Ricky), ready for implementation plan

## Problem

The AI + Briefcase pill panel's "SEE A LIVE EXAMPLE" section is five text-only link
tiles ("SWFL Housing One-Pager", "ZIP Market Email (33901)", …) pointing at `/p/example-*`
pages. Operator verdict on the current state: "no one should be seeing this." It shows
nothing of what the product actually builds, and the `/p/` renders it links to are not
the quality bar. Sites that convert in this category (Flodesk, Luxury Presence) sell on
the artifact itself — full renders of beautiful, real deliverables — and route every
proof block into one signup CTA.

## Goal

Replace the text list with three step-through showcases of **professional deliverables
we build fresh for this purpose**, each under a distinct fictional company with its own
palette and style, each ending on a tier/CTA slide that captures signup via the existing
OTP login modal. Component is overlay-based and reusable, so the same showcases can
mount on the homepage later (near-fullscreen popup, click-off returns to the page).

## Research evidence (crawl4ai, 2026-07-02 — details in SESSION_LOG)

- **NNGroup carousel usability:** auto-rotating carousels get scrolled past; animated
  ad-like content is looked at only 27% of the time. Use click-through only, ≤~5-7
  frames, named step indicators inside the frame, no auto-advance, no auto-forward on
  mobile. (nngroup.com/articles/designing-effective-carousels)
- **Flodesk homepage:** sells on the artifact — hero marquee of real email renders, one
  CTA ("Try it free") repeated after every proof section. (flodesk.com)
- **Luxury Presence homepage:** proof-first — outcome stats up top, artifact imagery,
  case studies, single "Get started". (luxurypresence.com)
- **Email practice (luxurypresence.com/blogs/real-estate-email-marketing):**
  market-update newsletters + new-listing announcements are the top-performing
  real-estate email types; single column, mobile-first, exactly ONE primary CTA ("give
  readers three things to click and they often click nothing"); subject ≤40 chars;
  segmented sends lift CTR double digits vs batch-and-blast; email returns $36 per $1
  (Litmus 2025, cited there).
- **HubSpot email stats:** ROI 10:1–36:1 typical; 93% of marketers say personalization
  improves results. (blog.hubspot.com/marketing/email-marketing-stats)
- **Sprout Social 2026 trends:** short-form video central; serialized recurring content
  keeps audiences returning (57% want original series); authenticity over polish;
  social search rising. (sproutsocial.com/insights/social-media-trends)
- **The Close (real-estate social):** data-hook posts, local+broad hashtag mix
  (#CapeCoral + #JustListed), story formats, consistent cadence, gated market reports
  as lead magnets. (theclose.com/real-estate-social-media-marketing)
- 404'd during research (no findings used): litmus.com/blog/email-design-trends,
  navattic.com blog, unbounce.com popup guide.

## What we're building

### A. Three showcases (content)

Every artifact is purpose-built demonstration HTML in the latitude26 mold: table-based
email HTML, real data only, one brand palette per company. Every number sources from
the SWFL lake, a named web source, or is omitted — never invented. As-of date stated
once per artifact (MM/DD/YYYY). Each showcase carries the disclosure: "Demonstration
campaign — the brand and agent are fictional; the property, comp, and market data are
real." The disclosure is a feature (the no-invention moat on display), not fine print.

**Showcase 1 — "Listing → Close: The Auto Email Plan"** · Latitude 26 Estates,
Naples ultra-luxury (dark teal `#0A2A2C` / gold `#B98F45`, Georgia serif).
EXISTING artifacts from `c:\Users\ethan\Downloads\latitude26-campaign`, copied into the
repo unchanged. 6 slides: Coming Soon (scarcity teaser) → New Listing (ZHVI trend,
buyer's-window read) → Market Comps (6 live comps, price bars, $/sqft argued straight)
→ Under Contract (90-day momentum vs 238/279-day rivals) → Sold (set against the real
Naples estate-sale wave) → tier/CTA slide.

**Showcase 2 — "Launch Weekend: Listing + Social Blitz"** · NEW fictional brand
(working name "Cast & Coast Realty"), Cape Coral canal-front mid-market, bright coastal
palette + sans-serif — visually opposite Showcase 1. Rebuild of the agent-intro +
social-pack concepts under the new brand, anchored to a DIFFERENT real house: a Cape
Coral canal home in the $500–700k band pulled from
`data_lake.active_listings_residential` (1,564 active Cape Coral listings in the
$350–900k band as of the 07/01/2026 scrape — plenty of anchors). ~4 slides: agent
brand intro (ZIP-median chart in the new palette) → social pack in 4 formats
(square / landscape / portrait / story) upgraded to current practice: market-data hook
in the first line, local+broad hashtag mix — captions name the practice → tier/CTA.

**Showcase 3 — "The Market Pulse: Set It Once"** · NEW fictional brand (working name
"Meridian South Advisory"), Fort Myers, data-forward editorial style (off-white/ink/one
accent) — third distinct look. Shows the self-updating deliverable itself. 5 slides:
(1) the ask typed in plain English — "every first Monday, send my farm the Fort Myers
market pulse"; (2) the built newsletter — market-update email built to the researched
2026 standards (single column, one CTA, ≤40-char subject line); (3) the matching social
snippet set; (4) proof-it-updates — two REAL monthly vintages side by side (May vs June
2026 from ZHVI / market-heat history; both months' numbers real, nothing projected)
annotating exactly what refreshes each month; (5) tier/CTA.

Caption structure per slide (two lines): what's happening in the campaign · how the AI
handled it ("picked six live comps in 34108 and computed the $/sqft in code — no
adjectives"). Research receipts appear in captions where a slide embodies a practice,
with the named source in collapsed/footnote style. No system nouns, no internal IDs.

### B. UI / interaction

- Panel: "SEE A LIVE EXAMPLE" text list in `BriefcasePanel` replaced by three visual
  thumbnail cards (preview image, title, one-line hook, step count).
- `ShowcaseOverlay`: near-fullscreen dialog (`h-dvh`, dark scrim), Esc/click-off
  dismisses back to wherever the user was. Per slide: the artifact screenshot
  (scrollable when taller than viewport), the two caption lines, "see the real email"
  link opening the actual HTML in a new tab, and a step rail — "Step 3 of 6 · Market
  Comps" with named clickable steps. Arrows + swipe + keyboard. NO auto-advance, ever.
- A slim "Start building free" button persists on every slide (Flodesk pattern);
  final slide is the full tier layout.
- Tier slide: what each tier GETS, no dollar figure until operator supplies one.
  Free — unlimited builds, every number cited to a real source, email + PDF, watermark
  after the first month. Pro — clean branded sends, your logo, scheduling.
  "Start building free" opens the existing OTP `LoginModal` over the overlay.
- The "Use me in your own Claude — free" MCP exit stays in the panel, untouched.

### C. Architecture

- `lib/showcase/registry.ts` — typed, client-safe registry (like `example-cards.ts`):
  3 showcases; per slide { image asset path, title, caption lines, optional liveHref }.
  Single source of truth.
- `components/showcase/ShowcaseCard.tsx` + `ShowcaseOverlay.tsx` — mounted in
  `BriefcasePanel` now; homepage can mount the same pair later. Open state syncs to a
  `?showcase=<id>` URL param so homepage/ads can deep-link into one.
- Assets: artifact HTML at `public/showcase/<id>/live/…` (served as-is for view-live
  links); screenshots at `public/showcase/<id>/step-N.webp`, captured at 2x so 600px
  email tables render crisp. Screenshots freeze the external listing photos (rdcpix
  URLs will rot; frozen pixels won't).
- `scripts/capture-showcase.mjs` — Playwright screenshot script run LOCALLY when source
  HTML changes; outputs committed. No runtime or build-time browser dependency.
- `EXAMPLE_CARDS` panel display decouples from `EXAMPLE_SCENARIOS`: the `/p/example-*`
  cron rebuilds keep running unchanged; only the panel's display layer changes.
  `examples.test.ts` cross-check updated accordingly.

### D. Error handling

- Registry asset paths are verified by test (below) so a missing screenshot is a red
  test, not a broken slide in prod.
- Overlay is pure client UI over static assets — no fetches, no loading states beyond
  native image loading; `loading="lazy"` on non-first slides.
- If JS fails, the thumbnail cards degrade to plain links to the live HTML.

### E. Testing / gates

- `lib/showcase/registry.test.ts`: every asset path exists on disk; every showcase ends
  on the tier slide; captions non-empty; slide counts within 3–7 + tier.
- `panel-logic.test.ts` and `example-cards.test.ts` updated, stay green.
- Full `bun test` + `bunx next build` before push (never bare `npx tsc`).
- Copy lint by hand: no system nouns, as-of dates MM/DD/YYYY stated once, no invented
  numbers — every figure in the new artifacts traced to a lake query or named source,
  queries recorded in the plan doc as they're run.
- Live verify (operator): `showcase_overlays_live_verify` — open the panel on prod,
  click through all three showcases, CTA opens login modal, view-live links render.

## Out of scope (registered follow-ups)

- **Watch-it-build GIF/video slide** — record the email lab building one of these in
  real time (claude-in-chrome GIF capture or screen video); its own check when picked
  up. Kept off the critical path.
- **/pricing page** — tier slide links to it when it exists; not in this build.
- **Homepage mount** — the overlay is built reusable + deep-linkable for it, but the
  homepage placement itself is a separate decision/build.
- Dollar pricing on the tier slide — waits on operator-supplied figures.

## Working brand names (operator may override before artifacts are authored)

- Showcase 2: "Cast & Coast Realty" (Cape Coral)
- Showcase 3: "Meridian South Advisory" (Fort Myers)
