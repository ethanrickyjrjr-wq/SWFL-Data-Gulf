# One root for every email-lab entry — blank skeleton, project/address popups, autosave + leave guard

> **Recommended model:** ⚡ Sonnet — keywords: migration, schema



**Date:** 2026-07-06 (operator session 07/05/2026 evening)
**Status:** Approved design — operator ratified the behaviors turn-by-turn; root demand verbatim: "we are hitting all buttons that lead you to this that need it ALL OF THEM. WE NEED A ROOT."

## Problem

Four operator screenshots, one underlying disease: every door into the email lab improvises its own arrival behavior.

1. **Fake-filled landing.** A campaign/Make-this click seeds the canvas with `defaultDoc()` — the "Market Spotlight" demo carrying invented numbers ($485K, 34 DOM, 3.2 mo, hardcoded in `lib/email/doc/default-docs.ts` `DEFAULT_BLOCK_PROPS`). Looks like the product built garbage; invented figures sit one Send away.
2. **Arbitrary project routing.** Signed-in visits to `/email-lab(/grid)` redirect via `labDestination()` → `projects[0]` — whatever project happens to be first. Operator clicked the Latitude 26 showcase and landed in his Rainbow Meadows listing project, where the generic auto-build then produced a "Just Listed" email about the WRONG listing.
3. **Off-screen blank.** The recipe's `[[your listing address]]` placeholder seeds into a 4-line scrolling textarea, scrolled past the highlight. The only cue is small gray text; the operator hit Build and only then got nagged.
4. **No save safety.** No autosave. No leave guard of any kind (`beforeunload` appears nowhere in the codebase). Back button / tab close / any link = silent loss of all work since last explicit Save. Only the canvas-switch toggle has a confirm.

## Goal

One root seam every entry passes through, so a "new build" arrival is always: **blank skeleton → (signed-in) project confirm → address/area popup → Build**, and work in the lab can no longer be silently lost.

## What we're building

### A. THE ROOT — two seams

**A1. One destination builder: `lib/lab-entry/destination.ts`.**
Every button that navigates into the email lab builds its URL here. Absorbs and re-exports the three existing builders (`recipeDestination`, `heroDestination`, `labDestination`) as one API; raw-string `/email-lab...` hrefs in components are migrated to it. `labDestination`'s `projects[0]` pick is DELETED — the destination for a signed-in new-build arrival no longer picks a project at all; the arrival controller asks (A2).

**A2. One arrival controller: `lib/lab-entry/arrival.ts` + `useLabArrival` (client).**
Both lab clients (`app/email-lab/grid/EmailLabGridClient.tsx` and `app/project/[id]/email-lab/ProjectEmailLabClient.tsx`) decide what to show through this single pure-logic module:

- `?did=` (open existing) → load the saved doc. None of the new-build flow.
- `?seed=` (template pick) → the chosen seed. No popups (user explicitly picked a template).
- `?zip=` (map prebuild) → deterministic ZIP seed doc, as today — plus the project confirm (B) when signed in (this door rode the same redirect that silently picked `projects[0]`); no address popup, the ZIP is the subject.
- `?recipe=` → **blank skeleton** (`skeleton-clean-white`, run through `ensureGridLayouts`) + the popup flow (B, C). NEVER `defaultDoc()`, NEVER `luxury-market-report`, NEVER a one-shot generic auto-build.
- Plain open (no params: tool tab, landing CTA) → blank skeleton + directions, or the first-run template gallery where it shows today. Popups only where noted in the door inventory — a tool-tab click inside project X never asks "is this for X?".

The generic `autoGenerate` on-mount build in `ProjectEmailLabClient` is removed for new-build arrivals — it is exactly what produced the wrong-listing email.

### B. Project confirm popup (signed-in new-build arrivals)

Centered popup over the blank canvas: **"Build this in 〈project〉?"** — offered project = current project when already inside one, else most-recently-updated.

