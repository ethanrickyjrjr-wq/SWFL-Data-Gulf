# Author Layout Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-03-author-layout-recipes-design.md` · **Check:** `author_layout_recipes_live_verify` (stays open until operator live-send)

**Goal:** The AUTHOR engine produces designed-looking emails (not flat card stacks) via three recipe families, semantic layout fields, and an id-selected media library — with every existing moat guarantee unchanged.

**Architecture:** Recipes are advisory prose sections appended to `authorSystem` (deterministic keyword detection, zero digits so the prose lint never fires). Layout fields are semantic (`band`/`pad`/`overlay_*`) — the engine resolves them to existing persisted props (`sectionBg`/`paddingY`/`overlayTitle`); the model never writes a URL, hex, or pixel. Assets mirror the figure-menu moat: id-selected from a menu, resolved at assembly, unknown id drops the block.

**Tech stack:** TypeScript/Next.js, zod, bun:test, sharp, Supabase (storage bucket `email-media` + new RLS table), Pexels API.

## Global constraints (from spec + repo rules)

- All existing guarantees unchanged: figure id-selection, prose lint + recorded-claim guard, brand applied after assembly (client-side `applyBrand`), CAN-SPAM footer re-add, 20-block cap, `capabilities.ts` stays the ONE tier root.
- Recipe text contains **zero digits** — test-enforced (`/\d/` must not match any recipe string).
- Recipes are **advisory** — nothing enforced, no new gate (RULE C2).
- Overlay clamps: `overlay_title` ≤80 chars, `overlay_body` ≤200 (authored side; persisted `ImageProps` allows 120/300 — authored is stricter, fine).
- `pad` mapping: `airy→"lg"`, `normal→"md"`, `tight→"sm"` (existing `PaddingSize`).
- `band` resolution: `light→surfaceColor ?? "#ffffff"`, `dark→surfaceDarkColor ?? primaryColor`, `accent→accentColor` — read from the doc's `globalStyle` at assembly.
- `list` block: optional title + up to 8 items `{lead?, text}`, email-safe table rows, authorable.
- Multi-column authored columns: max 3, `{heading, body, link_label?, asset?}`.
- Pexels: `Authorization: <key>` header (no Bearer), key `PEXELS_API_KEY` via `gh secret set` FIRST then env wiring (pre-push gate 3), server-side only. Attribution "Photo by X on Pexels" rides caption/sources. No build-time auto-Pexels in v1 (operator cut).
- No icon-stats, no canvas/layer editing, no change to stats 3-cell cap.
- Migration idempotent, run via `bun scripts/run-migration.ts` (Bun.SQL, creds `.dlt/secrets.toml`), then `bun run gen:types` (typed client — phantom columns are compile errors).
- Runner is **bun:test**. Verify bar: `bunx next build` + full `lib/email` suite. Never bare `npx tsc`.
- Commit per task; **push only with operator confirmation** (memory: no autonomous push).

## Corrections to the spec (found in exploration)

