# One lane: every email is a coded-grid recipe

> **Recommended model:** ⚡ Sonnet

**Date:** 2026-08-02 (decreed 08/01/2026)
**Check:** `one_lane_email_recipes_live_verify`
**Operator decree (08/01/2026):** "make all the emails recipes and user can then change if they
want … Every email is a grid that is coded and certain data goes to certain places because of
research." Reframe, same session: "we just build more real showcase examples and those are what
get built." Scope, defaults, advisory-recipe fate, and sequencing below were each confirmed by
the operator in the brainstorm (four explicit picks).

## Problem

Email building runs TWO lanes inside one `authorDoc()` call, and the seam between them is where
three months of confusion and incidents live:

1. **The structural lane** — `lib/deliverable/recipes.ts` (14 `RecipeKey`s) + builders in
   `lib/deliverable/recipes/`. Coded grid skeletons, researched slot maps, declared chart
   policies, bound charts, open slots for unsourced cells. This half works and is test-covered
   (`recipes.parity.test.ts`: 17 pass, verified live 08/01/2026).
2. **The free-author lane** — the generic author in `lib/email/build-doc.ts`, steered by a
   SECOND registry of 11 advisory "recipes" (`lib/email/author-recipes.ts`, `RecipeId`,
   keyword-detected). The model lays out the email itself. This is the lane that seated a Lee
   County lake figure in a NATIONAL headline slot on 07/13/2026 when a builder fell through
   silently, and the lane that makes the system unexplainable — two registries share the word
   "recipe," and `sphere-weekly` exists in BOTH meaning different things.

Evidence that structure-not-generation is the right side to keep (all read in-session,
08/01/2026): the email map's rule 1 (the key is the identity — a prompt-regex gate killed 15 of
17 recipes on 07/13); `_RESEARCH/email-and-social/2026-07-30-email-creation-on-user-data-competitor-scan.md`
(Beefree/Gamma: design is APPLIED, not generated; Gamma's prompted charts are non-deterministic
by their own docs — we bind); `_RESEARCH/deliverable-and-design/2026-07-01-ai-deliverable-design-quality-research.md`
(quality comes from a checker/structure, not a smarter writer).

## Goal

ONE lane. Every email build lands on a coded grid from the ONE registry. The AI's job shrinks to
what it's good at and what we can gate: fill cells from sourced lanes, bind charts, write prose
in a chosen voice. The user edits after — moves blocks, rewords, deletes — exactly as the lab
already allows. Product growth = authoring more showcase grids, never smarter prompting.

## Decisions (operator-confirmed in brainstorm, 08/01/2026)

1. **Scope: emails only.** Social keeps its two live systems untouched; its missing no-invention
   gate stays tracked under `social_path_has_no_no_invention_gate`. Folding social in was
   explicitly deferred until the email collapse is proven.
