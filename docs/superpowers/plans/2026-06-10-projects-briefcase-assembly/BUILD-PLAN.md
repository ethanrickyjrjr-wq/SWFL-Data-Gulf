# BUILD PLAN — Projects ("Briefcase") + Assembly Engine (single-file edition)

> **This one file contains everything** — index, audit + LittleBird verdicts, shared contracts, and all 10 sessions with every task inline. It is generated from the folder of the same name (`docs/superpowers/plans/2026-06-10-projects-briefcase-assembly/`); if you prefer one-task-per-file, that folder has it. Hand THIS file to a fresh Claude to start cold.

---

## ⛔ BUILD ISOLATION — read before scheduling any work

Some sessions are high-stakes enough that they must be built **SOLO — nothing else in flight, no parallel session landing commits.** This protects against (a) the merge/collision risk on shared files and (b) the parallel-session drift pattern that has re-flipped locked decisions here before.

**SOLO sessions (build with NOTHING else going on):**
- **Session 4 — projects + first RLS + first gated route.** A middleware regression can lock every public page; a wrong RLS leaks across users. Full attention, no parallel work.
- **Session 6 — assembly engine.** The moat. Anti-hallucination correctness (exact-anchor + grounded-conditional). A leak here breaks the structural guarantee.
- **Session 8 — uploads.** Storage RLS path-scoping is a leak vector; the only never-touched vendor surface.
- **Session 9 — MCP write tools.** Adds service-role writes onto a server that is OPEN in prod today. Security-critical; bearer gate must be live first.

**`middleware.ts` serialization (hard constraint):** Sessions **0, 4, and 6** all edit `middleware.ts` (cookie mint / `/project` gate / `/p/*` rate-limit). These must land **strictly sequentially — never two open at once.** Same for any hotfix that touches it.

**Everything else** respects the dependency graph below; don't start a session before its dependencies have shipped to `main` (later sessions consume the real surfaces earlier ones create).

**Diff-review gates (RULE 1 — pause for the operator before pushing):** S2 (`/api/converse`), S4 (`middleware.ts`), S6 (LLM build route + system prompt), S9 (MCP surface).

---

## How to execute

1. Read this file top-to-bottom once. Then pick your assigned session.
2. Each session is `## SESSION N — … [MODEL]`. Execute its tasks in order; each task is its own TDD-style unit (write test → fail → implement → pass → commit).
3. Code-fidelity note: Sessions 0–2 are coded in full (their surfaces are live today). Sessions 3–9 are interface/acceptance fidelity where they depend on unshipped upstream — when you execute one, its dependency is live, so freeze your own code against the real surface (run `superpowers:writing-plans` for that task if you want full TDD steps).
4. Ship per the per-session checklist: `SESSION_LOG.md` entry + reconcile `checks` + flip `build-queue.md` + `node scripts/safe-push.mjs`. **Stop and ask the operator before pushing** (standing decree).

---



# ===== FILE: README.md =====

# Projects ("Briefcase") + Assembly Engine — Master Index

> **For agentic workers:** This is a **multi-session plan**, decomposed into 10 independently-shippable sessions. Each session is a folder named `session-N-<name>__<MODEL>/` with its own `README.md` (the session brief) and one file per task. **Pick the session you've been assigned, read its `README.md`, then execute its task files in order**, one at a time. Steps use checkbox (`- [ ]`) syntax. REQUIRED SUB-SKILL when you execute: `superpowers:subagent-driven-development` (fresh subagent per task) or `superpowers:executing-plans`.

**Goal:** A realtor/broker/investor researches on `/r/` pages with the AI highlighter, *files* what they find (answers, charts, metrics, citations, their own photos/PDFs) into ONE **project**, then says what they want ("client email", "PDF one-pager") and the system **assembles a professional, fully-cited deliverable in seconds**. Projects persist and resume. Their own Claude (via our MCP) co-builds the same project.

**The moat:** Every filed item is a **snapshot** with its citation + `freshness_token` pinned at save time. The assembly LLM sees ONLY filed items and writes connective prose — it **structurally cannot invent a number**. CoStar charges $10K+/yr for branded reporting without this provenance.

---

## How this plan was produced

This is the audited, decomposed form of the single-doc plan the operator handed over (2026-06-10). Before decomposing, every "Verified ground truth" claim in the source plan was checked against the live code. The corrections are recorded in **[`AUDIT.md`](./AUDIT.md)** — read it once; the corrections are already baked into the relevant task files (search for the tag `[AUDIT-FIX C#]`). Added features (not in the source plan) are tagged `[ADDED]` and listed in [`AUDIT.md`](./AUDIT.md) §Added.

---

## Sessions, model assignment & dependency graph

Model rule used: **Opus** for novel architecture, first-of-kind security (first RLS, auth gates, storage scoping), and anti-hallucination LLM work — anywhere a mistake is hard to reverse or has a security/correctness blast radius. **Sonnet** for well-specified mechanical work following an existing pattern (SQL, CSS, glue, UI wiring with precedent).

| Session | Model | Days | Depends on | Ships (queue) |
|---|---|---|---|---|
| `session-0-metering-foundations` | **SONNET** | 0.5 | — | prereq of item 1 |
| `session-1-highlighter-thread-briefcase` | **OPUS** | 2.5–3 | S0 | queue item 1 |
| `session-2-charts-tierB-inchat` | **SONNET** | 2 | S0, S1 | queue item 2 |
| `session-3-saved-charts-c-route` | **SONNET** | 1 | S2 | item 3 (part 1) |
| `session-4-projects-rls-authgate` | **OPUS** | 2–2.5 | S1 (draft items), S3 (chart ref) | item 3 (part 2) |
| `session-5-print-css-pdf` | **SONNET** | 1 | S3, S4 | item 3 (part 3) |
| `session-6-assembly-engine` | **OPUS** | 3 | S4 (projects), S3 (chart resolve) | net-new |
| `session-7-delivery-surfaces` | **SONNET** | 1 | S6 | net-new |
| `session-8-uploads` | **OPUS** | 2 | S4 | net-new |
| `session-9-mcp-cobuild` | **OPUS** | 2 | S4, S6 | net-new |

```
S0 ─┬─> S1 ──> S2 ──> S3 ──┬──> S4 ──┬──> S5
    │                      │         ├──> S6 ──> S7
    └──────────────────────┘         ├──> S8
                                      └──> S9 (also needs S6)
```

**Critical path:** S0 → S1 → S2 → S3 → S4 → S6. S5, S7, S8, S9 hang off the path and can be done by separate Claudes once their dependency lands. **Do not start a session until its dependencies have shipped to `main`** — later sessions consume the *real* surfaces earlier ones create, and freezing code against a hypothetical surface is exactly the invented-contract failure this repo guards against (CLAUDE.md RULE 0 / Vendor-First).

---

## Code-fidelity policy (read this — it explains why some task files end with "expand against the live surface")

`writing-plans` demands complete code with no placeholders. That is honored **for every task whose upstream surface exists in `main` today** — Sessions **0, 1, 2** are coded in full. For Sessions 3–9, task files give exact files, interfaces, acceptance criteria, verify commands, and code wherever the surface is already real; where a task's final code depends on the *output* of an earlier unshipped session (e.g. S6's templates depend on S4's `ProjectItem` rows as actually stored), the task file specifies the interface + acceptance and instructs the executing Claude to run `superpowers:writing-plans` to freeze its own code against the live upstream. This is not a placeholder cop-out — it is the repo's own discipline: **don't ship code written against a contract that doesn't exist yet.** When you execute one of those sessions, its dependency will be live, so you'll have the real surface.

---

## Shared contracts (every session reads these)

- **[`shared/data-model.md`](./shared/data-model.md)** — the `ProjectItem` discriminated union (the spine of the whole feature). Lives at `lib/project/items.ts`, zod-validated, unit-tested. Sessions 1, 4, 6, 9 all depend on it byte-for-byte.
- **[`shared/conventions.md`](./shared/conventions.md)** — the per-session ship checklist (SESSION_LOG + safe-push + checks reconcile), the locked v1 decisions, the Vendor-First WebFetch list, and the locked names (`projects`, `/project/[id]`, `saved_charts`, `/c/[id]`, `deliverables`, `/p/[id]`).
- **[`AUDIT.md`](./AUDIT.md)** — audit corrections (`[AUDIT-FIX C#]`) + added features (`[ADDED]`).

## Spec amendments

The source-of-truth spec being extended is `docs/superpowers/specs/2026-06-07-boards-pdf-composed-export-design.md`. Amendments **A1–A8** (rename boards→projects, widen the item union, add the `deliverables` table + `/p/[id]` LLM assembly, meter-everything-enforcement-off, etc.) are committed to that spec by **Session 0** before anything else builds. The full amendment text is in `session-0-metering-foundations/task-01-spec-amendments-and-checks.md`.

## Open checks this plan creates (RULE 2 ledger — prod evidence, not dev attestation)

Opened by the session that needs the runtime signal, closed only on a live signal:
- `cookie_mint_live_verify` (S0) · `projects_rls_live_verify` (S4) · `deliverable_anchor_lint` (S6) · `storage_rls_scope_verify` (S8) · `mcp_project_tools_live_verify` (S9)



# ===== FILE: AUDIT.md =====

# Audit — source plan vs. live code (2026-06-10)

Method: every "Verified ground truth" claim in the source plan was checked against `main` via parallel read-only exploration. Verdict: the source plan is **unusually accurate** — the large majority of claims verified TRUE. The corrections below are the only material deltas; each is tagged in the task files where it changes the work.

## Corrections (baked into task files as `[AUDIT-FIX C#]`)

### C1 — Phase 4 magic-link `next` threading is described backwards
- **Plan:** "login-form.tsx honors `next` in `emailRedirectTo`; verify callback forwards it."
- **Reality:** `app/auth/callback/route.ts:8-15` **already** reads + forwards `next`. `app/login/login-form.tsx:19` hardcodes `emailRedirectTo` to `/auth/callback` and **silently drops** the `next` prop it receives from `app/login/page.tsx`.
- **Fix (S4 task-05):** the work is in *login-form*, not the callback — append the received `next` as a query param on the callback URL it passes to `signInWithOtp({ options: { emailRedirectTo } })`. Then the existing callback forwarding works.

### C2 — Phase 2 rent/vacancy data path misread
- **Plan:** `buildChartForIntent` for asking-rent/vacancy should "read `corridor_profiles` exactly as `app/embed/charts/page.tsx:130` does — one data path."
- **Reality:** that query (`embed/charts/page.tsx:129-134`) selects `corridor_name, character_chart, character_facts, character_speculative` — **not** rent/vacancy. Asking-rent is loaded from a **`corridor-rents.json` fixture** (~lines 156-160). Vacancy source must be located.
- **Fix (S2 task-01):** first task is to *locate the real rent/vacancy source* and reuse it; do not assume a `corridor_profiles` column.

### C3 — `ChartBlockView` already exists
- **Reality:** `components/charts/ChartBlockView.tsx` exists and is imported by `app/embed/charts/page.tsx`. Import it; do not rebuild. (Plan was already correct in spirit; this makes it explicit.)

### C4 — `ChartBlock` import location is locked by the charts spec
- **Reality:** import `ChartBlock` from `refinery/validate/chart-block-lint.mts` (where the type + `lintChartBlock` + `isAnchored` live), **not** from `refinery/types`. Preserve this in S2/S3/S6/S9.

### C5 — "HBarChart fixed-px / non-responsive" is stale
- **Charts spec** locked HBarChart as non-responsive; **reality:** `HBarChart.tsx:281-330` already uses `clamp()` fluid padding + grid. So S2/S5 need only a `compact?: boolean` prop + a `beforeprint` final-width frame (gsap animates width 0→% at lines 92-126, so an immediate print can catch width:0) — **not** a responsive rewrite.

### C6 — MCP `auth.ts` is a conditional bearer check that is **OPEN in prod today**
- **Reality:** `app/api/mcp/auth.ts:9-25` enforces `Authorization: Bearer <MCP_BEARER_TOKEN>` **only when the env var is set**, and returns early (open) when unset. `MCP_BEARER_TOKEN` is **unset in prod today**, so the MCP server is currently **unauthenticated in production.** The function exists; it is not enforced. (`[LB-R7]` — do not let "conditional bearer check" read as "enforced.")
- **Impact (S9):** the per-project capability key is additive, BUT because the bearer gate is open, the key check would be the ONLY thing between an outside caller and a service-role write that bypasses RLS. See `[LB-R6]`: the bearer token MUST be SET/enforced before the S9 write tools ship, and the service-role write MUST be hard-bound to the key's single project. The keystone task is to **set/enforce the token**, not author the function.

## Confirmed TRUE (no change needed)
`sdg_cid` read at `meter.ts:26`, never minted (no `Set-Cookie` anywhere) · `usage_events` + `data_requests` tables exist · **zero** `auth.uid()` RLS policies in the repo (access is GRANT/REVOKE only — S4 writes the first policy) · `middleware.ts` rate-limits `/api/b`,`/api/mcp`,`/api/waitlist` + delegates to Supabase session refresh · `utils/supabase/{server,client}.ts` exist · amber soft-wall at `HighlightPopup.tsx:357-370` · `snapCrossRowSelection`@109, `SUPPRESS_CLOSEST`@32, no cross-cell snap (real gap) · `context.tsx` holds only `chipFact` (thread is local to popup; dock has its own) · `route-chart.ts` exists, `onChart` does **not** · `isAnchored` tolerance `0.05`@`chart-block-lint.mts:81` · MCP exposes a single `swfl_fetch` tool, `readOnlyHint:true`@245, "read-only" prose@59 · `SYNTHESIS_MODEL="claude-sonnet-4-6"`@`anthropic.mts:7`, `getAnthropic()` exported, sdk `^0.69.0` · Resend lazy-init in `app/api/waitlist/route.ts`, from `hello@swfldatagulf.com` · waitlist copy "Ask Claude for a sourced PDF or doc, get one"@`waitlist-form.tsx:31` · no Storage buckets / no PDF lib / no Stripe.

## Added features (`[ADDED]` — not in the source plan)

1. **As-of date on exhibits** (S6 task-05) — per operator (2026-06-10): the as-of date stamp is the **only** honesty mechanism required. Every chart and filed item carries the date it was captured (from the fixture's own date field or, for live-brain items, the brain's `freshness_token`). A `freshness_token` is present only on items from live brains (`qa`, `metric`, `report`, `table_slice`); chart items carry as-of date via their `chart_block` data. Drop the cadence-aware "may have updated" computation and per-item age badge. In printed/shared deliverables, the date appears **only** as a plain citation line under each exhibit — no freshness badges, no token display, no staleness warnings. Live-refresh-before-print is a deferred higher-tier feature. Never silently re-fetch in v1.
2. **Restyle without re-LLM** (S6 task-06). Content is already separate from template by design — expose a template-swap that re-renders the same narrative+items under a different template with **no new LLM call** (free, instant). Gamma/Perplexity-Labs "cheap restyle."
3. **Deterministic jargon scrub on the deliverable** (S6 task-04). The build system prompt forbids `master/brain/payload/grain/dossier`; don't trust the LLM — add a post-generation deterministic check reusing the speaker-layer scrub patterns.
4. **Deliverable revoke / unpublish** (S7 task-02). `/p/[id]` is public by unguessable slug; the `status` column already exists — add `status='revoked'` → `/p/[id]` returns 410. Owner-controlled kill switch for a shared link.
5. **MCP add-item dedupe** (S9 task-02). When a co-building Claude files the same metric twice, dedupe by `(kind, report_id, label, value)` so the project doesn't fill with duplicates.

## Sequencing notes
- S5 (print CSS) is consumed by S3's `/c/[id]` "Save as PDF" button too — S3 ships the button, S5 perfects the print frame. Acceptable; noted in both.
- The source plan's "Phase 0+1 = queue item 1" is kept, but split into two sessions (different skill profiles: cookie/SQL vs. React state). S0 ships first as the metering prereq.

## LB review addendum — risk/design requirements (`[LB-R#]`)

LittleBird's plan-review (notetaker — `feedback_littlebird-is-notetaker`) flagged truth-integrity risks a facts-only pass walked past. The two pastes are the same items; merged + reconciled here. Each is now a written acceptance/verify gate in the named session — **these are gates, not suggestions.**