1. **Build order reordered**: spec says recipes first, but recipe prose references `list` blocks and overlay fields — the block vocabulary is derived from `DEFAULT_BLOCK_PROPS`, so a recipe naming a nonexistent block would have the model emitting unknown types that get dropped. **Layout power-up lands first (Phase A), recipes second (Phase B).**
2. **"capabilities routing both" is a no-op for blocks**: `lib/email/lab/capabilities.ts` routes FEATURES and FONTS only — block types are not tier-gated. Both engines reuse `BlockRenderer`, so `list` reaches both tiers automatically. Nothing to add there (`capabilities.test.ts` unaffected).
3. **`PUT /api/email-lab/media` already exists** (`app/api/email-lab/media/route.ts`, multipart → `email-media` bucket, returns `{url}`). Phase C extends it (DB row + derivative) rather than creating it.
4. **onDark is computed at render time**, not persisted: each affected block component derives `onDark = relativeLuminance(resolvedBg) < threshold` from its own `sectionBg` (reusing `lib/charts/palette.ts`). No new persisted prop, no drift when the user later edits `sectionBg` by hand, covers all sources of dark backgrounds. (Spec's "sets an onDark render flag" is satisfied as a render-time flag.)
5. **PDF engine gaps stay as-is**: PDF already ignores `sectionBg`/`paddingY`/overlays (pre-existing). The `list` block gets a PDF case (forced by the `never` exhaustiveness guard in `email-doc-pdf.tsx:664` + audit test); overlay/band PDF parity is out of scope — noted, not built.

---

## Phase A — Layout power-up

### Task A1: `list` block type (full 11-file checklist)

**Files:**
- Modify: `lib/email/doc/types.ts` (BlockType union :13-27, new `ListProps` extending `BlockBase`, `BlockPropsMap` entry :249)
- Modify: `lib/email/doc/schema.ts` (`ListPropsSchema` + `ListItemSchema`, discriminatedUnion :262-275)
- Modify: `lib/email/doc/default-docs.ts` (`DEFAULT_BLOCK_PROPS.list` — compile-forced by mapped type)
- Create: `lib/email/blocks/ListBlock.tsx`
- Modify: `lib/email/blocks/BlockRenderer.tsx` (switch case :26-57)
- Modify: `lib/pdf/email-doc-pdf.tsx` (`PdfBlock` case — `never` guard forces it)
- Modify: `components/email-lab/AddBlockPanel.tsx`, `components/email-lab/BlockInspector.tsx`, `components/email-lab/GridCanvas.tsx` (palette/inspector/canvas wiring — copy the multi-column entries from commit `7b0d4021`)
- Test: `lib/email/doc/schema.test.ts` (round-trip), `lib/pdf/__tests__/email-doc-pdf.test.ts` (add to FULL_DOC)

**Interfaces (produces):**
```ts
// types.ts
export interface ListItem { lead?: string; text: string }
export interface ListProps extends BlockBase { title?: string; items: ListItem[] }
// schema.ts: ListItemSchema lead max 24, text max 200; items .min(1).max(8); title max 120
```
`ListBlock.tsx`: email-safe `<table>` rows — optional `lead` in a left cell (accent color, 13px/700, whitespace-nowrap), `text` right (15px, textColor); `sectionBg`/`paddingY` via `sectionPad(props.paddingY)` like `TextBlock.tsx`. TDD: schema round-trip test first, then renderer `.toContain` asserts on `renderEmailDocHtml`, then PDF audit passes. Grid compile needs nothing (reuses BlockRenderer). Commit.

### Task A2: authored overlay + band + pad + multi-column + list fill

**Files:**
- Modify: `lib/email/author-doc.ts` — `AUTHOR_TOOL.input_schema` block properties (add `overlay_title`, `overlay_body`, `band` enum light/dark/accent, `pad` enum airy/normal/tight, `columns` array max 3 of `{heading, body, link_label, asset}`, `items` array max 8 of `{lead, text}`, `asset` string on image blocks); `AUTHOR_TOOL.description` gains one short LAYOUT paragraph naming the new semantic fields
- Modify: `lib/email/doc/schema.ts` — `AuthoredBlockSchema` (:372-396): `overlay_title: authoredText(80)`, `overlay_body: authoredText(200)`, `band: z.enum(["light","dark","accent"]).optional()`, `pad: z.enum(["airy","normal","tight"]).optional()`, `columns: z.array(AuthoredColumnSchema).max(3).optional()`, `items: z.array(AuthoredListItemSchema).max(8).optional()`, `asset: authoredText(8)`
- Modify: `lib/email/author-doc.ts` — assembly:
  - new pure `resolveBand(band, gs: EmailGlobalStyle): string | undefined` + `PAD_MAP = {airy:"lg", normal:"md", tight:"sm"}`; applied in `buildEntry` for every block whose props extend BlockBase (hero, stats, signal, text, image, listing, multi-column, list)
  - `applyContent` gains cases: `multi-column` (map authored `columns` → `MultiColumnColumn[]`: heading(120)/body(500)/linkLabel(40); `linkUrl` = a `defaultLinkUrl` opt threaded into `assembleAuthoredDoc` from `brandWebsiteUrl(currentDoc)` — model never writes URLs; no `defaultLinkUrl` → drop `link_label`), `list` (title + items, clamped)
  - image branch in `buildEntry` (:336-361) writes `overlayTitle`/`overlayBody` through to `chartImageBlock`/`heroPhotoBlock` props
- Modify: `lib/email/build-doc.ts` — pass `defaultLinkUrl: brandWebsiteUrl(currentDoc)` and `globalStyle` context into `assembleAuthoredDoc` call (:641 area). NOTE: `assembleAuthoredDoc` already receives the doc — verify what it has in scope; `globalStyle` passes through untouched today (:463-466), so `resolveBand` reads it there.
- Test: `lib/email/author-doc.test.ts` — band resolution (light/dark/accent + fallbacks), pad mapping, multi-column fill kills "Column one" placeholder, list assembly + 8-item clamp, overlay clamps (81-char title truncates to 80), authored `columns` with `link_label` but no defaultLinkUrl drops the link.

Both shapes (`AUTHOR_TOOL.input_schema` and `AuthoredBlockSchema`) are hand-maintained — every new field lands in BOTH in the same commit. TDD per field group. Commit.

### Task A3: onDark render flip + goldens

**Files:**
- Create: `lib/email/blocks/on-dark.ts` — `export function isDarkBg(bg?: string): boolean` reusing `relativeLuminance` from `@/lib/charts/palette` (threshold: `contrastRatio` vs white > vs dark ink, i.e. delegate to `readableLabel` semantics; export the resolved light-text colors)
- Modify: `lib/email/blocks/HeroBlock.tsx`, `SignalBlock.tsx`, `TextBlock.tsx`, `MultiColumnBlock.tsx`, `ListBlock.tsx` — when `isDarkBg(resolvedSectionBg)`, swap text/heading colors to light (`#ffffff` titles, `rgba(255,255,255,0.85)` body) instead of `gs.textColor`/`primaryColor`
- Test: golden-style asserts in `lib/email/render-email-doc.test.ts` pattern (new `lib/email/blocks/on-dark.test.ts` for the pure helper + render asserts): banded dark section renders light text, light band keeps dark text, overlay image renders scrim + title, list block renders lead/text rows

Dark-on-dark becomes unreachable: any `sectionBg` (band-resolved or hand-set) below the luminance threshold flips text. Commit.

---

## Phase B — Recipes

### Task B1: `lib/email/author-recipes.ts` (pure)

**Files:**
- Create: `lib/email/author-recipes.ts`
- Test: `lib/email/author-recipes.test.ts`

**Interfaces (produces):**
```ts
export type RecipeId =
  | "agent-intro" | "monthly-newsletter"
  | "editorial-letter" | "editorial-showcase" | "editorial-magazine";
export function detectRecipe(prompt: string): RecipeId | null;
export function recipeSection(id: RecipeId): string; // "RECIPE — <name>\n..." prose
```
Detection (case-insensitive, deterministic, first-match precedence editorial > monthly > welcome so "fancy welcome" goes editorial? NO — spec order: check welcome keywords, then monthly, then editorial family; sub-recipe letter/showcase by secondary keywords, default magazine-issue):
- agent-intro: `/\bwelcome\b|introduc|\bnew agent\b|\bmeet\b/`
- monthly-newsletter: `/\bmonthly\b|\bnewsletter\b|\bdigest\b/`
- editorial: `/\bfancy\b|\belegant\b|\beditorial\b|\bmagazine\b|\bluxury\b|\bletter\b/` → sub: `letter`→editorial-letter, `showcase|spotlight|feature`→editorial-showcase, else editorial-magazine
- no match → `null`

Recipe prose = ordered target structure + tone + short reason tags, compressed from the spec's research findings (§ Research), **zero digits** (write "under a hundred kilobytes" style if ever needed — better: no quantities at all). Each recipe ends with: footer with unsubscribe and postal address always renders (editorial-letter explicitly: text-only BY DESIGN but still commercial).

Tests: each keyword routes correctly, no-match → null, sub-recipe routing, and `for each recipe: expect(/\d/.test(text)).toBe(false)`. Commit.

### Task B2: wire recipes into `authorSystem`

**Files:**
- Modify: `lib/email/author-doc.ts` — `authorSystem` opts gain `recipe?: string`; `if (opts.recipe) parts.push(opts.recipe)` (`author-doc.ts:189-223`)
- Modify: `lib/email/build-doc.ts` — in `authorDoc` (:629-636): `const rid = detectRecipe(prompt); const recipe = rid ? recipeSection(rid) : undefined` → pass to `authorSystem`
- Test: `author-doc.test.ts` — `authorSystem({...opts, recipe})` output contains the RECIPE section; without recipe, output unchanged from today (no-match path is byte-identical).

Advisory only — no validation of the model's obedience. Commit.

---

## Phase C — Media library + asset menu

### Task C1: `email_media_assets` migration + types

**Files:**
- Create: `migrations/20260703_email_media_assets.sql` — clone the RLS template from `migrations/20260625_user_mls_connections.sql`:
  columns `id uuid PK gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `url text NOT NULL`, `kind text NOT NULL CHECK (kind IN ('upload','brand','pexels'))`, `label text NOT NULL DEFAULT ''`, `width int`, `height int`, `attribution jsonb` (photographer + pexels page URL), `created_at timestamptz DEFAULT now()`; ENABLE RLS + `users_own_media` FOR ALL TO authenticated USING/WITH CHECK `auth.uid() = user_id`; GRANT to service_role; `NOTIFY pgrst, 'reload schema';` — all idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS` first)
