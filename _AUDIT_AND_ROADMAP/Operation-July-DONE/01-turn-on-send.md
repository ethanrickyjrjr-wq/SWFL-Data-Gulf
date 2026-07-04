# 01 — Turn on SEND (fire ONE real scheduled email)

- **Status:** ✅ Taken care of by operator (2026-07-04) — DB fn applied, gh secrets/vars being set, fake rows cleared, cron path in progress. Moved out of the open work.
- **Owner:** OPERATOR (Claude may run the SQL under RULE 1; secrets/vars/upgrade are keyboard-only)
- **Source:** autopsy §4 + §7 runbook
- **Check key:** `email_scheduler_f_live_verify`

## Why this is one file, not six

The four blockers + dry-run + first live send are **one atomic outcome** and **strictly ordered** —
step 6 cannot finish before 1–5. This is THE launch build. Legs 1–3 (recipe → edit → schedule-create)
already work; a real live schedule row exists (id=6). SEND has never fired once. Zero emails, ever.

## Steps (in order)

1. **Apply the claim DB function to prod, then prove it exists.**
   - Apply `docs/sql/20260612_email_schedule_claim_fn.sql` to the prod Supabase DB.
   - (Claude can run this — SQL migrations are RULE 1 "run directly." Say the word.)

2. **Set `DIGEST_BROADCAST_SECRET`** in GHA **and** Vercel env (values must match):
   ```
   gh secret set DIGEST_BROADCAST_SECRET -R ethanrickyjrjr-wq/SWFL-Data-Gulf
   ```
   Absent from all 36 GHA secrets today; the worker throws at `run-schedules.mts:150-152` without it.

3. **Fix `DIGEST_SENDER_ADDRESS`** — it currently holds a *postal* address
   (`"[operator home address - REDACTED]"`) read straight into the from-header.
   ```
   gh variable set DIGEST_SENDER_ADDRESS -R ethanrickyjrjr-wq/SWFL-Data-Gulf --body "hello@swfldatagulf.com"
   ```
   Use a **verified Resend sending domain/address.** Put the CAN-SPAM mailing address in a SEPARATE
   variable, not this one. (Session §6 added guards so this now fails loud instead of a silent Resend-400.)

4. **Delete the two fake schedule rows** (SELECT-first to confirm):
   ```sql
   DELETE FROM email_schedules WHERE id IN (1,2);  -- the __dryrun_test__ / seg_drytest_placeholder rows
   ```

5. **Uncomment the cron** — `.github/workflows/email-scheduler.yml:12-13` (`schedule:` block), diff-review, push.
   The worker has literally never run (`gh run list --workflow=email-scheduler.yml` = empty).

6. **Dry-run, then live send.**
   - `workflow_dispatch` a DRY_RUN first (never been done); confirm previews.
   - Then trigger a real send.

## Done when (live proof)

- `SELECT proname FROM pg_proc WHERE proname='claim_due_email_schedules';` returns **1 row**.
- `email_sends` gains a real row from a live scheduled run (NOT a dry-run, NOT the hardcoded digest).
- `email_schedules` no longer contains ids 1,2.
- `node scripts/check.mjs close email_scheduler_f_live_verify` — closed on the live send above.

> Blocks a *live scheduled* send even after code is clear: Resend free tier = 1 email/day
> (see `07-upgrade-resend-plan.md`).

---
When done: flip Status to ✅, close the check, and `git mv` this file to `../Operation-July-DONE/`.
