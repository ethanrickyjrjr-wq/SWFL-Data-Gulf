# Week in Review — Implementation Plan

> **Recommended model:** ⚡ Sonnet — 6 tasks



**Date:** 2026-08-06
**Design:** `docs/superpowers/specs/2026-08-06-week-in-review-design.md` — read it first; every
measurement and every sourced structural choice lives there. Do not re-derive.
**Check:** `week_in_review_live_verify`
**Status:** Task 1 (the loader) DONE — `lib/week-in-review/load.ts`, `bun test lib/week-in-review/`
17/17 green, commit `fb9395b5` (2026-08-06). Tasks 2-5 not started. Handoff notes below the task
list.

---

## Ground rules for whoever picks this up

1. **No new data.** The feed is `data_lake.listing_transitions`, already accruing. If you find
   yourself writing an ingest pipeline, you have misread the design.
2. **Do not touch `market_event_snapshots`.** Design §5 records why (writer welded to the email send,
   cron commented out, 0 rows structurally). Reading it is not "being thorough," it is inheriting a
   send-lock for zero benefit.
3. **TDD is a gate, not advice** (RULE 3.5). Each task below names its failing test FIRST. Write it,
   watch it fail, then implement.
4. **Week only.** Quarter/half/year are the same query with a different parameter. Building them now
   is scope the operator explicitly deferred.
5. Every figure is a `MarketFact` (`lib/email/zip-events/types.ts:21`). Do not mint a second
   number-carrying type.

---

## Task 0 — The research pass (do this BEFORE code, every session)

Design §7 is an operator decree, not a nicety: *"I WANT RESEARCH EVERY TIME WE WORK ON THIS."*

Run a crawl4ai pass on current engagement craft — subject lines earning clicks now, format, return
rate. File findings into `_RESEARCH/email-and-social/` **and write the `INDEX.md` line in the same
pass** (unindexed research does not exist — RULE 0.4).

