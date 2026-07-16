# HANDOFF — Projects cockpit build REJECTED by operator; fix to ONE unified cockpit

**Date:** 2026-07-16 · **From:** Fable 5 session (built it wrong) · **For:** next session (execute the fix)
**Spec:** `docs/superpowers/specs/2026-07-16-projects-cockpit-design.md` · **Plan:** `docs/superpowers/plans/2026-07-16-projects-cockpit.md`
**Open check:** `projects_cockpit_live_verify` (closes only after operator sees it live post-deploy)

## THE MISS — read this first

The operator wanted ONE cockpit: `/project` (the hub) must be the SAME frame as the
in-project pages (`/project/[id]/email-lab` etc.) — same left rail, same top tool
pills, same right-side panel chrome — with only the CENTER differing (no grid open
on the hub). Operator, verbatim:

- "when i say in cockpit, a projects click brings you here, but in projects (pill
  at top) still have the major pills at top with it...cockpit"
- "projects don't have grid, so it would have your layout"
- "I JUST SAID, PANEL LIKE EMAIL LAB ON RIGHT SIDE AND PROJECTS ON LEFT"
- "DOES A COCKPIT CHANGE THE FUCKING LAYOUT?????"
- "WHY ARE THERE SO MANY FUCKING BUTTONS THAT ARE THE SAME AND WHY DOES IT ALL
  LOOK DIFFERENT"
- "GET RID OF FRONTEND DESIGN AND FIX THIS SHIT"

What the prior session built instead (all local commits on `main`, UNPUSHED):
hid the rail on the hub, invented a NEW two-column body (custom-styled list +
floating panel card) inside a `PageShell width="wide"`, added a LOOKALIKE pills
row (left-aligned, outline-only — nothing like the real ToolSwitcher), and
duplicated the same actions in three places. The hub looks like a different
product from the page one click deeper. That is exactly what the operator said
NOT to do. "Get rid of frontend design" = delete the invented styling; reuse the
existing chrome components verbatim.

## TARGET LAYOUT (hub `/project`, signed in, has projects)

```
[ rail        ][ ToolSwitcher pills — IDENTICAL to in-project: sticky, centered ]
[ same as     ][ center: grouped project list          ][ right aside: SAME     ]
[ every       ][  LISTINGS → city → rows                ][ chrome as email-lab   ]
[ project     ][  OPEN HOUSES / CAMPAIGNS / OTHER       ][ AI panel column:      ]
[ page        ][  running-now line above the list       ][  Start a campaign     ]
[             ][                                        ][  Contacts block       ]
```

- The rail renders on the hub too (it must NEVER disappear between pages).
- The top pills are the REAL ToolSwitcher chrome (`app/project/[id]/ToolSwitcher.tsx`):
  sticky top bar, centered `max-w-2xl`, segmented rounded-full, active tab filled
  gulf-teal. On the hub they act on the SELECTED project (see selection below);
  reuse the component or extract its exact classes — do not restyle.
- The right aside must copy the email-lab AI panel's container chrome (open
  `app/project/[id]/email-lab/ProjectEmailLabClient.tsx` and lift the aside
  column's exact wrapper: width, border-l, bg, section header pattern —
  `CampaignQuickStart variant="panel"` was BUILT for that chrome). Contents on
  the hub: Start-a-campaign section (scoped to selected project when one is
  selected, global otherwise), Contacts block (count + Send to contacts +
  Manage), Running-now list. NOTHING ELSE. No chart types, no recipes — operator
  explicitly banned lab controls here.
- Selection: clicking a row in the CENTER list selects it (panel + pills point at
  it; most-recent preselected). Clicking a rail row navigates into the project
  (unchanged everywhere).

## KILL THE DUPLICATE BUTTONS

One action = one home:
- Email/Social/Watch/Overview live ONLY in the top pills. DELETE the panel's
  "Open Email" / "Social" / "⋯ (Watch/Overview)" button row from
  `app/project/_cockpit/ProjectPanel.tsx` — that was the worst duplication.
- The "charts, photos, PDF export" hint: move to a small caption under the pills
  or drop it — do not keep a second email button for it.
