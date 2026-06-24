# Project Marketing Hub — v2 Design Spec

**Date:** 2026-06-24
**Status:** Approved design → ready for implementation plan
**Supersedes:** `c:\Users\ethan\.claude\plans\greedy-soaring-fog.md` (v1 "Marketing Hub" plan — see _Why v1 was rejected_)

---

## Goal

Turn the per-project workspace into a **property-level marketing materials library**: a
template-first hub where a real-estate agent starts a branded email or report from a
template, the AI fills it with real lake data, and every saved piece lives as a scannable,
versioned library entry. Block-canvas emails are stored as `deliverables` rows so they
inherit the existing versioning, soft-delete, and library machinery.

The north star for this build: **"AI does most of the work, and it's dead simple for a
non-power-user."** Where v1 added chrome and new mechanisms, v2 reuses what already exists
and removes friction.

---

## Why v1 was rejected (audit summary)

The v1 plan (`greedy-soaring-fog.md`) was authored against a remembered repo, not the real
one. A four-scout code audit (2026-06-24) found it would fail to compile on Task 1 and never
recover. The load-bearing errors v2 must NOT repeat:

1. **Wrong Supabase client everywhere.** v1 imports `createCookieClient` from
   `@/lib/supabase/server` — neither exists. Real: `createClient(await cookies())` from
   `@/utils/supabase/server` (RLS) + `createServiceRoleClient` from
   `@/utils/supabase/service-role` (writes). Pattern in `app/api/projects/[id]/build/route.ts:3-4`.
2. **Every write would be rejected by RLS.** `deliverables` has **only** a public SELECT
   policy and grants `authenticated` SELECT-only (`docs/sql/20260613_deliverables.sql:37,40-41`).
   There is **no owner INSERT/UPDATE policy.** Writes must mirror the build route: prove
   ownership on the cookie client, then **write via service-role** (`build/route.ts:18-20,65`).
3. **`nanoid` is not a dependency** (`schema.ts:36` says so explicitly). Use `crypto.randomUUID()`.
4. **`exec_summary` is not a column** — it lives inside `narrative` JSONB and is derived in
   code (`page.tsx:158`). SELECTs naming it as a column throw.
5. **`scope` must be `{kind, value}`, not a string.** `/api/email-lab/ai` reads `scope.kind`/
   `scope.value` (`ai/route.ts:16,168`); a string injects **zero** lake data → the AI
   "refresh" refreshes nothing.
6. **The AI route returns HTTP 200 with `applied:false`** and the *unchanged* doc on a failed
   patch (`ai/route.ts:123-142`). Callers must check `applied === true`, not just `res.ok`,
   or they fork/persist a byte-identical "refreshed" row and report success.
7. **Adding `"block-canvas"` to `TemplateId` reddens the build** via the exhaustive
   `const _exhaustive: never = template` in `buildRenderModel` (`lib/deliverable/templates.ts:435`)
   unless a matching `case` is added in the same commit.
8. **Prop mismatches that won't compile:** `EmailLabShell` needs `brandTokens` (not `branding`),
   has no `projectId` prop, and `headerSlot` is **required**. `DeliverableLanes` is a 12-prop
   component, not a one-prop one. `runBuild` returns `void` and `window.location.assign()`s on
   success (`ProjectWorkspace.tsx:287`), so v1's "after build, refresh + suggest" is dead code.
9. **Wrong seeds path.** `@/lib/email/seeds` doesn't exist — it's `@/lib/email/doc/default-docs`.

These are recorded so the plan inherits evidence, not guesses (RULE 0.4).

---

## Locked design decisions (this session)

1. **Full reframe** — template-first create rail + list-default library + version-collapse,
   not the v1 grid-of-cards.
2. **Scheduler block-canvas lane → its own spec.** Deferred. The real scheduler is a
   `ProcessDeps.buildContent(row) => Promise<{subject,body,...}>` method with a *separate*
   `renderHtml` dep (`lib/email/scheduler.ts:137-159`); it cannot return `html` or `null`.
   That redesign does not belong in v2.
