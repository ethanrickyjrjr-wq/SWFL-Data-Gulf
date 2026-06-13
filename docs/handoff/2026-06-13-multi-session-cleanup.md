# Multi-session cleanup — handoff (2026-06-13, ~07:1x UTC)

Written by the autonomous session while operator was asleep ("no rules, figure it out,
push merge squash, clear this up, will handle when I get up"). This is your morning
to-do. Everything below is verified against `git` + the live DB, not assumed.

## State of `main` right now

- `main` is **GREEN**. Tip after this session: the squash-merge of the reply-sensor branch
  (CI: `tsc` exit 0, `bun test` 2194/0). It sits on top of:
  - `a075835` — #88 "It's Alive" activation-delta (merged by operator)
  - `1039d18`, `7663b1a`, `1bbda2d` — my 3 CI-unbreak fixes (see SESSION_LOG)
- **First green main since 00:03 UTC.** The red was never #88 — it was 3 pre-existing
  failures + a typecheck regression I introduced and fixed + the parked zhvi/zori gate-A
  tests not skipping cleanly in CI. All fixed.

## What I did (done, verified)

1. **Unbroke CI** (3 commits) — BRAIN_CATALOG orphan skip (parked home-values/investor-zip),
   projects-route `.select` mock stub, build-digest `import.meta.main`→tsc-safe guard,
   zhvi/zori gate-A `gateDescribe` clean-skip. Verified both runnable + skip paths.
2. **Applied #88's migration to PROD** (`20260613_activation_sequence.sql`). It was
   unapplied while the deployed subscribe route writes `consent_text`/`consent_at` — which
   was silently dropping the entire `email_subscribers` upsert (and the CAN-SPAM consent
   record) on any consent-checked signup. Now applied + `NOTIFY pgrst`. Verified live:
   `email_subscribers` has `consent_at, consent_text, scope`; `prospect_activation` exists (0 rows).
3. **Reviewed + squash-merged the reply-sensor branch** (`claude/buyer-intent-reply-sensor-flt5cn`)
   after a 3-agent fan-out. Did NOT apply its migrations (see below).
4. **Preserved your uncommitted Lane A/B work** on branch **`wip/lane-ab-preserve`**
   (commit `97c24d9`) — nothing lost.

## OUTSTANDING — your action items (priority order)

### 1. Reconcile the `scheduler.ts` / `run-schedules.mts` 3-way divergence (BY HAND)
The reply-sensor branch and your Lane A/B edit the SAME regions with orthogonal features.
**Union wanted, do not pick a side.** Target order inside `processSchedule`:
`segment → usage(+headroom) → sender → 3b reply-Reply-To override → content/render →
dry-run → 6.5 idempotency claim → real-send → record → 8b recordSend`.
- Branch adds: `resolveReplyTo?` (per-send `r-{token}@reply…` address), `recordSend?` (→ `email_sends`).
- Lane A/B adds: `scope_kind/scope_value/topic` row fields, `claimSend?` idempotency (→ `email_send_ledger`),
  segment-before-usage reorder + `usage_headroom` block, hoisted `expectedRecipients`.
- `run-schedules.mts` conflicts the same way — merge in tandem.
- Lane A/B copy is on `wip/lane-ab-preserve` (`git show wip/lane-ab-preserve:lib/email/scheduler.ts`).

### 2. Migrations — 4 distinct tables, NO collision; apply deliberately
- Reply-sensor (on `main`, NOT applied): `docs/sql/20260613_email_sends.sql` (reply-token lookup),
  `docs/sql/20260613_buyer_intent_events.sql`. Both idempotent, additive, RLS `auth.uid()=user_id`.
- Lane A/B (on `wip/lane-ab-preserve`, NOT applied): `20260613_email_send_ledger.sql` (idempotency),
  `20260613_email_schedule_scope.sql` (+ scope column).
- `email_sends` ≠ `email_send_ledger` — different tables/purposes, safe to keep both. The scheduler
  hand-merge decides which `recordSend`/`claimSend` writes which.
- Apply directly per RULE 1. NOTE: `scripts/email/migrate-activation.py` uses strict `tomllib`
  which **chokes on `.dlt/secrets.toml` (line 14)** — use the repo's tolerant regex cred-parse
  (see `refinery/packs/zhvi-zip-latest-gate-a-parity.test.mts:96 dbUri()`) instead.

### 3. Reply-sensor go-live infra (only YOU can do the DNS/Resend parts)
Feature is merged but **dark** (non-breaking: every consumer best-effort). To light it:
- Cloudflare **MX for `reply.swfldatagulf.com`** (value from Resend) + verify.
- Vercel env: `RESEND_WEBHOOK_SECRET`, `REPLY_DOMAIN`; point Resend inbound webhook → `/api/webhooks/resend`.
- **Step-0 proof**: a real (non-test) send → confirm `Reply-To: r-{token}@reply…` in delivered raw headers
  BEFORE trusting the broadcast path (`scripts/email/verify-replyto-proof.mjs`).
- Apply the 2 migrations (#2 above). Then live e2e: known contact → cited auto-reply; unknown → alert-only.
- Checks owed: `reply_domain_mx_live` / `resend_webhook_sig_verified_live` / `inbound_parse_e2e` /
  `autoreply_guard_live` / `alerts_rls_live_verify`. Close ONLY on prod evidence.

### 4. Security follow-up (from review — none blocking, one worth doing soon)
- **MED**: no Svix replay-dedup. At-least-once redelivery duplicates `buyer_intent_events` rows +
  agent alerts. Fix: persist `svix-id` UNIQUE, `INSERT … ON CONFLICT DO NOTHING` short-circuit at
  the top of `processInboundReply` before any send/insert.
- LOW: reply-token written to function logs (`scheduler.ts:~334`, `process-inbound.ts:~198`) — drop/truncate.
- LOW: auto-reply send + `recordEvent` not atomic (bounded by the agent/day=10 breaker).

### 5. Correctness polish (from review — cosmetic)
- `parse-intent.ts:61` topic needles match as substrings, not word-boundaried (`"risk"` in a
  non-flood sentence mislabels). Wrap needles in spaces like the alias scan. Label-only impact.
- `process-inbound.ts:210` — empty model answer still marks `answer_sent=true` and emails an empty
  reply. Treat empty `answer.text` as failed generation (`answerText=null`).

### 6. Lane A/B beyond the scheduler (on `wip/lane-ab-preserve`)
Also carries welcome/middleware/converse edits + `idempotency.ts`/`proposal-nonce.ts` not in the
branch. Assess + land separately. Recover any file: `git checkout wip/lane-ab-preserve -- <path>`.

### 7. #88 activation — still gated, untouched
Migration applied (above). Phase C/D (live sends) remain hard-gated on `city_pulse_supersession`
(due 2026-06-15). `activation-sequence.yml` is `workflow_dispatch` + `DRY_RUN` default true — NO cron. Leave it.

## What I deliberately did NOT do
- Did not apply the reply-sensor migrations (no live consumer until you do the DNS/webhook; staying
  dark is non-breaking; keeps the scheduler hand-merge decision yours).
- Did not reconcile Lane A/B (it's a deliberate hand-merge, not a pick-a-side).
- Did not touch any cron gate or the Phase C/D go-live.
- Did not delete the cloud branches (`claude/buyer-intent-reply-sensor-flt5cn`,
  `claude/activation-delta-sequence-m0fasv`) or `wip/lane-ab-preserve` — yours to clean up.
