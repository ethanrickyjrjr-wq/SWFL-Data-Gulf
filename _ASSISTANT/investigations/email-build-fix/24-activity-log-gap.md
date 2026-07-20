# Lane 24 — why project_activity/project_events/project_feed empty for real projects

Investigation only. No writes, no browser, no git. Read code + grep.

## Step 1 — identify the three tables' actual purposes (grep whole repo)

`Grep "project_activity|project_events|project_feed"` → 58 files. Narrowed to the lib/ homes:

- `lib/project/activity.ts` — project_activity. Header comment literally says: "the AI reads
  recentActivity() to build its state document. One table, one source of truth — the AI is never
  out of sync with what the user has done." THIS is the intended audit-trail table for the
  incident (what happened to a project: rename, branding, item filed, build, send).
- `lib/project/event-insert.ts` — project_events. Header: "cooldown check, 48-hour notify batching"
  for **Property Watch / CRE market signals** (nearby_new_listing, nearby_sale, permit_filed,
  opening, etc.) — an EXTERNAL-events log, not an agent/user-action log. Different concept.
- `lib/project/feed.ts` — project_feed. `writeFeed()` — used by the daily watch-scan cron
  (`scripts/project-feed/watch-scan.mts`) to post market-signal notifications. Also not an
  agent-action audit trail.

So project_events and project_feed being empty for a project that never had Property Watch enabled
/ whose cron hasn't found a nearby signal is NOT necessarily a bug — it's a different subsystem.
**project_activity is the one that should have logged tonight's incident and didn't.**

## Step 2 — who calls logActivity (the project_activity writer)?

`Grep "logActivity\("` across app/api → exactly 6 call sites, all in non-test code:
- app/api/projects/route.ts:72 (project_created)
- app/api/projects/[id]/route.ts:134,153,171 (project_renamed / scope_changed / branding_changed / item_filed)
- app/api/user/brand/route.ts:222 (branding_changed)
- app/api/deliverables/[id]/blast/route.ts:544 (email_sent)
- app/api/lab/claim-and-send/route.ts:97
- app/api/projects/[id]/refresh/route.ts:89 (item_refreshed)

**app/api/email-lab/ai/route.ts — the AI-build endpoint the incident is about — has ZERO
references to logActivity, project_activity, project_events, or project_feed.** Confirmed via
direct grep on the file (no matches). None of the other Email Lab routes
(layout/render/social/media/save-photo/resolve-social) call it either — the entire Email Lab
surface is unwired to project_activity. So tonight's "Build the email" click could never have
produced an activity row, full stop — the write path doesn't exist yet.

Also notable: `ActivityType` enum in lib/project/activity.ts defines `"deliverable_built"` and
`"metric_moved"` — grepped for `type: "deliverable_built"` and `type: "metric_moved"` literal
usages anywhere in the repo → **zero matches**. These are dead enum values; the type made it into
the schema but no caller was ever wired to emit them. `deliverable_built` is exactly the type an
email build should log.

## Step 3 — even where logActivity IS called, does the insert actually succeed?

Read `docs/sql/20260619_project_activity.sql`:
```
ALTER TABLE project_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner can read project_activity" ON project_activity FOR SELECT USING (...);
-- Service role bypasses RLS (used by server-side logActivity helper).
-- No write policy needed for users — all writes are server-side via service role.
```
Only a SELECT policy exists. The comment ASSUMES every caller passes the **service-role** client.
Checked all 6 real call sites for which `supabase` variable they hand to `logActivity(supabase, ...)`:

- app/api/projects/route.ts:20 → `const supabase = createClient(await cookies());` (cookie/RLS
  client) — comment on line 15-17 even says "CRITICAL: uses the COOKIE client (RLS-enforced),
  never the service-role client" (that's correct for the `projects` insert itself, RLS WITH CHECK
  auth.uid()=user_id) — but the SAME `supabase` var is then passed into `logActivity` at line 72.
- app/api/projects/[id]/route.ts:22 → same pattern, cookie client passed to logActivity at
  134/153/171.
- app/api/user/brand/route.ts:97 → same, passed at 222.
- app/api/deliverables/[id]/blast/route.ts:119 → same, passed at 544 (this file DOES import
  createServiceRoleClient at line 33, but only uses it for a suppression-list lookup at line 239 —
  never for the logActivity call).
- app/api/projects/[id]/refresh/route.ts:23 → same, passed at 89.
- app/api/lab/claim-and-send/route.ts:59 → same, passed at 97.

**Every single logActivity call site in the entire codebase passes the RLS-enforced cookie client,
never the service-role client.** project_activity has RLS enabled with only a SELECT policy — no
INSERT policy for the `authenticated` role. Under Postgres RLS default-deny, every one of these
INSERTs is rejected by the database.

`logActivity` (lib/project/activity.ts:59-71) wraps the insert in try/catch and does:
```ts
if (error) console.error("[project_activity] insert error:", error.message);
```
It never throws, never surfaces the failure anywhere the operator would see it (server console
log only, easy to miss, no alerting). So the INSERT silently fails on every call, for every
project, always — not just for the AI-build path (which never even attempts a write).

## Conclusion

Two independent, stacked causes, both confirmed by reading the code (no execution):

1. **Missing instrumentation** — the Email Lab AI-build endpoint (app/api/email-lab/ai/route.ts)
   and every other Email Lab route never call logActivity at all. The `deliverable_built` /
   `metric_moved` ActivityType values exist in the type but have zero callers anywhere in the repo.
   Even if bug #2 below were fixed, tonight's build would still produce no row.

2. **Silent RLS rejection on the paths that DO try** — the 6 routes that do call logActivity all
   pass the cookie-bound (RLS-enforced) Supabase client, not the service-role client, while
   project_activity's RLS policy set (docs/sql/20260619_project_activity.sql) only grants SELECT to
   owners and provides no INSERT policy at all (the file's own comment wrongly assumes writes go
   through service role). Every insert attempt across the whole app has therefore always been
   rejected by Postgres and silently swallowed by logActivity's try/catch — so project_activity has
   likely NEVER held a real row for any project, since the feature shipped 2026-06-19.

Root cause is #2 for "why is project_activity empty even on the paths that try to log," and #1 for
"why tonight's specific AI-build had zero chance of appearing even if #2 were fixed." Both are
verifiable from source without running anything.

## Fix shape (not applied — diagnosis-only pass)

- Add an INSERT policy on project_activity for service_role (or switch all 6 call sites + any new
  Email Lab call sites to use `createServiceRoleClient()` for the logActivity call specifically,
  keeping the cookie client for the RLS-protected primary table writes).
- Wire `app/api/email-lab/ai/route.ts` to call `logActivity(..., type: "deliverable_built", ...)`
  after a successful authorDoc/buildContentDoc call, using a service-role client, with
  `project_id` threaded from `body.scope` (needs a project_id in the request body — check whether
  the client currently sends one; if not, that's an additional gap in the AI-build route's request
  shape).
- Once INSERT actually succeeds, verify with a local (non-destructive) `select` that a test project
  accumulates rows.
