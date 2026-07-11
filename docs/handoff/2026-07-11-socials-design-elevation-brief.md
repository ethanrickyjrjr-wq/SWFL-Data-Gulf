# Handoff to Claude Design — Elevate the SWFL Data Gulf social templates

**Date:** 07/11/2026 · **From:** build session (Opus 4.8) · **Surface:** socials (lab design system)
**Goal:** make our social cards look *art-directed*, not scaffold-plain — without breaking a renderer that can only draw certain things.

---

## What you're designing (and what you're NOT)

You (Claude Design) own the **visual system + per-template layouts + generated assets**. You do **not** touch render code, the element type model, or the Konva/resvg pipeline — engineering wires your designs in afterward. Your deliverable is a **look-book**: for each template, a mockup per format, plus a written spec of the type scale, color roles, spacing, and any background/texture asset.

The surface being elevated is the **lab design system** (`lib/social/design/templates.ts` + the `SocialDesign` element model), NOT the separate cron auto-publish card (`composeCardSvg`). Design only the lab templates.

---

## The 5 existing templates (rework all) + 2–3 new

Current, all visually plain (solid dark background, left-aligned text stack, one accent, a pill CTA):
1. **stat-hero** — one big headline number + headline + CTA.
2. **headline-cta** — bold headline + supporting line + CTA, no stat.
3. **three-stat** — kicker over three side-by-side stats (market snapshot).
4. **listing-feature** — a real listing: photo on top, price/beds stat, CTA.
5. **tip-stack** — kicker + title over a stack of short numbered tips/reasons (educational value post).

Propose **2–3 new layouts** that fill gaps we don't have (candidates: a quote/testimonial card, a before/after or this-vs-that comparison, a "market pulse" trend card built around the embedded chart, an agent-intro card). Justify each against a real realtor-social use case.

---

## HARD renderer constraints — a design that violates these can't ship

These are non-negotiable because the export path is `@resvg/resvg-js` rasterizing an SVG, and the browser path is Konva. Both must draw the same thing.

- **Drawable primitives only:** flat color fills, **linear gradients**, **raster images** (jpg/png/webp), and **text**. That's it. No blur/filter effects, no drop shadows you rely on, no `<image>` containing an SVG (resvg can't decode it — logos must be raster). Rounded rects, color blocks, dividers, framed panels = all fine (they're rects). Design *around* rects + gradients + photos + type.
- **Fonts: the published card is ALWAYS Liberation Sans or Liberation Serif.** This is the biggest non-obvious constraint. The server rasterizer bundles only `LiberationSans` + `LiberationSerif` (`CANVAS_FONT_FILES`, `loadSystemFonts:false`). The 6 brand fonts in `lib/brand/fonts` (Inter, Playfair, Montserrat, Lato, …) show in the browser composer *preview*, but at raster time every one collapses to sans-or-serif (Liberation, metric-equivalent to Arial/Times). **So you cannot get typographic personality from typeface choice.** Build hierarchy and character from **weight, size, spacing, case, color, and layout** — not from a distinctive font. Treat type as Arial/Georgia and design accordingly.
- **Everything is brand-parametric.** Colors are tokens, not fixed hues: `primary`, `accent`, `text`, `surface`, `surfaceDark`, plus a client `logoUrl`. Design with the SWFL house theme but every color in your spec must name its **token role**, because the same template renders in a client's scraped brand. A design that only works in teal is broken. House theme values: primary `#0f1d24`, text `#ffffff`, surface `#f0ede6`. **Accent — use `#3DC9C0`** (the engine's canonical house accent, `resolveTheme`); note the lab `templates.ts` currently defaults accent to `#0ea5b7` — that's an existing inconsistency between the two systems, flag it, standardize on `#3DC9C0`.
- **Text has no real metrics.** Wrapping is greedy/approximate; long headlines wrap to ≤2 lines and ellipsize. Keep hero copy short; don't design layouts that depend on precise line breaks.
- **The stat can be absent (no-invention moat).** If we don't have a real number, the stat block is *omitted entirely* — never "$0", never "N/A". Every template must still look composed with the stat missing. Design the empty state.
- **Mandatory burned-in watermark, bottom of card:** `SWFL Data Gulf • as of MM/DD/YYYY • {source}`, with an optional smaller freshness date beneath. Leave clear space for it; never let content collide with it.
- **Deterministic element ids.** Each element keeps a readable, fixed id (`headline`, `stat`, `cta`, `logo`, …) — the AI author patches by id. You don't mint ids; just don't invent new element *types* beyond the set below without flagging it.

## The 4 formats + safe zones

Design each template at all listed formats (see per-template `formats`):
- **square** 1080×1080 · **portrait** 1080×1350 · **landscape** 1200×630 · **story** 1080×1920.
- Background is **full-bleed** edge-to-edge. Key elements (logo, headline, stat, chart, CTA, watermark) stay inside the safe band: feed formats ~7% margin; **story reserves top 14% / bottom 35% / sides 6%** (platform UI chrome). Don't put anything load-bearing in story's reserved zones.
- **Landscape caveat (see research below):** 1200×630 matches LinkedIn but NOT X's current 16:9 feed image (1600×900). On X a 1200×630 card letterboxes or center-crops, so keep landscape compositions **centered and edge-safe** — nothing critical in the outer ~8% horizontally — until/unless a dedicated 16:9 format is added.

---

## Research findings — crawl4ai, 07/11/2026 (RULE 0.4)

