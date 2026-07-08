# Research-backed fence/ratio system for grid block proportions

**Date:** 2026-07-08

## Problem

The AI should still plan the email's structure — that part was never in
question. What's broken is that it plans with too much freedom: `span` is any
integer 1-12, `band`/accent usage is unbounded, row order is advisory-prose
only (`author-recipes.ts`), and photo blocks carry no aspect-ratio lock at all.
That much freedom is exactly the failure mode the research documents: AI
design output reliably reverts to a small set of generic defaults unless it's
mechanically prevented from doing so.

Confirmed in code (RULE 0.5) before designing against it:

- `grid-schema.ts`: `GRID_COLS = 12`, `WIDTH_PRESETS` (Full=12/⅔=8/½=6/⅓=4) —
  the width system is real, load-bearing infrastructure (react-grid-layout
  parity, `colSpanToPx` feeds the actual compiled email's column pixel widths
  in `compile-grid.ts`). It stays. The fence is which values are LEGAL, not a
  new grid.
- **`BlockLayout.h` (row height) has ZERO effect on the sent email.**
  `compile-grid.ts` only ever reads `layout.w`/`x` (`colSpanToPx`) to build the
  Cerberus ghost-table columns; height is 100% intrinsic to content
  (`ImageBlock.tsx`'s `<Img>` sets `width:"100%", maxWidth:"600px"` with no
  height or `aspectRatio` at all). So a "photo ratio fence" is NOT a grid `h`
  problem — it's an image-rendering problem: nothing today stops a
  wrongly-cropped source photo from displaying at whatever raw ratio it has.
- `doc/schema.ts` `GlobalStyleSchema`: exactly two font slots
  (`fontFamily`/`displayFontFamily`), 6-value enum — the "cap at 2-3 fonts"
  research finding is already structurally true here. The gap is that any of
  the 6 can pair with any other; nothing enforces a high-contrast pairing.
  `resolveBand`/`PAD_MAP` (`author-doc.ts`) resolve band→color but never cap
  HOW MANY blocks in one email may carry `band:"accent"`.
  `author-recipes.ts` recipes describe row order in PROSE ("open with...",
  "close with...") — advisory only, never schema-enforced.

## Research backing (crawl4ai + WebSearch + SteadyAPI, 07/08/2026 — see
`design-research-log.md` scratchpad for the full pull)

- Golden ratio (1.618) / Fibonacci proportions (3:5, 5:8, 13:21) are the
  documented construction method behind professional logo/layout grids
  (kreafolk.com, akrivi.studio).
- Font pairing: contrast/complementarity/coherence; a serif-display +
  geometric-sans-body pairing creates 40-60% more visual distinction than
  same-classification pairs (typographysmith.com).
- Color: a 2026 MIT Media Lab/Color Association study (3,100 participants)
  found 88% of first brand impressions in 90ms are driven by color alone; a
  2026 Journal of Consumer Psychology study (4,800 participants) found color
  recall held at 83% after 30 days vs. 29% for brand names.
- Property photos: 3:2 or 4:3 landscape is the MLS standard (homejab.com,
  styldod.com). Agent headshots: 4:5, ≥800×800px (headshotphoto.io).
- AI design output is DOCUMENTED to default to genericness absent hard
  constraints: "Usable but Conventional" (arXiv 2605.15124, May 2026) scored
  10 AI-generated UI prototypes negative on "Conventional/Inventive" and
  "Usual/Leading-edge" on the validated UEQ-S scale, nearly across the board.
  UI-Bench (arXiv 2508.20410) exists because no one had rigorously benchmarked
  this. Practitioners independently converged on the same complaint with
  specifics: "Every website built with AI looks the same: purple gradient,
  Inter font, three cards in a row" (r/ChatGPTPromptGenius) — someone built a
  Claude Skill (`unslop-ui`) specifically to strip these defaults back out.
- Readers scan; inverted-pyramid/conclusion-first structure is already this
  codebase's own cited base (nngroup.com, reused across every recipe in
  `author-recipes.ts`) — currently advisory prose only.

## Goal

Turn each of these from "the model is told to do this" into "the model
structurally cannot do otherwise" — without breaking the working 12-column
grid, `compile-grid.ts`, or any existing seed template's ability to keep
rendering. Fence the PLAN phase (the design already agreed: model plans
structure, `docs/superpowers/specs/2026-07-08-email-grid-plan-fill-design.md`
— superseded as a spec, but the plan/fill SHAPE survives; only what the model
is allowed to choose inside it changes).