- "Send to contacts →" in the Contacts block may stay (it's contacts-framed),
  but it should go to the SELECTED project's email tool.
- Keep top-right New listing / Showing prep / New project (pre-existing).
- The kebab menu's "Open" item duplicates clicking the row — remove it; the
  kebab should open the delete confirm directly (see bug 2).

## BUGS VISIBLE IN OPERATOR SCREENSHOTS (fix all)

1. **Rail scrollbar overlaps the item counts** (`app/project/ProjectsRail.tsx`)
   — the `overflow-y-auto` list needs scrollbar room (`pr-1.5` on the list or
   `[scrollbar-gutter:stable]`), counts were half-hidden under the scrollbar.
2. **RowMenu popover is clipped** by the rail's `overflow-y-auto` container
   (screenshot shows a broken floating "Open" fragment). Fix: delete the
   intermediate menu in the rail — the ⋯ button opens `ConfirmDeleteProject`
   directly. Same in the center list (menu's only non-dup item is Delete).
   `app/project/_cockpit/RowMenu.tsx` can then be deleted entirely.
3. **Hub pills don't match ToolSwitcher** — replace the lookalike in
   `app/project/_cockpit/ProjectsCockpit.tsx` with the real chrome (above).
4. **Hub body layout invented from scratch** — rebuild per target layout: rail
   visible (remove `if (pathname === "/project") return null;` from
   `ProjectsRail.tsx`), center list, email-lab-chrome aside. Remove
   `PageShell width="wide"` wrapper if it fights the full-bleed cockpit frame —
   match how `/project/[id]` pages structure their full-width body instead.
5. **Center list rows**: keep the grouping (sections → city subheads) and the
   two-line row content, but style rows like the EXISTING app rows (the old hub
   cards / rail rows), not new custom styles.

## WHAT TO KEEP (do not revert — operator liked or never disputed)

- `lib/project/display-title.ts` + test (address → "street, city") — KEEP.
- `lib/project/group-projects.ts` + test (kind → city grouping, one home per
  project) — KEEP.
- `lib/project/schedule-chips.ts` + test (chip fold) — KEEP.
- `app/project/_cockpit/ConfirmDeleteProject.tsx` — KEEP (named project,
  "Delete project"/"Keep project").
- Coming-soon muted line in `components/campaigns/CampaignQuickStart.tsx` — KEEP.
- Quick-links row deletion (Charts/Search/Alerts/Contacts) — KEEP deleted.
- Rail improvements: 288px width, grouped section headers, titles-to-city — KEEP.
- `app/project/_cockpit/EmptyLaunchpad.tsx` (zero-projects state) — KEEP, but
  verify it renders inside the same cockpit shell, not a bare page.
- Contacts count plumbing in `app/project/page.tsx` (`public.contacts`,
  head-count query) — KEEP.

## COMMITS IN THE REJECTED BUILD (all local on `main`, unpushed)

- b94ec02a spec · 9063dfb8 plan · 005c8720 display-title · a66b0634
  schedule-chips lift · 9fed6ac1 group-projects · 4866a686 rail rework ·
  d7333afd panel+launchpad · 9f134a4d hub rewrite · 338d7350 coming-soon line ·
  82c9443f session log ("SHIPPED" — superseded by the correction entry above it)
- Foreign commits from parallel sessions sit between these (5bb58aed, 3a1643ce,
  787fdfe9, …). DO NOT push anything — operator pushes, or explicitly approves
  `node scripts/safe-push.mjs`, and will decide about the foreign carries.

## HOW TO VERIFY

1. `bun test lib/project` (all green today) and `bunx next build` (green today).
   NEVER `npx tsc`.
2. Serve prod build on a FREE port (check owner first —
   `Get-NetTCPConnection -LocalPort <p> -State Listen`; 3199 was owned by an
   old orphan, PID 21808). The 3311 server from the prior session was killed at
   handoff time.
3. `/project` signed-out 307s to `/login?next=%2Fproject` — auth gate sanity.
4. Signed-in visuals: ONLY the operator can log in (email code). The bar:
   navigating `/project` ⇄ `/project/[id]/email-lab` must feel like the same
   room — rail constant, pills constant (position/size/style), right aside
   constant chrome. If any of those jump, it is not done.
5. Operator screenshots to test against are in
   `c:\Users\ethan\OneDrive\Documents\Pictures\Screenshots 1\`
   (115636 = rejected hub, 115555 = rail bugs, 110925 = the in-project cockpit
   the hub must match, 104541 = the original pre-build hub).

## RULES THAT BIND YOU

- Commit per logical step with EXPLICIT paths (`git add <paths>` — never `-A`;
  the index is shared with live parallel sessions; index.lock collisions happen,
  wait and retry, don't delete the lock).
- lint-staged reformats on commit (prettier + eslint); `react-hooks/set-state-in-effect`
  is a hard error — no setState in effects.
- SESSION_LOG.md entry before any push; no push without operator approval.
- If the operator's next words conflict with anything here, the operator wins.
  Ask before inventing a third layout.
