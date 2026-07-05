# HANDOFF — Hero follow-ups: three small gaps builds 1/2 deliberately deferred

Three bounded items, one session. All live code — verify each against current files before editing
(parallel sessions move fast here). Register ONE build for the trio:
`node scripts/new-build.mjs hero-followups "<label>"` (brainstorm can be brief — these are
gap-closures inside an approved design, not new behavior; confirm scope with the operator first).

## 1. Signed-in hero arrivals lose the address

The hero passes `addr=` (address spine) and the ANONYMOUS grid threads it into scope
(`app/email-lab/grid/page.tsx` → `EmailLabGridClient` → shell scope). The SIGNED-IN branch redirects
through `labDestination` (`lib/project/lab-redirect.ts`) and `AutoCreateProject`
(`app/email-lab/AutoCreateProject.tsx` + grid variant) which thread `zip`/`recipe`/`recipeNeeds` —
but NOT `addr`. Result: a logged-in agent typing an address on the homepage gets the ZIP scope but
their new project never receives `subject_address`, so the comp spine goes dark for exactly the
users who can schedule.

Fix shape: thread `addr` through `labDestination` + both AutoCreateProject paths; when the flow
creates a listing project, write it to `projects.subject_address` (the column exists — see
`app/api/projects/route.ts` create path); when it lands in an existing project's email tab, carry it
as `?addr=` → scope (the tab already builds scope with `address` — see
`app/project/[id]/email-lab/page.tsx`). Test at the `labDestination` unit level (it's pure).

## 2. Market Update chip → one click from the recurring schedule

The parent spec (`2026-07-05-agent-first-homepage-design.md`, chip-driven placeholder section) says
Market Update + a typed city is "deliberately one click from the recurring newsletter schedule."
Nothing implements the nudge. The pieces exist: the newsletter campaign's `market-pulse` seed recipe
already flows, and the schedule surface exists in the lab; `campaignFollowUpForPrompt`
(`lib/campaigns.ts`) is the established pattern for a post-build follow-up chip. Design the smallest
honest version: after a Market Update hero-flow build completes, surface the existing schedule
action pre-filled monthly — do NOT build a new scheduling UI.

## 3. Social chip surface decision (currently: chips open the email lab only)

The parent spec's open question. The social lab is login-gated (no anonymous composer —
`app/social-lab/page.tsx`), and social campaigns create a listing project + deep-link
(`components/campaigns/CampaignQuickStart.tsx` pattern, `lib/showcase/recipe.ts:recipeDestination`).
Options to present to the operator (do not decide unilaterally): (a) keep chips email-only until the
sequences build; (b) add a small "also make the socials" affordance on the post-build screen for
signed-in users. Note: two social systems exist — `lib/social/` (publishing) vs
`lib/email/social-calendar/` (generation); read the memory/README notes before touching either.

## Landmines

- The grid shell (`components/email-lab/EmailLabGridShell.tsx`) is the crown jewel and heavily
  parallel-edited — smallest possible diffs, check dirty state first.
- Never gate a build on login; builds stay free, send is the paywall.
- Hero copy rules: no "AI" in the hero, "every number sourced" stays.

## Definition of done

- Item 1: signed-in hero flow proven to land `subject_address` on the project (unit tests +
  `bunx next build` green; live proof is the operator's).
- Item 2: post-build schedule nudge for the Market Update path, reusing existing schedule machinery.
- Item 3: a decision recorded with the operator + at most the small affordance, never a new surface.
- SESSION_LOG entry; STOP before push.
