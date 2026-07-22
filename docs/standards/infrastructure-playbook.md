# The 13-Layer Infrastructure Playbook

**As of 07/21/2026.** Status audited against the live repo, live Supabase advisors, the
GitHub Actions surface, repo variables/secrets, and the open `checks` ledger. Vendor facts
were fetched in-session via crawl4ai on 07/21/2026 — every plan tier, price, and limit below
carries its source URL. Nothing here is written from memory.

**What this file is.** One page per layer: what we actually have, the evidence for it, the
playbook to close the gap, and — just as important — what NOT to build. It is a status
document with remediation attached, not a wish list.

**What this file is not.** It is not a status board. Open obligations live in `checks`
(`scripts/check.mjs`), never as checkboxes here. When a layer's work lands, edit its STATUS
line in the same commit as the code.

**To dispatch the work** — `docs/handoff/2026-07-21-infrastructure-work-packages.md`. It carves
the five work-order items plus Layer 7's ratchets into six independently-executable packages
with file ownership and a collision matrix, so parallel sessions do not step on each other. This
file stays the reference; that one is the dispatch table.

---

## The volume lens — read this before the layers

RULE 11: we hold a rounding error of hyperscaler data. Several of these 13 layers are famous
because they are hard at Google's scale. At ours they are either free (the platform does it)
or actively wrong to build. Two layers below are marked **NO-OP BY DESIGN**. A no-op is not
a failure, and it must not be "fixed" by a future session that reads the list and sees a gap.

The honest split as of 07/21/2026:

- **Eight layers in order** — frontend, APIs, database/storage, auth, hosting, CI/CD, rate limiting (code half), availability (deploy half).
- **Two no-ops by design** — load balancing/scaling, cloud/compute.
- **Three with real gaps** — caching/CDN, error tracking, security/RLS perimeter.
- **One unverified** — database backup posture. Verification is step 1 of Layer 13.

## Work order

Ranked by live cost or live risk, not by layer number. This is the order to actually do them.

1. **Layer 10, caching** — the only gap costing money right now. It sits under the open
   `egress_read_the_actual_bill` check (due 07/22/2026).
2. **Layer 13, backup verification** — 15 minutes of dashboard checking. Cheapest risk
   reduction on the page. Rollback covers a bad deploy; nothing currently covers a bad migration.
3. **Layer 9, WAF rate-limit rule** — closes `api_b_open_rate_limit` (14d untouched) for
   $0.50 per million requests. One dashboard rule.
4. **Layer 12, error tracking** — the operational blind spot. Currently parked as
   `selfheal_error_spike_parked`.
5. **Layer 8, authz perimeter sweep** — the largest job, and the one most likely to sprawl.
   Scope it to the 82 service-role routes, do it in tranches, do not start it the same week as
   anything else on this list.

---

# Layer 1 — Frontend foundation

**STATUS: IN ORDER.**

**EVIDENCE.** Next.js App Router, React 19, Tailwind. ~200 route/page files under `app/`.
`next.config.ts` carries the hard-won production fixes: `serverExternalPackages` for the three
native addons (`@resvg/resvg-js`, `@react-pdf/renderer`, `pdf-parse`) and
`outputFileTracingIncludes` entries for every route that reads a file from disk at runtime —
fonts, template shells, the tolerances YAML, the ZIP cutout SVG.

**PLAYBOOK — keep it in order.**

1. The `one-room` skill governs every signed-in surface. In-app pages reuse existing chrome
   verbatim. Generic taste skills are for marketing/landing pages only, never in-app.
2. `outputFileTracingIncludes` is a landmine list, not config. Any NEW route that rasterizes a
   chart (`svgToPng`), touches `sharp`, or reads a file by path MUST add itself in the same
   commit. The failure mode is silent — blank text in a rendered PNG, or `ERR_DLOPEN_FAILED`
   in prod only. It has bitten before (07/03/2026 killed This Week + lab AI).
3. `react-hooks/set-state-in-effect` is a hard ESLint error. Do not downgrade it.
4. Verify with `bunx next build`, never `npx tsc` alone.

**DON'T.** Do not introduce a second design system, a component library, or a CSS framework
alongside Tailwind. Do not add a state-management library — server components plus URL state
covers what we do.

**DONE WHEN.** Standing. No end state; this layer is maintained, not completed.

---

# Layer 2 — APIs and backend logic

