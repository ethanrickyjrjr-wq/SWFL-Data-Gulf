# Distill found deliverables into skeletons + recipes (email + social)

**Date:** 2026-07-05
**Check:** `deliverable_distiller_live_verify`

## Problem

The recipe library (`lib/email/author-recipes.ts`, six entries) and the social template library
(`lib/social/design/templates.ts`) were each hand-authored in one research push. There is no
repeatable method for the recurring moment that actually grows them: the operator finds an
amazing email or social post in the wild and wants it distilled into something Sonnet can
execute with our data. Today that find dies in a screenshot folder.

## Goal

A versioned, repeatable **operator factory**: hand any session a found deliverable (screenshot
or URL/HTML), and it produces the committed artifacts — a prose recipe and/or a positioned
skeleton — in the existing registries, with every invariant (zero digits, content stripped,
advisory-only, brand-neutral) test-enforced. Users never see the machinery; they see a growing
library of layouts that read as designed.

Decided during brainstorm (operator, 07/05/2026): operator factory first, user-facing importer
later; both input kinds from day one; socials folded in as a second emit target.

## Research findings (fetched in-session via crawl4ai, 07/05/2026)

- **Unlayer AI Template Importer** (docs.unlayer.com) — the commercial precedent for exactly
  this pipeline. Accepts an HTML email OR a screenshot; rebuilds rows/columns/text/buttons/
  images as an editable template. Operational lessons adopted: HTML imports preserve structure
  precisely and skip junk (tracking pixels, view-in-browser links); screenshot imports use
  placeholder images (a screenshot doesn't carry originals) and need a final polish pass;
  imports run one at a time; vision imports cost more than HTML imports.
- **Unlayer Design Schema** (docs.unlayer.com/design-schema) — two schema forms; AI generation
  explicitly works in the compact "Simple" structured JSON, with guidance separate. Verdict on
  "is a new format smarter?": no new format needed — structure travels as compact block JSON
  (our authored-block schema / SEED_DOCS / SocialTemplate), guidance travels as prose (our
  RECIPE sections). We already own both halves; inventing a third carrier would violate C2/YAGNI.
- **screenshot-to-code** (github.com/abi/screenshot-to-code) — frontier vision models convert
  screenshots to arbitrary HTML routinely. Our task is more constrained (map to a known block
  vocabulary), so more reliable, not less.
- **Copyright** (copyright.gov FAQ) — "Copyright does not protect facts, ideas, systems, or
  methods of operation." A layout skeleton is a system/method → extractable. The protected
  expression is the source's copy and images → the distiller strips ALL content; source copy
  and photos never survive into any artifact.

## What we're building

### 1. The distiller skill (the method, versioned in-repo)

A checklist skill at `.claude/skills/deliverable-distiller/SKILL.md` (project-skill
convention — loads in any session in this repo). The operator says "distill this" with a
screenshot or URL. Steps:

1. **Target surface** — email or social? Forks the emit step only; capture and mapping rules
   are shared.
2. **Capture** — URL: crawl4ai fetch (crawl4ai output stays local, `*crawl4ai*` gitignored).
   Screenshot/image: the session reads it directly (vision is native — zero paid API; the
   session IS the model, matching the no-live-paid-calls rule).
3. **Strip content** — no source copy, figures, or images may survive into any artifact.
   Layout is uncopyrightable system; expression is not ours to take.
4. **Map to vocabulary** —
   - Email: block types from `DEFAULT_BLOCK_PROPS` (hero, text, stats, list, multi-column,
     signal, agent-card, button, …) + semantic knobs (`band`, `pad`, `overlay_title`,
     twelve-column spans).
   - Social: the six `SocialElementType`s (text, image, stat, chart, cta, logo) positioned in
     a `SocialFormat`'s bounds, honoring `safe-zones`.
5. **Emit artifacts** (section 2).
6. **Verify** — run the registry's tests; the invariants are enforced before commit, not by
   review vibes.

The skill document also encodes the WHY-tagging discipline: every structural move in a recipe
carries the researched reason it converts (evidence fetched per RULE 0.4 at distill time when
the find introduces a pattern our existing evidence base doesn't cover).

### 2. Artifacts per distillation

**Email target:**

- (a) A prose RECIPE entry in `lib/email/author-recipes.ts` — existing format exactly:
  ordered target structure, each move why-tagged, ZERO digits (test-enforced), footer line
  present, advisory only (RULE C2 — never a gate).
- (b) Detection keywords wired into `detectRecipe` with an explicit position in the fixed
  detection order; routing tests updated in the SAME commit.
- (c) A SEED_DOC when the find's value is its EXACT arrangement (typography, spacing, a
  specific composition) rather than a composable pattern. Decision rule per find: exact
  layout → seed doc (a fixed skeleton the free content-patch path already refills by block
  id — the email equivalent of a social template); repeatable pattern → prose recipe (guides
  the author's free composition). Seed placeholders are written
  as **intent descriptions** ("Letter opening: why the reader is receiving this", "Headline
  market figure for the reader's area") — self-describing sections are what the future
  per-section UI surfaces as labels and briefs. A machine-readable `slot_intent` prop is
  deliberately deferred (YAGNI) — placeholders carry intent for now.
- (d) Provenance comment on the entry: the find's named source (homepage URL), date
  (MM/DD/YYYY), and the evidence behind the why-tags.

**Social target:**

- (a) A new `SocialTemplate` factory in `lib/social/design/templates.ts`: pre-positioned
  elements inside the format bounds, colors/fonts ONLY via `TemplateTokens` (the finder's
  brand can never leak in), and **fixed, readable element ids** — the load-bearing invariant
  (the author patches by id; a minted id ships placeholder text with no error).
- (b) Provenance comment, same rule as email.
- (c) Caption recipes for `build-content.ts` are OUT of scope for v1 — noted as a natural
  later increment.

### 3. What does NOT change

Figure-menu id-selection, prose lint + recorded-claim anchoring, brand-applied-last,
CAN-SPAM footer survival, block cap, capabilities routing, `detectRecipe` no-match →
byte-identical generic prompt. No new gate anywhere (C2). `author-recipes.test.ts` iterates
`RECIPE_IDS`, so every new recipe inherits the zero-digit and footer tests automatically;
`templates.test.ts` covers the social registry the same way.

### 4. Editability guarantee (verified in code during brainstorm)

A skeleton is a starting arrangement, never a cage. The email grid (`GridCanvas.tsx`,
react-grid-layout) gives drag-to-move, corner resize, add/duplicate/delete on every block;
geometry flows back into the saved doc; only the CAN-SPAM footer is locked. Social elements
carry x/y/width/height/rotation for the canvas composer. Recipes are advisory to the AI the
same way skeletons are advisory to the user.

## Follow-ups (documented, not built now)

1. **Per-section AI UI (email).** The seam already exists: `buildContentDoc` re-fills a fixed
   skeleton via a patch addressed by block id (`docSkeleton` → patch → `applyPatch`). The UI
   is: user taps a section → same patch call, accept only that block id. Socials already ship
   this pattern (skeleton ids → patch by id). Time shape: one author wait for the first
   draft, then seconds per section touch-up. This build's intent-description placeholders are
   what that UI will read as section briefs.
2. **Social system wiring.** Socials remain TWO unwired systems — the publish engine
   (`lib/social/`, where `SocialTemplate` lives) vs the lab's Generate-Week
   (`lib/email/social-calendar/`). Distilled social templates land on the publish-engine side
   and the lab surface will NOT see them until the systems are wired. That wiring is its own
   build (read both systems first, per memory); distilled templates are an added incentive,
   not a dependency.
3. **Recipe routing at scale.** `detectRecipe` keyword regexes are fine at today's library
   size but get brittle as distillations accumulate (order-sensitive, collision-prone). The
   social author's pattern — the model PICKS from a labeled registry menu instead of regex
   routing — is the natural upgrade when the email library outgrows keywords. Not now.
4. **User-facing importer** ("clone this style" in the lab, Unlayer-style). Reuses the same
   method; paid vision call per use; needs its own copyright/content-stripping guardrails at
   runtime. Explicitly sequenced after the operator factory proves the method.

## Testing

- Existing: recipe zero-digit + footer + detection-order tests (auto-inherit); social template
  registry tests (fixed ids, token-driven styling).
- New with first distillations: each new recipe/template ships its routing/registry test
  updates in the same commit (pre-push Gate 5 runs pack-adjacent tests; `bun test lib/email`
  and `lib/social` cover these registries).
- Verify bar: `bunx next build` + the two suites. Live-send/live-post evidence is operator-run
  (`deliverable_distiller_live_verify` stays open until a distilled recipe/template produces a
  real deliverable end-to-end).

## Build order

1. Distiller skill document (method + checklists + emit contracts for both surfaces).
2. First email distillation end-to-end (proves the method; recipe + keywords + tests).
3. First social distillation end-to-end (template factory + tests).
4. Optional: seed doc for the email find if typography/spacing warrants it.
