# Piece 2 — Project-Aware AI · Repo Spec (2026-06-17)

> Status board lives in `SESSION_LOG.md` + the `checks` ledger + `_AUDIT_AND_ROADMAP/build-queue.md` (RULE 2). This
> file is the **design + ground-truth seam map** for the build, not a status doc. Source plan: `FINAL BOSS/02-piece-2-project-aware-ai.md`
> (locked build plan). This spec **supersedes that plan's seam claims** where they drifted from the live code — every
> claim below was verified against commit `2355bfa` (working tree clean) by an 8-agent seam-verification pass.

## What Piece 2 is

The in-app assistant stops being a stateless, region-wide pill on `/project/[id]` and becomes **project-aware**: it knows
what's in the open project, reasons across the user's other projects (reuse / gap / pairing), and surfaces a dynamic
**3 situational prompts + 1 offer** that change only on project-switch or a question. It can **assemble a project on
command** ("build a project for 33908, pull the important data from my existing projects"). The data→answer→graph→
prediction engine already exists and is **out of scope** — P2 wires project awareness *into* it.

**Quality bar (HANDOFF):** the user is a 20-yr broker — accurate, fast, polished, decision-grade, surfaces what they
*missed*. Cross-project intelligence is exactly that.

## Locked decisions (from the 2026-06-17 brainstorm — carried verbatim)

1. **Dual-tier everywhere.** Every premium capability = a deterministic, free, instant baseline + an LLM accelerator
   behind an entitlement flag. Baseline ON for everyone; LLM layer paved but flag-gated, default OFF. **Never gate a
   build; only gate speed/polish accelerators** (memory `build-monetization-model`).
2. **Ground answers project-aware.** Inject the project's scope + a compact "what's in here / across your other
   projects" into the existing chat; answer at the project's grain; close with ≤1 cross-project offer.
3. **Cross-project intelligence is the centerpiece** — bidirectional, deterministic for v1: **reuse / gap / pairing**,
   plus **assemble-on-command**. v1 grain = ZIP/topic; future-proof toward address grain (reserve the slot).
4. **Prompts: deterministic baseline now, LLM-polish paved + gated.** Recompute only on project-switch or after a
   question. Never on the synchronous render path.
5. **Selective pre-build paved + gated.** Free baseline = cheap deterministic staging; the one-LLM-pass background
   pre-build of ONE deliverable is flag-gated, signal-triggered, never eager, never blocks.
