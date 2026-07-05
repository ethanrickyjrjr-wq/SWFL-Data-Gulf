# Account dropdown + route-modal brand/schedule editors

**Date:** 2026-07-05
**Check:** `account_quick_access_live_verify`
**Related (independent):** `2026-07-05-unify-contact-stores-design.md` — that build fixes what the
Contacts page writes to; this build fixes where account-level surfaces are reached from. Neither blocks
the other.

## Problem

The account dropdown (top-right, `components/nav/SiteShell.tsx` AppBar + its mobile twin) holds only
My Projects · Contacts · Billing · Sign out. The things a user has to reach quickly to update and save
have no front door:

- **Brand** has an account-level store (`user_brand_profiles`, `GET/PUT /api/user/brand`) but is only
  editable inside a project workspace (Brand pill popover → `BrandingBlock`) or the email-lab shells.
- **Email schedules** (`email_schedules`) have NO account-level surface at all — rows render per-project
  (DeliverableLanes) and a slice on `/project`; there is no "everything I have scheduled" view.
- `/settings/mls` and `/settings/mcp` exist but are unreachable from any nav.
- Navigating to any of these mid-build is a full page navigation — in-progress lab/workspace work is lost.
  The only unsaved-work protection anywhere is the lab canvas's local unsaved-switch dialog.

## Evidence (RULE 0.4 — crawl4ai, live docs, 07/05/2026)

- **Next.js parallel routes (`@modal` slot) + intercepting routes** (nextjs.org
  file-conventions/parallel-routes + intercepting-routes, Next 16 docs): the official modal pattern.
  Verbatim properties: modal content shareable through a URL; context preserved on refresh (full page
  renders instead of the modal); back closes the modal; forward reopens it. During **soft navigation**
  Next.js partial-renders the slot **while maintaining the other slots' active subpages** — the page
  underneath stays mounted with its state. Intercepting convention: `(.)` matches same-level segments;
  `@slot` folders are NOT segments. Unmatched slots on hard nav render `default.js` (else 404).
- **NN/g utility navigation** (nngroup.com/articles/utility-navigation): top-right is where users look
  for account tools; secondary placement is right as long as it follows convention.

## Decisions (operator-approved 2026-07-05)

1. **Route-modals** (not plain overlay state, not plain pages) — the only option that is deep-linkable,
   survives refresh as a real page, and never unmounts the page underneath.
2. **Schedules v1 = full edit** (cadence, day, hour, audience, template) + pause/resume/stop. Create
   stays in the project/lab flow (needs project + deliverable context).
3. **Dropdown adds:** Brand, Email Schedule, Alerts, MLS Settings. A settings hub folding MCP in is a
   follow-up if the menu gets heavy.
4. **Brand reveal on pages that already have a brand editor = open + scroll + glow**, never a second
   editor over an editor, never physically reordering panels.

## What we're building

### 1. Account menu — one tested root

- Extract the account-menu items from the hardcoded JSX in `SiteShell.tsx` into `ACCOUNT_MENU` in
  `components/nav/nav-config.ts` (pure data, like `NAV_GROUPS`); desktop dropdown + mobile menu both
  render from it. Extend `nav-config.test.ts` to pin its shape in the SAME commit (hook-enforced).
- Final menu: My Projects · Brand · Contacts · Email Schedule · Alerts · MLS Settings · Billing · Sign out.
  Alerts → `/alerts`, MLS Settings → `/settings/mls` (existing pages, plain links).

### 2. Route-modal infrastructure

- Root layout (`app/layout.tsx`) gains an `@accountModal` slot rendered next to `{children}`;
  `app/@accountModal/default.tsx` returns null.
- Intercepted routes: `app/@accountModal/(.)account/brand/page.tsx` and
  `app/@accountModal/(.)account/schedules/page.tsx`. Real pages: `app/account/brand/page.tsx`,
  `app/account/schedules/page.tsx` (auth-gated server pages — redirect to `/login` when signed out,
  same pattern as `/project`).