**STATUS: IN ORDER (sprawling, but coherent).**

**EVIDENCE.** 82+ route handlers under `app/api/`. Three distinct public surfaces: the data
API (`/api/b/[slug]`), the MCP server (`/api/mcp`), and the streaming assistant
(`/api/assistant`). Area conventions are documented in `app/api/CLAUDE.md`.

**PLAYBOOK — keep it in order.**

1. Read `app/api/CLAUDE.md` before editing anything under `app/api/`.
2. Every new route declares `runtime` and `dynamic` explicitly, and `maxDuration` if it does
   real work. Silence means "whatever Next defaults to," which is how a slow route becomes a
   timeout in prod.
3. Thin pipe stays thin: downstream reads only the published output of upstream, never
   branches into its internals.
4. New public surface = new entry in the rate-limited prefix list in `middleware.ts` (Layer 9).

**DON'T.** Do not add a separate API gateway, a BFF layer, or GraphQL. Route handlers reading
Supabase directly is the correct shape at our size.

**DONE WHEN.** Standing.

---

# Layer 3 — Database and storage

**STATUS: IN ORDER. Best-documented layer we have.**

**EVIDENCE.** Supabase Postgres across three schemas — `public`, `data_lake`,
`personal_vault`. Python ingest via dlt + DuckDB. Supabase Storage for media (listing photos,
email media, project materials, social uploads). `docs/standards/data-roots.md` is the single
catalog of which table feeds which concept.

**PLAYBOOK — keep it in order.**

1. `docs/standards/data-roots.md` top section is the FIRST file opened for any data question
   or new consumer. One root per concept per cadence. If the root isn't listed you ADD a root;
   you do not add a second table.
2. Roots carry status markers. A not-built root is the *intended home*, never a served number.
3. Never `DROP`/`DELETE` a duplicate table until its replacement runs, every consumer
   repoints, and the operator signs off.
4. Migrations run directly (creds in `.dlt/secrets.toml`), always idempotent, row count
   verified after.
5. Full-scope-first: before any ingest pull, enumerate the source's FULL field list into the
   pipeline's `source_scope` block in `ingest/cadence_registry.yaml`. The postmortem for this
   rule is `parcel_subdivision` pulling 7 of 120 available FDOR fields for a week.

**DON'T.** Do not add dbt (evaluated and rejected). Do not add DuckLake (evaluated). Do not
add a second analytics warehouse — Postgres plus DuckDB in the ingest layer is the shape.

**DONE WHEN.** Standing.

---

# Layer 4 — Auth and permissions

**STATUS: IN ORDER at the session layer. The *authorization* half is Layer 8 — read them together.**

**EVIDENCE.** Supabase Auth with SSR cookie sessions. `utils/supabase/` holds four clients:
`client.ts` (browser), `server.ts` (RSC), `middleware.ts` (session refresh), `service-role.ts`
(privileged). `middleware.ts` refreshes the session on every non-public path and gates the
entire `/project` prefix behind a login redirect with a `next=` return path.

**PLAYBOOK — keep it in order.**

1. Public API prefixes short-circuit past the Supabase client deliberately — they need no auth
   env vars and skip a function invocation. Do not "simplify" that branch away.
2. There is no anonymous-draft carve-out and there should not be one. A dead `/project/draft`
   exemption was removed on 06/10/2026 because middleware was lying about a public path that
   didn't exist. If an anonymous view is ever built, the exemption ships in the SAME commit as
   the page.
3. When you build a new response object (a redirect), copy the refreshed auth cookies onto it
   or the browser and server sessions desync. This is the documented Supabase SSR trap and
   `middleware.ts` already handles it — match that pattern.

**DON'T.** Do not add a second identity provider, a session store, or a custom JWT layer.

**DONE WHEN.** Standing. Authorization gaps tracked in Layer 8.

---

# Layer 5 — Hosting and deployment

**STATUS: IN ORDER.**

**EVIDENCE.** Vercel, production plus preview deployments. No `vercel.json` — configuration
lives in `next.config.ts`. Deploys trigger `smoke-prod.yml` and `rollback-on-red.yml` off
GitHub's `deployment_status` event, so there is no polling.

**PLAYBOOK — keep it in order.**

1. Push discipline is the deploy gate. `node scripts/safe-push.mjs`, explicit paths only,
   never `--no-verify`, never force-push `main`.
