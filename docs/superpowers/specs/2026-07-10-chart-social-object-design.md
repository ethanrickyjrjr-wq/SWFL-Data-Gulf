# Saved chart social object — OG card PNG, embed route, download, share row

**Date:** 2026-07-10
**Check:** `chart_social_object_live_verify`
**Operator directive:** "as long as we can build and a user can embed a link, save it and add it
to their socials to start, we can say scheduled socials COMING SOON!" Focus on this lane; hand
off the /charts glow-up and the desk-showpiece idea (see Handoffs).

## Problem

Charts built in chat already persist to `saved_charts` and render at the public `/c/[id]` page
(title, live `ChartBlockView` render, as-of stamp, source link). But the page is not a social
object: pasting a `/c/` link into X / Facebook / LinkedIn / iMessage unfurls as a bare text link
(no `og:image`), there is no way to download the chart as an image, and there is no embed code.
Every chart a user shares today is a dead link preview instead of a branded growth asset.

## Goal

A user can build a chart, save it, and from `/c/[id]`: copy a link that unfurls into a branded
preview card on every major platform, download that same card as a PNG to post natively, and
copy an iframe snippet to embed the live chart on their own site. A "Scheduled socials — coming
soon" pill marks the roadmap without promising a date.

## What we're building

Four pieces, all new files except one edit to `app/c/[id]/page.tsx`. No `lib/email/*` edits
(those files are claimed by a live parallel session; we import read-only only).

### 1. Card renderer — `lib/charts/social-card.ts`

`chartBlockToCardSvg(block: ChartBlock, opts): string` → a 1200×630 branded SVG card:

- Layout: SWFL Data Gulf wordmark (top-left, from `public/logo-transparent.svg` inlined as path
  or `<image>` data URI — resvg has no network access, so no remote hrefs), chart title
  (Instrument-adjacent house font via `CHART_FONT_FILES`), the chart body, and a footer line
  `{source citation} · as of MM/DD/YYYY` (date stated once, MM/DD/YYYY, never a raw token).
- Chart body by `chart_type`:
  - `bar` (dominant shape) → reuse `barChartSvg` from `lib/email/chart-image.ts` (read-only
    import), sized for the card aspect; a bespoke bar builder only if a render spike proves
    the fixed aspect unusable (decide during implementation, in the plan's first task).
  - `area` → `trendChartSvg` / `bklitTrendSvg` path (read-only import).
  - `table` / `scatter` / anything else → big-stat fallback: first 1–3 numeric cells as large
    figures with column labels. Never refuse — every saved block gets a card (RULE 0.7 spirit).
- Provenance is part of the design: the footer credit is not decoration, it's the four-lane
  moat made visible. Numeric values render verbatim from the block — the renderer never
  computes new numbers (display-only rounding via the existing `formatAxisTick` roots).

`chartBlockToCardPng(block): Buffer` wraps it with `@resvg/resvg-js` (same fonts as email
charts — one raster root, no Satori/`next/og` second engine).

### 2. Card route — `app/c/[id]/card/route.ts`

`GET /c/<id>/card` → loads the `saved_charts` row, renders the PNG, returns `image/png` with
`Cache-Control: public, max-age=3600, s-maxage=86400` (charts are immutable once saved; long
CDN cache is safe). Extension-free URL on purpose — platforms follow Content-Type, and
`og:image:type=image/png` states the MIME explicitly, so we avoid an unverified claim about
dotted route-segment names. `?download=1` adds `Content-Disposition: attachment;
filename="swfl-<id>.png"`. 404s cleanly on unknown id. No auth — saved charts are already
public by design at `/c/[id]`.

### 3. Metadata + share row — edit `app/c/[id]/page.tsx`

- `generateMetadata` gains the verified OG contract (ogp.me, crawled 07/10/2026): `og:title`,
  `og:type=website`, `og:url` (canonical `/c/[id]`), `og:image` → `/c/[id]/card.png` with
  `og:image:width=1200`, `og:image:height=630`, `og:image:type=image/png`, `og:image:alt`, plus
  `twitter:card=summary_large_image`. Emitted via Next's Metadata API (`openGraph` +
  `twitter` fields), `metadataBase` from the site URL helper.
