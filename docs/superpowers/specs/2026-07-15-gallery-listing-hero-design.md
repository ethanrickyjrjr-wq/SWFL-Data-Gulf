# Pick a Starting Point: gallery-first routing + Listing Campaign hero

**Date:** 2026-07-15
**Check:** `gallery_listing_hero_live_verify`

## Problem

Two things, discovered by tracing the nav "New Campaign" button end to end
(`components/nav/SiteShell.tsx` → `lib/lab-entry/destination.ts:signedInLabArrival` →
`/email-lab/grid` → `app/email-lab/grid/EmailLabGridClient.tsx`):

1. **Routing.** For a signed-in user with a project, "New Campaign" renders a live blank grid
   canvas with a "Continue in ⟨project⟩? / New project" popup stacked on top of it
   (`ProjectConfirmPopup`) — never the "Pick a starting point" gallery. That gallery
   (`components/email-lab/TemplateGallery.tsx`) only ever renders once a user is already inside a
   specific project's Email tab with zero deliverables built (`firstRunGalleryEligible` in
   `lib/lab-entry/arrival.ts`, hardcoded `false` on the standalone grid client). So "New Campaign"
   and "Pick a starting point" are currently two disconnected surfaces.
2. **The Listing Campaign hero is a pill, gated on an address that doesn't exist yet.** Today it's
   a thin bar rendered ABOVE the gallery (`app/project/[id]/email-lab/ProjectEmailLabClient.tsx`
   lines 446-464), visible only when the project already has `subjectAddress` set. The operator's
   own framing — "Type in the address, create the teaser with us" — makes clear this section is
   meant to CAPTURE the address, not wait for one to already exist. Gating it behind an address
   makes it invisible on the exact page the fixed nav button now lands on (a fresh project has no
   address yet).

## Operator decisions (this brainstorm, 2026-07-15)

1. **Which door:** the nav's "New Campaign" button (`SiteShell.tsx`), confirmed directly.
2. **Returning-user routing:** "New Campaign" always shows the gallery — no blocking
   confirm-first popup. Resolved for the LISTING path specifically by never needing a
   pre-existing project at all (see below); resolved for every OTHER gallery card by a visible,
   non-silent "Building into: ⟨project⟩ · Change" indicator instead of a blocking modal.

## Design

### 1. Routing — `/email-lab/grid` renders the gallery on a plain-open arrival

`signedInLabArrival()` still resolves to `/email-lab/grid` — no URL/contract change, the locked
`destination.test.ts` (`signedInLabArrival ALWAYS lands on /email-lab/grid — never picks a
project`) stays green untouched. What changes is what that route RENDERS.

- `EmailLabGridClient` passes `firstRunGalleryEligible: true` into `planArrival` for the
  plain-open case (no recipe/zip/seed/did) when signed in. Anonymous visitors are unchanged (out
  of scope — different taste-surface flow, `EMAIL_LAB_LANDING`).
- When `plan.doc.kind === "gallery"`, render `TemplateGallery` instead of `EmailLabGridShell`
  (mirrors `ProjectEmailLabClient`'s existing `showGallery ? <TemplateGallery/> : <Shell/>`
  pattern exactly).
- The gallery header shows **"Building into: ⟨offeredProject.title⟩ · Change"** when
  `offeredProject` is present. "Change" opens the existing `ProjectConfirmPopup` on demand (not
  auto-opened) — reused as-is, just triggered later. Picking any NON-listing template card
  (`SeedCard.onPick`) then hard-navigates via the existing `openSeed(projectId, seedId)` builder
  into whichever project is currently selected. Nothing auto-builds before that explicit click, so
  there is no silent-wrong-project risk — the destination project is always on screen before the
  commit.
- Zero-project users never reach this code path today (`app/email-lab/grid/page.tsx` already
  routes them through `AutoCreateProject` first) — unaffected.

### 2. The Listing Campaign hero — un-gated, address-capturing, not a pill

Always renders as the FIRST section of the gallery (both the standalone `/email-lab/grid` gallery
render and the in-project `TemplateGallery`), above "Listing & event". New component
`components/email-lab/ListingCampaignHero.tsx`, three states:

- **No address yet** (standalone grid-gallery, or an in-project gallery for a non-listing
  project): headline + copy + an address field (reuses `AddressPopup`, `inputKind: "address"`,
  triggered on submit rather than always-open — no new modal component). Submitting calls a new
  shared helper that POSTs `/api/projects` with `{ title: address, kind: "listing",
  subject_address: address }` (mirrors the existing inline logic in `AutoCreateProject.tsx` and
  `EmailLabGridClient.createAndEnter` — this makes a third caller, so it's extracted into
  `lib/lab-entry/create-listing-project.ts` now) and hard-navigates into
  `/project/[id]/email-lab`. That project has `subjectAddress` set, so it re-renders the gallery
  in the next state.
- **Address known, arc not armed** (today's exact screenshot case): collapses to "Start the
  listing campaign for ⟨address⟩", wired to the EXISTING `armArc()` in `ProjectEmailLabClient` —
  unchanged behavior, just relocated and re-skinned.
- **Armed:** `ArcStrip` already fully replaces this surface once `sequence` is non-null — no
  change there.

**Content** (tightened from the operator's draft, no invented capabilities, no system nouns):

- Kicker "Listing campaigns" · Headline **"From Teaser to Sold."**
- One paragraph: one address in, five milestone pieces out — Coming Soon, New Listing, Comps,
  Under Contract, Sold — fired when ready, every number sourced.
- Real listing status changes (price cuts, back-on-market) nudge you when it's time to send the
  next piece — the actual live nudge system (`ArcNudgeChip`), not invented.
- **A real click on any piece now alerts you directly** — shipped 2026-07-15
  (`docs/superpowers/specs/2026-07-15-campaign-click-alerts-design.md`,
  `app/api/webhooks/resend/route.ts`): a recipient clicking a link in a milestone email sends a
  real email straight to your inbox. This line was blocked pending that build; it is now honest.
- Any open house or showing email is one prompt away in the same builder (real — the "Open House
  Invite" seed template already exists in the Listing & event group, and any recipe is one AI
  prompt away).
- Footnote: social scheduling is coming soon — the same campaign can already be built as
  ready-to-post social creative today. Text only, no dead link (the social surface is fragmented
  per prior memory — `project_social-two-systems-engine-vs-lab`).
- **Visual:** the five real captured thumbnails from the `listing-to-close` showcase
  (`public/showcase/listing-to-close/step-1.webp` … `step-5.webp`) as a labeled filmstrip, sourced
  from the EXISTING `SHOWCASES` registry entry (`lib/showcase/registry.ts`, id
  `listing-to-close`) — not hardcoded a second time. Five fixed milestone thumbnails only, never
  one per possible email variant.

### 3. Plumbing

- `TemplateGallery` gets an optional `heroSlot?: React.ReactNode` prop — stays decoupled from
  listing specifics, matches its existing "just render what I'm handed" shape.
- New `components/email-lab/ListingCampaignHero.tsx` — owns all three states + the filmstrip.
- New `lib/lab-entry/create-listing-project.ts` — the shared "create a listing project from a
  typed address and navigate in" helper (third caller justifies extraction; see Problem).
- `ProjectEmailLabClient.tsx`: delete the standalone pill block (lines 446-464); pass
  `heroSlot={<ListingCampaignHero .../>}` into `<TemplateGallery/>` instead.
- `EmailLabGridClient.tsx`: add the gallery-first branch, the "Building into / Change" line, and
  the same `heroSlot` (address-capture state only — this client never carries a pre-existing
  `subjectAddress`).
- `lib/lab-entry/arrival.ts`: no signature change — `firstRunGalleryEligible` is already a caller-
  supplied boolean; only the caller (`EmailLabGridClient`) changes what it passes.

## Out of scope for this build

- Anonymous visitors' `/email-lab/grid` behavior (different taste-surface flow, unrelated to the
  "New Campaign" nav button which only renders for signed-in users).
- A full project-switcher UI for the "Change" link beyond the existing `ProjectConfirmPopup`
  (Continue-in-X / New-project) — no new picker component.
- `/alerts` or a project "Watch" tab surfacing click events — that's the click-alerts spec's own
  deferred item, not this one's to solve.
- Any change to `armArc()`'s audience-picker (`window.prompt`) — flagged in existing code as a
  known v1 shortcut, not this build's scope.
