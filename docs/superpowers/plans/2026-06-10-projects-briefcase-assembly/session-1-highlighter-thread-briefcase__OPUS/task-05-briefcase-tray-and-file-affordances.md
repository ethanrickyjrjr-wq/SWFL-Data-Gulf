# Task 05 — Briefcase tray + "File this …" affordances + widen `metricSuggestions`

**Goal:** A briefcase icon with a count badge (next to the Ask-AI FAB) opens a tray listing the draft items (remove/reorder, "Open project" link). Each thread exchange gets "File this answer" (→`qa`); a resolved fact gets "File this figure" (→`metric`); the tray gets "File this report" (→`report`). Every file logs `item_add` via `/api/meter`.

> **[AUDIT-FIX C-meta EXTENDED — 2026-06-10]** The `metricSuggestions` widen in Step 1 applies to `app/r/[slug]/page.tsx` (brain pages). **Corridor breakdown pages are broken by the same bug.** `app/r/cre-swfl/[corridor]/page.tsx` line 120 calls `<MetricsTable metrics={metrics} trendLabel="Trend" />` with no suggestion/provenance props, AND its `HighlighterLayer` call (line 171) passes no `metricSuggestions`. Result: popup opens with stripped fact (no slug → no methodology → no grounded chips → generic fallback only). Fix in the same Step 1 pass: map the corridor metric rows into the same `MetricSuggestion[]` shape (`label`, `value`, `sourceUrl?`, `sourceLabel?`, `freshnessToken`) and pass them to the corridor page's `HighlighterLayer` call. Same pattern, one extra file.

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
