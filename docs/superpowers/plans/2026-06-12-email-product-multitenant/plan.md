# Multi-Tenant Email Product — Build Structure & Model/Parallelization Plan

## Context

We're standing up a **multi-tenant email product** on top of the existing broadcast/render
layer in `brain-platform`. The goal of *this* plan is **structural correctness for the build**,
not the build itself: decompose the work into isolated units, assign each to **Sonnet** or
**Opus**, and map **what can run in parallel vs. what's blocked**, so the work can be dispatched
cleanly.

**Lane boundary (confirmed):** Email **templates + graphs** (`renderEmailTemplate()`, chart
SVGs, the `templates/html/*` adapter) are **another Claude's lane** — tracked separately at
`docs/superpowers/plans/2026-06-12-email-template-adapter/`. This plan does **not** design them.
It treats `renderEmailTemplate()` as an **integration seam** the cron worker calls, and pins the
interface so the two lanes meet.

**This plan's scope = exactly the spec you sent:** data model, cron worker, AI command interface,
paywall (meter + gate). Plus the two things that spec implies but can't work without: **sender
isolation** (domain verify) and a **small backward-compatible broadcast extension** (the spec's
"worker calls broadcast" is impossible as-is — see below).

### In scope
- Supabase data model (5 tables + RLS)
- Cron scheduler worker + GHA workflow
- AI natural-language → schedule-config command route (two-step, no silent mutations)
- Paywall: usage metering + limit gate (no payment rails)
- Sender isolation: Resend domain-verify flow + per-user sender config
- Broadcast route: backward-compatible per-tenant `segmentId` + sender override
- Minimal static `/billing` page (so the `upgrade_url` CTA isn't a 404)

### Out of scope (this build)
- Email **templates + graphs** rendering → other Claude's lane (integration seam only)
- **Contact-picker UI** (CSV→tag→checkbox) → front-end, flagged in spec, not this build
- **Stripe / payment rails / real billing** → deferred, scoped separately

---

## The one real conflict in the spec (resolved)

The spec says: *"existing broadcast route stays unchanged. Worker calls it the same way a manual
send does."* But the live route (`app/api/email/broadcast/route.ts`) is **single-tenant**:
hardcoded to ONE segment (`getDigestSegmentId()`) and ONE sender (`DIGEST_SENDER_NAME` +
`DIGEST_SENDER_ADDRESS`, lines 53–58). It physically cannot send per-tenant.

**Resolution (your call):** extend the route with **optional** body overrides that fall back to
today's env defaults — so the SWFL digest is byte-for-byte unchanged when overrides are omitted:

```ts
const segmentId  = body.segmentId  ?? getDigestSegmentId();          // env default unchanged
const fromName   = body.fromName   ?? process.env.DIGEST_SENDER_NAME; // ⚠ NOT RESEND_FROM_EMAIL
const fromEmail  = body.fromEmail  ?? process.env.DIGEST_SENDER_ADDRESS;
```

> ⚠ **Naming flag:** your note said `?? process.env.RESEND_FROM_EMAIL`. The live route uses
> `DIGEST_SENDER_NAME` / `DIGEST_SENDER_ADDRESS`. We fall back to the **real** envs, or the
> existing digest's sender silently breaks. Don't introduce `RESEND_FROM_EMAIL`.

Bearer auth + the CAN-SPAM `{{{RESEND_UNSUBSCRIBE_URL}}}` guard stay exactly as they are.

---

## Integration seams (the two cross-lane contracts)

1. **`renderEmailTemplate()` — owned by the templates Claude.** Our cron worker (Unit F) calls
   it as a black box. Expected shape to coordinate on (pin when their plan lands):
   ```ts
   renderEmailTemplate(templateId: string, data: TemplateData, theme?: BrandTheme): Promise<string> // returns email-safe HTML containing {{{RESEND_UNSUBSCRIBE_URL}}}
   ```
   Until it exists, F renders against the current `scripts/email/DigestEmail.tsx` path as a stub
   so F is testable without blocking on the other lane.

2. **Broadcast extension (Unit B)** — the multi-tenant send seam every per-tenant send flows
   through. The **worker** decides the `from` (verified domain → tenant sender; else platform
   default + tenant reply-to); the route just honors the override.

---

## Build units

Each unit: **what · files · model · depends-on · why that model.**
Reuse-first — every unit copies an existing pattern, named below.

### Unit A — Data model migrations  ·  **Sonnet**
- 5 tables: `email_schedules`, `email_contacts`, `email_audiences`, `email_usage`,
  `email_sender_config`. RLS `auth.uid() = user_id` + grants (authenticated + service_role),
  idempotent.
- File: `docs/sql/20260612_email_product.sql` (one file; tables are independent).
- **Reuse:** RLS/grant pattern from `docs/sql/20260612_projects.sql`; column/grant style from
  `docs/sql/20260612_email_subscribers.sql`. Apply via psycopg (creds `.dlt/secrets.toml`),
  verify table existence + row counts.
- **Depends on:** nothing. **Gate for everything.**
- **Why Sonnet:** pure pattern copy; the only judgment (column types, the `audience_slug` /
  `template_id` soft-links) is fully specified.

### Unit B — Broadcast multi-tenant extension  ·  **Opus (small)**
- Add optional `segmentId` / `fromName` / `fromEmail` to the body with env fallbacks (above).
  Preserve bearer auth + CAN-SPAM guard + backward compat.
- File: `app/api/email/broadcast/route.ts`.
- **Depends on:** nothing (route + env only).
- **Why Opus:** tiny but on a **live, compliance-critical** route; risk is regression (breaking
  the SWFL digest / dropping the unsubscribe guard), not line count. RULE 1 flags live-route
  changes for operator diff-review before push.

### Unit C — Contact ingestion  ·  **C1 Sonnet → C2 Opus** (sequential within lane)
- **C1 (Sonnet):** `app/api/email/contacts/upload/route.ts` — CSV upload → parse → store
  `email_contacts` (per `user_id`, `tags[]`). CRUD + parsing, low risk.
- **C2 (Opus):** Resend audience sync — create/find a per-user Resend audience, upsert contacts,
  write `email_audiences (resend_audience_id, contact_count)`.
- **Reuse:** `getMarketingResend()` (full_access) from `lib/email/marketing-client.ts`.
- **Depends on:** A (`email_contacts` + `email_audiences`). **HARD BLOCK per spec.**
- **Why Opus on C2:** new vendor surface (per-user audience creation). **Vendor-First (RULE 1):
  WebFetch the live Resend Audiences/Contacts API in-session** before coding — the repo migrated
  Audiences→Segments once already; verify current surface, don't trust memory.

### Unit D — Sender isolation  ·  **Opus**
- `app/api/email/domain-verify/route.ts` — Resend domain: create → return DNS records → poll
  verified status; write `email_sender_config (from_name, from_email, domain_verified)`.
  Unverified → platform default sender + tenant reply-to; verified → tenant `from_email`.
- **Depends on:** A (`email_sender_config`).
- **Why Opus:** Resend Domains API create/get/verify-polling flow + the verified-gating
  correctness. **Vendor-First: WebFetch the live Resend Domains API in-session.**

### Unit E — Paywall (meter + gate)  ·  **Sonnet**
- `lib/email/usage.ts` — `recordEmailSent(userId, n)` + `checkUsageLimit(userId) →
  {allowed, tier, sent, limit}`; **never throws** (metering must not break a send). Tier limits
  constant: free 50 / starter 500 / growth 2000 / pro 10000. Billing period = calendar month.
- Static `/billing` page: `app/billing/page.tsx` — "pricing / coming soon / contact" so the CTA
  `{error:'limit_reached', tier, upgrade_url:'/billing'}` resolves, not 404s.
- Monthly reset: **prefer period-keyed rows** (`email_usage.billing_period = 'YYYY-MM'`) so usage
  resets implicitly and no reset-cron is needed. If a reset job is still wanted, it's a trivial
  Sonnet GHA (`*/… 1 * *`).
- **Reuse:** `lib/highlighter/meter.ts` (`recordUse` never-throws, `weeklyCount` window pattern).
- **Depends on:** A (`email_usage`).
- **Why Sonnet:** `meter.ts` is a near-exact precedent; counting + threshold. **Flag the gate
  semantics (skip-not-throw, period boundary) for review** — it's the one subtle bit.

### Unit F — Cron scheduler worker  ·  **Opus (worker) + Sonnet (GHA YAML)**
- `scripts/email/run-schedules.mts` (Opus): claim due rows with
  `SELECT * FROM email_schedules WHERE status='active' AND next_run_at <= now()
  **FOR UPDATE SKIP LOCKED**`; per schedule → fetch brain data → `renderEmailTemplate()` (seam) →
  `checkUsageLimit` gate (E; **skip + notify, do not throw**) → resolve sender from
  `email_sender_config` (D) → resolve `segmentId` from `email_audiences` (C) → POST
  `/api/email/broadcast` with overrides (B) → on success `recordEmailSent` + advance
  `next_run_at` / set `last_run_at` **inside the same transaction** → log result.
- **Idempotency is enforced, not aspirational** — `FOR UPDATE SKIP LOCKED` is the mechanism, in
  one transaction per claim. GHA can spawn concurrent/overlapping runs; without the row lock two
  workers pull the same due row before either advances `next_run_at` → double-send. Brief the
  builder on this explicitly — the word "idempotent" in prose is not the contract; the lock is.
- **Stub-template / unsubscribe-token decision (baked):** the broadcast route 400s on HTML missing
  `{{{RESEND_UNSUBSCRIBE_URL}}}`. So (a) **`DRY_RUN` does NOT POST** — it logs the would-send
  payload only (a true dry run never sends), making F testable now without the template lane; and
  (b) on a **real** send F **asserts the token is present before POST** and fails loud if absent.
  Both hold regardless of whether the stub or the delivered template is in use.
- `.github/workflows/email-scheduler.yml` (Sonnet): `*/15 * * * *`, Bun runner, secrets,
  `concurrency.group` to also discourage overlapping GHA runs (belt-and-suspenders with the lock).
- **Reuse:** GHA structure + Bun runner from `.github/workflows/daily-email-digest.yml`; brain
  fetch from `scripts/email/fetch-digest-data.mts`; service-role DB client pattern.
- **Depends on:** A (**migrated + tested — HARD BLOCK per spec**), B, E; wants C + D for real
  tenant sends (testable earlier via env-default fallback + DRY_RUN-mocked broadcast).
- **Why Opus:** orchestration + cadence math (daily / weekly `day_of_week` / monthly at
  `send_hour_et`, **ET→UTC across DST** while cron ticks every 15 min UTC) + **lock-enforced
  idempotency** + per-schedule error isolation + the gate integration.

### Unit G — AI command interface  ·  **Opus**
- `app/api/email/schedule-command/route.ts` — `{projectId, command}` → Claude **forced tool_use
  + JSON schema** → `{action, params, confirmationRequired}`. Two-step: propose → user confirms →
  write `email_schedules`. Intents: create / pause / stop / change-template / change-cadence /
  change-audience. **No silent mutations.**
- **Reuse:** structured-call pattern from `refinery/agents/synthesis-agent.mts` +
  `refinery/agents/anthropic.mts` (`getAnthropic()`, forced `tool_choice`, extract `tool_use`).
  Runtime model: **Haiku 4.5** is likely sufficient for this parse (cheap, structured) — a
  runtime choice, not a build-model choice.
- **Verify the tool_use shape before wiring (Vendor-First, Anthropic surface):** the existing
  extractor in `anthropic.mts` was written against the synthesis models. If Haiku 4.5's
  `tool_use` response shape differs at all, G silently gets **no parse result** (no error, empty
  params). **WebFetch the live Anthropic tool-use docs for Haiku 4.5 in-session** and confirm the
  `forced tool_choice` + `tool_use` block shape match the extractor before relying on it — same
  Vendor-First discipline as C2/D get on Resend.
- **Depends on:** A (`email_schedules`). Independent of F.
- **Why Opus:** prompt + tool-schema design, 6-intent mapping, param validation against real
  schedule fields, and the confirm-gate safety. Judgment-heavy.

---

## Dependency graph — what runs together vs. blocked

```
WAVE 0 (foundation)        WAVE 1 (fan-out — 4 parallel lanes)     WAVE 2 (capstone)
─────────────────          ───────────────────────────────        ─────────────────
A  migrations (Sonnet) ─┬─► C  contacts   C1 Sonnet→C2 Opus ─┐
                        ├─► D  sender iso  Opus               ├─► F  cron worker
B  broadcast ext (Opus)─┤   E  paywall     Sonnet             │   Opus + Sonnet(YAML)
   (no DB dep)          └─► G  AI commands Opus               ┘
                                                              (F also needs B, E)
```

- **Wave 0:** `A ‖ B` run **together** (B has no DB dependency). **Gate: A must be APPLIED +
  verified** before Wave 1 starts.
- **Wave 1:** `C ‖ D ‖ E ‖ G` are **mutually independent** — all four run together, each gated
  only on its table(s) from A. (C is hard-blocked on A per spec; the rest are naturally blocked.)
- **Wave 2:** `F` is the integration hub. Hard-blocked on **A tested**; needs **B** + **E**;
  consumes **C** + **D** for real tenant sends (else runs the env-default/stub path). F's GHA YAML
  (Sonnet) can be written while F's worker (Opus) is in progress.

**Hard ordering (cannot run together):**
- Everything → after **A** (tables exist). Cron worker → after **A tested** (explicit spec block).
- **C1 → C2** (sync reads stored contacts).
- **F** → after **B + E** (it sends through B and gates through E).

**Peak concurrency:** Wave 1 = 4 lanes (Opus: D, G; Sonnet: E; mixed: C).

---

## Model split at a glance

| Unit | Work | Build model | Rationale |
|---|---|---|---|
| A | 5 migrations + RLS | **Sonnet** | Pattern copy (`projects`, `email_subscribers`) |
| B | Broadcast override | **Opus** (small) | Live compliance route; regression risk |
| C1 | CSV upload + store | **Sonnet** | CRUD + parsing |
| C2 | Resend audience sync | **Opus** | New vendor surface; Vendor-First WebFetch |
| D | Domain verify + sender cfg | **Opus** | Resend Domains flow; Vendor-First WebFetch |
| E | Usage meter + gate + `/billing` | **Sonnet** | `meter.ts` precedent; flag gate semantics |
| F | Cron worker | **Opus** | Cadence/DST math, idempotency, orchestration |
| F | GHA YAML | **Sonnet** | Copy `daily-email-digest.yml` |
| G | AI command parser | **Opus** | Prompt/schema design, confirm-gate safety |

---

## Correctness flags (the landmines to brief each builder on)

1. **Broadcast env naming** — fall back to `DIGEST_SENDER_NAME` / `DIGEST_SENDER_ADDRESS`, **not**
   `RESEND_FROM_EMAIL`. (Unit B)
2. **Sender override only when verified** — worker passes `fromEmail` only if
   `email_sender_config.domain_verified`; else platform default + tenant reply-to. (F × D)
3. **Usage gate = skip + notify, never throw** — over-limit must not crash a run or other tenants'
   sends. (E, F)
4. **Cadence is timezone-correct** — `send_hour_et` is Eastern; cron is UTC every 15 min; handle
   EST/EDT. (F)
5. **Idempotency = `FOR UPDATE SKIP LOCKED`** — name the mechanism, claim + advance `next_run_at`
   in one transaction. Concurrent GHA runs racing the same due row is the realistic failure; the
   lock is the contract, not the word "idempotent". (F)
6. **Stub/template carries the unsubscribe token** — broadcast 400s without
   `{{{RESEND_UNSUBSCRIBE_URL}}}`. Decision baked: `DRY_RUN` never POSTs (logs payload); real send
   asserts the token before POST. So F is testable now and safe later. (F)
7. **CAN-SPAM guard intact** — every rendered HTML must keep `{{{RESEND_UNSUBSCRIBE_URL}}}`; the
   broadcast route already hard-rejects without it — don't bypass. (B, F)
8. **Vendor-First (RULE 1)** — WebFetch the live vendor surface in-session before coding:
   Resend **Audiences/Contacts** (C2), Resend **Domains** (D), and **Anthropic tool-use for
   Haiku 4.5** (G — confirm the `tool_use` shape matches the `anthropic.mts` extractor, or G
   silently parses nothing). The repo already had one Audiences→Segments drift.
9. **`/billing` not a 404** — ship the static page in the same change as the gate. (E)
10. **No autonomous push/PR/branch** (memory) — build on `main`, stop after commit, await
   confirmation; A's migration runs directly via psycopg.

---

## Verification (per unit + end-to-end)

- **A:** run migration via psycopg; assert all 5 tables exist + RLS enabled + grants; insert a row
  as `authenticated` and confirm RLS isolates by `user_id` (two-account 404, mirroring the
  `projects` RLS verification).
- **B:** POST broadcast with no overrides → SWFL digest draft unchanged (regression); POST with
  `segmentId`+`fromEmail` → targets the override; POST without unsubscribe token → still 400.
- **C:** upload a sample CSV → rows in `email_contacts`; run sync → Resend audience exists +
  `email_audiences.contact_count` matches.
- **D:** call domain-verify for a test domain → DNS records returned; poll → `domain_verified`
  flips; pre-verify send uses platform sender + reply-to.
- **E:** drive `checkUsageLimit` past a tier limit → `{allowed:false}`, never throws; `/billing`
  returns 200.
- **F:** seed one due schedule → run worker locally with `DRY_RUN` → renders, gates, **logs** the
  would-send payload (no POST), advances `next_run_at` by the right cadence; over-limit schedule
  is skipped + logged, not thrown. **Concurrency test:** start two workers against the same due
  row → exactly one claims it (`FOR UPDATE SKIP LOCKED`), the other sees zero — no double-send.
  **DST test:** a `send_hour_et` schedule fires at the correct UTC instant on both sides of a
  Mar/Nov transition.
- **G:** "send every Tuesday at 7am to my contacts" → `{action:'create', params:{cadence:'weekly',
  day_of_week:2, send_hour_et:7, audience_slug:…}, confirmationRequired:true}`; confirm → row
  written; no write without confirm.
- **E2E:** AI command (G) creates a schedule → worker (F) picks it up when due → renders template
  (seam) → gate (E) → broadcast with tenant sender (B/D) to tenant audience (C) → usage
  incremented. One tenant's over-limit/unverified state never affects another's send.
