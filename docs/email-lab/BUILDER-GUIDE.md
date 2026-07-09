# Email Lab — Builder Guide

What the Email Lab is, how its pieces fit, and what you need to know before adding
to it. Written from the code (not memory) on 2026-06-28. Probe the files named here
before changing them — this is a map, not a contract.

> **Update 2026-07-09:** the free block shell (`EmailLabShell.tsx`, `BlockCanvas.tsx`,
> `CanvasBlock.tsx`) was **deleted** in the 2026-07-07 retire-block-shell pass
> (`docs/superpowers/specs/2026-07-07-retire-block-shell-design.md`). The grid lab
> (`EmailLabGridShell.tsx` + `GridCanvas.tsx`) is the ONE email surface; `applyBrand`
> now lives at `lib/email/brand/apply-brand.ts`. Shell references below are corrected
> in place; anything else naming the block shell is historical.

---

## 1. What it is

A block-canvas email/PDF designer. The user describes an email; the AI fills **real
SWFL data** (never invents numbers); the user tweaks blocks, brand, photos, and
charts; then saves → sends → or schedules. One shared shell powers two routes.

- **`/email-lab`** — a redirect, not a surface: signed-in users go to their
  project's Email tab, anonymous visitors to the anonymous grid lab
  (`app/email-lab/page.tsx` → `lib/lab-entry/destination.ts`).
- **`/project/[id]/email-lab`** — project-scoped. Carries the project's brand + lake
  scope + filed photos, and can Save/Send/Schedule against the project.

The whole UI lives in **`components/email-lab/EmailLabGridShell.tsx`** — it owns all
state (doc + undo/redo history, selection, AI fill, brand, photos, export). The
route clients are thin wrappers passing brand/scope/save config.

---

## 2. The document model (`lib/email/doc/`)

An email is an **`EmailDoc`** = `{ globalStyle, blocks[] }`.

- **`globalStyle`** (`types.ts`): `primaryColor`, `accentColor`, `textColor`,
  `backdropColor` (the **4 brand colors**), plus `fontFamily`.
- **`blocks[]`** — an ordered list. Each block is `{ id, type, props }`. Types:
  `header`, `hero`, `stats`, `signal`, `text`, `image`, `agent-card`, `agent-hero`,
  `social-icons`, `button`, `divider`, `footer`.
- **`types.ts`** is the prop source of truth; **`schema.ts`** is the matching Zod
  validator (`EmailDocSchema`). Any new prop must be added to BOTH. Hero/Text/Stats/
  Signal/Image extend `BlockBase` (`paddingY`, `sectionBg`).
- **`default-docs.ts`** — `createBlock(type)`, `defaultDoc()`, and `SEED_DOCS` (the
  "Start from" presets). **`history.ts`** — undo/redo; `liveEdit` coalesces rapid
  field edits into one undo frame, `commit` pushes a discrete frame.
- Render to HTML: `POST /api/email-lab/render` (`{ doc }` → `{ html }`). Real PDF:
  `POST /api/deliverables/[id]/pdf` with `{ doc }` (falls back to browser print).

**Images carry a `kind` tag** — this is load-bearing. An `image` block is `kind:"chart"`,
`kind:"photo"`, or untagged (a manual upload). It also carries `linkUrl?` (makes the
image a tracked click-through, so an email behaves like a webpage).

---

## 3. The brand bridge — ONE ROOT (read this before touching brand)

There is a **single** brand pipeline. Do not fork it.

```
branding (snake_case blob)             ← edited by ONE form: components/brand/BrandingBlock.tsx
   │                                       saved to: projects.branding (per-project, full blob)
   │                                                 user_brand_profiles (account default, subset)
   ▼
brandingToTokens(branding)             ← lib/email/brand/branding-to-tokens.ts  (THE mapping)
   │   primary_color→PRIMARY, accent_color→ACCENT, text_color→TEXT,
   │   backdrop_color→BACKDROP, agent_name→COMPANY_NAME+AGENT_NAME, brokerage→TAGLINE,
   │   website_url→WEBSITE_URL+CTA_URL, socials→*_URL, …
   ▼
UPPER tokens
   │
   ▼
applyBrand(doc, tokens)                ← lib/email/brand/apply-brand.ts
       → globalStyle.{primary,accent,text,backdrop}Color + brand-bearing block props
```

- **`BrandingBlock`** is the same form in the project workspace pill AND in the Email
  Lab's "Brand" accordion. It holds every brand field (name, nickname, title,
  brokerage, license, bio, quote, email, phone, website, business address, headshot/
  logo URLs, socials, unsubscribe) + **4 color slots** (primary/accent/text/background)
  + a saved-palette library.
- The lab seeds its brand state from `initialBranding` (the project's
  `projects.branding`, passed through the client). On edit it re-runs
  `applyBrand(doc, brandingToTokens(branding))` for a live preview — brand props +
  the 4 colors only; **AI-filled body numbers are never touched** (brand is canonical,
  the AI fills content).
- **Save targets** (same as the workspace): `PATCH /api/projects/[id]` `{ branding }`
  (per-project, carries EVERY field) + `PATCH /api/user/brand` (account default).

### Known gap (do not misreport)
`/api/user/brand` only has **columns** for `agent_name, photo_url, license, brokerage,
primary_color, accent_color, logo_url`, the socials, `unsubscribe_url`, and
`color_palettes` (jsonb). Everything else (`agent_title, bio, contact_*, website_url,
text_color, backdrop_color, nickname, quote, business_address`) persists in the
per-project blob but does **not** carry to NEW projects. To make a new field carry
account-wide, add a column + add it to the route's field list. Until then it's
project-scoped only.

