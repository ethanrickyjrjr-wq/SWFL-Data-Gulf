# Session 1 — Highlighter: thread persistence + briefcase capture  ·  **OPUS**  ·  ~2.5–3 days

> Read `../shared/conventions.md`, `../shared/data-model.md`, `../AUDIT.md` first. **Why Opus:** this is intricate React state-lift work where the repo has a hard footgun — `react-hooks/set-state-in-effect` is a **hard ESLint error** here (auto-memory `feedback_react-set-state-in-effect`): calling `setState` synchronously inside a `useEffect` body blocks commits. Use the **"set state during render"** pattern, never an effect, when deriving state from props/state. Context-lift regressions are the named top risk.

**Goal:** Lift the highlighter conversation thread out of `HighlightPopup` into the shared `HighlighterProvider` so it survives close/reopen and is shared with the Ask-AI dock; add the **briefcase** capture tray (file answers/figures/reports into a `localStorage` draft project); fix cross-cell selection snapping.

**Architecture:** `lib/highlighter/context.tsx` (today holds only `chipFact`) grows `thread` (per-`reportId` map of `ChatEntry[]`) + `draftItems: ProjectItem[]` with `localStorage` write-through (precedent: `swfl_ai_dock_geom`). `HighlightPopup` and `AskAiDock` both read the context instead of owning local thread state. A new `Briefcase` tray lists draft items. `ProjectItem` is created here (`lib/project/items.ts`) — the spine the whole plan imports.

**Tasks (read in order):**
- [x] `task-01-project-items-union.md` — created `lib/project/items.ts` (shared union + zod) + tests (4/4)
- [x] `task-02-lift-thread-to-provider.md` — grew `context.tsx` with thread + draft state, `localStorage` write-through (lazy-init read, write-in-callback, no setState-in-effect); pure reducers unit-tested (8/8)
- [x] `task-03-popup-reads-context.md` — popup reads `ctx.thread(reportId)`; condensed reopen w/ tap-to-expand
- [x] `task-04-dock-shares-thread.md` — `AskAiDock` shares the provider thread (null-safe local fallback)
- [x] `task-05-briefcase-tray-and-file-affordances.md` — `Briefcase.tsx` + badge + "File this …" affordances + widened `metricSuggestions` provenance on brain **and** corridor pages `[AUDIT-FIX C-meta + EXTENDED]` + meter `item_add`
- [x] `task-06-cross-cell-snapping.md` — `snapCrossCellSelection` + ambiguous-mix suppression; pure `pickDominantCell` unit-tested (7/7)

**Completion notes (2026-06-10):**
- **Test-env deviation:** the repo has **no DOM test environment** (bun:test only — no vitest/jsdom/@testing-library, and no bunfig DOM preload; adding a global registrator would perturb every existing pure test). So the plan's `renderHook`/jsdom-`Range` snippets were re-cast as **pure-function** tests (`appendExchange`/`addItem`/`pickDominantCell` etc.) run under `bun:test`; the React/DOM wrappers are guarded by the `react-hooks/set-state-in-effect` lint + manual smokes. No new test-env deps, no lockfile change.
- **Path deltas vs. plan:** `HighlighterLayer.tsx` lives in `components/highlighter/`, not `app/r/[slug]/`. Edited the real file.
- **Bug fixed in flight:** lifting thread to a component-level `ctx` exposed a name clash with a pre-existing local `const ctx` (prior-context string) inside `HighlightPopup.submit` — renamed the string to `priorContext` so `archiveExchange` hits the provider (tsc would otherwise have errored). `tsc --noEmit` now 0 errors app-wide.
- **Manual browser smokes (plan steps) NOT run** — no dev server in this session; highlighter UI is flag-gated OFF in prod (`highlighterUiEnabled`), so unverified UI can't reach users. Recommend a local `bun run dev` smoke before flipping the flag.

**Files:** new `lib/project/items.ts` · `lib/highlighter/context.tsx` · `components/highlighter/HighlightPopup.tsx` · `components/highlighter/AskAiDock.tsx` · `components/highlighter/AskAi.tsx` · new `components/highlighter/Briefcase.tsx` · `lib/highlighter/use-highlight.ts` · `app/r/[slug]/page.tsx` (widen projection) · `app/r/[slug]/HighlighterLayer.tsx`

**Depends on:** S0 (for `item_add` metering via `/api/meter`).

**Risk:** state-lift regressions → **move state, not effects**; unit-test the provider; never `setState` in an effect body.

**Diff-review gate:** none (client-only + new lib). Standard ship checklist; pause for operator push confirmation.
