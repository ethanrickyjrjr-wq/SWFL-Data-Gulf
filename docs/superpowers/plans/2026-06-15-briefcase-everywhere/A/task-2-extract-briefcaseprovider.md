# A-2 — Extract root `BriefcaseProvider` (+ safe context bridge) — **OPUS**

## Goal
Lift draft state out of the highlighter context into a root-mountable `BriefcaseProvider` so the
briefcase can live globally — **without changing behavior** — and add a non-throwing
highlighter-context accessor so the global unified pill (A-3) can bridge on `/r/*` and degrade off
it. Atomic, one commit.

## OPUS because the move must be grep-driven
**Drive the repoint off a grep of consumers** (draft-field usage), not a hardcoded list. Verified
move set is exactly three:
- `components/highlighter/Briefcase.tsx`
- `components/highlighter/HighlightPopup.tsx` (`fileItem`)
- `components/highlighter/AskAiDock.tsx` (`ctx?.fileItem(...)` — the once-missed consumer; include it)

**Exclusions:** `AskAi.tsx` is a mount point (renders `<Briefcase/>`), not a draft consumer.
`use-highlight.ts` does **not** touch draft state (pure selection snapping) — drop it.

## What moves vs stays (`lib/highlighter/context.tsx`)
- **Move only:** `draftItems`, `fileItem`, `removeItem`, `draftNearCap`. Lazy-init is the 3-line
  `useState(() => loadDraftFrom(browserStorage()))`; write-through lives in `fileItem`/`removeItem`.
- **Keep in the highlighter context:** `chipFact`, `onActivate`, `thread`, `archiveExchange`,
  `clearThread`.
- Constants: `DRAFT_KEY = "swfl_project_draft_v1"`, `DRAFT_CAP = 50`.
- **Move the existing draft-reducer tests** (in `lib/highlighter/context.test.tsx`) to the new
  provider's test file.

## New: safe bridge for the global pill
Add a **non-throwing** accessor (e.g. `useOptionalHighlighterContext()`) that returns `null` when no
provider is present. The throwing `useHighlighterContext()` stays for `/r/*`-only consumers. A-3's
global pill uses the optional accessor so it can bridge on `/r/*` and run standalone elsewhere.

## Acceptance test
- Grep shows every draft consumer now reads from `BriefcaseProvider`; the three components behave
  **exactly** as before (exercise `AskAiDock` file-this-chart specifically).
- `useOptionalHighlighterContext()` returns `null` off `/r/*` without throwing.
- Draft-reducer tests pass in their new home; `tsc`/`eslint` clean; one atomic commit; no behavior
  change — ownership moved only.
