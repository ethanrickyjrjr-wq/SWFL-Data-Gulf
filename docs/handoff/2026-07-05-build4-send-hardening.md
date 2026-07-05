# HANDOFF — Build 4: send hardening (provider-side idempotency + send history)

## Mission

Adopt three researched reliability patterns so a double-fired cron or a crashed run can never
double-send or silently lose a week: (1) Resend's NATIVE `Idempotency-Key` header on every send,
dual-layered with our existing claim; (2) capped send-history visible on the schedule row;
(3) confirm/keep idempotency at recipient/message grain, not run grain.

## Why these three (evidence already gathered — do not re-research from memory)

GitHub prior-art sweep, 07/05/2026 (full findings in the SESSION_LOG entry "SPEC: agent-first
homepage re-flip", research bullet 3):
- dubinc/dub `apps/web/lib/email/queue-batch-email.ts` — ONE deterministic key used as BOTH the queue
  dedup id AND the Resend `Idempotency-Key` header, with `-batch-N` suffixes when chunking.
- resend/resend-node `src/resend.ts` — the SDK natively accepts `options.idempotencyKey` on send and
  batch. RULE 0.4 STILL APPLIES: verify the CURRENT SDK surface + our installed version against live
  Resend docs (crawl4ai) before wiring — pin the exact option name and semantics in your spec.
- listmonk `internal/manager/` — per-recipient send state as the resume ledger (crashed campaign
  resumes without re-sending delivered rows).
- Anmol-Baranwal/hndigest — `send_history` (last 50) on the schedule row for drift/failure
  visibility, and cancel-and-recreate on schedule mutation.

## Read first

1. `docs/superpowers/specs/2026-07-05-agent-first-homepage-design.md` — ladder item 4.
2. `lib/email/idempotency.ts` + `lib/email/scheduler.ts` (`processSchedule`: claim → POST → record →
   re-arm) + `scripts/email/run-schedules.mts` (claimSend/releaseSend, crash reaper, loud-fail exit).
   Map EXACTLY where our claim happens relative to the Resend POST before proposing anything.
3. `lib/email/__tests__/scheduler.test.ts` — the DI seams you'll extend.
4. Registration: `node scripts/new-build.mjs send-hardening "<label>"`. Small enough that the spec
   can be short; brainstorming still applies but this is a mostly-settled scope — confirm with the
   operator that the three patterns above ARE the scope, then spec+plan.

## Shape of the work (validate against code, don't trust this blindly)

- Derive a deterministic occurrence key (e.g. schedule id + occurrence window + recipient) and pass
  it to Resend on every send path the scheduler owns (single + batch + blast if in scope — check
  whether blast sends share the same POST root before including them).
- Add capped send-history to the schedule row IF a JSON column already exists to hold it; if it
  needs a new column, that's a migration — idempotent SQL, run directly, verify, per RULE 1.
- Prove the recipient-grain resume property with a test: kill mid-batch, re-run, no double-send.

## Landmines

- The scheduler files are the most parallel-contested files in the repo — check claims/dirty state
  first; if another session holds them dirty, coordinate or wait.
- NEVER send a real email while testing — all tests through the DI seams; any live-send proof is the
  operator's. The `*_live_verify` check is operator-closed.
- A 07/04 incident (silent 503 dropped sends) produced the loud-fail exit — do not weaken it.
- Resend key env names: multiple RESEND_* keys exist in `.env.local` — the scheduler's is the one
  its code reads; don't guess from the env file.

## Definition of done

- Every scheduler send POST carries a deterministic provider idempotency key (verified against live
  Resend docs); duplicate-fire test proves at-most-once at BOTH layers.
- Send history visible per schedule (bounded); failure path writes it too.
- All existing scheduler/idempotency tests green untouched; `bunx next build` green; SESSION_LOG;
  STOP before push.
