# Email Funnel — "The Rest" (post-engine wedge)

**Status: BRIEF, not a status board.** No ⬜/✅ markers here — open obligations live in the
`checks` ledger (RULE 2). This documents the gap between the multi-tenant email **engine**
(built + switched off) and what the `/welcome` chat copy now **promises**, plus how to close it.
Every claim below is grounded in a file read in-session; treat the design choices as the
recommendation, re-audit the named surfaces before building (RULE 3 C1).

Companion docs (already on `main`, do not re-litigate):

- Engine build structure → `docs/superpowers/plans/2026-06-12-email-product-multitenant/plan.md`
- Welcome conversion funnel (free build / `welcome_sessions` / 20-turn cap) →
  `docs/superpowers/plans/2026-06-12-welcome-funnel-phase3-notes.md`
- Conversion-funnel design (Stripe/preview/seeded project) →
  `docs/superpowers/specs/2026-06-11-conversion-funnel-design.md`

---

## What is already TRUE (do not rebuild)

The recurring send engine **exists end-to-end** — it is just **switched off**. Verified files:

| Piece | File | State |
|---|---|---|
| 5-table data model + `auth.uid()` RLS | `docs/sql/20260612_email_product.sql` | written; **migration not confirmed applied to prod** |
| Claim RPC `FOR UPDATE SKIP LOCKED` | `docs/sql/20260612_email_schedule_claim_fn.sql` | written |
| Usage-increment fn | `docs/sql/20260612_email_usage_increment_fn.sql` | written |
| Pure DI worker core | `lib/email/scheduler.ts` (`processSchedule`/`processBatch`/`reapOrphans`) | built, unit-testable |
| Runner adapter | `scripts/email/run-schedules.mts` | built |
| NL command parser (Unit G) | `lib/email/schedule-command.ts` + `app/api/email/schedule-command/route.ts` | built |
| Cadence/DST math | `lib/email/schedule-cadence.ts` (`computeNextRunAt`) | built |
| Usage meter + gate (Unit E) | `lib/email/usage.ts` | built |
| Sender resolution (Unit D) | `lib/email/sender-config.ts` (`resolveSender`) | built |
| Grounded deliverable engine | `lib/deliverable/*` (`build.ts`, `assemble.ts`, `brand-theme.ts`) | built (welcome free-build seam) |
| GHA cron wrapper | `.github/workflows/email-scheduler.yml` | **cron commented out** (`workflow_dispatch` only) |

And as of this session the `/welcome` chat now **promises** the recurring product:
`app/api/welcome/chat/route.ts:16` (`WELCOME_SYSTEM`) leads with "that same branded, cited market
data, **auto-emailed to THEIR clients** every week or every day … set up by nothing more than them
telling you, in plain English, what their clients care about." The engine must be able to deliver
on that sentence. Right now it cannot — three gaps + go-live.

---

## The gap (why the copy is not yet true)

1. **A schedule cannot store a scope.** `email_schedules`
   (`docs/sql/20260612_email_product.sql:21-36`) has `project_id`, `audience_slug`, `template_id` —
   **no ZIP / place / topic column.** `ScheduleRow` (`lib/email/scheduler.ts:46-59`) mirrors that.
2. **The send is the same global digest for everyone.** `buildContent(_row)`
   (`scripts/email/run-schedules.mts:223-228`) ignores the row — comment line 224: *"per-tenant
   content is a later lane."* It mails `buildBody(getDigest())` (one cached global lake snapshot) to
   every tenant. "Cape Coral flood weekly" is impossible.
3. **The parser cannot capture a scope.** `SCHEDULE_COMMAND_TOOL`
   (`lib/email/schedule-command.ts:33-64`), `ParsedCommand` (`:77-86`), and `rawSchema` (`:110-119`)
   have no scope param. The model literally has nowhere to put "Cape Coral flood."
4. **Inbound reply-to-send does not exist.** No `app/api/email/inbound` route (confirmed by glob).
   "Set it up by telling you in plain English" works today only via the schedule-command **route/UI**,
   not by replying to the branded email.
5. **No billing.** `email_usage.tier` defaults `'free'` (`:123`); the gate reads tier/limit but
   nothing upgrades a tier or charges. The new welcome footer links `/pricing` → must resolve to a
   real paid path. No Stripe anywhere (grep: doc/spec mentions only, zero route/lib).
6. **The worker is off.** `email-scheduler.yml:12-13` cron is commented; go-live needs the
   migrations applied + `DIGEST_BROADCAST_SECRET` set, then uncomment.

---