- Shared `AccountModalShell` client component: dark overlay matching the existing dropdown styling
  (navy-dark, `border-white/10`, rounded-xl), close on Escape/backdrop/X via `router.back()`.
  `h-full`-safe scroll region inside (never `h-screen`).

### 3. Brand editor — zero new form code

- `/account/brand` mounts the existing `BrandingBlock` bound to `GET /api/user/brand` on load and
  `PUT /api/user/brand` on save — global save only (no project context, so no save-target ambiguity).
  Palettes ride along exactly as in the workspace popover.
- Propagation is already structural (`lib/email/templates/resolve-brand.ts`: project branding wins,
  account brand is the fallback) — a global save updates every deliverable surface except projects that
  deliberately carry their own override. The modal states this in one line of helper text.

### 4. Brand reveal — local claim, global fallback

- New tiny module `lib/brand/reveal-brand-panel.ts`: a module-level handler registry.
  `registerBrandPanel(handler): unregister` + `revealBrandPanel(): boolean` (calls the newest
  registered handler; returns whether anyone claimed it).
- Surfaces that already carry a brand editor register on mount: `ProjectWorkspace` (opens the Brand
  pill popover), `EmailLabShell` / `EmailLabGridShell` (open their brand accordion). Handler behavior:
  open the panel, `scrollIntoView({ behavior: "smooth", block: "start" })`, add a ~1s highlight pulse
  class so the eye lands on it.
- The dropdown's Brand item calls `revealBrandPanel()` first; unclaimed → `router.push("/account/brand")`
  (the route-modal). Claimed → the page's own editor opens in place; no navigation.
- `/email-lab/grid` is chrome-free (no SiteShell → no dropdown), so its registration only matters if a
  future in-grid menu calls the same registry — free forward-compat, no work now.

### 5. Email Schedule editor (full edit)

- `/account/schedules` server page: all `email_schedules` for the user with a `projects` name join,
  grouped by project, ordered by `next_run_at`. Columns per row: cadence, day, send hour (ET), audience,
  template, status, last/next run.
- Row actions: pause / resume / stop; edit form for cadence + day_of_week/day_of_month + send_hour_et +
  audience_slug + template_id.
- Writes go through a new thin structured endpoint `PATCH /api/email/schedules/[id]` that reuses the
  EXISTING validated write core (`validateToolInput` + `writeAction` in `lib/email/schedule-command.ts`),
  mapping form payloads onto the same actions the NL lane writes (`pause`, `stop`, `change-cadence`,
  `change-audience`, `change-template`). **Resume does not exist in the core today** (verified 07/05/2026:
  no `resume` case in `lib/email/schedule-command.ts`) — add it there (status → `active`, recompute
  `next_run_at`) so both lanes gain it. No model call, no proposal nonce (that lane exists to
  bind NL proposals; a direct form submit IS the confirmation). Auth + ownership scoping identical to
  the command route (user's project via RLS-backed check).
- "+ New schedule" links into the owning project's flow — creation is out of scope here.

### 6. Out of scope

- A `/settings` hub page folding MLS + MCP into one surface (follow-up if the menu gets heavy).
- Schedule creation from the account surface.
- Any change to the Contacts page (separate build, `2026-07-05-unify-contact-stores-design.md`).
- Surfacing the dropdown inside `/email-lab/grid` (accepted gap; grid has its own brand panel).

## Testing

- `nav-config.test.ts` extended for `ACCOUNT_MENU` (same-commit rule).
- Unit: `reveal-brand-panel` registry (claim / fallback / unregister on unmount); PATCH route mapping
  form payloads → `writeAction` actions (ownership rejection, invalid cadence rejection).
- `bunx next build` as the type gate (never bare tsc).
- Live verify (operator-run, closes `account_quick_access_live_verify`): from a mid-edit lab page, open
  Brand from the dropdown → the LOCAL accordion opens + scrolls + pulses and canvas state is intact; from
  `/charts`, Brand opens the route-modal over the page, save lands in `user_brand_profiles`, and a fresh
  deliverable reflects it; edit a schedule's send hour from `/account/schedules` and the row's
  `next_run_at` moves; refresh on `/account/brand` renders the full page, back returns to the prior page.