- Run: `bun scripts/run-migration.ts migrations/20260703_email_media_assets.sql`, verify with a `select count(*)`/table-exists probe
- Regenerate: `bun run gen:types` → `database-generated.types.ts` gains the table (typed client compiles)

Commit (migration file + regenerated types).

### Task C2: media routes — extend `app/api/email-lab/media/route.ts`

**Files:**
- Modify: `app/api/email-lab/media/route.ts` — PUT: after storage upload, run a sharp derivative (resize to max 1200px wide, `.jpeg({quality: ~78})`, targeting ≤100KB — reuse the `lib/media/listing-photo.ts` sharp pattern; read `width`/`height` from `sharp().metadata()`), insert `email_media_assets` row (`kind:'upload'`, label from filename), return `{url, id}`. Add GET (list caller's assets, newest first) + PATCH (`{id, label}` rename) + DELETE (`{id}` — delete row + storage object). Auth = canonical cookie-client pattern (`createClient(await cookies())` → `auth.getUser()` → 401), storage writes via `createServiceRoleClient()` under `${user.id}/lab/` keys, ownership enforced by RLS on the table + key-prefix check for storage deletes (mirror `app/api/projects/[id]/email-media/route.ts:25`).
- Create: pure helpers in `lib/email/media-assets.ts` (key builder, derivative opts, row→panel-item mapper) so bun:test covers them without live auth (pattern: `app/api/email-lab/social/__tests__/upload.test.ts`)
- Test: `lib/email/media-assets.test.ts`

Commit.

### Task C3: `lib/email/pexels.ts` + search proxy route

**Files:**
- Create: `lib/email/pexels.ts` — mirror `lib/listings/steadyapi.ts`: `const key = process.env.PEXELS_API_KEY` read at call time; `fetch("https://api.pexels.com/v1/search?query=...&per_page=...", { headers: { Authorization: key } })` (no Bearer); empty-tolerant (`no key / non-200 / bad body → []`, never throws); returns normalized `PexelsPhoto { id, url (large2x/large), width, height, alt, photographer, photographerUrl, pexelsUrl }`; pure `attributionCaption(p): string` → `Photo by ${photographer} on Pexels`
- Create: `app/api/email-lab/pexels/route.ts` — GET `?q=`, auth-gated (same cookie pattern), proxies `searchPexels`, returns `{photos}`; picking a photo = client POSTs to a small handler that inserts an `email_media_assets` row `kind:'pexels'` with attribution jsonb (fold into media route POST or the pexels route — one POST `{action:'pick', photo}` on `app/api/email-lab/media/route.ts` keeps media writes in one file)
- Env: **operator step** — `PEXELS_API_KEY` into Vercel env (+ `gh secret set` first per gate 3 if any workflow needs it) + `.env.example` line. Code is empty-tolerant, so the build works keyless (picker shows "no results").
- Test: `lib/email/pexels.test.ts` — response→normalized mapper (fixture JSON), attribution string, keyless → `[]`.

Commit.

### Task C4: MediaPanel UI

**Files:**
- Create: `components/email-lab/MediaPanel.tsx` — clone the shape of `components/email-lab/PhotosPanel.tsx` (accordion, grid tiles): tabs/sections "My library" (GET list; tile = image + label; rename inline; delete) and "Pexels search" (input → GET proxy → grid → pick inserts row + refreshes library); pick/apply sinks to the existing `applyPhotoUrl(url)` (`EmailLabShell.tsx:523`) extended to also set `caption` when attribution exists (Pexels picks)
- Modify: `components/email-lab/EmailLabShell.tsx` (+ `EmailLabGridShell.tsx` where PhotosPanel already mounts at :1333) — mount MediaPanel; also the non-blocking CAN-SPAM nudge (Task D2 does the nudge — here just mount the panel)
- Test: pure mapper already covered in C2; UI verified via `bunx next build` + manual lab pass (operator).

Commit.

### Task C5: ASSET MENU in the author

**Files:**
- Modify: `lib/email/author-doc.ts` — mirror the figure-menu pattern: `MenuAsset { id: string; asset: {url, label, kind, width?, height?, alt?, caption?} }`, `buildAssetMenu(assets): MenuAsset[]` (`a0, a1, …`), `renderAssetMenu(menu)` → lines like `[a0] "Dani headshot" · headshot · 600×600` (dimensions only when held — no invented numbers; label + kind always); `assetMenuById(menu)`. `authorSystem` opts gain `assetMenu?: MenuAsset[]` → pushes an ASSET MENU section (kept separate from DATA MENU). `buildEntry`: authored `asset: "aN"` on an image block resolves id→URL (props via a new `libraryImageBlock({url, alt, caption})` or reuse `heroPhotoBlock` shape); **unknown id → return null (block dropped)** — same for a multi-column column carrying `asset` (column's `imageUrl` set from resolution; unknown id drops that column). `image_role: "chart"|"photo"` auto-resolve keeps working untouched — `asset` takes precedence when both present.
- Modify: `lib/email/build-doc.ts` + `app/api/email-lab/ai/route.ts` — the ai route (has the auth user) fetches the caller's `email_media_assets` rows (typed client), threads them into `authorDoc` → `buildAssetMenu` → `authorSystem` + `assembleAuthoredDoc`.
- Modify: `AUTHOR_TOOL` description ASSETS paragraph: assets are id-selected from the ASSET MENU via `asset`; `image_role` still selects the auto-resolved chart/photo.
- Test: `author-doc.test.ts` — asset id resolves to URL, unknown `a99` drops the block (never a placeholder), column asset resolution, Pexels attribution caption rides through, menu renders label/kind and omits dimensions when unknown.

Commit.

---

## Phase D — Seeds + CAN-SPAM notes

### Task D1: two editorial seeds

**Files:**
- Modify: `lib/email/doc/default-docs.ts` — two new `SEED_DOCS` entries via the existing `SeedDoc` shape + `seedBlock` helpers:
  - `editorial-letter`: header → text (letter body placeholder) → agent-card → footer; globalStyle `displayFontFamily: "PLAYFAIR_SERIF"`, restrained palette, `paddingY:"lg"` on the text block
  - `magazine-issue`: header → image (overlay placeholder title) → multi-column (2 feature cards) → signal (accent band via `sectionBg`) → button → footer; `PLAYFAIR_SERIF` display, airy padding
  - Structure from recipes, style from seed — brand stays canonical (`applyBrand` still runs last and only touches globalStyle + token fields).
- Test: `doc/schema.test.ts`-style assert both seeds round-trip `EmailDocSchema` and appear in `SEED_DOCS`.

Commit.

### Task D2: CAN-SPAM postal-address nudge (no new gate)

**Files:**
- First verify: does `FooterProps` carry an address field? (Exploration didn't confirm — if absent, add `address?: string` to FooterProps/schema/footer renderer + `ADDRESS` brand token in `applyBrand`/`brandingToTokens`, following the existing footer token pattern at `EmailLabShell.tsx:98+`.)
- Modify: `components/email-lab/EmailLabShell.tsx` (+GridShell) — non-blocking nudge (small banner near send/footer inspector) when the footer address is empty: "Commercial email needs a postal address (CAN-SPAM) — add one in Brand."
- Modify: `lib/email/CLAUDE.md` — correct the CAN-SPAM note from three requirements to four (postal address), one line, no lecture (memory says the memory file was already corrected; the area CLAUDE.md still says 3).
- Recipes already state the footer always renders (B1).

Commit.

---

## Verification (whole build)

1. `bun test lib/email` — full suite green (author-doc, recipes, schema round-trip, renderer, capabilities, media/pexels helpers)
2. `bun test lib/pdf` — audit lock renders FULL_DOC incl. `list` to a real PDF
3. `bunx next build` — the Vercel-parity type gate (never bare tsc)
4. Manual lab pass (operator): author "welcome email" → recipe visible in structure; upload + Pexels pick → asset menu → authored email carries the picked image; dark band shows light text
5. Live-send evidence is operator-run — `author_layout_recipes_live_verify` stays open until then; close via `node scripts/check.mjs close author_layout_recipes_live_verify` only on live proof
6. SESSION_LOG entry + push only after operator confirmation

## Execution notes

- **Execution mode: inline** (superpowers:executing-plans — operator-chosen). Tasks executed in this session, batched by phase with a checkpoint after each phase for review.

- ~14 commits across 4 phases; phases are sequential (A before B — recipes name `list`/overlay; C1→C5 in order — menu needs table+routes), tasks within a phase mostly sequential.
- `PEXELS_API_KEY` provisioning is an operator step (C3) — code is empty-tolerant so nothing blocks on it.
- After approval, this plan is saved to `docs/superpowers/plans/2026-07-03-author-layout-recipes.md` per repo convention.
