# Canva-style social composer

**Date:** 2026-06-30
**Build check:** `social_canvas_composer_live_verify` (open)
**Supersedes:** Tasks 5 & 6 of `docs/superpowers/plans/2026-06-29-grid-lab-socials/` (the C1 "composition seam" + "image export" fork). Tasks 1–4 (schedule wiring, draft→live status, per-platform captions, caption provenance) are **shipped and reused, not replaced**.

---

## Problem

The paid `/email-lab/grid` social surface can only **generate / copy / load** AI-authored EmailDoc cards. There is no real composer, no freeform design, and no image export that matches what the user sees. The original plan framed the missing piece as a fork — **(a)** constrain social to the one-headline/one-stat SocialModel template and rasterize via the existing resvg path, or **(b)** rasterize an arbitrary EmailDoc grid to PNG (net-new HTML→image engine). In-session research showed **both are the wrong fork**: they are two ways to rasterize HTML/React, and each carries a real penalty (Satori is flexbox-only and cannot render our grid HTML, adding a 4th divergent render engine; headless chromium is heavy infra and the email grid HTML is the wrong shape for a fixed-size image anyway).

## C1 resolution (the composition seam)

The operator's C1 decision is recorded here: **neither (a) nor (b) — a canvas-native composer.** A social post is a **fixed-size image**, so the right surface is a Canva-style design canvas (HTML5 canvas), where the preview *is* the export. This dissolves the rasterizer fork: `canvas.toDataURL({ pixelRatio })` produces a pixel-exact PNG at any platform size, **client-side in the browser, with no chromium and no Satori**, and the design serializes to JSON for reuse. This is the stack the pros use (Polotno is a Konva-based "build-a-Canva" SDK; Predis.ai runs on Polotno).

## Goal

A Canva-style social composer in the paid lab where a user can:

- **Make a post two ways** — design it on a blank canvas, or hit **Generate** and have AI lay it out from real, cited SWFL data, then tweak.
- **Write the caption two ways** — type it, or have AI write it (already per-platform shaped: X vs LinkedIn vs Instagram).
- **Embed a link** — drop a "Learn more →" CTA element on the design and attach a URL; the link also rides in the caption (honest platform limit: IG/FB do not make image regions clickable — the click lives in the caption / post link, the CTA element is visual).
- **Export** — one click renders the post to exact platform pixels in the browser.
- **Schedule daily/weekly** — pick the publishable platforms + a time; the design is frozen (image + caption) and the existing poster handles it on schedule.

## Approach & why (research-backed, in-session 2026-06-30, per RULE 0.4)

Decision: **build the social composer on a 2D canvas design library** (recommend `react-konva`/Konva; `fabric.js` is the viable alternative — finalize in the plan with a vendor-doc pass per RULE 1). Rationale, all confirmed in-session via crawl4ai:

- **Satori / `@vercel/og`** is a Flexbox-only (Yoga) subset — `display` supports only `flex`/`contents`/`none` (no `inline-block`/`block`/`grid`/tables), no `dangerouslySetInnerHTML`, fonts mandatory as TTF/OTF ArrayBuffers, charts only via `<img>` data-URIs. It **cannot** ingest `compile-grid`'s ghost-table HTML; using it means a **4th EmailDoc render engine** (the email/grid/PDF trio already drift on fonts/styling — see memory `project_emaildoc-three-render-engines`).
- **Headless chromium** (`@sparticuz/chromium-min` + `puppeteer-core`, >50 MB remote pack, ≥512 MB RAM / 1600 recommended, cold-start + `/tmp` cleanup caveats) renders real HTML faithfully but is heavy infra — and the email grid HTML (600px column, ghost tables) is the wrong shape for a 1080×1080 image regardless.
- **Canvas design libs (Konva, Fabric.js)** export `PNG/JPG/SVG/JSON` **natively**, client *and* server: Konva `stage.toDataURL({ pixelRatio })`; Fabric `canvas.toDataURL()` / `createPNGStream()`. Both serialize a design to JSON and re-render it (Konva headless in Node via `canvas`/`skia-canvas`; Fabric via `node-canvas` + `jsdom`). **The preview equals the export → zero drift, no new HTML engine, no browser.**

## Architecture (v1)

**Layer 1 — Navigation & panel architecture.** Build target is the **paid grid lab only**: `/email-lab/grid` → `EmailLabGridClient` → `EmailLabGridShell` (header badge "Grid · paid"). The free shell (`/email-lab` → `EmailLabShell`) is untouched.

Add a top-level **Email | Social** mode tab to the grid shell, and make the left panel **mode-aware**. Today that panel is a flat accordion stack — Social calendar / Brand / Start from a layout / Add a block / Photos. Restructure it into:

