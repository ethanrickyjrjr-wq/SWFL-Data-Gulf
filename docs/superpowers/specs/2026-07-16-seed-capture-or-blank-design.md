# Every template click captures its subject or starts blank

**Date:** 2026-07-16
**Check:** `seed_capture_or_blank_live_verify`
**Approach:** A — extend the one arrival controller (operator-approved 07/16/2026)

## Problem

A template chip click (project rail "Just Sold", the in-lab gallery, /showcase start-from
layouts) lands the user on the raw slot-rule skeleton: `openSeed()` is documented "no popups"
and `planArrival`'s seed branch (`lib/lab-entry/arrival.ts:59`) hard-codes it. The user sees
the AI's fill instructions ("The headline number and what it measures") as if they were the
product — no address ask, no AI fill, no build. Operator hit this live 07/16/2026 on
New Project → Just Sold. Every one of the ~28 `SEED_DOCS` chips behaves this way, on all
three seed surfaces.

Meanwhile the recipe/campaign lane already does this right: capture popup on a held
`[[blank]]`, brand-gap fields, auto-build, and brand fields banked to the profile via
PATCH `/api/user/brand` (`EmailLabGridShell.tsx` `buildAfterBrand`). The arc deep link
(`arcStepDestination`) proves seed layout + recipe fill + address already compose.

## Research (RULE 0.4 — crawl4ai, 07/16/2026)

- NN/g "Wizards: Definition and Design Recommendations" (nngroup.com/articles/wizards/):
  single short asks beat multi-step wizards for repeated flows; **shortest path — never ask
  for what the system already knows** (their Mint example); wizards must keep an escape for
  users who want control.
- NN/g "Designing Empty States in Complex Applications" (nngroup.com/articles/
  empty-state-interface-design/): landing users on content-less containers is a documented
  failure mode; an empty state must provide a **direct pathway to the key task**. The raw
  skeleton with slot labels is exactly this anti-pattern when un-chosen.

Both findings map onto the operator's requested shape: capture what's needed OR an explicit
start-blank choice — every click ends in a build or a deliberate blank.

## Goal

Every template click, on every seed surface, ends in one of exactly three outcomes:

1. **Skip-and-build** — the project already knows the template's subject → AI-fill
   immediately, no ask.
2. **Capture-then-build** — one popup asks for the missing subject (+ any brand gaps),
   then AI-fills. Everything entered is SAVED — never asked twice.
3. **Explicit blank** — the user pressed "Start blank instead" (or the gallery's Start
   blank door) → today's raw skeleton, now a chosen outcome instead of a surprise.

## What we're building

### 1. `SeedDoc.subject` — required classification

`lib/email/doc/default-docs.ts`: `SeedDoc` gains a REQUIRED field
`subject: "address" | "area" | "none"`. All ~28 seeds classified in the same commit
(atomic type-lift). Rule: if the right content changes with the subject property, declare
`"address"`; with the market area, `"area"`; pure style/relational layouts declare `"none"`.
Initial classification (plan may adjust at file level, rule may not):

- `address`: just-sold, just-sold-grid, new-listing, listing-feature, open-house,
  price-reduced, skeleton-listing-showcase, listing-digest
- `area`: market-spotlight, market-letter, luxury-market-report, weekly-pulse,
  neighborhood-report, investment-brief, rate-watch, monthly-digest, year-in-review,
  trend-snapshot
- `none`: welcome, minimal, agent-spotlight, skeleton-clean-white, skeleton-dark-pro,
  skeleton-agent-feature, stay-in-touch, editorial-letter, magazine-issue

Compile-time exhaustiveness: the field is non-optional, so an unclassified new template is
a type error, not a silent regression.

### 2. `planArrival` — the seed branch plans like the recipe branch

New `ArrivalInput` fields: `seedSubject: "address" | "area" | "none" | null` (resolved by
the caller from the seed id) and `seedBlankChosen: boolean` (from a `blank=1` URL param /
popup escape). The seed branch decision matrix:

- `seedBlankChosen` → today's behavior verbatim: seed skeleton, no popups.
- subject `"address"` or `"area"`, and the project's known subject answers it
  (`subjectAddress` for address; new `subjectArea` input for area) → seed skeleton doc +
  `autoBuildAfterConfirm: true` (skip-and-build).
