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

**Design registry** (`lib/email/listing-flyer-designs.ts`, new):

```
interface ListingFlyerDesign {
  id: string;
  name: string;
  description: string;
  showcaseId: string;       // the Showcase card this design is presented on
  build: (facts: ListingFacts, current: EmailDoc) => EmailBlock[]; // blocks WITH layout
}
```

- Today's `buildListingFlyer` becomes the first entry, id `"classic"`. Its output gains
  `layout` (x/y/w/h) per block so it renders on `GridCanvas` instead of stacked — this
  is the only behavior change to existing output, and it's covered by a golden-render
  snapshot so the arrangement is pinned, not just "however it happens to lay out."
- Each block declares bounds, not just a position — `minW/maxW/minH/maxH` (already a
  supported, unused-until-now part of `BlockLayout` in `lib/email/doc/types.ts`). E.g.
  the hero photo can't be squeezed narrower than stays legible; the footer stays
  `static` (already the existing lock mechanism for the unsubscribe block).
- **Tiering** is NOT a new parallel list. A design's tier is registered in the existing
  `FEATURE_ROUTING` dial (`lib/email/lab/capabilities.ts`) — the exact mechanism fonts
  and features already use (`"free-only" | "both" | "paid-only"`). `capabilities.test.ts`
  already enforces that a paid-only entry never leaks to free — a new design inherits
  that enforcement for free by registering there, no new test infrastructure.
- **Showcase**: each design gets a `Showcase` entry (`lib/showcase/registry.ts`), same
  shape as the existing `listing-to-close` / `launch-blitz` / `agent-launch` cards. With
  exactly one design (this slice), the New Listing hero chip auto-selects it — no picker
  UI ships yet. A second design is what turns the picker on: the New Listing entry point
  shows a small design-select step (reusing `TemplateGallery`'s live-preview card
  pattern, filtered to designs sharing this showcase family) before the address popup.
  **This picker is out of scope for this slice** — documented here so design #2 doesn't
  require re-deriving it.

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

- Golden-render snapshot for the `"classic"` design's now-gridded output (pins the fixed
  arrangement — same pattern as `lib/email/render-golden.test.ts`).
- Layout-bounds sanity test: every declared block's `minW/maxW/minH/maxH` is internally
  consistent (min ≤ max, fits within `GRID_COLS`).
- `capabilities.test.ts` coverage extends automatically once `"classic"` is registered in
  `FEATURE_ROUTING` — no new test file needed for tiering itself.
- A regression test asserting a doc missing a block (simulating a user's delete) is
  never repaired by re-adding that block — written against whatever refresh path lands
  first, but the invariant is locked in this spec regardless of when that ships.

## Non-goals / v1 limits (honest)

- No design picker UI — one design, auto-selected. Documented above as the exact seam
  design #2 turns on.
- No additional designs built. The registry + tiering + showcase + bounds pattern is
  proven on `"classic"`; a second design is "repeat the pattern," not new mechanism.
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
