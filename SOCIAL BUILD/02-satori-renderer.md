# 02 — Satori branded-graphic renderer

| | |
|---|---|
| **Model** | **Opus** (net-new, design-heavy — the long pole) |
| **Stage** | 1 — start now |
| **Runs in parallel with** | EVERYTHING — conflicts with nothing (all new files) |
| **CANNOT run at same time as** | nothing |
| **Blocked by** | only the `GraphicModel`/`RenderedAsset` types in `lib/social/types.ts` (01) — trivial; define a local copy and swap to the import when 01 lands |
| **Files** | NEW: `lib/social/render/**` (one shell per template × ratio), `app/api/social/render/route.ts`, fonts under `lib/social/render/fonts/` |

## Goal
The real net-new build: a server-side renderer that turns verbatim brain data + a brand into a branded PNG, at the four social ratios, with a burned-in provenance watermark. There is **no** image renderer in the repo today (the only image path is a `501` stub at `app/api/templates/render/route.ts:72-74`).

## Build
1. **Engine:** Satori / `next/og` `ImageResponse` (native on Vercel, no chromium). **Verify the current `next/og` image-format + font-loading contract and the unsupported-CSS list live before authoring** (spec §8.4) — Satori is flexbox-only, **no CSS grid, no recharts**.
2. **Templates (JSX shells)** for `stat_card`, `carousel` (5–8 slides), `scorecard`, at ratios `1080x1080`, `1080x1350`, `1080x1920`, `1200x675`. Content shape = `GraphicModel` (verbatim numbers only).
3. **Brand injection:** consume `extractBrandTheme()` (`lib/deliverable/brand-theme.ts:24-46`) as props — colors + logo. Never fork per brand; one generator, brand is data.
4. **Fonts:** embed as `ArrayBuffer` (Satori requirement). Ship a brand-neutral default; allow a brand font later.
5. **Watermark (MANDATORY):** burn `"SWFL Data Gulf • as of {date}"` + source brain into every image — provenance must survive a screenshot/re-share (spec §1, `EMAIL.md:125-133`).
6. **Native data-viz only** (Satori can't render recharts): big-stat card, div/SVG bars, SVG sparkline. Rich charts are a pre-raster fast-follow — out of scope here.
7. Implement the `render` `Deps` function from `lib/social/types.ts` so 01's runner and 04's compose engine call it through the interface.

## Tests & gates
**No-fabrication tripwire (load-bearing):** render with empty/zeroed data → output must contain **no placeholder literal** (no `$412K`, no fake ZIP); every number in the image must trace to the `GraphicModel`. This test exists because a beautiful email template once shipped hardcoded fake data (`2026-06-16-email-report-data-driven-design.md:8-35`). Plus: ratio/dimension assertions per template, snapshot of the watermark. real-tsc 0, eslint, `next build`.

## Done =
`render({template, ratio, data, brand, asOf, source})` returns branded PNG bytes + a URL for each requested ratio, watermarked, with the no-fabrication test green.
