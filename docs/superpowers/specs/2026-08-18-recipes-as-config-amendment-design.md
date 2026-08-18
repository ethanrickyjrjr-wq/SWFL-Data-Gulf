# Recipes-as-config — amendment to the one-lane plan (2026-08-02)

**Date:** 2026-08-18 (piece 5 of the plan approved in the "THIS IS ALL A FUCKING LIE" session;
pieces 1–4 = cell-policy registry, context diet, proof-of-red/claim-read hooks, area fence)
**Status:** BRAINSTORM — awaiting operator review. No code until approved (RULE 3.5 gate).
**Amends:** `docs/superpowers/specs/2026-08-02-one-lane-email-recipes-design.md` (built 08/02,
pending live-verify). Nothing here reverses that build — this is the next turn of the same
screw.

## The charge, verbatim

Operator, 08/18/2026: "THIS IS ALL A FUCKING LIE... I MEAN, WE ARE WRITING FUCKING CODE TO
BUILD a fucking email and every fucking email is different. THAT MAKES NO FUCKING SENSE!!!"

He is right, measured: 17 recipes, **22,334 lines** in `lib/deliverable/recipes/` (largest:
market-comps 1,717 · agent-brand-intro 1,303 · sphere-weekly 1,262). Every content ruling must
be hand-walked across N hand-coded files, and the walk is the step that never happens — the HOA
ruling sat implemented on under-contract since July while new-listing rendered the fee. The
cell-policy registry (piece 1) is the tourniquet for the BANNED-cell class; this amendment is
the cure for the architecture that made the walking necessary.

## What already exists (read in-session, 08/18/2026)

- `buildLifecycleEmail` (`lib/email/lifecycle-chrome.ts:199`) is already "THE ONE LAYOUT" —
  every listing-lifecycle email flows through it; recipes hand it a `LifecycleChrome` (ribbon
  copy, photo, description, `middle`/`tail` blocks, narrative, CTA). The chrome already sweeps
  every stats block through the cell-policy registry.
- `recipes/shared.ts` already centralizes subject resolution, narrative slot fill/clear, empty
  chart-slot dropping, favorable-framing policy.
- `fillSkeletonFromSources` (`lib/email/build-doc.ts:725`) already fills a declarative skeleton
  from the four lanes — the default-grid recipe (08/02) is proof a grid can be data.
- What still differs per recipe, in code: fact-row SELECTION (which cells, in what order — the
  HOA incident lived exactly here), ribbon/subject/CTA copy, the `middle` content (comps chart,
  scarcity funnel), chart policy, narrator prompt + length, and a small set of genuinely
  computational derivations (`daysToContract`, `speedStats`, comps banding).

So the amendment is NOT "invent a config layer" — it is: promote the boundary that already
exists (chrome vs. recipe) into a declared one, and shrink each recipe to a config plus its
irreducible derivations.

## Approaches considered

**A. Full config DSL.** Recipes become pure data interpreted by one engine; derivations get
expressed in a mini-language. Rejected: the mini-language grows toward Turing-completeness (the
industry-standard failure), and `speedStats`-class math in config strings is unreviewable and
unlintable. We'd trade 22K lines of typed TS for an untyped in-house language.

**B. Config over shared builders (RECOMMENDED).** A typed, JSON-serializable `RecipeConfig`
declares the declarative ~80%: the grid (ordered section descriptors with span/height), the
fact-row selection (keyed references into a shared CELL CATALOG — each cell key owning its
label, source lane, formatter, and policy class), copy templates (ribbon/subject/CTA), chart
policy, narrator prompt key + length key. The irreducible ~20% stays as small named functions
in a keyed derivations registry (`derivations.ts`: `days-to-contract`, `speed-stats`, …) that
configs reference BY KEY. One builder consumes config + derivations and hands
`buildLifecycleEmail` its chrome, exactly as today. A recipe file collapses from ~700 lines to
a config literal + (sometimes) a derivations module.

**C. Status quo + more fleet registries.** Keep hand-coded recipes; add a cell-policy-style
registry per ruling class as rulings arrive. Cheapest today, but it leaves "every email is
different code" standing, and quick-swap grids stay a per-recipe hand-build — the operator's
product idea never gets cheap.

**Recommendation: B.** It is the only option where a content ruling is a one-line data change
(cell catalog or policy), where a NEW recipe is authored in an afternoon (a config), and where
an alternate grid is just a second config — which is what makes quick-swap real.

## The quick-swap grids product shape (operator idea, 08/18/2026, verbatim)

