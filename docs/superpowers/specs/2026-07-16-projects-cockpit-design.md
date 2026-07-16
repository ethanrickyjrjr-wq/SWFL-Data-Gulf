# Projects hub cockpit redesign

**Date:** 2026-07-16
**Status:** design approved by operator (07/16/2026 session) — ready for implementation plan
**Check:** `projects_cockpit_live_verify`

## Problem

The signed-in home base (`/project`) reads as a leftovers page, not a cockpit
(operator, 07/16/2026, with screenshots):

- Campaign starter cards dominate the top; the user's own projects sit at the
  bottom as flat, unsorted rows.
- The left rail is a fixed 256px; addresses truncate uselessly and a horizontal
  scrollbar leaks into the rail rows.
- Five greyed "coming soon" chips (Open House, Buyer Nurture, Seller/Home Value,
  Past-Client Seasonal, Re-engagement) have no visible label — they read as
  broken buttons.
- The quick-links row duplicates the top nav (Charts and Alerts are top-level
  tabs; Search lives in Explore) while Contacts — just rebuilt — is buried in it.
- Delete is a trash-mode toggle revealing a tiny × per row.
- There is no visible path into the Email or Social tools other than clicking a
  project or a campaign starter, and nothing on the page hints that
  charts-in-email and PDF export exist (both are fully built:
  `lib/email/inject-chart.ts`, `lib/email/templates/charts/`, the lab's
  Download PDF button).

## Goal

One continuous cockpit. The Projects nav tab and any project click land in the
same shell — left project list, Email/Social/Watch/Overview pills on top, a
contextual right panel. The user's projects lead the page, organized by what
they are and where they are. Managing (schedules, contacts, delete) happens on
the hub without leaving it; authoring stays in the tools.

## Decisions locked during brainstorm

1. **Hub body = list + selected-project panel** (master-detail), not a build
   box, not a global-only panel. Approved from three presented options.
2. **One home per project.** A project appears in exactly one section; its
   other facets (scheduled sends, open house, campaign) ride as badges on its
   row. No duplicate rows across sections.
3. **The right panel is contextual per surface** (operator, explicit): on the
   hub it is the project panel ONLY — schedules, campaign starters, contacts,
   open-tool buttons. The email lab keeps its AI build panel (prompt, chart
   types, recipes, examples) untouched. No lab controls (chart-type pills,
   recipe picker) appear on the hub.
4. **Rows, not card tiles**, for the project list — research-backed (see
   Evidence): homogeneous items scan better as a rich list; cards remain the
   right shape for the heterogeneous campaign starters.
5. **Quick-links row dies.** Charts/Alerts/Search are reachable from the top
   nav. Contacts is promoted to a first-class panel block and an empty-state
   step.
6. **Coming-soon chips stop pretending to be buttons** — one muted text line:
   "Coming soon: Open House, Buyer Nurture, Seller/Home Value, Past-Client
   Seasonal, Re-engagement."

## What we're building

### 1. One cockpit chrome, three states

- **In a project** (`/project/[id]/*`): exactly today's tool pages. The grid
  builder, AI panel, and send paths are NOT touched.
- **Hub** (`/project`, has projects): same shell; body is the two-pane cockpit
  (Section 2). Tool pills act on the selected project.
- **Hub, zero projects**: the split collapses to a single centered launchpad
  (Section 6). Tool pills hidden (nothing to act on).

### 2. Hub body — list left, panel right

```
[Email] [Social] [Watch] [Overview]        <- act on selected project
Running now: 2 active sends · next Mon 7:00am   <- slim strip, always visible
+- LISTINGS ------------+------------------------------+
| Cape Coral            | 2006 SW 15th Ave, Cape Coral |
| > 2006 SW 15th Ave    | listing · 33991              |
|   [✉ Mon 7am] [1 built]| ✉ Emails Mon 7am · next 7/20|
| Fort Myers            | 📣 Launch week on Facebook   |
| > 123 Main St         | [Open Email] [Social] [...]  |
| OPEN HOUSES           | Start for this listing:      |
| > ...                 | · New Listing Campaign ->    |
| CAMPAIGNS             | · Socials Launch Week  ->    |
| > Newsletter — SWFL   | 👥 Contacts — 214 people     |
| OTHER                 | [Send to contacts] [Manage ->]|
| > Del Prado Test      |                              |
+-----------------------+------------------------------+
```

- Single click on a row **selects** it (fills the right panel). Navigation
  happens via the panel buttons or the top pills. Most-recently-updated
  project is preselected so the panel is never blank.
- The "Running now" strip preserves the page's management heartbeat (07/03
  control-center ruling) — all active sends, soonest next-send, each line
  linking to its tailor surface — without letting it outrank the projects.
