# Email funnel (CURRENT in-flight work — audited LAST)

**Health: shaky.** The multi-tenant email engine (Units B–G) is well-architected — pure DI cores, isolated per-row error handling, an atomic `FOR UPDATE SKIP LOCKED` claim RPC, a crash-orphan reaper, idempotent unsubscribe injection, and the two-step propose→confirm command parser are all genuinely solid and well-tested. But it is **built-but-off**, and two correctness holes would bite the moment it goes live: (1) Resend segment names are the bare tenant slug with **no per-user namespace**, so two tenants who both tag a list "newsletter" share one Resend segment → cross-tenant contact bleed and mis-targeted sends; (2) the usage gate checks `sent < limit` but never checks send-size headroom, so one broadcast to a large audience blows arbitrarily past the tier cap. Separately, the in-flight "scope" capability is half-wired: the parser, columns, and confirmation summary promise a scoped digest, but `buildContent` still ignores the row and ships the global digest to everyone — the confirmation lies to the user until Task 02 lands. The two features the parallel session is building (welcome→delta activation, buyer-intent reply sensor) do not exist on main; the inbound route, signature verification, and Stripe billing are all absent.

## [CRITICAL] Resend segments are not namespaced per tenant — cross-tenant contact bleed

**Location:** `lib/email/audience-sync.ts:148-182` (`findOrCreateSegment`), `:175` (`segments.create({ name: slug })`); consumed by `app/api/email/contacts/sync/route.ts`.

