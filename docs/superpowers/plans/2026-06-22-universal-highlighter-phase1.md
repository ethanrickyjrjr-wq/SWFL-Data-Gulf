# Universal Highlighter — make it the selection-triggered twin of the AI pill

> **Phase 3C of the One-Assistant unification** (`docs/superpowers/specs/2026-06-21-one-assistant-unification-RECONCILED-SCOPE.md`).
> Status: PLANNED (2026-06-22) · audited across 3 review passes (B1 refuted → M1; B2/M3/M4/M5/S6/S7 folded in).

## Context

**The problem:** The AI pill is global — mounted once at the app root (`app/layout.tsx` → `AppShell` + `BriefcaseProvider`) and it context-switches OUTSIDE AI ↔ PROJECT AI by pathname. The **highlighter is not**: it's mounted per-page on only 5 `/r/*` routes and hard-requires a `reportId`. So highlighting does nothing on home, charts, maps, `/z/[zip]`, or anywhere else. Operator: *"NOT JUST IN /R/ OR IN ZIPS."*

**The intent (operator-confirmed):** pill and highlighter are the **same assistant** — one brain (the `/api/assistant` engine), one file cabinet (the briefcase) — just two triggers: **click** (pill) vs. **highlight** (highlighter). Two environments: **Outside** (everywhere except projects → ask/summarize/file, no editing) and **Inside a project** (PROJECT AI, editing happens here). The highlighter must mount at the **same root as the pill** and share the pill's brain + cabinet. Both read the *same* `BriefcaseProvider`, so "files added via either show up in both" is **automatic — nothing to sync.**

**Why it's ready:** the one-engine `/api/assistant` + degrade-never-throw already shipped (Phases 0–2 of `docs/superpowers/specs/2026-06-21-one-assistant-unification-RECONCILED-SCOPE.md`). `lib/assistant/engine.ts` `isReportRequest` returns false when `report_id` is absent → `runConversationPath` (`context:"outside"`). Off-report grounding already works server-side. This is that spec's **Phase 3C "Highlighter-to-root."**

**Scope of THIS plan: Phase 1 (Outside highlighter → root) only** — fully independent, the headline. Phase 2 (Project highlighter) is sketched at the end but **deferred to its own design pass**.

## INVARIANTS — do not break (operator decree + verified contracts)

1. **Selection logic is MOVED, NOT REWRITTEN.** `lib/highlighter/use-highlight.ts` is **not modified**. Snap-to-word (`expandRangeToWordStart`/`End`), snap-to-complete-number (`classifyFact`), cross-row snap (`snapCrossRowSelection`), worthiness filter (`isWorthySelection`), `MAX_WORDS`, the double-tap window, and the **mobile breakpoint** (`window.matchMedia("(max-width: 639px)")`, `isNarrow`) all carry over byte-identical. **Phone and desktop selection behavior must be unchanged.** Same for `HighlightPopup`'s mobile positioning (`position.ts`, `isNarrow`) and `DiscoveryTicker`'s desktop-only `hidden sm:block`.
2. **Off-report filing keeps working (parity with the pill).** The pill already files `qa` off-report with `report_id: groundedZip || "swfl"` (`BriefcaseChat.tsx:153`, via `buildQaItem`). The highlighter must do the **same** — never suppress filing, never change the schema.
3. **Exactly one pill and one highlighter per page.**
4. **The `/r/*` 404-prevention contract survives** — every report page still declares a real surface kind via `buildReportId(...)` (the guard, finding B2).

## The shape (after Phase 1)