- **Yes** → proceed (stay/route there, recipe carried).
- **No** → popup flips to **New Project**: single name field + Save/Cancel. Save → `POST /api/projects` → switch into it, recipe carried via the A1 destination.

Anonymous visitors skip this (no projects exist); the auto-create-project seam (`AutoCreateProject`) stays for the no-projects case.

### C. Address/area popup — replaces the in-textarea `[[blank]]`

When the pending recipe carries a blank, it is collected in a centered popup with ONE editable field, labeled by what the recipe needs (listing address vs area/ZIP), with **Build** and **Cancel**:

- In a project → pre-filled with the address the system already believes: `projects.subject_address`, else inferred from project files/items; unknown → empty.
- Not in a project / new project → empty field.
- Cancel → popup closes; blank canvas + on-canvas directions remain ("Your campaign is loaded — hit Build when ready", re-openable).
- Prompt arrived with the blank already filled (homepage hero: address typed in the bar) → skip the popup, fire the build immediately after the project confirm.

**Address ↔ project reconciliation on Build:**

- Address matches what the project knows → build, no friction.
- Address differs → one confirm: new project named by the address, or keep in current project?
  - **New** → create project titled the address, switch, build there.
  - **Keep** → build here AND the project records the address as an additional known address. A project therefore holds `subject_address` (primary) + additional addresses, all AI-visible — the build feed and assistant see every address the project has touched, enabling later "how do these two relate" work. Next build in that project pre-fills the primary; changing it again re-runs the same confirm.