2. Five hook-enforced pre-push gates (`.claude/hooks/check-prepush-gate.mjs`): lockfile,
   vocab/alias, secrets, ingest guards, pack-catalog.
3. `gh secret set` is step 1; wiring into the workflow `env:` block is step 2. Gate 3 exists
   because step 2 was forgotten.

**DON'T.** Do not add a staging environment. Preview deploys plus preview smoke already give
us pre-prod signal, and a third environment triples the config drift surface at zero benefit
for a single-operator platform.

**DONE WHEN.** Standing.

---

# Layer 6 — Cloud and compute

**STATUS: NO-OP BY DESIGN.**

**EVIDENCE.** Vercel serverless and edge functions for the application. 111 GitHub Actions
workflows as the compute fabric for ingest, rebuilds, and scheduled jobs. No containers, no
VMs, no orchestrator, nothing to patch.

**PLAYBOOK.**

1. `maxDuration` on any route doing real work — PDF render, blast send, project build,
   AI material generation. This is the only compute knob that matters to us.
2. Long jobs belong in GitHub Actions, not in a route handler. The boundary: if it can exceed
   a function timeout, it is a workflow.
3. Every pipeline ships its GHA cron wrapper and a `--dry-run` in the same PR
   (`docs/standards/pipeline-freshness.md`).

**DON'T.** Do not containerize. Do not introduce Kubernetes, ECS, Fly.io, or a worker queue
service. Do not migrate ingest off GitHub Actions. Every one of these solves a problem we do
not have and adds an ops surface we would then have to staff.

**DONE WHEN.** Already done. Revisit only if a single job genuinely cannot fit the Actions
runner limits — and then move that ONE job, not the fleet.

---

# Layer 7 — CI/CD and version control

**STATUS: IN ORDER. Strongest layer on the platform.**

**EVIDENCE.** `.github/workflows/ci.yml` runs, on every push to `main` and every PR:
typecheck (`bunx tsc --noEmit`), lint (`bunx eslint .`), `bun test` with Playwright Chromium
installed, `node --test` over `.github/scripts`, `scripts/lib`, and `.claude/hooks`, knip
dead-code detection (report-only, phase 1), the lake-read ratchet
(`scripts/check-lake-reads.mts`), and registry identity (static blocking, live advisory).
`brains/**`-only pushes are skipped via `paths-ignore` because the rebuild bot commits data,
not code.

**PLAYBOOK — the four ratchets waiting to be tightened.**

1. **knip to phase 2.** `knip.jsonc` sets `rules.files` to `warn`, so CI prints orphan
   candidates and exits 0. Triage the ~14-file surface, then flip to `error` so newly-orphaned
   modules fail the build.
2. **Registry identity to live gating.** The `--live` step is advisory on purpose: on the
   current snapshot `redfin_city_swfl`, `dbpr_re_licensees`, and `leepa_parcel_zip` are
   genuinely red, and a blocking live gate on day one reds `main` — the exact false-red disease
   this build exists to kill. Flip to `--live --gate` after one green confirm. Tracked by
   `registry_identity_live_gating`.
3. **Factuality gate to blocking.** `factuality-gate.yml` runs with `continue-on-error`. Flip
   to `false` after a validated clean stretch of warn-first runs; record the evidence run ids.
   Tracked by `factuality_gate_blocking_flip`.
4. **Visual regression into CI.** Currently local-only. Three open checks cover it:
   `visual_regression_ci_job`, `visual_regression_prepush_wiring`,
   `storybook_visual_regression_gap`.

**DON'T.** Do not add a second CI provider. Do not add merge queues or required-reviewer
gates — single operator, and the pre-push hooks already do more than most review processes.

**DONE WHEN.** All four ratchets above are tightened. Each is a one-line flip plus the
evidence run that justifies it — do them one at a time, never as a batch, so a red is
attributable.

---

# Layer 8 — Security and row-level security

**STATUS: REAL GAP — but not the one the advisor output makes it look like. Read the framing first.**

**EVIDENCE, and what it actually means.** Supabase security advisors report RLS enabled with
**zero policies** on essentially every table across `public`, `data_lake`, and
`personal_vault`. That is NOT "the database is exposed." RLS-on-no-policy means those tables
**deny `anon` and `authenticated` outright**. Every read and write flows through `service_role`,
which matches the 82 route handlers found importing the service-role client.

