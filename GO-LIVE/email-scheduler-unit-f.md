# GO-LIVE — Unit F: Multi-Tenant Email Cron Scheduler

**Status:** BUILT + on `origin/main`, **NOT live** (schedule paused, migration not applied, one GHA secret missing).
**Plan:** `docs/superpowers/plans/2026-06-12-email-product-multitenant/plan.md` (Wave 2 capstone).
**Ledger check:** `email_scheduler_f_live_verify` (open — close on first verified live run).

## What it is

A GHA cron (`*/15`, currently commented out) runs `scripts/email/run-schedules.mts`. Per due
`email_schedules` row it: claims the row with `FOR UPDATE SKIP LOCKED` (via the `claim_due_email_schedules`
RPC), gates on usage (skip + notify, never throw), renders the email + injects the unsubscribe token,
resolves the tenant sender (verified domain → tenant `from`; else platform default + reply-to), resolves
the audience → Resend segment, POSTs `/api/email/broadcast` with `send:true`, records usage, and re-arms
`next_run_at` via the shared `computeNextRunAt` (DST-correct ET→UTC). Two concurrent runs get disjoint
batches → no double-send. DRY_RUN is read-only (plain select, never the parking RPC, never POSTs).

Code: `lib/email/scheduler.ts` (pure DI core) · `scripts/email/run-schedules.mts` (runner) ·
`docs/sql/20260612_email_schedule_claim_fn.sql` (claim RPC) · `.github/workflows/email-scheduler.yml` (GHA).
Commits: `63dbbf1` (worker) · `982c3d3` (review fixes) · `616dd3b` (GHA). 183 `lib/email` tests green.

---

## Go-live — DO THESE IN ORDER

### 1. Apply the claim RPC migration (direct Postgres)

> Was firewalled in the build session (5432 unreachable). Run from a machine with direct PG access.
> The worker's claim RPC returns 404 until this lands.

```bash
python -c "
import tomllib, psycopg, pathlib
c = tomllib.load(open('.dlt/secrets.toml','rb'))['destination']['postgres']['credentials']
uri = f\"postgresql://{c['username']}:{c['password']}@{c['host']}:{c['port']}/{c['database']}\"
sql = pathlib.Path('docs/sql/20260612_email_schedule_claim_fn.sql').read_text()
with psycopg.connect(uri, connect_timeout=20) as conn:
    conn.execute(sql); conn.commit()
print('migration applied')
"
```

Verify (expect one row, args `p_now timestamp with time zone, p_limit integer`):

```sql
select proname, pg_get_function_identity_arguments(oid)
from pg_proc where proname = 'claim_due_email_schedules';
```

The migration is idempotent (`CREATE OR REPLACE` + idempotent grants) — safe to re-run.

### 2. Set the GHA secret `DIGEST_BROADCAST_SECRET`

> It's the one F secret not yet set in GHA. It MUST equal the Vercel `DIGEST_BROADCAST_SECRET`
> (the broadcast route validates the bearer against its own env). Already set in GHA:
> `NEXT_PUBLIC_SITE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`; vars `DIGEST_SENDER_NAME/ADDRESS`.

```bash
# value = the SAME string as Vercel's DIGEST_BROADCAST_SECRET env
gh secret set DIGEST_BROADCAST_SECRET -R ethanrickyjrjr-wq/brain-platform --body "<vercel-value>"
gh secret list -R ethanrickyjrjr-wq/brain-platform | grep DIGEST_BROADCAST_SECRET   # confirm present
```

Also confirm Vercel actually has `DIGEST_BROADCAST_SECRET` set (else the route 503s `not_configured`).

### 3. Uncomment the `schedule:` trigger

In `.github/workflows/email-scheduler.yml`, un-comment the two lines:

```yaml
  schedule:
    - cron: "*/15 * * * *"
```

Commit + push (it's a live-cron change → operator diff-review per RULE 1). The `concurrency.group`
+ the row lock guard overlap.

---

## Verify (before closing the check)

1. **DRY_RUN** — GitHub → Actions → *Email Scheduler* → *Run workflow* → `dry_run = true`.
   Expect: logs the would-send payload, **no** POST, exits 0, **no** DB writes.
2. **Real run** — after step 3, seed one due `email_schedules` row; confirm a send via
   `/api/email/broadcast`, `email_usage.sent_count` increments, and `next_run_at` advances by the
   correct cadence (check across a DST boundary if possible).
3. **No double-send** — trigger two runs ~simultaneously; confirm exactly one claims the due row
   (`FOR UPDATE SKIP LOCKED`), the other sees an empty batch.
4. **Over-limit** — a tenant past their tier limit is **skipped + logged**, never throws, other
   tenants unaffected.
5. **Close the check:**
   ```bash
   node scripts/check.mjs close email_scheduler_f_live_verify "live: claim+send+advance verified; concurrent runs no double-send"
   ```

## Rollback

Re-comment the `schedule:` block (back to dispatch-only) and push. The claim RPC is idempotent and
inert when unused — safe to leave applied. No data migration to undo.

## Watch

Until step 3, the workflow is **dispatch-only** — no scheduled runs, no failing-cron noise.
The worker fails loud (`exit 1`) if `DIGEST_BROADCAST_SECRET` or `NEXT_PUBLIC_SITE_URL` is missing on a
real run, so a misconfigured go-live is visible, never a silent half-send.