**Storage:** additional addresses ride the existing `projects.items` jsonb as a new `{ kind: "address", address, added_at }` item (the `projectItemSchema` union gains one member — no migration; items is already the project's knowledge bag and is already read by scope inference/feed).

### D. Save model

- **Saved doc (a deliverable row exists):** silent autosave — debounced ~5 s after the last edit, PATCH to the existing materials endpoint. Plus **flush-on-exit**: on `pagehide` / `visibilitychange→hidden` with unflushed changes, a final save via `fetch(..., { keepalive: true })` (supports PATCH + JSON + cookies; sendBeacon is POST-only). keepalive bodies cap at ~64 KB — oversized docs skip the flush (the 5 s autosave has them covered to within seconds).
- **Never-saved doc:** save-nudge popup after 5 minutes of activity; in-app **Save / Leave without saving / Cancel** dialog on internal navigation; browser-native confirm on close/back via `beforeunload`. Nothing is silently created on exit — a dying tab can't name a project.
- **Guard mechanics (research-verified, see Evidence):** internal App Router navigation guarded with `nextjs-nav-guard` (maintained fork; Next 14–16.2+ incl. our 16.2.9; custom-dialog API `active`/`accept`/`reject` drives our own modal). `beforeunload` listener registered ONLY while dirty-and-unsaved and removed when clean — browsers show only a generic string (custom text impossible), require sticky activation, and Firefox excludes pages with live `beforeunload` handlers from the back/forward cache.
- Tier dial: all of B/C/D routes `"both"` in `lib/email/lab/capabilities.ts` — free and paid get identical entry/safety behavior.

## Door inventory — ALL of them route through the root

Build-me doors (blank skeleton + project confirm + address popup — A+B+C):
1. Homepage hero chips — `components/landing/HeroCampaign.tsx` (`heroDestination`; blank pre-filled → address popup skipped, straight to auto-build after project confirm)
2. /showcase "Make this →" — `components/showcase/CampaignExamples.tsx` (`recipeDestination`)
3. AI pill "Make this →" — `components/briefcase/BriefcasePanel.tsx`
4. Hub campaign quick-start — `components/campaigns/CampaignQuickStart.tsx`
5. In-lab campaign row — `EmailLabGridShell` `handleUseRecipe` (CampaignQuickStart `onUseRecipe`; project confirm = current project)
6. In-lab Examples accordion / ShowcaseOverlay — `handleUseRecipe` (same)
7. Typed-address router — `lib/geo/address-route.ts` (`heroDestination`; like door 1)

Lab-open doors (blank skeleton or gallery + project confirm ONLY because the old redirect auto-picked `projects[0]` — A+B, no address popup):
8. Homepage map ZIP click — `components/landing/Hero.tsx` (raw `/email-lab?zip=`; keeps its deterministic ZIP seed doc, not blank)
9. Landing CTAs — `components/landing/Capabilities.tsx`, `components/landing/DeliverableShowcase.tsx`, `app/page.tsx` (raw `/email-lab`)
10. Signed-in redirects — `app/email-lab/page.tsx`, `app/email-lab/grid/page.tsx` (`labDestination` — projects[0] pick dies), `app/email-lab/AutoCreateProject.tsx`

In-project doors (blank skeleton/gallery, NO popups — you're already in the project you clicked from):
11. Project Build actions Email button — `app/project/[id]/workspace/BuildActions.tsx`
12. Project tool switcher Email tab — `app/project/[id]/ToolSwitcher.tsx`
13. Template rail — `components/project/TemplateRail.tsx` (`?seed=`; explicit template pick)

Open-existing doors (get D only — never the new-campaign flow):
`components/project/MaterialRow.tsx` (`?did=`), `app/project/[id]/workspace/ThisWeek.tsx` (tweak), `app/project/[id]/ProjectWorkspace.tsx` (post-build open), `app/p/[id]/page.tsx` (edit link), `app/project/page.tsx` (schedule resume), `components/email-lab/SendToSelfModal.tsx`, `ScheduleSendModal` returnTo.

A static test pins the inventory: any `/email-lab` href/push outside `lib/lab-entry/` fails the suite (pattern: `capabilities.test.ts` routing pins).

## Evidence (crawl4ai research pass, 07/05/2026)

- MDN `beforeunload`: dialog via `preventDefault()` (+`returnValue` legacy); text is a generic browser string, not customizable; sticky activation required; register only while dirty — Firefox won't bfcache pages with live handlers. (developer.mozilla.org)
- MDN `pagehide`: bfcache-compatible exit hook — the correct trigger for the exit flush; `unload` is discouraged/unreliable. (developer.mozilla.org)
- Stack Overflow 79416970 (Feb 2025): exit sends belong on `pagehide`/`visibilitychange→hidden` with `sendBeacon`/`fetch keepalive`; `beforeunload` is only for the confirm dialog. (stackoverflow.com)
- `nextjs-nav-guard` (br-schneider fork of LayerX `next-navigation-guard`): App Router navigation guarding, explicitly supports Next 14/15/16 incl. 16.2+ (fixed the null `history.state` crash); custom dialog UI via `active`/`accept`/`reject`. Original LayerX package is unmaintained and incompatible with recent Next — use the fork. (github.com/br-schneider/nextjs-nav-guard)
- App Router has no `router.events` — pre-navigation interception requires the library (or the same history-patching it wraps). (nextjs.org docs; SO 77288526)

## Out of scope

- Stripping fake numbers from the template GALLERY previews (they read as templates there; possible follow-up: "sample data" watermark).
- The AI compare/relate features enabled by multi-address projects — this build only persists the addresses and exposes them to the feed.
- Social lab arrival parity (mirror later; this build is the email lab).

## Testing

- `lib/lab-entry/destination.test.ts` — every door shape → URL; no projects[0] anywhere.
- `lib/lab-entry/arrival.test.ts` — param matrix → {doc choice, popup plan, auto-build?}; recipe present never yields `defaultDoc`.
- Address reconciliation state machine — match/differ/new-project/keep paths; `{kind:"address"}` item appended exactly once per new address.
- Autosave — debounce timing, dirty tracking, flush skip >64 KB, beforeunload registered only while dirty.
- Static door pin — grep test over `app/`, `components/`, `lib/` for `/email-lab` strings outside `lib/lab-entry/`.