## Slice 1 — Per-schedule scope (the wedge; makes the copy literally true)

This is the high-leverage slice and splits into a **safe-additive** half (1a+1b, no behavior change)
and a **wiring** half (1c, changes what sends).

### 1a — DB: add a nullable scope to `email_schedules` (safe-additive)

Recommend a single nullable `scope jsonb` column (mirrors the `brand jsonb` pattern in the planned
`welcome_sessions`), backward-compatible by construction:

```sql
ALTER TABLE public.email_schedules ADD COLUMN IF NOT EXISTS scope jsonb;
-- shape: { "raw": "Cape Coral flood", "zip": "33904", "place": "Cape Coral",
--          "county": "12071", "topic": "flood" }  -- any field nullable
NOTIFY pgrst, 'reload schema';
```

`scope IS NULL` → today's global digest (zero regression for existing rows). Idempotent; run direct
via psycopg (creds `.dlt/secrets.toml`, RULE 1), verify column exists. Add `scope: ScopeJson | null`
to `ScheduleRow` (`lib/email/scheduler.ts:46`) and `ExistingSchedule`
(`lib/email/schedule-command.ts:66`) in the **same commit** (atomic type-lift, Brain-Factory rule 3).

### 1b — Parser: capture the scope phrase (safe-additive)

Add one `scope` string param to `SCHEDULE_COMMAND_TOOL` (`:40-61`), `ParsedCommand` (`:77`),
`rawSchema` (`:110`), and a sentence to `buildSystemPrompt` (`:90`) telling the model to copy the
user's place/topic phrase verbatim into `scope` (e.g. "Cape Coral flood"). Echo it in
`summarizeCommand` (`:188`) so the confirm line reads "… that sends every Monday at 7am **about Cape
Coral flood** to …". **Resolution stays in the route, not the model** — the route normalizes the raw
phrase to `{zip, place, county, topic}` via the existing shared helper `lib/place-context.ts`
(`buildPlaceContext`, the gazetteer crosswalk) so we reuse one source of truth and the **MOAT** holds:
a scope ZIP must resolve inside the 6-county set (`fixtures/swfl-zip-county.json`) or the schedule is
parked / clarified, never invented. 1a+1b ship with unit tests and change **nothing** at send time
until 1c reads the column.

### 1c — Content: build per-scope, through the GROUNDED engine (wiring)

Replace the global `buildContent(_row)` (`scripts/email/run-schedules.mts:223`) so that when
`row.scope` is set it builds a **real, cited** scoped one-pager via the grounded deliverable engine
(`lib/deliverable/build.ts` / `assemble.ts` + `brand-theme.ts`), seeded with the scope + the tenant's
brand — the **same engine the welcome free-build uses**. `scope == null` keeps the global-digest path
unchanged.