2. **Typed asks: default grid + suggestion chips.** No key → the build lands on the new
   default-grid recipe. The lab then shows up to two non-binding chips ("Looks like a Just Sold —
   use that grid?"). A chip is a navigation link carrying `?recipe=<key>` — identical to a door.
   The model proposes from the closed key list; it can NEVER dispatch. Wrong suggestion = a
   useless chip, not a wrong email. The 07/13 rule stands: the key is the identity, never a
   regex (and never a model call) over the prompt.
3. **Advisory recipes: promote + fold.** Type-shaped ids (monthly-newsletter, year-in-review,
   showing-confirmation, chart-digest, agent-intro, sphere-weekly-advisory) go on a promotion
   queue — each becomes a real showcase grid AFTER the collapse ships, one at a time, each with
   its own check. Purely tonal ids (editorial-letter, editorial-showcase, editorial-magazine)
   become VOICE PRESETS on the narrator, usable with any grid — including letter-style prose, so
   nothing ever needs the free author back. The keyword detector (`detectRecipe`) and the
   advisory registry die.
4. **Sequencing: collapse first, promote after.** One PR-sized build ships the collapse;
   promotions are follow-on showcase builds.

## What we're building (the collapse PR)

### A. The default-grid recipe

- A new `RecipeKey` (`default-grid`) in `lib/deliverable/recipes.ts` with a real builder in
  `lib/deliverable/recipes/` — subject spine resolved like the area recipes (ZIP/city when
  detectable from scope, else none), `positioning: "story-side"`, chart policy: chart only when
  the ask is about a number, else drop the slot.
- Skeleton reuses the existing blank-skeleton / starter-template machinery (`SEED_DOCS` slot
  rule: data-dependent cells ship EMPTY with instruction labels; structure/brand ship filled).
- Fills what it can from the four lanes in order (our data for the resolved scope → the user's
  own prompt text → cited web → user-stated figures); everything else is an OPEN SLOT — visible
  on canvas, absent from the send.
- **Hard requirement: builds from a completely empty context** (no scope, no data, no prompt
  beyond whitespace). That property is what makes it a safe terminal fallback.

### B. Dispatch collapse (`lib/email/build-doc.ts`)

- `activeRecipe = recipeByKey(recipeKey) ?? recipeFromPrompt(prompt) ?? DEFAULT_GRID_RECIPE`.
  The legacy prefix bridge STAYS (it resolves old links to structural keys — key resolution, not
  free authoring).
- The free-author code path is DELETED in the SAME commit the default grid lands. No commit
  exists where both lanes are live.
- A builder that returns an invalid doc falls back to the DEFAULT-GRID build (the loud
  `console.error` stays). An open slot cannot seat a wrong number — strictly safer than the
  07/13 failure shape.

### C. Suggestion chips

- After a typed (key-less) build lands, one model call proposes ≤2 keys from the closed
  `RECIPE_KEYS` list (or none). Rendered as chips in the lab; clicking navigates with the
  explicit key through the normal door machinery (`lib/lab-entry/destination.ts`).
- The proposal call has NO tool access to dispatch and its output is validated against
  `isRecipeKey` — an unknown or hallucinated key renders nothing.

### D. Voice presets

- The digit-free prose guidance from the editorial family moves to a `voice` parameter consumed
  by the narrator prompts (same seam `FAVORABLE_FRAMING_POLICY` uses — pasted, never
  paraphrased). The zero-digits invariant carries over test-enforced.
- The lab's recipe picker becomes: showcase grids (structural keys) + a voice dial. Saved
  `preferred_recipe` values holding old advisory ids are mapped to the nearest voice preset
  where tonal, ignored where type-shaped (the resolver already tolerates unknown ids —
  verified live 08/01/2026, 59 resolver tests pass).
- `lib/email/author-recipes.ts` and `detectRecipe` are deleted once their consumers repoint.

### E. Promotion queue (follow-on builds, NOT this PR)

monthly-newsletter → year-in-review → showing-confirmation → chart-digest → agent-intro (merge
into `agent-brand-intro` or retire — decide at promotion time) → sphere-weekly-advisory (dedupe
against the structural `sphere-weekly` — the name collision dies with the promotion). Each
promotion: `node scripts/new-build.mjs`, own spec stub, own check, one at a time.

## Failure modes → guards (RULE 3.5 mandatory section)

1. **Default-grid builder itself fails / needs data** → test-required to build from empty
   context (TDD test #1). It cannot fail for lack of data because openness is its contract.
2. **Chips auto-route** → chips render as `?recipe=<key>` links only; a test asserts the chip
   component performs no dispatch and the proposal path has no dispatch capability.
3. **Model proposes a bogus key** → `isRecipeKey` validation at the boundary; unknown → no chip
   (TDD test named for this).
4. **Stored advisory ids break builds** (saved layouts, `preferred_recipe`, scheduled arcs) →
   unknown-id tolerance already exists; add a mapping sweep old-id → voice preset; test with a
   stale-id fixture.
5. **Half-finished rip leaves two lanes** → deletion + default grid in ONE commit; a test
   asserts every `authorDoc` output traces to a recipe builder (no non-recipe-built docs).
6. **Hidden consumers of the advisory registry / authorSystem sections** → tree-wide grep before
   delete; prefer loud compile breaks (delete the export, let the build find survivors — verify
   with `bunx next build`, never `npx tsc`).
7. **Letter-format regressions** (agent-launch is a letter; editorial asks) → voice presets must
   cover letter-style prose; campaign-sim + a letter-voice fixture test.
8. **Lifecycle regressions from dispatcher edits** → `bun scripts/email/campaign-sim.mts` (dry
   run) must drive all 7 listing recipes green before merge; any `--send` pass is verified
   against the INBOX, never the program's own send record.
9. **Env hazard** — none new: no new tables, no ingest, no `data_lake.*` writes in this build.

## Testing

TDD per RULE 3.5: each guard above lands as a failing test first, named for its failure mode.
Existing suites that must stay green: `recipes.parity.test.ts` (extended to `default-grid`),
`build-doc.test.ts`, campaign-sim dry run. The 59 `author-recipes.test.ts` tests are REWRITTEN
to the voice-preset shape in the same commit that deletes the registry (never deleted without
replacement coverage of the invariants: zero digits in voice guidance, explicit-pick-wins).

## Out of scope

Social (both systems), the PDF/render engines (unchanged — grids already render through all
three), send lanes, the promotion-queue grids themselves, any brain/pack/ingest change.

## Rules honored

RULE 0.7 (never refuse a build — the default grid IS the never-refuse mechanism), no-invention
(open slots, bound charts), RULE C2 (no new pre-materialization gate — enforcement stays with
the existing validators), one-root-per-concept (ONE recipe registry after this ships), the
07/13 key-identity rule (chips suggest, never route).