- **Shared panels** (render in both modes): **Brand** (colors/fonts/logo) and **Photos**. "Most tools are the same for both."
- **Email-only panels** (Email mode): Start from a layout / seeds, Add a block, the email author engine.
- **Social-only panels** (Social mode): aspect/format picker, the canvas element palette, **Generate** (AI), caption + per-platform variants, platform targets, schedule.
- The current **"Social calendar" accordion is removed from Email mode** — social authoring / Generate moves into Social mode where it belongs. Switching the tab swaps the canvas (email grid ↔ social canvas) **and** the mode-specific panels; the shared panels persist.
- The split is structured so individual tools can **diverge per mode over time** without forking the shell (e.g. a social-specific brand control later).

Social stays paid-only via `capabilitiesFor(tier).socialCalendar` — never hardcoded; `capabilities.test.ts` is not relaxed.

**Layer 2 — Composer (canvas).** A fixed-aspect canvas with an aspect picker keyed to the existing `SOCIAL_FORMATS` (square 1080×1080 default; portrait 1080×1350; landscape 1200×630; story 1080×1920). Elements: text, image (from the Photos bridge), a stat block (value + label), a chart from real data (via the existing chart renderer, placed as an element), a CTA/button with a link, and the brand logo. Drag, resize, layer, edit. Brand colors/fonts apply via the existing brand tokens.

**Layer 3 — AI fill + caption.** **Generate** reuses `lib/email/social-calendar/build-week.ts` (`buildSocialPost`): the model returns `captionText`, `hashtags`, and a **content patch keyed by element id** (text fields only — the prompt forbids colors/photos/logos/brand). That patch seeds/fills the canvas elements; the user edits anything. Per-platform caption variants are already built (Task 3). Four-lane no-invention prompt is unchanged.

**Layer 4 — Export (freeze-at-compose).** `toDataURL({ pixelRatio })` renders the canvas to a PNG at the chosen platform size **in the browser**; upload to public Storage → `media_url`. No server rasterizer in v1.

**Layer 5 — Schedule / publish.** The "Schedule" action writes a `social_schedules` recipe carrying the **frozen** PNG `media_url` + caption + chosen platforms (the **5 publishable** only) + cadence (daily/weekly + time). The existing cron worker (`scripts/social/run-schedules.mts`) gets one branch: **if a schedule carries a frozen canvas image, post it verbatim** (do not re-render the SocialModel template). DRY-gated by `SOCIAL_PUBLISH_ENABLED` as today.

## What we reuse (do NOT rebuild)

- **Tasks 1–4 (shipped):** schedule wiring → `social_schedules`; draft→in review→approved→scheduled→live status; per-platform caption variants; caption provenance (four-lane).
- **AI content-patch contract** (`build-week.ts`): text-by-element-id, brand/photo-free — portable to canvas elements as-is.
- **Brand tokens** (`lib/email/brand/branding-to-tokens.ts`, `applyBrand`): color/font/logo values, render-agnostic.
- **Photo bridge** (`inject-photo.ts` / lab photos): image URLs.
- **The data-bound template renderer** (`lib/social/render-social-image.ts`): stays as the **auto-refreshing scheduled-post template path** — the cron keeps using it for template schedules. The canvas composer is the **freeform frozen-snapshot path**. Two coexisting modes, picked per post.

## v1 scope (in)

1. Email | Social tab (paid-only via the dial).
2. Fixed-aspect canvas + aspect presets (the 4 `SOCIAL_FORMATS`).
3. Element types: text, image, stat block, chart-from-real-data, CTA/link button, logo.
4. Two create paths: blank design, or AI Generate → seed canvas.
5. Caption: user-typed or AI-written (per-platform variants).
6. Link/CTA element + link in caption.
7. Native PNG export at platform pixels (client-side) → upload.
8. Schedule daily/weekly to the 5 publishable platforms; cron posts the frozen image verbatim.
9. **Store the design as JSON + element→metric data bindings** even though v1 exports a flat PNG (cheap now; unlocks the roadmap without a rebuild).

## Out of scope v1 → roadmap (on the record)

- **A. Carousel / multi-image.** Not blocked: the post media field is already a list (`ComposedPost.media[]`), and IG (≤10) / FB / LinkedIn / X (≤4) support multi-image. Needs a multi-page canvas concept (add/reorder pages → N PNGs) and multi-media in the publish adapters. **First fast-follow.** (Verify exact per-platform carousel API limits with a targeted crawl4ai pass at build time, per vendor-first.)
- **B. Auto-refresh a designed post.** Possible and high-value: store the design JSON + data bindings (v1 already does), then on schedule refetch the brain data, patch the bound elements, **re-render headless server-side** (same canvas lib via `skia-canvas`/`node-canvas` in the Bun cron) and post. The real work is **layout-safety** — a hand-placed number that changes length ("$412K" → "$1.25M") can overrun its box; needs auto-fit text / constrained bound fields. **Phase-2.**
- **C. Video / Reels.** Not planned.