3. **FilingSidebar + post-build AI-suggestion banner → cut.** A material lives in the project
   it's created in. Removes the riskiest auth (cross-project refile) and the worst UX pattern
   (a 15s auto-dismiss on an *actionable* prompt).
4. **AI "new material" = steerable intent line.** "What's this for?" → AI picks the best-fit
   template and fills it. Replaces "AI, surprise me" (randomness erodes trust for novices).
5. **Asset bridge = photos only.** Connect the lab to the project's filed photos via a
   promote-on-use public bucket. Charts-in-email is deferred to its own spec.

---

## Verified codebase facts (build on these, don't re-derive)

**Versioning is already the data model.** `lib/deliverable/version-split.ts`
`splitDeliverableVersions(rows)` returns `{ heads: (T & { versions: T[] })[], trashed }`,
pure + cycle-guarded, newest-first. `page.tsx:163` already calls it; the Built lane already
shows heads only. `DeliverableRow.versions?` exists (`workspace/types.ts:51`). The repo's edit
contract is literally "cosmetic-only updates in place; content change forks a new gated
version" (`workspace/types.ts:4-14`). **Version-collapse is just surfacing `.versions`.**

**The template rail already exists.** `lib/email/doc/default-docs.ts` exports `SEED_DOCS`
(6 named seeds: `market-spotlight`, `just-sold`, `market-letter`, `listing-feature`,
`welcome`, `minimal`), each `{ id, name, description, build(): EmailDoc }`, plus `seedById(id)`
and `defaultDoc()`. The lab already has a "Start from" picker over these.

**EmailDoc contract.** `lib/email/doc/types.ts` + `lib/email/doc/schema.ts`.
`globalStyle = { primaryColor, accentColor, fontFamily, textColor, backdropColor }`;
`fontFamily ∈ {MODERN_SANS, BOOK_SERIF, GEOMETRIC_SANS}`; `blocks = z.array(Block).min(1).max(20)`;
block `id` is optional on input and minted by a transform. Block types:
`header, hero, stats, signal, text, image, agent-card, button, divider, footer`. The `image`
block holds `{ url, alt, caption }` (URL only — no upload). Styling/identity/URL fields are
**user-owned and sticky**; the AI can never write them (`ContentPatchSchema` `strictObject`).

**AI + render routes (no auth on either).**
- `POST /api/email-lab/ai` accepts `{ prompt, doc, currentTokens, scope: {kind?, value?} }`,
  fetches lake context via `fetchLakeContext(scope)` → `/api/b/master?view=speak&tier=1`,
  patches **content only** (`ContentPatchSchema`), and returns `{ doc, applied, patch }` or
  `{ doc, applied:false, message }` — **always HTTP 200**. Model: `claude-haiku-4-5`.
- `POST /api/email-lab/render` accepts `{ doc }`, returns `{ html }` (via `EmailDocEmail`).

**`deliverables` table** (`docs/sql/20260613_deliverables.sql` + scope/soft-delete migrations):
`id (text PK), project_id (text NOT NULL), user_id (uuid NOT NULL), template (text NOT NULL),
instruction, narrative (jsonb NOT NULL), items_snapshot (jsonb NOT NULL), branding (jsonb),
status (text NOT NULL DEFAULT 'ready'), created_at, is_example, scope_kind, scope_value,
deleted_at, supersedes_id`. Column is `template` (NOT `template_id`). No `doc`/`data_as_of` yet.

**Project items + photos.** `lib/project/items.ts` — discriminated union: `qa, chart, metric,
source, note, report, file, table_slice, frame`. A photo is a `file` item with an image mime,
`storage_path` in the **private** `project-uploads` bucket. Display URLs are **1-hour signed**
(`lib/project/signed-upload-url.ts`, `UPLOADS_BUCKET="project-uploads"`). The repo's durable
public-image pattern is `lib/social/media-upload.ts` (`SOCIAL_MEDIA_BUCKET="social-media"`,
public, `getPublicUrl`, idempotent `upsert`).