The accurate read: **the security perimeter is application-code authorization on those 82
routes. The database is not a second line of defense.** That is a defensible architecture for
a single-tenant-per-user product — but it makes each route's own ownership check load-bearing,
with no backstop if one is missing.

And there is evidence the checks are uneven:

- `sa0718_unhandled_internal_error_messages_passed_s` — unhandled internal error messages pass
  straight through into API responses, leaking internals.
- `email_lab_project_activity_rls_insert_missing` — **FIXED 2026-07-21.** `project_activity` had a
  SELECT policy and no INSERT policy since its 06/19/2026 migration — and, found on a live probe, no
  `authenticated` table grants at all — so every `logActivity` call silently RLS-failed (and the
  cookie-client read path returned `[]`). Fix: `GRANT SELECT, INSERT` + an owner INSERT policy
  (migration `project_activity_insert_policy_and_grant`, prod-live + two-sided-verified; mirror in
  `docs/sql/20260721_project_activity_insert_policy_and_grant.sql`), and wired the project-scoped AI
  build (`app/api/projects/[id]/ai-material`) to log `deliverable_built`. The rest of this layer's
  RLS/sweep story is unchanged.

Also open, both low severity: 14 functions with a role-mutable `search_path`, and the `vector`
extension installed in the `public` schema.

**PLAYBOOK.**

1. **Decide the posture explicitly, once, and write it down.** Either (a) service-role-only
   with app-code authz — the current de-facto state — or (b) real RLS policies with the
   anon/authenticated clients doing user-scoped reads. Do not drift between them. Option (a) is
   the honest choice at our size; option (b) is a months-long rewrite of 82 routes.
   **Recommendation: ratify (a) in writing, then make it rigorous via steps 2-4.**
2. **Sweep the 82 routes for the ownership check, in tranches.** Highest risk first: anything
   under `/api/projects/`, `/api/deliverables/`, `/api/contacts/`, `/api/email/`, `/api/mls/`,
   `/api/stripe/`. For each: does it resolve the caller, and does it verify the caller owns the
   row it is about to read or mutate? Do NOT do this in one sitting and do not start it the
   same week as another item on the work order.
3. **Kill the error leak first** — it is one fix, not a sweep. Wrap route handlers so unhandled
   errors return a generic message and the detail goes to the log (which is Layer 12, and is
   why 12 should land before or alongside this).
4. **Fix `project_activity`** — ✅ DONE 2026-07-21. Added `GRANT SELECT, INSERT` (append-only) + an
   owner INSERT policy mirroring the SELECT USING (cookie-client posture, matching sibling
   `project_feed`; NOT service-role — that bypasses the policy and opens a cross-user write hole),
   and wired `app/api/projects/[id]/ai-material` to log `deliverable_built`. Prod-live +
   two-sided-verified; mirror in `docs/sql/20260721_project_activity_insert_policy_and_grant.sql`.
5. **Low severity, batch them:** set `search_path` on the 14 flagged functions; move the
   `vector` extension out of `public`.

**DON'T.** Do not enable RLS policies table-by-table opportunistically while 82 routes still
use service-role — a policy that service-role bypasses is theater, and it produces exactly the
half-built state `project_activity` is in now. Posture first, then policies, or neither.

**DONE WHEN.** The posture is written down; every route in the high-risk tranches has a
verified ownership check; the error leak is closed. The advisor `rls_enabled_no_policy` lines
are expected to REMAIN under posture (a) — they are not the completion signal, and a future
session should not treat them as a bug.

---

# Layer 9 — Rate limiting

**STATUS: HALF DONE. Code layer is good; the authoritative ceiling was never published.**

**EVIDENCE.** `lib/rate-limit.ts` implements a fixed-window per-IP counter, wired in
`middleware.ts` across `/api/b/`, `/api/mcp`, `/api/waitlist`, `/p/`, `/api/assistant`,
`/api/claim`, and `/api/templates`. It emits a correct 429 with `Retry-After` and the three
`X-RateLimit-*` headers, and it passes the budget headers through on allowed requests so
well-behaved clients can self-throttle. Defaults are 60 requests / 60s, env-tunable via
`API_RATE_LIMIT_MAX` and `API_RATE_LIMIT_WINDOW_MS`. It fails open on a bad env value and
drops its table above 50,000 tracked IPs rather than leaking memory.