| # | Requirement | Enforced in | Verdict |
|---|---|---|---|
| **R1** | ~~Never pin a `freshness_token` onto fixture data. Rent/vacancy chart needs a LIVE source or it defers.~~ **OVERRIDDEN BY OPERATOR (2026-06-10):** Fixture-backed charts are fully deliverable. An as-of date (from the fixture's own date field) is the **only required honesty mechanism** — no `freshness_token` required on chart items. All four Tier-B chart scopes ship from fixtures: asking-rent (`corridor-rents.json`), vacancy (`corridor-rents.json`), zhvi (ZHVI fixture), corridor-scatter (rents fixture). S2 task-01 is rewritten to locate fixture paths, not hunt for live sources. | S2 task-01 (rewritten) | **OVERRIDDEN** |
| **R2** | Deliverable narrative lint anchors numbers by **EQUALITY**, not the 5%/0.05 chart-render tolerance. Keep 5% on chart rendering only. | S6 task-04 + README acceptance | accepted — this was a real bug in my plan |
| **R3** | Add the `isGroundedConditional` / no-smoothing check (`refinery/render/speaker.mts`) to the narrative path — anchoring alone passes a number-free ungrounded forecast ("rents will keep climbing"). | S6 task-04 + README acceptance | accepted |
| **R4** | State the single source of truth for chart NUMBERS: the **persisted `chart_block` jsonb in `saved_charts` is the frozen authority for a saved/filed chart**; `computeMetricChart` stays the live `/r/` on-the-fly render only. They cannot diverge because they serve different lifecycles (live recompute vs frozen snapshot). | S2 README + S3 README/task-02 | accepted |
| **R5** | Deliverable slug entropy: `randomUUID().slice(0,8)` (32 bits) is too weak for a public page carrying agent branding + client-specific content. Use a full-entropy slug (≥122 bits); add `/p/` to the middleware rate-limit prefixes; re-justify public-SELECT. | S6 task-01 + task-05 | accepted; public-SELECT-by-strong-slug re-justified below |
| **R6** | (a) `MCP_BEARER_TOKEN` MUST be enforced before S9 write tools ship; (b) the service-role write MUST be hard-bound to the project the key maps to — **no payload/param field may carry a `project_id`** that redirects the write. | S9 README + task-02 (gate) | accepted, hardened |
| **R7** | C6 wording: the bearer function is OPEN in prod (token unset), not enforced. | C6 above, rewritten | accepted |

**R5 re-justification (public-SELECT on `deliverables`):** the product requires sharing a link with a client who is NOT logged in (the whole "send a client email / hosted page" rail). So link = capability is the right model (like a "anyone with the link" doc), made safe by (1) ≥122-bit unguessable slug, (2) `/p/*` behind the rate limiter, (3) owner revoke → 410 (S7 task-02). We do NOT gate `/p/` behind auth — that would break the share-with-client use case. This is a deliberate, bounded exception, not the saved_charts trust model copied blindly.



# ===== FILE: shared/conventions.md =====

# Shared conventions — read before executing ANY session

## Locked v1 decisions (operator, 2026-06-10)

- **Delivery rail:** hosted `/p/[id]` page + `window.print()` PDF + email **DRAFT** (copy / `mailto:` / share-sheet). Resend real-send (7b) and server PDF/PPTX **deferred to demand**.
- **Anonymous-first:** full briefcase on `localStorage`; magic-link login only to save / share / build / upload. **No dead ends** — anon always sees a login prompt, never a hard stop.
- **Uploads v1:** images + PDFs, attach + caption only (10MB/file, 10/project). No parsing/OCR.
- **Naming (LOCKED — do not drift):** table `public.projects`, route `/project/[id]`, API `/api/projects`. "Briefcase" = the capture-tray UI **only**. `saved_charts` + `/c/[id]` keep their spec names. Deliverables: table `deliverables`, route `/p/[id]`.

## Per-session ship checklist (RULE 0 + RULE 2)

Every session ends with ONE push that includes all of:
1. The code + tests (green: `bun test` for touched areas; `npm run refinery -- ...` only if you touched packs/vocab — this plan does not).
2. A new top-of-file `SESSION_LOG.md` entry (1–3 lines, file paths welcome). **Hook-enforced** — the pre-push hook blocks a push whose commits don't touch `SESSION_LOG.md`.
3. Reconcile the `checks` ledger: `node scripts/check.mjs close <key>` / `open <project> <key> "<label>"`. **Never** track open obligations as `⬜/✅` in a plan doc.
4. Flip `_AUDIT_AND_ROADMAP/build-queue.md` (`[~]` in progress, `[x]` done) — the ops board auto-syncs from it within 5 min.
5. Push with `node scripts/safe-push.mjs` (never raw `git push`, never `--no-verify`, never force-push `main`).

**Diff-review gate (RULE 1):** Sessions that change a live `/api/b/*` or MCP response, or the `--- OUTPUT ---` shape, must **ask the operator for a diff review before pushing** (S2 touches `/api/converse`; S9 changes the MCP surface). Pure doc/SQL/UI-wiring sessions just commit and push.

**SQL migrations:** run them yourself, idempotent (`IF NOT EXISTS`, `CREATE ... IF NOT EXISTS`, `on conflict do nothing`). Creds in `.dlt/secrets.toml` (gitignored); `postgresql://postgres:{password}@{host}:5432/postgres`; run via `python -c "import psycopg; ..."`. Verify row count / policy existence after. After creating a table that PostgREST/refinery reads, `GRANT` + `NOTIFY pgrst,'reload schema'`.

**Push autonomy / confirmation:** Per the operator's standing decree (auto-memory `feedback_no-autonomous-push`), **stop after commit, show the log, and ask before pushing.** Do not push autonomously even though RULE 1 grants commit autonomy. Never create branches (`feedback_no-auto-branch-creation`) — work on `main`. Never open/merge PRs autonomously.

## Vendor-First — WebFetch these IN the executing session (never from memory/this doc)

| Surface | Session | Why |
|---|---|---|
| Supabase SSR middleware auth + `@supabase/ssr` ~0.10.x API | S4 | gating a route via `getUser()`; wrong call locks public pages |
| Supabase Storage RLS syntax + `createSignedUrl` + size ceilings | S8 | **only never-touched vendor surface in this plan** — mandatory |
| Anthropic `tool_choice` + strict on `@anthropic-ai/sdk` ^0.69.0 | S6 | forced-tool assembly; verbatim tool schema matters |
| Vercel `maxDuration` / `after()` | S6 | sync build now, `after()` upgrade later |
| Resend `reply_to` / verified-domain rules | S7 (7b only) | when real-send un-defers |
| iOS Safari / Android print + share-sheet | S5, S7 | real-device, not docs |

## Model-tier hygiene

The folder name carries the assignment (`__OPUS` / `__SONNET`). If you were dispatched as the wrong tier, note it and proceed — but Opus sessions encode irreversible/security decisions (first RLS, storage scoping, anti-hallucination lint, MCP write surface) deliberately.

## Locked names cross-reference

`ProjectItem` / `projectItemSchema` (`lib/project/items.ts`) · `projects` / `/project/[id]` / `/api/projects` · `saved_charts` / `/c/[id]` / `/api/charts/save` · `deliverables` / `/p/[id]` / `/api/projects/[id]/build` · `ChartBlock` + `lintChartBlock` + `isAnchored` (`refinery/validate/chart-block-lint.mts`) · `ChartBlockView` (`components/charts/ChartBlockView.tsx`, **exists**) · `buildChartForIntent` (`lib/build-chart-for-intent.mts`, new) · `routeChart` (`lib/route-chart.ts`, exists) · `SYNTHESIS_MODEL` / `getAnthropic` (`refinery/agents/anthropic.mts`).



# ===== FILE: shared/data-model.md =====

# Shared contract — `ProjectItem` (the spine)

Every session that touches projects depends on this exact shape. It is created once in **Session 1** (`lib/project/items.ts`), zod-validated, unit-tested, and never re-declared elsewhere — import it.

**Invariant:** every item is a **snapshot pinned at save time**. The value, citation, and (where available) `freshness_token` are copied in at the moment of filing and are **never re-fetched**. A deliverable assembled weeks later shows exactly what the user saw when they filed it. **Fixture-backed items** (charts, metrics sourced from fixtures) carry an as-of date from the fixture's own date field — that is the only required honesty mechanism; no `freshness_token` is required. `freshness_token` is present on items from live brain sources (`qa`, `metric`, `report`, `table_slice` filed from `/r/` pages). v1 surfaces the as-of **date** plainly as a citation line under each exhibit; live-refresh-before-print and cadence-aware staleness badges are a deferred higher-tier feature (operator, 2026-06-10), not built.

```ts
// lib/project/items.ts
export type ProjectItem = { id: string; added_at: string; origin: "web" | "mcp" } & (
  | { kind: "qa"; report_id: string; question: string; answer: string;
      fact?: string; selection_type?: string; reach?: string[]; freshness_token?: string }
  | { kind: "chart"; chart_id: string; title: string }            // ref → saved_charts (block lives there, already linted)
  | { kind: "metric"; report_id: string; label: string; value: string;
      source_url?: string; source_label?: string; freshness_token: string }
  | { kind: "source"; table: string; url: string; label: string }
  | { kind: "note"; text: string }
  | { kind: "report"; slug: string; title?: string; freshness_token?: string }
  | { kind: "file"; storage_path: string; mime: string; size: number; caption?: string }
  | { kind: "table_slice"; report_id: string; title: string; columns: string[];
      rows: (string | number | null)[][]; source_url?: string; freshness_token: string }
)
```

## Storage

- **Anonymous draft:** the same union in `localStorage` under key `swfl_project_draft_v1`. ~50-item cap with a quota warning. Precedent for the write-through pattern: `swfl_ai_dock_geom` (`components/highlighter/AskAiDock.tsx:14,29-39,98-104` — verified).
- **Logged-in:** `public.projects.items jsonb DEFAULT '[]'` (Session 4). Shapes are identical, so login migration via `POST /api/projects/import` is a straight insert (no transform).

## Zod

`lib/project/items.ts` also exports `projectItemSchema` (a `z.discriminatedUnion("kind", [...])` wrapped with the common `{id, added_at, origin}` fields) and `projectItemsSchema = z.array(projectItemSchema)`. Every write path validates with it:
- `PATCH /api/projects/[id]` (Session 4)
- the MCP `swfl_project_add` tool's `item` arg (Session 9) — note the MCP tool restricts the union to `note | metric | qa | report | chart_block` (chart_block is converted to a `chart` ref server-side after lint+insert).

## Cross-session field provenance

| field | filled by | from |
|---|---|---|
| `qa.report_id`, `question`, `answer`, `reach`, `freshness_token` | S1 "File this answer" | the live thread entry + page `freshnessToken` |
| `metric.source_url`, `source_label` | S1 "File this figure" | **`[AUDIT-FIX C-meta]`** the `metricSuggestions` projection at `app/r/[slug]/page.tsx:262` does **not** carry these today — S1 must widen that projection to forward `sourceUrl`/`sourceLabel` from `DisplayMetric` (they exist on the full metric, lines ~224-225) |
| `chart.chart_id` | S3 "File this chart" | the `saved_charts` row id returned by `POST /api/charts/save` |
| `file.storage_path` | S8 upload | `{user_id}/{project_id}/{uuid}.{ext}` in the `project-uploads` bucket |



# ================================================================
# SESSION FOLDER: session-0-metering-foundations__SONNET
# ================================================================

# Session 0 — Metering Foundations  ·  **SONNET**  ·  ~0.5 day

> Read `../shared/conventions.md` and `../AUDIT.md` first. This is the metering prerequisite for everything: the meter is fiction today because the client id is never minted (`[AUDIT-FIX]` confirmed — every `usage_events.client_id` = `"anon"`). Make it real, add an `action` dimension, and slip in the spec amendments since this session ships first.

**Goal:** Mint a signed `sdg_cid` cookie so per-client metering works; add an `action` column + `/api/meter` so every new action (ask/chart_save/project_create/item_add/build/export_print/deliver_email/upload) is counted day one with **enforcement OFF**.

**Architecture:** Middleware mints `sdg_cid = <randomId>.<hmac16>` when absent (httpOnly, 1y, lax). `meter.ts` verifies the HMAC and falls back to `"anon"` on a forged/missing cookie. `recordUse` gains an `action` param; a tiny `POST /api/meter` lets the client log non-route actions.

**Tasks (read each file in order):**
- [ ] `task-01-spec-amendments-and-checks.md` — amend the boards spec A1–A8, flip build-queue, open the 5 checks (preflight; this session ships first)
- [ ] `task-02-cookie-mint-middleware.md` — HMAC mint in `middleware.ts` + new env `SDG_COOKIE_SECRET`
- [ ] `task-03-usage-events-action-column.md` — idempotent SQL: `action text NOT NULL DEFAULT 'ask'` + index
- [ ] `task-04-meter-action-and-api.md` — `recordUse(..., {action})` + `actionCount()` + `POST /api/meter`
- [ ] `task-05-live-verify.md` — deploy, verify cookie minted/reused/forged→anon, open `cookie_mint_live_verify`

**Files touched:** `middleware.ts` · `lib/highlighter/meter.ts` · new `app/api/meter/route.ts` · new `docs/sql/20260611_usage_events_action.sql` · `docs/superpowers/specs/2026-06-07-boards-pdf-composed-export-design.md` · `_AUDIT_AND_ROADMAP/build-queue.md`

**Risk:** cookie bugs → **fail-safe to today's `"anon"`** behavior (never throw, never block a request). Enforcement stays OFF — this only *counts*.

**Diff-review gate:** none (metering + SQL + spec doc). Commit and push per the standard checklist, pausing for the operator's push confirmation.



## ----- task-01-spec-amendments-and-checks.md -----

# Task 01 — Spec amendments (A1–A8) + open checks + flip build-queue

**Why here:** Session 0 ships first, so it carries the one-time bookkeeping the whole plan needs.

**Files:**
- Modify: `docs/superpowers/specs/2026-06-07-boards-pdf-composed-export-design.md` (append an "Amendments 2026-06-10" section)
- Modify: `_AUDIT_AND_ROADMAP/build-queue.md`
- Ledger: `public.checks` via `scripts/check.mjs`

- [ ] **Step 1: Append the amendments block to the boards spec.** Add this verbatim at the end of the file (do not rewrite existing prose — append):

```markdown
## Amendments 2026-06-10 (Projects + Assembly Engine — operator-approved)

- **A1 — Rename.** `boards` → `projects`; `/board/[id]` → `/project/[id]`; `/api/boards` → `/api/projects`. `saved_charts` + `/c/[id]` keep their names.
- **A2 — Item union widened** (additive): the discriminated union gains `qa | metric | source | file | table_slice` (full shape in `docs/superpowers/plans/2026-06-10-projects-briefcase-assembly/shared/data-model.md`); `projects` gains `branding jsonb` and `mcp_key text UNIQUE` columns.
- **A3 — Assembly engine added** (net-new, the spec never covered it): `deliverables` table + `POST /api/projects/[id]/build` (forced-tool LLM assembly) + hosted `/p/[id]`. Print-the-page PDF is kept.
- **A4 — Meter every action day one, enforcement OFF.** Resolves the spec's open "0 or 1 usage" question: count `ask, chart_save, project_create, item_add, build, export_print, deliver_email, upload`; no hard wall.
- **A5 — Free/paid line preserved as FUTURE wall placement** ("free = answer in the moment; paid = keep/combine/take with you"), not flipped on.
- **A6 — Persistence:** `projects`/`deliverables` in Postgres; `project-uploads` bucket is solely user attachments; the Tier-1 Parquet/S3 lane is untouched.
- **A7 — MCP "read-only" promise narrowed to `swfl_fetch`;** three capability-keyed write tools added (`swfl_project_list/add/build`).
- **A8 — Chart Tier C (NL charts) + vitals chart scope stay deferred.**
```

- [ ] **Step 2: Flip the build-queue.** In `_AUDIT_AND_ROADMAP/build-queue.md`, mark item 1 (Highlighter persistence/briefcase) `[~]` in progress, and append the net-new lines for the assembly engine / delivery / uploads / MCP co-build (Sessions 6–9). Keep existing lines; do not delete.

- [ ] **Step 3: Open the 5 checks.** Run each (project = `brain-platform`):

```bash
node scripts/check.mjs open brain-platform cookie_mint_live_verify "sdg_cid signed cookie minted+verified in prod; usage_events.client_id != anon" --detail "S0 — verify after deploy"
node scripts/check.mjs open brain-platform projects_rls_live_verify "first auth.uid()=user_id RLS: two-account cross-read DENIED in prod" --detail "S4"
node scripts/check.mjs open brain-platform deliverable_anchor_lint "every numeric token in assembled narrative anchors to an item snapshot; poisoned-narrative test green" --detail "S6"
node scripts/check.mjs open brain-platform storage_rls_scope_verify "project-uploads RLS path-prefix = auth.uid(); cross-user object read DENIED in prod" --detail "S8"
node scripts/check.mjs open brain-platform mcp_project_tools_live_verify "their-Claude flow: fetch->add->build returns working /p/ URL; bad key clean error" --detail "S9"
```

- [ ] **Step 4: Verify checks landed.** Run `node scripts/check.mjs list` — expect the 5 new keys present and open. (These are **prod-evidence** checks per `feedback_checks-prod-evidence-not-dev-attestation`: do NOT close any on "code looks right" — only on a live signal.)

- [ ] **Step 5: Commit.** This goes out with the rest of Session 0's push (one push), but commit it as its own logical commit:

```bash
git add docs/superpowers/specs/2026-06-07-boards-pdf-composed-export-design.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs(projects): amend boards spec A1-A8; queue assembly-engine sessions"
```



## ----- task-02-cookie-mint-middleware.md -----

# Task 02 — Mint the signed `sdg_cid` cookie in middleware

**Context:** `middleware.ts` (verified) has two branches: rate-limited public API (early-returns) and everything else (`return createClient(request)`). The `/r/` pages flow through the second branch. We mint `sdg_cid` on whichever response is returned, **only when the cookie is absent**, and never let a crypto error break the request.

Cookie value = `<randomId>.<hmac16>` where `hmac16 = HMAC_SHA256(randomId, SDG_COOKIE_SECRET)` hex, first 16 chars. Middleware runs on the edge runtime → use **Web Crypto** (`crypto.subtle`). `meter.ts` (Node) verifies with `node:crypto` (Task 04) — both produce the same hex, so they agree.

**Files:**
- Modify: `middleware.ts`
- Env: add `SDG_COOKIE_SECRET` (a long random string) to Vercel (all envs) + local `.env`. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

- [ ] **Step 1: Add the mint helpers to `middleware.ts`** (top of file, after imports):

```ts
const SDG_CID_COOKIE = "sdg_cid";
const SDG_CID_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

async function hmac16(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

/** Returns a fresh signed cid, or null if minting is impossible (no secret / crypto error). */
async function mintCid(): Promise<string | null> {
  const secret = process.env.SDG_COOKIE_SECRET;
  if (!secret) return null;
  try {
    const randomId = crypto.randomUUID(); // dashes only — matches meter.ts charset
    return `${randomId}.${await hmac16(randomId, secret)}`;
  } catch {
    return null;
  }
}

function setCidIfAbsent(request: NextRequest, response: NextResponse): void {
  if (request.cookies.get(SDG_CID_COOKIE)) return;
  // Fire-and-forget mint; attach to the outgoing response when ready.
  // (middleware can be async — see Step 2 wiring.)
}
```

(The helper sketch above is illustrated; the real wiring in Step 2 makes `middleware` async so we can `await mintCid()`.)

- [ ] **Step 2: Make `middleware` async and mint on both response paths.** Replace the body so each returned response gets the cookie when absent:

```ts
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCid = Boolean(request.cookies.get(SDG_CID_COOKIE));
  const freshCid = hasCid ? null : await mintCid();

  const attachCid = (res: NextResponse) => {
    if (freshCid) {
      res.cookies.set(SDG_CID_COOKIE, freshCid, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SDG_CID_MAX_AGE,
      });
    }
    return res;
  };

  if (isRateLimited(pathname)) {
    const ip = clientIpFromHeaders(request.headers);
    const result = checkRateLimit(ip);
    if (result.limited) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "rate limit exceeded" },
        { status: 429, headers: { /* …unchanged… */ } },
      );
    }
    const pass = NextResponse.next();
    pass.headers.set("X-RateLimit-Limit", String(result.limit));
    pass.headers.set("X-RateLimit-Remaining", String(result.remaining));
    pass.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
    return attachCid(pass);
  }

  // Supabase auth-refresh path returns its own NextResponse — attach the cid to it.
  const res = await createClient(request);
  return attachCid(res as NextResponse);
}
```

> Note: keep the existing 429 `headers` object verbatim (omitted above for brevity — do NOT delete it). Confirm `createClient(request)` returns a `NextResponse` (it does — it's the Supabase SSR helper that builds a response to carry refreshed cookies); if its return type isn't `NextResponse`, adapt `attachCid` to mutate the object it does return.

- [ ] **Step 3: Add the env var.** Local `.env`: `SDG_COOKIE_SECRET=<hex>`. Vercel: `vercel env add SDG_COOKIE_SECRET` (Production/Preview/Development) or via dashboard. **Without the secret, `mintCid` returns null and behavior is exactly today's `"anon"`** — the fail-safe.

- [ ] **Step 4: Local smoke.** `bun run dev`, hit `http://localhost:3000/r/master`, check the response `Set-Cookie` carries `sdg_cid=<uuid>.<16hex>; HttpOnly; ...`. Reload → no new `Set-Cookie` (cookie reused). (Live prod verify is Task 05.)

- [ ] **Step 5: Commit.**

```bash
git add middleware.ts
git commit -m "feat(meter): mint signed sdg_cid cookie in middleware (fail-safe to anon)"
```



## ----- task-03-usage-events-action-column.md -----

# Task 03 — `usage_events.action` column (idempotent SQL)

**Context:** `docs/sql/20260607_usage_events.sql` created `usage_events(id, client_id, iso_week, report_id, reach, ip_hash, created_at)` (verified). Add an `action` dimension so every metered action type is distinguishable. Run the migration yourself (creds in `.dlt/secrets.toml`).

**Files:**
- Create: `docs/sql/20260611_usage_events_action.sql`

- [ ] **Step 1: Write the migration:**

```sql
-- 20260611_usage_events_action.sql — add action dimension to usage_events. Idempotent.
ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'ask';

CREATE INDEX IF NOT EXISTS usage_events_action_week_idx
  ON public.usage_events (client_id, iso_week, action);
```

- [ ] **Step 2: Apply it** (idempotent — safe to re-run):

```bash
python -c "import psycopg, tomllib, pathlib; s=tomllib.loads(pathlib.Path('.dlt/secrets.toml').read_text()); \
import re; \
conn=psycopg.connect('postgresql://postgres:%s@%s:5432/postgres' % (s['<password-key>'], s['<host-key>'])); \
conn.execute(open('docs/sql/20260611_usage_events_action.sql').read()); conn.commit(); print('applied')"
```

(Fill `<password-key>`/`<host-key>` from the real `.dlt/secrets.toml` structure — grep it; per `feedback_fill-in-commands-dont-template`, hand yourself a runnable command, don't leave the placeholder.)

- [ ] **Step 3: Verify the column exists:**

```bash
python -c "import psycopg, ...; cur=conn.execute(\"select column_name,data_type,column_default from information_schema.columns where table_schema='public' and table_name='usage_events' and column_name='action'\"); print(cur.fetchall())"
```

Expected: `[('action', 'text', \"'ask'::text\")]`.

- [ ] **Step 4: Commit.**

```bash
git add docs/sql/20260611_usage_events_action.sql
git commit -m "feat(meter): usage_events.action column + index (idempotent)"
```



## ----- task-04-meter-action-and-api.md -----

# Task 04 — `recordUse({action})` + `actionCount()` + signature-verifying `clientIdFrom` + `/api/meter`

**Context:** `lib/highlighter/meter.ts` (verified) has `clientIdFrom(request)` that regex-matches `sdg_cid=([a-zA-Z0-9_-]+)` and returns the match or `"anon"`. That charset stops at the `.`, so a signed `uuid.sig` cookie would currently yield just `uuid` **unverified**. Make `clientIdFrom` parse + HMAC-verify; add an `action` field to `recordUse`; add `actionCount`; add a thin client route for non-route actions.

**Files:**
- Modify: `lib/highlighter/meter.ts`
- Create: `app/api/meter/route.ts`
- Test: `lib/highlighter/meter.test.ts`

- [ ] **Step 1: Write the failing test** for signature verification (`lib/highlighter/meter.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { __clientIdFromForTest } from "./meter";

const SECRET = "test-secret";
function signed(id: string) {
  const sig = crypto.createHmac("sha256", SECRET).update(id).digest("hex").slice(0, 16);
  return `${id}.${sig}`;
}

describe("clientIdFrom", () => {
  it("returns the id for a validly signed cookie", () => {
    process.env.SDG_COOKIE_SECRET = SECRET;
    const id = "11111111-2222-3333-4444-555555555555";
    const req = new Request("http://x", { headers: { cookie: `sdg_cid=${signed(id)}` } });
    expect(__clientIdFromForTest(req)).toBe(id);
  });
  it("returns 'anon' for a forged signature", () => {
    process.env.SDG_COOKIE_SECRET = SECRET;
    const req = new Request("http://x", { headers: { cookie: "sdg_cid=abc.deadbeefdeadbeef" } });
    expect(__clientIdFromForTest(req)).toBe("anon");
  });
  it("returns 'anon' when no cookie", () => {
    process.env.SDG_COOKIE_SECRET = SECRET;
    expect(__clientIdFromForTest(new Request("http://x"))).toBe("anon");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`__clientIdFromForTest` not exported, verify logic absent):

```bash
bun test lib/highlighter/meter.test.ts
```

- [ ] **Step 3: Rewrite `clientIdFrom` to verify, and export a test hook:**

```ts
import crypto from "node:crypto";

/** Anonymous client id from a SIGNED cookie; falls back to "anon" on missing/forged. */
function clientIdFrom(request: Request): string {
  const cookie = request.headers.get("cookie") ?? "";
  const m = cookie.match(/sdg_cid=([^;]+)/);
  if (!m) return "anon";
  const secret = process.env.SDG_COOKIE_SECRET;
  if (!secret) return "anon";
  const [id, sig] = m[1].split(".");
  if (!id || !sig) return "anon";
  const expected = crypto.createHmac("sha256", secret).update(id).digest("hex").slice(0, 16);
  if (sig.length !== expected.length) return "anon";
  const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  return ok ? id : "anon";
}

export const __clientIdFromForTest = clientIdFrom; // test-only hook
```

- [ ] **Step 4: Add `action` to `recordUse`** (keep the existing signature working — `action` defaults to `"ask"`):

```ts
export async function recordUse(
  request: Request,
  meta: { report_id: string; reach: string[]; action?: string },
): Promise<number> {
  try {
    const db = createServiceRoleClient();
    await db.from("usage_events").insert({
      client_id: clientIdFrom(request),
      iso_week: isoWeek(new Date()),
      report_id: meta.report_id,
      reach: meta.reach,
      action: meta.action ?? "ask",
    });
    return 1;
  } catch {
    return 0; // metering must never break an answer
  }
}
```

- [ ] **Step 5: Add `actionCount`** (per-client, per-week, per-action — for the future soft wall):

```ts
export async function actionCount(clientId: string, action: string): Promise<number> {
  try {
    const db = createServiceRoleClient();
    const { count } = await db
      .from("usage_events")
      .select("*", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("iso_week", isoWeek(new Date()))
      .eq("action", action);
    return count ?? 0;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 6: Run tests — expect PASS:** `bun test lib/highlighter/meter.test.ts`

- [ ] **Step 7: Create `app/api/meter/route.ts`** — a thin POST so the client can log non-route actions (`item_add`, `export_print`, `deliver_email`, etc.). Enforcement OFF — it only records:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { recordUse } from "@/lib/highlighter/meter";

const ALLOWED = new Set([
  "ask", "chart_save", "project_create", "item_add",
  "build", "export_print", "deliver_email", "upload",
]);

export async function POST(req: NextRequest) {
  let body: { action?: string; report_id?: string; reach?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const action = body.action ?? "";
  if (!ALLOWED.has(action)) return NextResponse.json({ ok: false }, { status: 400 });
  await recordUse(req, {
    report_id: body.report_id ?? "",
    reach: Array.isArray(body.reach) ? body.reach : [],
    action,
  });
  return NextResponse.json({ ok: true });
}
```

> The client helper that calls this (`fetch("/api/meter", {method:"POST", body: JSON.stringify({action:"item_add", report_id})})`) is added by the sessions that emit those actions (S1 item_add, S5 export_print, S7 deliver_email, S8 upload). Keep this route action-list in sync as new actions land.

- [ ] **Step 8: Typecheck + commit.**

```bash
bun run typecheck   # or the project's tsc task; expect clean for touched files
git add lib/highlighter/meter.ts lib/highlighter/meter.test.ts app/api/meter/route.ts
git commit -m "feat(meter): verify signed cid, add action dimension + /api/meter"
```



## ----- task-05-live-verify.md -----

# Task 05 — Live verify + close `cookie_mint_live_verify`

**Why:** `cookie_mint_live_verify` is a **prod-evidence** check (`feedback_checks-prod-evidence-not-dev-attestation`). It closes only on a runtime signal from the deployed site — not "code looks right."

- [ ] **Step 1: Ship** (push per `../shared/conventions.md` checklist — SESSION_LOG entry + safe-push, pausing for operator push confirmation). Ensure `SDG_COOKIE_SECRET` is set in Vercel Production **before** relying on the verify.

- [ ] **Step 2: Cookie minted on first visit.** From a clean client:

```bash
curl -sI https://www.swfldatagulf.com/r/master | grep -i set-cookie
```

Expected: `set-cookie: sdg_cid=<uuid>.<16hex>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`.

- [ ] **Step 3: Cookie reused on second visit** (send it back, expect NO new Set-Cookie):

```bash
curl -sI -H "cookie: sdg_cid=<value-from-step-2>" https://www.swfldatagulf.com/r/master | grep -i set-cookie || echo "no new cookie (correct)"
```

- [ ] **Step 4: `usage_events.client_id` is no longer always `anon`.** Trigger an ask on `/r/master` carrying the cookie, then:

```bash
python -c "import psycopg, ...; print(conn.execute(\"select client_id, action, count(*) from public.usage_events where created_at > now() - interval '10 min' group by 1,2\").fetchall())"
```

Expected: at least one row with a real `<uuid>` client_id (not `anon`).

- [ ] **Step 5: Forged cookie → `anon`.** Send a bad signature and confirm the recorded `client_id` is `anon` (verify rejects it):

```bash
curl -s -H "cookie: sdg_cid=forged-id.0000000000000000" -X POST https://www.swfldatagulf.com/api/meter \
  -H 'content-type: application/json' -d '{"action":"item_add","report_id":"master"}'
# then query usage_events for the just-inserted row → client_id should be 'anon'
```

- [ ] **Step 6: Close the check** with the evidence:

```bash
node scripts/check.mjs close cookie_mint_live_verify "prod: sdg_cid minted+reused on /r/master; real uuid client_id in usage_events; forged sig -> anon"
```



# ================================================================
# SESSION FOLDER: session-1-highlighter-thread-briefcase__OPUS
# ================================================================

# Session 1 — Highlighter: thread persistence + briefcase capture  ·  **OPUS**  ·  ~2.5–3 days

> Read `../shared/conventions.md`, `../shared/data-model.md`, `../AUDIT.md` first. **Why Opus:** this is intricate React state-lift work where the repo has a hard footgun — `react-hooks/set-state-in-effect` is a **hard ESLint error** here (auto-memory `feedback_react-set-state-in-effect`): calling `setState` synchronously inside a `useEffect` body blocks commits. Use the **"set state during render"** pattern, never an effect, when deriving state from props/state. Context-lift regressions are the named top risk.

**Goal:** Lift the highlighter conversation thread out of `HighlightPopup` into the shared `HighlighterProvider` so it survives close/reopen and is shared with the Ask-AI dock; add the **briefcase** capture tray (file answers/figures/reports into a `localStorage` draft project); fix cross-cell selection snapping.

**Architecture:** `lib/highlighter/context.tsx` (today holds only `chipFact`) grows `thread` (per-`reportId` map of `ChatEntry[]`) + `draftItems: ProjectItem[]` with `localStorage` write-through (precedent: `swfl_ai_dock_geom`). `HighlightPopup` and `AskAiDock` both read the context instead of owning local thread state. A new `Briefcase` tray lists draft items. `ProjectItem` is created here (`lib/project/items.ts`) — the spine the whole plan imports.

**Tasks (read in order):**
- [ ] `task-01-project-items-union.md` — create `lib/project/items.ts` (the shared union + zod) **first** (S2/S4/S6/S9 import it)
- [ ] `task-02-lift-thread-to-provider.md` — grow `context.tsx` with thread + draft state, `localStorage` write-through
- [ ] `task-03-popup-reads-context.md` — delete popup-local thread state; reopen renders condensed prior thread
- [ ] `task-04-dock-shares-thread.md` — `AskAiDock` reads the same thread
- [ ] `task-05-briefcase-tray-and-file-affordances.md` — `Briefcase.tsx` + badge + "File this …" affordances + widen `metricSuggestions` `[AUDIT-FIX C-meta]` + meter `item_add`
- [ ] `task-06-cross-cell-snapping.md` — `snapCrossCellSelection` + suppression + jsdom tests

**Files:** new `lib/project/items.ts` · `lib/highlighter/context.tsx` · `components/highlighter/HighlightPopup.tsx` · `components/highlighter/AskAiDock.tsx` · `components/highlighter/AskAi.tsx` · new `components/highlighter/Briefcase.tsx` · `lib/highlighter/use-highlight.ts` · `app/r/[slug]/page.tsx` (widen projection) · `app/r/[slug]/HighlighterLayer.tsx`

**Depends on:** S0 (for `item_add` metering via `/api/meter`).

**Risk:** state-lift regressions → **move state, not effects**; unit-test the provider; never `setState` in an effect body.

**Diff-review gate:** none (client-only + new lib). Standard ship checklist; pause for operator push confirmation.



## ----- task-01-project-items-union.md -----

# Task 01 — Create `lib/project/items.ts` (the shared `ProjectItem` union)

**This is the spine.** S2, S4, S6, S9 all import this exact type + schema. Build it pure, zod-validated, unit-tested. Full canonical shape: `../shared/data-model.md`.

**Files:**
- Create: `lib/project/items.ts`
- Test: `lib/project/items.test.ts`

- [ ] **Step 1: Write the failing test** (`lib/project/items.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { projectItemSchema, projectItemsSchema, type ProjectItem } from "./items";

describe("projectItemSchema", () => {
  it("accepts a valid metric item", () => {
    const item: ProjectItem = {
      id: "x", added_at: "2026-06-10T00:00:00Z", origin: "web",
      kind: "metric", report_id: "env-swfl", label: "Annual flood loss",
      value: "$30,074/yr", source_url: "https://…", source_label: "FEMA NFIP",
      freshness_token: "SWFL-7421-v5-20260610",
    };
    expect(projectItemSchema.parse(item).kind).toBe("metric");
  });
  it("rejects an unknown kind", () => {
    expect(() => projectItemSchema.parse({ id: "x", added_at: "t", origin: "web", kind: "bogus" })).toThrow();
  });
  it("requires freshness_token on metric", () => {
    expect(() => projectItemSchema.parse({ id: "x", added_at: "t", origin: "web", kind: "metric", report_id: "r", label: "l", value: "v" })).toThrow();
  });
  it("parses an array", () => {
    expect(projectItemsSchema.parse([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`bun test lib/project/items.test.ts`).

- [ ] **Step 3: Implement `lib/project/items.ts`.** Define the discriminated union + zod. Use `z.discriminatedUnion("kind", [...])` for the kind-specific part and intersect the common fields:

```ts
import { z } from "zod";

const base = z.object({
  id: z.string(),
  added_at: z.string(),
  origin: z.enum(["web", "mcp"]),
});

const kinds = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("qa"), report_id: z.string(), question: z.string(), answer: z.string(),
    fact: z.string().optional(), selection_type: z.string().optional(),
    reach: z.array(z.string()).optional(), freshness_token: z.string().optional() }),
  z.object({ kind: z.literal("chart"), chart_id: z.string(), title: z.string() }),
  z.object({ kind: z.literal("metric"), report_id: z.string(), label: z.string(), value: z.string(),
    source_url: z.string().optional(), source_label: z.string().optional(), freshness_token: z.string() }),
  z.object({ kind: z.literal("source"), table: z.string(), url: z.string(), label: z.string() }),
  z.object({ kind: z.literal("note"), text: z.string() }),
  z.object({ kind: z.literal("report"), slug: z.string(), title: z.string().optional(), freshness_token: z.string().optional() }),
  z.object({ kind: z.literal("file"), storage_path: z.string(), mime: z.string(), size: z.number(), caption: z.string().optional() }),
  z.object({ kind: z.literal("table_slice"), report_id: z.string(), title: z.string(), columns: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))), source_url: z.string().optional(), freshness_token: z.string() }),
]);

export const projectItemSchema = z.intersection(base, kinds);
export const projectItemsSchema = z.array(projectItemSchema);
export type ProjectItem = z.infer<typeof projectItemSchema>;
```

> Verify zod is already a dependency (`grep '"zod"' package.json`). It is widely used in this repo; if absent, that's a lockfile-gated `bun add zod` + `git add bun.lock` (RULE 1 breaker #1) — but expect it present.

- [ ] **Step 4: Run — expect PASS.** `bun test lib/project/items.test.ts`

- [ ] **Step 5: Commit.**

```bash
git add lib/project/items.ts lib/project/items.test.ts
git commit -m "feat(project): ProjectItem discriminated union + zod (shared spine)"
```



## ----- task-02-lift-thread-to-provider.md -----

# Task 02 — Grow `HighlighterProvider` with thread + draft-project state

**Context (verified):** `lib/highlighter/context.tsx` today holds only `chipFact`/`setChipFact`/`onActivate`. Thread state lives locally in `HighlightPopup` (`thread: ChatEntry[]`, `activeQuestion`). We lift thread + a draft-project list into the provider with `localStorage` write-through. Precedent for the persistence pattern: `AskAiDock.tsx:14,29-39,98-104` (`swfl_ai_dock_geom`).

**HARD RULE:** never `setState` inside a `useEffect` body (repo's `react-hooks/set-state-in-effect` is a build-blocking error). `localStorage` writes go in the **setter callbacks** (event-driven), not in effects derived from state. Initial read happens in the `useState` initializer (lazy init), guarded for SSR.

**Files:**
- Modify: `lib/highlighter/context.tsx`
- Test: `lib/highlighter/context.test.tsx`

- [ ] **Step 1: Write a failing provider test** (`lib/highlighter/context.test.tsx`, jsdom) covering: archive an exchange → thread for that reportId grows; file an item → draftItems grows + localStorage written; clearThread empties only that reportId:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { HighlighterProvider, useHighlighterContext } from "./context";

const wrap = ({ children }: { children: React.ReactNode }) => <HighlighterProvider>{children}</HighlighterProvider>;

beforeEach(() => localStorage.clear());

describe("HighlighterProvider thread + draft", () => {
  it("archives an exchange under its reportId", () => {
    const { result } = renderHook(() => useHighlighterContext(), { wrapper: wrap });
    act(() => result.current!.archiveExchange("env-swfl", { question: "q", answer: "a" }));
    expect(result.current!.thread("env-swfl")).toHaveLength(1);
    expect(result.current!.thread("other")).toHaveLength(0);
  });
  it("files a draft item and persists it", () => {
    const { result } = renderHook(() => useHighlighterContext(), { wrapper: wrap });
    act(() => result.current!.fileItem({ id: "1", added_at: "t", origin: "web", kind: "note", text: "hi" }));
    expect(result.current!.draftItems).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("swfl_project_draft_v1")!)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `bun test lib/highlighter/context.test.tsx`

- [ ] **Step 3: Extend the context value + provider.** Add to `HighlighterContextValue`:

```ts
export interface ChatEntry { question: string; answer: string }

export interface HighlighterContextValue {
  chipFact: SelectedFact | null;
  setChipFact: (fact: SelectedFact | null) => void;
  onActivate: (fact: SelectedFact) => void;
  // thread (per reportId)
  thread: (reportId: string) => ChatEntry[];
  archiveExchange: (reportId: string, entry: ChatEntry) => void;
  clearThread: (reportId: string) => void;
  // draft project
  draftItems: ProjectItem[];
  fileItem: (item: ProjectItem) => void;
  removeItem: (id: string) => void;
}
```

Provider implementation — note the **lazy initializer** reads localStorage once (no effect), and `fileItem`/`removeItem` write through inside the callback:

```ts
const DRAFT_KEY = "swfl_project_draft_v1";
const DRAFT_CAP = 50;

function loadDraft(): ProjectItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? projectItemsSchema.parse(JSON.parse(raw)) : [];
  } catch { return []; }
}
function saveDraft(items: ProjectItem[]) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(items)); } catch { /* quota — handled by caller warning */ }
}

export function HighlighterProvider({ children }: { children: ReactNode }) {
  const [chipFact, setChipFact] = useState<SelectedFact | null>(null);
  const onActivate = useCallback((f: SelectedFact) => setChipFact(f), []);

  const [threads, setThreads] = useState<Record<string, ChatEntry[]>>({});
  const thread = useCallback((reportId: string) => threads[reportId] ?? [], [threads]);
  const archiveExchange = useCallback((reportId: string, entry: ChatEntry) => {
    setThreads((t) => {
      const cur = t[reportId] ?? [];
      // checkpoint: >12 entries -> condense oldest to question-only (client-side; LLM summary deferred)
      const next = [...cur, entry];
      const condensed = next.length > 12
        ? next.map((e, i) => (i < next.length - 12 ? { question: e.question, answer: "" } : e))
        : next;
      return { ...t, [reportId]: condensed };
    });
  }, []);
  const clearThread = useCallback((reportId: string) =>
    setThreads((t) => ({ ...t, [reportId]: [] })), []);

  const [draftItems, setDraftItems] = useState<ProjectItem[]>(loadDraft);
  const fileItem = useCallback((item: ProjectItem) => {
    setDraftItems((items) => {
      const next = [...items, item].slice(-DRAFT_CAP);
      saveDraft(next);   // write-through INSIDE the callback — not an effect
      return next;
    });
  }, []);
  const removeItem = useCallback((id: string) => {
    setDraftItems((items) => {
      const next = items.filter((i) => i.id !== id);
      saveDraft(next);
      return next;
    });
  }, []);

  return (
    <HighlighterContext.Provider
      value={{ chipFact, setChipFact, onActivate, thread, archiveExchange, clearThread, draftItems, fileItem, removeItem }}>
      {children}
    </HighlighterContext.Provider>
  );
}
```

Add imports: `import { projectItemsSchema, type ProjectItem } from "@/lib/project/items";`.

- [ ] **Step 4: Run — expect PASS.** `bun test lib/highlighter/context.test.tsx`

- [ ] **Step 5: Quota-warning hook.** Expose a derived `draftNearCap = draftItems.length >= DRAFT_CAP - 5` (compute during render, do NOT effect) for the tray to show a "you're about to lose space — sign in to save" nudge (`[ADDED]`, ties to A5 future wall). Add it to the context value.

- [ ] **Step 6: Commit.**

```bash
git add lib/highlighter/context.tsx lib/highlighter/context.test.tsx
git commit -m "feat(highlighter): lift thread + draft-project state into HighlighterProvider"
```



## ----- task-03-popup-reads-context.md -----

# Task 03 — `HighlightPopup` reads thread from context (delete local state)

**Context (verified):** `HighlightPopup.tsx` owns `thread: ChatEntry[]` (line 47), `activeQuestion` (line 48), and a local `ChatEntry` interface (lines 11-14). Replace local thread ownership with the provider's `thread(reportId)` / `archiveExchange`. Reopen must render the prior thread condensed (question-line collapsed, tap to expand).

**Files:**
- Modify: `components/highlighter/HighlightPopup.tsx`

- [ ] **Step 1: Remove the local `ChatEntry` interface** (lines 11-14) and import it from context: `import { useHighlighterContext, type ChatEntry } from "@/lib/highlighter/context";`.

- [ ] **Step 2: Replace `const [thread, setThread] = useState<ChatEntry[]>([])`** with context reads:

```tsx
const ctx = useHighlighterContext();
const reportId = /* the popup already knows its reportId — confirm the prop/source */;
const thread = ctx?.thread(reportId) ?? [];
```

When an exchange completes (the existing place that did `setThread((t) => [...t, {question, answer}])`), call `ctx?.archiveExchange(reportId, { question, answer })` instead. Keep `activeQuestion` local (it's transient live state), or move it too if cleaner — but do NOT introduce a `setState`-in-effect to sync it.

- [ ] **Step 3: Condensed re-render on reopen.** Render archived entries with the question visible and the answer collapsed behind a tap-to-expand (`<details>` or a local `expandedSet` toggled by click — a click handler, not an effect). The live/active exchange renders fully.

- [ ] **Step 4: Verify no `setState`-in-effect was introduced.** Run the linter on the file:

```bash
bunx eslint components/highlighter/HighlightPopup.tsx
```

Expected: no `react-hooks/set-state-in-effect` errors. If you see one, you derived state in an effect — move it to render or an event callback.

- [ ] **Step 5: Manual smoke.** `bun run dev` → `/r/master` → ask a question → close popup → re-highlight/reopen → prior thread shows condensed. Tap an entry → expands.

- [ ] **Step 6: Commit.**

```bash
git add components/highlighter/HighlightPopup.tsx
git commit -m "feat(highlighter): popup reads thread from provider; condensed reopen"
```



## ----- task-04-dock-shares-thread.md -----

# Task 04 — `AskAiDock` shares the same thread via context

**Context (verified):** `AskAiDock.tsx` owns its own `history` (line 62), `activeQuestion`, `answer`. It does NOT share thread state with the popup. Point it at the provider so the dock and popup show one continuous conversation per report.

**Files:**
- Modify: `components/highlighter/AskAiDock.tsx`
- (touch) `components/highlighter/AskAi.tsx` only if the `reportId` needs threading down (it's already passed `reportId` per the audit: `<AskAi reportId=… />`).

- [ ] **Step 1: Replace local `history` with context thread.** Import `useHighlighterContext`; read `ctx?.thread(reportId)`; on exchange completion call `ctx?.archiveExchange(reportId, {question, answer})`. Keep the dock's geometry/`swfl_ai_dock_geom` persistence untouched.

- [ ] **Step 2: Guard for no-provider.** The dock may mount where no `HighlighterProvider` is in the tree → `useHighlighterContext()` returns null. Fall back to a local `useState` thread in that case (keep today's behavior) so the dock never crashes. Pattern:

```tsx
const ctx = useHighlighterContext();
const [localThread, setLocalThread] = useState<ChatEntry[]>([]);
const thread = ctx ? ctx.thread(reportId) : localThread;
const archive = (e: ChatEntry) => ctx ? ctx.archiveExchange(reportId, e) : setLocalThread((t) => [...t, e]);
```

- [ ] **Step 3: Lint** (`bunx eslint components/highlighter/AskAiDock.tsx`) — no set-state-in-effect.

- [ ] **Step 4: Manual smoke.** On a report with both the popup and dock: ask in the popup, open the dock → same thread visible; ask in the dock → popup reopen shows it too.

- [ ] **Step 5: Commit.**

```bash
git add components/highlighter/AskAiDock.tsx components/highlighter/AskAi.tsx
git commit -m "feat(highlighter): dock shares thread with popup via provider (null-safe)"
```



## ----- task-05-briefcase-tray-and-file-affordances.md -----

# Task 05 — Briefcase tray + "File this …" affordances + widen `metricSuggestions`

**Goal:** A briefcase icon with a count badge (next to the Ask-AI FAB) opens a tray listing the draft items (remove/reorder, "Open project" link). Each thread exchange gets "File this answer" (→`qa`); a resolved fact gets "File this figure" (→`metric`); the tray gets "File this report" (→`report`). Every file logs `item_add` via `/api/meter`.

**Files:**
- Create: `components/highlighter/Briefcase.tsx`
- Modify: `components/highlighter/AskAi.tsx` (mount the Briefcase next to the FAB), `HighlightPopup.tsx` (file affordances on exchanges), `lib/highlighter/use-highlight.ts` (add tray DOM id to `SUPPRESS_CLOSEST`)
- Modify: `app/r/[slug]/page.tsx` (**`[AUDIT-FIX C-meta]`** widen the `metricSuggestions` projection) and `app/r/[slug]/HighlighterLayer.tsx` (thread the new fields down)

- [ ] **Step 1: `[AUDIT-FIX C-meta]` Widen `metricSuggestions`.** Verified: `app/r/[slug]/page.tsx:262` maps `display.metrics` to `{ label, suggestions }` only, dropping `sourceUrl`/`sourceLabel` that exist on the full `DisplayMetric` (~lines 224-225). To file a `metric` item with provenance, forward them:

```tsx
metricSuggestions={display.metrics
  .filter((m) => m.suggestions.length > 0)
  .map((m) => ({ label: m.label, value: m.value, suggestions: m.suggestions,
                 sourceUrl: m.sourceUrl, sourceLabel: m.sourceLabel, freshnessToken: display.freshnessToken }))}
```

Update the receiving prop type in `HighlighterLayer.tsx` (and wherever `metricSuggestions` is typed) to carry `value`, `sourceUrl?`, `sourceLabel?`, `freshnessToken`.

- [ ] **Step 2: `Briefcase.tsx`.** A button showing `draftItems.length` as a badge; on click opens a bottom-sheet (mobile) / popover (desktop) listing condensed items with a remove (✕) per row and an "Open project" link to `/project/draft`. Reads `useHighlighterContext()` for `draftItems`/`removeItem`/`draftNearCap`. Show the quota nudge when `draftNearCap` (`[ADDED]`). Give the tray root a stable id, e.g. `id="briefcase-tray"`.

- [ ] **Step 3: Suppress close.** Add the tray id to `SUPPRESS_CLOSEST` in `use-highlight.ts:32` so opening the tray doesn't dismiss the highlighter:

```ts
const SUPPRESS_CLOSEST = "input, textarea, [contenteditable], #highlighter-popup, #ask-ai-dock, #briefcase-tray";
```

- [ ] **Step 4: File affordances.**
  - In `HighlightPopup`, each archived exchange gets a "File this answer" button → builds a `qa` item (`report_id`, `question`, `answer`, `reach`, `freshness_token` from the page token) and calls `ctx.fileItem(item)`.
  - When a fact/metric is resolved (the popup already knows the selected metric), show "File this figure" → builds a `metric` item using the widened projection (`label`, `value`, `source_url`, `source_label`, `freshness_token`).
  - In the tray header, "File this report" → builds a `report` item (`slug`, `title`, `freshness_token`).
  - Generate `id` with `crypto.randomUUID()`, `added_at` = `new Date().toISOString()`, `origin: "web"`.

- [ ] **Step 5: Meter `item_add`.** After each successful `fileItem`, fire-and-forget:

```ts
fetch("/api/meter", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "item_add", report_id: reportId }) }).catch(() => {});
```

- [ ] **Step 6: Lint + manual smoke.** No set-state-in-effect. File 3 kinds (answer, figure, report) → badge increments to 3; refresh the page → draft persists (localStorage); remove one → badge → 2 and localStorage shrinks.

- [ ] **Step 7: Commit.**

```bash
git add components/highlighter/Briefcase.tsx components/highlighter/AskAi.tsx components/highlighter/HighlightPopup.tsx lib/highlighter/use-highlight.ts app/r/[slug]/page.tsx app/r/[slug]/HighlighterLayer.tsx
git commit -m "feat(highlighter): briefcase tray + File-this affordances; widen metricSuggestions provenance"
```



## ----- task-06-cross-cell-snapping.md -----

# Task 06 — Cross-cell selection snapping

**Context (verified):** `use-highlight.ts` has `snapCrossRowSelection`@109 (snaps a multi-row table selection to one row, runs @279 after the range is built) and `extractRowContext`@193-204 (grabs the FIRST cell's label). There is **no** cross-cell snapping: a selection spanning two different `<td>`s in the **same** `<tr>` is not handled. The iteration doc blesses "snap to one or suppress."

**Rule:** different `<td>`s in same `<tr>` → snap to the **dominant cell** (mirror the cross-row 1.5× dominance rule). No dominance + the selection mixes a label cell and a value cell → **suppress** (return null; the iteration doc explicitly allows suppression for ambiguous mixed selections).

**Files:**
- Modify: `lib/highlighter/use-highlight.ts`
- Test: `lib/highlighter/use-highlight.test.ts` (jsdom — mirror the existing cross-row tests' structure)

- [ ] **Step 1: Write failing jsdom tests.** Build a `<table><tr><td>Label</td><td>$30,074</td></tr></table>`; create a Range spanning both cells; assert `snapCrossCellSelection(range)` returns a range confined to the dominant cell when one side dominates ≥1.5×; assert it returns `null` (suppress) for a balanced label+value mix.

```ts
import { describe, it, expect } from "vitest";
import { snapCrossCellSelection } from "./use-highlight"; // export it

// … build DOM via document.createElement, set textContent, create Range …
```

- [ ] **Step 2: Run — expect FAIL** (`snapCrossCellSelection` not exported / not implemented).

- [ ] **Step 3: Implement `snapCrossCellSelection(range: Range): Range | null`.** Find the common `<tr>`; if start and end are in different `<td>`s of that row: measure each cell's selected-text length; if one ≥1.5× the other, return a range clamped to the dominant cell; else return `null`. Export it.

- [ ] **Step 4: Wire it after the cross-row snap** (`use-highlight.ts:279-280`):

```ts
const rowSnapped = snapCrossRowSelection(range);
const cellSnapped = snapCrossCellSelection(rowSnapped ?? range);
if (cellSnapped === null && /* selection was cross-cell ambiguous */) return; // suppress popup
const finalRange = cellSnapped ?? rowSnapped ?? range;
```

Be careful to only suppress when the selection genuinely was cross-cell-ambiguous — a normal single-cell selection must pass through unchanged (return the input range, don't null it).

- [ ] **Step 5: Run — expect PASS.** `bun test lib/highlighter/use-highlight.test.ts`

- [ ] **Step 6: Manual smoke.** On a metrics table: drag across a label+value in one row → snaps to the dominant side or no popup (suppressed); single-cell selection still works.

- [ ] **Step 7: Commit.**

```bash
git add lib/highlighter/use-highlight.ts lib/highlighter/use-highlight.test.ts
git commit -m "feat(highlighter): cross-cell selection snapping + ambiguous-mix suppression"
```

> After this task: run the whole highlighter test set (`bun test lib/highlighter`) green, then ship the session per `../shared/conventions.md`. Build-queue item 1 → `[x]`.



# ================================================================
# SESSION FOLDER: session-2-charts-tierB-inchat__SONNET
# ================================================================

# Session 2 — Charts Tier B glue + in-chat charts  ·  **SONNET**  ·  ~2 days

> Read `../shared/conventions.md`, `../AUDIT.md` first. **`[AUDIT-FIX C2]`** is the first task — the source plan misread where rent/vacancy data comes from. **`[AUDIT-FIX C3/C4/C5]`**: `ChartBlockView` already exists (import it), import `ChartBlock` from `refinery/validate/chart-block-lint.mts`, and HBarChart is already responsive (`clamp()` shipped) so you only add a `compact` prop.

**Goal:** Wire the existing `routeChart` intent classifier (which has **no consumer** today) to data sources, emit an inline chart ahead of the streamed text answer in `/api/converse`, and render it compactly in the popup + dock with a "File this chart" button (pending until S3 saves it).

**Architecture:** new `lib/build-chart-for-intent.mts` maps a `ChartIntent` → `{ block: ChartBlock }` | `{ component: "zhvi"; data }` | `null`. `/api/converse` calls `routeChart(question)` before the LLM and emits one SSE `chart` frame ahead of text; failure skips silently (a chart never blocks an answer). The LLM never touches chart numbers. Every block passes `lintChartBlock`.

**Chart sources — fixture-first, as-of date is sufficient (operator decree 2026-06-10):** All Tier-B chart scopes ship from fixture data with an as-of date label — no live-brain precondition, no `freshness_token` required on chart items. Phase 2 ships: `CorridorRentChart` (bar, `corridor-rents.json`), `ZHVIAreaChart` (area, ZHVI fixture), `CorridorMarketScatter` (scatter, rents fixture), and `vacancy` (bar, rents fixture). Task 01 locates all fixture paths; Task 02 wires them **and** repairs ChartBlockView's area + scatter renderers (currently stub to HTML table). `flood-aal` stays on the live env-brain path (unchanged). See task-01.

**`[LB-R4]` Single source of truth for chart NUMBERS:** two chart paths exist — `computeMetricChart` (`refinery/lib/chart-from-metrics.mts`, on-the-fly for `/r/` pages) and the persisted `chart_block` jsonb in `saved_charts` (S3). They MUST NOT diverge: `computeMetricChart` is the **live render only**; the moment a chart is *saved/filed*, its block is **frozen into `saved_charts`** and the `ProjectItem` references that frozen `chart_id` — a filed chart is never recomputed. Live = recompute; filed = frozen snapshot. State this in `buildChartForIntent`'s doc comment so a future dev doesn't wire a filed chart back through `computeMetricChart`.

**Tasks (read in order):**
- [ ] `task-01-locate-rent-vacancy-datapath.md` — **`[AUDIT-FIX C2]`** locate all fixture data paths (asking-rent, zhvi, corridor-scatter, vacancy, flood-aal) + confirm ChartBlockView stubs
- [ ] `task-02-build-chart-for-intent.md` — `lib/build-chart-for-intent.mts` (all 4 fixture scopes + flood-aal), lint every block; wire area + scatter renderers in `ChartBlockView`
- [ ] `task-03-converse-chart-frame.md` — `routeChart` before LLM + SSE `chart` frame
- [ ] `task-04-client-onchart.md` — `onChart` in sse/converse/use-converse; render `ChartBlockView` compact; HBarChart `compact` prop
- [ ] `task-05-chart-this-chip.md` — "Chart this" chip in `suggestions.ts`

**Files:** new `lib/build-chart-for-intent.mts` · `lib/route-chart.ts` (read) · `app/api/converse/route.ts` · `lib/highlighter/{sse,converse,use-converse}.ts` · `components/highlighter/HighlightPopup.tsx` + `AskAiDock.tsx` · `components/charts/HBarChart.tsx` (add `compact`) · `lib/highlighter/suggestions.ts`

**Depends on:** S0 (metering), S1 (`fileItem` for "File this chart" — the chart_id arrives in S3; until then the button files a pending local block or is disabled).

**Risk:** `routeChart` false positives → the inline chart is **dismissible**, and the answer text is independent; tighten keywords with tests.

**Diff-review gate:** YES — this changes the live `/api/converse` SSE response. **Ask the operator for a diff review before pushing.**



## ----- task-01-locate-rent-vacancy-datapath.md -----

# Task 01 — Wire fixture data paths for all Tier-B charts

**Why this task changed:** The original task sent you on a hunt for "live" data paths and blocked on a prohibition on fixture data. That prohibition is **OVERRIDDEN by operator decree (2026-06-10)**: fixture-backed charts are fully deliverable. A chart carries an as-of date (captured from the fixture's own date field) — that is the only honesty mechanism required. No `freshness_token` required on charts, no live-brain precondition, no gating.

**This is a read + findings note, no code yet. Output a short findings note that Task 02 consumes.**

- [ ] **Step 1: Read `corridor-rents.json` end-to-end.**

```bash
cat fixtures/corridor-rents.json | head -80
```

Record: corridors covered, rent field names, vacancy field names, and the `as_of` / date field that will label every chart built from this fixture.

- [ ] **Step 2: Find the ZHVI fixture path.**

```bash
ls fixtures/ | grep -iE 'zhvi|home.value|hpi'
grep -rIl 'ZHVIAreaChart\|zhvi' app/ components/ lib/ | head
```

Open the file that `ZHVIAreaChart` actually loads. Record: fixture path, series shape (date → value), and the as-of date field.

- [ ] **Step 3: Find the corridor scatter fixture path.**

```bash
grep -rIl 'CorridorMarketScatter\|corridor.*scatter\|scatter.*corridor' app/ components/ | head
```

Open that file to find where it loads data. Record: fixture path and the x-axis, y-axis, label field names.

- [ ] **Step 4: Confirm vacancy data is in the rents fixture.** Per operator: "data exists in the rents fixture, no chart draws it today." Verify the vacancy field name in `corridor-rents.json`.

- [ ] **Step 5: Confirm ChartBlockView area + scatter renderers are stubs.** Per operator: "ChartBlockView's area and scatter renderers currently stub to an HTML table." Open `components/charts/ChartBlockView.tsx` and verify which chart types render a real chart vs. fall through to an HTML table. Task 02 wires the real renderers.

- [ ] **Step 6: Locate the flood-AAL source.** Plan says "from env brain detail table via `fetchBrain`." Confirm `fetchBrain` exists and the env brain exposes an AAL-by-ZIP detail_table; record the exact accessor.

- [ ] **Step 7: Write the findings note** at `docs/superpowers/plans/2026-06-10-projects-briefcase-assembly/session-2-charts-tierB-inchat__SONNET/FINDINGS-datapaths.md` listing, per scope (`asking-rent`, `vacancy`, `zhvi`, `corridor-scatter`, `flood-aal`): fixture or live-brain source, exact path/accessor, as-of date field, and confirmed deliverable (no deferred scopes except `flood-aal` if its env brain accessor doesn't resolve).

- [ ] **Step 8: Commit the findings note.**

```bash
git add docs/superpowers/plans/2026-06-10-projects-briefcase-assembly/session-2-charts-tierB-inchat__SONNET/FINDINGS-datapaths.md
git commit -m "docs(charts): fixture data-path findings for all Tier-B chart scopes"
```



## ----- task-02-build-chart-for-intent.md -----

# Task 02 — `lib/build-chart-for-intent.mts`

**Context (verified):** `lib/route-chart.ts` exports `routeChart(question): ChartIntent | null` with scopes `asking-rent | vacancy | zhvi | vitals | flood-aal`. There is no producer turning an intent into data. Build it, using the **Task 01 findings** for each scope's real source. Import `ChartBlock` + `lintChartBlock` from `refinery/validate/chart-block-lint.mts` (`[AUDIT-FIX C4]`).

**Files:**
- Create: `lib/build-chart-for-intent.mts`
- Test: `lib/build-chart-for-intent.test.mts`

- [ ] **Step 1: Define the return contract + write failing tests.**

```ts
import { describe, it, expect } from "vitest";
import { buildChartForIntent } from "./build-chart-for-intent.mts";

describe("buildChartForIntent", () => {
  it("returns a linted bar block for asking-rent", async () => {
    const r = await buildChartForIntent({ chart_type: "bar", scope: "asking-rent" });
    expect(r && "block" in r ? r.block.chart_type : null).toBe("bar");
  });
  it("returns a zhvi component marker", async () => {
    const r = await buildChartForIntent({ chart_type: "area", scope: "zhvi" });
    expect(r && "component" in r ? r.component : null).toBe("zhvi");
  });
  it("returns a scatter component marker", async () => {
    const r = await buildChartForIntent({ chart_type: "scatter", scope: "corridor-scatter" });
    expect(r && "component" in r ? r.component : null).toBe("scatter");
  });
  it("returns a bar block for vacancy", async () => {
    const r = await buildChartForIntent({ chart_type: "bar", scope: "vacancy" });
    expect(r && "block" in r ? r.block.chart_type : null).toBe("bar");
  });
  it("returns null for deferred vitals", async () => {
    expect(await buildChartForIntent({ chart_type: "bar", scope: "vitals", corridor_slug: "x" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** Signature: `export async function buildChartForIntent(intent: ChartIntent): Promise<{ block: ChartBlock } | { component: "zhvi"; data: unknown } | { component: "scatter"; data: unknown } | null>`. Per scope, using Task 01's findings — **all four are fixture-sourced; as-of date comes from the fixture's own date field**:
  - `asking-rent` → `corridor-rents.json` fixture → `CorridorRentChart`, shape ≤6 rows into a `ChartBlock` (bar), include `as_of_date` from fixture metadata, **pass through `lintChartBlock`**; if lint fails return `null`.
  - `vacancy` → `corridor-rents.json` fixture vacancy field → bar `ChartBlock` with `as_of_date`, lint.
  - `zhvi` → ZHVI fixture → `{ component: "zhvi", data }` (`ZHVIAreaChart` renderer handles it — `components/viz/ZHVIAreaChart.tsx` exists).
  - `corridor-scatter` → rents fixture → `{ component: "scatter", data }` (`CorridorMarketScatter` renderer).
  - `flood-aal` → env brain AAL-by-ZIP detail_table (live, per Task 01 findings) → bar block → lint.
  - `vitals` → `null` (deferred, A8).
  - Any error / <3 comparable points → `null`. **Never invent a number; lint is the gate.**

  **Also in this step: wire ChartBlockView area + scatter renderers.** Per Task 01, `components/charts/ChartBlockView.tsx` currently stubs area and scatter chart types to an HTML table. Replace those stubs: area → `ZHVIAreaChart` (or a generic Recharts `AreaChart`); scatter → `CorridorMarketScatter`. Both chart types must actually draw after this task ships.

- [ ] **Step 4: Run — expect PASS.** Then `npm run refinery:typecheck` adds no NEW errors for this file (baseline debt is accepted — `reference_refinery-typecheck-exits-nonzero`; run it alone, compare against baseline).

- [ ] **Step 5: Commit.**

```bash
git add lib/build-chart-for-intent.mts lib/build-chart-for-intent.test.mts
git commit -m "feat(charts): buildChartForIntent (Tier B producer) — lint-gated, per Task01 datapaths"
```



## ----- task-03-converse-chart-frame.md -----

# Task 03 — Emit an SSE `chart` frame from `/api/converse`

**Context (verified):** `app/api/converse/route.ts` is an SSE route (returns `text/event-stream`) that streams text from Claude Haiku (`TRIAGE_MODEL = "claude-haiku-4-5"`). It does **no** chart routing today. Add: before the LLM call, run `routeChart(question)` → `buildChartForIntent` → emit ONE `chart` SSE frame ahead of the text stream. On any failure, skip silently — **a chart must never block or delay the text answer.**

**Files:**
- Modify: `app/api/converse/route.ts`

- [ ] **Step 1: Route the chart before the text stream.** Near the top of the stream body, before the Haiku call:

```ts
import { routeChart } from "@/lib/route-chart";
import { buildChartForIntent } from "@/lib/build-chart-for-intent.mts";

// inside the stream's start(controller):
try {
  const intent = routeChart(question);
  if (intent) {
    const chart = await buildChartForIntent(intent);
    if (chart) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chart })}\n\n`));
    }
  }
} catch { /* chart is best-effort — never block the answer */ }
// … existing text stream continues unchanged …
```

Match the existing SSE frame format in this file exactly (the audit confirmed `data: {...}\n\n` frames for text/done/reach/answered). The `chart` frame is just another typed frame the client learns to read (Task 04).

- [ ] **Step 2: LLM isolation.** Confirm the chart data is built entirely in code (`buildChartForIntent`) and the prompt sent to Haiku is unchanged — the LLM never sees or generates chart numbers (Tier C NL charts stay deferred, A8).

- [ ] **Step 3: Manual SSE smoke.** `bun run dev`, then:

```bash
curl -N -s "http://localhost:3000/api/converse" -H 'content-type: application/json' \
  -d '{"question":"what are asking rents in the corridors?","reportId":"master"}' | head -20
```

Expected: a `data: {"chart":{"block":{...}}}` frame appears **before** the text frames. Then an off-scope question (e.g. "what's the weather") emits NO chart frame, text only.

- [ ] **Step 4: Commit (do NOT push yet — diff-review gate).**

```bash
git add app/api/converse/route.ts
git commit -m "feat(charts): emit best-effort SSE chart frame from /api/converse (LLM never touches numbers)"
```

> **Diff-review gate (RULE 1):** `/api/converse` is a live response surface. Before the session push, show the operator the diff of this route and get the OK.



## ----- task-04-client-onchart.md -----

# Task 04 — Client `onChart` + render `ChartBlockView` compact + HBarChart `compact` prop

**Context (verified):** `lib/highlighter/sse.ts` has `parseSSEFrames()` (text/done/reach/answered/error). `lib/highlighter/converse.ts` exposes handlers `onText/onReach/onFollowups/onAnswered/onError/onDone` — **no `onChart`**. `use-converse.ts` wraps them. `ChartBlockView` (`components/charts/ChartBlockView.tsx`) **exists** — import it. HBarChart has no `compact` prop yet (`[AUDIT-FIX C5]`: it IS already responsive via `clamp()`; just add a density toggle).

**Files:**
- Modify: `lib/highlighter/sse.ts`, `converse.ts`, `use-converse.ts`
- Modify: `components/highlighter/HighlightPopup.tsx`, `AskAiDock.tsx`
- Modify: `components/charts/HBarChart.tsx` (add `compact?: boolean`)

- [ ] **Step 1: Parse the `chart` frame.** In `sse.ts`, extend `parseSSEFrames` to recognize a frame whose JSON has a `chart` key and surface it as a `{ type: "chart", chart }` event. In `converse.ts`, add an `onChart?(chart)` handler and call it. In `use-converse.ts`, expose `chart` state (the last chart received) + reset it on a new ask.

- [ ] **Step 2: Add `compact` to HBarChart.** `compact?: boolean` (default false). When true, tighten the `clamp()` ranges / font sizes for the in-popup width. Keep the existing fluid behavior; `compact` only shrinks the floors. Do not touch the gsap animation (Session 5 handles the print frame).

- [ ] **Step 3: Render in popup + dock.** Above the streamed text, when `chart` is present render `<ChartBlockView block={chart.block} />` (or `<ZHVIAreaChart … />` when `chart.component === "zhvi"`) in a dismissible container with a "File this chart" button. The chart is dismissible (× hides it) — covers the false-positive risk.

- [ ] **Step 4: "File this chart" wiring (pending until S3).** S3 creates `POST /api/charts/save` returning `{id}`. Until S3 ships, the button either (a) is disabled with a "saving lands next session" tooltip, or (b) files a local `{kind:"chart"}` placeholder. Choose (a) to avoid orphan refs. Leave a `// TODO(S3): POST /api/charts/save then ctx.fileItem({kind:'chart', chart_id, title})` marker — S3 task-04 replaces it.

- [ ] **Step 5: Tests + smoke.** Unit-test `parseSSEFrames` recognizes a `chart` frame. Manual: rent question → bar chart renders above prose; ZHVI question → area chart; off-scope → no chart, text only; malformed block → not rendered (lint rejected server-side in Task 02).

- [ ] **Step 6: Commit.**

```bash
git add lib/highlighter/sse.ts lib/highlighter/converse.ts lib/highlighter/use-converse.ts components/highlighter/HighlightPopup.tsx components/highlighter/AskAiDock.tsx components/charts/HBarChart.tsx
git commit -m "feat(charts): client onChart + compact ChartBlockView render in popup/dock"
```



## ----- task-05-chart-this-chip.md -----

# Task 05 — "Chart this" chip in `suggestions.ts`

**Context (verified):** `lib/highlighter/suggestions.ts` generates suggestion chips (`suggestionsForMetric`, `suggestionsForSpan`, `suggestionsForSelection`, `deriveSelectionType`). Add a "Chart this" chip for metric/place selections, phrased so it hits `routeChart` (Task 03) and produces an inline chart.

**Files:**
- Modify: `lib/highlighter/suggestions.ts`
- Test: `lib/highlighter/suggestions.test.ts` (if present; else add)

- [ ] **Step 1: Add the chip.** For selection types `metric` and `place`, prepend a chip whose text is phrased to match a `routeChart` keyword for the relevant scope (e.g. a rent metric → "Chart asking rents across the corridors"; a place → "How is {place} doing?" only if vitals were live — since vitals is deferred, prefer a scope that resolves, e.g. flood or rent). Keep chips that won't route OUT (don't offer "Chart this" when no scope resolves — a dead chip is worse than none).

- [ ] **Step 2: Test routing alignment.** Add a test asserting the generated "Chart this" chip text, when fed to `routeChart`, returns a non-null intent (so the chip never dead-ends).

```ts
import { routeChart } from "@/lib/route-chart";
// for each generated chart chip: expect(routeChart(chipText)).not.toBeNull();
```

- [ ] **Step 3: Run tests green; manual smoke** — select a rent metric → "Chart this" chip appears → click → inline chart renders.

- [ ] **Step 4: Commit, then ship the session.**

```bash
git add lib/highlighter/suggestions.ts lib/highlighter/suggestions.test.ts
git commit -m "feat(charts): 'Chart this' chip routed to buildChartForIntent"
```

> Ship per `../shared/conventions.md`. **Diff-review gate applies (Task 03 touched `/api/converse`)** — show the operator the converse diff before pushing. Flip build-queue item 2 → `[x]`.



# ================================================================
# SESSION FOLDER: session-3-saved-charts-c-route__SONNET
# ================================================================

# Session 3 — `saved_charts` table + `/c/[id]` page  ·  **SONNET**  ·  ~1 day

> Read `../shared/conventions.md`, `../AUDIT.md`. This is boards-spec part 1 **as written** (names unchanged: `saved_charts`, `/c/[id]`, `/api/charts/save`). Verified net-new: no `saved_charts` table and no `/c/` route exist today.

**Goal:** Persist a linted `ChartBlock` to a public, shareable `saved_charts` row; render it at `/c/[id]`; wire Session 2's "File this chart" to actually save then file `{kind:"chart", chart_id}`.

**Architecture:** `id` is a short server-generated slug (`crypto.randomUUID().slice(0,8)`). Public SELECT (unguessable id, same trust model the boards spec set — acceptable here because saved charts are public *market* data, not client-specific; contrast deliverables in S6 which need ≥122-bit slugs per `[LB-R5]`), service-role writes (copy the waitlist GRANT pattern). Lint on save → 422 on structural fail (never persist a malformed block).

**`[LB-R4]` Authoritative numbers:** the `chart_block` jsonb stored here is the **frozen single source of truth** for a saved chart's numbers. `computeMetricChart` (`refinery/lib/chart-from-metrics.mts`) is the live `/r/` render and is NEVER the source for a saved/filed chart — once saved, the block is frozen and the `ProjectItem`'s `chart_id` always reads it back from `saved_charts`. The two paths cannot diverge because a filed chart is never recomputed.

**Tasks (in order):**
- [ ] `task-01-saved-charts-sql.md` — idempotent SQL + RLS public-select + service-role grant
- [ ] `task-02-charts-save-route.md` — `POST /api/charts/save` (lint → 422 / insert → `{id}` + meter `chart_save`)
- [ ] `task-03-c-id-page.md` — `app/c/[id]/page.tsx` renders `ChartBlockView` + provenance + token + "Add to project"
- [ ] `task-04-wire-file-this-chart.md` — replace S2's `TODO(S3)` marker; save then `ctx.fileItem({kind:'chart'})`

**Files:** new `docs/sql/20260611_saved_charts.sql` · `app/api/charts/save/route.ts` · `app/c/[id]/page.tsx` · `components/highlighter/HighlightPopup.tsx` (+dock) — replace the S2 TODO.

**Depends on:** S2 (the inline chart block + "File this chart" button).

**Risk:** public-read abuse → unguessable ids + the existing IP rate-limiter; meter `chart_save`.

**Diff-review gate:** none beyond the standard (new public read route — note it to the operator). Standard ship checklist.



## ----- task-01-saved-charts-sql.md -----

# Task 01 — `saved_charts` table (idempotent SQL)

**Files:** Create `docs/sql/20260611_saved_charts.sql`. Run it yourself (creds in `.dlt/secrets.toml`).

- [ ] **Step 1: Write the migration** (per boards spec §1; RLS ON, public SELECT, service-role write — mirror the existing waitlist/usage_events grant pattern):

```sql
-- 20260611_saved_charts.sql — anonymous, shareable saved chart. Idempotent.
CREATE TABLE IF NOT EXISTS public.saved_charts (
  id              text PRIMARY KEY,
  chart_block     jsonb NOT NULL,
  source_meta     jsonb,
  freshness_token text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_charts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY saved_charts_public_select ON public.saved_charts FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- writes go through service_role only (no anon/authenticated INSERT policy)
GRANT SELECT ON public.saved_charts TO anon, authenticated;
GRANT ALL    ON public.saved_charts TO service_role;
```

- [ ] **Step 2: Apply + reload PostgREST schema** (per `feedback_dlt-postgrest-grant`):

```bash
python -c "import psycopg, ...; conn.execute(open('docs/sql/20260611_saved_charts.sql').read()); conn.execute(\"NOTIFY pgrst,'reload schema'\"); conn.commit(); print('ok')"
```

- [ ] **Step 3: Verify** the table + policy exist (query `pg_policies` for `saved_charts_public_select`).

- [ ] **Step 4: Commit.** `git add docs/sql/20260611_saved_charts.sql && git commit -m "feat(charts): saved_charts table (public select, service-role write)"`



## ----- task-02-charts-save-route.md -----

# Task 02 — `POST /api/charts/save`

**Files:** Create `app/api/charts/save/route.ts`. Test: `app/api/charts/save/route.test.ts`.

**Contract:** body `{ block: ChartBlock; source_meta?: object; freshness_token?: string }` → lint the block; **422 if structural lint fails (never persist malformed)**; else insert via service-role with id `crypto.randomUUID().slice(0,8)`; meter `chart_save`; return `{ id }`.

- [ ] **Step 1: Failing test** — a malformed block → 422; a valid block → 200 `{id}` of length 8.

- [ ] **Step 2: Implement.**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { lintChartBlock, type ChartBlock } from "@/refinery/validate/chart-block-lint.mts"; // [AUDIT-FIX C4]
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { recordUse } from "@/lib/highlighter/meter";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.block) return NextResponse.json({ error: "no block" }, { status: 400 });
  const lint = lintChartBlock(body.block as ChartBlock);  // structural; provenance optional
  if (!lint.ok) return NextResponse.json({ error: "invalid chart", detail: lint.errors }, { status: 422 });
  const id = crypto.randomUUID().slice(0, 8);
  const db = createServiceRoleClient();
  const { error } = await db.from("saved_charts").insert({
    id, chart_block: body.block, source_meta: body.source_meta ?? null, freshness_token: body.freshness_token ?? null,
  });
  if (error) return NextResponse.json({ error: "save failed" }, { status: 500 });
  await recordUse(req, { report_id: body.source_meta?.report_id ?? "", reach: [], action: "chart_save" });
  return NextResponse.json({ id });
}
```

> Confirm `lintChartBlock`'s real return shape (`{ok, errors}` vs throw) against `refinery/validate/chart-block-lint.mts` and adapt — the audit confirmed the function exists; verify its signature in-session.

- [ ] **Step 3: Tests green; commit.** `git add app/api/charts/save/route.ts app/api/charts/save/route.test.ts && git commit -m "feat(charts): POST /api/charts/save (lint->422, meter chart_save)"`



## ----- task-03-c-id-page.md -----

# Task 03 — `app/c/[id]/page.tsx`

**Files:** Create `app/c/[id]/page.tsx`.

**Contract:** server component; reads `saved_charts` by id (anon/public client is fine — public SELECT policy); 404 if missing; renders `<ChartBlockView block={row.chart_block} />` inside a minimal `ReportShell` with the provenance line + freshness token + an "Add to project" button (files `{kind:"chart", chart_id:id, title}` into the draft via the highlighter context, or prompts login to add to a saved project).

- [ ] **Step 1:** Fetch the row server-side; 404 via `notFound()` when absent.
- [ ] **Step 2:** Render `ChartBlockView` (exists), provenance from `source_meta`, and `freshness_token` verbatim (data-protocol-v3 rule 2 — quote it). Reuse `ReportShell`/`Stat` from the report shell.
- [ ] **Step 3: "Add to project"** — client island that calls `ctx.fileItem({kind:"chart", chart_id:id, title})`. (On `/c/[id]` there may be no `HighlighterProvider`; if so, the button writes directly to the `swfl_project_draft_v1` localStorage key via the same helper S1 exposes, or links to `/project/draft`.)
- [ ] **Step 4: Verify** `/c/<id>` renders the chart logged-out; provenance + token visible.
- [ ] **Step 5: Commit.** `git add app/c/[id]/page.tsx && git commit -m "feat(charts): /c/[id] public saved-chart page with provenance + token"`



## ----- task-04-wire-file-this-chart.md -----

# Task 04 — Wire S2's "File this chart" to real save

**Context:** Session 2 left a `// TODO(S3): POST /api/charts/save then ctx.fileItem({kind:'chart', chart_id, title})` marker (the button was disabled). Now `POST /api/charts/save` exists — complete the flow.

**Files:** Modify `components/highlighter/HighlightPopup.tsx` (+ `AskAiDock.tsx` if it also renders the chart).

- [ ] **Step 1:** Replace the marker: on "File this chart", `POST /api/charts/save` with `{ block, source_meta:{report_id}, freshness_token }`; on `{id}`, call `ctx.fileItem({ id: crypto.randomUUID(), added_at: new Date().toISOString(), origin:"web", kind:"chart", chart_id:id, title })`; fire `item_add` meter. Enable the button (remove the disabled state).
- [ ] **Step 2:** Error handling — save fails → toast/inline message, do NOT file a dangling ref.
- [ ] **Step 3: Manual smoke** — ask a rent question → inline chart → "File this chart" → briefcase badge increments → the filed item is `{kind:"chart"}` with a real `chart_id` → `/c/<chart_id>` renders it.
- [ ] **Step 4: Commit, then ship the session** per `../shared/conventions.md`. Build-queue: mark `/c/[id]` sub-item progress.

```bash
git add components/highlighter/HighlightPopup.tsx components/highlighter/AskAiDock.tsx
git commit -m "feat(charts): File-this-chart saves to saved_charts then files chart ref"
```



# ================================================================
# SESSION FOLDER: session-4-projects-rls-authgate__OPUS
# ================================================================

# Session 4 — `public.projects` + first RLS + first gated route  ·  **OPUS**  ·  ~2–2.5 days

> Read `../shared/conventions.md`, `../shared/data-model.md`, `../AUDIT.md`. **Why Opus:** this writes the codebase's **first `auth.uid() = user_id` RLS policy** and its **first gated route**. The named top risk: a middleware regression locks public pages. Cross-user leakage is the moat-breaker. Both demand the careful tier.

**Goal:** Persist projects per-user with RLS, expose CRUD via cookie-scoped API routes (RLS applies — never service-role here), migrate the anonymous localStorage draft on login, render `/project/[id]` (+ list), gate `/project/*` behind auth (but `/project/draft` stays public).

**Architecture:** `projects(id, user_id, title, items jsonb, branding jsonb, mcp_key text UNIQUE, created_at, updated_at)`; RLS `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`; `GRANT … TO authenticated`, `REVOKE ALL FROM anon`. API routes use the **cookie client** (`utils/supabase/server.ts`) so RLS enforces ownership. A service-role lane exists only for MCP/build (later sessions). `middleware.ts` gates only the `/project` prefix via Supabase `getUser()`.

**Tasks (in order):**
- [ ] `task-01-projects-sql-rls.md` — table + the first `auth.uid()` policy (idempotent, `duplicate_object` guard)
- [ ] `task-02-projects-api-routes.md` — `/api/projects` (POST), `/api/projects/[id]` (GET/PATCH/DELETE), cookie client, zod-validate items
- [ ] `task-03-import-draft-migration.md` — `/api/projects/import` (localStorage draft → first project row)
- [ ] `task-04-project-pages.md` — `/project/[id]` (+ `/project` list) inline item render + branding edit + freshness-age badges `[ADDED]`
- [ ] `task-05-middleware-gate-and-next-fix.md` — gate `/project/*`; **`[AUDIT-FIX C1]`** thread `next` through login-form
- [ ] `task-06-two-account-live-verify.md` — two magic-link accounts, cross-read DENIED; close `projects_rls_live_verify`

**Files:** new `docs/sql/20260612_projects.sql` · `app/api/projects/route.ts` · `app/api/projects/[id]/route.ts` · `app/api/projects/import/route.ts` · `app/project/[id]/page.tsx` · `app/project/page.tsx` · `middleware.ts` · `app/login/login-form.tsx`

**Depends on:** S1 (`ProjectItem` + localStorage draft), S3 (chart ref render).

**Vendor-First (WebFetch in-session):** Supabase SSR middleware-auth pattern + `@supabase/ssr` ~0.10.x `getUser()` API. Wrong call = locked public pages.

**Risk:** middleware regression → **gate ONLY the `/project` prefix**, add a route test, AND the two-account live deny test before closing the check.

**Diff-review gate:** YES — touches `middleware.ts` (could change every page's auth behavior). Show the operator the middleware + login-form diff before pushing.



## ----- task-01-projects-sql-rls.md -----

# Task 01 — `public.projects` + the first `auth.uid()` RLS policy

**Files:** Create `docs/sql/20260612_projects.sql`. Run it yourself. **This is the first row-level-security policy in the repo** (audit confirmed zero `auth.uid()` policies exist) — get it exactly right.

- [ ] **Step 1: Write the migration** (idempotent; `duplicate_object` guards; both `USING` and `WITH CHECK`):

```sql
-- 20260612_projects.sql — per-user projects with RLS. Idempotent.
CREATE TABLE IF NOT EXISTS public.projects (
  id          text PRIMARY KEY,
  user_id     uuid NOT NULL,
  title       text,
  items       jsonb NOT NULL DEFAULT '[]'::jsonb,
  branding    jsonb,
  mcp_key     text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY projects_owner_all ON public.projects
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.projects FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT  ALL ON public.projects TO service_role;  -- MCP/build lane only (S6/S9), never the cookie API
```

- [ ] **Step 2: Apply + reload schema** (`NOTIFY pgrst,'reload schema'`).

- [ ] **Step 3: Verify the policy is FOR ALL with both clauses:**

```bash
python -c "import psycopg, ...; print(conn.execute(\"select polname, polcmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid) from pg_policy where polrelid='public.projects'::regclass\").fetchall())"
```

Expect `projects_owner_all`, cmd `*` (ALL), both quals = `(auth.uid() = user_id)`.

- [ ] **Step 4: Commit.** `git add docs/sql/20260612_projects.sql && git commit -m "feat(projects): projects table + FIRST auth.uid() RLS policy"`

> The runtime proof that RLS actually denies cross-user reads is Task 06 (two real accounts) — do NOT close `projects_rls_live_verify` on this SQL alone (`feedback_checks-prod-evidence-not-dev-attestation`).



## ----- task-02-projects-api-routes.md -----

# Task 02 — `/api/projects` CRUD (cookie client, RLS-enforced)

**Critical rule:** these routes use the **cookie client** (`createClient(cookieStore)` from `utils/supabase/server.ts`), NOT the service-role client. RLS is the authorization — using service-role here would bypass ownership and leak across users.

**Files:** Create `app/api/projects/route.ts` (POST create) + `app/api/projects/[id]/route.ts` (GET/PATCH/DELETE). Test: route tests for each.

- [ ] **Step 1: Failing tests** — unauthenticated POST → 401; PATCH with an invalid `items` payload → 422 (zod); GET someone else's project → 404/empty (RLS).

- [ ] **Step 2: POST /api/projects** — require a session (`supabase.auth.getUser()`); insert `{ id: crypto.randomUUID().slice(0,12), user_id: user.id, title, items: validated }`; meter `project_create`; return `{id}`.

- [ ] **Step 3: GET/PATCH/DELETE /api/projects/[id]** — all via the cookie client so RLS scopes to the owner. PATCH validates `items` with `projectItemsSchema` (`lib/project/items.ts`) → 422 on failure; bumps `updated_at`. DELETE removes the row.

```ts
import { projectItemsSchema } from "@/lib/project/items";
// PATCH body.items -> projectItemsSchema.safeParse(...); if !success return 422
```

- [ ] **Step 4: Never service-role.** Grep your two new files for `service-role`/`createServiceRoleClient` → must be ZERO matches. (Self-check; this is the leak vector.)

- [ ] **Step 5: Tests green; commit.** `git add app/api/projects/route.ts "app/api/projects/[id]/route.ts" && git commit -m "feat(projects): cookie-scoped CRUD (RLS-enforced), zod-validated items"`



## ----- task-03-import-draft-migration.md -----

# Task 03 — `POST /api/projects/import` (anonymous draft → first project)

**Context:** the anonymous briefcase lives in `localStorage swfl_project_draft_v1` (S1) as a `ProjectItem[]` — the SAME shape as `projects.items`, so migration is a straight insert (no transform).

**Files:** Create `app/api/projects/import/route.ts`. Client change in `app/project/[id]/page.tsx` or a post-login hook to POST the draft then clear localStorage.

- [ ] **Step 1:** Route requires a session; body `{ items: ProjectItem[], title? }`; `projectItemsSchema.parse` (422 on bad); insert a new project owned by `user.id`; return `{id}`.
- [ ] **Step 2: Client migration** — after login, if `swfl_project_draft_v1` is non-empty, POST it to `/api/projects/import`, then `localStorage.removeItem("swfl_project_draft_v1")` and redirect to `/project/<id>`. Do this in an event/callback (post-auth), **not** a render-effect that setStates (react-hooks rule).
- [ ] **Step 3: Verify** — file items anonymously → log in → the items appear as a new saved project → localStorage draft cleared.
- [ ] **Step 4: Commit.** `git add app/api/projects/import/route.ts && git commit -m "feat(projects): import anonymous draft to first owned project on login"`



## ----- task-04-project-pages.md -----

# Task 04 — `/project/[id]` + `/project` list (+ freshness-age badges `[ADDED]`)

**Files:** Create `app/project/[id]/page.tsx`, `app/project/page.tsx`. Reuse `ReportShell` + locked hexes + `Stat`/`ChartBlockView`.

- [ ] **Step 1: `/project` list** — the user's projects (cookie client / RLS), each linking to `/project/[id]`, with a "New project" action.
- [ ] **Step 2: `/project/[id]` item rendering** — render each `ProjectItem` inline by kind:
  - `chart` → join `saved_charts` by `chart_id`, render `ChartBlockView`
  - `metric` → `Stat` (value + source line)
  - `qa` → prose (question + answer)
  - `report` → a card linking `/r/[slug]`
  - `note` → plain text · `source` → a labeled link row · `table_slice` → a small table · `file` → (S8 renders these; until then show a placeholder)
- [ ] **Step 3: Reorder / remove** items (PATCH the `items` array) and a **branding edit form** (agent name/photo/license/brokerage → `projects.branding`).
- [ ] **Step 4: As-of date (SCOPED DOWN — operator 2026-06-10).** For each item carrying a `freshness_token` (format `SWFL-7421-v{n}-{YYYYMMDD}`), show the parsed **as-of date** plainly. Do NOT build a relative-age/"may have updated" badge or a refresh affordance — overkill for v1 (users build over days/weeks). The token stays pinned (moat); live-refresh is a higher-tier future feature. Never silently re-fetch.
- [ ] **Step 5: "Build deliverable" (S6) + "Save as PDF" (S5) buttons** — render them now, wired in their sessions (leave `// TODO(S5)` / `// TODO(S6)` markers).
- [ ] **Step 6: Verify** logged-in render of a seeded project with mixed item kinds; reorder/remove persists; branding saves.
- [ ] **Step 7: Commit.** `git add "app/project/[id]/page.tsx" app/project/page.tsx && git commit -m "feat(projects): project list + detail render (inline items, branding, freshness-age)"`



## ----- task-05-middleware-gate-and-next-fix.md -----

# Task 05 — Gate `/project/*` + `[AUDIT-FIX C1]` fix `next` threading

**Two changes. Both are auth-path — Vendor-First WebFetch the Supabase SSR middleware pattern first.**

## Part A — gate only `/project/*`

**Context (verified):** `middleware.ts` rate-limits public API then `return createClient(request)` (Supabase session refresh). S0 added the `sdg_cid` mint. Now add: if the path starts with `/project/` AND it's not `/project/draft`, require an authed user via `getUser()`; redirect to `/login?next=<path>` when absent.

- [ ] **Step 1:** In the non-rate-limited branch, after building the Supabase response, check the path:

```ts
const isProject = pathname.startsWith("/project/") || pathname === "/project";
const isPublicDraft = pathname === "/project/draft";
if (isProject && !isPublicDraft) {
  const { data: { user } } = await supabase.auth.getUser(); // use the SSR client per vendor docs
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
}
```

Wire this through the existing `createClient(request)` helper without breaking its cookie-refresh response. **Gate ONLY the `/project` prefix** — every other path must behave exactly as before (the lock-out risk).

- [ ] **Step 2: Route test** — `/r/master` (public) → 200 untouched; `/project/abc` unauthenticated → 302 to `/login?next=/project/abc`; `/project/draft` → 200 (public).

## Part B — `[AUDIT-FIX C1]` thread `next` through login-form

**Context (verified):** `app/auth/callback/route.ts:8-15` ALREADY forwards `next`. The gap is `app/login/login-form.tsx:19`, which hardcodes `emailRedirectTo` to `/auth/callback` and DROPS the `next` prop it receives from `app/login/page.tsx`.

- [ ] **Step 3:** In `login-form.tsx`, append the received `next` to the callback URL:

```ts
const callback = new URL("/auth/callback", window.location.origin);
if (next) callback.searchParams.set("next", next);
await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback.toString() } });
```

- [ ] **Step 4: Verify the full loop** — visit `/project/abc` logged-out → redirected to `/login?next=/project/abc` → magic link → callback consumes `next` → land on `/project/abc`.

- [ ] **Step 5: Commit (hold for diff review).** `git add middleware.ts app/login/login-form.tsx && git commit -m "feat(auth): gate /project/*; [AUDIT-FIX C1] thread next through magic-link"`

> **Diff-review gate:** `middleware.ts` affects every page. Show the operator this diff before the session push.



## ----- task-06-two-account-live-verify.md -----

# Task 06 — Two-account live RLS verify + close `projects_rls_live_verify`

**Why:** the RLS policy is only *proven* by a real cross-user denial in prod. This is the first RLS in the codebase — verify it for real (`feedback_checks-prod-evidence-not-dev-attestation`).

- [ ] **Step 1: Ship** the session (after the operator's diff-review OK on middleware/login-form), per `../shared/conventions.md`.
- [ ] **Step 2: Account A** — magic-link login, create a project, note its `id`. Confirm `/project/<id>` renders for A.
- [ ] **Step 3: Account B** (second email) — log in, then GET `/api/projects/<A's id>` and visit `/project/<A's id>`. **Expected: 404 / empty (RLS denies).** If B can read A's project, RLS is broken — STOP, fix, do not close.
- [ ] **Step 4: Anon** — hit `/project/<A's id>` logged-out → redirected to `/login?next=…`. `/project/draft` → public.
- [ ] **Step 5: Import** — anonymous draft (file items logged-out) → log in as A → draft becomes a project, localStorage cleared. Confirm `project_create`/`item_add` meter rows landed.
- [ ] **Step 6: Close** with evidence:

```bash
node scripts/check.mjs close projects_rls_live_verify "prod: acct B cross-read of acct A project DENIED (404); anon gated; draft import works; meter rows present"
```

Build-queue: `/project` + RLS sub-item → `[x]`.



# ================================================================
# SESSION FOLDER: session-5-print-css-pdf__SONNET
# ================================================================

# Session 5 — Print CSS + PDF v1  ·  **SONNET**  ·  ~1 day

> Read `../shared/conventions.md`, `../AUDIT.md`. **`[AUDIT-FIX C5]`**: HBarChart is already responsive (`clamp()` shipped); the only chart work here is a `beforeprint` final-width frame (gsap animates width 0→% at `HBarChart.tsx:92-126`, so an immediate print can catch `width:0`). No server PDF lib (would trip the lockfile gate). PDF = `window.print()`.

**Goal:** A clean print stylesheet that hides all floating chrome and keeps every citation + freshness token visible, a print-stable chart frame, and "Save as PDF" buttons (metered `export_print`) on `/project/[id]`, `/c/[id]`, `/r/[slug]`.

**Tasks (in order):**
- [ ] `task-01-print-css-block.md` — `@media print` in `app/globals.css`
- [ ] `task-02-hbar-print-frame.md` — `beforeprint` listener sets bars to final widths
- [ ] `task-03-save-as-pdf-buttons.md` — buttons + meter `export_print`; replace S4's `// TODO(S5)`
- [ ] `task-04-real-device-verify.md` — iOS Safari + Android Chrome share-sheet → Save as PDF

**Files:** `app/globals.css` · `components/charts/HBarChart.tsx` · `app/project/[id]/page.tsx` · `app/c/[id]/page.tsx` · `app/r/[slug]/page.tsx`

**Depends on:** S3 (`/c/[id]`), S4 (`/project/[id]`).

**Risk:** iOS fidelity + the gsap zero-width frame → real-device test, not just desktop print preview.

**Diff-review gate:** none. Standard ship.



## ----- task-01-print-css-block.md -----

# Task 01 — `@media print` block in `app/globals.css`

**Files:** Modify `app/globals.css` (net-new print block). Add a shared `.print-hide` class to the floating chrome components (FAB, dock, ticker, briefcase, action strips, buttons).

- [ ] **Step 1:** Add a `.print-hide` className to: Ask-AI FAB, dock, the news/ticker, the briefcase button+tray, every page's action strip / "Save as PDF" / "Build" buttons.

- [ ] **Step 2:** Add the print block:

```css
@media print {
  .print-hide { display: none !important; }
  html, body { background: #fff !important; color: #000 !important; }
  /* keep provenance + freshness tokens visible — they ARE the deliverable's value */
  .citation, .freshness-token, .source-line { display: block !important; color: #000 !important; }
  .report-item, .project-item, figure { break-inside: avoid; }
  .chart, .chart-block { width: 100% !important; }
  a[href]::after { content: ""; } /* don't append raw URLs inline; citations already show them */
}
```

Match the real class names in `ReportShell`/`ChartBlockView`/project pages — grep for the citation/freshness/source elements and align the selectors (`feedback_fill-in-commands-dont-template`).

- [ ] **Step 2b:** Confirm `break-inside: avoid` keeps each item whole across page breaks and charts go full-width.

- [ ] **Step 3: Commit.** `git add app/globals.css && git commit -m "feat(pdf): print stylesheet — hide chrome, keep citations+token, page-break items"`



## ----- task-02-hbar-print-frame.md -----

# Task 02 — HBarChart `beforeprint` final-width frame

**Context (verified):** `HBarChart.tsx:92-126` uses gsap to animate bar width `0 → ${pcts[i]}%`. If the user prints before/while the animation runs, bars render at `width:0`. Add a `beforeprint` listener that snaps bars to their final widths.

**Files:** Modify `components/charts/HBarChart.tsx`.

- [ ] **Step 1:** Add a `beforeprint` window listener (added/removed in a `useEffect` with cleanup — note: *adding an event listener* in an effect is fine; the banned pattern is calling `setState` in the effect body. This listener calls gsap.set, not setState):

```ts
useEffect(() => {
  const onBeforePrint = () => {
    // snap every bar to its final width immediately
    bars.forEach((el, i) => gsap.set(el, { width: `${pcts[i]}%` }));
  };
  window.addEventListener("beforeprint", onBeforePrint);
  return () => window.removeEventListener("beforeprint", onBeforePrint);
}, [pcts]);
```

Reference the same `bars`/`pcts` the animation uses (read the existing gsap block to reuse its refs). styled-jsx class names are targetable from `globals.css` but watch specificity — prefer the gsap.set approach over CSS for the width snap.

- [ ] **Step 2: Verify** — desktop print preview of an `/r/` page with a bar chart shows full-width bars even when invoked immediately on load.

- [ ] **Step 3: Commit.** `git add components/charts/HBarChart.tsx && git commit -m "feat(pdf): HBarChart beforeprint final-width frame (no zero-width bars)"`



## ----- task-03-save-as-pdf-buttons.md -----

# Task 03 — "Save as PDF" buttons (metered `export_print`)

**Files:** `app/project/[id]/page.tsx` (replace S4's `// TODO(S5)` marker), `app/c/[id]/page.tsx`, `app/r/[slug]/page.tsx`.

- [ ] **Step 1:** A small client `PrintButton` island: meters `export_print` (`fetch("/api/meter", {method:"POST", body: JSON.stringify({action:"export_print", report_id})})`) then `window.print()`. Give it `className="print-hide"` so it doesn't appear in the PDF.
- [ ] **Step 2:** Mount it on all three pages (project detail, `/c/[id]`, `/r/[slug]`).
- [ ] **Step 3: Verify** the meter row lands and the print dialog opens with chrome hidden.
- [ ] **Step 4: Commit.** `git add "app/project/[id]/page.tsx" "app/c/[id]/page.tsx" "app/r/[slug]/page.tsx" && git commit -m "feat(pdf): Save-as-PDF buttons, metered export_print"`



## ----- task-04-real-device-verify.md -----

# Task 04 — Real-device print verify

**Why:** iOS Safari print fidelity is the known pain point and the operator's users are on phones. Desktop print preview is NOT sufficient (Vendor-First: this surface is real-device, not docs).

- [ ] **Step 1: iOS Safari** — open a `/project/[id]` (or `/r/`) page → Share sheet → Print → pinch-zoom preview → Save to Files as PDF. Confirm: no FAB/dock/ticker/buttons; white bg; charts full-width with non-zero bars; **every citation + freshness token visible**; items don't split awkwardly across pages.
- [ ] **Step 2: Android Chrome** — ⋮ → Share/Print → Save as PDF. Same checklist.
- [ ] **Step 3:** Note any device-specific defect in `SESSION_LOG`; fix or file a follow-up `check` if it can't be fixed in this session.
- [ ] **Step 4:** Ship the session per `../shared/conventions.md`. Build-queue: PDF sub-item → `[x]`.



# ================================================================
# SESSION FOLDER: session-6-assembly-engine__OPUS
# ================================================================

# Session 6 — Assembly engine: `POST /api/projects/[id]/build` → `/p/[id]`  ·  **OPUS**  ·  ~3 days

> Read `../shared/conventions.md`, `../shared/data-model.md`, `../AUDIT.md`. **Why Opus:** this is the moat. The assembly LLM writes connective prose over filed items and **must not invent a number**. The structural guarantee = forced-tool output + a number-anchor lint + regenerate-then-strip. A leak here breaks the whole "system prevents it, not AI virtue" promise (`project_structural-guarantee-not-ai-virtue`).

**Goal:** Turn a project's filed items + one instruction into a professional, fully-cited deliverable in seconds: pick a template, run ONE forced-tool LLM call for connective narrative only, lint every number against the item snapshots, render a hosted `/p/[id]` page with provenance under every exhibit.

**Architecture:** `deliverables(id, project_id, user_id, template, instruction, narrative jsonb, items_snapshot jsonb, branding jsonb, status, created_at)`. `items_snapshot` deep-copies items + resolved chart blocks so the deliverable never drifts under its project. Deterministic templates (`lib/deliverable/templates.ts`) map item kinds → slots; content is separate from template (cheap restyle). One non-streaming `getAnthropic()` call, `SYNTHESIS_MODEL` (`claude-sonnet-4-6`; env override `DELIVERABLE_MODEL`), `tool_choice:{type:"tool", name:"record_deliverable_narrative"}`, `max_tokens:2048`. Sync (~3-8s, ~$0.04-0.06/build); `export const maxDuration = 60`; `status` makes a later `after()` upgrade a drop-in.

**Pyramid principle** (McKinsey/Minto, from the Firecrawl research pass): the deliverable leads with the answer; each section = one assertion backed by exhibits; action titles ("Rents are outrunning the county median", not "Rent data").

**Tasks (in order):**
- [ ] `task-01-deliverables-sql.md` — table + RLS + public-select on slug
- [ ] `task-02-templates-lib.md` — `market-overview`, `bov-lite`, `client-email`, `one-pager` (content/template separation)
- [ ] `task-03-build-route-forced-tool.md` — the ONE forced-tool call; RULES_OF_ENGAGEMENT verbatim; numbered item snapshots only
- [ ] `task-04-narrative-anchor-lint.md` — number-anchor lint (reuse `isAnchored`) + `[ADDED]` jargon scrub + regenerate-then-strip
- [ ] `task-05-p-id-page.md` — `/p/[id]` render: provenance under every exhibit + `[INFERENCE]` notes + citation footer (as-of date only — no stale badge)
- [ ] `task-06-restyle-without-rellm.md` — `[ADDED]` template swap re-renders same narrative, no new LLM call
- [ ] `task-07-build-all-templates-verify.md` — build all 4 from a seeded project; poisoned-narrative test; close `deliverable_anchor_lint`

**Files:** new `docs/sql/20260613_deliverables.sql` · `lib/deliverable/{templates,build,narrative-lint}.ts` · `app/api/projects/[id]/build/route.ts` · `app/p/[id]/page.tsx`

**Depends on:** S4 (projects + ownership), S3 (chart resolve for `items_snapshot`).

**Vendor-First (WebFetch in-session):** Anthropic `tool_choice` + strict on `@anthropic-ai/sdk` ^0.69.0; Vercel `maxDuration`/`after()`.

**Risk:** LLM invents a number → forced tool (narrative only) + anchor-lint + one named-violations regeneration + hard-strip offending sentences. Verify with a poisoned-narrative unit test.

**Acceptance gates (must pass before this session ships):**
- `[LB-R2]` narrative numbers anchor by **EXACT equality** to item-snapshot values — NOT the 5%/0.05 chart-render tolerance. Proven by a test where a ~5%-off number is **flagged** (task-04, task-07).
- `[LB-R3]` narrative prose passes the `isGroundedConditional` / no-smoothing check (`refinery/render/speaker.mts`) — a number-free ungrounded forecast is flagged, not silently accepted (task-04).
- `[LB-R5]` deliverable slug ≥122 bits of entropy; `/p/*` behind the middleware rate limiter; public-SELECT re-justified as link=capability + revoke kill-switch (task-01, task-05; rationale in `../AUDIT.md` R5).

**Diff-review gate:** YES — net-new LLM surface + new public `/p/` route. Show the operator the build route + system prompt before pushing.



## ----- task-01-deliverables-sql.md -----

# Task 01 — `deliverables` table (idempotent SQL)

**Files:** Create `docs/sql/20260613_deliverables.sql`. Run it yourself.

**Trust model `[LB-R5]`:** public SELECT by **unguessable slug**, service-role writes (build runs server-side after the cookie client proves project ownership). `items_snapshot` deep-copies so the deliverable is frozen. **Unlike `saved_charts` (public market data), a deliverable carries agent branding + client-specific content** — so the slug must be strong: `id` = a **full-entropy** token (≥122 bits), e.g. `crypto.randomUUID()` (no `.slice`) or `crypto.randomBytes(16).toString("base64url")`. **Do NOT use `randomUUID().slice(0,8)` (32 bits — enumerable).** Public-SELECT is justified as link=capability (share with a non-logged-in client — the core product rail), made safe by the strong slug + `/p/*` rate limiting (task-05) + owner revoke→410 (S7). It is a bounded, deliberate exception — see `../AUDIT.md` R5.

- [ ] **Step 1: Write the migration:**

```sql
-- 20260613_deliverables.sql — assembled deliverable, frozen snapshot. Idempotent.
CREATE TABLE IF NOT EXISTS public.deliverables (
  id              text PRIMARY KEY,          -- unguessable slug
  project_id      text NOT NULL,
  user_id         uuid NOT NULL,
  template        text NOT NULL,
  instruction     text,
  narrative       jsonb NOT NULL,            -- { exec_summary, sections:[{title,intro}], inference_notes:[] }
  items_snapshot  jsonb NOT NULL,            -- deep copy of items + resolved chart blocks at build time
  branding        jsonb,
  status          text NOT NULL DEFAULT 'ready',  -- ready | building | revoked (S7)
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY deliverables_public_select ON public.deliverables FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT ON public.deliverables TO anon, authenticated;
GRANT ALL    ON public.deliverables TO service_role;
```

- [ ] **Step 2: Apply + `NOTIFY pgrst,'reload schema'`; verify** table + policy.
- [ ] **Step 3: Commit.** `git add docs/sql/20260613_deliverables.sql && git commit -m "feat(deliverable): deliverables table (frozen snapshot, public slug select)"`



## ----- task-02-templates-lib.md -----

# Task 02 — `lib/deliverable/templates.ts` (deterministic scaffolds)

**Principle:** content separate from template → restyle = re-render (no new LLM call, Task 06). A template is a deterministic function mapping the narrative + item kinds → ordered slots. **The LLM never picks the structure** — it only fills connective prose into the slots the template defines.

**Files:** Create `lib/deliverable/templates.ts`. Test: `lib/deliverable/templates.test.ts`.

- [ ] **Step 1: Define the template registry.** Four genres (named genres the CRE industry already buys — Firecrawl research pass):
  - `market-overview` — exec summary → sections (one assertion each) → all exhibits → sources.
  - `bov-lite` (Broker Opinion of Value) — branding cover → subject context → comparable data → value narrative → assumptions + sources.
  - `client-email` — subject line + pyramid-first body (answer first) + exhibit links.
  - `one-pager` — exec summary + ≤2 exhibits + 3 stats, fits one print page.

```ts
export type TemplateId = "market-overview" | "bov-lite" | "client-email" | "one-pager";
export interface Slot { kind: "exec_summary" | "section" | "exhibit" | "stat" | "sources" | "branding"; /* + payload refs */ }
export interface RenderModel { template: TemplateId; branding?: object; slots: Slot[]; inference_notes: string[]; }
export function buildRenderModel(template: TemplateId, narrative: Narrative, items: ProjectItem[], branding?: object): RenderModel { /* deterministic mapping */ }
```

- [ ] **Step 2:** Each template deterministically routes item kinds → slots (e.g. `chart`/`table_slice` → exhibits, `metric` → stats, `qa` → section intros' backing, `source` → sources list, `note` → inline context, `file` → appendix). No LLM here.

- [ ] **Step 3: Test** — given a fixed narrative + items, `buildRenderModel("one-pager", …)` yields ≤2 exhibits + 3 stats; `bov-lite` puts branding first; output is pure/deterministic (same input → same model).

- [ ] **Step 4: Commit.** `git add lib/deliverable/templates.ts lib/deliverable/templates.test.ts && git commit -m "feat(deliverable): 4 deterministic templates (content separate from template)"`



## ----- task-03-build-route-forced-tool.md -----

# Task 03 — `POST /api/projects/[id]/build` (the ONE forced-tool call)

**Vendor-First FIRST:** WebFetch the Anthropic docs for `tool_choice: {type:"tool", name}` + tool `input_schema` (strict) on `@anthropic-ai/sdk` ^0.69.0, and Vercel `maxDuration`. Verify the exact param names in-session — do not trust this file's shape from memory.

**Files:** Create `lib/deliverable/build.ts` + `app/api/projects/[id]/build/route.ts`.

- [ ] **Step 1: Load + own.** Route uses the **cookie client** to load the project (RLS proves ownership; 401/404 otherwise). Read `template` + `instruction` from the body. Meter `build`. `export const maxDuration = 60;`.

- [ ] **Step 2: Freeze the snapshot.** Deep-copy `project.items`; resolve every `{kind:"chart"}` ref by joining `saved_charts` so the chart block is embedded (deliverable must not drift). This is `items_snapshot`.

- [ ] **Step 3: The forced-tool call** (`lib/deliverable/build.ts`):
  - `getAnthropic()`, model `process.env.DELIVERABLE_MODEL ?? SYNTHESIS_MODEL` (`claude-sonnet-4-6`), `max_tokens: 2048`, non-streaming.
  - `tool_choice: { type: "tool", name: "record_deliverable_narrative" }`.
  - Tool `input_schema`: `{ exec_summary: string, sections: [{ title: string, intro: string }], inference_notes: string[] }` — **action titles** (pyramid principle).
  - **System prompt** = `RULES_OF_ENGAGEMENT` verbatim (from `refinery/lib/rules-of-engagement.mts`) + the converse voice rules + this:
    > "The ONLY facts are the numbered items below. Never introduce a number, date, or place not present in them. Lead with the answer. One assertion per section, stated as the section title. Anything beyond the cited facts goes ONLY in `inference_notes`, tagged `[INFERENCE]`, naming the item it builds on and one falsifier. Never write the words master, brain, payload, grain, or dossier."
  - **User message** = the instruction + the numbered item snapshots, each with its value + citation + `freshness_token` ONLY. No raw project internals.

- [ ] **Step 4: Lint the narrative** (Task 04 `lintDeliverableNarrative`) before persisting. On violation → one regeneration naming the violations → if still bad, hard-strip the offending sentences.

- [ ] **Step 5: Persist + return.** Insert the `deliverables` row (service-role lane is OK here — ownership already proven via the cookie load) with `narrative`, `items_snapshot`, `branding`, `status:"ready"`, and a **full-entropy `id` per `[LB-R5]`** (`crypto.randomUUID()` or `randomBytes(16).toString("base64url")` — NOT `.slice(0,8)`). Return `{ id }` → client navigates to `/p/[id]`. Client shows "Assembling…" until the POST resolves.

- [ ] **Step 6: Commit (hold for diff review).** `git add lib/deliverable/build.ts "app/api/projects/[id]/build/route.ts" && git commit -m "feat(deliverable): forced-tool assembly build route (narrative-only, sync)"`



## ----- task-04-narrative-anchor-lint.md -----

# Task 04 — Number-anchor lint (EXACT) + grounded-conditional lint + jargon scrub + regenerate-then-strip

**This is the moat enforcement.** Three independent gates on the customer-facing narrative — anchoring alone is NOT enough:

- **`[LB-R2]` EXACT-MATCH number anchoring (NOT the 5% tolerance).** Every numeric token in the narrative must equal an item-snapshot value by **equality** after format-normalization only (`$30,074` == `30074`, `+60bps` == `60`). **No rounding band, no 5% band.** Resolving the rounding ambiguity cleanly: the LLM must emit numbers **verbatim** as they appear in the snapshot — "about $30K" for a `$30,074` fact is itself a **smoothing violation** (CLAUDE.md data-protocol-v3 rule 8: don't re-encode hard numbers into vague English), so it fails the same way an invented number does. Verbatim-or-fail unifies R2 with the no-smoothing gate (R3) and removes the "is this rounding legitimate?" judgment call entirely. **Do NOT reuse `isAnchored`'s `0.05` tolerance** — that was designed for chart *rendering*, where a bar within 5% is visually fine; in a provenance deliverable a number 5% off the cited figure is a fabrication that passes. Keep the 5% tolerance on the chart-render path only; the narrative path uses equality. Write your own `anchorsExactly(token, snapshotNumbers)`.
- **`[LB-R3]` Grounded-conditional / no-smoothing check.** Number-anchoring can't see a number-free forecast. A section intro like "rents will keep climbing" carries no numeric token, so anchoring passes it — but it's an ungrounded prediction. Run every `exec_summary` + section `intro` through the `isGroundedConditional` / no-smoothing filter from `refinery/render/speaker.mts` (find the exported check; it enforces THE-GOAL's "speculation is conditional IF/THEN + falsifier, not flat"). An ungrounded forecast must be flagged and either rewritten to a cited fact, moved to `inference_notes` with an `[INFERENCE]` tag + falsifier, or stripped.
- **`[ADDED]` jargon scrub** (deterministic, cosmetic — NOT a substitute for the two above): strip `master/brain/payload/grain/dossier` leaks reusing the speaker scrub patterns.

**Files:** Create `lib/deliverable/narrative-lint.ts`. Test: `lib/deliverable/narrative-lint.test.ts`.

- [ ] **Step 1: Failing tests — poisoned narrative (three gates).**
  - Number gate: snapshot has `$30,074`; narrative says "vacancy hit 14%" (not in any item) → flagged + stripped. AND a near-miss: snapshot `$30,074`, narrative says "$31,500" (≈5% off) → **flagged** (equality, not tolerance — this is the test that proves R2).
  - Grounded gate: narrative section intro "rents will keep climbing" (no number, no condition, no falsifier) → flagged by the grounded-conditional check.
  - Jargon gate: a planted "the dossier shows…" → stripped.

```ts
import { lintDeliverableNarrative } from "./narrative-lint";
it("flags a number with no item anchor", () => {
  const r = lintDeliverableNarrative(narrative, itemNumbers);
  expect(r.violations.some(v => v.token === "14%")).toBe(true);
});
it("strips the offending sentence", () => {
  expect(lintDeliverableNarrative(narrative, itemNumbers).stripped).not.toContain("14%");
});
```

- [ ] **Step 2: Implement the EXACT number gate `[LB-R2]`.** Extract every numeric token from `exec_summary` + each section `intro` (regex for currency/percent/bps/plain numbers; mirror chart-block-lint's extraction for the token-finding only). Build the anchor set = all numbers in `items_snapshot`, normalized (strip `$`, `,`, `bps`, `%`, sign-as-written). For each narrative number, require an **exact normalized equality** match in the anchor set — `anchorsExactly`, NOT `isAnchored(...,0.05)`. Collect violations with the containing sentence. Provide `strip()` that removes whole offending sentences.

- [ ] **Step 3: Implement the grounded-conditional gate `[LB-R3]`.** Import the `isGroundedConditional` / no-smoothing check from `refinery/render/speaker.mts` (verify the exact exported symbol in-session). Run each `exec_summary` + section `intro` through it; a forward-looking/forecast clause that isn't a cited fact and isn't a conditional (IF/THEN + falsifier) is a violation → flag it; the build route (Task 03) moves it to `inference_notes` on regeneration or strips it.

- [ ] **Step 4: `[ADDED]` jargon scrub** (cosmetic — explicitly NOT a substitute for Steps 2-3). Strip `master/brain/payload/grain/dossier` leaks reusing the speaker-layer forbidden-term list (`refinery/render/speaker.mts`).

- [ ] **Step 5: Regenerate-then-strip wiring** (used by Task 03): on first lint failure (any of the three gates), re-call the model once with the violation list named ("these numbers are not in the items: …; remove them" / "this clause is an ungrounded forecast: …; restate as a cited fact or a conditional with a falsifier, or drop it"); if the second pass still violates, hard-strip the offending sentences and proceed. Log how many regenerations/strips happened.

- [ ] **Step 6: Tests green** (all three gates) **; commit.** `git add lib/deliverable/narrative-lint.ts lib/deliverable/narrative-lint.test.ts && git commit -m "feat(deliverable): exact number-anchor + grounded-conditional + jargon lint; regenerate-then-strip"`



## ----- task-05-p-id-page.md -----

# Task 05 — `app/p/[id]/page.tsx` (hosted deliverable + `[ADDED]` stale badge)

**Files:** Create `app/p/[id]/page.tsx`.

**Contract:** server component; loads `deliverables` by slug (public SELECT); 404 if missing; 410 if `status='revoked'` (S7). Renders from the **frozen `items_snapshot`**, never the live project.

- [ ] **Step 1: Layout** — branding header (agent name/photo/license/brokerage from `branding`) → exec summary → sections (action title + intro + its exhibits) → **source line + as-of date under EVERY exhibit** (this is the differentiator CoStar lacks) → `[INFERENCE]` notes block in `#d4b370` → citation footer (source credit, no freshness badges) → action strip (Print / Copy email / Share — all `.print-hide`).

- [ ] **Step 2: As-of date (operator 2026-06-10).** The as-of date is the **only** honesty mechanism required. For live-brain items (`qa`, `metric`, `report`, `table_slice`) it's parsed from their `freshness_token`; for chart items it comes from the `chart_block` data's own date field. Render the date plainly as part of each exhibit's citation line — a simple "As of [Month YYYY]" is sufficient. **Do NOT build** a cadence-aware "may have updated" badge, per-item age indicator, staleness warning, or token string display. **Live-refresh-before-print is a HIGHER-TIER future feature, NOT built here**. Never silently re-fetch in v1.

- [ ] **Step 3: Provenance survives in print.** Confirm the citation elements use `.citation`/`.source-line` classes that the S5 print CSS keeps visible — source credit and as-of date must appear in the printed PDF. No `.freshness-token` token string is printed.

- [ ] **Step 4: `[LB-R5]` Rate-limit `/p/*`.** Add `/p/` to the middleware rate-limit prefixes (`middleware.ts` `RATE_LIMITED_PREFIXES` — currently `/api/b/`, `/api/mcp`, `/api/waitlist`) so the public, branding-bearing deliverable pages get the same per-IP burst guard against scraping/enumeration. Confirm the limiter fires on `/p/<slug>`.

- [ ] **Step 5: Verify** `/p/[id]` renders logged-out; provenance + as-of date under every exhibit; print is clean; a burst of `/p/` requests gets rate-limited; `status='revoked'` → 410 (S7).

- [ ] **Step 6: Commit.** `git add "app/p/[id]/page.tsx" middleware.ts && git commit -m "feat(deliverable): /p/[id] hosted page — provenance + as-of date; rate-limit /p/*"`



## ----- task-06-restyle-without-rellm.md -----

# Task 06 — `[ADDED]` Restyle without a new LLM call

**Why:** content is already separate from template (Task 02). Re-rendering the SAME narrative + items under a DIFFERENT template is free and instant — the Gamma/Perplexity-Labs "cheap restyle." Gives the user 4 looks for one build cost.

**Files:** Modify `app/api/projects/[id]/build/route.ts` (or a tiny `PATCH /api/deliverables/[id]/restyle`), `app/p/[id]/page.tsx`.

- [ ] **Step 1:** Add a restyle path that takes an existing deliverable + a new `template`, calls `buildRenderModel(newTemplate, deliverable.narrative, deliverable.items_snapshot, branding)` — **no Anthropic call** — and either updates the row's `template` or writes a sibling deliverable. (Pick update-in-place for v1; the slug stays shareable.)
- [ ] **Step 2:** `/p/[id]` gets a template switcher (`.print-hide`) that calls the restyle path and re-renders. Since no LLM runs, it's instant; do NOT meter it as a `build` (it's free) — or meter a distinct `restyle` action if the operator wants the signal.
- [ ] **Step 3: Verify** switching `one-pager` → `bov-lite` re-renders the same facts/narrative under the new structure with no new build latency and no new LLM cost.
- [ ] **Step 4: Commit.** `git add "app/api/projects/[id]/build/route.ts" "app/p/[id]/page.tsx" && git commit -m "feat(deliverable): [ADDED] restyle template swap with no new LLM call"`



## ----- task-07-build-all-templates-verify.md -----

# Task 07 — Build all 4 templates + close `deliverable_anchor_lint`

- [ ] **Step 1: Seed a project** with mixed items (a chart ref, 3 metrics with tokens, a qa, a source, a note).
- [ ] **Step 2: Build each template** (`market-overview`, `bov-lite`, `client-email`, `one-pager`) → each returns a working `/p/[id]` URL in a few seconds; provenance appears under every exhibit; logged-out render works; print is clean.
- [ ] **Step 3: Poisoned-narrative unit test green** (Task 04) — the anchor lint catches an invented number and the strip removes it. This is the prod-evidence the check needs: the guarantee is *structural*, demonstrated by the test, not "the model was careful."
- [ ] **Step 4:** Confirm the jargon scrub strips a planted `dossier`/`master` leak.
- [ ] **Step 5: Ship** (after operator diff-review of the build route + system prompt). Then close:

```bash
node scripts/check.mjs close deliverable_anchor_lint "poisoned-narrative test green: invented number flagged+stripped; jargon scrub strips master/dossier; all 4 templates build to /p/ in <8s"
```

Build-queue: append + mark the assembly-engine line `[x]`.



# ================================================================
# SESSION FOLDER: session-7-delivery-surfaces__SONNET
# ================================================================

# Session 7 — Delivery surfaces  ·  **SONNET**  ·  ~1 day (7b deferred)

> Read `../shared/conventions.md`. v1 delivery is **draft-only**: copy / `mailto:` / share-sheet. Real Resend send (7b) is designed but deferred to demand.

**Goal:** Let a user get the deliverable out — Copy email (clipboard), `mailto:`, and `navigator.share` (the primary phone path) — plus an owner kill-switch to revoke a shared `/p/` link.

**Tasks (in order):**
- [ ] `task-01-copy-mailto-share.md` — delivery buttons on `/p/[id]` + the `client-email` template; meter `deliver_email`
- [ ] `task-02-revoke-unpublish.md` — `[ADDED]` `status='revoked'` → `/p/[id]` returns 410

**Deferred (documented, NOT built): 7b real send.** `POST /api/deliverables/[id]/send {to, message?}` — logged-in; `from: deliver@swfldatagulf.com`, `reply_to: agent's email`; lazy Resend (the waitlist route is the precedent — `app/api/waitlist/route.ts`, verified lazy-init from `hello@swfldatagulf.com`); meter `deliver_email`. **Vendor-First when it un-defers:** WebFetch Resend `reply_to`/verified-domain rules. Leave a stub comment, no route.

**Files:** `app/p/[id]/page.tsx` · new `app/api/deliverables/[id]/revoke/route.ts`

**Depends on:** S6 (`/p/[id]` + deliverables).

**Risk:** mobile `mailto:` body-length limits → **clipboard-first** (copy the full body, `mailto:` carries subject + a short lead + link).

**Diff-review gate:** none. Standard ship.



## ----- task-01-copy-mailto-share.md -----

# Task 01 — Copy email / mailto / share on `/p/[id]`

**Files:** Modify `app/p/[id]/page.tsx` (action strip — already `.print-hide`).

- [ ] **Step 1: Copy email** — for the `client-email` template, assemble `subject + body + link`; "Copy email" writes it to clipboard (`navigator.clipboard.writeText`). This is the reliable path (no length limit).
- [ ] **Step 2: `mailto:`** — `mailto:?subject=<enc>&body=<enc(short lead + /p/ link)>`. Keep the body short (mobile clients truncate long `mailto:` bodies) — the full prose is the Copy path; `mailto:` is subject + lead + link.
- [ ] **Step 3: `navigator.share`** — the primary phone path: `navigator.share({ title, text, url })` with a clipboard fallback when unsupported. Feature-detect; don't crash on desktop.
- [ ] **Step 4: Meter** each click as `deliver_email` (`/api/meter`).
- [ ] **Step 5: Verify** on a phone: Share opens the OS sheet; Copy puts the full email on the clipboard; `mailto:` opens the mail app with subject + link.
- [ ] **Step 6: Commit.** `git add "app/p/[id]/page.tsx" && git commit -m "feat(deliver): copy/mailto/share on /p/[id], metered deliver_email"`



## ----- task-02-revoke-unpublish.md -----

# Task 02 — `[ADDED]` Revoke / unpublish a shared deliverable

**Why:** `/p/[id]` is public by unguessable slug. A shared link can't currently be killed. The `status` column already exists (S6). Add an owner kill-switch.

**Files:** Create `app/api/deliverables/[id]/revoke/route.ts`. Modify `app/p/[id]/page.tsx` (410 on revoked) + `app/project/[id]/page.tsx` (a "Revoke link" control on the deliverable list).

- [ ] **Step 1: Revoke route** — cookie client; verify the requester owns the deliverable (`user_id = auth.uid()` — load via cookie client so RLS-equivalent ownership holds, or check `user_id` explicitly); set `status='revoked'`. Support un-revoke (`status='ready'`) too.
- [ ] **Step 2: `/p/[id]` honors it** — if `status='revoked'`, return HTTP 410 (Gone) with a small "this report was unpublished by its owner" page, not the content.
- [ ] **Step 3: Owner control** — on `/project/[id]`, list the project's deliverables with a Revoke/Restore toggle.
- [ ] **Step 4: Verify** — build a deliverable → `/p/[id]` works → revoke → `/p/[id]` → 410 → restore → works again. Only the owner can revoke (a second account gets 403/404).
- [ ] **Step 5: Commit, then ship the session** per `../shared/conventions.md`.

```bash
git add "app/api/deliverables/[id]/revoke/route.ts" "app/p/[id]/page.tsx" "app/project/[id]/page.tsx"
git commit -m "feat(deliver): [ADDED] owner revoke/restore -> /p/[id] 410"
```



# ================================================================
# SESSION FOLDER: session-8-uploads__OPUS
# ================================================================

# Session 8 — Uploads (images + PDFs, attach + caption)  ·  **OPUS**  ·  ~2 days

> Read `../shared/conventions.md`. **Why Opus:** this is the **only never-touched vendor surface** in the plan (no Storage buckets exist today — audit confirmed) AND it's security-scoped: a mis-scoped Storage RLS path-prefix leaks one user's uploads to another. Vendor-verify is **mandatory**, not optional.

**Goal:** Let a signed-in user attach images + PDFs to a project (10MB/file, 10/project, attach + caption only — no parsing/OCR), scoped per-user via Storage RLS, rendered as figures (images) / appendix links (PDFs) with signed URLs.

**Architecture:** private bucket `project-uploads`; object paths `{user_id}/{project_id}/{uuid}.{ext}`; `storage.objects` RLS keys INSERT/SELECT/DELETE to `(storage.foldername(name))[1] = auth.uid()::text`. Browser upload via the user-JWT client (`utils/supabase/client.ts`) so RLS applies — no new dependency. On success, file a `{kind:"file"}` item (`../shared/data-model.md`). Anonymous → login prompt (Storage needs `auth.uid()`).

**Tasks (in order):**
- [ ] `task-01-vendor-verify-storage.md` — **mandatory** WebFetch: Storage RLS syntax, `createSignedUrl`, size ceilings
- [ ] `task-02-bucket-and-storage-rls.md` — `project-uploads` bucket + `storage.objects` path-prefix RLS (idempotent SQL)
- [ ] `task-03-upload-drop-component.md` — `components/project/UploadDrop.tsx` (limits, HEIC reject)
- [ ] `task-04-render-signed-urls.md` — server-side 1h signed URLs; images as figures, PDFs as appendix
- [ ] `task-05-storage-rls-scope-verify.md` — two-account: cross-user object read DENIED; close `storage_rls_scope_verify`

**Files:** new `docs/sql/20260614_project_uploads_bucket.sql` · `components/project/UploadDrop.tsx` · `app/project/[id]/page.tsx` (mount + render files) · a server helper for signed URLs

**Depends on:** S4 (projects + auth).

**Limits:** 10MB/file, 10/project; `image/jpeg|png|webp` + `application/pdf`; HEIC rejected with a convert hint.

**Risk:** Storage RLS mis-scope → vendor-verified policies + `auth.uid()` path prefix + signed URLs only (never public bucket).

**Diff-review gate:** none beyond standard (no live API/MCP change). But the live two-account deny test gates the check.



## ----- task-01-vendor-verify-storage.md -----

# Task 01 — MANDATORY vendor-verify (Supabase Storage)

**This task is non-negotiable (CLAUDE.md RULE 1 Vendor-First).** Storage is a surface this repo has never used. Do not write a single line of bucket/RLS/upload code until you've read the live docs in-session.

- [ ] **Step 1: WebFetch** the current Supabase docs for:
  - Creating a **private** bucket (and how `public` defaults / file-size + MIME restrictions are set — `file_size_limit`, `allowed_mime_types` on the bucket).
  - **`storage.objects` RLS** policy syntax, specifically `storage.foldername(name)` and how to key a policy to `auth.uid()::text` as the first path segment.
  - **`createSignedUrl`** (server-side, expiry) and the browser **upload** call (`supabase.storage.from(bucket).upload(path, file)`) under a user JWT.
- [ ] **Step 2: Record** the verified API shapes + exact policy SQL in a short `FINDINGS-storage.md` in this folder (Task 02/03/04 code directly against it). Note the SDK version in `package.json` so the calls match.
- [ ] **Step 3: Commit the findings.** `git add docs/superpowers/plans/2026-06-10-projects-briefcase-assembly/session-8-uploads__OPUS/FINDINGS-storage.md && git commit -m "docs(uploads): verified Supabase Storage RLS + signed-URL API"`

> Why: an invented MIME restriction or a wrong `foldername` index ships and silently lets users read each other's files. Cost of one WebFetch ≪ cost of a leak.



## ----- task-02-bucket-and-storage-rls.md -----

# Task 02 — `project-uploads` bucket + path-prefix RLS

**Files:** Create `docs/sql/20260614_project_uploads_bucket.sql` (idempotent). Use the **verified** syntax from Task 01's `FINDINGS-storage.md` — the SQL below is the shape; reconcile it with what you verified.

- [ ] **Step 1: Bucket (private) + size/MIME limits:**

```sql
-- 20260614_project_uploads_bucket.sql — private uploads bucket + per-user RLS. Idempotent.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-uploads', 'project-uploads', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
```

- [ ] **Step 2: `storage.objects` RLS** — INSERT/SELECT/DELETE only where the bucket matches AND the first path segment is the caller's uid:

```sql
do $$ begin
  create policy project_uploads_owner_rw on storage.objects
    for all
    using (bucket_id = 'project-uploads' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'project-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
exception when duplicate_object then null; end $$;
```

(Split into per-command policies if Task 01's findings say `FOR ALL` on `storage.objects` is discouraged — match the verified pattern.)

- [ ] **Step 3: Apply + verify** the bucket is `public=false` and the policy exists on `storage.objects`.
- [ ] **Step 4: Commit.** `git add docs/sql/20260614_project_uploads_bucket.sql && git commit -m "feat(uploads): private project-uploads bucket + auth.uid() path-prefix RLS"`



## ----- task-03-upload-drop-component.md -----

# Task 03 — `components/project/UploadDrop.tsx`

**Files:** Create `components/project/UploadDrop.tsx`. Mount on `app/project/[id]/page.tsx`.

- [ ] **Step 1: Client upload via user JWT** (`utils/supabase/client.ts` — RLS applies; no new dep). Path = `${user.id}/${projectId}/${crypto.randomUUID()}.${ext}`. Use the verified `supabase.storage.from('project-uploads').upload(path, file)`.
- [ ] **Step 2: Client-side limits** (server bucket limit is the real gate, but fail fast): reject >10MB; reject if the project already has 10 file items; allow only `image/jpeg|png|webp`, `application/pdf`; **reject HEIC** with a "convert to JPG/PNG first" hint.
- [ ] **Step 3: On success** → file a `{kind:"file", storage_path, mime, size, caption}` item (caption input in the UI) via the project PATCH (or the draft if anonymous → but Storage needs auth, so anonymous shows a login prompt instead).
- [ ] **Step 4: Meter `upload`** (`/api/meter`).
- [ ] **Step 5: Verify** — upload a JPG + a PDF to a project (signed in) → both appear as file items with captions; HEIC rejected; 11th file blocked; 11MB blocked.
- [ ] **Step 6: Commit.** `git add components/project/UploadDrop.tsx "app/project/[id]/page.tsx" && git commit -m "feat(uploads): UploadDrop (images+PDF, caption, limits, HEIC reject)"`



## ----- task-04-render-signed-urls.md -----

# Task 04 — Render uploads via signed URLs

**Files:** A server helper (e.g. `lib/project/signed-upload-url.ts`) + render in `app/project/[id]/page.tsx` and `app/p/[id]/page.tsx` (deliverable exhibits/appendix).

- [ ] **Step 1: Server-side signed URLs (1h).** Never expose the private object directly. Generate `createSignedUrl(path, 3600)` on the server for each `{kind:"file"}` item the current viewer is allowed to see.
- [ ] **Step 2: Render.** Images → `<figure>` with the signed URL + caption + a **"Provided by agent"** source line (so user-supplied media is clearly distinguished from cited lake data — provenance honesty). PDFs → an appendix link.
- [ ] **Step 3: Deliverable inclusion.** When `/p/[id]` renders a `file` item from `items_snapshot`, it also uses a fresh server signed URL (the snapshot stores `storage_path`, not a URL — URLs expire).
- [ ] **Step 4: Verify** — image renders inline with "Provided by agent"; PDF opens via the signed link; the link 403s after expiry / for a non-owner.
- [ ] **Step 5: Commit.** `git add lib/project/signed-upload-url.ts "app/project/[id]/page.tsx" "app/p/[id]/page.tsx" && git commit -m "feat(uploads): signed-URL render (images as figures, PDFs as appendix, 'Provided by agent')"`



## ----- task-05-storage-rls-scope-verify.md -----

# Task 05 — Two-account Storage RLS verify + close `storage_rls_scope_verify`

**Why:** path-prefix RLS is only proven by a real cross-user denial (`feedback_checks-prod-evidence-not-dev-attestation`).

- [ ] **Step 1: Ship** the session per `../shared/conventions.md`.
- [ ] **Step 2: Account A** uploads a file → note its `storage_path` (`A_uid/project/uuid.jpg`).
- [ ] **Step 3: Account B** — attempt to read A's object (request a signed URL for A's path while authed as B, and attempt a direct `download(path)`). **Expected: DENIED by RLS.** If B can read A's file, the policy is mis-scoped — STOP, fix, do not close.
- [ ] **Step 4: Anonymous** — no `auth.uid()` → cannot upload (login prompt) and cannot read private objects.
- [ ] **Step 5: Signed URL expiry** — a 1h signed URL 403s after expiry.
- [ ] **Step 6: Close** with evidence:

```bash
node scripts/check.mjs close storage_rls_scope_verify "prod: acct B cross-read of acct A upload DENIED; anon cannot upload/read; signed URL expires. project-uploads private."
```

Build-queue: append + mark uploads `[x]`.



# ================================================================
# SESSION FOLDER: session-9-mcp-cobuild__OPUS
# ================================================================

# Session 9 — MCP co-build  ·  **OPUS**  ·  ~2 days

> Read `../shared/conventions.md`, `../shared/data-model.md`, `../AUDIT.md`. **Why Opus:** this adds **write tools** to the MCP surface (today it's a single read-only `swfl_fetch`), introduces per-project capability tokens, and changes a live external contract. Key-leak and write-scope mistakes are the risk. **`[AUDIT-FIX C6]`**: `auth.ts` is a *conditional* bearer check (open if `MCP_BEARER_TOKEN` unset, enforced if set), NOT a no-op stub — the project-key layer is **additive** and orthogonal; leave `MCP_BEARER_TOKEN`/`auth.ts` behavior intact.

**Goal:** A user's own Claude (via our MCP) co-builds the SAME project: list it, add items into it, and build a deliverable — authorized by a per-project capability key, write-only-into-items, revocable.

**Architecture:** "Connect your AI" on `/project/[id]` mints `projects.mcp_key` (capability token scoping ONE project, regenerate = revoke). Three new MCP tools (zod mirrors `lib/project/items.ts`); writes go via service-role **after** key lookup (a documented second capability-authorized lane — the cookie-RLS lane is for the web UI; this is for the keyed agent). Items get `origin:'mcp'`.

**Tasks (in order):**
- [ ] `task-01-project-key-capability.md` — `POST /api/projects/[id]/mcp-key` (mint/regenerate) + UI snippet
- [ ] `task-02-mcp-write-tools.md` — `swfl_project_list/add/build`; `[ADDED]` dedupe; `origin:'mcp'`
- [ ] `task-03-amend-readonly-annotations.md` — narrow "read-only" prose (`server.ts:59`) + per-tool `readOnlyHint` (A7)
- [ ] `task-04-live-verify-their-claude.md` — end-to-end their-Claude flow; close `mcp_project_tools_live_verify`

**Files:** new `app/api/projects/[id]/mcp-key/route.ts` · `app/api/mcp/server.ts` (3 tools + amend prose/annotations) · `app/project/[id]/page.tsx` ("Connect your AI" + snippet)

**Depends on:** S4 (projects + `mcp_key` column), S6 (`build` reuses `lib/deliverable/build.ts`), **and the `MCP_BEARER_TOKEN` keystone (see gates).**

**Acceptance gates — BOTH must hold before the write tools ship (`[LB-R6]`/`[LB-R7]`):**
- **(a) Bearer enforced FIRST.** `MCP_BEARER_TOKEN` is **unset in prod today**, so `auth.ts` is OPEN and the MCP server is currently unauthenticated (`[AUDIT-FIX C6]`). With write tools added, the project-key check would be the ONLY thing between an anonymous caller and a service-role write that bypasses RLS. So `MCP_BEARER_TOKEN` MUST be SET in prod (the standing keystone check) **before** these tools deploy. This session does not ship its write tools until the bearer gate is live. Verify in task-04.
- **(b) Write hard-bound to the key's project.** The service-role write target is derived **solely** from the `mcp_key`→`project_id` lookup. **No payload/param/tool-arg field may carry a `project_id`** that could redirect the write to another project. The `item` arg carries item content only — never a target project. Verify with a negative test (task-02/04).

**Risk:** `mcp_key` leak in chat logs → single-project scope + regenerate-to-revoke; never a global token.

**Diff-review gate:** YES — changes the live MCP surface (RULE 1). Show the operator the `server.ts` diff (new tools + annotation changes) before pushing.



## ----- task-01-project-key-capability.md -----

# Task 01 — Per-project capability key

**Files:** Create `app/api/projects/[id]/mcp-key/route.ts`. Modify `app/project/[id]/page.tsx` ("Connect your AI").

- [ ] **Step 1: Mint/regenerate route** — cookie client proves project ownership (RLS); generate a high-entropy key (e.g. `proj_` + 32 random bytes base64url); write `projects.mcp_key` via the owner's authenticated update (RLS-scoped). Regenerate overwrites → old key instantly invalid (= revoke). Support a DELETE to clear it.
- [ ] **Step 2: UI** — on `/project/[id]`, a "Connect your AI" panel that mints the key and shows a copy-paste snippet for the user's Claude, e.g.:

```
claude mcp add --transport http swfl-project https://www.swfldatagulf.com/api/mcp \
  --header "X-Project-Key: <key>"
```

(Confirm the real header/auth mechanism the MCP server reads — Task 02 wires the lookup; keep them consistent.)

- [ ] **Step 3: Scope statement** — the panel states plainly: this key scopes ONE project, write-only-into-items, regenerate to revoke. Show a "Regenerate (revokes old)" button.
- [ ] **Step 4: Verify** — mint a key; regenerate → old key rejected by the tools (Task 02); owner-only (account B can't mint for A's project).
- [ ] **Step 5: Commit.** `git add "app/api/projects/[id]/mcp-key/route.ts" "app/project/[id]/page.tsx" && git commit -m "feat(mcp): per-project capability key (mint/regenerate=revoke)"`



## ----- task-02-mcp-write-tools.md -----

# Task 02 — Three project tools on the MCP server

**Context (verified):** `app/api/mcp/server.ts` registers a single `swfl_fetch` tool (`server.registerTool(...)` ~line 213) with `readOnlyHint:true` (~245). Add three project tools whose zod input mirrors `lib/project/items.ts`. **Each does a project-key lookup FIRST**, then writes via service-role (the documented second capability-authorized lane). Items written get `origin:'mcp'`.

**Files:** Modify `app/api/mcp/server.ts`.

- [ ] **Step 0 `[LB-R6a]`: confirm the bearer gate is live before coding writes.** `MCP_BEARER_TOKEN` must be SET in prod (the MCP server is unauthenticated otherwise — `[AUDIT-FIX C6]`). Do not deploy write tools onto an open server. If the token isn't set yet, that keystone lands first (it's the standing `Smallest paid path` check). Verified again in task-04.

- [ ] **Step 1: Key→project resolver `[LB-R6b]`** — a helper that takes the `project_key` arg (or the `X-Project-Key` header — match Task 01) → looks up the `projects` row by `mcp_key` (service-role) → returns the project or a clean "invalid/expired key" error. No key match = no write. **The returned `project.id` is the ONLY write target** for everything downstream — it is derived solely from the key. **No tool arg carries a `project_id`**; the `item`/`template`/`instruction` args carry content only. A request cannot name another project to write to.

- [ ] **Step 2: `swfl_project_list { project_key }`** → returns the project title + condensed items (no internal ids beyond what's needed).

- [ ] **Step 3: `swfl_project_add { project_key, item }`** — `item` zod-restricted to `note | metric | qa | report | chart_block`:
  - `chart_block` → `lintChartBlock` (provenance-checked against the named report's dossier when a `report` is given) → insert into `saved_charts` → store as a `{kind:"chart", chart_id}` ref.
  - others → validate with `projectItemSchema`, stamp `origin:'mcp'`, `id`, `added_at`.
  - **`[ADDED]` dedupe:** before appending, drop a new item that matches an existing one by `(kind, report_id, label, value)` (for metric/qa) so a co-building Claude filing twice doesn't spam the project.
  - Tool description (the prompt the user's Claude reads): *"File metrics with the exact value, source url, and freshness_token from the dossier you just fetched — verbatim, never recomputed."*
  - Append to `projects.items` (service-role update, scoped to the resolved project id only). Meter `item_add` to the owner.

- [ ] **Step 4: `swfl_project_build { project_key, template, instruction? }`** → calls `lib/deliverable/build.ts` (S6) for the resolved project → returns the `/p/[id]` URL. Meter `build` to the owner.

- [ ] **Step 5: Tests** — extend the MCP server tests: valid key adds an item visible in the web UI with `origin:'mcp'`; bad/expired key → clean error (no write); dedupe drops the second identical metric; build returns a working URL. **`[LB-R6b]` negative test:** key for project X + an item payload that tries to smuggle a `project_id` for project Y → the write still lands ONLY on X (the smuggled field is ignored — there is no code path that reads a target project from the payload).

- [ ] **Step 6: Commit (hold for diff review).** `git add app/api/mcp/server.ts && git commit -m "feat(mcp): swfl_project_list/add/build (capability-keyed writes, origin:mcp, dedupe)"`



## ----- task-03-amend-readonly-annotations.md -----

# Task 03 — Amend the "read-only" promise (A7)

**Context (verified):** `server.ts:59` says in prose "This server is read-only"; the `swfl_fetch` tool sets `readOnlyHint:true` (~245). With write tools added, that blanket claim is now false. Narrow it — don't delete it.

**Files:** Modify `app/api/mcp/server.ts`.

- [ ] **Step 1:** Update the prose at ~line 59 to: *"`swfl_fetch` is read-only. The `swfl_project_*` tools write into a single project you authorize with a per-project capability key."*
- [ ] **Step 2: Per-tool annotations** — `swfl_fetch` keeps `readOnlyHint:true`. The three new tools set `readOnlyHint:false` (and `destructiveHint:false`, `idempotentHint` per each — `add` is non-idempotent, `build` non-idempotent, `list` read-only-ish but it's a write-capable surface). Match the annotation fields the MCP SDK version in use supports (verify against the registered shape already in the file).
- [ ] **Step 3:** Confirm the bearer behavior is untouched — `MCP_BEARER_TOKEN`/`auth.ts` still gates the transport exactly as before (`[AUDIT-FIX C6]`); the project key is an *additional* per-call authorization, not a replacement.
- [ ] **Step 4: Commit.** `git add app/api/mcp/server.ts && git commit -m "feat(mcp): narrow read-only promise to swfl_fetch; annotate write tools (A7)"`



## ----- task-04-live-verify-their-claude.md -----

# Task 04 — Their-Claude end-to-end verify + close `mcp_project_tools_live_verify`

**Why:** the co-build promise is only real when a separate Claude, using only the capability key, can drive the full loop (`feedback_checks-prod-evidence-not-dev-attestation`).

- [ ] **Step 0 `[LB-R6a]`: confirm the bearer gate is enforced in prod.** `MCP_BEARER_TOKEN` is SET; an unauthenticated `tools/call` (no/incorrect bearer) is rejected by `auth.ts` BEFORE any tool runs. Do not ship/verify the write tools onto an open server.
- [ ] **Step 1: Ship** (after the operator's MCP diff-review OK), per `../shared/conventions.md`.
- [ ] **Step 2: Connect a real second Claude** to the deployed MCP with a freshly minted project key (the snippet from Task 01).
- [ ] **Step 3: Full flow** — have that Claude: `swfl_fetch` a dossier → `swfl_project_add` 2 metrics (verbatim value/source/token) + a note → confirm the **web UI** shows them live with an `origin:'mcp'` badge → `swfl_project_build` → returns a working `/p/[id]` URL that renders.
- [ ] **Step 4: Negatives** — a bad/expired key → clean error, no write. Regenerate the key (Task 01) → the old key is rejected. Dedupe → filing the same metric twice yields one item. **`[LB-R6b]`:** an `add` call whose payload tries to target a different `project_id` writes ONLY to the key's project (smuggled field ignored).
- [ ] **Step 5: Close** with evidence:

```bash
node scripts/check.mjs close mcp_project_tools_live_verify "prod: 2nd Claude fetch->add(2 metrics+note, origin:mcp)->build returned working /p/ URL; bad key clean error; regenerate revokes; dedupe works"
```

Build-queue: append + mark MCP co-build `[x]`. **This is the last session — the full arc (highlight → file → assemble → deliver → co-build) is now live.**