**Detail:** Segments are created and looked up by the bare `audience_slug` (= the contact's tag, lowercased/trimmed) with no per-`user_id` prefix. The whole platform runs on ONE Resend account. `findOrCreateSegment` step 2 scans `segments.list()` (account-wide) for `s.name === slug` and reuses any match. So if tenant A syncs a "newsletter" tag and tenant B later syncs their own "newsletter" tag, tenant B's sync finds A's segment by name and upserts B's contacts into **A's segment** (and caches A's segment id in B's `email_audiences` row). Result: both tenants' contacts live in one shared Resend segment, and either tenant's scheduled broadcast (`segmentId` resolved from `email_audiences.resend_audience_id`) sends to the **other tenant's recipients**. This is a multi-tenant data-bleed and a deliverability/CAN-SPAM disaster (mailing people who never opted in to that sender). Common slugs ("newsletter", "all", "clients", "vip") make a collision near-certain at any real tenant count.

**Fix:** Namespace every Resend segment name by tenant — e.g. `name = `${userId}:${slug}`` (or a per-user short id) — for BOTH the `segments.list()` match AND `segments.create()`. Migrate existing rows. Keep the DB `audience_slug` user-facing (bare slug) but make the Resend object name globally unique. The find-or-create cache (`email_audiences.resend_audience_id`) must be the authority; the name-scan fallback must only match the tenant's own namespaced name.

**Model:** opus — multi-tenant isolation invariant, touches the idempotency contract and a live vendor surface; needs judgment on namespacing scheme + back-migration.

## [HIGH] Usage gate has no send-size headroom check — one broadcast overshoots the tier cap arbitrarily

**Location:** `lib/email/scheduler.ts:235-242` (gate), `:303` (`recipients = audience?.contact_count ?? 1`); `lib/email/usage.ts:126-167` (`checkUsageLimit` reports `allowed = sent < limit`).

**Detail:** The gate fires before the send and only asks "is `sent_count` strictly below the monthly limit?" It never considers how many recipients THIS send will add. A `free` tenant (limit 50) at `sent=49` with a 5,000-contact audience passes the gate (49 < 50), sends to all 5,000, then records `sent_count = 5049`. The tier cap is a per-send tripwire, not a budget — a single cron tick can bill/send 100× the plan. Worse, `audience.contact_count` is only read in step 2 (after the gate in step 1), so headroom can't even be evaluated where the gate currently lives. The "skip+notify, never throw" contract is honored, but the cap is effectively unenforceable for any audience larger than one.

**Fix:** Move the audience lookup before the gate (or pass expected recipient count into `checkUsageLimit`) and gate on `sent + expectedRecipients <= limit`. Decide the overshoot policy explicitly: block the whole send, or send a partial batch up to the remaining headroom. Document it; add a unit test for the at-cap large-audience case.

**Model:** opus — billing-integrity invariant + a product/pricing policy decision (block vs. partial), cross-cuts gate ordering and the meter.

## [HIGH] Scope is wired end-to-end EXCEPT the consumer — confirmation promises a scoped digest the worker doesn't send

**Location:** `scripts/email/run-schedules.mts:223-228` (`buildContent(_row)` ignores the row); `lib/email/schedule-command.ts:231-260` (`summarizeCommand` renders "about flood for cape coral"); `app/api/email/schedule-command/route.ts:198-201` (writes `scope_kind/scope_value/topic`); `docs/sql/20260613_email_schedule_scope.sql` (columns).

**Detail:** The parser accepts `scope_kind/scope_value/topic`, the route persists them, the cadence/claim path returns them, and the confirmation line tells the tenant "Create a weekly schedule that sends about flood for 'cape coral'." But `buildContent` is hardcoded to `buildBody(getDigest())` — the SAME global SWFL digest for every tenant, ignoring scope entirely (Task 02 is unbuilt, tracked as `email_scoped_content`). So a tenant who confirms a "Cape Coral flood" schedule receives the generic region-wide digest. This is a truth-in-product gap: the system shows a specific promise and ships something else. It is latent today (worker off) but becomes a live lie the instant the worker goes live with the scope parser ahead of the scoped builder. Note the parallel session may land scope content — but on current main it is a half-wired feature whose confirmation copy outruns its behavior.

**Fix:** Either (a) land Task 02 (`buildContent` reads the row and renders a scoped one-pager via `lib/deliverable/*`, with the in-run scope cache) before exposing scope in the confirmation summary, or (b) gate the scope clause out of `summarizeCommand`/the write until the consumer exists, so the product never promises what it can't deliver. Do not ship the parser + summary without the consumer.

**Model:** opus — touches the no-invention moat (scoped content must go through the grounded engine, never the chat LLM) and product-truth; sequencing judgment.

## [MEDIUM] Contact re-upload nulls out an existing name when the new CSV omits a name

**Location:** `app/api/email/contacts/upload/route.ts:155-179` (Step-2 update sets `name: incoming.name` unconditionally).

**Detail:** The header comment says "name is replaced if the incoming value is non-null," but the code does `name: update.name` where `update.name = incoming.name`, and `incoming.name` is `null` whenever the row had no name cell. So re-uploading a tags-only CSV (a common "add a tag to these emails" flow) overwrites every matched contact's previously-stored name with `null`. Tags are correctly unioned; name is destructively replaced. Silent data loss on a routine operation.

**Fix:** Only set `name` when `incoming.name != null` (coalesce to the existing value): `name: incoming.name ?? ex.name`. Add a regression test (upload with name, re-upload without name, assert name preserved).

**Model:** sonnet — localized, well-specified one-line correctness fix with an obvious test.

## [MEDIUM] No project-ownership validation in schedule-command — arbitrary project_id accepted

**Location:** `app/api/email/schedule-command/route.ts:62-63` (`projectId` taken verbatim), `:188-204` (insert), `:260-264` (update scoped by `id`+`project_id` only).

**Detail:** `project_id` is free-text (no FK, no ownership check). The route never verifies the caller owns the named project; it relies entirely on `email_schedules` RLS (`auth.uid() = user_id`) for safety. That does prevent cross-tenant mutation (RLS scopes every read/write to the caller's rows, and INSERT sets `user_id: userId` under WITH CHECK). But a user can create schedules attached to a `project_id` they don't own (or a garbage string) under their own account — the soft-link is unvalidated, so `email_schedules.project_id` can drift from `projects`. Not a cross-tenant leak, but an integrity hole that will surface when scope/brand resolution joins on project (`resolveUserBrand` does `projects.eq(id).eq(user_id)` — a foreign project_id silently yields no brand).

**Fix:** Validate `projectId` belongs to the caller (`select id from projects where id=projectId and user_id=user.id`) before propose/confirm, returning 404 on miss — mirror the `projects` RLS pattern already used elsewhere.

**Model:** sonnet — mechanical ownership check, clear pattern to copy.

## [MEDIUM] No physical-sender provenance when an unverified tenant sends under the platform domain

**Location:** `lib/email/sender-config.ts:52-74` (unverified → platform `from`), `app/api/email/broadcast/route.ts:66-75` (no address token), `lib/email/templates/token-defaults.ts:18-31` (no postal-address token).

**Detail:** Per the operator's CAN-SPAM note the law is three things — opt-out, accurate headers, no misleading subject — and the unsubscribe path is handled (`ensureUnsubscribeToken` + Resend managed unsubscribe). The remaining header-accuracy concern: an unverified tenant's mail goes out `from hello@swfldatagulf.com` (platform identity) carrying the tenant's `reply_to`. That is honest about the sender (it IS the platform relaying), so it's defensible — but the email body carries no indication of WHO the content is for/from on the unverified path, and no template token carries any physical mailing address at all (`token-defaults.ts` has DISCLAIMER but no ADDRESS). For Gmail/Yahoo bulk-sender good standing and to avoid "misleading sender" complaints when a tenant's branded content ships under the platform from-address, the physical-address/identity provenance should be explicit. (Flagging, NOT re-raising the removed Rule-9 lecture — this is the narrow header/identity-accuracy slice.)

**Fix:** Add an ADDRESS/identity token to the email shell and the unverified-send footer (the platform's physical postal address, plus a "sent on behalf of {tenant}" line when `usingTenantDomain=false`). Confirm against live Resend + Gmail bulk-sender guidance in-session before wording it.

**Model:** opus — compliance/deliverability judgment near a locked operator decree (don't over-engineer); needs vendor verification.
**Web question:** Do Gmail/Yahoo 2024 bulk-sender requirements and CAN-SPAM require a physical postal address in the message body, and what does Resend recommend for "send on behalf of" relayed mail from a shared platform domain?

## [MEDIUM] Worker is off and depends on unverified migration application — go-live is a manual, unenforced sequence

**Location:** `.github/workflows/email-scheduler.yml:4-15` (cron commented out), `scripts/email/run-schedules.mts:98-114` (`requireEnv`), `docs/superpowers/plans/2026-06-13-email-funnel-the-rest/task-03-go-live.md`.

**Detail:** The `*/15` cron is commented out and go-live is a five-step manual sequence (apply 4 migrations → set `DIGEST_BROADCAST_SECRET` → DRY_RUN → one real send → uncomment cron). Nothing verifies in-code that the scope migration (`20260613_email_schedule_scope.sql`) and the claim RPC are actually applied in prod before the worker reads scope columns. The claim RPC returns `s.*`, so it WILL surface the new columns automatically once the ALTER runs — but if the worker ships before the ALTER, `row.scope_kind` is simply `undefined` and (once Task 02 lands) silently falls back to global. There's no startup assertion that the expected columns/RPC exist. Acceptable for a manual go-live, but the sequence is load-bearing and unenforced.

**Fix:** Before flipping the cron, add a one-shot prod verification (row count + RPC existence + a two-account RLS 404 check, per the task doc) and consider a worker startup probe that fails loud if `claim_due_email_schedules` is missing. Confirm migrations are applied (the working tree shows the scope SQL as untracked/new — verify it ran).

**Model:** sonnet — checklist execution + a small startup probe; low ambiguity.

## [LOW] reapOrphans + claim both key off last_run_at — a row that fails every cycle never alarms

**Location:** `lib/email/scheduler.ts:227-345` (re-arm in `finally`, no failure counter), `scripts/email/run-schedules.mts:151-183` (reaper), `lib/email/usage.ts` (no notify sink).

**Detail:** A schedule that errors every cycle (bad audience, render throw, broadcast 502) is caught, logged, and re-armed forever with no escalation — `processSchedule` always re-arms in `finally` and there's no consecutive-failure counter or dead-letter. The reaper only handles parked crash-orphans, not chronically-failing-but-armed rows. The "skip+notify" contract logs a line, but there is no actual notify sink (no alert, no `status='errored'` transition, no ops surface). A tenant's schedule can silently never deliver. Not data loss, but a silent-failure hole that an ops dashboard or a `consecutive_failures` column + threshold would close.

**Fix:** Add a `consecutive_failures` counter on `email_schedules`; after N consecutive errors transition to `status='errored'` (stops re-arming) and surface it on the ops board. Wire the "notify" half of skip+notify to a real sink.

**Model:** opus — needs a small schema/state-machine addition and an ops integration decision.

## [LOW] Domain-verify refresh path writes the new `domain` string against the OLD resend_domain_id

**Location:** `app/api/email/domain-verify/route.ts:167-216`.

**Detail:** On the register/refresh path, when a row already has `resend_domain_id`, the route re-fetches THAT domain from Resend but then upserts using the NEW `domain` value from the request body alongside the old `resendDomainId`. If a tenant submits a different domain than they first registered, the row ends up with a mismatched (new `domain`, old `resend_domain_id`) pair, and the user can't actually re-register a new domain — they're silently pinned to the first one. Edge case, but it corrupts the sender config for a domain change.

**Fix:** If the submitted `domain` differs from `existing.domain`, create a new Resend domain (or reject with a clear "delete first" message) rather than re-fetching the old id under the new name.

**Model:** sonnet — localized branch fix once the intended behavior is decided.

## [LOW] Two-step command parser has no idempotency/replay key — confirm is replayable

**Location:** `app/api/email/schedule-command/route.ts:66-72` (CONFIRM writes from client-supplied `proposal`), `:179-217` (create insert).

**Detail:** The CONFIRM step writes whatever validated `proposal` the client posts, with no nonce/proposal-id tying it to the PROPOSE that generated it and no idempotency key. A double-clicked confirm (or a replayed request) creates two identical schedules; `email_schedules` has no uniqueness constraint to dedupe (no unique index on user/project/cadence/audience). Low impact for a manual UI, but the planned inbound-reply path (Task 05) feeds the same parser from email replies, where retries/duplicates are far more likely.

**Fix:** Issue a short-lived signed proposal token in PROPOSE that CONFIRM must echo (also prevents a client smuggling an un-proposed action), and/or dedupe creates within a small window. Important to settle before the inbound webhook reuses this seam.

**Model:** opus — security/idempotency design that the inbound feature will depend on; cross-cutting.

## [LOW] New schedule-command.test.ts lives outside the __tests__ convention (and partially overlaps)

**Location:** `lib/email/schedule-command.test.ts` (new, scope tests) vs. `lib/email/__tests__/schedule-command.test.ts` (base behavior).

**Detail:** Every other email test sits in `lib/email/__tests__/`. The new scope test was added one directory up. Both pass and are complementary (scope vs. base), but the split risks a future test-glob or reviewer missing one, and invites confusion about which file owns the parser's coverage.

**Fix:** Move the scope tests into `lib/email/__tests__/schedule-command.test.ts` (merge) or rename to a clearly-distinct path; keep all email tests under one convention.

**Model:** sonnet — pure file move/merge.

## Holes for the in-flight features (welcome→delta activation + buyer-intent reply sensor)

These do not exist on main; flagging what each must close to ship safely.

- **Inbound route is net-new and unbuilt** (`app/api/email/inbound/route.ts` absent). The reply sensor needs: live Resend inbound-webhook signature verification (vendor-verify in-session — do NOT trust remembered payload shape), sender-email→`user_id` resolution via `email_sender_config`, and rejection of unknown/unverified senders BEFORE any parse. Reuse the existing `schedule-command` parser (`validateToolInput`/`summarizeCommand`) — do not fork the intent logic.
- **Buyer-intent classification has no grounding contract yet.** Any "intent" label applied to a reply must be deterministic/auditable per the no-invention moat — an LLM intent guess with no falsifier/citation is exactly the kind of smoothing the platform bans. Decide where the classification is stored, how false positives are bounded, and whether it ever auto-acts (it must not without the two-step confirm).
- **Two-step activation (welcome→delta) needs double-send protection.** There is no per-recipient send-ledger keyed to a sequence step; the only dedup today is the claim RPC (per-schedule, not per-recipient-per-step). A delta email re-trigger (retry, crash-replay) would re-send step 2. Needs an idempotency key per (recipient, sequence_step).
- **Stripe billing is entirely absent** (no `stripe` import anywhere in `lib/email/**` or `app/api/email/**`). `email_usage.tier` defaults to `free` and is never set from a subscription source — there is no path that elevates a tenant's tier, so every tenant is permanently free-capped (50/mo) regardless of payment. `checkUsageLimit` reads `tier` from the `email_usage` row, but nothing writes a non-free tier. The whole paid path (Task 04) is a stub.
- **DRY_RUN safety is correct** (read-only SELECT, no claim, no rearm, no reaper, no POST) — verified in `run-schedules.mts:124-185`; this part is solid and the in-flight work should preserve it.

## Notes on what's SOLID (do not "fix")

- The claim RPC's `FOR UPDATE SKIP LOCKED` + single atomic `UPDATE ... RETURNING` correctly gives disjoint batches to concurrent workers (no double-claim). Park-on-claim + the 1h-staleness reaper is a sound crash-orphan recovery design.
- `ensureUnsubscribeToken` is idempotent and the real-send path re-asserts the token before POST; the broadcast route independently 400s without it. Belt-and-suspenders, correct.
- `resolveSender` verified-gating (tenant `from_email` only when `domain_verified`, always carrying tenant `reply_to`) is the single source of truth and the worker imports it rather than re-deriving — exactly right.
- Per-schedule error isolation (`processSchedule` catches everything, always re-arms in `finally`) means one tenant's failure never sinks the batch.
- `computeNextRunAt` ET→UTC with the two-pass `Intl` offset correction is DST-correct and shared between create-time and advance-time. Good.