| Surface | Highlighter | Pill (owner: `AppShell`) |
|---|---|---|
| home / charts / maps / `/z/[zip]` / `/d/*` … | OUTSIDE AI, page-context grounded; files `qa` w/ `report_id="swfl"` (or grounded ZIP) | standalone (`BriefcasePanel`) |
| `/r/*` reports | OUTSIDE AI **report-grounded** (`report_id`=encoded slug) + dossier chips — **unchanged** | **bridged** (`AskAiDock`) |
| `/p/*`, `/embed/*`, `/login`, `/auth` | **suppressed** | suppressed (today's rule; pill currently shows on /login—see #6) |
| `/project/[id]` | Phase 2 (deferred) | project-aware (works today) |

## Approach (Phase 1)

### Root wiring — `app/layout.tsx`, inside `BriefcaseProvider`
```
<BriefcaseProvider>
  …ResetZoom / StandaloneBackBar / SiteShell…
  <HighlighterProvider>                 // LIFTED to root (was per-/r/*-page)
    {children}                          // FactChips still feed chipFact via this provider
    <GlobalHighlighter />               // NEW — selection capture + popup + coachmark/ticker ONLY (no pill)
    <AppShell highlighterEnabled={…} /> // MOVED inside the provider; SOLE pill owner
  </HighlighterProvider>
  <SiteFooter />
</BriefcaseProvider>
```
`AppShell` sits **inside** `HighlighterProvider` so its bridged pill's `AskAiDock` still reads the (now-global) thread.

### Pieces

1. **`lib/highlighter/report-context-store.ts` (NEW)** — module store mirroring `lib/project/ai-context-store.ts`: holds `{ reportId, conclusion, freshnessToken, metricSuggestions } | null`; `publishReportContext()`, `clearReportContext()`, `useReportContext()` (`useSyncExternalStore`, SSR snapshot null). Relocate `MetricSuggestion` + `resolveSuggestions` + `resolveMetric` here from the deleted `HighlighterLayer`.

2. **`ReportHighlightBridge` (NEW, client)** — each of the 5 `/r/*` pages mounts it (replacing `<HighlighterProvider>`+`<HighlighterLayer>`). Props `{ reportId, conclusion, freshnessToken, metricSuggestions }`. Mirrors `ProjectAiContextBridge`: **publish in a lazy `useState` initializer** (SSR-safe), **plus a cleanup `useEffect(() => () => clearReportContext(), [])`** to clear on unmount (S6 — a module-store write in an effect does NOT trip `react-hooks/set-state-in-effect`, which governs React `setState`, not module globals; an update effect handles a same-mount context change, exactly like `ProjectAiContextBridge`). The `reportId` prop keeps the `buildReportId(...)` encoding so the guard (#4/B2) still holds. Pages: `app/r/[slug]/page.tsx`, `r/zip-report/[zip]`, `r/method/[metric]`, `r/source/[table]`, `r/cre-swfl/[corridor]`.

3. **`components/highlighter/GlobalHighlighter.tsx` (NEW, client)** — mounted once at root inside `HighlighterProvider`. Reads `useReportContext()` + `usePathname()` + `useHighlight()` + `useHighlighterContext()` (chipFact). Renders **only** `HighlightPopup` (on a selected fact) + `FirstTouchHint` + `DiscoveryTicker`. Renders nothing when `shouldMountHighlighter(pathname)` is false. Passes the popup `reportId={ctx?.reportId}` (grounding) and `threadKey` (see #7). Chips from the relocated `resolveSuggestions`/`resolveMetric` (`[]`/null off-report → existing prose fallback). **No pill here.**

4. **`components/briefcase/AppShell.tsx` (CHANGED — sole pill owner; resolves B1-pill/#1, S7).** Add `useReportContext()`. If report context present (`/r/*`) → `<AiBriefcasePill reportId={ctx.reportId} conclusion freshnessToken />` → **bridged** (`AiBriefcasePill.reportId` is already optional + already switches bridged/standalone on a non-empty reportId — no change to that component). Else → today's `shouldRenderStandalone(pathname, highlighterEnabled)` standalone path (keep the `highlighterEnabled` prop). Delete the `<AiBriefcasePill/>` the old `HighlighterLayer` rendered. No double pill: on `/r/*`, `shouldRenderStandalone` already returns false → only bridged; elsewhere only standalone; `/p//embed/` none.

5. **`components/highlighter/HighlighterLayer.tsx` — DELETED.** Responsibilities split: popup/ticker → `GlobalHighlighter`; pill → `AppShell`; chip resolvers → the store module.

6. **`shouldMountHighlighter(pathname): boolean` (NEW in `lib/briefcase/pill-mount.ts`; resolves #4/M5).** Suppress `/p/`, `/embed/` (shared white-label clauses with the pill) **PLUS `/login`, `/auth` — NEW, NOT shared**: `shouldRenderStandalone` does *not* suppress those (the pill currently renders on `/login`), but the highlighter has nothing to highlight on an auth form. **It does NOT suppress `/r/*`** (the highlighter's home — explicitly different from `shouldRenderStandalone`). Tests pin the asymmetry: `shouldMountHighlighter("/login")===false` while `shouldRenderStandalone("/login",true)===true`; `shouldMountHighlighter("/r/x")===true`.

7. **`reportId` optional + explicit `threadKey`** (resolves M4, INFO):
   - `lib/highlighter/converse.ts` — change the **type** `ConverseInput.reportId` → optional (`reportId?: string`), else every off-report `streamConverse({reportId: undefined})` is a compile error. Body already drops `report_id` via `JSON.stringify` when undefined → conversation path. **Also update the existing capturing-fetch test** `converse.test.ts` (the body type `{ report_id: string }` → `{ report_id?: string }`), and **add** a case asserting no `report_id` key off-report.
   - `components/highlighter/HighlightPopup.tsx` — add `threadKey: string` (the bucket for `ctx.thread()`/`archiveExchange()`); `reportId?: string` is **grounding only**. Never pass `pathname` as `reportId` (would wrongly flip `isReportRequest`).
   - `GlobalHighlighter` computes `threadKey = ctx?.reportId ?? "outside"` — off-report uses **one shared `"outside"` thread** (parity with the pill, whose off-project thread is a single bucket via `useProjectThread(null)`), giving whole-site conversational continuity; `/r/*` keeps per-report threads. Bounded by `THREAD_CAP`; `clearThread`-on-logout unchanged.

8. **Off-report filing parity (resolves M1 [was B1]; INVARIANT #2).** Apply the `reportId ?? "swfl"` sentinel at **every** filing call site in `HighlightPopup` (`fileAnswer`, plus the `report_id` passed in `fileFigure`/`fileChart`'s source metadata) — the pill's exact convention via the shared `buildQaItem`. Capture the grounded ZIP (+ freshness) from the conversation path's prelude `place` frame via a new `onPlace` handler on `streamConverse`/`useConverse` (mirror `BriefcaseChat`'s `placeRef`); if absent, `"swfl"` keeps the item schema-valid (`qa.freshness_token` is optional). **"File this figure" (`metric`) + `table_slice` are only offered when `resolveMetric` matches a dossier metric — i.e. only on `/r/*`** — so their required `report_id`+`freshness_token` are never *reached* off-report (the sentinel is defensive belt-and-suspenders); **no schema change.**

9. **Suppress the Claude-handoff buttons off-report (M1 tail — reviewer's cleaner-UX call).** `buildClaudeHandoff` (`lib/highlighter/handoff.ts`) is inherently report-referencing — it emits a `swfl_fetch report_id="…"` MCP line that is meaningless with the `"swfl"` sentinel. So **hide the "Copy for Claude" / "Open in Claude" affordances entirely when `reportId` is absent** (rather than degrade the prose). They return on `/r/*` where a real `report_id` exists. Cleaner than shipping a 404-on-call handoff.

10. **`DiscoveryTicker` context-aware (resolves M3).** Lifting it off `/r/*` exposes `"…about this report"` + `"Double-tap any figure"` on home/charts. Split TIPs into a report set (on `/r/*`) and a generic set (off-report: drop the report/figure-specific tips). `GlobalHighlighter` selects via `useReportContext()`. Keep `hidden sm:block` (desktop-only — phone rule, INVARIANT #1).

11. **Stale comment (M5/finding #5).** `app/r/[slug]/page.tsx` ~line 271 says *"default OFF"*; `flag.ts` is default **ON**. Fix when editing the page.

## Reuse (don't rebuild)
- **File cabinet:** `BriefcaseProvider` — already global + shared; the popup files via `useBriefcase().fileItem`. **`buildQaItem`** (`lib/briefcase/qa-item.ts`) is the shared, schema-valid builder both surfaces use.
- **Mount/context:** `lib/briefcase/pill-mount.ts` — add `shouldMountHighlighter` beside `shouldRenderStandalone` so the rules live in one file.
- **Context-bus pattern:** `lib/project/ai-context-store.ts` + `ProjectAiContextBridge.tsx` — copy for the report store/bridge.
- **One brain + selection:** `lib/assistant/*` and `lib/highlighter/use-highlight.ts` — **unchanged.**

## Decision flagged for operator (the `/p/` question)
`/p/[id]` + `/embed/*` deliberately hide nav/footer/pill so the **sent** copy is clean/white-label (your client, who you sent the link to, would otherwise see the SWFL AI pill on it). Default here: **highlighter follows that hide-list** — you edit inside the project; `/p/` stays the clean sent artifact. Showing it on `/p/` is a one-line change to `shouldMountHighlighter` (optionally owner-gated). **Default = keep `/p/` clean unless you say otherwise.**

## Verification
- `bun test` — existing `converse.test.ts` (updated body type), `context` reducers, `pill-mount`, `highlighter/flag`, **`report-surface.test.ts` guard repointed to `ReportHighlightBridge`**. Add: (a) converse off-report omits `report_id`; (b) `shouldMountHighlighter` asymmetry (`/login`=false vs pill=true, `/r/x`=true, `/p/x`=false); (c) **EXHAUSTIVE page-coverage guard — glob EVERY `app/**/page.tsx`** (36 today), derive a representative pathname per route (dynamic segments `[x]`/`[...x]` → a placeholder), and for each assert the invariant: **never two pills, never two highlighters**; **exactly one pill + one highlighter** on every page EXCEPT the deliberately-clean set, where it's **zero + zero**. The clean set is asserted to be EXACTLY `/p/*`, `/embed/*`, `/login`, `/auth/*` (+ `/project/*` carries the pill but the highlighter is Phase-2) — so a NEW page can't silently land with zero/double mounts; if someone adds a page that should be clean, they must add it to the list and the test makes that explicit. This is the real "all pages means all pages" proof, and it auto-covers future routes.
- `bunx next build` — required before push (clean `npx tsc` is NOT enough — `next build` is the real gate, per prior burn).
- **Manual (the real proof):**
  - **home / charts / maps / `/z/[zip]`** → select text (verify snap-to-word/number still works) → OUTSIDE AI popup **answers** (confirms `converse` parses the conversation-path stream) → "File this answer" lands in the briefcase and the **pill badge increments** (shared cabinet).
  - **phone** → selection + popup behave exactly as before (breakpoint rules intact); ticker hidden.
  - **`/r/[slug]`** → unchanged: report-grounded answer + dossier chips + bridged dock pill; exactly one pill.
  - **`/p/[id]`, `/embed/*`, `/login`** → no highlighter, no pill.
- Pre-push: touches `/api/assistant`-adjacent client + 5 report pages → **diff review before pushing** (RULE 1), `SESSION_LOG.md` entry, `node scripts/safe-push.mjs`.

## Phase 2 — Project highlighter (DEFERRED — own design pass)
Same `GlobalHighlighter`, on `/project/[id]`, reads the project digest from `ai-context-store` (populated by `ProjectAiContextBridge`), sets `context:"project"`, files into the project, and surfaces PROJECT AI's edit offers. **Blocker:** `HighlightPopup` has no project-edit CTA today (only "File this …") — exposing PROPOSE→CONFIRM edit offers is net-new UI → `superpowers:brainstorming` first (RULE 3.5). Edits execute via existing authed routes `app/api/projects/[id]/action` + `/api/deliverables/*` (mutations stay off the answer-path root). `app/project/layout.tsx` untouched (honor its `key={pathname}` guard — highlighter persists from root like the pill). **Build Phase 1, verify in prod, then plan Phase 2 separately.**