Two known gaps worth closing first, both already scoped in the 08/03 research: the subject-line
convention (Luxury Presence's 14-type taxonomy is captured; `lib/email/` documents no convention) and
the merge-tag token syntax (no industry standard, 4 conventions observed — pick one, document once).

**Do not re-fetch Campaign Monitor's benchmark page** — it returned 2022 figures on 08/06/2026, older
than the GetResponse 2024 numbers we already hold.

---

## Task 1 — The loader

**File:** `lib/week-in-review/load.ts` (new) · **Test:** `lib/week-in-review/load.test.ts`

**Failing tests first, named after the failure mode they target (design §6):**
- `rejects_a_figure_sourced_from_the_vendor_backward_lane` (§6.1)
- `refuses_a_window_beginning_before_feed_coverage_starts` (§6.2)
- `distinguishes_an_empty_window_from_a_query_error` (§6.3)
- `labels_a_grain_with_incomplete_zip_coverage` (§6.6)

**Then implement.** One query against `listing_transitions`, filtered on `"at"` inside the window,
joined to `listing_state` for geo. Returns the seven transition kinds from design §1 as counts plus
their supporting facts.

Signature shape:

```
loadWeekInReview(grain: MarketEventGrain, key: string, window: { start: string; end: string })
  => Promise<WeekInReview | null>
```

Empty-tolerant exactly like `getSourcedFigures` (`lib/figures/sourced.ts`): no creds, no rows, or an
error returns a value the caller can render, never a throw, never an invented number. **But a genuine
zero and an error must be distinguishable in the return type** — that is §6.3 and it is the one place
copying `sourced_figures` verbatim is wrong.

Header comment must quote T11 (design §2) so the next reader cannot blend the two price-cut lanes by
accident.

---

## Task 2 — Bucket → section mapping

**File:** `lib/week-in-review/sections.ts` · **Test:** `lib/week-in-review/sections.test.ts`

Pure function, no I/O. Maps the seven transition kinds into the Market Mondays section order captured
in design §3: Feedback → Market Update → Marketing → Recommendation → Conclusion.

Test that the order is stable and that a section with no events renders as an explicit "no recorded
changes in this window" rather than being dropped — a missing section reads as "nothing happened,"
which is §6.3 at the presentation layer.

Language rule from the same source, worth a test: the Market Update section hedges ("suggests"),
never asserts.

---

## Task 3 — The page

**File:** `app/week-in-review/[grain]/[key]/page.tsx`

**Read `.claude/skills/one-room` BEFORE styling anything.** This renders inside the signed-in app
chrome; it reuses existing chrome verbatim and does not invent its own. Do not apply generic taste
skills to it.

Renders sections from Task 2. Per design §4:
- The as-of date once, MM/DD/YYYY, plus the next-update date (NAR anatomy element 5).
- The coverage-start date alongside the window (§6.2).
- Headline number bare and first, above any sentence (NAR anatomy element 1).
- Link out to comparables rather than embedding a chart in the update section (Market Mondays' own
  rule) — charts, where used, go through `buildChartForQuestion` and stay subject to
  `assertHeroChartCoherence`.

Builder's commentary and CTA are **open slots** — empty string, with the instruction in the label, per
the slot rule in `lib/email/CLAUDE.md`.

---

## Task 4 — Prose, and the one trap

The builder-facing prose slot goes through the existing bridge, `bakedAreaRead()`
(`lib/narratives/area-read.ts`) — **the one reader; never write a second one.**

**Check the target recipe's guard shape before wiring anything** (design §6.7). Two known
non-fits: `market-pulse` runs a zero-digit audit (`auditConnective`) and rejects digit-bearing prose
on contact; `sphere-weekly` deleted its digit-token guard and has nothing to validate against. This
surface must pass its own `unanchoredNumbers` check — baked prose ships only if this page sources
every number in it, otherwise the live call runs.

---

## Task 5 — Verify (RULE 0.8: "done" requires pasted evidence)

```
bun test lib/week-in-review/
bunx next build
```

Then drive it live per the `verify` skill — build, serve on a clean port, screenshot the page at a
real grain and key. **A green suite is not evidence for a rendered artifact.** Paste the test line and
the screenshot, not a claim.

Close `week_in_review_live_verify` only after the live drive, not after the tests.

---

## Out of scope, restated so it does not creep back

Quarter/half/year windows · `market_event_snapshots` · any new ingest · the ZHVI chart question
(tracked separately as `zhvi_index_plotted_as_value_market_pulse`).

---

## Order of work

Task 0 (research) → 1 (loader, TDD) → 2 (sections, TDD) → 3 (page) → 4 (prose) → 5 (verify).

Tasks 1 and 2 are independent of 3 and 4 and can land as their own commit with tests green — that is
the natural checkpoint if the session runs short.

---

## Handoff — 2026-08-06 (Sonnet 5), Task 1 → Task 2

**Task 1 is fully done, not just the pure contract.** `lib/week-in-review/load.ts` now exports
`loadWeekInReview(grain, key, window, deps?)` — deps-injected like `CutHistoryDeps` in
`lib/why-not-selling/cut-history.ts`, so its tests never touch Supabase. Read `load.ts` top to
bottom before starting Task 2; the shapes below are load-bearing.

**What Task 2 (`lib/week-in-review/sections.ts`) consumes:**
- `WeekInReviewResult` — `{ ok: true; events: WeekEvent[]; coverage?: {covered,total} } | { ok:
  false; reason: string }`. Section mapping only runs on the `ok: true` branch; the `ok: false`
  branch renders as an error, never as empty sections (this is §6.3 carried through — do not let a
  query error collapse into "no recorded changes").
- `WeekEvent` — `{ kind: TransitionKind; count: number; facts: MarketFact[] }`. `TRANSITION_KINDS`
  and `KIND_LABELS` are already exported from `load.ts`; Task 2 maps kinds into the five Market
  Mondays sections (design §3: Feedback → Market Update → Marketing → Recommendation →
  Conclusion), not the other way around — the loader groups by RAW kind, Task 2 buckets kinds
  INTO sections.
- `coverage` on the ok branch is `{covered, total}` RAW NUMBERS, not a rendered string — Task 2 (or
  Task 3) calls the already-exported `grainCoverageLabel()` to render it. Don't recompute
  covered/total yourselves; the loader already resolved it through `listing_state` per §6.6.
- A `WeekEvent` for a kind with zero occurrences will NOT appear in `events` at all (the loader
  only emits kinds it actually saw) — Task 2's "explicit no-change section" requirement (§6.3 at
  the presentation layer, called out explicitly in the plan's Task 2 description) means: for any
  section whose mapped kinds are ALL absent from `events`, render that section with the "no
  recorded changes in this window" copy, not by omitting the section. Missing-from-the-array must
  become an explicit sentence, not a skipped section.

**Not done, and don't assume otherwise:** the page (Task 3), the `bakedAreaRead()` prose wiring
(Task 4), and the live verify (Task 5) — `week_in_review_live_verify` is still OPEN, closes only on
a live screenshot per RULE 0.8, never on a green suite.

**One thing to check, not re-derive:** Task 0's crawl4ai research pass was already run earlier
TODAY (08/06/2026) per design §7's own dated content — don't re-run it a second time this same
calendar day on the same surface; that's redundant spend against the "research every session" rule,
which means one fresh pass per work session, not per model switch within the same session's day.