The file documents its own limitation honestly: middleware runs on the Edge runtime, state is
per-isolate and per-region, so an attacker spread across cold isolates can exceed the limit.
The intended ceiling is a Vercel WAF rule — and `api_b_open_rate_limit` has been open,
untouched, for 14 days. **The ceiling does not exist.**

**VENDOR FACTS — Vercel WAF Rate Limiting.** Source:
https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting — fetched 07/21/2026.

- Available on **all plans**.
- Fixed Window on all plans; Token Bucket is Enterprise-only.
- Defaults: 60s window, 100 requests. Window range on Hobby/Pro: min 10s, max 10 minutes.
- Counting keys on Hobby/Pro: IP and JA4 Digest. Enterprise adds User Agent and arbitrary headers.
- Rule count: 1 per project on Hobby, 40 on Pro.
- Actions: default 429, or Log, Deny, Challenge.
- **Counters are tracked per-region.** Traffic matching a key across multiple regions can
  exceed the configured per-region limit. Same caveat class as our per-isolate one — the WAF
  is a much higher ceiling, not an absolute one.
- Price: $0.50 per 1,000,000 allowed requests. Hobby includes 1,000,000.

**PLAYBOOK.**

1. Dashboard, select the project, then **Firewall** in the sidebar, **Configure**, **+ New Rule**.
2. Condition: request path starts with `/api/b/`. Add a second rule for `/api/mcp` and a third
   for `/api/assistant` — the assistant one matters most, it spends Anthropic tokens per call
   and an unthrottled loop is a direct billing-DoS.
3. Then action: **Rate Limit**. Strategy: Fixed Window. Key: IP.
4. **Set the action to `Log` first, not 429.** Publish, then watch the Firewall overview
   filtered to that custom rule for a few days. This tells you the real traffic shape before
   you start denying — and our own uptime probes and the smoke suite hit these endpoints.
5. Once the log shows the limit is above legitimate traffic, flip the action to the default
   429 and publish again.
6. Set the WAF limit **above** the in-code limit (in-code is 60/60s). The code layer should
   trip first for the common single-client case; the WAF is the cross-region backstop.
7. Close `api_b_open_rate_limit` with the rule id and a screenshot of the Firewall overview
   showing it matching traffic.

**DON'T.** Do not delete `lib/rate-limit.ts` once the WAF rule exists — it is the
zero-dependency first line and it costs nothing. Do not reach for Upstash/Redis for a shared
counter; that is a real dependency and a real bill to solve a problem the WAF solves for
$0.50 per million.

**DONE WHEN.** WAF rules published and enforcing on the three public prefixes;
`api_b_open_rate_limit` closed with evidence.

---

# Layer 10 — Caching and CDN

**STATUS: REAL GAP, AND IT IS THE ONE COSTING MONEY. Do this first.**

**EVIDENCE.** Vercel's CDN fronts everything by default. But in application code, nearly every
page and route exports `dynamic` and `runtime`, while only about eight surfaces carry
`revalidate` — `app/page.tsx`, `app/charts/page.tsx`, `app/pulse/page.tsx`, `app/desk/page.tsx`,
`app/insiders/page.tsx`, and three embed routes. Everything else is effectively force-dynamic:
rendered per request, hitting Supabase per request. There is no Redis and no cache layer beyond
Vercel's default.

**Frame this correctly.** Force-dynamic is a *deliberate freshness choice* for a live-data
product, not a missing best practice. The problem is not that it exists — it is that it was
never triaged, so routes that could safely revalidate are paying per-request egress alongside
the ones that genuinely can't. That is the cost driver sitting directly under the open
`egress_read_the_actual_bill` check (due 07/22/2026), and under the 07/21/2026 incident where
accumulated raw lake reads took `/desk` and `/charts` down.

**PLAYBOOK.**

1. **Read the real number first.** Do not optimize against payload arithmetic. Close out
   `egress_read_the_actual_bill` — every egress figure quoted to date is estimated, not billed.
   The tripwire has been saying so for days: no `SUPABASE_ACCESS_TOKEN`, so the served-bytes
   number has never been read. Mint the token with the `analytics_usage_read` scope, then run
   `node scripts/supabase-egress-read.mjs`.