## No-invention moat on a freeform canvas

- **AI-filled text** goes through the existing four-lane prompt (`socialPostSystem`) — cited, no invented numbers. Unchanged.
- **User-typed text** is the user's own figure (lane 4 — user-supplied). Allowed; there is **no code-level scrub of user-typed canvas text**, by design — consistent with the shipped caption model (Task 4: prompt-enforced, not post-scrubbed) and the locked decision that client data can be used by a client (`feedback_client-data-not-police`).
- The structural-omission moat of the template renderer (empty stat → block omitted) does not apply to a freeform canvas (the user controls layout); the moat lives at the AI layer.

## Key decisions / to finalize in the implementation plan

- **Canvas library:** lean **`react-konva`** (React-first, Polotno's foundation, `pixelRatio` export, headless Node via `skia-canvas`); **`fabric.js`** is the alternative (more turnkey editor controls, `node-canvas`). Finalize with an in-session vendor-doc pass (RULE 1) before writing composer code.
- **Export runtime:** client-side `toDataURL` in v1. Server-side re-render (`skia-canvas`/`node-canvas` in the Bun cron) is the Phase-2 auto-refresh enabler — validate it runs in the GHA cron runtime at that time.
- **Watermark:** paid surface → user places their own logo; no forced watermark (confirm vs the template renderer's burned-in provenance).
- **Daily cadence:** verify `lib/email/schedule-cadence.ts` (`CadenceSpec`) supports a `daily` cadence; add it if missing (mirror weekly/monthly).
- **Cron branch:** post a frozen canvas image verbatim when the schedule carries one; otherwise render the SocialModel template (today's behavior).

## Probe-first touchpoints (RULE 0.5)

- `components/email-lab/EmailLabGridShell.tsx` (tab + mount the social composer; `loadSocialCard` shim is retired for the canvas path), `components/email-lab/SocialCalendarPanel.tsx`.
- `lib/social/` — schedule recipe (Task 1), `run-schedules.mts` (frozen-image branch), `render-social-image.ts` (template path stays), `types.ts` (`ComposedPost.media[]`, `FrozenPost`).
- `lib/email/social-calendar/build-week.ts` (AI fill, per-platform variants).
- `lib/email/brand/branding-to-tokens.ts`, `inject-photo.ts` (brand + photos).
- `lib/email/schedule-cadence.ts` (cadence).

## Research evidence (crawl4ai, in-session 2026-06-30)

Sources fetched and read this session (markdown captured to scratchpad only — `*crawl4ai*` is gitignored, never committed):

- `github.com/vercel/satori` — Flexbox-only Yoga engine; `display: flex|contents|none`; no inline-block/grid/tables; no `dangerouslySetInnerHTML`; fonts mandatory (TTF/OTF/WOFF ArrayBuffer, no WOFF2); images via `<img>` data-URI; no inline `<svg>`; no `calc`/`z-index`.
- `vercel.com/docs/og-image-generation` — `@vercel/og`/`next/og` `ImageResponse` on Node runtime in App Router; returns a `Response` (Buffer needs direct `satori()`+`resvg`). Same Satori subset.
- `github.com/Sparticuz/chromium` (149.0.0, May 2026) — `@sparticuz/chromium` + `puppeteer-core`/`playwright-core`; brotli >50 MB → `@sparticuz/chromium-min` + remote pack on size-limited hosts; ≥512 MB RAM (1600 recommended); cold-start + warm-`/tmp` cleanup caveats.
- `github.com/konvajs/konva` — Node render via `canvas`/`skia-canvas`; `toDataURL({ pixelRatio })`; JSON serialize; react-konva.
- `github.com/fabricjs/fabric.js` — native `JPG/PNG/JSON/SVG` i/o; Node via `node-canvas` + `jsdom`; `createPNGStream()` / `toDataURL()`; JSON serialize/reload.
- `polotno.com` — commercial Konva-based "build-a-Canva" SDK; render/export pipeline in your own infra; explicit real-estate "bulk property campaigns from data or AI" use case; lists **Predis.ai** as a customer.
- GitHub topic sweep (`design-editor`, `image-editor`, `social-media-scheduler`) — OSS Canva-clone references on Fabric/Konva (`ikuaitu/vue-fabric-editor` 7.9k★, `dromara/yft-design`, `Imam-Abubakar/mural`, `YaroslavChuiko/Webster` = Konva+React+NestJS+Postgres), commercial IMG.LY CE.SDK; OSS schedulers (Postiz, Mixpost, Open-Dispatch, PostEverywhere) — the publish layer we already own (`lib/social`).

---

## Roadmap (follow-up)

1. **v1** — single-image Canva-style composer + native export + schedule (this spec). Stores design JSON + bindings.
2. **Fast-follow A** — carousel / multi-image.
3. **Phase-2 B** — auto-refresh a designed post (server-side re-render + layout-safety).
