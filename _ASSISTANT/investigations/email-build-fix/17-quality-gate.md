# Lane 17 — Why didn't any quality/coherence gate catch this?

Investigation notebook. Diagnosis-only (no browser, no DB writes, no git).

## The question
Email Lab showed "3 Issues" + "Heads up — the headline value on the lead block still
needs a figure. I left it blank rather than invent a number." So SOME gate ran and caught a
blank value, yet the build still shipped visibly broken (wrong ZIP mixed in, chart overlapping
text, cut-off sentences) without being blocked. Where is the gate, what does it check, and why
did a build this broken sail through?

## What I traced

### The build path (no gateNarrative here)
- `app/api/email-lab/ai/route.ts` POST dispatches, when a `doc` is present, to either
  `authorDoc` (build:true / mode:"author") or `buildContentDoc` — both in `lib/email/build-doc.ts`.
- `gateNarrative` (`lib/deliverable/build.ts:444`) is the DELIVERABLE-FACTORY narrative gate
  (`buildDeliverableNarrative`). It is NOT on the Email Lab AI-build path. Ruled out as the gate
  the user saw. The Email Lab path has its OWN two much thinner gates.

### Gate A — completeness / no-invention (THE one that fired)
- `unfilledFigureSlots(before, after)` — `lib/email/build-doc.ts:445-466`.
- `unfilledHeadsUp(unfilled)` — `build-doc.ts:421-432` — produces the exact "Heads up — … still
  needs a figure. I left it blank rather than invent a number" string the user saw.
- Return sites: `build-doc.ts:930` (buildContentDoc) and `:1597` (authorDoc), spread into a payload
  that ALWAYS carries `applied: true` (`:921` / `:1585`).
- What it checks: ONLY figure slots that were empty-string (`""` = OPEN SLOT) BEFORE the patch and
  are STILL empty after — hero `value` (`:453`) and `stats[].value` cells (`:456-461`).
- It is DELIBERATELY non-blocking (four-lane rule, comment `:438-440` and `:926-929`): "The build
  is never blocked … only invention is forbidden." A gap is surfaced, never blocked.
- The "3 Issues" count the user saw = length of this `unfilled` array (headline value + N blank
  stat cells). It is a completeness/honesty signal, NOT a quality gate.

### Gate B — chart↔headline coherence (soft, magnitude-only)
- `assertHeroChartCoherence({ hero, chart })` — `lib/deliverable/chart-coherence.ts:66-102`.
- Runtime caller: `buildPromptChart` `build-doc.ts:284-288` — on incoherent, it only
  `console.log`s and DROPS the chart (`return null`). Never blocks the build (comment `:18`).
- SCOPE, stated in its own header `chart-coherence.ts:10-14`: catches ONLY same-unit,
  order-of-magnitude (>3×, FACTOR `:50`) mismatch between headline and chart's displayed range.
  Cross-unit pairs and `percent` are auto-"coherent" (`:75-76`). It explicitly says:
  "It does NOT understand subject … a same-magnitude wrong-subject chart passes." <-- THIS bug.

## Why a build THIS broken was not flagged harder / blocked

The reported defects and the gate that should have caught each:

1. **Wrong deliverable entirely** (generic ZIP market-stats email instead of the named listing):
   NO GATE checks request-intent coherence. Nothing anywhere asks "does the assembled doc answer
   what the user asked for?" Every figure the wrong-subject build DID fill is a real sourced lake
   number, so no-invention passes; the blanks it couldn't fill surface only as advisory "heads up."
   The whole email being about the wrong subject is invisible to both gates.

2. **Wrong ZIP mixed in** (headline ZIP ≠ body stat-block ZIP): NO cross-block consistency gate
   exists. `unfilledFigureSlots` checks emptiness, not agreement between blocks.

3. **Chart rendering garbled behind/through the headline numbers**: this is a render/layout defect
   (compile-grid / renderer), not a data defect. Gate B is the only chart gate and it compares
   MAGNITUDE only — a chart whose numbers cohere but which visually overlaps text passes clean. No
   gate inspects layout collision.

4. **Sentences cut off mid-word** ("…and months of" → nothing): the content-patch model calls
   (`build-doc.ts:581-598` and `:~849`) read `msg.content[0].text` and parse WITHOUT checking
   `msg.stop_reason`. A `max_tokens` truncation is used as-is. Contrast `lib/email/insiders/author.ts:169-170`,
   which DOES `throw` on `stop_reason === "max_tokens"`. The Email Lab path has no such check, so a
   truncated draft ships silently. (Note: full JSON truncation would fail `safeParse` and fall back to
   the prior doc — the mid-sentence artifact points to prose that fit inside valid JSON but read
   truncated; either way no completeness-of-prose gate exists.)

## Root cause (my lane)
The Email Lab AI-build path has exactly TWO gates and BOTH are advisory-only and narrow:
- Gate A (`unfilledFigureSlots`/`unfilledHeadsUp`, build-doc.ts:445/421) — surfaces blank FIGURE
  slots as a non-blocking "heads up" (this is the "3 Issues" the user saw).
- Gate B (`assertHeroChartCoherence`, chart-coherence.ts:66) — soft-drops a chart only on same-unit
  >3× magnitude mismatch, and by its own charter ignores subject.

There is NO gate for (a) request↔deliverable intent coherence, (b) cross-block subject/ZIP
consistency, (c) prose truncation (`stop_reason`), or (d) visual/layout collision. So a build that
was about the entirely wrong subject, mixed ZIPs, truncated its prose, and overlapped its chart
tripped only the one advisory signal it happened to hit (a blank headline) and still returned
`applied: true`. The gates verify "no invented number + chart magnitude not absurd," never "is this
the right, coherent, complete email." Blocking was never possible — nothing on this path can return
anything but `applied: true` (+ optional advisory message).

## Concrete fix
1. Add a `stop_reason === "max_tokens"` guard to the content-patch/author model calls in
   build-doc.ts (mirror insiders/author.ts:169-170): on truncation, either retry once or drop the
   truncated field and add it to the `unfilled` heads-up list rather than shipping a half-sentence.
2. Add a request↔deliverable intent coherence check for listing-intent prompts: when the prompt
   names a specific address (`isListingIntent` already exists, used at build-doc.ts:909) and the
   subject listing resolved from the lake, REQUIRE the built doc to carry that listing's hero photo
   + price/beds/sqft; if the build instead produced only generic ZIP-market blocks, surface it as a
   hard "this isn't the listing you asked for — rebuild" signal, not silent `applied: true`.
   (This is the real miss; the wrong-subject content is exactly what chart-coherence.ts:12 says it
   does NOT catch.)
3. Optional: a cross-block ZIP/subject consistency assertion (all scope-bearing blocks agree on one
   ZIP) to catch symptom #2.

Layout collision (symptom #3) is a compile-grid/renderer concern — out of this lane; hand to the
render lane.
