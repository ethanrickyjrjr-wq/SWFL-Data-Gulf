# Lane E — conversion furniture (send meter, template gallery, typo-guard)

**Date:** 2026-07-03
**Status:** DESIGNED — awaiting operator spec review before implementation plan.
**Parent:** `2026-07-02-commercial-spine-design.md` (Lane E brief). Independent of D1/D2/D3 decisions.
**Check:** `conversion_furniture_live_verify`
**Research basis (crawl4ai, 07/03/2026):** github.com/mailcheck/mailcheck (typo-suggestion algorithm: string-distance domain/SLD/TLD matching, suggest-don't-block callback shape); nngroup.com/articles/empty-state-interface-design/ (empty states = accurate status + in-context pathway to the key task; beats forced tutorials). Two further sources 404'd (appcues, userpilot, baymard URLs) — meter pattern instead anchored on the commercial-spine spec's own crawled comps (beehiiv usage meters) and our shipped `app/billing/page.tsx` meter card.

## Problem

Three conversion gaps around the project surfaces:

1. **No send-ceiling visibility.** `checkUsageLimit` (`lib/email/usage.ts`) gates sends server-side, but a user never sees their meter until the billing page. Free users hit the 50-send wall blind — the upgrade moment has no furniture.
2. **Blank first run.** Opening a project's Email tool with nothing built lands on a near-blank default doc. The 26 `SEED_DOCS` templates exist (`lib/email/doc/default-docs.ts`, `?seed=` wire already in `app/project/[id]/email-lab/page.tsx`) but surface only as text chips on the Overview tab (`components/project/TemplateRail.tsx`).
3. **Email typos pass silently.** `type=email` accepts `foo@gmail.cm` (`.cm` is a real TLD); Supabase reports "queued", the code never arrives, the signup dies. No typo logic exists anywhere in the repo (probed 07/03/2026).

**Already shipped — NOT in this lane:** sign-out + login front door. `components/nav/SiteShell.tsx` carries a shared `signOut()` (4 mounts, desktop + mobile, both nav variants) and a Log In button opening `LoginModal`. The Lane E brief's "sign-out" item is closed by prior work; the 2026-06-10 memory claiming it missing is stale.

**Parallel-session boundary (probed 07/03/2026):** the projects-control-center session owns `app/project/page.tsx`, `components/briefcase/BriefcasePanel.tsx`, `lib/email/schedule-cadence.ts` (repolith claims). This lane touches none of them.

## Goal

The send ceiling is visible where sends live (projects rail + send moments) with an upgrade path at 80%; a fresh project's Email tool opens on a pick-a-template gallery instead of a blank canvas; a typo'd login email gets a one-click "did you mean" fix. No new tables, no new gates, no `--- OUTPUT ---` shape changes.

## What we're building

### 1 — Send-ceiling meter

**Data path (chosen: client-fetch API; rejected: server-render in the shared project layout — extra DB read on every navigation and a shared file other sessions touch):**

- **New `app/api/email/usage/route.ts`** — GET, `runtime nodejs`, cookie-auth via `createClient(await cookies())`; 401 when unauthenticated; returns `checkUsageLimit(user.id)` verbatim: `{allowed, tier, sent, limit}`. No new shape invented; fail-open semantics ride along from `checkUsageLimit`.
- **New `components/email/SendCeilingMeter.tsx`** (`"use client"`, self-fetching on mount, fail-quiet: loading/error/401 renders nothing — conversion furniture must never break a send surface). Two variants:
  - `variant="rail"` — compact block pinned at the bottom of `ProjectsRail` (desktop-only nav, visible across the whole projects area): `"12 of 50 sends this month · Free"` + 1.5px progress bar. Bar color: teal < 80%, amber ≥ 80%, red at 100%. From 80% an "Upgrade" link → `/billing` appears.
  - `variant="panel"` — the billing-page meter-card style (`app/billing/page.tsx:46-63` is the visual reference), mounted at send moments: `components/email-lab/ScheduleSendModal.tsx` and the send/blast confirm surfaces (`app/project/[id]/workspace/ThisWeek.tsx`, `app/p/[id]/SendToContactsHandle.tsx` — exact mount points pinned in the plan).
- Copy carries no system nouns, no tier jargon beyond the plan name.

### 2 — First-run template gallery (Email-tool empty state)

- **Server** (`app/project/[id]/email-lab/page.tsx`): add a cheap count read of `deliverables` for the project (`template = 'block-canvas'`); pass `hasDeliverables: boolean` to `ProjectEmailLabClient`.
- **Client** (`ProjectEmailLabClient.tsx`): when `initialDoc` is null AND `!hasDeliverables` AND not dismissed this mount → render **`components/email-lab/TemplateGallery.tsx`** (new) full-pane instead of the canvas.
  - Cards render **live scaled-down previews** of `SEED_DOCS`: reuse the canvas block renderer read-only inside a CSS `transform: scale(~0.35)` frame, `pointer-events-none`, lazy-mounted via IntersectionObserver so 26 cards never render at once. Curated featured group (~8) first, "All templates" below. (Rejected: static screenshot thumbnails — rot every time a seed changes; live render can't drift. Rejected: forced modal/tour — NN/g.)
  - Click a card → `seedById(id).build()` client-side → canvas seeds in place (same fresh-block-id guarantee as the `?seed=` path). **"Start blank"** stays one click (→ `defaultDoc()`).
  - Once any block-canvas deliverable exists the gallery never reappears; dismissal also never persists anything — it's pure UI state.
- `TemplateRail` text chips stay as-is (operator chose empty-state-only).

### 3 — Email typo-guard

**Chosen: own pure helper implementing the Mailcheck approach. Rejected: `mailcheck` npm dependency — jQuery-era, unmaintained; the algorithm is the value, not the package.**

- **New `lib/email/typo-suggest.ts`** (pure, no DB): `suggestEmailFix(email: string): { full: string; domain: string } | null`.
  - Damerau-Levenshtein distance ≤ 2 against a popular-domain list (gmail.com, yahoo.com, hotmail.com, outlook.com, icloud.com, aol.com, comcast.net, att.net, live.com, msn.com, me.com, proton.me, protonmail.com — final list in the plan).
  - Independent SLD/TLD correction per Mailcheck: `gmail.cm` → gmail.com (TLD), `gmial.com` → gmail.com (SLD), `hotmail.cmo` → hotmail.com.
  - Exact domain match → null (never nag a correct address). Distance 0 on both parts → null.
- **New `lib/email/typo-suggest.test.ts`** (bun:test): the three fix classes, exact-match null, empty/garbage input null, no-false-positive cases (e.g. real domains like `gmail.co.uk`-style are not "corrected" — threshold + exact-list guard).
- **Wire into `app/login/login-form.tsx`**: on email-step submit, if `suggestEmailFix` returns a suggestion, show a one-time amber line under the field — "Did you mean **you@gmail.com**?" with "Use it" (applies + proceeds) and "No, keep mine" (proceeds as typed). Suggest-don't-block: the send is never prevented; a second submit with the same value passes straight through.
- Weekly-read capture and contacts import adopt the same helper in their own lanes later (Lane D holds those file claims today).

## Out of scope

`app/project/page.tsx` and anything the control-center session claims; Stripe mechanics (Lane A); weekly-read surfaces (Lane D); sign-out (already shipped); persisting gallery dismissal; meter enforcement changes (the gate stays exactly `checkUsageLimit` server-side).

## Verification

- `bunx next build` green (the Vercel-parity bar); `bun test lib/email/typo-suggest.test.ts` green.
- Live (operator, closes `conversion_furniture_live_verify`):
  1. Projects rail shows the real meter; send modal shows the panel meter; counts match `/billing`.
  2. Fresh project → Email tool opens on the gallery; picking a seed lands the canvas; project with a built deliverable never sees it.
  3. Login with `you@gmail.cm` → suggestion line appears; "Use it" fixes; a correct address never shows it.
