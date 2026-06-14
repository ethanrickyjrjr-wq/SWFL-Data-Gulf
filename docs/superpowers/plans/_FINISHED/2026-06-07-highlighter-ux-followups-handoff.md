# Highlighter UX follow-ups — handoff for a fresh Claude

**Date:** 2026-06-07 · **Author:** prior Opus session (popup verify + fixes). **For:** a fresh Claude to build.
**Status of the engine + popup:** server engine live-verified (PR #68); popup browser-verified + 4 fixes landed
today (below). Popup mounts behind `HIGHLIGHTER_UI` (default OFF) in `app/r/[slug]/page.tsx`.

This brief lists **new UX work the operator requested verbatim**, with interpretation, a recommended approach,
the files to touch, and the open decisions to confirm **before** building. Two of these (the discovery ticker and
the draggable AI dock) are real features — **run `superpowers:brainstorming` on them with the operator before
coding** (the operator was mid-brainstorm when they handed off; don't skip the design step).

---

## Already DONE + verified today (do NOT redo)

Browser-verified end-to-end with a local Playwright harness (desktop 1280×800 + mobile 320×700, live dev server
`PORT=3210 HIGHLIGHTER_UI=1 bun run dev`). 16/16 checks green; screenshots in `C:\Users\ethan\hl-verify\shots\`.
`bun test lib/highlighter` 34/34; app `tsc` + `eslint` clean on changed files.

| Change                                                     | File                                                     | Note                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Popup no longer overflows viewport on a long selection     | `components/highlighter/HighlightPopup.tsx`              | root `max-h-[85vh] overflow-y-auto`; fact echo `line-clamp-3`                                            |
| Popup no longer **vanishes mid-compose**                   | `lib/highlighter/use-highlight.ts`                       | `snapshot()` clears `fact` only on a collapse in page content, never when focus is in the popup/composer |
| **Number-snap** — partial selection grabs the whole figure | `lib/highlighter/use-highlight.ts → expandRangeToNumber` | "91" in "91.5%" → `91.5%`; "104" in "104.98" → `104.98`; handles `$ , . % +- / ` + units `k/m/b/bps/yr`  |
| **Light, high-contrast popup** (white card, dark text)     | `components/highlighter/HighlightPopup.tsx`              | inverted from the dark site so it reads clearly                                                          |

> **The number-snap already satisfies the operator's "pick up the entire figure, not just 91 in 91.5%" point.**
> Requirement #2 below is therefore just the coachmark _wording_ — the behavior is in place and verified.

---

## The build list (new requests — interpretation + recommendation)

### 1. Composer open by default — drop the "Ask your own question" button

**Operator:** _"don't have an ask your own question button. just have the section already open!"_

- Today `HighlightPopup` opens in a `"suggestions"` stage; a tiny "Ask your own question →" link switches to the
  `"ask"` stage (the textarea). The operator wants the **composer textarea visible immediately** — no extra click.
- **Recommended:** keep the precomputed suggestions as quick-pick chips **and** show the textarea open right
  below them, in one combined first view. Remove the "Ask your own question →" indirection. Clicking a chip still
  fires `ask(chip)`; typing + submit still fires `ask(question)`. Collapse `Stage` from `suggestions|ask|answer`
  to effectively `compose|answer`.
- **Files:** `components/highlighter/HighlightPopup.tsx` (stage machine + JSX). Pure client; reuse the existing
  `ask()`/SSE logic untouched. The popup's light theme + positioning + max-height are already verified — just
  reflow the first view.

### 2. Coachmark wording → "Double tap … or highlight"

**Operator:** _"should say double tap any figure instead of tap any figure (which ai would pick up the entire
figure, not just 91 in 91.5% or 104 in 104.98) or highlight."_

- Change the bottom-box text from `"Tap any figure or place to ask about it or chart it."` to something like
  **"Double-tap any figure — or highlight it — to ask or chart it."**
- **File:** `components/highlighter/FirstTouchHint.tsx`.
- ⚠️ **Mobile caveat to handle:** double-**tap** is a touch gesture. The selection hook
  (`use-highlight.ts`) currently listens for `mouseup`/`keyup` only. Desktop double-**click** works (it fires
  `mouseup` → snap → whole figure, verified). On touch devices a double-tap word-select may NOT fire `mouseup`
  reliably — add a `selectionchange` (debounced) and/or `touchend` listener so mobile selection opens the popup.
  Verify on a touch viewport. (The original mobile path was the `FactChip`, which is currently mounted nowhere —
  see open check `highlighter_factchip_metrics_wiring`.)

### 3. Recolor the coachmark box (keep it bottom-center)

**Operator:** _"Change color of that box. leave in middle bottom for people to see."_

- Today the box is `glass-card-modern` (dark glass) + teal accent, bottom-center. Keep the position; change the
  color so it stands out. **Color unspecified — confirm with the operator** (see Open decisions). My default
  recommendation: a light/white pill matching the now-light popup, or a brand teal-tinted pill — pick one with the
  operator. **File:** `components/highlighter/FirstTouchHint.tsx`.

### 4. Coachmark: show once per user, then never (anonymous-safe, non-annoying)

**Operator:** _"Once closed, it needs to not come back, but one more time for each user. not sure how we make that
happen if someone doesn't have an account. we don't want to be annoying."_

- **This already mostly works:** `FirstTouchHint` sets a flag on dismiss (`markSeen()`) and checks it on mount
  (`hasSeen()`), so once closed it doesn't return — **per browser**, which is the correct mechanism for anonymous
  visitors (a cookie / `localStorage` key is the only handle without an account; there is no annoyance because it's
  one-and-done per device). **Confirm the storage is durable** (`localStorage`, not a session cookie) so it
  survives a browser restart. If signed-in persistence-across-devices is wanted later, key it to the user id then —
  but for now device-local is right and not annoying. **File:** `components/highlighter/FirstTouchHint.tsx`.
- Net: this is likely a _verify + maybe switch cookie→localStorage_ task, not a rebuild.

### 5. NEW — soft top-right discovery ticker

**Operator:** _"maybe we have little details about what you can do come up softly in the top right hand corner where
it won't bother anyone. it scrolls through ideas and things you can do."_

- A new ambient, non-intrusive component fixed **top-right** that **auto-rotates** short tips ("Double-tap any
  figure to ask about it", "Compare any two SWFL ZIPs", "Ask 'what's driving this?'", "Chart this report", …).
  Soft fade between items; no dismissal needed (it's ambient, low-opacity, out of the way). Pauses on hover;
  respects `prefers-reduced-motion`.
- **Recommended:** new `components/highlighter/DiscoveryTicker.tsx` (`"use client"`), mounted as a sibling in
  `HighlighterLayer` (behind the same `HIGHLIGHTER_UI` flag). Tips can be a static array for v1 (or derived per
  report later). Keep it tiny and `pointer-events` light so it never blocks content.
- **Open decision:** is this ALWAYS visible, or only after the one-time coachmark is dismissed? (My rec: always,
  but very subtle — it's the ongoing discovery surface that replaces nagging the coachmark.)

### 6. NEW — sticky "Call AI" FAB → draggable, resizable AI chat dock (bottom-right)

**Operator:** _"put a sticky, call for AI button in the bottom right hand corner that brings up AI chat with
prompts about current /r/ page. pop it right above button and make it draggable, resizeable and everything good."_

- A floating action button fixed **bottom-right**. Click → an **AI chat panel** opens **anchored just above the
  FAB**, scoped to the **current report** (`report_id = slug`), pre-seeded with suggested prompts about that page.
  The panel is **draggable** and **resizable** (window-like).
- **Reuse, don't rebuild the engine:** it talks to the **already-live `/api/converse`** route (same `ask()` /
  `parseSSEFrames` SSE flow the popup uses — extract that into a shared hook, e.g. `lib/highlighter/use-converse.ts`,
  so popup + dock share one implementation). Seed prompts from `suggestionsForMetric` / report metadata. R0/R1
  reach works for free (the dossier carries every ZIP + cross-report fetch).
- **This is the biggest piece — brainstorm it first.** Real design decisions: drag/resize library vs. hand-rolled
  (no new dep is cheapest — pointer events + CSS `resize`/handles; **note the lockfile pre-push gate if you add a
  dep**), default size + min/max, viewport clamping (reuse the math idea in `lib/highlighter/position.ts`), mobile
  behavior (full-screen sheet vs. floating?), persistence of size/position (`localStorage`), and how it coexists
  with the selection popup (two AI surfaces — keep them from fighting; maybe the FAB dock is the "general" chat and
  the popup is the "this specific figure" chat).
- **Recommended files:** `components/highlighter/AskAiDock.tsx` + `AskAiFab.tsx` (`"use client"`), mounted in
  `HighlighterLayer` behind the flag; shared `use-converse` hook.

---

## Reusable seams (so the fresh Claude doesn't re-derive)

| Need                                                | Use                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| The AI engine (grounded, cite-or-decline, R0/R1/R4) | `POST /api/converse` `{report_id, fact, question}` → SSE; **live + verified**              |
| SSE parsing                                         | `lib/highlighter/sse.ts → parseSSEFrames`                                                  |
| The popup's fetch+stream loop                       | `HighlightPopup.ask()` — **extract to a shared `use-converse` hook** for the dock          |
| Seed prompts                                        | `lib/highlighter/suggestions.ts → suggestionsForMetric(m, slug)`                           |
| Selection capture + number-snap                     | `lib/highlighter/use-highlight.ts` (`useHighlight`, `expandRangeToNumber`)                 |
| Coachmark + seen-flag                               | `components/highlighter/FirstTouchHint.tsx`                                                |
| Viewport-clamp placement math                       | `lib/highlighter/position.ts → popupPosition` (pattern to reuse for the dock)              |
| Mount point (flag-gated)                            | `app/r/[slug]/page.tsx` → `<HighlighterLayer reportId={slug} conclusion freshnessToken />` |
| The Claude-handoff escape valve (R4)                | `lib/highlighter/handoff.ts → buildClaudeHandoff`                                          |

## Guardrails (CLAUDE.md)

- **Lint + types gate (the PR #68 breaker):** run `bun run lint` (eslint) **and** `npx tsc --noEmit` locally before
  pushing — green `bun test` + tsc did NOT catch the eslint `no-explicit-any` error that turned CI red. (`eslint`
  noise from the local-only `awesome-claude-code-toolkit/` dir is absent in CI — `--ignore-pattern` it.)
- **No new dependency without the lockfile in the same push** (`bun install` + `git add bun.lock`). Prefer
  hand-rolled drag/resize over a library to avoid this.
- **Keep everything behind `HIGHLIGHTER_UI`** until browser-verified, so nothing unverified faces prod.
- **Keep the light/high-contrast theme consistent** across the popup, coachmark, ticker, and dock.
- If anything touches the dossier/speaker projection (it shouldn't for these), honor the **atomic type-lift +
  `display-leak.test.mts`** rule (Brain Factory rule 3).

## Verify like this (reusable harness)

`C:\Users\ethan\hl-verify\driver.mjs` (Playwright, **outside the repo so the lockfile stays clean**) drives
`/r/<slug>` against `PORT=3210 HIGHLIGHTER_UI=1 bun run dev` and writes screenshots + a JSON verdict to
`hl-verify/shots/`. Extend it for the composer-open view, the ticker, and the dock (drag/resize/clamp + a live
answer). Cloud browser tools (Spider) can't reach localhost — use this local harness or a Vercel **preview** with
the flag on for a public URL. Then flip `HIGHLIGHTER_UI=1` in prod + close `highlighter_ui_live_verify`.

## Open decisions to confirm with the operator FIRST

1. **Coachmark color** (#3) — exact color/treatment (light pill like the popup? brand teal? glass but lighter?).
2. **Ticker visibility** (#5) — always-on subtle, or only after the coachmark is dismissed? Per-report tips or a
   static list for v1?
3. **AI dock** (#6) — default size + min/max; mobile = floating vs. full-screen sheet; persist size/position?;
   relationship to the selection popup (one shared surface, or two distinct ones).
4. **Composer-open view** (#1) — keep suggestion chips above the open textarea (rec), or open straight to a bare
   textarea?

## Pointers

- Charts/graphs (Layer 3) handoff: `docs/superpowers/plans/2026-06-07-charts-graphs-implementation-handoff.md`
- Master picture: `docs/superpowers/specs/2026-06-07-build-anything-with-real-data-MASTER.md`
- Highlighter spec: `docs/superpowers/specs/2026-06-07-highlighter-in-page-ask-chart-design.md`
- Open checks: `highlighter_ui_live_verify` (browser half done locally; prod flag-flip pending),
  `highlighter_factchip_metrics_wiring`, `highlighter_suggestions_dossier_wiring`.
