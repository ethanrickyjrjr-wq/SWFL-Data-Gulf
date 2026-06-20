# 02 — Social image rasterizer (branded PNG per platform)

| | |
|---|---|
| **Model** | **Opus** (visual quality + the SVG/HTML render fork + new-dep judgment) |
| **Stage** | 1 — start now |
| **Runs in parallel with** | EVERYTHING (conflicts with nothing) |
| **Blocked by** | only `BrandTheme` types — trivial; use `lib/deliverable/brand-theme.ts` directly |
| **Files (new)** | `lib/social/render-social-image.ts`, `app/api/social/render/[format]/route.ts`, `lib/social/__tests__/render-social-image.test.ts` |
| **Gate** | **new raster dependency → `bun install` + commit `bun.lock` same push (lockfile gate)** |

## Goal
Turn brain data + a client brand into a branded PNG at platform sizes. **Scoped + code-verified:** we reuse the existing email-safe SVG chart renderer instead of authoring viz from scratch — but there's a real fork (below) to decide first.

## Verified anchors
- `renderChart(spec: EmailChartSpec, theme?: Partial<EmailChartTheme>): string` — `lib/email/templates/charts/chart-renderer.ts:279`. Returns **pure SVG for sparkline + gauge**; **HTML `<table>` for bar / stacked-bar / heat-row**.
- `extractBrandTheme(branding): BrandTheme | null` (`lib/deliverable/brand-theme.ts:24`) + `toChartTheme(brand): ChartTheme` (`:40`). `BrandTheme = { primary, accent, logoUrl }`; colors live at `projects.branding.primary_color/accent_color/logo_url`.
- `package.json` has **no** raster lib today (no satori/@vercel/og/resvg-js/sharp/puppeteer); it has `@react-email/render` + `react-dom`.

## THE FORK — decide first (this is the scoped decision)
We need a **composed card** (logo + headline + ONE stat + a chart + as-of/source watermark), not just a chart. Options:
- **(a) `@vercel/og` (Satori JSX→SVG) + bundled resvg → PNG** — Vercel-native, no chromium, emits PNG directly. Card authored as JSX; embed `renderChart` SVG for sparkline/gauge. *Recharts/HTML-table charts won't render under Satori* → for bar/stacked, draw a simple SVG bar natively or defer those chart types. **Recommended.**
- **(b) `resvg-js` (SVG→PNG only)** — smallest; great if the WHOLE card is authored as one SVG string (extend `chart-renderer`'s SVG approach to the full card). No HTML at all. Viable and dependency-light.
- **(c) `puppeteer-core` + `@sparticuz/chromium`** — full CSS/HTML-table fidelity (reuse existing HTML shells verbatim), but 50MB binary + cold-start cost on Vercel. Reserve for a one-off if chart fidelity ever blocks.
Pick (a) or (b) after the crawl confirms required image specs; document the choice in the file header.

## Build
1. `renderSocialImage({ htmlOrSvg | model, theme, format })` → PNG `Buffer`. `format ∈ square 1080×1080 | portrait 1080×1350 | landscape 1200×630 | story 1080×1920` (confirm exact specs against `social-practices.json`).
2. Compose the card: brand colors via `toChartTheme(extractBrandTheme(project.branding))`; pre-fetch `logoUrl` to a buffer (it's a remote/Storage URL). Embed the chart SVG for SVG-type charts.
3. **Burned-in watermark (MANDATORY):** "SWFL Data Gulf • as of {date}" + source brain — provenance must survive a screenshot/re-share.
4. `app/api/social/render/[format]/route.ts` — authed (project-owned) GET that returns `image/png`. The cron worker (04) calls `renderSocialImage` directly.

## Tests & gates
**No-fabrication tripwire:** render with empty/zeroed data → no placeholder literal in output; every number traces to the data model. Per-format dimension assertions. Watermark-present snapshot. Logo-fetch failure degrades gracefully (no crash). real-tsc 0, eslint, `next build`, `bun.lock` committed.

## Done =
`renderSocialImage(...)` returns a branded, watermarked PNG at each platform size, chart + logo colors carried from the project brand, no-fabrication test green.