2. **Then triage force-dynamic by asking one question per route: does a user notice if this is
   60 seconds stale?** Three buckets:
   - **Genuinely dynamic** — anything reading the signed-in user's own data (`/project/*`,
     `/api/projects/*`, `/api/deliverables/*`, account, billing). Leave alone.
   - **Revalidate-able** — public report and reader pages built from brain output that
     refreshes daily at best: `/r/*`, `/p/*`, the ZIP and community report pages. These are
     the win.
   - **Already correct** — the eight surfaces that already declare `revalidate`.
3. **Set `revalidate` to the cadence of the underlying data, not to a guess.** A page fed by a
   monthly pipeline does not need a 60-second window. `ingest/cadence_registry.yaml` is the
   source of truth for how often each root actually changes.
4. **Keep the lake-read ratchet armed.** `scripts/check-lake-reads.mts` in CI fails on a NEW
   un-triaged raw lake read in page/loader code. It exists precisely so the pattern that took
   `/desk` and `/charts` down — each bypass locally reasonable, the accumulation fatal — cannot
   silently rebuild itself. Do not add exceptions to it during this work; if a route needs a
   raw read, triage it properly.
5. Re-read the egress number after the revalidate pass and record the delta. That delta is the
   only proof this layer's work did anything.

**DON'T.** Do not add Redis, Upstash, or a KV store. Do not build a custom cache layer. Do not
blanket-convert routes to static — the freshness guarantee is the product, and a stale figure
served confidently is worse than a slow one. The entire win here is triage, not new
infrastructure.

**DONE WHEN.** The real egress number is known before and after; the revalidate-able bucket is
converted; the delta is recorded in `SESSION_LOG.md`.

---

# Layer 11 — Load balancing and scaling

**STATUS: NO-OP BY DESIGN.**

**EVIDENCE.** Vercel handles distribution, autoscaling, and failover for serverless and edge
functions. Nothing is configured because nothing needs to be. `maxDuration` is set on the heavy
routes, which is the only relevant knob.

**PLAYBOOK.**

1. Set `maxDuration` on new heavy routes. That is the whole playbook.
2. If a route is slow, fix the query or cache it (Layer 10). Scaling is never the answer at our
   request volume.
3. The one real scaling constraint we have is **Supabase connection slots**, not web compute —
   see the lake MCP slot-exhaustion history. Aggregate at the source, use `selectAllPaged` for
   large reads, and do not open a client per request in a loop.

**DON'T.** Do not add a load balancer, an autoscaling policy, read replicas, or a queue. Do not
performance-test for traffic we do not have. If this layer ever becomes real work, it will
announce itself with a bill or a 503 — not with a checklist.

**DONE WHEN.** Already done.

---

# Layer 12 — Error tracking and logs

**STATUS: WIRED LOCALLY (07/21/2026), LIVE-ALERT VERIFICATION PENDING. Sentry (@sentry/nextjs 10.67.0) is initialized across all three Next runtimes (browser / node / edge) with PII scrubbed (every sensitive `dataCollection` category disabled) and trace sampling env-tunable (errors captured at 100%). What is NOT yet proven: a deliberate uncaught exception in a preview deploy producing an alert — that needs a real deploy, a provisioned DSN, and the one new-issue-in-production alert, so `selfheal_error_spike_parked` stays OPEN until then. Pipeline health was already well instrumented; this closes the application-error blind spot.**

**EVIDENCE.** Confirmed against `package.json`: **no Sentry, no OpenTelemetry, no PostHog, no
log drain, no APM of any kind.** Zero matches.

What we DO have is ops-side telemetry, and it is genuinely good: the `api_usage_log` table, the
`/ops` dashboards, the cron incident ledger (`docs/cron-rebuild-failures.md`) with an automated
failure classifier (`.github/scripts/classify-cron-failure.mjs`), the tripwire scan at session
start, and as of 07/21/2026 nine Supabase DB gauges scraped hourly from the Metrics API.

So: **we know within the hour if a pipeline breaks. We do not know if a user hit a 500.** A
production error in someone's browser is invisible unless a human opens the Vercel log viewer
and happens to scroll to it. This is known and parked as `selfheal_error_spike_parked`.

Note the interaction with Layer 8: `sa0718_unhandled_internal_error_messages_passed_s` says
internal error messages currently leak into API responses. The fix — return a generic message,
send the detail somewhere — requires a "somewhere." That somewhere is this layer. **Land Layer
12 before or alongside the Layer 8 error-leak fix, or the detail goes nowhere.**

**VENDOR FACTS — the two real options, both fetched 07/21/2026.**

*Option A — Sentry.* Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/

