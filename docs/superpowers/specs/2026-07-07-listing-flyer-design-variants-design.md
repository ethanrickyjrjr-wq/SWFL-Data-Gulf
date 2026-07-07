# Listing Flyer — multiple grid-native designs, tiered, user-durable edits

**Date:** 2026-07-07
**Builds on:** `506f799f` (New Listing recipe fills its fixed grid from the real listing —
`resolveSubjectListing` → `buildListingFlyer`, shipped same day, already live on `main`).

## Where this picks up

`506f799f` already solved "fixed layout, only the real photo/price/specs vary" for
**one** design. That flyer (`lib/email/listing-flyer.ts` → `buildListingFlyer`) renders
**stacked** — its blocks carry no `layout`, so today it lives on the free-tier
`BlockCanvas`, not the real 2D `GridCanvas`. There is exactly one arrangement and no way
to pick another.

This spec covers the next increment: **multiple** flyer designs, each a real grid
layout, each its own showcase a user can pick, gated free/paid, with explicit rules for
what happens when a user drags, resizes, or deletes a block on one.

## Goal

A user picks a listing-flyer **design** (not just types an address into the one design
that exists). Every design pulls the same real facts (`ListingFacts` from
`resolveSubjectListing` / the pasted-URL lane) into a different fixed, professionally
arranged grid. Paid tier unlocks more designs / richer detail; free tier keeps today's
design. Once built, the user can rearrange it within bounds — the design never fights
their edit, and deleting a block never comes back.

## Architecture

**Not scoped to New Listing alone — but not all four hero chips either.** Correction
found while planning (checked `campaigns.ts` directly, RULE 0.5): `HERO_CAMPAIGNS` has
four chips, but only three are **listing/address-scoped** — New Listing, Just Sold, and
Coming to Market each carry a subject property address and already have (or, for the
latter two, need) a recipe-detection regex parallel to `isNewListingRecipePrompt`
(`lib/email/listing-intent.ts`). **Market Update is area-scoped** (`input: "area"`,
seeded from the separate `market-pulse` showcase) — it has no single subject property,
so it produces no `ListingFacts` and structurally cannot use a `(facts, current) =>
EmailBlock[]` builder. It is explicitly OUT of this design-family system; a future
"market update design" would need its own registry keyed on area facts, not this one.

`BuildCategory` is therefore `"new-listing" | "just-sold" | "coming-to-market"` — three
categories, not four. A "design" is a visual language that must render consistently
across all three — so a recipient recognizes the same agent's emails whether it's a
new-listing announcement or a just-sold card. The registry is keyed by design, and each
design carries one builder per listing category, not one builder total.

**Design registry** (`lib/email/listing-flyer-designs.ts`, new):

```
type BuildCategory = "new-listing" | "just-sold" | "coming-to-market";
// extensible — a fourth LISTING category is a new union member + one builder per
// existing design. Market Update is deliberately excluded (see above) — area-scoped,
// no ListingFacts subject, not a fit for this registry.

interface DesignFamily {
  id: string;
  name: string;
  description: string;
  tier: "free-only" | "both" | "paid-only"; // registered in FEATURE_ROUTING, not a parallel list
  showcaseId: string;
  builders: Record<BuildCategory, (facts: ListingFacts, current: EmailDoc) => EmailBlock[]>;
}
```

- Today's `buildListingFlyer` becomes the first entry, id `"classic"`, tier `"both"`
  (nothing regresses — this is the only design free tier will ever see). Its output
  gains `layout` (x/y/w/h) per block so it renders on `GridCanvas` instead of stacked.
  Its `new-listing` builder is `buildListingFlyer` as-is; the other three category
  builders for `"classic"` are new but small (same visual language, different lead
  block — e.g. Just Sold leads with a "Sold" badge instead of "New Listing").
- **Completeness is enforced, not assumed.** A registry test iterates every `DesignFamily`
  × every `BuildCategory` and fails if a builder is missing — the same discipline the
  existing `RECIPE_IDS`/`SOCIAL_TEMPLATES` registry tests already apply (nothing ships
  half a design). This is what "every template has to be made the same for every
  category" means structurally: it's a gate, not a style guideline.
- Each block declares bounds, not just a position — `minW/maxW/minH/maxH` (already a
  supported, unused-until-now part of `BlockLayout` in `lib/email/doc/types.ts`). E.g.
  the hero photo can't be squeezed narrower than stays legible; the footer stays
  `static` (already the existing lock mechanism for the unsubscribe block).
- **Tiering**: free tier's resolution (below) ALWAYS returns `"classic"` — there is no
  design choice on free, by design, not by omission. Paid tier's resolution can return
  any `"both"` or `"paid-only"` design the user has picked.
