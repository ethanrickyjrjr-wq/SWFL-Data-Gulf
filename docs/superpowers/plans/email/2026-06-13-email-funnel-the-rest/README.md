# Email Funnel — "The Rest" (post-engine wedge)

**Status: BRIEF + task index. NOT a status board.** No ⬜/✅ done-markers anywhere in this folder —
open obligations live in the `checks` ledger (RULE 2). This folder is the *what/how* for each task;
the ledger is the *whether-done*. Every claim is grounded in a file read in-session; treat each
design choice as the recommendation and re-audit the named surface before building (RULE 3 C1).

## Why this exists

As of `233fc06` the `/welcome` chat now **promises** the recurring product — `WELCOME_SYSTEM`
(`app/api/welcome/chat/route.ts:16`) leads with *"that same branded, cited market data, auto-emailed
to THEIR clients every week or every day … set up by nothing more than them telling you, in plain
English, what their clients care about."* The engine that backs that sentence is **built but cannot
yet deliver on it.** These tasks close the gap.

## What is already TRUE (do not rebuild)

The recurring send engine exists end-to-end and is **switched off**:

| Piece | File | State |
|---|---|---|
| 5-table model + `auth.uid()` RLS | `docs/sql/20260612_email_product.sql` | written; migration not confirmed applied to prod |
| Claim RPC `FOR UPDATE SKIP LOCKED` | `docs/sql/20260612_email_schedule_claim_fn.sql` | written |
| DI worker core | `lib/email/scheduler.ts` | built, unit-tested |
| Runner adapter | `scripts/email/run-schedules.mts` | built |
| NL command parser (Unit G) | `lib/email/schedule-command.ts` + `app/api/email/schedule-command/route.ts` | built |
| Usage meter + gate | `lib/email/usage.ts` | built |
| Sender resolution | `lib/email/sender-config.ts` | built |
| Grounded deliverable engine | `lib/deliverable/*` | built (welcome free-build seam) |
| GHA cron wrapper | `.github/workflows/email-scheduler.yml` | **cron commented out** |

## The gap (grounded)

1. **No per-schedule scope.** `email_schedules` (`docs/sql/20260612_email_product.sql:21-36`) has
   `project_id` / `audience_slug` / `template_id` — **no ZIP / place / topic column.** `ScheduleRow`
   (`lib/email/scheduler.ts:46-59`) mirrors it.
2. **Same global digest for everyone.** `buildContent(_row)` (`scripts/email/run-schedules.mts:223-228`,
   comment line 224: *"per-tenant content is a later lane"*) ignores the row → mails one cached lake
   snapshot to all tenants.
3. **Parser can't capture a scope.** `SCHEDULE_COMMAND_TOOL` (`lib/email/schedule-command.ts:33-64`),
   `ParsedCommand` (`:77-86`), `rawSchema` (`:110-119`) have no scope param.
4. **No inbound reply-to-send.** No `app/api/email/inbound` route exists.
5. **No billing.** `email_usage.tier` defaults `'free'`; nothing upgrades a tier or charges. No Stripe.
6. **Worker is off.** `email-scheduler.yml:12-13` cron commented; needs migrations applied +
   `DIGEST_BROADCAST_SECRET` set, then uncomment.

## Tasks (recommended order) → check key

| # | Task file | Deliverable | Check key |
|---|---|---|---|
| 01 | `task-01-scope-additive.md` | `scope jsonb` column + parser capture + tests (safe-additive, no send-time change) | `email_scope_column` |
| 02 | `task-02-scoped-content.md` | per-scope content via the grounded engine (makes the copy true) | `email_scoped_content` |
| 03 | `task-03-go-live.md` | apply migrations, set secret, DRY_RUN, uncomment cron | `email_scheduler_f_live_verify` *(existing — do NOT duplicate)* |
| 04 | `task-04-stripe-billing.md` | Stripe checkout + webhook → tier upgrade; `/pricing` paid path | `email_stripe_billing` |
| 05 | `task-05-inbound-reply.md` | Resend inbound webhook → existing parser → confirm | `email_inbound_reply` |

**Order rationale:** 01 is risk-free (ships behind a null check). 02 is the unblock — the moment the
welcome copy becomes literally true. 03 turns the engine on (can interleave with 02 via DRY_RUN). 04
is the revenue path. 05 is the magic upgrade (the schedule-command UI already satisfies "plain
English", so reply-by-email is last).

## Correctness flags (apply to every task)

- **No invention (LOCKED, Phase-3 notes #1):** scoped content routes through `lib/deliverable/*`,
  **never** the chat/un-grounded LLM. Every number cited + freshness token quoted. A made-up SWFL
  number on an agent's logo is a brand-killer and breaks the #1 moat.
- **MOAT / grain:** a scope ZIP must resolve inside the 6-county set (`fixtures/swfl-zip-county.json`)
  via `lib/place-context.ts`; unresolved → park/clarify, never invent below the grain we hold.
- **RULE 3 C2 — extend, don't gate:** scope rides on `email_schedules` + the schedule-command parser;
  inbound reply extends the same parser. No new mandatory pre-materialization gate.
- **Atomic type-lift (Brain-Factory #3):** a new field lands on `ScheduleRow` + `ExistingSchedule` +
  the SQL in one commit.
- **Vendor-First (RULE 1):** WebFetch the live vendor surface in-session before coding — Resend inbound
  (05), Stripe Checkout + webhooks (04); audit the `lib/deliverable` build signature before 02.
- **Backward compatibility:** `scope IS NULL` ≡ today's global digest; existing schedules unchanged
  until a scope is set.

## Companion docs (on `main`)

- Engine build structure → `../2026-06-12-email-product-multitenant/plan.md`
- Welcome conversion funnel (free build / `welcome_sessions` / 20-turn cap) →
  `../2026-06-12-welcome-funnel-phase3-notes.md`
- Conversion-funnel design (Stripe/preview/seeded project) →
  `../../specs/2026-06-11-conversion-funnel-design.md`