### Saved-palette tuple
`lib/brand/palette.ts` defines a palette as a **4-tuple** `[primary, accent, text,
background]` via `PALETTE_SLOT_KEYS`. If you change the slot count, update the tuple
type, `schemeFromBranding`, `defaultScheme`, `schemesEqual`, `sanitizePalettes`,
`BrandingBlock.COLOR_SLOTS`, and the tests — it's ~6 mechanical spots. Legacy 3-color
palettes read `colors[3]=""` (back-compatible).

---

## 4. AI fill (`/api/email-lab/ai`)

- Full-doc fill: send `{ prompt, doc, scope, chartType? }`. Returns a patched doc
  (content/numbers only — it **never restyles**, colors stay sticky). Parsed back
  through `EmailDocSchema` before commit.
- Per-block fill: `BlockInspector`'s `onBlockAi` sends a **1-block mini-doc** to the
  same route and swaps just that block.
- The AI uses the live internet (web search is wired). **Do not hand-edit the AI's
  numbers to "make them consistent"** — that reintroduces stale/invented values and
  breaks the no-invention moat. Variation between fills is expected, not a bug.

---

## 5. Charts and photos (they coexist)

- **Charts** — `lib/email/build-doc.ts` (`buildChartForQuestion`) selects REAL points
  (held brain / live-web-cited / upload / user-stated; the model never writes a number).
  Routed by keyword in `lib/route-chart.ts`. Injected via `lib/email/inject-chart.ts`
  (`chartImageBlock` tags `kind:"chart"`, `upsertChartBlock` replaces ONLY the chart
  slot). Note: the ZHVI area chart rasterizes for email; ranked-delta does not.
- **Photos** — `lib/email/og-image.ts` pulls a hero photo's `og:image` from a listing/
  website URL in the prompt, or falls back to the saved brand website (off the footer's
  `websiteUrl`). Injected via `lib/email/inject-photo.ts` (`heroPhotoBlock` tags
  `kind:"photo"`, `upsertHeroPhoto` replaces ONLY the photo slot, inserts after header).
  SSRF-guarded, browser UA, never throws. Redfin serves og:image; Zillow/Realtor block
  bots (403/429) → degrade to no photo (RESO Media is the planned no-scrape lane).
- Because chart and photo are **separately tagged**, a re-render of one never clobbers
  the other (or a manual upload). Keep that invariant if you add a third image kind.
- Manual photos: `PUT /api/email-lab/media` (standalone, user-scoped) or
  `POST/PUT /api/projects/[id]/email-media` (project). Bucket `email-media`.

---

## 6. Save / Send / Schedule / Track

- **Save** (project only): `POST/PATCH /api/projects/[id]/materials` writes a
  `deliverables` row (`template = "block-canvas"`, `doc`, `ai_prompt`). The
  `ai_prompt` is stored so a SCHEDULED re-render reproduces the email — chart included —
  with fresh data.
- **Send**: `ContactPickerModal` → blast reads `deliverables.doc` from the DB (so the
  live doc must be saved first). Merge tags `{{first_name}} {{full_name}} {{email}}`
  are substituted per-recipient in `blast/route.ts` (`withMergeTags`).
- **Schedule**: `ScheduleSendModal` links a cadence to the saved deliverable id; the
  worker re-renders THAT design fresh each occurrence.
- **Tracking**: `email_events` table; Resend webhook at `/api/webhooks/resend`; opens
  (pixel) + clicks (via `tags {rid}`). Go-live needs `RESEND_WEBHOOK_SECRET` set as a
  GH secret + the webhook created in the Resend dashboard (see SESSION_LOG).
- **Paywall**: builds are free (watermark only); SEND is the paywall. No build gate.

---

## 7. Extension points (where to add things)

- **New block type**: add props to `types.ts` + Zod to `schema.ts` + `createBlock` in
  `default-docs.ts` + a renderer in `lib/email/blocks/` + an inspector section in
  `BlockInspector.tsx` + a `BLOCK_MENU` entry (`AddBlockPanel.tsx`). If it carries
  brand data, add a branch to `applyBrand`.
- **New brand field**: add to `BrandingBlock` (a field list) → it auto-saves to the
  blob. To render it, add a token in `branding-to-tokens.ts` + a branch in `applyBrand`
  + the target block's props/renderer. To carry it account-wide, add a `user_brand_profiles`
  column + list it in `app/api/user/brand/route.ts`.
- **New seed**: add to `SEED_DOCS` in `default-docs.ts`.
- **New chart shape**: extend `buildChartForQuestion` + `route-chart.ts`. If a shape
  isn't built, the product offers bar/table — never "can't chart it".

---

## 8. Landmines

- **One root for brand** — never reintroduce a lab-only color/brand store. Colors flow
  `branding → brandingToTokens → applyBrand → globalStyle`. The deleted 2-ColorControl
  panel was the old second root.
- **`kind` tag on images** — keep chart/photo/upload separable or re-renders clobber.
- **Don't hand-edit AI numbers** (§4). No-invention moat.
- **Verify with `bunx next build`**, not bare `tsc` (local tsc ≠ Vercel).
- **Layout**: `h-full`/`dvh`, never `h-screen`.
- **Social platforms have ONE root**: `lib/email/social/platforms.ts` (8 platforms) —
  footer, social block, icons, `applyBrand`, the brand form, and the PDF all read it.
- **Outlook**: SVG icons render as text — use the established fallback.