- Mobile: single pane (the grouped list); tapping a row navigates into the
  project (today's behavior). Matches the list-detail collapse contract.

### 3. Grouping — type, then place

Sections, in order:

1. **Listings** — `projects.kind = 'listing'`
2. **Open houses** — `projects.kind = 'showing-prep'`
3. **Campaigns** — `kind = 'general'` WITH an active/paused schedule (standalone
   recurring sends not anchored to a property: newsletter, agent launch). This
   is the "full campaign gets its own header" ask.
4. **Other** — `kind = 'general'`, no schedule (research/notes projects).

Within a section, subgroup by city; the ZIP rides the row/panel, not the
header. City comes from the project's inferred scope
(`inferScopeFromItems` → zip → `cityForZip`/crosswalk; place fallback when no
ZIP). No-scope projects fall to the end of their section under no subheader.
Rows sort by `updated_at` desc within a subgroup.

### 4. Rows, addresses, badges, delete

- **Title display rule** (hub + rail): strip the state/ZIP tail — show
  "2006 SW 15th Ave, Cape Coral", never "…, FL 33991". Full address + ZIP live
  in the panel header. Implemented as one shared helper next to the existing
  address-extraction seam, used by BOTH the hub list and the rail.
- Hub rows never truncate (the pane is wide enough by design). Max badge slots
  per row: schedule chip ("✉ Mon 7am"), built count ("1 built"), open-house
  date when scheduled. Nothing else — over-badging kills scanning.
- **Rail** (in-project pages): width 256px → 288px (`w-64` → `w-72`), same
  grouping headers in condensed form, ellipsis truncation, and fix the
  horizontal-scrollbar leak (min-w-0 on the row link).
- **Delete**: visible kebab (⋯) per row (hub + rail) → menu: Open / Delete.
  Confirm dialog names the project — "Delete 2006 SW 15th Ave, Cape Coral?" —
  with outcome-verb buttons "Delete project" / "Keep project". The trash-mode
  toggle and per-row × are removed.

### 5. Right panel (hub, project selected)

Top to bottom:

1. Header: full title/address, kind chip, city + ZIP.
2. The project's schedules as plain-English chips with next send — click to
   tailor (existing hrefs from the control-center build).
3. Open-tool buttons: **Open Email** (subtitle: "charts, photos, PDF export" —
   the discoverability fix), **Social**, plus kebab for Watch/Overview.
4. Campaign starters scoped to this project (`CampaignQuickStart` already
   accepts `projectId`).
5. **Contacts block**: live people count, Send-to-contacts entry, Manage →
   `/contacts`.

Nothing selected (user deselects): global view — Running Now detail + starters
+ contacts block. Rare state since most-recent is preselected.

### 6. Empty state (zero projects)

Centered launchpad replacing the split:

1. Hero: address input — "Type the address — we set everything up around it"
   → creates a listing project (existing `/api/projects` kind=listing path),
   lands in its Email tool.
2. The four live campaign starters (they already create their own project).
3. "While you're here": contacts import block (count 0 → "Bring your contacts
   in first"), examples strip (existing showcase/examples surface).
4. Coming-soon line per Decision 6.

### 7. What dies

- The quick-links row (`Charts · Search · Buyer-intent alerts · Contacts`) on
  the hub.
- The trash-toggle delete mode in the rail.
- Campaign starters as the page-topping block on the hub (they move into the
  panel + empty state + the existing top-nav New Campaign button).
- COMING_TILES rendered as pill-shaped chips.

## Data + seams (all existing, no new plumbing)

- `projects.kind` is stored (`listing` / `showing-prep` / `general`,
  `app/api/projects/route.ts`) — hub + layout queries add it to their select.
- Scope: `inferScopeFromItems` (`lib/project/derive-name.ts`) — the ONE
  scope-inference root; city via gazetteer crosswalk + `cityForZip`.
- Schedule chips: the fold in `app/project/page.tsx` (email_schedules +
  social_schedules → plain-English chips) moves to a shared lib helper so hub
  page and panel consume the same shape.
- Campaign starters: `components/campaigns/CampaignQuickStart.tsx` with
  `projectId` (panel) and without (empty state).
- Delete: `DELETE /api/projects/[id]` (existing).
- Contacts count: existing contacts table read (same source the picker modal
  uses).
- Last-doc-open behavior (`lastDid` → `openDoc`) unchanged for navigation.

## Out of scope

- The email lab grid, AI panel, social cockpit internals, send/schedule
  plumbing — untouched.
- Building any of the five coming-soon campaigns.
- Rename-in-kebab, drag-reorder, project search changes, mobile panel sheet.
- New data columns or migrations (everything derives from stored fields).

## Evidence (research pass, 07/16/2026, crawl4ai — 11 sources fetched live)

- Homogeneous items belong in a list, not cards; cards suit heterogeneous
  content — nngroup.com/articles/cards-component/ (also: flat low-contrast
  pills read as labels, not buttons — the coming-soon diagnosis).
- List entries: primary attribute bold and not truncated to death, secondary
  attributes in fixed slots, 2–3 badge types max —
  nngroup.com/articles/list-entries/
- List-detail contract: visible selected state, placeholder/empty detail pane,
  collapse to one pane on small screens —
  m3.material.io/foundations/layout/canonical-examples/list-detail
- Flat/alphabetical ordering "must mostly die"; group by inherent logic (kind,
  geography, recency) — nngroup.com/articles/alphabetical-sorting-must-mostly-die/
  + chunking with contrasting headers — nngroup.com/articles/chunking/
- Row actions need a visible signifier (kebab); hover-reveal is an accelerator
  only — nngroup.com/articles/contextual-menus/
- Destructive confirms name the object and use outcome verbs, never Yes/No —
  nngroup.com/articles/confirmation-dialog/
- Mailchimp/HubSpot/Buffer all lead with the user's own content; templates live
  inside the create flow; scheduled/running is per-item status —
  knowledge.hubspot.com/campaigns/create-campaigns,
  mailchimp.com/help/getting-started-with-campaigns/,
  support.buffer.com/article/642-scheduling-posts

Full research notes are local-only (scratchpad), per the crawl4ai file rule.
