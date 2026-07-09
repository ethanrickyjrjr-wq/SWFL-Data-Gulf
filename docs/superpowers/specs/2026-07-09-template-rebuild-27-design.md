# Design — rebuild all 27 SEED_DOCS templates (content + visual, one pass)

**Date:** 07/09/2026 · **Scope:** `lib/email/doc/default-docs.ts` (`SEED_DOCS`), all 27 entries.
**Supersedes nothing** — this is the design for Phase 2 of
`docs/superpowers/handoffs/2026-07-09-email-fences-and-template-rebuild-handoff.md`; Phase 1
(canvas fence-violation warning UI) stays queued separately per operator decision (templates
don't pass through the canvas, so nothing technically blocks starting here).

## Goal

Every one of the 27 starter templates should read as visually distinct from its siblings and
carry zero baked fake data, so a user (or the AI builder) opens one and it already looks like a
finished, professional email — not a wireframe with one company's name typo'd onto another's
photo.

## Ground truth confirmed in code (07/09/2026)

- All 27 `SEED_DOCS` entries exist, matching the handoff's list exactly.
- Phase 1 (`checkFenceViolations`) is NOT built — zero grep matches outside docs.
- `magazine-issue`'s reported bug is real: `ImageBlock.tsx` renders `backgroundColor: "#111827"`
  when an overlay block has no `url`, and the template's `signal` block sets `bgColor:
  "#14181C"` directly below it — two near-identical near-black rectangles.
- `year-in-review` (one of the 16 "fully drifted" Track A templates) is also a Track B offender
  nobody had flagged: all 8 of its rows are span `{12}` — zero row-span variety, no photo, no
  accent band, single font (no display pairing).
- The full variety toolkit already exists and ships today: `BLESSED_ROW_SPANS` (`{12}` / `{6,6}`
  / `{8,4}` / `{7,5}` / `{4,4,4}`), `PHOTO_RATIOS` (`3:2`/`4:3`/`4:5`/`1:1`), `BLESSED_PAIRINGS`
  (3 font families total — `MODERN_SANS`, `BOOK_SERIF`, `PLAYFAIR_SERIF`; only rule is never
  serif+serif), `ACCENT_BUDGET` (≤2 accent bands/email). No new sizes, fonts, or schema fields
  get invented — the fence system is already research-backed (`2026-07-08-email-grid-fence-
  system-design.md`); this pass works inside it, not around it.

## Research pass (RULE 0.4 — crawl4ai/WebSearch, 07/09/2026)

Operator called out we hadn't researched what different **email types** structurally contain
(as opposed to how they look) — ran a research pass on the two categories with the least obvious
convention:

- **Market-report/newsletter structure** — Housingwire's real-estate-newsletter playbook and
  related sources: newsletters run 3–5 sections, ~80% value content / 20% promotional, one
  primary CTA. Typical shape: header → hero (one story or featured listing) → 2–3 body blocks
  (market update, featured property, a tip) → CTA. Single-column, skim-friendly, plenty of white
  space. (`housingwire.com/articles/real-estate-newsletters`)
- **Year-in-Review structure** — annual-review templates cascade stats **national → local →
  neighborhood**, then a market/neighborhood analysis, often paired with a property-valuation
  (CMA-style) touch. (`highnote.io/templates/real-estate/annual-real-estate-review`,
  corroborating search results)

Net effect on this design: `year-in-review`'s existing block composition (stats → chart →
3-column highlights → narrative → CTA) already matches the researched shape reasonably well —
the fix here is killing the baked figures (Track A) and giving it real row-span/photo/accent
variety (Track B), not restructuring it. The `market-report` family (see taxonomy below) should
keep to 3–5 real content blocks + one CTA, not sprawl.

The other four categories (listing showcase, agent/personal, skeleton/utility, magazine/designed)
have obvious, well-established real-estate email conventions — no research needed per operator
steer ("just try crawl4ai on a couple ... we didn't really research different types").

## Category taxonomy

Used for (a) keeping structural decisions consistent within a type and (b) the variety ledger
below. Operator flagged this taxonomy should also drive a future website-side grouping — **that's
a separate follow-up, not built in this pass** (tracked as its own check once this ships).

1. **Analytical/report** — `market-spotlight`, `weekly-pulse`, `luxury-market-report`,
   `neighborhood-report`, `investment-brief`, `rate-watch`, `monthly-digest`, `trend-snapshot`,
   `market-letter`
2. **Listing/property showcase** — `just-sold`, `listing-feature`, `new-listing`,
   `skeleton-listing-showcase`, `open-house`, `price-reduced`, `just-sold-grid`,
   `listing-digest`
3. **Agent/personal brand** — `agent-spotlight`, `skeleton-agent-feature`, `welcome`,
   `stay-in-touch`, `editorial-letter`
4. **Annual recap** — `year-in-review`
5. **Skeleton/utility** — `minimal`, `skeleton-clean-white`, `skeleton-dark-pro`
6. **Designed/magazine** — `magazine-issue`

## Process (per template, one pass, both tracks together)

For the 19 Track A templates: fix content first, then visual, in the same edit — don't touch a
file twice.

1. **Track A (19 templates only)** — apply THE SLOT RULE (`lib/email/CLAUDE.md`): every figure/
   photo/link → `""` + instruction in `label`; every `text`/`signal`/`multi-column` commentary
   sentence → rewritten as an imperative instruction in `body` (no schema change — follow the
   `editorial-letter`/`magazine-issue` convention, per the handoff's decision). Check every field
   in `DEFAULT_BLOCK_PROPS[type]` against the override object, not just the touched ones (the
   `market-letter` silent-leak pattern). `agent-spotlight` gets the fake-brand/fake-person/
   hotlinked-photo strip called out in the handoff.
2. **Track B (all 27)** — assign the template a row-span/photo/font/accent combo per the variety
   ledger (below), matching what its category structurally calls for. If a category genuinely
   needs an extra block instance (e.g. a report template wants a second stats row, a showcase
   wants two photo blocks), add it using existing block types at blessed sizes — never a new
   size or a new schema field.
3. Re-check the `magazine-issue` failure mode (image/section block with no real content behind
   it rendering as a flat rectangle) on every template touched, not just the 8 previously called
   "clean."

## Variety ledger (mechanism, not a fixed table)

Kept and updated by hand while working through the 27, one row per template:
`template id | row-span pattern(s) used | photo ratio + placement | font pairing | accent-band
placement`. Purpose: catch "two templates both did `{6,6}` + `3:2` right-photo + MODERN_SANS-only"
before it ships, not after. Worked sequentially in one session/context — not farmed out to
parallel subagents, since independent agents can't see each other's prior choices and tend to
converge on the same "safe" combo, defeating the goal (advisor input, 07/09/2026).

## Explicitly out of scope

- Phase 1 canvas fence-violation warning UI (queued separately, `phase1_canvas_span_accent_warnings`).
- Any new schema field (border/radius, a `text`/`signal` instruction field) — handoff already
  ruled these out; if a category is still starving for a variety axis after exhausting row-span/
  photo/font/accent, that's a signal to revisit, not a reason to add one now.
- Live-render/screenshot verification pass. Operator decision (07/09/2026): code-level
  verification only for this pass — charts/photos can't be seen without real data anyway; a
  visual example gallery for users is a separate later deliverable.
- Website-side grouping to mirror this taxonomy — noted as a follow-up, not this build.

## Verification

```
bun test lib/email/author-recipes.test.ts   # if any recipe text changes
bun test lib/email                          # full suite
bunx next build                             # Vercel-truth typecheck, not npx tsc
```

Stage explicit paths only. Commit; push stays operator-confirmed (RULE 1). SESSION_LOG entry
before any push (RULE 0).

## Open risk (surfaced, not blocking)

Verifying "looks amazing" from code alone is weaker than an actual render — flagged by the
advisor and accepted by the operator for this pass ("we are kind of flying blind, but we can
always add or take away when done"). If a rendered example gallery later surfaces a bad combo
(the `magazine-issue` failure mode again), that's expected iteration, not a defect in this
design.