> **LOCKED correction (Phase-3 notes #1, do not re-litigate): the scoped content MUST route through
> the grounded engine, NEVER the chat/un-grounded LLM.** A made-up SWFL number on an agent's logo is a
> brand-killer on first check and breaks the #1 moat. Every figure carries its source + a live
> freshness token. Audit the `lib/deliverable/*` entrypoint signature in-session before wiring (RULE 3
> C1) — pin the exact `build()` input shape; do not trust this paragraph as the contract.

Keep the per-run lake fetch (`getDigest`) for the global path; the scoped path resolves its own data.
Watch cost: a scoped grounded build per tenant per cycle is real money — gate it behind the usage
meter (already wired, `lib/email/usage.ts`) and cache by resolved scope within a run.

---

## Slice 2 — Inbound reply-to-send ("just reply to the email")

New `app/api/email/inbound/route.ts`: a Resend **inbound webhook** → verify signature → match
sender → feed the reply body straight into the **existing** `schedule-command` parser
(`lib/email/schedule-command.ts`) → reply with the plain-English confirm line → write on confirm.
This is an **extension of the existing schedule-command seam, not a new gate** (RULE 3 C2). Reuses the
two-step propose→confirm contract already built. **Vendor-First (RULE 1): WebFetch the live Resend
inbound-email / webhook-signature docs in-session** before coding the parse + verification — do not
trust memory of the payload shape.

Not strictly required for the welcome copy to be true (the schedule-command **UI** already satisfies
"tell it in plain English"), so this is **lower priority than Slice 1**. It is the magic-feeling
upgrade, not the unblock.

---

## Slice 3 — Billing (Stripe) — the `/pricing` → paid path

The welcome footer now points at `/pricing`; the meter already tracks `tier`/limit but nothing
charges. Build Stripe Checkout + webhook → on `checkout.session.completed` / subscription change,
upsert `email_usage.tier` (free 50 / starter 500 / growth 2000 / pro 10000, per engine plan Unit E).
**Reconcile, don't re-invent:** `docs/superpowers/specs/2026-06-11-conversion-funnel-design.md`
already designed Stripe checkout + preview + seeded project — carry it forward, map its tiers to the
`email_usage.tier` enum. **Vendor-First: WebFetch the live Stripe Checkout + webhook docs in-session.**
Map Stripe `customer` ↔ Supabase `user_id` (add `stripe_customer_id` to a profile/usage row).
Independent of Slices 1–2; required for revenue but not for the demo to be honest.

---

## Slice 4 — Go-live wiring (flip the engine on)

Sequenced, per `email-scheduler.yml:6-7` ("GO-LIVE ORDER"):

1. Apply the 4 `docs/sql/2026-06-12_email_*.sql` migrations to prod (psycopg, direct — RULE 1), verify
   tables + RPC + grants exist (two-account RLS 404 check, mirroring the `projects` RLS verification).
2. Set GHA secret `DIGEST_BROADCAST_SECRET` (+ confirm `NEXT_PUBLIC_SITE_URL`, `SUPABASE_*`,
   `BRAINS_SUPABASE_*`, `DIGEST_SENDER_*` already present — `email-scheduler.yml:42-49`).
3. `workflow_dispatch` a **DRY_RUN** first (logs the would-send payload, never POSTs — guaranteed by
   `run-schedules.mts:125-136` + `scheduler.ts:265-273`). Confirm a seeded scoped schedule renders the
   right per-scope content.
4. Uncomment the `*/15` cron (`email-scheduler.yml:12-13`). Concurrency is guarded two ways
   (`concurrency.group` + `FOR UPDATE SKIP LOCKED`).

> **Distinct from the open check `First automated digest cron send (Mon-Fri 10:00 UTC)`** — that is the
> single-tenant marketing **broadcast** (Phase 2 digest), a different cron from this `*/15`
> multi-tenant worker. Don't conflate the two when closing checks.

---

## Recommended order & "ship now vs. decide later"

1. **Slice 1a + 1b + tests** — safe-additive, no send-time behavior change; the cleanest first PR.
2. **Slice 1c** — wires per-scope content; the moment the copy becomes true. (live-route-adjacent →
   diff review before push, RULE 1.)
3. **Slice 4** — go-live the worker (can interleave with 1c via DRY_RUN).
4. **Slice 3 (Stripe)** — revenue path; reconcile the existing funnel spec.
5. **Slice 2 (inbound reply)** — the magic upgrade; last because the UI already covers the promise.

---

## Correctness flags (carry-forward + new)

- **No invention (locked):** scoped content goes through `lib/deliverable/*`, never the chat LLM.
  Every number cited + freshness token quoted. (Phase-3 #1)
- **MOAT / scope grain:** a scope ZIP must resolve inside the 6-county set
  (`fixtures/swfl-zip-county.json`) via `lib/place-context.ts`; unresolved → park/clarify, never invent
  a number below the grain we hold.
- **RULE 3 C2 — extend, don't gate:** scope rides on `email_schedules` + the schedule-command parser
  (existing seams); inbound reply extends the same parser. No new mandatory pre-materialization gate.
- **Atomic type-lift (Brain-Factory #3):** the `scope` field lands on `ScheduleRow` +
  `ExistingSchedule` + the SQL in one commit.
- **Vendor-First (RULE 1):** WebFetch live docs in-session before coding — Resend inbound (Slice 2),
  Stripe Checkout + webhooks (Slice 3). Audit the `lib/deliverable` build signature before Slice 1c.
- **Operation Dumbo Drop:** N/A — the lake sources feeding scoped builds are already auto-ingested.
- **Backward compatibility:** `scope IS NULL` ≡ today's global digest; existing schedules are
  byte-for-byte unchanged until a scope is set.

## Obligations → `checks` ledger (open these, don't track here)

- `email_scope_column` — Slice 1a+1b shipped (additive scope + parser capture + tests).
- `email_scoped_content` — Slice 1c (per-scope grounded build wired; live-route diff-reviewed).
- `email_worker_golive` — Slice 4 (migrations applied, secret set, DRY_RUN green, cron uncommented).
- `email_inbound_reply` — Slice 2 (Resend inbound webhook → parser → confirm).
- `email_stripe_billing` — Slice 3 (Stripe checkout + webhook → tier upgrade).
