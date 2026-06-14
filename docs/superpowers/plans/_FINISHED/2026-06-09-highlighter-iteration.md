# /r/ Highlighter AI — live-testing iteration (2026-06-09)

Working doc for the in-page Highlighter on `/r/[slug]` reports (drag-select →
popup → ask; `/api/converse` answer-brain grounded only by
`lib/highlighter/grounding.ts`). Captures what was fixed from live testing, the
near-term UI backlog, and **deferred feature designs to decide on later**.

The flag is `HIGHLIGHTER_UI` (global, default OFF; `1` in `.env.local` for local
dev). Fix is one code path → every `/r/` report's popup + the Ask-AI dock.

---

## Fixed (live-tested, in working tree — not yet committed)

- **Invisible header badges** — `renderBlock()` now serializes Direction /
  Strength % / Confidence % in the header's exact display shape.
- **Three-lane preamble** — LANE 1 grounded / LANE 2 be-Claude / LANE 3
  offer-to-find; replaced the "two shapes only, never admit a gap" straitjacket.
  Hard floor (never invent a SWFL number) preserved.
- **Jargon leak** — grounding fed the model raw slugs (`cap_rate_median`,
  detail-cell column ids); now emits human labels only + a CLEAN rule forbidding
  internal ids / "the data is held in…" phrasing. Locked by a jargon-guard test.