- New client component `ShareRow.tsx`: Copy link · Download PNG (`/c/[id]/card?download=1`)
  · Copy embed code (iframe snippet, see 4) · disabled pill "Scheduled socials — coming soon".
  Copy actions use `navigator.clipboard` with a fallback `<textarea>` select. No system nouns
  or internal jargon anywhere user-visible.

### 4. Embed route — `app/c/[id]/embed/page.tsx`

Chromeless render of the same `ChartBlockView` (no `PageShell`, no nav): dark card background,
title, chart, footer credit linking back to `/c/[id]` ("Chart: SWFL Data Gulf" — attribution is
the growth loop, and stripping it is not possible without editing the iframe source). Uses
`h-full`/`dvh` sizing (layout standard), sets `X-Frame-Options`-compatible behavior — i.e. we
must NOT send a deny/sameorigin header on this route; verify the global middleware/headers
config doesn't block framing and scope an exception if it does. Snippet copied by ShareRow:

    <iframe src="https://www.swfldatagulf.com/c/<id>/embed" width="640" height="420"
      style="border:0;border-radius:12px;overflow:hidden" loading="lazy"
      title="<chart title> — SWFL Data Gulf"></iframe>

## Error handling

- Unknown id → 404 on page, card route, and embed (existing `notFound()` pattern).
- Card render failure (malformed legacy block) → the route returns 404, never a 500 with a
  half-drawn image; the page still renders (metadata simply points at an image that 404s —
  platforms degrade to text preview, same as today, never worse).
- Blocks with zero numeric cells → big-stat fallback renders title + source only; still a
  valid branded card.

## Testing

- Unit: `lib/charts/social-card.test.ts` — bar block → SVG contains bars + title + footer
  credit + as-of; area block → polyline; table block → big-stat fallback; zero-numeric block →
  title-only card; malformed block → throws (route maps to 404). Snapshot the SVG structure,
  not byte-exact strings.
- Route: card route returns `image/png` + correct cache headers; `?download=1` sets
  Content-Disposition (vitest route tests mirror `app/api/charts/save/route.test.ts` style).
- Live-verify (closes `chart_social_object_live_verify`): save a real chart → paste the `/c/`
  link into a card validator (X card validator / opengraph.xyz) → preview renders; download
  PNG opens; embed iframe renders on a scratch HTML page.

## Explicitly out of scope (this build)

- Actual scheduled/automated social posting (the pill says coming soon — that build is its own
  spec, likely on the deliverable scheduling rails).
- Per-user ownership/attribution of saved charts (existing `meter_uid_attribution` check).
- New chart shapes; the card renders what `saved_charts` already holds.

## Handoffs (specced separately, checks open)

- **B — /charts glow-up** → `docs/handoff/2026-07-10-charts-glowup-handoff.md`, rides existing
  `bklit_charts_evaluation` check. Vendor Gauge + Heatmap + Profit/Loss Line + Projection Line
  (bklit registry verified live 07/10/2026 — Profit/Loss Line and the Projection/Brush
  utilities exist upstream); new panels: market-temperature gauge, ZIP×month heat grid, YoY
  momentum profit/loss line, tier-divergence projection. Fix `charts_vacancy_asof_fabricated`
  in the same pass. Owner: website-builder session.
- **C — live "data desk" showpiece board** → parked idea, check `desk_showpiece_parked`. The
  Insiders-wire energy (live line + gauges + ticker) as its own page; operator likes the idea
  "somewhere", not on /insiders. No build until B lands (it reuses B's vendored components).
- **Email chart wiring** (multi-ZIP revival etc.) stays with the deliverable-builder lane —
  `lib/email/*` is claimed by a live session today; nothing here touches it.