- Package `@sentry/nextjs`, installed via a setup wizard.
- Creates three init files, one per Next runtime: `instrumentation-client.ts` (browser),
  `sentry.server.config.ts` (Node), `sentry.edge.config.ts` (edge). All three are needed —
  our middleware runs on edge, our routes on Node, our pages in the browser.
- Feature toggles at setup: Error Monitoring, Tracing, Session Replay, Logs.
- Their sample sets `tracesSampleRate` to 1.0 in development and 0.1 in production.
- A manual setup guide exists if the wizard is unwanted.

*Option B — Vercel Drains.* Source: https://vercel.com/docs/drains

- **Pro and Enterprise plans only.** Not available on Hobby.
- Data types: Logs (runtime, build, static), Traces (OpenTelemetry format), Speed Insights,
  Web Analytics. Audit Logs are Enterprise-only.
- Destinations: a custom HTTP endpoint, or native integrations (Dash0, Braintrust). AWS S3 is
  audit-logs-only.
- Configurable via the REST API using a `schemas` property — `log` v1, `trace` v1,
  `analytics` v2, `speed_insights` v1, `audit_log` v1. One data type per drain.
- Drains can be secured with signature verification and IP hiding.
- Delivery config can be validated before the drain goes live.

**PLAYBOOK.**

1. **Pick one. Recommendation: Sentry.** Drains give you a firehose and require you to build
   the alerting on the far end; Sentry gives grouped, deduplicated, stack-traced errors with
   alerting out of the box. We want to know "this route is throwing," not to own a log
   pipeline. Drains also require Pro — verify the plan before assuming that option exists.
2. Install `@sentry/nextjs`. Configure all three runtimes; edge is not optional given
   `middleware.ts` does real work.
3. **Set `tracesSampleRate` deliberately.** Their 0.1 production default is a hyperscaler
   default (RULE 11). At our request volume, full tracing is affordable and far more useful —
   but confirm against Sentry's current free-tier event quota before turning it up, and set it
   from an env var so it is tunable without a redeploy.
4. **Scrub before you send.** Sentry's config comments point at the data-collection options —
   disable sending user data and HTTP bodies. We handle contact lists, client uploads, and a
   demo account that is fully fictional but still looks like real PII. Do not ship request
   bodies to a third party.
5. Wire the Layer 8 error-leak fix on top: generic message to the client, full detail to
   Sentry.
6. Add ONE alert to start — new-issue-in-production. Resist building a dashboard. The failure
   mode of this layer is noise, and an alert channel that cries wolf gets muted, which is worse
   than no alerting at all.
7. Close or re-scope `selfheal_error_spike_parked` with whichever option ships.

**DON'T.** Do not install both Sentry and Drains. Do not add PostHog or a product-analytics
tool in the same pass — different problem, and bundling them is how this stalls. Do not build
a custom error table in Postgres; we already have `api_usage_log` and it is not the same job.

**DONE WHEN.** A deliberate uncaught exception in a preview deploy produces an alert, and the
API response for it carries no internal detail.

---

# Layer 13 — Availability and recovery

**STATUS: DEPLOY RECOVERY IS IN ORDER AND ARMED. DATABASE RECOVERY IS UNVERIFIED — verify before anything else on this layer.**

**EVIDENCE — the good half, confirmed.** `smoke-prod.yml` fires on Vercel's
`deployment_status` event (no polling), runs against prod on production deploys and against the
preview URL with `--no-stamp` on previews, so a bug reddens the PR before it reaches prod.
`rollback-on-red.yml` implements a real self-healing loop: green means done; soft failure opens
an incident issue with no rollback; critical failure waits 20s, runs a critical-only confirm
retry to filter cold-start flake, and if still red runs the rollback actuator and opens an
incident issue tagged for triage.

It is **armed, not dark**. Verified 07/21/2026 via `gh variable list` and `gh secret list`:
`SELFHEAL_ROLLBACK_ENABLED=true` (set 07/07/2026) and `VERCEL_ROLLBACK_TOKEN` present.

**EVIDENCE — the unverified half.** Rollback reverts a bad *deploy*. Nothing here touches a bad
*migration*, a dropped table, or a botched backfill — and migrations are run directly against
prod by standing policy. There is no evidence either way about the project's backup posture.
That is the gap.

**VENDOR FACTS — Supabase backups.** Source:
https://supabase.com/docs/guides/platform/backups — fetched 07/21/2026.

