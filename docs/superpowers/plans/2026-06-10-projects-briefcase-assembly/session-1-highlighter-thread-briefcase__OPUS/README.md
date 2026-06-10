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
