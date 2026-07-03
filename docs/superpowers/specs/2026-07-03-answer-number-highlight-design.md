# Answer number highlighting (teal) + narrative number-format consistency

**Date:** 2026-07-03 · Check: `answer_number_highlight_live_verify`

## Problem

Operator escalation (verbatim frustration, two pasted answer paragraphs as evidence): numbers in
narrative answers are formatted inconsistently — `30,551` (commas) next to `35810` and `548798`
(no commas) in the same product, and the identical percentage renders as `43.2%` in prose but
`43.20%` in the trailing metric citation. Numbers also carry zero visual weight — a wall of gray
text with no way to scan for the figures that matter. Ask: fix formatting everywhere, and make
important numbers visually pop in the platform's teal (`text-gulf-teal`, already used elsewhere
in the UI, e.g. `BriefcaseChat.tsx`'s "File this answer" link).

## Root cause (probed, not guessed)

1. **Formatting bug** — `refinery/packs/*.mts` conclusion/narrative builders each define their own
   ad-hoc local formatter (`fmtK`, `fmtUsd`, `fmt1`) or none at all. `properties-lee-value.mts` /
   `properties-collier-value.mts` interpolate raw integers (`agg.totalParcels`,
   `agg.currentSalesCount`, `agg.homesteadedParcels`) directly into template literals with no
   formatter at all — hence `548798` instead of `548,798`. There is no shared prose-number
   formatter, so 23 pack files independently reinvent (or skip) comma formatting.
2. **Percent-precision mismatch** — `refinery/render/speaker.mts` `formatNumericValue` (the
   locked "chokepoint" that formats `key_metrics` for display) always renders `percent` as 2
   decimals (`43.20%`). Pack authors write prose percentages by hand with 1 decimal (`43.2%`).
   Same underlying number, two conventions, both technically "correct" but visibly sloppy when
   the auto-appended citation tail (`lib/zip-dossier.ts:441`, `` `${conclusion} (${label}: ${value})` ``)
   puts both in the same sentence.
3. **No visual hierarchy** — answer text renders as flat `whitespace-pre-wrap` strings in at least
   8 surfaces (`BriefcaseChat.tsx`, `AskPage.tsx`, `ConversationalChat.tsx`, `AnswerBlock.tsx`,
   `alerts/[id]/page.tsx`, `r/[slug]/page.tsx`, `r/zip-report/[zip]/page.tsx`,
   `r/cre-swfl/[corridor]/page.tsx`, `project/[id]/workspace/ItemDetail.tsx`). No shared
   "render answer text" component exists — each surface prints `{content}` directly.

## What we're building

### Part A — narrative number-format consistency (bug fix, no new behavior)

- New shared module `refinery/packs/lib/number-format.mts` exporting `fmtInt` (thousands-comma
  integer), `fmtUsd`, `fmtPct` (2 decimals, matching the `speaker.mts` chokepoint convention so
  prose and citation tail always agree), `fmtRatio` (1 decimal, e.g. "65.3 per 1,000" — z-scores
  and per-1k rates keep 1 decimal, they are not the percent-mismatch case).
- Sweep every pack's conclusion/narrative/detail-table string builder (list from the completed
  audit) and replace raw interpolations and duplicate local formatters with the shared module.
  Behavior-neutral: output values are identical, only string formatting changes (adds commas,
  aligns percent decimals). No `PackDefinition`/`BrainOutput` type change, no vocab impact.

### Part B — highlight important numbers in teal

- New shared component `components/answer/AnswerText.tsx`: takes the raw answer string, splits
  it on a regex that matches numeric tokens — currency (`$300k`, `$1,234.56`), percentages
  (`43.2%`, `-8.86%`), plain numbers with optional commas/decimals (`30,551`, `65.3`, `192,973`)
  — and wraps each match in `<span className="text-gulf-teal font-medium">`. Per the (timed-out,
  best-judgment-default) scope decision: **all** numeric figures highlight, not a curated subset
  — matches the "everywhere" ask and avoids a second judgment call about what counts as
  "important."
  - Explicitly excludes MM/DD/YYYY date tokens (rule: as-of dates are stated plainly, not
    decorated) and does not need to touch text inside code fences (answers don't contain them per
    the plain-text rule).
  - Renders as inline `<span>`s inside the existing text node — copy/paste still yields plain
    text (spans carry no `::before`/`::after` content), so this doesn't violate the
    no-tables/no-blockquotes-because-copy-paste rule.
- Swap the 8 surfaces' raw `{content}` / `{text}` rendering for `<AnswerText text={content} />`.
  One component, one regex, one place to fix if the rule ever changes — not a per-surface patch.

## Testing

- `refinery/packs/lib/number-format.test.mts` — unit tests for each formatter (comma boundary,
  0 decimals vs 2 decimals, negative numbers).
- `components/answer/AnswerText.test.tsx` — snapshot/regex tests: currency, percent, plain int,
  a date is NOT highlighted, a z-score IS highlighted, mixed prose sentence renders correctly.
- Manual: re-run the two example paragraphs from the operator's escalation through the pack
  (or a fixture) and visually confirm consistent commas + 2-decimal percents + teal numbers in
  the chat panel.

## Non-goals

- Not touching `formatNumericValue`/`toDisplayBrain` in `speaker.mts` — that's the locked
  chokepoint with its own documented invariant history (Naples/Estero bug); prose is being
  brought into alignment with it, not the reverse.
- Not adding a "which numbers are important" ranking/weighting system — flat highlight-all per
  the scope decision above.
