# Highlighter UX follow-ups — design (Phase 1.5)

> Status: drafted 2026-06-07 (Opus 4.8, autonomous — operator stepped out). Builds on the shipped, flag-gated
> Highlighter (PR #68 engine + popup, browser-verified locally). Source brief: the operator's verbatim requests in
> `docs/superpowers/plans/2026-06-07-highlighter-ux-followups-handoff.md`.
>
> **Approval model:** operator was unavailable for interactive brainstorming, so every open decision is resolved
> to a sensible **`[DEFAULT — confirm]`** with rationale. All work ships behind `HIGHLIGHTER_UI` (default **OFF**)
> on a **feature branch → PR**; the operator confirms/vetoes the defaults in PR review. **The prod flag is NOT
> flipped and the PR is NOT merged without the operator.**
>
> **Isolation note:** a parallel session is mid-build on the charts/graphs layer in the shared working tree
> (`components/charts/*`, `refinery/lib/chart-*`, `lib/fetch-brain.*`, `app/r/[slug]/page.tsx`). This work runs on
> a feature branch (`claude/highlighter-ux-followups`) and is deliberately scoped so it **does not edit any file the
> chart work touches** — in particular **not `app/r/[slug]/page.tsx`**. All new UI mounts _inside_
> `components/highlighter/HighlighterLayer.tsx` (already mounted on the page by PR #68). Only highlighter-owned
> files are staged.

## Goal

Turn the shipped popup into the discovery + conversation surface the operator described: composer open by default,
a clearer/recolored one-time coachmark that works on touch, an ambient discovery ticker, and a sticky "Ask AI"
dock for report-level chat. Keep the no-invention guarantee (server-side `/api/converse`, cite-or-decline,
metered) and the light/high-contrast theme already approved for the popup.

## Decisions

| #   | Decision               | Choice                                                                                                                                                                                                       |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Composer view (#1)     | **`[DEFAULT — confirm]`** Precomputed suggestion chips **above** an always-open textarea, in one `compose` view. Drop the "Ask your own question →" indirection.                                             |
| 2   | Coachmark wording (#2) | "**Double-tap a figure — or highlight it — to ask or chart it.**"                                                                                                                                            |
| 3   | Mobile selection (#2)  | Add a debounced `selectionchange` listener to `useHighlight` so touch double-tap / long-press selection opens the popup (today: `mouseup`/`keyup` only).                                                     |
| 4   | Coachmark color (#3)   | **`[DEFAULT — confirm]`** Light high-contrast pill (white card, dark text, teal ✦), matching the popup. Alt swatches below. One-liner to change.                                                             |
| 5   | Show-once (#4)         | Keep the existing **durable 1-year cookie** (`swfl_highlighter_seen`). Interpretation: once per device, then never. Verify-only.                                                                             |
| 6   | Ticker visibility (#5) | **`[DEFAULT — confirm]`** Always-on but very subtle; **hidden on `<sm` viewports**; static tip list for v1; pause-on-hover; respects `prefers-reduced-motion`.                                               |
| 7   | AI dock layout (#6)    | **`[DEFAULT — confirm]`** Desktop: hand-rolled draggable + resizable floating panel anchored above the FAB, geometry persisted to `localStorage`. Mobile (`<sm`): full-screen bottom sheet (no drag/resize). |
| 8   | Dock ↔ popup (#6)      | **`[DEFAULT — confirm]`** Two distinct surfaces sharing one engine: popup = "this specific figure"; dock = "this whole report". Independent; both metered via `/api/converse`.                               |
| 9   | Shared engine          | Extract the popup's `ask()` + SSE loop into `lib/highlighter/use-converse.ts`; popup and dock both consume it.                                                                                               |

No new dependencies (hand-rolled drag/resize) — honors the lockfile pre-push gate.

## Per-item design

### 1. Composer open by default — `HighlightPopup.tsx`

Collapse `Stage` from `"suggestions" | "ask" | "answer"` to `"compose" | "answer"`.

- **`compose`** (first view): the fact echo (unchanged), then the precomputed suggestion chips (each
  `onClick={() => ask(s)}`), then an always-visible `<textarea>` + **Ask** button (`onSubmit={() => ask(question)}`).
  No "Ask your own question →" link, no "← Back".
- **`answer`**: unchanged streaming view; "Ask another →" returns to `compose` (was `suggestions`).
- The `ask()` / `parseSSEFrames` loop, placement, Esc/outside-close, footer ("Chart this · soon", "Copy prompt for
  Claude ↗") are **untouched** (the `ask()` body moves to the shared hook — decision 9 — with identical behavior).
- The compose textarea is **not** auto-focused on mount (auto-focus would collapse the page selection on some
  browsers and fight placement); chips are immediately clickable and the textarea is one tap away.

### 2. Coachmark wording + mobile selection — `FirstTouchHint.tsx`, `use-highlight.ts`

- **Wording:** the box text becomes "Double-tap a figure — or highlight it — to ask or chart it." Number-snap
  (already shipped) means a double-tap on `91.5%` grabs the whole token, satisfying the operator's "not just 91 in
  91.5%" point.
- **Mobile selection gap (real bug):** `useHighlight` listens to `mouseup`/`keyup` only; a touch double-tap
  word-select does not reliably fire `mouseup`. Add `document.addEventListener("selectionchange", …)` with a
  ~300 ms debounce that calls the **existing `snapshot()`** (so the number-snap, suppression, and "don't clear while
  composing" logic all apply unchanged). Desktop keeps the immediate `mouseup`/`keyup` path; `selectionchange` is
  the touch-catch fallback. All three are removed on cleanup.

### 3. Coachmark color — `FirstTouchHint.tsx`

`[DEFAULT — confirm]` Light high-contrast pill (consistency with the popup; "stand out" against the dark site):
`bg-white text-gray-900 border border-gray-200 shadow-xl`, teal ✦ accent (`text-[#0b6b5a]`), dismiss-X in gray.
Position unchanged (`fixed inset-x-0 bottom-4`, centered). **Alternatives** (swap one class group):
(a) light pill _(default)_; (b) brand teal pill (`bg-[#0b6b5a] text-white`, white ✦); (c) brighter glass
(`glass-card-modern` + `text-white` + stronger teal border). Confirm preference.

### 4. Show once per user — `FirstTouchHint.tsx`

Already correct: `markSeen()` writes a **1-year** cookie (`SameSite=Lax`), `hasSeen()` gates the mount. Survives
browser restart; one-and-done per device — the right mechanism for anonymous visitors (no account needed).
**Verify-only** via the harness (dismiss → reload → not shown). No rebuild.

### 5. Discovery ticker — new `DiscoveryTicker.tsx`

Ambient, fixed **top-right**, auto-rotating one-line tips with a soft cross-fade.

- `[DEFAULT — confirm]` Always mounted (behind the flag), low-opacity, small, `hidden sm:block` (off on phones to
  avoid covering content — mobile discovery is the coachmark + chips). Pause rotation on hover. If
  `prefers-reduced-motion`, show a single static tip (no auto-advance).
- Tips: static array v1, e.g. "Double-tap any figure to ask about it" · "Compare any two SWFL ZIPs" ·
  "Ask 'what's driving this?'" · "Open **Ask AI** (bottom-right) to chat about this report" · "Every answer cites
  its source or declines". (Per-report tips are a later enhancement.)
- `pointer-events` limited so it never blocks the report. Mounted as a sibling in `HighlighterLayer`.

### 6. "Ask AI" dock — new `AskAi.tsx` wrapper + `AskAiFab.tsx` + `AskAiDock.tsx`, shared `use-converse.ts`

A sticky FAB (**bottom-right**) opens a report-scoped AI chat **anchored above the FAB**.

- **Shared engine (decision 9):** extract `lib/highlighter/use-converse.ts` returning
  `{ ask, answer, reach, error, streaming, reset }`. `HighlightPopup` is refactored to consume it (behavior
  identical; locked by its existing harness checks + a new unit test). The dock consumes the same hook → the same
  live `/api/converse` (haiku, grounded, **metered**, cite-or-decline). Report-level chat passes
  `{ report_id: slug, fact: conclusion ?? "this report", question }`.
- **Seed prompts:** report-level quick-picks from
  `suggestionsForMetric({metric: conclusion, value: conclusion}, slug)` plus a couple of generic ones ("What's the
  bottom line?", "What's driving this?").
- **Drag/resize (desktop, hand-rolled — no dep):** drag via pointer events on the header bar; resize via a
  top-left handle (panel is bottom-right-anchored). Default **380×520**, min **300×380**, max
  `min(92vw,480) × min(80vh,640)`. Viewport-clamped (same clamp idea as `lib/highlighter/position.ts`). Geometry
  persisted to `localStorage` (`swfl_ai_dock_geom`).
- **Mobile (`<sm`):** full-screen bottom **sheet** (slide-up), drag/resize disabled — a tiny draggable window is
  bad on a phone. FAB stays bottom-right.
- **Coexistence (decision 8):** dock (report-scoped) and selection popup (fact-scoped) are independent surfaces in
  different corners; both may be open. Both increment `usage_events` per answer (consistent with the meter spec).
- **Files:** a small `AskAi.tsx` wrapper (owns open state + persisted geometry) renders `AskAiFab.tsx` +
  `AskAiDock.tsx`. Mounted as `<AskAi>` in `HighlighterLayer` behind the flag (FAB always rendered; dock toggled by
  the FAB).

### HighlighterLayer restructure — `HighlighterLayer.tsx`

Today it early-returns `<FirstTouchHint/>` when there's no fact. New shape renders the always-on surfaces
unconditionally and the popup conditionally:

```tsx
return (
  <>
    {fact && <HighlightPopup … onClose={close} />}
    <FirstTouchHint />
    <DiscoveryTicker />
    <AskAi reportId={reportId} conclusion={conclusion} freshnessToken={freshnessToken} />
  </>
);
```

No new props from `app/r/[slug]/page.tsx` (keeps this work off the file the chart session is editing).

## Testing

- **Unit (`bun test lib/highlighter`):** new `use-converse.test.ts` — mock `fetch` with a `ReadableStream` of SSE
  frames; assert `answer` accumulates, `reach` lands on done, `error` surfaces on an error frame, `streaming`
  toggles. Keep the existing 34 green. (Selection/DOM behavior stays harness-verified — `useHighlight` has no unit
  test today by design.)
- **Lint + types (the PR #68 breaker):** `bun run lint` **and** `npx tsc --noEmit` before pushing — green
  `bun test` did NOT catch the `no-explicit-any` CI error last time. Scope eslint past the local-only
  `awesome-claude-code-toolkit/` dir.
- **Browser harness** (`C:\Users\ethan\hl-verify\driver.mjs`, outside the repo): extend it to cover the
  composer-open view, the recolored coachmark, the ticker (two rotation states), and the dock (open, drag, resize,
  clamp, a live grounded answer), desktop **and** a touch viewport (double-tap → popup). Run against
  `HIGHLIGHTER_UI=1 bun run dev`. Screenshots + JSON verdict to `hl-verify/shots/`.

## Verification checklist (acceptance)

- [ ] Popup opens straight to chips + open textarea; chip click and typed question both stream a grounded answer.
- [ ] Coachmark reads the new copy, in the chosen color, bottom-center; dismiss persists across reload; touch
      double-tap opens the popup.
- [ ] Ticker rotates softly top-right on desktop, hidden on mobile, pauses on hover, static under reduced-motion.
- [ ] FAB bottom-right; dock opens above it, scoped to the report, streams a grounded answer; draggable + resizable + viewport-clamped on desktop; full-screen sheet on mobile; geometry persists.
- [ ] `usage_events` increments for dock answers (meter unchanged).
- [ ] `bun test` green; `bun run lint` + `npx tsc --noEmit` clean on changed files.

## Held for the operator (explicit)

- **#3 coachmark color** — subjective; default shipped, confirm or pick (a)/(b)/(c).
- **#6 dock layout** — confirm: mobile sheet vs floating, geometry persistence, default size, dock-vs-popup
  relationship (decisions 7 & 8).
- **Flipping `HIGHLIGHTER_UI=1` in prod** and merging the PR — operator only.

## Out of scope

- "Chart this" wiring (Phase 2; the chart session is building the chart layer separately).
- Enforcement / paywall (Phase 3; meter stays counting-only).
- Per-report ticker tips, signed-in cross-device coachmark persistence, persisting dock conversations to an account.