- **Voice** — FOCUS (answer the highlighted grain, e.g. Lee/Collier, not the
  SWFL aggregate), NATURAL (don't repeat "27 corridors" every answer), BUILD
  (build on prior session Q&A, don't repeat), NO-ECHO (don't restate the
  highlight), CONCISE (tight answers; don't define obvious words like "rising").
- **Bad chips (structural)** — removed the raw-value "What's driving <text>"
  fallback entirely; no bare number, date, or token can get it. Token → freshness
  chips, date/year → recency chips, place → place chips, bare number → explain/
  compare. Killed "What's driving our freshness token" AND "What's driving
  2026-06-09".
- **Chart / section highlight** — was sending the literal string "this section"
  with no content (AI replied "I don't see a specific highlight"). Now sends the
  REAL selected text, so "plain-English summary of this" summarizes the actual
  chart/section data.
- **Charts punt** — prompt now forbids "pull it into Excel / Sheets / Tableau /
  Python." (Real chart rendering = deferred design below.)
- **Off-screen shield** — popup height is capped to the space below its top
  (`maxHeight = viewportH − top − 12`) so a streamed answer can't run off the
  bottom; the body scrolls inside.
- **Platform framing** — "what is SWFL Data Gulf" no longer answers as
  real-estate-only: it's a SWFL data-analytics engine (real estate, permits,
  economy, risk), grounded in real data, that compounds with use (more use →
  sharper read + better personal sidekick). Brief, not cheesy, not sector-locked.

---

## SHIPPED — Phase 2: real-time follow-ups + selection-type awareness (2026-06-10)

Built via **Option 1 (same-call structured tail)**. Live-runtime verification
(model actually emits the tail, chips render, mobile tap) is the remaining gate —
tracked by the open `highlighter_realtime_prompts` check, not a marker here.

- **Same-call tail.** Converse model ends its answer with
  `⟦FOLLOWUPS⟧ q1 | q2 | q3`. The client splits it off in
  `splitFollowupTail()` (`lib/highlighter/converse.ts`, pure + unit-tested):
  strips the 11-char marker (U+27E6 + `FOLLOWUPS` + U+27E7) **and any
  half-streamed partial of it** so nothing leaks mid-stream, then hands the parts
  to a new `onFollowups` handler → `useConverse().followups`. `HighlightPopup`
  renders `followups` after an answer and **falls back to the static chips** when
  the tail is missing/malformed. Zero extra latency/cost. Chips re-appear on the
  streaming→done transition (previous-value-ref effect — the strict
  `react-hooks` config bans both set-state-in-effect on reactive deps and
  ref-reads during render; the prev-value-ref-in-effect shape is the one allowed).
- **Selection-type awareness.** `deriveSelectionType()`
  (`lib/highlighter/suggestions.ts`) maps a selection to
  section/token/date/place/metric (reusing `isFreshnessToken`/`isLikelyDate`) and
  is passed to `/api/converse`. The FOLLOWUPS directive **and** a type hint in the
  user message are **gated on `selection_type`** — so the report-level Ask-AI
  dock (renders no chips) spends no tokens on a tail that would only be stripped.
  `MAX_TOKENS` 700→760 for the tail.
- **Chip analytics (no PostHog — reused the meter).** `recordAsk`
  (`lib/highlighter/meter.ts`) tags every ask with
  `selection_type`/`is_realtime`/`from_chip`; columns added to
  `public.data_requests` (idempotent ALTER, applied). `is_realtime` = the clicked
  chip was a model follow-up vs a static starter; `from_chip` = chip vs free-text.

Scope held to the shared `/api/converse` + popup. Per-report tuning of the other
`/r/` brains (housing, env, macro, …) stays a separate session.

### Also shipped this pass — mobile "numbers won't pop"

Live bug: header Strength/Confidence popped (plain text → long-press selects) but
table numbers didn't. Cause: `MetricValueCell` only chip-wrapped a value when it
was a **string**, so a number-typed value rendered as a plain, non-tappable span;
the per-ZIP `DataRow` wrapped no `FactChip` at all. Fixed both in
`app/r/_components/metrics-table.tsx` (wrap `string | number`; `DataRow` gets the
same tap target, row label as context).

### Original design notes (kept for reference)

The rejected alternative was a **second cheap call on `done`** (a tiny Haiku call
proposing 3 follow-ups as JSON) — cleaner separation but extra latency/cost.
Option 1 won because it reuses the existing SSE stream and the "Follow up" chip
slot that already renders after an answer.

## Near-term UI backlog (do next, not yet built)

1. **Bad cross-element highlights** (`use-highlight.ts`) — a selection that
   combines two different things (e.g. parts of two cells) should snap to ONE,
   or suppress the popup entirely (no bad-highlight chat). Word/number snapping
   already works; the gap is cross-element combining. Suppressing is acceptable
   ("user can re-highlight more accurately").
2. **Cross-row same-data** (`use-highlight.ts`) — snap to word boundaries, never
   force-grab both full rows. If the user wants both rows, they re-highlight.
3. **Collapse prior answer** (folds into Persistence below) — on a new highlight,
   condense the previous Q&A into a labeled (1–2 word) summary item.

---

## DEFERRED FEATURE DESIGNS — decide when we scope these

### A. Charts — where do they actually render?

We already have: `Dossier.chart` (compute-on-read via `computeMetricChart`),
the `ReportChart` component (auto-renders a brain's headline chart on the `/r/`
page today), and the Tier-A chart spec
(`docs/superpowers/specs/2026-06-07-chart-generation-three-tier-design.md`).
What's NOT built: a chart **inside the highlighter chat**, or as a **deliverable**.

Rendering-target options:

| Target | What it is | Effort | Notes |
| --- | --- | --- | --- |
| **/r/ page (exists)** | Auto chart from `Dossier.chart` | done | Already live; not user-driven. |
| **In-chat inline** | Popup renders a small chart from the comparison data already in the dossier | Medium | Reuse `ChartBlock` + a compact `ReportChart`. The data is already in-context — no new fetch. **Recommended first build.** |
| **Deliverable / file** | Export selected charts to a PDF / one-pager | Larger | End-of-session; natural **paid** feature. |
| **Build-in-chat → end deliverable** | User curates charts during the session; assemble at the end (swap/add/remove) | Largest | Depends on session persistence (B). The "all charts on one page" ask. |

**Recommendation:** in-chat inline chart next (data's already there, reuses
existing chart code), with a "make this a chart" affordance on metric/comparison
answers. Deliverable/PDF is a paid end-of-session feature built on (B). Until
in-chat charts ship, the prompt guard (no Excel punt) holds the line.

**Open question for the operator:** is "in-chat inline chart" the right first
target, or do we jump straight to the end-of-session deliverable?

### B. Session persistence + briefcase

**Problem:** conversation state lives inside `HighlightPopup`, so clicking off
unmounts it and loses everything.

**Design:** lift the thread/highlights into `HighlighterProvider`
(`lib/highlighter/context.tsx`) — it already wraps the whole `/r/` page and
survives popup open/close. Then:

- **Phase 1 (cheap, high value):** move `thread` + active exchange into context
  so it survives close/reopen within the session. Reopen (or highlight again) →
  restore the condensed Q&A + new chips. *This is the "at least save for the
  session" ask.*
- **Phase 2:** a **briefcase icon** next to the sticky Ask-AI button showing a
  count; click → the condensed history of highlights + answers; new highlight
  pops the popup with history attached.
- **Phase 3:** end-of-session **deliverables** — "summarize everything", export
  PDF, charts-on-one-page, swap a chart. (Paid.)
- **Too-much-info handling:** when the thread grows large, the AI checkpoints —
  "saving a summary here, we'll combine it later" — to stay within context.

### C. Paywall tiering (highlighter)

The meter hooks already exist (`lib/highlighter/meter.ts` — `recordUse` /
`recordAsk`). Suggested split:

- **Free:** capped highlighter asks per session; ephemeral (no save), no export.
- **Paid:** more chat space, session + cross-session persistence, saved
  summaries, PDF / chart exports, "all charts on one page", chart swap.

Gate on a per-session ask counter via the existing meter; surface "you've hit the
free limit — saving your summary, upgrade to keep going" rather than a hard stop.

---

## Notes / suggestions for the operator

- Charts-in-chat is the unlock for most of the "cool features" — it makes the
  deliverable (PDF / one-pager) just an assembly step over things already drawn.
- Persistence Phase 1 (lift to context) is low-risk and should come before any
  briefcase/deliverable work — everything else stands on it.
- The free/paid line falls naturally at **persistence + export**: free = answer
  in the moment; paid = keep, combine, and take it with you.
