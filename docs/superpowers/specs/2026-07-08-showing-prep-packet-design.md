# Showing Prep Packet — one-click comps + subject-listing deliverable per address

**Date:** 2026-07-08
**Status:** approved design (operator, 07/08/2026)
**Origin:** `docs/superpowers/plans/2026-07-08-reddit-ai-cheats-and-deliverable-hacks.md`, bucket
C.1 — r/realtors names agents spending ~3 hours manually assembling comps + permit history + tax
records + disclosures before every showing.

## Problem

Real-estate agents currently build this by hand every time: pull comps, check tax records, read
every supplement, print disclosures, organize it all into a binder — described unprompted on
Reddit as a recurring ~3-hour task per showing. This platform already holds comps + subject-listing
data at genuine address grain (via `lib/assistant/comp-helper.ts` / `lib/listings/resolve-subject.ts`
/ `lib/geo/geocode-address.ts`) and already has a full deliverable pipeline (`lib/deliverable/build.ts`,
`lib/email/grounded-report.ts`'s email/PDF skin split). Nothing packages them into the one-click
document agents describe wanting.

## Scope decisions (locked 07/08/2026, operator)

1. **v1 data scope: comps + subject-listing only.** Permits and tax/parcel data exist in the lake
   but only at ZIP/corridor grain (permits) or keyed by folio/parcel ID with no address join (tax) —
   neither is genuinely address-grain today. Rather than imply address-precision we don't have, v1
   ships only what's real at address grain; permit/tax become a fast-follow once/if an address→
   folio/parcel-id join is built. No empty cells for permits/tax in v1 — they're absent, not blank.
2. **Disclosures ship as a user upload, not a data feed.** No disclosure/HOA-doc vendor exists or is
   in scope. This maps cleanly onto the existing four-lane sourcing model (RULE 0.7, Lane 2 — the
   user's upload): the packet includes an empty `file` item slot labeled "Attach seller disclosure
   (optional)" that an agent fills by hand, same mechanic as the photo drag-drop slot in
   `listing-flyer.ts`. Zero new ingest/vendor work.
3. **New project kind, not a bolt-on to the existing "listing" kind.** A New Listing flyer markets a
   listing to buyers (client-facing, sales tone); a Showing Prep Packet is an agent's own internal
   prep document for a showing (working document, factual tone) — different audience, different
   document. `project-template.ts`'s frame-recipe flywheel (built for ZIP/corridor-grain brain data)
   also doesn't fit live per-address vendor lookups, so this gets its own dedicated build function,
   the same pattern `listing-flyer.ts` already established for `"listing"`.
4. **Delivery: a real persisted project, not a lighter one-shot export.** Goes through the existing
   `freezeSnapshot → buildDeliverableNarrative → gateNarrative` pipeline and the existing
   `grounded-report.ts` email/PDF skin split — no shortcuts around the citation/gate machinery.
5. **Trigger: conversational AND a homepage/project pill**, not either/or. Both the assistant
   ("build a showing prep packet for 123 Main St") and a dedicated pill component route into the
   same `POST /api/projects` with `kind:"showing-prep"`.
6. **Design content, verified via crawl4ai against RPR's own "Next Gen Reports" template
   (`blog.narrpr.com`), Luxury Presence's 2026 listing-presentation guide, and Bramlett Partners'
   packet checklist:** include a comp map, per-comp one-sheets for the top comps (not just a flat
   table), and a "Local Market Snapshot" section fed from existing ZIP-grain market brains
   (market-heat-swfl / market_aggregates). The Market Snapshot is NOT the same category of gap as
   permits/tax — industry convention (RPR's own template) treats market-trend stats as area-level
   data by design, and we already have this as a live brain output, clearly labeled at its real
   ZIP/county grain.

## Architecture

New project kind `"showing-prep"`, parallel to how `"listing"` works today:

- **`app/api/projects/route.ts`** — extend the `kind` check (currently line 43,
  `kind === "listing" ? "listing" : "general"`) to also accept `"showing-prep"`. Same
  `subject_address` field, no schema change.
- **`app/project/ShowingPrepButton.tsx`** — near-copy of `NewListingButton.tsx`: rounded pill, one
  address input, `POST /api/projects` with `kind:"showing-prep"`, routes to `projectHome(id)`. This
  is the homepage/project-page trigger.
- **`lib/email/showing-prep-doc.ts`** — the coded-grid build function, sibling to
  `listing-flyer.ts`. Fixed section order, layout/positions/palette all in code, AI only fills the
  one narrow commentary blank (same constrained pattern as `buildListingFlyer`):
  1. Header (agent's own branded header — sticky, `keepOrDefault`)
  2. Subject address + hero photo (from `resolveSubject`; empty photo block if unresolved, same
     drag-drop fallback as the flyer)
  3. Subject specs strip (beds/baths/sqft/price, from `resolveSubject`)
  4. **Comp map** (subject + comps plotted; omitted entirely if no comps have lat/lon — never a
     broken map graphic)
  5. **Per-comp one-sheets** for the top 2-3 comps with a real photo (photo + price + specs + sold
     date if sold); remaining comps fall into...
  6. **Comps comparison grid** (list price / AVM / sold price+date / beds/baths/sqft per row, each
     row's source scrubbed of MLS#/vendor IDs per existing rule — comps without a photo land here
     instead of getting a broken one-sheet)
  7. **Local Market Snapshot** (market type, months of inventory, active/pending/sold counts — from
     the existing ZIP-grain market brain; section omitted if that brain's output is stale/missing,
     never shown stale)
  8. One AI commentary blank (gated by `gateNarrative`, may only state numbers present in the
     snapshot)
  9. Empty **file** slot: "Attach seller disclosure (optional)"
  10. Agent card (sticky, `keepOrDefault`)
  11. Footer (sticky, CAN-SPAM — `keepOrDefault`, `static: true`)
- Wires into the **existing, unchanged** `freezeSnapshot → buildDeliverableNarrative →
  gateNarrative` pipeline in `lib/deliverable/build.ts` and the **existing, unchanged**
  `grounded-report.ts` email/PDF skin split. No changes to the citation system
  (`CitationList`/`clean-url.ts`) — every comp row and the market-snapshot section each carry their
  own `origin_kind` as today's flat citation list already supports.

## Data flow

1. Pill or chat submits an address → `POST /api/projects` (`kind:"showing-prep"`) creates the
   project, identical to `"listing"` today.
2. Build step calls `geocodeAddress()` first — Lee(12071)/Collier(12021) county gate, same as
   `comp-helper.ts` today. A miss (bad address, outside Lee/Collier) never refuses: falls back to an
   address-only skeleton with empty subject/comps/map/market-snapshot sections, matching
   `buildListingFlyer`'s existing resolve-miss fallback exactly.
3. On a hit: `resolveSubject()` for the subject's own listing facts, `compsForAddress()` for up to
   25 nearby + up to 2 sold comps (hard-capped at 3 vendor calls, the existing limit). The subject's
   resolved lat/lon also drives the comp map and resolves the ZIP for the Market Snapshot lookup.
4. Market Snapshot pulls the live ZIP-grain output already produced by this platform's existing
   market packs (`refinery/packs/market-heat-swfl.mts` and/or `housing-swfl.mts` both carry
   months-of-inventory / seller-vs-buyer-market metrics — the implementation plan picks the exact
   pack) — read-only, no new ingest.
5. Items assemble into the shape `freezeSnapshot` already expects; `buildDeliverableNarrative`
   writes the one commentary paragraph; `gateNarrative` lints it against every real number in the
   snapshot (regenerate-once, then hard-strip) — unchanged, no new gate.
6. Disclosure file slot is pure UI: an agent drags a PDF onto the empty file block, same mechanic as
   the photo drag-drop. No parsing/extraction in v1 — it rides through as a plain `file` item.
7. Render: existing `grounded-report.ts` skin split picks `email` or `pdf` — no new template engine.

## Error handling

Every section follows the same rule already proven in `listing-flyer.ts`: **empty cell, never
invented, never broken.**

- Geocode miss → address-only skeleton (existing fallback pattern).
- No comp has lat/lon → comp map block omitted entirely, not a blank/broken graphic.
- ZIP has no live Market Snapshot output (stale or missing) → section omitted, not shown stale —
  matches the platform's existing stale-upstream-caveat convention.
- A comp with no photo → falls into the plain comparison-grid row instead of getting a broken
  one-sheet card.
- Disclosure slot always renders regardless of any other section's state.

## Testing

Mirrors `listing-flyer.test.ts`: unit tests for the resolve-miss fallback, comps-present vs.
comps-empty, comp-map-present vs. no-lat-lon, market-snapshot-present vs. stale/missing, and the
disclosure file slot always rendering independent of other sections. Manual pass on one real Lee
County address and one real Collier County address (Collier's data has historically been spottier
across other pipelines). Full `bun test` suite green + `bunx next build` clean before calling this
done, same gate every other change in this repo passes.

## Out of scope for v1 (explicit, not silent)

- Permit history and tax/parcel records at address grain (fast-follow, needs an address→folio/
  parcel-id join first).
- Disclosure PDF parsing/extraction (v1 is upload-and-attach only).
- A standalone single-property marketing website/landing page (a Luxury-Presence-cited
  differentiator, but a listing-marketing feature, not a showing-prep feature — separate future
  brainstorm if pursued).
- A post-showing "showing feedback report" follow-up (a natural companion deliverable per the
  Luxury Presence research, but a distinct feature with its own trigger — separate future
  brainstorm if pursued).

## Sources

- This platform's own code: `lib/assistant/comp-helper.ts`, `lib/listings/resolve-subject.ts`,
  `lib/listings/sold-price.ts`, `lib/geo/geocode-address.ts`, `lib/deliverable/build.ts`,
  `lib/deliverable/project-template.ts`, `lib/email/listing-flyer.ts`, `lib/email/build-doc.ts`,
  `lib/email/grounded-report.ts`, `app/project/NewListingButton.tsx`, `app/api/projects/route.ts`,
  `refinery/packs/permits-swfl.mts`, `refinery/packs/market-heat-swfl.mts`,
  `refinery/packs/housing-swfl.mts`, `ingest/cadence_registry.yaml`.
- RPR (Realtors Property Resource) Next Gen Reports templates — https://blog.narrpr.com/tips/nextgen-report-templates/
- Luxury Presence, "9 Essential Components of a Real Estate Listing Presentation in 2026" — https://www.luxurypresence.com/blogs/real-estate-listing-presentations/
- Luxury Presence, "3 Real Estate Presentations That Close More Deals in 2026" — https://www.luxurypresence.com/blogs/create-winning-sales-presentations/
- Bramlett Partners, "Supercharge Your Listing Presentation: Build a Packet Like a Pro" — https://bramlettpartners.com/blog/supercharge-your-listing-presentation-build-a-packet-like-a-pro
- Origin research: `docs/superpowers/plans/2026-07-08-reddit-ai-cheats-and-deliverable-hacks.md`