6. **On-the-fly digest; no new tables.** Derive each open; persist only tiny markers in `projects.ui_state` (P1's bag).
   Cross-project index computed on the fly. (A cached `project_identity_index` table is a future optimization.)

## Two-agent reconciliation (doc 05, LOCKED 2026-06-17 — holds over the "one assistant" language in 00/02)

There are **two agents**, not one-in-two-contexts: a **data agent** (anonymous, whole-site incl. `/welcome`) and a
**project agent** (authed, inside `/project/[id]`). This maps cleanly onto P2's organizing split:

- **Grounding (project-aware *answers*)** → the **data agent** surface = anonymous, text-only `/api/welcome/chat`.
  P2 §D pushes a client-computed project context block as **DATA** (no server auth needed). The cheap win.
- **Actions (project *mutations*)** → the **project agent** surface = an **authenticated** path with `user_id` +
  `project_id`. This is **G1** (below). Never reintroduce a welcome/third persona (memory
  `two-agent-architecture-welcome-killed`).

---

## GROUND TRUTH — drift from the plan's seam claims (verified at `2355bfa`)

The plan's "Dependencies on Piece 1" table assumed P1 shipped seams it **did not**. P2 builds them.

| # | Severity | Seam | Plan claimed | Actual (file:line) | P2 adjustment |
|---|---|---|---|---|---|
| 1 | **BLOCKER** | `aiContext`/`setAiContext` | P1 ships it; P2 "swaps the backing to a store" | **Does not exist.** `BriefcaseContextValue = {draftItems,fileItem,removeItem,draftNearCap}` (`BriefcaseProvider.tsx:26-32`). Identifiers appear only in FINAL BOSS docs. No `useSyncExternalStore` anywhere. | **Build the context bus from scratch** (module store + `useAiContext` + `ProjectAiContextBridge`). |
| 2 | **BLOCKER** | project `PillPage` variant | `pageFromPath` returns `{kind:"project",projectId}` | `pageFromPath` falls through to `{kind:"generic"}` (`pill-mount.ts:4-9`); `PillPage` = 4 variants, no project (`visits.ts:77-81`). | Add union variant + `/project/` branch + **both** `promptsForPage`/`createSuggestion` cases atomically. |
| 3 | **BLOCKER** | `deriveProjectName` scope reuse | P2 reuses its ZIP/topic logic | All scope internals (`ZIP_RE`, `PLACE_NEEDLES`, `TOPICS`, `PLACE_BY_ZIP`, `placeForZip`, `itemText`, `topKey`) are **module-private**; only `deriveProjectName` is exported. | **Extract `inferScopeFromItems(items)` first**, rewire `deriveProjectName`. ONE ZIP regex root. |
| 4 | MAJOR | G1 = "port `/api/converse`" | converse "already supports charts + actions" | converse is **anonymous, zero mutations**, keyed on `report_id` not `project_id` (`converse/route.ts:23-25,77-241`). "Actions" = an SSE chart frame. | **Reject (a).** See G1 below. |
| 5 | MAJOR | `getExtraBody` carries project ctx | implied | derives `projectId` but never sends it; `describePage("/project/[id]")` returns flat `"one of their projects"` (`page-context.ts:60`). | Thread project DATA via the **existing** `pageContext`/`briefcase` fields, enrich `describePage`. No new body field. |
| 6 | MAJOR | rail "prefetch the digest" | rail prefetches digest on hover/click | `ProjectsRail.tsx:44-56` is generic `<Link prefetch>` only; no handler, no digest primitive. | Build the digest primitive first; add `onMouseEnter/onFocus` prefetch. |
| 7 | MEDIUM | `ui_state` PATCH merges additively | implied | route **overwrites the whole column** (`[id]/route.ts:60-66`); additivity exists only client-side via `ProjectWorkspace.patchUiState` (`:184-198`). | P2 writes `ui_state` **only** through `patchUiState`. (Optional server jsonb-merge if a 2nd writer appears.) |
| 8 | MEDIUM | export names | `parse-scope`/`apply-brand`/`reorder` | real: `parseDeliverableScope`, `applyUserBrandToProject`, `reorderWithinKind`. | Import the real names. |
| 9 | MINOR | "spec-validator + 3 lints" on deliverables | implied | `assembleDeliverable`→`buildDeliverableNarrative` runs `lintDeliverableNarrative` (number/grounded/jargon), **not** the refinery validators. | Prose through `assembleDeliverable` is auto-gated; don't re-invoke. |
| 10 | NOTE | freshness compare | `newest token > last seen` | token = `SWFL-7421-v{n}-{YYYYMMDD}`; `v{n}` sorts before the date → raw `>` mis-orders. Token REQUIRED only on `metric`/`table_slice`. | Filter to token-carrying items; compare the `YYYYMMDD` tail via `tokenDay()` (`reconcile.ts:80-87`). Missing `last_freshness_token_seen` = "never seen". |

### Already shipped → do **not** rebuild
- **§D grounding plumbing** (`98e395d`): the 600/1200-char clamps, DATA-not-instructions framing
  (`buildClientContextBlock`), `getExtraBody` capture, `ANALYST_SYSTEM` + no-invention floor, RoE injection. P2 §D =
  **only** enrich `describePage`'s `/project/` branch to name the project (improvement #1).
- Build-path scope/email threading (`build/route.ts`, `swfl_project_build`, `parseDeliverableScope`) — P1 §I.
- Branding-follows-all-paths (`applyUserBrandToProject` on import/claim/create).
- Persistent layout + rail + `ProjectWorkspace`/`workspace/*` mount points. **Never add `key={pathname}` above the pill.**

## G1 — authenticated action surface (the J4 unblocker) — DECISION

**Recommendation: option (b), reframed as wiring not construction.** Evidence:
- (a) port `/api/converse` — **rejected**: anonymous, zero mutations; buys only a chart frame the plan defers.
- (c) route the pill through MCP `X-Project-Key` — **rejected as transport**: wrong auth model; the pill already holds a
  session cookie.
- (b) cookie-authed route(s) — **chosen**. Two of the three actions **already exist authed**:
  - "Ready to send?" → existing **`app/api/email/schedule-command/route.ts`** (cookie-auth `:58-63`, PROPOSE→CONFIRM,
    signed single-use proposal-nonce, `fromScope`/`fromDeliverable`).
  - "Seed a build" → existing **`app/api/projects/[id]/build/route.ts`** (cookie-RLS ownership 404, scope-threaded,
    accepts `email`).
  - Only a **thin generic "do this for me" dispatcher** is genuinely new: cookie/RLS `getUser`→401, parse intent
    (forced-tool Haiku), **PROPOSE a structured action + summary (never silent-mutate)**, CONFIRM writes via the
    existing orchestrators (`assembleDeliverable`, `projectItemsSchema` add/dedupe).
- **Unify at the orchestrator layer, never transport** — web + MCP stay at parity (they already share
  `assembleDeliverable`).
- Guardrails: cookie client + RLS-404 for ownership (never service-role for the *check*); keep PROPOSE→CONFIRM +
  nonce (keep any new nonce test deterministic — the historical 6.5%/push flaky file). **Crosses RULE 1 "ask for diff
  review before pushing" (live response surface) → operator review before push.**

## Components & build order (refined for the drift; first gate is ESLint, not `next build`)

CI/local gate every step: **`bunx tsc --noEmit && bunx eslint . && bun test`**. Tests = `bun:test` (`describe/it/expect`),
pure-function, in `lib/project/*.test.ts`. No new deps (reuse `@anthropic-ai/sdk`). P2 trips none of the 5 pre-push gates.

0. **Extract `inferScopeFromItems`** (`derive-name.ts`) — Blocker-3. `derive-name.test.ts` stays green + new tests.
1. **Context bus from scratch** — module store keyed by `projectId` (`get/set/subscribe`); `useAiContext()` via
   `useSyncExternalStore` with a **stable `getServerSnapshot`** (SSR/hydration); `ProjectAiContextBridge` seeded by a
   **lazy `useState(() => store.set(id, seed))`** (not an effect). Root pill is a **sibling** of `app/project/layout.tsx`
   (`app/layout.tsx:53`), so context routes through the module store, not React tree-up. `ProjectWorkspace` is
   `key={project.id}` (remounts per project) → switch-surviving context lives in the store, keyed by id. Pure `bun:test`
   for the store. **Gate with `bunx eslint .`** — `react-hooks/set-state-in-effect` is a hard error, no repo precedent.
2. **Project `PillPage` variant** (atomic, Blocker-2) + `PROJECT_PROMPTS`.
3. **Digest** `lib/project/digest.ts` — `buildProjectDigest(input): ProjectDigest`. Reuse `summarizeItem`,
   `groupItemsByKind`, `inferScopeFromItems`, `parseDeliverableScope` (schedule/deliverable fallback).
   `latestActivityAt = max(items.added_at ∪ deliverables.created_at)`. `freshnessChangedSinceSeen` via `tokenDay()` tail.
   `staleMetrics` gated (OFF → `[]`). **nodejs runtime** (reconcile reads brain `.md` off disk). Pure `bun:test`.
4. **Cross-project index** `lib/project/cross-project-index.ts` — identity keys per kind (null-coalesce optional
   `metric_slug`/`frame_id`/`metric_keys`; define a frame-key fallback). `findOverlap → {reuse,gap,pairing}`,
   conservative (exact id + scope match), respects `ui_state.dismissed_overlap_keys`. Pure `bun:test` incl. absent-field.
5. **Prompt engine** `lib/project/prompt-engine.ts` — `projectPrompts(...) → {prompts[3], offer}`, ranked
   (`freshData > readyToSend > crossProject > whereLeftOff`), no-project broad set, memoize `(projectId, rev,
   questionCount)`. Branch `BriefcasePanel` for `kind==="project"`. Pure `bun:test`.
6. **Answer grounding (§D)** — enrich `describePage("/project/[id]")` to name the project + one-line "what's in here"
   (≤600 chars), through the **existing** `pageContext`/`briefcase` fields. Keep route anonymous + DATA-framing + RoE.
7. **Assemble-command** `lib/project/assemble-command.ts` — parse scope (`inferScopeFromItems`), select identity-matched
   items via the index, **create-then-build**: `POST /api/projects/import` then `POST /api/projects/[id]/build` with
   scope. Branding auto. Reserve `scope.address?`. Pure `bun:test` for selection/payload.
8. **`ui_state` write-back** — `last_freshness_token_seen` / `dismissed_overlap_keys` **only** via `patchUiState`.
9. **Gated LLM layers paved** — `PROMPT_POLISH_ENABLED` / `PREBUILD_ENABLED` / `ASSEMBLE_LLM_ENABLED` as
   **env-injectable default-OFF** flags (copy `lib/highlighter/flag.ts` idiom — testable without mutating global env);
   deterministic fallback verified flag-off. Never gate builds.
10. **G1 wiring (separate; operator diff-review)** — per the decision above.

## In-scope improvements ("improve where you can")
#1 name the project in `describePage` · #2 project starter prompts · #3 real rail digest prefetch · #5 freshness
tail-compare · #6 clip the `summarizeItem` metric branch (the one kind not clipped today). **Held (ask first):** server
jsonb deep-merge for `ui_state` (only if a 2nd writer lands); RoE on the analyst failsafe path; touching
`recordUse('build')`-before-assembly.

## P3/P4 seams P2 must leave clean
- P2's digest leaves a **`readProjectFeed` slot** returning `[]` until P3 ships. P3's `projectScopeSet` will reuse the
  same `inferScopeFromItems` extracted in step 0 — so the extraction pays double.
- P2's "the new data shows X — add it?" / "Ready to send?" prompts are **offers**; the *action* (refresh) is P4 / the G1
  surface. Don't fold P4 refresh logic into P2.

## Acceptance (J2 + part of J4)
Open a project → pill shows project-specific 3+1 prompts (not the generic home set); **pill never reloads on switch**
(no `key={pathname}`); prompts change only on switch or a question; ask a question inside a project → answer is at the
project's grain + ≤1 cross-project offer, freshness token quoted, cites, `[INFERENCE]` tagged; "build a project for
{ZIP}, pull from existing" → new project lands open with matched items; flags OFF → deterministic everything (no LLM
calls). Open obligations → `checks` (e.g. `piece2_context_bus_live_verify`, `piece2_crossproject_assemble_live_verify`).
