# Share-by-link growth loop — workspace share + public-viewer signup CTA

**Date:** 2026-08-03
**Origin:** Operator decree 08/03/2026: "create a collaborate button or share by link so we can get
more people to our site," with Clay's "Share as template" panel (screenshot: toggle → template
link → optional restrict-to-emails) as the reference shape.

## Problem

The public share surface already exists and is invisible. `app/p/[id]/page.tsx` renders any ready
deliverable to a logged-out viewer by link (service-role read; revoked/trashed rows 404; owner-only
controls hidden from strangers; expiring signed upload URLs), and `DeliveryButtons.tsx` already has
native share with copy-link fallback. But nothing upstream in the project workspace surfaces that
link, and a stranger who opens one sees a report with no path to becoming a user. The growth loop
has an engine and no doors.

## Goal

An owner can hand out a deliverable link from the workspace in one click; a non-owner who opens it
sees one clear "build yours" path; signups arriving through shared links are countable. More people
to the site, measured.

## What we're building — three small pieces on the existing surface

### 1. Share affordance in the project workspace

A "Share" button on the deliverable card/lane in `app/project/[id]/workspace/` (alongside the
existing open/delete actions on `DeliverableLanes.tsx` / `DeliverableThumbnail.tsx` — exact anchor
chosen at plan time from the current component shape). Click → copies
`{origin}/p/{deliverable_id}?ref=share` via `navigator.clipboard` with a "Link copied" state
(same pattern as `DeliveryButtons.handleCopy`). Only rendered for `status === "ready"` —
building/revoked deliverables have nothing to share. No new endpoint, no new token: `/p/[id]` IS
the share link (uuid, unguessable, already the public contract).

### 2. Non-owner signup CTA on `/p/[id]`

The page already computes ownership (owner check at `page.tsx:430`). For non-owner viewers
(including logged-out), render one banner: "Built with SWFL Data Gulf — build your own market
report, free" → `/login?ref=share` (or the signup entry the login page prefers). Owners never see
it. One banner, one message, no popup, no timer — the one-grammar-per-page rule
(`feedback_homepage-grammar-not-collage`) applies to this page too. Placement and styling follow
the existing page chrome (one-room rule: reuse, don't invent).

### 3. `ref=share` counting

Shared links carry `?ref=share`. The login/signup flow records it into the existing analytics
lane if one exists at plan time (Vercel analytics event or a column already on the signup path) —
NOT a new attribution system. If no recording seam exists, v1 ships the param anyway (visible in
Vercel's built-in analytics as a distinct landing query) and a proper counter parks as its own
check. Analytics only — `ref` is never trusted for auth, tier, or content decisions.

### Explicitly NOT in v1 (each is its own future brainstorm)

- True collaboration: invites, multiple editors, roles on a project — RLS redesign, big.
- Clay-style restrict-to-specific-emails sharing — needs share tokens + revocation UI; today's
  revoke-the-deliverable already covers "kill the link."
- Share for non-deliverable surfaces (desk views, tables) — nothing public renders them today.
- Public indexing: shared pages stay `noindex` if that's the current `/p` posture; this build does
  not change SEO posture either way (verify at plan time, keep whatever is there).

## Failure modes → guards

1. Private data reaches a stranger → unchanged existing guards (revoked → 404, `deleted_at` → 404,
   signed upload URLs expire); the workspace button only renders for `ready`; test keeps the
   revoked-404 path green.
2. Owner nagged by their own CTA → banner keys off the existing owner check; test: owner render
   has no banner, anon render has exactly one.
3. `ref` abuse (spoofed, injected) → analytics-only by contract; never read for auth/tier/content;
   grep-level test asserts no consumer outside the analytics seam.
4. Share button on a dead deliverable → gated to `ready`; test: building/revoked cards render no
   share action.
5. Clipboard blocked (non-HTTPS/denied) → same silent-fallback pattern `DeliveryButtons` already
   uses; button falls back to showing the URL for manual copy, never a thrown error.
6. CTA copy drifts into system nouns → plain-language copy fixed in the spec ("Built with SWFL
   Data Gulf — build your own market report, free"); voice-guard/no-system-noun conventions apply.

## Testing

`bun:test` component tests for the banner ownership split and the share-button gating;
route/page-level test for revoked-404 unchanged; `bunx next build` verification. Manual live pass:
share a real deliverable from the workspace, open in an incognito window, see the banner, click
through to signup, confirm `ref=share` visible in the landing URL/analytics.

## Live verify (closes `share_growth_loop_live_verify`)

On production: owner copies link from workspace; incognito viewer sees the report + one CTA and no
owner controls; a revoked deliverable's link 404s; the signup click-through lands with `ref=share`.
Evidence pasted into the check close.