"since we are making grids, we could possibly have quick replacement grids on the side user can
choose from. or quick swap."

Under B this is structurally cheap: a `RecipeKey` maps to a FAMILY of grid configs (one
primary + N alternates, same cell keys, different arrangement). The lab rail offers the
alternates; swap = re-run layout from the alternate config **reusing the already-filled cells
verbatim** — zero refetch, zero re-authoring, byte-identical values in new positions. Blocks
keep ids derived from config slot keys, so the streaming build's human-wins touched-blocks
merge rule applies unchanged: a cell the user edited survives the swap. Per the operator's own
scratchpad note: DO NOT build swap ad hoc before this config layer exists — it is only cheap on
top of it.

## Migration strategy (no big-bang)

1. **PR 1 — the seam:** `RecipeConfig` type + cell catalog + derivations registry + the
   config-consuming builder, proven by ONE existing recipe (under-contract — mid-size, already
   carries the HOA precedent) migrated behind a render-parity gate: its acceptance render
   script must produce the same email (reviewed diff, RED assertions intact).
2. **New recipes config-first:** the 08/02 promotion queue (monthly-newsletter,
   year-in-review, …) lands as configs only — the queue becomes the config layer's proving
   ground instead of 6 more 700-line files.
3. **Existing recipes migrate opportunistically:** whichever recipe a session touches next
   migrates in that session (fence: the config builder refuses feature additions to a
   legacy-coded recipe — additions ride the migration). No dedicated all-17 wave unless the
   operator orders one.
4. **Quick-swap ships after ≥2 recipes have an authored alternate grid** — it needs real
   families to be a real feature.

## Failure modes → guards (RULE 3.5)

- **Config creep toward a DSL** → hard rule, test-enforced: `RecipeConfig` must survive
  `JSON.parse(JSON.stringify(config))` identical (serializability test); anything needing
  logic is a NAMED derivation in the keyed registry. A function value inside a config fails
  the fleet test.
- **A second registry** (the 08/02 sin, re-committed) → configs live INSIDE the existing
  `Recipe` entry in `lib/deliverable/recipes.ts` — the ONE registry gains a field; no parallel
  config store ever.
- **Migration parity break** → per-recipe migration rides its existing acceptance render
  script (RED assertions already in place per 08/18) + a reviewed visual diff; one recipe per
  PR.
- **Cell-policy bypass** → structurally unchanged: configs resolve cells through the shared
  catalog, the chrome backstop still sweeps every stats block, Gate 18 still runs the fleet
  test on any recipes/chrome push. Additionally: the cell catalog carries the policy CLASS on
  each cell key, so a banned-family cell cannot even be referenced by a buyer-facing config
  (compile-time, before the render-time backstop).
- **Swap loses a user's edit** → the human-wins touched-blocks merge (built + red-to-green
  tested in the 08/18 streaming work) is the swap's merge rule; test: edit cell → swap →
  edit survives in the new arrangement.
- **Swap changes a number** → swap reuses filled cells verbatim, never refetches; test pins
  cell values byte-equal across a swap.
- **Alternate grid drifts from its recipe's research** (5-part skeleton, 50–125 words, one
  CTA) → alternates are authored configs subject to the same fleet tests as primaries — an
  alternate is a first-class grid, not a style toggle.
- **Env hazard** — none: no new tables, no ingest, no `data_lake.*` writes anywhere in this
  amendment.

## Open questions for the operator (decision points, not blockers)

1. Migration pace — config-first for new recipes with opportunistic migration (recommended,
   step 3 above), or a dedicated wave migrating all 17 up front?
2. Quick-swap surface — rail thumbnails beside the canvas (recommended: matches the
   Examples-accordion pattern), or a single "Swap layout" cycle button?
3. Quick-swap tier routing — `"both"` or `"paid-only"` in `lib/email/lab/capabilities.ts`?
   (Builds are free / send is the paywall suggests `"both"`, but it is a retention feature.)

## Out of scope

Social (still deferred per 08/02 decision 1), the render engines, send lanes, any change to
`buildLifecycleEmail`'s layout authority, the 08/02 build itself (still pending its
live-verify).

## Rules honored

One root per concept (the registry gains a field, never a sibling), RULE 0.7 (open slots
unchanged), the 07/13 key-identity rule (a swap changes ARRANGEMENT, never the key), RULE C2
(no new pre-materialization gate — enforcement stays in the existing fleet tests + Gate 18),
and the 08/02 evidence base (Beefree/Gamma: design is APPLIED, not generated — a config is the
purest form of applied design).