**Workspace wiring.**
- `app/project/[id]/page.tsx`: deliverables SELECT is an **explicit column list** via
  `selectAllPaged` (≈ `136-145`); a field-by-field `.map()` projection (≈ `147-160`) builds
  `DeliverableRow` and currently copies neither `doc` nor `data_as_of`; `splitDeliverableVersions`
  at `163`; `fileUrls` built via `signedUploadUrls` (`188`) and passed down (`253`).
- `ProjectWorkspace.tsx`: `runBuild()` returns `void`, navigates on success (`287`); deliverables
  arrive as prop `deliverables` (not `initialDeliverables`); `ItemsBoard`/`UploadDrop`/`BuildActions`
  each require several props (don't omit any).
- `DeliverableLanes.tsx`: 12 props, two lanes (Built + Emailing) + a `DeliverableModal`.
- `projects.ui_state` is an additive `ProjectUiState` jsonb bag (`workspace/types.ts:78-88`).

---

## Architecture

Block-canvas emails are stored as `deliverables` rows with `template='block-canvas'` and a
populated `doc` (+ `data_as_of`). All other templates are untouched. Because they are
deliverable rows, emails automatically get: version lineage (`supersedes_id` +
`splitDeliverableVersions`), soft-delete, the project SELECT, and the library surface.

```
deliverables row
├── template='block-canvas'  → doc (EmailDoc) non-null, narrative/items_snapshot = stubs
└── template= anything else  → narrative + items_snapshot (unchanged), doc null
```

**Global invariants**
- `template='block-canvas'` ⇒ `doc` non-null; all other templates ⇒ `doc` null.
- `data_as_of` set on every create/refresh; drives "needs update" at age > 30 days.
- **Two distinct write paths, deliberately different:**
  - **Manual Save** (the agent editing their own design in the lab — typo fixes, recolors,
    adding/reordering blocks) → **PATCH in place**, no new version. You don't want a new
    version every keystroke.
  - **Update Data (↻)** (AI re-pulls the latest lake numbers into the same design) → **forks a
    new version** (`supersedes_id`) with a fresh `data_as_of`. `splitDeliverableVersions`
    collapses the chain so the library shows one living entry ("Updated N×"), not sprawl.
- All `deliverables` writes go through **service-role after a cookie-client ownership check.**
- IDs via `crypto.randomUUID()`.
- AI refresh passes `scope` as `{ kind, value }` and persists only when `applied === true`.
- `bunx next build` stays clean after every task.

---

## Surfaces

### 1. The hub (replaces the Built lane)

Rendered in `ProjectWorkspace`, three stacked regions in order:

**A. Create rail (top — visual cards; heterogeneous, so cards earn their keep)**
- **Steerable intent line:** a single "What's this for?" input (e.g. "just listed 123 Gulf
  Blvd", "April market update") → `POST /api/projects/[id]/ai-material` → AI picks the
  best-fit `SEED_DOCS` template, fills it from lake data, saves a block-canvas material,
  opens the email-lab on it.
- **Email starter cards:** the 6 `SEED_DOCS` (name + description) → open
  `/project/[id]/email-lab?seed=<id>` (or no param for default), seeded, unsaved until Save.
- **Report templates:** the existing report templates → existing `/api/projects/[id]/build`
  flow, unchanged (still navigates to `/p/[id]`).

**B. Library (below — list by default)**
- A scannable list: columns **Name · Format · Status · Data as of · Actions**.
- Shows **both** report deliverables and block-canvas emails (the unified materials library).
- Optional grid toggle (cards), but **list is the default** (cards scan poorly for
  homogeneous items).
- Heads only (via `splitDeliverableVersions`); a head with `.versions.length > 0` shows
  "Updated N×", expandable to the chain.
- Row/card click: block-canvas → `/project/[id]/email-lab?did=<id>`; report → `/p/[id]`.
- Per-row actions: **Edit** (open), **Update Data (↻)**, **Trash** (existing soft-delete).

**C. Filed data (below the library)**
- `ItemsBoard` + `UploadDrop`, wrapped in a disclosure whose open/closed state is **remembered
  in `projects.ui_state`** (a new additive key, e.g. `materials_filed_collapsed`), not a magic
  count threshold.

### 2. Cards / rows (quieter than v1)

- **One** persistent format badge (email / overview / one-pager / BOV / digest / social).
- **Status only when actionable:** an amber "Update" affordance when `data_as_of` age > 30d.
  (No "scheduled" status in v2 — the scheduler is deferred.)
- **Title derived** from the doc headline (`hero.label` → `hero.value` → `header.tagline`),
  fallback `"{format} · {Mon YYYY}"`. No new column, no rename UI in v2. (For report rows,
  keep the existing `narrative.exec_summary`-derived title.)
- **No live-iframe thumbnails.** Block-canvas entries show headline text + a small brand-color
  swatch from `doc.globalStyle` — cheap, matches the existing report thumbnail approach
  (`exec_summary` + `preview_chart`). The full preview is the editor itself.

### 3. Email-lab save / load

- `EmailLabShell` is **shared** by two live clients — the standalone `app/email-lab/EmailLabClient.tsx`
  (no project) and the project-scoped `ProjectEmailLabClient.tsx`. **Every addition here must be
  optional/conditional** so the standalone client compiles and behaves unchanged:
  - add `onSave?: (doc: EmailDoc) => Promise<void>` + `saving?: boolean`; render the **Save**
    button (toolbar, next to Export/PDF/Copy) **only when `onSave` is provided**. Current doc is
    already in scope as `doc = history.present`.
  - add an optional `projectPhotos?` prop (filed image items + signed display URLs); render the
    **"Photos" panel only when `projectPhotos` is provided**. Standalone lab: no Photos panel.
  - **Keep the existing "Classic templates" rail** (the 22 legacy preview-only templates) — a
    locked "no silent capability loss" principle; the 5 structural templates have no block
    equivalent.
- `ProjectEmailLabClient`: **keep** `brandTokens`/`headerSlot`/`autoGenerate`/`initialAiPrompt`/
  `aiPlaceholder` (v1's rewrite dropped them and the brand bridge). Add: when `?did=<id>` (or
  `?seed=<id>`) is present, seed `initialDoc` accordingly; wire `onSave` → POST (first save) or
  PATCH (subsequent), reflect the saved id into the URL; pass `projectPhotos`.
  - **CRITICAL:** set `autoGenerate = !did`. The component currently hardcodes `autoGenerate=true`
    and would immediately AI-overwrite a loaded saved doc. Auto-generate only for a fresh/seed
    canvas, **never** when loading an existing material via `?did`.
- `page.tsx` (email-lab): read async `searchParams.did` / `searchParams.seed`; for `did`, load
  the deliverable's `doc` server-side (block-canvas only) and pass it as `initialDoc`; load the
  project's image `file` items + signed URLs and pass as `projectPhotos`. Continue using
  `createClient(cookieStore)` from `@/utils/supabase/server`.

### 4. Photos bridge

- **New public bucket `email-media`** — idempotent SQL migration mirroring
  `docs/sql/20260620_social_media_bucket.sql`. Public read.
- **Left-panel "Photos" state** in `EmailLabShell` (alongside Fill with AI / Brand / Start from
  / Classic). Lists the project's filed image `file` items as thumbnails (using the existing
  1-hour signed display URLs — expiry is fine for a picker).
- **Two actions:**
  1. **Use a filed photo** → `POST /api/projects/[id]/email-media { storage_path }` →
     service-role **native cross-bucket copy** (verified below) from private `project-uploads`
     to public `email-media`, then `getPublicUrl` → set the selected (or newly inserted)
     `image` block's `url`.
  2. **Upload new** → file picker → upload straight to `email-media` (public) → `getPublicUrl`
     → set the block's `url`. (This also gives the lab the image upload it currently lacks.)
- **VERIFIED in-session (crawl4ai, 2026-06-24) — vendor surface, do not re-derive:**
  `@supabase/storage-js@2.106.1` is installed (per `bun.lock`), which supports a native
  cross-bucket copy via the `DestinationOptions.destinationBucket` option (the public docs
  *prose* still says "same bucket," but the option is real in this version). So the copy is one
  call, no byte round-trip:
  ```js
  // service-role client (bypasses Storage RLS), server-side only
  await admin.storage.from("project-uploads")
    .copy(storage_path, storage_path, { destinationBucket: "email-media" });
  const { data } = admin.storage.from("email-media").getPublicUrl(storage_path);
  ```
  Use `copy` (private original stays). If a future bump drops below storage-js ~2.7, this
  silently copies within the source bucket — pin/guard the version.
- The stored `image.url` is a **durable public URL** → renders in preview AND survives a sent
  email. Only photos the agent chooses to email are promoted to public (privacy-respecting).
- The lab is already project-scoped, so `page.tsx` passes the project's image `file` items
  (+ their signed display URLs) into `ProjectEmailLabClient` → `EmailLabShell`.

---

## Visual design (resolves audit gaps 1–6 — decide here, not in Task 8)

**Palette is the existing app system, not a new identity:** base `#0d1e2b` (deep navy), panels
`#0d1e2b`/60–80, hairlines `white/8`, text `white/85`, muted `white/35–50`, one accent
`#1BB8C9` (teal). No new fonts — reuse the app's type scale (this is an existing product
surface). **Spend the boldness in ONE place: the intent line.** Teal appears only on the intent
line, primary actions, and active/focus states; everything else is greyscale-on-navy. Structural
devices encode truth, not decoration: "Updated N×" is a real version count, the format badge is
the real output type — no 01/02/03 numbering (the library is not a sequence).