- Daily backups are automatic on **Pro, Team, and Enterprise**. Retention: Pro 7 days,
  Team 14 days, Enterprise 30 days. **Free tier gets none** — the documented guidance there is
  to self-serve via the CLI `db dump` and keep off-site copies.
- Physical backups are default on Postgres `15.8.1.079` and newer. Older versions must upgrade
  to be transitioned.
- **Point-in-Time Recovery is a paid add-on** for Pro/Team/Enterprise, and requires at least a
  Small compute add-on. Pricing by retention: 7 days is about $100/mo, 14 days about $200/mo,
  28 days about $400/mo. **Enabling PITR replaces daily backups** — they are not run in parallel.
- **Backups do NOT include objects stored via the Storage API.** The database holds only
  metadata about those objects. Restoring an old backup does not bring back deleted files.
- Daily backups do not store passwords for custom roles — after a restore, custom role
  passwords must be reset.
- Restoration takes the project offline for a duration proportional to database size.
- Backups are listable programmatically via the Management API.

**PLAYBOOK.**

1. **Verify the current state. Do this first, it is 15 minutes.** Open
   Database then Backups in the dashboard. Answer three questions and write them into
   `SESSION_LOG.md`: what plan is this project on, are daily backups actually present and
   recent, and is PITR on or off. Everything below branches on the answer.
2. **If the project is on Free: that is the finding.** No automatic backups exist at all.
   Either upgrade, or stand up a scheduled `supabase db dump` to off-site storage. Do not leave
   it as-is.
3. **On Pro, do NOT reflexively buy PITR.** RULE 11 applies squarely. PITR at about $100/mo
   protects against losing up to a day of data. Our realistic disaster is a bad migration or a
   bad backfill — both of which we notice within minutes, and both of which a 7-day daily backup
   plus a pre-migration dump already cover. Buy PITR when the platform holds customer data
   whose loss is unrecoverable by re-running a pipeline. Most of our lake is re-ingestable by
   definition; the irreplaceable tables are the user-generated ones (`projects`,
   `deliverables`, `contacts`, `saved_charts`, billing). Size the decision against those, not
   against the whole database.
4. **Close the Storage hole.** Supabase backups explicitly exclude Storage objects, and we keep
   listing photos, email media, project materials, and social uploads there. Either script a
   periodic Storage export, or make an explicit written decision that those assets are
   regenerable and accepted as at-risk. Right now neither has happened — this is a genuine,
   previously unnamed gap.
5. **Add a pre-migration dump step.** Migrations run directly against prod by policy. Taking a
   logical dump of the affected tables before a destructive migration is cheap and turns the
   worst case from "restore the whole project with downtime" into "reload one table."
6. **Rehearse a restore once.** An unrehearsed backup is a hypothesis. Restore to a NEW project
   (Supabase supports restore-to-new-project) so nothing live is touched, confirm the data is
   what you expect, then delete it. Note the wall-clock time — that number is the real recovery
   time objective and nobody currently knows it.
7. Keep the self-heal loop armed. If `SELFHEAL_ROLLBACK_ENABLED` is ever flipped to false for
   debugging, flip it back in the same session.

**DON'T.** Do not buy PITR before step 1 answers what plan we are on. Do not build a custom
backup system — the CLI dump plus the platform's dailies is the whole toolkit at our size. Do
not add multi-region or a hot standby.

**DONE WHEN.** The plan and backup state are written into `SESSION_LOG.md`; the Storage
decision is made and recorded; a restore has been rehearsed once and the recovery time is known.

---

## Sources

All vendor facts above were fetched in-session on 07/21/2026 via crawl4ai. Re-verify before
acting on any price or plan tier — these drift.

- Supabase Database Backups and PITR — https://supabase.com/docs/guides/platform/backups
- Vercel WAF Rate Limiting — https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Vercel Drains — https://vercel.com/docs/drains
- Sentry Next.js — https://docs.sentry.io/platforms/javascript/guides/nextjs/

Repo evidence: `middleware.ts`, `lib/rate-limit.ts`, `next.config.ts`, `.github/workflows/ci.yml`,
`.github/workflows/smoke-prod.yml`, `.github/workflows/rollback-on-red.yml`, `utils/supabase/*`,
Supabase security advisors, `gh variable list`, `gh secret list`, and the `checks` ledger.
