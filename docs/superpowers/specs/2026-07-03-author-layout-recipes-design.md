# Author recipes + layout power-up + media library

**Date:** 2026-07-03
**Check:** `author_layout_recipes_live_verify`

## Problem

The Email Lab AUTHOR engine (`lib/email/author-doc.ts`) produces correct, cited emails that
all look the same: a flat stack of cards. Compared against professional references, four hard
ceilings in the author tool cause it — the model cannot write overlay text on images, cannot
set section backgrounds, cannot control whitespace, and `multi-column` renders placeholder
junk because `applyContent` has no fill case for it. On top of that, one generic system prompt
serves every deliverable type, and images only reach the author when a single og:image
resolves — there is no media library and no way for the model to reference more than one image.

## Goal

Sonnet authors deliverables that read as designed, not templated — with every layout decision
traceable to a researched reason — across three recipe families:

1. **Prospect** (our outreach + premades): welcome / agent-intro tuned for cold-open conversion.
2. **Monthly newsletter**: recurring market digest.
3. **Editorial** (warm-audience "fancy"): letter, showcase, magazine-issue layouts for users
   emailing their own clients, where the KPI is premium feel, not cold opens.

All existing guarantees unchanged: figures id-selected from the menu, prose lint, brand applied
after assembly, CAN-SPAM footer, no invented URL/hex ever reachable by the model.

## Research findings (all fetched in-session via crawl4ai, as of 07/02/2026)

Layout rules the recipes encode, each with its source (homepage cited per provenance rule):

- **Single-column for any email with a CTA; multi-column only for variety/non-crucial content.
  Hook at the top** — mobile clients may not download the full message; shorter performs
  better; 600–800px wide. (Mailchimp Email Design Reference, templates.mailchimp.com)
- **≥50% of opens are mobile** — hierarchy must survive stacking to one column.
  (Campaign Monitor, campaignmonitor.com)
- **Inverted pyramid**: headline → supporting imagery as an aid, not a distraction → everything
  leads visually to ONE button. Named fit for welcome/onboarding. (Vero, getvero.com)
- **Welcome emails average 51% open rate** (Klaviyo 2025 benchmarks); the converting components:
  clear "what's in it for me" value prop, bite-size brand story ("not a lengthy biography"),
  social proof, expectation-setting (frequency/value) for trust, CTA allowed high in the email.
  (Klaviyo, klaviyo.com)
- **Image mechanics**: hero 600–900px, in-body 300–600px, ≤100KB/image, export 2x for retina,
  alt text always, ~60% text / 40% image so spam filters stay quiet. (Scalero, scalero.io)
- **RE newsletter content types that perform**: market update, community/events, advice/tips,
  listings; consistent schedule; one clear CTA. (Luxury Presence, luxurypresence.com)
- **Luxury = whitespace**: "exclusivity comes from what is intentionally left out"; serif
  display + clean sans body is the luxury type formula; increased letter spacing reads premium.
  (Techelix Studio, studio.techelix.co)
- **Measured layout patterns** (Chase Dimond 45-brand analysis, chasedimond.com):
  - Text-only personal letter: 35–50% open rate vs 20–25% for designed emails; best for
    relationship building.
  - Single-product/story spotlight (Apple/luxury-fashion pattern): 50–60% whitespace ratio,
    copy 2–3 sentences, image ≥600×400, CTA above and below.
  - Hero + feature cards (J.Crew pattern): lifestyle hero 600×300–400 with overlay text + CTA,
    cards ~280px, primary CTA in hero / secondary per card; 30% longer time-spent, 20–30%
    higher order value from aspirational context.
- **Typography**: max two font styles per email; web fonts require web-safe fallback stacks;
  generous line height reads "boutique". (Litmus, litmus.com)
- **Stock licensing**: Pexels API is free (200 req/hr, 20k/mo; unlimited free with attribution
  "Photo by X on Pexels"); Pexels license explicitly allows newsletter use. Unsplash forbids
  compiling its images into an in-product collection — not used. (pexels.com, unsplash.com)
- **Honest miss**: Nielsen Norman newsletter eyetracking findings are paywalled — not cited.
- **CAN-SPAM, per Shopify's FTC-sourced guide** (shopify.com, fetched 07/02/2026): the real
  requirement list is FOUR, not our stored three — accurate headers, honest subject, easy
  opt-out, AND a valid physical postal address (business address, PO box, or mailbox service)
  in every commercial email. Also: opt-outs honored within 10 business days, one click, no
  login/fee/explanation demanded; and liability cannot be outsourced — senders stay liable for
  their email vendor, which is US, so the auto-footer doing this right is a product feature.

## What we're building

### 1. Recipes — `lib/email/author-recipes.ts` (pure)

- `detectRecipe(prompt): RecipeId | null` — deterministic keyword routing:
  - agent-intro/welcome: "welcome", "introduc*", "new agent", "meet"
  - monthly-newsletter: "monthly", "newsletter", "digest"
  - editorial family: "fancy", "elegant", "editorial", "magazine", "luxury", "letter"
    (sub-recipe: letter / showcase / magazine-issue by secondary keywords; default magazine-issue)
  - no match → null → today's generic prompt, unchanged.
- Each recipe is a prose RECIPE section appended to `authorSystem`: ordered target structure,
  tone, and short reason tags per section (evidence above, compressed). Advisory — the model
  may deviate; nothing enforced (RULE C2: no new gate).
- Recipe text contains zero digits, so the no-invention prose lint is untouched. Test-enforced.

Recipe structures (from evidence):

- **Agent-intro/welcome** (prospect): single column, inverted pyramid, exactly one CTA. Hero
  image with overlay value prop up top → bite-size agent card → what-to-expect (frequency/value)
  → track-record stats ONLY when user-stated figures exist in the menu → CTA. Short.