**Gap 1 — Hierarchy via three distinct treatments** (action → manage → archive, top to bottom):
- **Create rail** = elevated *doing* surface: a raised panel (`bg-[#0d1e2b]/70`, 1px top border
  `#1BB8C9`/30, `rounded-xl`, generous padding). The most prominent thing on the page.
- **Library** = calm *management* surface: no panel, sits on the base; a quiet header
  "Materials · N" (`white/50`, uppercase, tracked); rows divided by `white/8` hairlines; tight
  density.
- **Filed data** = recessed *filing* surface: a `<details>` with a muted `white/35` summary, no
  background, clearly tertiary.

**Gap 2 — The intent line (hero moment, fully specified):**
- One wide input, the only teal glow on the page: `✦` leading glyph, `focus:ring-2
  ring-[#1BB8C9]/40`, placeholder `What's this for? — e.g. "just listed 123 Gulf Blvd" or
  "April market update"`.
- On submit it does **not** navigate immediately — it transforms in place into a text-led 2-step
  progress strip (reduced-motion safe): "Picking a template…" → "Filling in your numbers…".
- **Success:** strip shows "Built a {Template Name} ✓" for ~1s (names the choice → trust, not a
  black box), then navigates to the lab with the new material loaded.
- **Failure / no confident pick:** stays on the hub; strip becomes "Couldn't build that one
  automatically — pick a starter below," and the template chips get a one-pulse teal outline.
  Never a dead end (mirrors the codebase's no-404 resolver philosophy).

**Gap 3 — Version timeline = inline accordion (not a popover):** a head row with
`.versions.length > 0` shows a right-aligned "Updated N× ⌄" (`white/40`). Click expands the row
downward into indented, recessed sub-rows (older versions, newest-first): smaller `white/40`
text, a 1px left connector, ~24px indent, each with date + Open + Trash. Stays in the list flow
(touch-friendly, consistent with `ItemsBoard`'s grouped sections). It's a real `<button aria-expanded>`.

**Gap 4 — Material identity swatch (zero render cost):** list row gets a **4px left edge bar**,
full height, colored `doc.globalStyle.accentColor` (the brand pop; `primaryColor` is the dark
base). Grid card (optional view): a thin top bar in `accentColor` over the headline + badge.
Report rows (no `doc`) use their format-badge color for the bar.

**Gap 5 — Photos panel:** a 2-column grid of ~72px square thumbnails (`white/8` border,
`rounded-md`); the first cell is a dashed "＋ Upload" tile (the lab's missing upload). Hover/
selected = 2px teal ring. Click: if an `image` block is selected → set its `url`; else → insert
a new `image` block at the end with that photo. ~6 visible then scroll. Empty: "No photos yet —
upload one, or add photos to this project." Renders only when `projectPhotos` is provided
(hidden in the standalone lab). Tiles are buttons with alt text.

**Gap 6 — Empty states (guided, never dead):**
- **Library empty** → not "No materials yet." Instead: "Start your first piece — describe it
  above, or pick a template." (`white/40`, centered in a dashed `white/10` panel — an upward
  nudge to the create rail).
- **Photos empty** → as Gap 5.
- **Report templates** are code-defined (never empty); if absent, the intent line stands alone.

**Accessibility floor:** visible keyboard focus (teal ring) on intent line, template chips,
rows, and photo tiles; progress strip is text (reduced-motion respected); accordion is a real
button with `aria-expanded`.

---

## Data & API

### Migrations
- `ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS doc JSONB;`
- `ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS data_as_of TIMESTAMPTZ;`
- Public `email-media` storage bucket (idempotent, modeled on `20260620_social_media_bucket.sql`).
- Run via psql (creds in `.dlt/secrets.toml`); verify columns + bucket after.

### Routes (all under `app/api/projects/[id]/...`, async `params: Promise<{id}>`)
- `materials/route.ts` — `POST` (save new block-canvas, validate with `EmailDocSchema`, write
  via service-role) + `PATCH` (manual Save: update an existing block-canvas `doc` in place —
  cosmetic; the data-refresh fork lives in the `refresh` route). No `GET` (see note below).
- `materials/[did]/refresh/route.ts` — `POST`: load the deliverable; for block-canvas, call the
  AI route with `scope={kind,value}` + `mode:"refresh"`, **require `applied===true`**, validate,
  insert a new row with `supersedes_id` (service-role). For report templates, delegate to the
  existing `/api/deliverables/[did]/refresh`.
- `ai-material/route.ts` — `POST { intent }`: AI picks a `SEED_DOCS` template for the intent,
  fills it via the AI route (`scope`, `applied` checks), saves a block-canvas material, returns
  `{ id }`.
- `email-media/route.ts` — `POST { storage_path }`: ownership-check on the cookie client, then
  service-role `copy(path, path, { destinationBucket: "email-media" })` + `getPublicUrl`, return
  `{ url }`. A `PUT` (multipart) variant handles "upload new" → straight to `email-media`.

> **GET `/materials` is NOT load-bearing.** The hub renders from server props — `page.tsx`
> already loads all deliverables via `selectAllPaged`. After any mutation (save / refresh /
> new-material / photo insert) the client calls `router.refresh()` to re-run the server
> component, which is the single source of truth. No client-side `GET /materials` is added in
> v2 (re-fetching would duplicate the server query). Mutations return `{ id }` only as an ack.

### Stub shape for block-canvas inserts
`narrative` and `items_snapshot` are NOT NULL. For block-canvas rows insert
`narrative: { exec_summary:"", sections:[], inference_notes:[] }`, `items_snapshot: []`,
`status:"ready"`, plus `doc`, `data_as_of`, `template:"block-canvas"`.

### Status / badge (pure, tested)
`lib/deliverable/material-status.ts` (+ test):
- `getMaterialStatus(d, schedules)` → `archived` (deleted_at) | `needs_update` (data_as_of age
  > 30d) | `draft`. (No `scheduled`/`sent` in v2.)
- `getFormatBadge(template)` → `{ label, color, bg }` for each template id.

### Type / build changes
- `lib/deliverable/templates.ts`: add `"block-canvas"` to `TemplateId` **and** a
  `case "block-canvas"` in `buildRenderModel` that `throw`s like the `"email"` case
  (block-canvas renders via `EmailDocEmail`, never `buildRenderModel`).
- `workspace/types.ts`: add `doc: EmailDoc | null` (`import("@/lib/email/doc/types").EmailDoc`)
  and `data_as_of: string | null` to `DeliverableRow`.
- `page.tsx`: add `doc, data_as_of` to **both** the deliverables SELECT list **and** the
  `.map()` projection.
- `DeliverableLanes.tsx`: strip the Built lane (now the library's job) and keep the Emailing
  ("Scheduled sends") lane. This is a real refactor, not a one-line removal — remove the
  orphaned `DeliverableModal` + deliverable-mutation handlers and shrink the prop interface to
  what the schedules lane needs. **The lane keeps its existing `emailSchedules.length > 0`
  guard — when there are no schedules (the common case in v2, since the scheduler is deferred)
  it renders nothing. No "no scheduled sends" empty state ships until the scheduler spec lands.**

---

## Out of scope (deferred to their own specs)

- **Scheduler block-canvas send lane** — built on the real `ProcessDeps.buildContent`/
  `renderHtml` split; register `block-canvas` in `EMAIL_TEMPLATES` + `renderHtml`.
- **Charts-in-email** — needs a chart-to-image pipeline; charts can only ride in as a
  pre-rendered `image` today.
- **Cut entirely:** FilingSidebar, cross-project refile, AI-suggestion banner, "AI surprise me".

---

## Acceptance criteria

1. A block-canvas email saves to `deliverables` (`POST /materials` → 201 `{id}`) and reloads
   via `/project/[id]/email-lab?did=<id>`.
2. The hub renders above the filed-data board: Create rail (intent line + 6 seed cards + report
   templates) over a list-default Library over a remembered-collapse filed-data disclosure.
3. The Library lists both reports and emails with one format badge each; an amber "Update"
   appears only when `data_as_of` age > 30d.
4. "Update Data (↻)" forks a new version; the library still shows one living entry with
   "Updated N×"; the AI refresh only persists when `applied === true` and injects lake data via
   `scope={kind,value}`.
5. Photos bridge: a filed project photo can be inserted into an `image` block and the stored
   `url` is a durable public `email-media` URL that renders in preview and survives a sent email.
   A new photo can be uploaded from the lab.
6. All `deliverables` writes succeed at runtime (service-role after ownership check), no
   `nanoid`, correct Supabase + seeds imports.
7. Loading a saved material via `?did` does NOT auto-overwrite it (`autoGenerate = !did`); the
   standalone `/email-lab` (no project) compiles and behaves unchanged (no Save button, no
   Photos panel).
8. `bun test` green (new pure-logic tests pass) and `bunx next build` clean.

## Risks

- **`email-media` bucket** — RESOLVED: public bucket via SQL (mirror `20260620_social_media_bucket.sql`);
  native cross-bucket copy verified on the installed `@supabase/storage-js@2.106.1` (see Photos
  bridge). Residual: guard the storage-js version so a downgrade can't silently break the copy.
- **DeliverableLanes refactor** is larger than it looks (modal + handlers orphaned).
- **`runBuild` navigation** — do NOT bolt post-build logic onto `runBuild` (it navigates away);
  the email path saves via `/materials` and refreshes the hub via `router.refresh()` instead.
- **AI fill quality** — the intent-line template pick is heuristic; acceptable to start simple
  (keyword → seed) and improve, since the no-invention gate protects correctness regardless.
- **Pre-existing, not introduced by v2 — flag for verification:** email-lab drag-to-reorder
  (@dnd-kit, deps verified clean on React 19) is **unproven at runtime under React 19
  StrictMode** — it needs a real-browser drag, not a headless check. v2 depends on the playground
  working, so add a manual browser verification step (drag a block, confirm reorder + the
  canvas paints). Not a v2 code change; a confidence gate.

## Task outline (≈9 — full breakdown belongs to the implementation plan)

Model column: **Opus** where correctness is expensive or judgment is required (auth, DB +
build traps, shared-component integration, refactors). **Sonnet** where the spec is precise and
the work is bounded (pure logic + tests, a single route on a verified contract, UI built to the
design section).

| # | Task | Model | Why |
|---|------|-------|-----|
| 1 | Migrations (deliverables cols + public `email-media` bucket) + `TemplateId`/`buildRenderModel` case + `DeliverableRow` type + `page.tsx` SELECT & `.map()` | **Opus** | Foundation; DB migration + the exhaustive-`never` trap + the easy-to-miss `.map()` projection across files. A miss breaks the build or silently drops columns. |
| 2 | Materials API (POST + PATCH; no GET) — service-role writes, crypto IDs, correct imports | **Opus** | Auth correctness — this is exactly where v1 failed (RLS-rejected writes). Service-role-after-ownership must be exact. |
| 3 | Update Data / refresh API — `scope={kind,value}`, `applied===true`, version fork | **Opus** | The silent-stale-content guards (`applied`, scope object) and `supersedes_id` lineage are subtle correctness. |
| 4 | AI new-material (steerable intent → seed pick + fill) API | **Sonnet** | Reuses the Task 3 AI-orchestration pattern; bounded; the no-invention gate protects correctness. |
| 5 | Email-lab save/load — `EmailLabShell` optional `onSave`/Save button; `ProjectEmailLabClient` (`autoGenerate = !did`); `?did`/`?seed`; standalone lab unaffected | **Opus** | Shared-component integration + brand-bridge preservation + the autoGenerate trap — v1's worst breakage zone. |
| 6 | Material status/badge pure logic + tests | **Sonnet** | Pure functions, fully specified, test-first. Classic bounded task. |
| 7 | Photos bridge — `email-media` route (native cross-bucket copy) + lab "Photos" panel + upload | **Sonnet** | Copy mechanism verified, panel designed in the Visual section; small route + specified UI. |
| 8 | Hub UI — Create rail + list-default Library + version-timeline accordion + swatch identity. **Build to the Visual design section — those are decisions, not guesses.** | **Sonnet** | Large but mechanical given the design section. (Opus optional if you want the intent-line hero interaction extra-polished.) |
| 9 | Wire `ProjectWorkspace` (mutations → `router.refresh()`, NOT bolted onto `runBuild`) + refactor `DeliverableLanes` to schedules-only + `ui_state` collapse | **Opus** | The `DeliverableLanes` refactor orphans the modal + handlers; `runBuild` navigates away. Refactor judgment + integration. |

## Execution strategy (sequential with gates — NOT a parallel fan-out)

This is a **dependency chain with shared files**, so do it task-by-task with a `bun test` +
`bunx next build` gate after each — `superpowers:executing-plans`, not a Workflow fan-out. The
fan-out work (the audit + the vendor verification) is already done.

**Dependency order:** `1` → (`2`, `3`, `6` can follow once `1` lands) → `4` (after `3`) →
`5` (after `2`) → `7` (after `1`+`5`) → `8` (after `2`/`3`/`6`) → `9` (last, after `8`).

**File-overlap groups — never edit these in parallel:**
- `app/project/[id]/page.tsx` → Task 1 **and** Task 9.
- `components/email-lab/EmailLabShell.tsx` → Task 5 **and** Task 7.
- `app/project/[id]/ProjectWorkspace.tsx` → Task 9 (and read by 8).

**Safe-parallel batch (optional, only for speed):** after Task 1 is committed, Tasks **3, 6**
(and **2**) touch disjoint new files and can run concurrently in **separate worktrees**
(`node scripts/worktree.mjs new <label>`). Everything else is sequential. If unsure, just go
one at a time — the gates are the point.
