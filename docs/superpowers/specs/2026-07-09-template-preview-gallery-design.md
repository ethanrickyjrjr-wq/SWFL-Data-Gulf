# Filled previews for all 27 templates - lab picker thumbnails + /showcase gallery + nav discoverability

> **Recommended model:** ⚡ Sonnet



**Date:** 2026-07-09
**Check:** `template_preview_gallery_live_verify`
**Status:** HANDOFF — design settled with operator 07/09/2026 (two review turns), not yet implemented.
**Recommended model:** ⚡ Sonnet.

## Problem

A user who does not arrive through the email funnel has no way to SEE what the 27 templates
produce before committing to one:

- The lab's "Start from a layout" picker (`components/email-lab/EmailLabGridShell.tsx:1573`)
  renders **name + one line of text only** — no visual. The user picks blind.
- The good examples that DO exist live in the AI chat pill (`components/briefcase/BriefcasePanel.tsx`
  → ShowcaseCard/ShowcaseOverlay) and on `/showcase` — but `/showcase` shows **campaign recipes**
  (CampaignExamples, SHOWCASES registry) and **chart-frame report templates** (ShowcaseGrid), NOT
  the 27 SEED_DOCS layouts. And `components/nav/SiteShell.tsx` has **no link to /showcase at all**
  (verified 07/09) — the page is only reachable from flows that already know about it.
