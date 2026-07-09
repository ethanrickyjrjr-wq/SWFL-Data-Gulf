# Handoff — finish M2's canvas fence, then rebuild all 27 templates

**Date:** 07/09/2026 · **For:** a fresh Sonnet session, no prior context on this thread.
**Read first:** `lib/email/CLAUDE.md` (THE SLOT RULE), and this doc in full before touching code.

## Why this exists

Three things converged this session: (1) an audit found 19 of 27 `SEED_DOCS` starter templates
ship finished example numbers in slots that should be empty, (2) a live screenshot of one of the
8 "clean" templates (`magazine-issue`) showed content-correctness doesn't mean it looks good —
so all 27 need a visual pass, not just the 19, and (3) the M2 grid-fence system
(the mechanical guardrails meant to stop the AI/user from collapsing every template into one
generic look) turned out to be much further along than the `checks` ledger said — a shipped
commit was titled about something else, so nobody updated the record. Both threads land in the
same place: before touching any template's *design* (borders, photo placement, sizes, look),
finish the one real gap left in the *fence* system, because the fence is what makes "many
different looks that don't collapse into mush" possible instead of just aspirational.

**Order matters — do not skip ahead.** Phase 1 (finish the fence) before Phase 2 (rebuild
templates). Phase 2 should build INSIDE Phase 1's guardrails from the start, not get redone
after.

## Ground truth — verified in code 07/09/2026, trust this over any older doc

Three generations of docs exist for this feature (`docs/superpowers/plans/_archive/2026-07-08-
email-grid-plan-fill.md`, `docs/superpowers/specs/2026-07-08-email-grid-fence-system-design.md`,
`docs/superpowers/plans/2026-07-08-email-builder-integration.md`) and only the last one is live —
the first is archived/superseded, the second's Fences 1/2/5 got superseded by a different
mechanism than it describes. Do not implement from the first two. Read the third for background
only; its own M2 status section was corrected today and is now accurate.

**Shipped and tested (do not rebuild):**
- Fence 1 (blessed spans): `snapRowSpans` (`lib/email/author-doc.ts`) snaps every AI-authored row
  onto the nearest blessed multiset in `BLESSED_ROW_SPANS` (`lib/email/doc/block-contract.ts`).
- Fence 2 (zones): `sortEntriesByZone` + `ZONE_RANK`, hard-enforced inside `deriveLayout`.
- Fence 3 (photo ratio SET): `ImageBlock.tsx` reads `props.ratio` from `PHOTO_RATIOS`
  (`block-contract.ts`), default `"3:2"` — not a hard lock. User-facing picker:
  `BlockInspector.tsx:236-241`.
- Fence 4 (typography pairing): `BLESSED_PAIRINGS` in brand validation (`apply-brand-style.ts`).
- Fence 5 (accent budget): `clampAccentBudget`, capped at `ACCENT_BUDGET`.
- Flip-to-correct: `lib/email/doc/flip.ts` (`flipAlign`/`flipBlockSide`), wired to a button in
  `BlockInspector.tsx:641`.
- All of the above are AI-path-only where "hard" — `deriveLayout` is called only from
  `assembleAuthoredDoc`. The user's manual canvas edits were never blocked by any of it.
- Test coverage: `bun test lib/email/doc/fences.test.ts` (12/12 pass) + `lib/email/doc/flip.test.ts`.