- **Showcase**: each design gets a `Showcase` entry (`lib/showcase/registry.ts`), same
  shape as the existing `listing-to-close` / `launch-blitz` / `agent-launch` cards —
  this is where a paid user discovers and picks a design, not a popup gated in front of
  every build (see "Arrival flow" below).

## Design selection — sticky per-user default, per-category override

99% of builds should use the same design every time without asking. Modeled as a
two-tier resolution, same shape `resolveUserBrand` already uses for brand colors
(project-level override → user-level default → fallback):

1. **Category override** — this user has explicitly set a different design for THIS
   category (e.g. Just Sold looks different from everything else) → use it.
2. **User default** — the design the user picked (anywhere) becomes their standing
   default → use it for every category that has no override.
3. **Base fallback** — brand-new paid user who's never picked one, or any free-tier
   user → `"classic"`.

`resolveUserDesign(supabase, userId, category): Promise<DesignId>` mirrors
`resolveUserBrand`'s two-query shape. Storage extends the existing `user_brand_profiles`
row (a `default_design_id` column) plus a small per-category override store (a JSONB
column or a `user_design_overrides(user_id, category, design_id)` table — exact shape is
an implementation-plan decision, not a spec-level one; the resolution ORDER above is
the actual contract).

**"Auto-saves to other builds"**: picking a design (however that pick happens — a design
chooser isn't built in this slice, see Non-goals) writes the USER-level default, which is
why it then applies to every other category automatically — that's tier 2 of the
resolution, not a separate propagation step.

## Arrival flow — no popup, build immediately, change afterward

Determined (operator asked for a call, not a re-ask): **chip stays first, address
second** — the chip selects the category, which is what the arrival needs to know
before it can pick a builder at all; there's nothing to gain by reversing that. The
address remains what `resolveSubjectListing` needs, unchanged from `506f799f`.

**No design-picker popup before a build, ever.** With 99% of builds wanting the same
design, gating every build behind a "pick a design" step is friction for the common case
and contradicts the house rule already set for this exact recipe family (`506f799f`'s
own decision: "On a resolved match → build immediately, no confirm step"). Instead:
resolve the design via the two-tier lookup above and build immediately — the same
behavior New Listing already has today, just now design-aware instead of hardcoded to
one design.

**"Change Template" is a standing affordance, not a gate.** Two distinct actions, both
deferred to a fast-follow (this slice ships the resolution + one design; a chooser UI
has nothing to choose from yet):
- Changing the STANDING default (a settings-style pick — writes tier 2, applies to every
  future build with no override).
- Changing ONE category's override (writes tier 1 for that category only).
Neither of these touches a doc already on the canvas — see the next section for why
swapping the design under an in-progress build is explicitly a separate, later decision.

## Position-aware directional styling

A design's visual flourishes (a colored side border, an accent stripe) are decomposed as
their own blocks/toggles per the layer principle above — but a SIDE accent has an extra
wrinkle: which side it renders on should track the block's position, not be hardcoded.
A card with a left border that gets dragged to the right edge of the grid should show
its border on the right — it's framing the *outside* of the composition, not pointing
at whatever now happens to be its new neighbor.

- Any block whose design carries a directional accent derives its side from its own
  live `layout` vs the grid bounds: `x === 0` → left edge, `x + w === GRID_COLS` → right
  edge, otherwise no side accent (a block floating mid-grid doesn't get one). Recomputed
  on every layout change — hooks into the same `handleLayoutChange` callback
  `GridCanvas` already calls on every drag/resize, no new event plumbing.
- **Out of scope for this slice, stated explicitly so it isn't silently dropped:** true
  proportional rescaling of fonts/images as a block resizes. Height already auto-fits
  content (shipped); width resize already snaps to bounded presets. Content pixel-for-
  pixel rescaling with block width is a different, larger effort — email-safe layouts
  stay fluid/non-breaking at any width today, but they don't intelligently rescale.
- `"classic"` (today's `buildListingFlyer`) has no directional-accent block today — this
  mechanic is written down now so any design that DOES use one (a sidebar-style agent
  card, a callout with a colored edge) gets it for free instead of re-deriving it.

## Free creation is unaffected; nothing auto-touches an existing doc

This feature is purely additive — it fires ONLY at the specific moment one of the three
listing-scoped hero-chip arrivals (New Listing / Just Sold / Coming to Market) happens
with no existing project doc (`arrival.ts` routing). Market Update is untouched — it
never routes through this system at all (see Architecture). It does not gate, replace,
or wrap any existing entry point:

- "Start blank," the template gallery, and every generic AI recipe stay exactly as they
  are today — a user who wants to freely compose from scratch always can.
- Nothing runs in the background against a doc once it exists. The only things that ever
  change a built doc are the user's own actions: drag/resize/delete (pure UI, zero AI),
  and the explicit per-block "ask AI" click (already restricted to content fields only —
  it cannot touch colors, links, or identity, so it can't clobber a user's styling even
  when invoked). No toggle is needed for this slice because nothing auto-re-triggers.
- **Named next feature, not built here:** "Change Template" (above) only ever changes
  which design future builds use — it does not touch a doc already on the canvas. The
  moment a "swap THIS doc's design after I've started editing it" action is built, it
  needs to know whether the doc has been touched since it was built, and confirm before
  replacing anything rather than silently overwriting. Written down now so it isn't
  skipped when that action is added.

## Durability contract (explicit, test-enforced)

Once a design builds onto the canvas, the doc is a **normal `EmailDoc`** —
`GridCanvas`/`BlockCanvas` own it completely from that point forward. Nothing about this
feature runs a background re-sync against it.

1. **Move / resize — bounded, not unlimited.** Each design's blocks carry
   `minW/maxW/minH/maxH`. The user can rearrange and resize freely *within* those bounds
   (this is "to a certain extent" — a real constraint, not a suggestion, and not a hard
   lock either). `GridCanvas` already enforces `minW/maxW/minH/maxH` natively (RGL
   respects them) — no new mechanism, just designs need to actually set them, which
   today's single stacked flyer never had to.
2. **Delete — permanent, never resurrected.** Deleting a block already removes it from
   `doc.blocks` for good (`GridCanvas.remove()` — existing behavior, unchanged). The
   rule this spec adds: **any future action that touches an already-built flyer doc
   (e.g. a "refresh listing data" re-pull) must look up blocks by id/role and skip ones
   that no longer exist — it must never re-insert a block whose role was deleted.** This
   is the same discipline `GridCanvas.onAutoHeight` already follows (`find(...); if
   (!b) return`) — stated here as a hard invariant because a future refresh feature is
   the one thing that could violate it if built carelessly.
3. This slice ships no refresh feature — the invariant is written down now so it's not
   violated later, and a test pins it once any refresh path exists.

## Testing

- Golden-render snapshot for `"classic"`'s now-gridded output, per category (pins the
  fixed arrangement for New Listing / Just Sold / Coming to Market separately — same
  pattern as `lib/email/render-golden.test.ts`).
- **Completeness gate**: iterate every registered `DesignFamily` × every `BuildCategory`,
  fail if a builder is missing — the test that makes "every template made the same for
  every category" a build-time guarantee, not a hope.
- Layout-bounds sanity test: every declared block's `minW/maxW/minH/maxH` is internally
  consistent (min ≤ max, fits within `GRID_COLS`).
- **Resolution-order test** for `resolveUserDesign`: category override beats user
  default beats base fallback; a free-tier user resolves to `"classic"` regardless of
  any override/default present on their row (free never sees a choice, even a stale one).
- `capabilities.test.ts` coverage extends automatically once `"classic"` is registered in
  `FEATURE_ROUTING` — no new test file needed for tiering itself.
- A regression test asserting a doc missing a block (simulating a user's delete) is
  never repaired by re-adding that block — written against whatever refresh path lands
  first, but the invariant is locked in this spec regardless of when that ships.

## Non-goals / v1 limits (honest)

- No design-picker/chooser UI — one design (`"classic"`) exists, so the resolution chain
  always lands on it regardless of tier. The resolution ORDER and storage ship now;
  there's simply nothing to choose from yet. A second design is what turns the chooser on.
- No additional designs built. The registry + completeness gate + tiering + showcase +
  bounds pattern is proven on `"classic"` across all three listing categories; a second design is
  "repeat the pattern," not new mechanism.
- No "Change Template" UI (settings-level default change, or per-category override
  change) — the resolution function and storage it reads from ship now; the UI that
  writes to that storage is the fast-follow once there's a second design to pick.
- No swap-design-on-an-already-built-doc action — flagged above as the one place a
  touched-since-built guard will be required later.
- No AI-authored prose in any flyer — today's flyer (and this slice) restates only real
  MLS remarks text, omitting what's missing. An AI-written blurb slot (raised earlier
  this session) is a separate future increment, not part of this spec.
- No "refresh listing data" feature — only the invariant it must respect is specified.

## Verification

- Offline: golden-render snapshot, layout-bounds test, capabilities routing test, delete-
  durability regression test (once a refresh path exists).
- Live (operator-run): pick New Listing → type a real Lee/Collier address → flyer
  builds on the real 2D grid with photo/price/specs in place → drag/resize a block
  within its bounds (confirms it moves, design doesn't snap back or break) → delete a
  block, reload/rebuild the same address → confirm the deleted block does not return.