- **Monthly newsletter**: masthead header with month → lead story single-column (market-update
  hero + stats as the hook) → variety sections after the lead, multi-column allowed: events/tips
  as `list`, featured listing → one primary CTA, section links secondary. Images ≤ ~40%.
- **Editorial-letter**: text-only personal letter from the agent; generous padding; serif
  display; sign-off via agent card; zero or one image; single text link, no buttons.
- **Editorial-showcase**: one story/property. 50–60% whitespace (airy padding), hero ≥600×400
  with overlay, 2–3 sentences of copy, CTA above and below, nothing else.
- **Editorial-magazine**: full-bleed hero with overlay title (masthead feel) → feature cards in
  multi-column → dark/accent band separating sections → primary CTA in hero, secondary links
  per card.

### 2. Author layout power-up (additive to `AUTHOR_TOOL` + `AuthoredBlockSchema` + assembly)

All semantic — the model never writes a URL, hex, or pixel value:

- **`overlay_title` (≤80) / `overlay_body` (≤200)** on image blocks → written through to the
  renderer's existing `overlayTitle`/`overlayBody`. Overlay colors stay user-owned defaults.
- **`band: "light" | "dark" | "accent"`** (optional, any block) → engine resolves from the brand
  palette (`surfaceColor` / `surfaceDarkColor` else `primaryColor` / `accentColor`) and writes
  `sectionBg`. A luminance check on the resolved color sets an `onDark` render flag; hero,
  signal, text, and multi-column swap to light text when set — dark-on-dark unreachable.
- **`pad: "airy" | "normal" | "tight"`** (optional) → maps to existing `paddingY` lg/md/sm.
  Whitespace is the luxury signal; the model requests breathing room, the engine owns pixels.
- **Authorable `multi-column`**: `columns: [{heading, body, link_label?, asset?}]` (max 3) joins
  the authored schema; `applyContent` gains a multi-column case. Placeholder-junk bug dies.
- **New `list` block type** (types → schema → renderer → `DEFAULT_BLOCK_PROPS` → capabilities
  routing "both" → grid compile): optional title + up to 8 items `{lead?, text}` (lead e.g.
  "JUL 12 ·"), rendered as email-safe table rows. Authorable via `items`.

Deliberately skipped: icon-stats (needs an icon asset set — later build), canvas/layer editing,
any change to stats' 3-cell cap.

### 3. Asset menu + media library

- **Table `email_media_assets`**: id, user_id, url, kind (`upload` | `brand` | `pexels`), label,
  width, height, attribution (photographer + Pexels page URL when kind=pexels), created_at.
  RLS per user. Migration idempotent, run via Bun.SQL (psql not installed), row-count verified.
- **Upload route** (`PUT /api/email-lab/media`) starts inserting a row; upload pipeline resizes/
  compresses to research targets (≤1200px wide = 2x retina, JPEG derivative, ~100KB) reusing the
  `lib/media/listing-photo.ts` pattern.
- **Lab media panel**: grid of the user's assets — upload, rename label, delete; Pexels search
  picker (new `lib/email/pexels.ts`, `Authorization: PEXELS_API_KEY` header; key via
  `gh secret set` FIRST, then workflow/env wiring — pre-push gate 3). Picked photos store
  attribution; "Photo by X on Pexels" rides in caption/sources, matching citation culture.
- **ASSET MENU in the author** — same moat pattern as the figure menu: assets rendered as
  `[a0] "Dani headshot" · headshot · 600×600`; authored image blocks and multi-column columns
  may carry `asset: "aN"`. Engine resolves id → URL at assembly; unknown id drops the block.
  `image_role: "chart" | "photo"` keeps working for auto-resolved assets. No build-time
  auto-Pexels in v1 (explicitly cut by operator).

### 4. Seeds

Two new editorial SEED_DOCS ("editorial-letter", "magazine-issue") carrying editorial global
style (PLAYFAIR_SERIF display, airy padding, restrained palette). Structure comes from recipes;
style comes from seeds/brand — separation keeps brand canonical (applyBrand still runs last).

### 5. CAN-SPAM notes for this build (no new gate — C2)

- The footer's `address` field is the postal-address requirement's home. Populate it from the
  brand profile; the lab shows a non-blocking nudge when a user's footer address is empty.
  Recipes never suggest removing the footer (it is structural — assembly re-adds it anyway).
- The editorial-letter recipe is text-only BY DESIGN but stays a commercial email: the footer
  with unsubscribe + postal address always renders. The recipe prose says so.
- No change to unsubscribe mechanics — the existing flow already matches the one-click,
  no-login standard.

## What does NOT change

Figure menu + id-selection, prose lint + recorded-claim guard, stat anchoring, brand overlay
order, CAN-SPAM footer survival, 20-block cap, free/paid routing mechanics (`capabilities.ts`
stays the ONE root; the new block routes "both").

## Testing

- Pure-module unit tests: recipe detection (incl. no-match), recipe-text-has-no-digits,
  band resolution + luminance flip, pad mapping, multi-column fill, list assembly + clamps,
  asset-id resolution + unknown-id drop, overlay clamp lengths.
- Golden render: `list` block, banded dark section (onDark text), overlay image.
- `capabilities.test.ts` auto-enforces routing of the new block type.
- Verify bar: `bunx next build` (not bare tsc) + full `lib/email` suite.
- Live-send evidence is operator-run (`author_layout_recipes_live_verify` stays open until then).

## Build order

1. Recipes (pure module + authorSystem wiring + tests)
2. Layout power-up (schema/tool fields → assembly → renderer onDark/list → goldens)
3. Media library (migration → routes → panel → Pexels → asset menu wiring)
4. Editorial seeds