**The one real gap (Phase 1's job):** `GridCanvas.tsx` (react-grid-layout) has ZERO connection to
`BLESSED_ROW_SPANS` or `ACCENT_BUDGET` — confirmed by grep, no matches. A user can drag-resize any
block to any width 1-12 with no snap and no warning. This is the only piece of "hard for AI, soft
for user" that isn't built. Everything else in that sentence already ships.

## Phase 1 — canvas fence warnings (soft-user, non-blocking)

Build a pure function, same shape as the existing fence functions (`snapRowSpans`,
`clampAccentBudget` in `author-doc.ts` — read them first, match their style):

```
checkFenceViolations(doc: EmailDoc): FenceViolation[]
// FenceViolation = { blockId: string, kind: "span" | "accent", message: string }
```

- **Span check:** for each row on the canvas, compare its actual span multiset against the
  nearest blessed one (reuse `snapRowSpans`'s matching logic — don't reimplement the distance
  metric). If they differ, flag every block in that row.
- **Accent check:** count `band:"accent"` blocks; anything past `ACCENT_BUDGET` gets flagged.
- **Zone check:** intentionally NOT included here — the canvas already free-stacks blocks in
  the order the user drops them; a zone violation on manual placement is a much softer signal
  than span/accent and the fence spec never asked for it. Skip it unless you find a concrete
  reason to add it.

Wire it into `GridCanvas.tsx` (or `EmailLabGridShell.tsx`, whichever already owns doc-level
state) so it recomputes on every layout change. Render as a small, dismissible, NON-BLOCKING
inline indicator on the affected block (a thin amber outline or a small badge — match whatever
visual-warning pattern this codebase already uses elsewhere before inventing a new one; grep for
existing warning/toast components first). It must never block save, send, or export — "soft for
user" means guided, not gated. No new backend validation, no new Zod schema — this is
canvas-local UI state only.

Test: a pure unit test for `checkFenceViolations` (mirror `fences.test.ts`'s style). No
end-to-end test required — this is advisory UI, not a build-blocking gate.

Verify: `bun test lib/email`, `bunx next build` clean. Close check `m2_fences_bounds_of_space`
with evidence once this lands.

## Phase 2 — rebuild all 27 templates, two tracks

**Scope is all 27 `SEED_DOCS` entries in `lib/email/doc/default-docs.ts`.** Checked whether
"Start a Campaign" (`lib/campaigns.ts` + `lib/showcase/registry.ts`) or a "Seller Pack" template
carve out any of these 27 — neither does. The 4 live campaigns (New Listing, Agent Launch,
Newsletter/Market Pulse, New Listing Socials) seed a prose *recipe* through the free-form AI
builder (`?recipe=`), never a `SEED_DOCS` id (`?seed=`) — completely separate surface, zero
overlap. "Seller Pack" doesn't exist anywhere in this repo under any name (searched code, docs,
checks, both active worktrees) — it's a separate, unresolved gap, tracked as its own check
(`seller_pack_not_found`), not part of this handoff. So: nothing to exclude. All 27 are in play.

**Two tracks, not one — every template needs Track B, only some need Track A:**

- **Track A — content/slot-rule fix.** Only the 19 templates listed below have baked figures,
  fake brand, or fake commentary violating THE SLOT RULE.
- **Track B — visual/variety pass.** ALL 27 need this, including the 8 that are already
  content-clean. Proof: `magazine-issue` (content-clean, one of the 8) was screenshotted mid-session
  and is visually bad — its `image` block has no `url`, so the "photo" is just a solid black
  rectangle, and the section-band block is also solid black, so the whole template reads as two
  identical black boxes with no real imagery, no accent color, no border/radius treatment, and
  minimal type hierarchy. Being SLOT-RULE-clean says nothing about looking good — that's a
  separate axis this session hadn't checked until an actual screenshot exposed it. Assume the
  other 7 "clean" templates need the same visual scrutiny; don't assume they're fine because they
  passed the content audit.

Do Track A before Track B on any given template (fix the content, then make it look distinct) —
but a template needing only Track B (the 8) still goes through this phase, it just skips the
content-fix step.

### Track A — the 19 templates needing a content/slot-rule fix

#### The 16 fully drifted (baked figures in what should be open slots)
`market-spotlight`, `just-sold`, `market-letter`, `agent-spotlight`, `luxury-market-report`,
`new-listing`, `weekly-pulse`, `open-house`, `price-reduced`, `just-sold-grid`,
`neighborhood-report`, `investment-brief`, `rate-watch`, `monthly-digest`, `year-in-review`,
`listing-digest`.

Worst offender, fix with extra care: `agent-spotlight` fakes an entire competing brand
("Coastal Realty Group"), a fake person ("Sarah Mitchell"), and a hotlinked `randomuser.me`
photo. That's not drift, that's a demo mockup sitting in the production seed list — replace the
company name with `""` (inherits `HOUSE_BRAND` — see `DEFAULT_BLOCK_PROPS.header` comment on WHY
empty, never lorem), strip the fake person and the hotlinked image entirely.

Also watch for the SILENT drift pattern found in `market-letter`: it overrides `hero.kicker`/
`hero.label` but not `hero.value`, so `value` inherits `DEFAULT_BLOCK_PROPS.hero.value = "$485K"`
without anyone writing that number in the file. When you touch a block via `seedBlock(type, {
...overrides })`, check EVERY field in `DEFAULT_BLOCK_PROPS[type]` against THE RULE, not just the
ones already in the override object.

#### The 3 half-right (mostly open, one leak each)
- `listing-feature` — figures are open, but `text.body` is sample-style copy, not clean
  instruction phrasing. See the prose-instruction decision below.
- `welcome` — figures are open, but `hero.prose` carries real boilerplate commentary that
  should be an instruction instead.
- `stay-in-touch` — figures mostly open, but `signal.body` bakes a specific stat into prose
  ("Prices up 4% in your ZIP") — that's an invented-looking number in a commentary block. Rewrite
  as an instruction.

#### The decision this needs, made now, not left open again

`text`, `signal`, and `multi-column` block props have NO separate label/instruction field —
only `body`. THE SLOT RULE's empty+label mechanism (`docSkeleton` skips empty fields, always
sends the label) literally cannot apply to these block types the way it applies to `hero`/`stats`.