- The 27 seeds themselves are (correctly) skeletons under THE SLOT RULE. Empty slots are right for
  the CANVAS and wrong for a PICKER: template products convert with filled previews (Migma's
  "Browse Real Brand Emails" remix library, Canva/Gamma galleries — already crawled, see
  `docs/superpowers/plans/2026-07-08-ai-design-and-email-marketing-hacks-sweep.md`, and already
  specced there as Tier 2 #8 "Skeleton Remix gallery / start-from-template picker").

**The settled design principle (operator, 07/09): the preview promises, the canvas is honest.**
Filled renders exist ONLY in the preview layer; what the user edits and sends stays the slot-rule
skeleton. Never put demo data back into `build()` — that is the exact class Track A purged
(2026-07-09 session, `seed_static_figures_bypass_invention_gate`).

## Goal

1. Every one of the 27 SEED_DOCS has a filled visual preview a visitor can browse.
2. Previews are discoverable OUTSIDE the email funnel: /showcase section + site nav + (optional,
   operator-gated) landing strip.
3. One click from any preview lands in the lab with that template picked, brand applied.
4. Preview fills are four-lane honest: market figures come from the lake (cited, with as-of),
   listing cards from real listing data, photos from own-hosted assets. No invented numbers, no
   hotlinked strangers (the agent-spotlight randomuser.me purge stands).

## What we're building

### A. Preview assets — extend the EXISTING capture pattern, not a new system

`lib/showcase/registry.ts` already commits captures under `public/showcase/<id>/*.webp`, generated
by `scripts/capture-showcase.mjs`, existence-guarded by `registry.test.ts`. Follow that exact
pattern:

1. **`previewFill(doc: EmailDoc): EmailDoc`** — a pure function (new file, suggest
   `lib/email/doc/preview-fill.ts`) that walks a built seed and fills EMPTY figure/photo/commentary
   slots for display:
   - Market figures (hero.value, stats[].value): from a held figure set fetched once at capture
     time (default scope: Lee County / master brain figures — same lane as `buildFigureMenu`
     consumes). Each carries its real source + as-of; the capture stamps "Live SWFL data ·
     MM/DD/YYYY" in the overlay caption, not inline per figure.
   - Listing cards (price/beds/baths/sqft/address): one real listing row per card from held
     listing data. Citation label per the locked rule: "SWFL Data Gulf", never vendor/MLS#.
   - Photos: own-hosted sample assets under `public/showcase/seed-previews/` (committed, licensed,
     coastal/property/agent). NEVER hotlinked externals.
   - Charts: reserved chart `image` blocks get one real rendered chart via the existing
     `upsertChartBlock` path (or a committed pre-rendered chart webp if the live path is awkward
     in the capture script).
   - Commentary/prose slots: short REAL sentences grounded in the filled figures (hand-written in
     the fill fixtures, no model call needed for v1).
   - INVARIANT: `previewFill` is called ONLY by the capture script / preview route. `pickSeed`
     and `openSeed` continue to commit `seed.build()` untouched. A unit test must assert
     `previewFill(doc) !== doc` mutation-free behavior AND that no lab entry path imports it.
2. **`scripts/capture-seed-previews.mjs`** — mirror of `capture-showcase.mjs`: for each of the 27,
   `renderEmailDocHtml(previewFill(seed.build()))` (the ONE render root — grid seeds compile
   through compileGrid automatically), screenshot → `public/showcase/seed-previews/<seed-id>.webp`
   (one full-height capture; the card crops top-anchored). Templates render in their OWN designed
   globalStyle (that IS the thing being previewed); applyBrand happens after pick, as today.
3. **Registry + guard:** a small `SEED_PREVIEWS` manifest (id → asset path, cadence tag, one-line
   pitch) + a test asserting every SEED_DOCS id has an existing asset (same contract as
   `registry.test.ts`) so a template edit without a re-capture fails CI, not prod.
   Stale-capture note in the script header: re-run after any SEED_DOCS visual change
   (the Prettier/refinery rules don't touch webp; this is a manual re-run, the test only guards
   existence — decide during build whether to also hash `default-docs.ts` into the manifest to
   catch drift mechanically).

### B. Surfaces (the site-layout half)

1. **/showcase third section — "Start-from layouts."** After CampaignExamples and ShowcaseGrid
   (`app/showcase/page.tsx`), add a section rendering the 27 as ShowcaseCard-style tiles grouped
   by cadence/job (weekly · monthly · annual · listing/event · relationship · skeletons). Reuse
   `ShowcaseCard` + `ShowcaseOverlay` UNCHANGED (same interaction the AI pill uses — a visitor who
   saw it in chat sees the identical thing here). Overlay CTA: "Use this layout →" via the
   EXISTING `openSeed(projectId, seedId)` / `?seed=` deep link (`lib/lab-entry/destination.ts:33`);
   anonymous visitors route through the same arrival the campaign "Make this →" already uses
   (`recipeDestination` precedent — reuse its anonymous-usable path, carrying `seed=` instead of
   `recipe=`).
2. **Nav discoverability.** Add a "Showcase" (or "Examples" — operator pick at build time) link to
   `components/nav/SiteShell.tsx`. This is currently the missing front door: the page exists,
   nothing points to it.
3. **Lab picker thumbnails.** Replace the text-only seed buttons (`EmailLabGridShell.tsx:1575-1586`)
   with thumbnail tiles using the same committed webp (small: ~120px wide, name under it,
   description as title/tooltip). (Correction 07/09: there is no free-tier `EmailLabShell` — it was
   deleted in the 2026-07-07 retire-block-shell pass; the grid shell is the only seed picker. The
   capabilities dial still decides which seeds each tier lists, do NOT hardcode tier differences;
   read `capabilitiesFor(tier)`.)
4. **Landing strip — OPTIONAL, OPERATOR-GATED.** A 3-4 tile "See what it builds" row linking to
   /showcase, placed below the fold near `DeliverableShowcase` (`components/landing/`). The
   homepage design is LOCKED (address-bar hero first, lake trust layer, map below fold — spec
   2026-07-05-agent-first-homepage-design.md); do NOT add this without an explicit operator yes.
   Everything in A + B1-B3 ships without it.

### C. Explicitly out of scope

- No new render engine, no live iframe mini-renders in v1 (committed captures are the proven
  pattern; revisit only if template edit-frequency makes captures painful).
- No model calls in the preview path (fills are fixture-driven; the AI authors real docs, not
  previews).
- No changes to SEED_DOCS content/slots (that work is `email_cadence_enrichment` — land it FIRST
  or captures will need a re-run; coordinate: enrichment → then capture).
- No paid/free gating changes — previews are marketing surface; the SEND paywall is untouched.

## Order of work (each step independently shippable)

1. `previewFill` + fixtures + unit tests (pure lib, no UI risk).
2. Capture script + 27 committed webp + manifest guard test.
3. /showcase "Start-from layouts" section + `?seed=` arrival wiring for anonymous visitors.
4. Lab picker thumbnails (both tiers via capabilities dial).
5. SiteShell nav link.
6. (Gated) landing strip — separate operator approval.

## Evidence base

- Picker is text-only: `EmailLabGridShell.tsx:1573-1587` (verified 07/09/2026).
- No nav link to /showcase: grep of `components/nav/SiteShell.tsx` (verified 07/09/2026).
- `?seed=` deep link exists: `lib/lab-entry/destination.ts:33` (`openSeed`).
- Capture pattern exists: `lib/showcase/registry.ts` header + `scripts/capture-showcase.mjs` +
  `registry.test.ts`.
- Filled-preview convention: Migma remix library / Canva / Gamma — crawled 07/08/2026, see
  `2026-07-08-ai-design-and-email-marketing-hacks-sweep.md` (Tier 2 #8 already proposes this
  picker; this spec is that item plus the site-placement half).
- Slot rule (canvas stays skeleton): `lib/email/CLAUDE.md` + THE SLOT RULE header in
  `lib/email/doc/default-docs.ts`.

## Post-build addendum (folded in 07/11/2026 — check `gallery_spec_research_foldin`)

Folded in from the 07/09 build's crawl4ai research pass (RULE 0.4) and the built-deviations note,
both previously recorded only in `SESSION_LOG.md` (the "feat(showcase): template preview gallery —
filled previews for all 27 layouts" entry, 07/09/2026) and a fence-session transcript, per the
07/09 blocked attempt (fence session `6a260319`'s live claim was in flight at the time).

**RULE 0.4 research findings that shaped this build:**
- **Stripo.email** validates committed fixed-width captures at scale (they run this pattern across
  ~1,650 templates) plus a dual-CTA card treatment (Edit deep-link / Preview overlay) — the basis
  for the grid picker's per-tile controls.
- **RGE (Really Good Emails)** groups its gallery by job-to-be-done with count+pitch section
  headers ("12 Just-Sold templates — ...") rather than a flat grid — the basis for `SeedGallery`'s
  job-group sections.
- **NN/g (Nielsen Norman Group)** card-pattern guidance: card internals should be visually
  identical regardless of content type, and the whole card should be a single click target — the
  basis for making the entire `SeedGallery` tile (not just a button) the `?seed=` link target.

**Built-deviations from this spec's original assumptions (found during the 07/09 build):**
- Nav link to /showcase was assumed missing (see Evidence base above); it in fact **already
  existed** at `components/nav/SiteShell.tsx` → `nav-config.ts:45`. The spec's "no nav link" finding
  was stale by the time of the build; no new nav wiring was needed.
- `ShowcaseCard`/`ShowcaseOverlay` could **not** be reused unchanged for the seed picker — their
  CTA is recipe-shaped (open a build recipe), which isn't the same interaction as picking a seed
  template. Built a sibling component, `SeedGallery`, instead of extending `ShowcaseCard`.
- Preview capture ran **after** the SEED_DOCS content/slot enrichment pass (`email_cadence_enrichment`),
  per this spec's own "Order of work" sequencing note (enrichment → then capture) — captures reflect
  the enriched templates, not the pre-enrichment placeholders.
- **B4 (the operator-gated landing strip) was not built** — matches §4 item 4 above (explicit
  operator yes required, never obtained); A + B1-B3 shipped without it.

Full source material: `SESSION_LOG.md` 07/09/2026 entries ("feat(showcase): template preview
gallery — filled previews for all 27 layouts" and the following "fence-polish follow-ups" entry).
