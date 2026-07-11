# SWFL Data Gulf — brand kit for the socials elevation

Everything Claude Design needs to keep mockups in-brand AND recreatable in the renderer. Read alongside the brief (`docs/handoff/2026-07-11-socials-design-elevation-brief.md`).

## Palette (token roles — design against roles, not fixed hues)

The card renders in the client's scraped brand; the SWFL house theme is only the default. Every color you spec must name its role.

- `primary` — background / masthead. House: **`#0f1d24`** (deep ink navy).
- `accent` — the one highlight: stat numbers, accent rule, CTA fill. House: **`#3DC9C0`** (teal). Canonical from `resolveTheme`. NOTE: the lab `templates.ts` currently defaults accent to `#0ea5b7` — an existing two-systems inconsistency; standardize on `#3DC9C0`.
- `text` — on-dark body/headline. House: **`#ffffff`**.
- `surface` — light card surface (sand). House: **`#f0ede6`**.
- `surfaceDark` — dark card surface. House default equals `primary` (`#0f1d24`).
- Neutral/caption gray used today: `#9CA3AF`.

## Fonts — the hard reality

The **published PNG only ever renders in Liberation Sans or Liberation Serif** (bundled faces; the server rasterizer runs `loadSystemFonts:false`). The 6 brand font families below appear in the *browser composer preview* only — at raster time they collapse to sans-or-serif. **Do not build personality on typeface.** Use weight / size / case / spacing / color / layout.

Registry (`lib/brand/fonts.ts`), each maps to Liberation Sans or Serif at raster time:
- MODERN_SANS (Inter) · GEOMETRIC_SANS (Century Gothic) · LATO_SANS (Lato) · MONTSERRAT_SANS (Montserrat) → **Liberation Sans**
- BOOK_SERIF (Georgia) · PLAYFAIR_SERIF (Playfair Display) → **Liberation Serif**

Templates expose two tokens: `fontDisplay` (headlines/kickers) and `fontBody` (support/caption). Design for a display/body split, but assume the rendered faces are Arial-like / Georgia-like.

## Logos (in `logos/`)

- `logo-mark.png` — icon-only mark (the waves). This is what the card uses top-right today. Raster; safe in the renderer.
- `logo-name.png` — wordmark.
- `logo.svg` / `logo-transparent.svg` — vector. NOTE: the server rasterizer **cannot** place an SVG inside the card (`<image>` can't decode SVG in resvg) — logos on-card must be **raster** (png/webp/jpg). Vector is for your mockup tooling only.

## Formats (px) + safe zones
- square 1080×1080 · portrait 1080×1350 · landscape 1200×630 · story 1080×1920.
- Safe band: feed ~7% margin; story reserves top 14% / bottom 35% / sides 6%. Background is full-bleed; keep logo / headline / stat / chart / CTA / watermark inside the band.

## Non-negotiables (recap)
- Mandatory burned-in watermark, bottom: `SWFL Data Gulf • as of MM/DD/YYYY • {source}`.
- No-invention: the stat block is omitted entirely when the value is absent — every template must look composed with the stat gone.
- Deterministic element ids; don't invent new element types beyond `text | image | stat | chart | cta | logo` (+ the proposed `band`/`shape`) without flagging.