**Decision: do NOT add a schema field. Use the convention the two cleanest templates already
established** — write the instruction directly into `body` as an imperative sentence a builder
is clearly meant to replace, e.g. `editorial-letter`'s `"Write like you would to one person —
what you noticed in the market this month..."` or `magazine-issue`'s `"A couple of lines that
earn the click."` NOT a declarative sample sentence pretending to be real copy (that's what
`new-listing`'s `"Describe what makes this home stand out — the backyard, the finishes, the
neighborhood"` gets half-right and half-wrong — it reads as an instruction, but nothing marks it
as one instead of real content the model might just keep).

Why convention over schema: a new field on `BlockPropsMap` is an atomic type-lift touching every
consumer of these block types (Brain Factory rule 3 — one commit, full backfill) for a problem
two existing templates already solve with zero schema change. Ship faster, smaller blast radius,
matches working precedent. If, after converting these 19, the AI is still observed echoing
instruction-styled body text verbatim in real sends, that's a signal to revisit — the existing
check `seed_static_figures_bypass_invention_gate` already tracks this exact failure mode; broaden
its description to cover prose echo, not just static figures, if you see it happen. Don't
preemptively add the schema field on a hypothetical.

#### Per-template checklist (apply THE SLOT RULE, `lib/email/CLAUDE.md`)

- OPEN (`""` + instruction in `label`): every figure, every photo, every link.
- OPEN via imperative-instruction-in-`body`: every commentary sentence on `text`/`signal`/
  `multi-column` blocks (no label field exists — see decision above).
- FILLED: layout (x/y/w/h), `globalStyle`, brand fields (`header`/`footer`/`agent-card` default
  to `HOUSE_BRAND`, never a fake company), `stats[].label` (e.g. "Beds"), button labels that are
  structural ("Schedule a Showing"), chart/photo `alt`/`caption` written as instructions.
- Check EVERY field against `DEFAULT_BLOCK_PROPS[type]`, not just the ones in your override
  object — the `market-letter` silent-leak pattern above.
- Charts need no authoring: an `image` block with a real `layout` + instructional `alt`/
  `caption` is enough; `upsertChartBlock` replaces it in place.

### Track B — visual/variety pass (all 27 templates)

For the 19 in Track A, do this AFTER the content fix. For the 8 already-clean templates
(`minimal`, `skeleton-clean-white`, `skeleton-dark-pro`, `skeleton-agent-feature`,
`skeleton-listing-showcase`, `trend-snapshot`, `editorial-letter`, `magazine-issue`), this is the
ONLY step needed — skip Track A for these, they don't need a content fix, but don't skip this.
Check every one of the 8 for the `magazine-issue` failure mode first (an `image`/section block
with no real content behind it, rendering as a flat solid-color rectangle) before assuming
"clean" means "done."

Use the fence system's own "variety axes" (from `email-builder-integration.md`) to make each
template look distinct from its siblings, not just mechanically correct:
- **Layout** — pick a blessed span multiset (`{12}`/`{6,6}`/`{8,4}`/`{7,5}`/`{4,4,4}`) per row;
  don't default every template to the same row shape.
- **Photo** — ratio from `PHOTO_RATIOS`, placement (left/right/full, `flipBlockSide`-compatible),
  size (span).
- **Emphasis** — `band`/accent, budgeted (≤`ACCENT_BUDGET`), not on every row.
- **Typography** — respect `BLESSED_PAIRINGS`; vary the pairing across templates, don't reuse one.
- **Border/style** — this axis is flagged in the design doc as "new — today it's a fixed render
  detail," meaning there's no contract field for it yet. If you need it for real variety, check
  current render code for where border/radius is hardcoded before deciding whether it needs its
  own small contract addition — don't assume, verify first (RULE 0.5).

Goal: after this pass, no two of the 27 should read as the same template with different colors —
including within the previously-"clean" 8, which get judged on this axis for the first time here.

## Verification (every template, before commit)

```
bun test lib/email/author-recipes.test.ts   # if any recipe text changes
bun test lib/email                          # full suite
bunx next build                             # Vercel-truth typecheck, not npx tsc
```

Stage explicit paths only. Commit, then stop — push is operator-confirmed (see CLAUDE.md RULE 1).
Append a SESSION_LOG entry before any push (RULE 0 — hook-enforced).

## What NOT to do

- Don't run Track A (content rewrite) on the 8 already-clean templates — they don't need it. DO
  run Track B (visual pass) on them — see the correction above; content-clean isn't visually-done.
- Don't add a new mandatory gate anywhere (RULE C2 / brain-platform CLAUDE.md RULE 3-C2).
- Don't add the `text`/`signal` instruction field to the schema — see the decision above.
- Don't invent brand identity (company names, people, photos) anywhere — house brand or nothing.
- Don't re-touch Fences 1-5's core logic (`author-doc.ts`, `block-contract.ts`) — Phase 1 is
  additive canvas UI only, not a rewrite of the AI-path fences, which are done and tested.
