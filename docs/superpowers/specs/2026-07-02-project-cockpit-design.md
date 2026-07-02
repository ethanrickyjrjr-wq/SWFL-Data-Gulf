# Project cockpit — the ready-for-you week

**Date:** 2026-07-02 (rev 2, same day — reframed around the ready-for-you queue after operator
pushback + product research; rev 1 was a navigation-only design)
**Check:** `project_cockpit_live_verify`
**Phase:** 1 (+1.5 flagged) of 3. Phases 2–3 recorded at the bottom, own brainstorms later.

## Why anyone uses this (the reframe)

Nobody wants an email lab. The product promise is: **the work is already done when you
arrive, and it's made of numbers only you can show.** The user opens their project and this
week's email plus a week of posts are already generated from fresh lake data — they approve,
tweak a section, and schedule. Creation is the fallback, not the front door.

### Evidence (crawl4ai, 07/02/2026 — product research pass)

- **The pain, verbatim** (reddit.com/r/realtors, thread "Is posting listing flyers and videos
  on social media actually worth doing?", 04/2026): "I'm spending hours every week on Canva
  making flyers and I keep wondering if I should be spending that time literally anywhere
  else" … "know any tool that automate this? don't see myself in canva every day."
- **Community consensus is anti-canned, pro-hyper-local** (r/realtors, "Where do you all find
  content to share?", top-voted): "Do not use canned content. Create market snapshots,
  community videos, mini-neighborhood reviews … hyper-local content." Data-backed local
  market snapshots are exactly what the lake generates and what template subscriptions
  structurally cannot.
- **Category anchor** (coffeecontracts.com pricing, 07/02/2026): $74/mo, $199/qtr, $740/yr
  for a generic template library + community group — no local data, no sending, no
  automation, 6,000+ agents. Buyers are already skeptical: "is it just nice looking templates
  that don't really do anything?" (same 04/2026 thread).
- **The job is credibility-through-consistency, not virality** (r/realtors, multiple
  threads): "Nobody buys houses on social media … but potential clients look you up and see
  that you are active." So the promise is presence without the hours.
- **Willingness-to-pay headroom:** agents in these threads pay $74/mo for templates, employ
  full-time overseas VAs, or accept a 25% brokerage split partly for done-for-you marketing
  "under one roof."

### The two numbers that judge this product

Instrument from day one: (1) **schedule-all rate** — of users who see a generated week, how
many schedule it; (2) **7-day return rate**. These two events are the verdict on the concept;
everything else is vanity.

## What exists today (probed 07/02/2026; re-probe line-level facts at build kickoff)

- `app/project/layout.tsx` — persistent ProjectsRail (left) + pinned ProjectSearch; AI
  mounts at root. Children swap without remounting (verified against live Next.js docs:
  layouts are cached client-side and do not re-render on navigation).
- `app/project/[id]/ProjectWorkspace.tsx` — MaterialsHub thumbnails, DeliverableLanes
  (schedules), filed-data ItemsBoard, BuildActions, ProjectActionBar (free-form AI).
- `app/project/[id]/email-lab/` — project-scoped block canvas (`EmailLabShell`), brand
  tokens + scope + `?did=` deep links, saves via `/api/projects/[id]/materials`.
- `components/email-lab/EmailLabGridShell.tsx` — the grid canvas (per-section editing;
  "north star" per its own header). Accepts `onSave`/`projectId`/`deliverableId`/`scope` —
  but NOT `initialAiPrompt`/`autoGenerate` (block-shell-only props today). See D2.
- Social: `SocialCalendarPanel` (Generate-Week UI) + `ScheduleSocialModal` +
  `useSocialComposer({ scope, projectId, branding })` over `/api/email-lab/social/*` and
  `/api/email-lab/social-calendar`. Buried inside the email-lab shells; no page of its own.
- Lifecycle data: `data_lake.listing_transitions` ingests daily — coming_soon/active/price
  cuts (`price_delta`)/holding → sold (`sold_price`, `sold_date`). Live today (see
  2026-07-01 lake-wiring spec).
- Auth: `/project/*` login-gated; `/email-lab*` anonymous-accessible (the current
  taste-surface).
- **KNOWN, SAY IT LOUD — the schedulers are paused platform-wide.** Clicking Schedule
  (email OR social) writes a real row with a real `next_run_at`, but the cron blocks in
  `social-scheduler.yml` and `email-scheduler.yml` are commented out pending explicit
  operator go-live. Pre-existing and symmetric; this spec makes those buttons far more
  visible, so it becomes a launch blocker here (see exit criteria).

## Design

### D0 — The ready-for-you queue (the centerpiece)

Opening a project never lands on an empty desk. The Overview's top section is **This Week**:
the week's email and social posts, already generated for the project's scope with fresh lake
data, each card offering Approve & schedule · Tweak (opens the right canvas) · Skip.

Mechanics — promotion, not construction:

- Generation reuses the existing paths: the email side reuses the auto-fill/build path the
  project email lab already runs on mount; the social side reuses Generate-Week
  (`/api/email-lab/social-calendar`).
- **Persistence:** queue items are saved as materials (deliverable rows, draft state) so the
  week survives reload and shows in MaterialsHub like everything else. Build-time probe:
  whether Generate-Week output already persists anywhere; if not, save generated cards
  through the existing materials endpoints. No new table unless the probe proves otherwise.
- Freshness: a week is generated at most once per week per project (regenerate on demand);
  stale queue items refresh their data through the existing refresh path, not by silent
  regeneration of approved copy.
- Failure: generation errors degrade to today's Overview (thumbnails + create rail) with a
  retry chip. Never a blank screen, never a blocking spinner.
- **"Schedule all"** sits at the end of the queue — one action schedules the approved week.
  This is the paywall moment (locked model: builds free, SEND is the paywall). Quota/Stripe
  wiring itself is Phase 2; Phase 1 ships the button against the existing schedule rows.

### D1 — Tool switcher (supporting frame)

Nested layout `app/project/[id]/layout.tsx` with tabs **Overview · Email · Social**:

- `/project/[id]` → Overview (This Week queue + existing workspace content)
- `/project/[id]/email-lab` → Email (existing route, first-class)
- `/project/[id]/social` → Social (new, D3)

Sibling child routes under the cached layouts — rail/AI/switcher never remount. Active-tab
highlight via `usePathname()` in a small client component (layouts can't read pathname —
vendor-doc confirmed). Switcher reads only `[id]` from params, no queries. Mobile: segmented
control, three labels at ~360px. Heights per repo standard (`dvh`/`h-full`, never `h-screen`).

### D2 — Email tool: grid is the default canvas

Per-section AI editing is the editing story of this product ("click a section, ask for
better writing, only that section changes"), so the grid canvas is the **default**, block the
fallback via a toggle, persisted per-project in `ui_state.email_canvas`.

- **Correction folded in (rev-1 review):** `EmailLabGridShell` lacks `initialAiPrompt`/
  `autoGenerate`. Since grid is now the default, add BOTH props to the grid shell,
  mirroring the block shell's contract, in the same task that mounts it project-scoped.
  Narrow change; everything else about the shell is mount-with-props.
- Project-scoped grid wrapper passes what `ProjectEmailLabClient` already passes: `onSave` →
  materials endpoints, brand tokens, scope, `deliverableId`, project photos.
- A material opened via `?did=` opens in the project's preferred canvas. Both shells operate
  on the same `EmailDoc`; the toggle re-renders without converting or rewriting the saved doc.
- **Unsaved-edits rule (correction folded in):** canvases seed edit history independently, so
  toggling with in-flight edits is silent loss today. Toggle triggers an explicit dialog:
  Save & switch (default) · Switch without saving · Cancel. No silent loss, no silent save.

### D3 — Social tool (promotion, not construction)

`app/project/[id]/social/page.tsx` mirrors the email-lab page's load pattern (auth → project
row → brand tokens + inferred scope → client). `ProjectSocialClient` composes existing
pieces as a full page: `useSocialComposer` + `SocialCalendarPanel` (with `onSchedule` wired —
it's optional in the panel precisely for this) + `ScheduleSocialModal` + a card-preview
column ("Load Card" renders the day's `EmailDoc` with project brand; "Edit in Email" saves
it as a material and deep-links to the Email tab).

Scope guard: surface move only. The publish engine (`lib/social/`) and the calendar system
(`lib/email/social-calendar/`) remain two systems; wiring them is the go-live work item, not
this build.

### D4 — Retirement of the standalone labs (signed-in only, this phase)

- Signed-in visits to `/email-lab` or `/email-lab/grid` → redirect to the most-recently-
  updated project's Email tab. **Zero projects (correction folded in): auto-create via
  `POST /api/projects`** (tokenless, saved brand profile applies) — NOT `/api/claim`, which
  is the token-based funnel path and doesn't apply to a tokenless signed-in visit.
- Anonymous visitors keep the standalone labs untouched until Phase 2. No shell code is
  deleted — both shells are now the cockpit's canvases; the standalone pages become thin
  redirect-or-render wrappers.
- Redirect race (project deleted mid-navigation): fall back to `/project`.

### Instrumentation (part of Phase 1, not a follow-up)

Two events, wherever our existing event capture lives (build-time probe; if none fits, a
minimal `product_events` insert): `week_schedule_all` (with counts of approved/skipped) and
project revisit within 7 days of a generated week. These feed the two-numbers verdict.

### Error handling

- Unscoped project: scope falls back region-wide (existing `effectiveScope` behavior). Never
  blocks — grain follows the four-lane rule, any grain held is answerable.
- Generate-Week failure: existing error/retry state, unchanged.
- Queue generation partial failure (email ok, social failed): show what succeeded, retry chip
  for the rest.

### Testing

- Unit: switcher active-state; redirect chooser (recent project / create via `/api/projects` /
  fallback); `ui_state.email_canvas` round-trip; unsaved-toggle dialog paths; queue
  once-per-week guard.
- Existing suites stay green: email-lab social upload/generate, materials endpoints, project
  PATCH.
- Verification: `bunx next build`, then drive the flow — open project → This Week queue
  populated → tweak one grid section in Email → Social tab → schedule one post → Schedule all
  → rows in schedules with correct `next_run_at` → Overview reflects it. Live-verify:
  `project_cockpit_live_verify` (operator-run).

### Phase 1 exit criteria (launch blockers, not code tasks)

1. **Scheduler go-live decision (operator call):** before the cockpit ships, either the cron
   blocks in `email-scheduler.yml` + `social-scheduler.yml` are uncommented (operator
   go-live), or every schedule confirmation states honestly: "Queued — sending activates at
   launch." The queue makes Schedule the headline action; it must not be a silent no-op.
2. Both instrumentation events verified firing in prod.

## Phase 1.5 — the listing lifecycle state machine (next, pre-specced)

The moat feature: a listing project follows the listing's REAL status. `listing_transitions`
(daily ingest, live) drives it: listing goes active → JUST LISTED email + posts draft
themselves into the This Week queue for approval; `price_delta < 0` → price-improvement set;
sold → the closer, with `sold_price`/`sold_date` cited. Held-for-approval always — drafts
appear in the queue, nothing sends itself. No mass-market product at this price reacts to
actual listing status, because they don't hold the data; we already do. Separate brainstorm
+ spec when Phase 1 is verified — the queue (D0) is the delivery surface it needs.

Also 1.5: the return trigger — a weekly "Your week is ready: 1 email, 5 posts, ~5 minutes"
notification to the agent. Depends on scheduler go-live; it IS the retention loop.

## Explicitly OUT of Phase 1

- Publish-engine ⇆ calendar wiring (go-live work item), beyond the exit-criteria honesty rule.
- Research-in-page tool; per-project click analytics; chat-chart building (parked 07/02/2026).
- Anonymous cockpit, quotas, Stripe wiring, homepage showcase (below).

## Recorded for later

**Phase 2 — anonymous cockpit + identity-gated quotas.** Anonymous users get the real
cockpit (localStorage projects, `ImportDraftOnLogin` is the migration seed), capped at X
projects before email signup, more after. Composes with the locked model — caps are identity
gates for lead capture; Stripe appears only at send/schedule. X values are the operator's
call. Standalone labs die completely here. Needs its own research pass (abuse, storage
limits). Note from this pass: r/realtors bans product promotion — organic community channels
are closed to us, which raises the value of the anonymous taste-surface + homepage proof.

**Phase 3 — homepage showcase.** Real AI-built deliverables as the homepage lead + a
words→product loop (capture or live replay). Doubles as concept validation: signup rate off
that loop tests the pitch before deeper build. Needs a capture-tooling research pass.