- subject `"address"`/`"area"`, no known answer → `addressPopup: true` with the matching
  `inputKind`, popup carries the Start-blank escape.
- subject `"none"` → popup in **fill-or-blank mode**: primary "Fill with AI" (brand + the
  user's region data), secondary "Start blank". Brand gaps still collected here.

`planArrival` stays pure; the full matrix (subject × known-subject × blank-chosen ×
signed-in) lands in `arrival.test.ts` as table tests. No other branch of the controller
changes: did/zip/recipe/plain-open behavior is pinned by the existing tests.

### 3. `AddressPopup` — one new escape, no new component

`components/lab-entry/AddressPopup.tsx` gains an `onStartBlank?: () => void` prop; when
present, a quiet "Start blank instead" action renders under the Build button. The popup
already handles `inputKind: "address" | "area" | null` and brand-gap fields — `null` +
gaps is the existing "brand-only" mode, reused as fill-or-blank mode's chrome. Both lab
clients pass the new handler; choosing it re-plans the arrival with `seedBlankChosen`.

### 4. Persistence — nothing entered is ever asked twice (operator MUST, 07/16/2026)

- **Brand fields** → same seam as the recipe lane: `applyBranding` locally + PATCH
  `/api/user/brand` (signed-in). Signed-out: rides the session (`arrivalBrand`) and the
  existing claim-on-login carry — unchanged split.
- **Captured address** in a project whose `subject_address` is null → PATCH the project's
  `subject_address` in the same submit. The NEXT template click skip-and-builds.
- **Captured area** → new nullable `projects.subject_area` column (operator-approved
  07/16/2026). Idempotent migration run directly per RULE 1; typed-client regen in the
  same commit. Same save-on-capture behavior; areas never re-asked within a project.
- Standalone (no project) captures ride the build only — there is no project to save to;
  the project-confirm flow already offers project attachment on signed-in arrivals.

### 5. Build mechanics — reuse, no new lane

The fill is the arc pattern: the picked seed is the layout; the fill prompt is synthesized
from the seed's name + subject (address/area spliced in). The build runs the existing
build path (`build-doc.ts`) — every number four-lane sourced, no invention; empty slots
that can't fill from a real source stay empty (RULE 0.7: build never refused, gaps fill
from the next lane or stay open slots). Slot-rule labels only ever reach the user's eyes
after an explicit blank choice.

### 6. Surfaces — covered by the one controller

TemplateRail (project), TemplateGallery (in-lab first-run), /showcase start-from layouts
(`seedGalleryDestination`), and any future door: all already route arrivals through
`planArrival`, so no per-surface capture logic. Surface-level changes are cosmetic only:

- TemplateRail: reorder so lifecycle-tail templates (Just Sold) stop leading the rail
  (operator, 07/16/2026); order follows the listing lifecycle then market/relational.
- TemplateGallery's header "Start blank" button keeps its existing meaning (explicit
  blank, `doc: blank`) — it is the third outcome's front door.

## Out of scope

- Per-template bespoke capture forms (beds/baths/price asks) — the subject + brand gaps
  are the only v1 captures; listing facts fill from the lake/web lanes.
- Social surfaces (CampaignQuickStart social lane keeps its own address form).
- The intent line (`onAiMaterial`) — already an AI lane; untouched.
- Anonymous brand persistence beyond the existing claim-on-login carry.

## Testing

- `arrival.test.ts`: full seed decision matrix (table-driven, pure).
- `AddressPopup` escape: renders only with handler; fires `onStartBlank`, never `onBuild`.
- Seed classification: compile-time (required field) + a test asserting every
  `SEED_DOCS` entry's `subject` is one of the three values (guards JSON-ish drift).
- Migration: idempotent `subject_area` add; typed client regenerated (phantom columns are
  compile errors).
- Live-verify (`seed_capture_or_blank_live_verify`, operator-run): New Project →
  Just Sold chip → popup (not skeleton) → address → built email with sourced figures;
  second chip in the same project skip-and-builds; "Start blank instead" lands the
  skeleton; brand field entered once does not re-ask on the next capture.
