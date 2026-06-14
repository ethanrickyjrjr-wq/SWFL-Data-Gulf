# Task 03 — Worker go-live (flip the engine on)

**Check key:** `email_scheduler_f_live_verify` *(EXISTING — already tracked from the Unit F build; do
NOT open a duplicate)* · **Order:** can interleave with Task 02 via DRY_RUN · **Risk:** medium
(operator-gated; turns on real sends).

## Goal

Take the built-but-off multi-tenant worker live, in the safe order the workflow file already documents.

## Grounded refs

- `.github/workflows/email-scheduler.yml:4-15` — the "GO-LIVE ORDER" comment + the commented `*/15`
  cron (line 12-13) + `workflow_dispatch` (kept for DRY_RUN testing).
- `.github/workflows/email-scheduler.yml:40-50` — the env block (`DIGEST_BROADCAST_SECRET`,
  `NEXT_PUBLIC_SITE_URL`, `SUPABASE_*`, `BRAINS_SUPABASE_*`, `DIGEST_SENDER_*`).
- `scripts/email/run-schedules.mts:98-114` — `requireEnv()` (fails loud without the secret /
  `NEXT_PUBLIC_SITE_URL` on a real run).
- `scripts/email/run-schedules.mts:125-136` + `lib/email/scheduler.ts:265-273` — DRY_RUN never POSTs.
- `docs/sql/20260612_email_product.sql`, `…_schedule_claim_fn.sql`, `…_usage_increment_fn.sql` — the
  migrations to apply.

## Steps (sequence is load-bearing)

1. Apply the 4 `docs/sql/20260612_email_*.sql` migrations to prod (psycopg, direct — RULE 1). Verify
   tables + the `claim_due_email_schedules` RPC + grants exist; two-account RLS 404 check (mirror the
   `projects` RLS verification).
2. Set GHA secret `DIGEST_BROADCAST_SECRET` (confirm it matches Vercel); confirm the other env keys in
   `email-scheduler.yml:42-49` are present.
3. `workflow_dispatch` a **DRY_RUN** — confirm it claims due rows, renders, gates, and logs the
   would-send payload **without POSTing**. With Task 02 in, confirm the per-scope content is right.
4. First real send: dispatch with `dry_run=false` against one seeded active schedule; confirm a
   `kind:"sent"` outcome + `recordEmailSent` increment.
5. Uncomment the `*/15` cron (`email-scheduler.yml:12-13`). Overlap is guarded by `concurrency.group`
   + `FOR UPDATE SKIP LOCKED`.

## Done when

- Migrations applied + verified in prod; secret set.
- DRY_RUN green; one real send verified (`sent` outcome + usage incremented).
- `*/15` cron live; concurrent runs proven safe (no double-send).

## Note — do not conflate with the Phase-2 digest cron

The open check `First automated digest cron send (Mon-Fri 10:00 UTC)` is the **single-tenant marketing
broadcast** (Phase 2), a different cron from this `*/15` multi-tenant worker. Close them independently.

> Status lives in the `checks` ledger (`email_scheduler_f_live_verify`), not in this file.