## What we're building

### Fence 1 — Blessed span pairs (real, affects the compiled email)

Replace `PlanBlockSchema.span: z.number().int().min(1).max(12)` with an enum
of blessed values only. Single-block rows: `12` (full-bleed — the
"whole-story-before-one-cell" pattern already used for photos/heroes/charts).
Two-block rows: exactly one of `[6, 6]` (parity — genuine side-by-side
contrast, e.g. the sphere-weekly two-hero pattern), `[8, 4]` (2:1 — dominant
lead + supporting stat), or `[7, 5]` (1.4 — the closest 12-safe integer
approximation to the golden ratio 1.618; used for an asymmetric-but-not-2:1
emphasis pair). No other pair is legal. Three-block rows stay `[4, 4, 4]`
only (the existing `multi-column` 3-card pattern). This is an honest
compromise, not fake precision: `GRID_COLS=12` is fixed, tested, load-bearing
infrastructure — the fence is choosing which of the finitely many integer
splits of 12 the research-backed ratios round to, not literally reproducing
1.618 in floating point.

### Fence 2 — Row-order zones (real, schema-enforced instead of advisory prose)

Three zones, validated at merge time (not just described in a recipe):
**OPEN** (row 0 only, after an optional `header`) — must be `hero`,
`signal`, or `agent-hero`; carries the email's one headline
number/moment. **BODY** (every row between OPEN and CLOSE) — any of
`stats`/`text`/`multi-column`/`list`/`image`/`listing`/`signal`. **CLOSE**
(the last one or two rows before `footer`) — must be `button`, optionally
preceded by `agent-card`. `footer` is always the absolute last row, `static`
(already true — `assembleAuthoredDoc` guarantees this). A PLAN that violates
zone order is rejected the same way a PLAN that fails `PlanDocSchema` is
rejected today (falls back to the existing single-shot path per the plan+fill
spec's fallback ladder) — never silently repaired into something unintended.

### Fence 3 — Photo aspect-ratio lock (real code change, affects the sent email)

Add an explicit `aspectRatio` CSS lock + `objectFit:"cover"` to
`ImageBlock.tsx`'s `<Img>` when `props.kind === "photo"`: `"3 / 2"` (the MLS
landscape standard). Any source photo — regardless of its raw dimensions —
displays center-cropped to 3:2, never stretched, never at some arbitrary
ratio. This is the fix for the gap found above: today NOTHING enforces the
researched photo ratio in the actual output, only in whoever manually cropped
the source file. A future dedicated agent-headshot image role gets the same
treatment at `"4 / 5"`.

### Fence 4 — Typography pairing (mostly already true — tighten the gap)

`GlobalStyleSchema` already caps at 2 font slots. Add a `BLESSED_PAIRINGS`
lookup (`fontFamily` → the `displayFontFamily` values allowed with it) so a
serif display always pairs with a sans body and vice versa — never
serif+serif. This lives in brand validation (`apply-brand.ts` / the brand
form), not in anything the AI touches — brand is never authored, per the
existing moat rule.

### Fence 5 — Accent-color budget (real, new cap)

Cap `band:"accent"` to at most 2 rows per email, enforced the same place
`PlanDocSchema` validates today. Matches the "one aha moment, not several
competing ones" finding already cited in `author-recipes.ts`'s chart-story
and infographic recipes — now made structural for every recipe, not just
those two.

### Flip-to-correct rule (real, deterministic, no AI involved)

When a user reorders a blessed two-block row in the free canvas editor (e.g.
swaps photo-left/text-right to text-left/photo-right), a pure function
flips any side-dependent prop so the row still reads correctly: a `text`
block's `align` flips left↔right, an `image` block's `overlayAlign` flips.
Deterministic, testable, no model call.

### Explicitly out of scope

- Ripping out `GRID_COLS`/12-column react-grid-layout parity — that
  infrastructure works and is tested; the fence narrows what's legal within
  it, it doesn't replace it.
- Changing `BlockLayout.h` semantics — confirmed above it has no render
  effect; not worth touching for this problem.
- The plan+fill CALL MECHANICS (PLAN call → per-row FILL calls → merge,
  fallback ladder, caching) — that shape from the superseded spec is correct
  and carries over unchanged. Only the PLAN schema's legal values change.
