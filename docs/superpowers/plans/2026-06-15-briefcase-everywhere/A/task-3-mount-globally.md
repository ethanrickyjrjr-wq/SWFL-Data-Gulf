# A-3 — Unified AI+Briefcase pill; retire the dock; mount globally — **OPUS**

## Goal
Replace the bottom-right surfaces with **one** unified "AI + Briefcase" pill on every page, and
retire the separate `/r/*` chat dock — without losing the report-page thread or file-this-chart.

## Build
- NEW `components/briefcase/AiBriefcasePill.tsx`: one fixed bottom-right pill (clearly labeled AI,
  badge = draft count), mounted **once** in the root layout inside `BriefcaseProvider`. Click opens
  the A-5 panel (AI chat + context-aware prompts + "create this now" + filed items + build path).

## Mode-aware (the heart of Option 4)
- **Off `/r/*`** (`/`, `/charts`, everywhere): standalone — `BriefcaseProvider` draft +
  `BriefcaseChat` (A-6). No `HighlighterContext`.
- **On `/r/*`**: bridge via `useOptionalHighlighterContext()` (A-2) to `thread(reportId)`,
  `archiveExchange`, `fileItem` — so the pill and the inline highlight-to-ask popup share **one**
  thread. Filing always lands in the **global** draft.

## Retire the dock (no two pills)
- Retire `AskAiFab` + `AskAiDock` as a separate bottom-right element; absorb thread +
  file-this-chart into the pill's on-`/r/*` mode. **Behavior parity on thread persistence +
  file-this-chart is the gate**; the dock's drag/resize chrome is optional (preserve if cheap).
- Remove the per-page `<Briefcase/>` mount from `AskAi.tsx`.
- **Keep** the inline highlight-to-ask popup (`HighlightPopup`) `/r/*`-only — only the corner-pill
  role merges; the popup does not go site-wide.

## Acceptance test
- **Exactly one** bottom-right pill on `/`, `/charts`, `/r/<any>` — no double on `/r/*`, no zero off
  it.
- **On `/r/*`:** pill chat thread persists via `HighlighterContext` AND file-this-chart still works
  (no change from the retired dock).
- **Off `/r/*` (e.g. `/charts`):** pill renders standalone, opens `BriefcaseChat`, files to the
  global draft, and throws **no** error from a missing `HighlighterContext` (degrade cleanly).