Verbatim current platform specs, Sprout Social size guide (last updated 05/11/2026 — https://sproutsocial.com/insights/social-media-image-sizes-guide/). This VALIDATES our four formats against live 2026 vendor guidance:

- **Instagram feed:** 1080×1080 or 1080×1350 → our **square + portrait** ✓
- **Facebook shared image:** 1080×1350 (portrait is now FB's recommended feed size too) → our **portrait** ✓
- **LinkedIn post:** 1200×627 → our **landscape** 1200×630 ✓ (3px, immaterial)
- **X (Twitter) post:** **1600×900 (16:9)** → our landscape is ~1.9:1 — **mismatch**, see the caveat above. Candidate Phase-2 format.
- **TikTok / Stories / Snapchat:** 1080×1920 → our **story** ✓
- **Threads:** 1080×1080 → our **square** ✓
- **Pinterest** 735×1102 (or 1000×1500) and **YouTube** 1280×720 — not built, correctly Phase-2.

Design evidence:
- **Carousels have the highest engagement rate of any Instagram post type** (Buffer — https://buffer.com/resources/instagram-carousel/), yet are underused. Among the 2–3 new templates, prioritize a **multi-slide / carousel-friendly** layout (a repeatable slide shell: cover slide + N content slides sharing one visual system). Our current `tip-stack` crams the whole list onto one card — a carousel version would likely outperform it.
- Sprout's core principle: wrong dimensions trigger **auto-crop and strip branding** — reinforces the safe-zone + full-bleed-background discipline above; never let the logo or watermark sit where a platform crop can clip it.

_Note: several realtor-specific design blogs (Canva, Later, Hootsuite) 404'd at crawl time — specs above are from the live, dated Sprout + Buffer pages, not memory. If Claude Design wants deeper aesthetic references, pull fresh realtor-social galleries at design time._

## Element vocabulary you compose from

`text`, `image` (photo/background), `stat` (value+label+accent), `chart` (an embedded rendered chart PNG — treat as a boxed image), `cta` (pill button: text + fill + textFill), `logo`. **One new primitive is on the table:** a `band`/`shape` block (flat or gradient-filled rect, for color blocks / dividers / accent panels / framed sections). If your designs need it — and they probably should — **design as if it exists and call it out explicitly** so engineering adds it. Don't rely on any other new type without flagging it.

---

## Staging (so each step ships)

1. **Type + color + spacing rework** of the 5 existing templates using only today's primitives (real hierarchy, disciplined spacing, two-tone color, logo treatment, full-bleed photo + legibility scrim where a photo exists). Zero engineering risk.
2. **Add the `band`/`shape` primitive** and redesign to use it (color blocks, dividers, accent panels) — the single biggest jump to "designed."
3. **Optional:** gradient / duotone backgrounds and the 2–3 new templates.

## Deliverable format

For each template × format: a mockup (image is fine) + a short spec block naming, per element: token role for every color, which font token, font size as a fraction of `min(W,H)`, position, and behavior when the stat/photo is absent. Plus a one-page **type & color system** the whole set shares. Any background/texture you generate: deliver as a flat raster asset (no SVG), brand-neutral or tokenizable.

---

## What ships WITH this brief (the advantage package)

In `docs/handoff/assets/2026-07-11-socials/`:
- **`current-cards/` — 12 real rendered PNGs of TODAY's card** (3 sample messages × 4 formats), generated by the live engine renderer with real sourced data (Zillow ZHVI). **This is the "before" — the plainness you're elevating from.** Look at `fmb-oneyear--square.png`: clean but top-aligned, single-column text stack, and the entire bottom ~55% is dead space. That void, the absence of imagery/geometry, and the flat single-accent treatment are the target. (These render the *engine* auto-post card, which shares the exact visual language of the 5 lab templates — same primitives, same plainness.)
- **`brand-kit.md` + `logos/`** — the exact palette hexes, the font reality, and the SWFL logo files (`logo-mark.png` icon, `logo-name.png`, `logo.svg`). Use these so your mockups are in-brand AND recreatable in the renderer.
- **`brand-kit.md`** also restates the token roles and the Liberation-font constraint in one place.

## Aspirational references (crawl4ai, 07/11/2026 — Canva realtor-post gallery)

Current-market realtor Instagram templates to elevate *toward* (live thumbnails, https://www.canva.com/templates/?query=real-estate-instagram-post). The dominant aesthetic is **neutral / modern / high-contrast, minimal palette, big type, generous whitespace with intent** — the opposite of our dead-space void:
- "Neutral Modern Real Estate" · "White & Black Modern" · "Black & White Modern Professional" · "Brown & White Modern" — restrained 2-tone systems, large type, editorial spacing.
- "Dark Blue Minimalist Just Listed" — closest to our dark house look done *well* (a listing template target).
- "White & Red Classic Agent Tips **Carousel**" (10 slides) — the carousel format (highest IG engagement).
- "Real Estate Market Type Comparison **Infographic**" — a this-vs-that/comparison layout (new-template candidate).
- "White Marble Grid Listing" — texture-as-background done tastefully.
Pull fresh galleries at design time for more; these are a starting target, not a ceiling.

## Source-of-truth files (for engineering, not you to edit)
- `lib/social/design/templates.ts` — the 5 template factories.
- `lib/social/design/types.ts` — the `SocialElement` / `SocialDesign` model.
- `lib/social/render-social-image.ts` — resvg export path + constraints (read the header comment).
- `lib/social/formats.ts` + `lib/social/safe-zones.ts` — dimensions + safe insets.
- `lib/brand/fonts.ts` — the allowed font families.
