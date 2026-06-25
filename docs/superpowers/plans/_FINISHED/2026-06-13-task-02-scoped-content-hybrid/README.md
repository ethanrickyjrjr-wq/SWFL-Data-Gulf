# Task 02 — Scoped email content (hybrid: cards now, prose-ready)

**Status: BRIEF + step index. NOT a status board.** Open obligations live in the `checks` ledger
(`email_scoped_content`), never as ✅/⬜ markers here (RULE 2). Every grounded ref was read in-session; re-audit
each named surface before building (RULE 3 C1).

## Context

`/welcome` chat now **promises** a branded, cited, per-place market email auto-sent to an agent's clients
(`app/api/welcome/chat/route.ts` `WELCOME_SYSTEM`). The recurring engine is built and switched-off-capable, but
every tenant still gets ONE global digest — `buildContent(_row)` at `scripts/email/run-schedules.mts:225`
ignores the row. Task 01 (the `scope_kind`/`scope_value`/`topic` columns + parser capture) already shipped.
**Task 02 makes the promise literally true:** when a schedule carries a scope, send a real cited one-pager about
that scope; `scope == NULL` keeps today's global digest byte-for-byte.

## Locked decision (operator)

**Hybrid — cards now, prose-ready.**
- Reuse `buildWelcomeAnswer` (`lib/welcome/answer.ts`) **as-is**. Do **NOT** call `buildDeliverableNarrative`
  → zero LLM, **$0 / send**, strongest no-invention guarantee.
- Define `ScopedContent` **inline** in the assembly file. Shape exactly:
  `{ cards: WelcomeMetric[]; scope_kind: string; scope_value: string; topic: string | null }`.
  No separate abstraction file, no generic base types. **If the type def exceeds 30 lines → drop the wrapper and
  ship Option 1 (cards-only).**
- Wire `row.scope_kind` / `row.scope_value` / `row.topic` (already on `ScheduleRow:64-66`). The task-02 doc's
  `row.scope` jsonb reference is **stale — ignore it**.
- **No claim-RPC change** — `claim_due_email_schedules` returns `s.*` (`SETOF email_schedules`), so the new
  columns flow through automatically.

## Why hybrid beats the original Task-02 plan

The grounded engine (`buildDeliverableNarrative`) makes one Sonnet call per scope per cycle and needs a
SnapshotItem conversion + lint loop. `buildWelcomeAnswer` is already deterministic, MOAT-gated, and cited — a
**stronger** no-invention guarantee at **$0**. We keep the `ScopedContent` payload structured so a narrative
layer can drop in later without a rewrite.

## Scope contract (from `docs/sql/20260613_email_schedule_scope.sql`)

- `scope_kind ∈ {NULL,'zip','place','county'}` — the geographic grain the user named.
- `scope_value` — lowercase+trimmed value as the user said it (`'cape coral'`, `'33904'`, `'lee'`). **`'place'`
  → ZIP expansion is DEFERRED to build-time** (this lane owns it).
- `topic` — free-text lowercase (`'flood'`, `'prices'`, …). NO enum; **this lane owns topic→card mapping.**
- DEFAULT: `scope_kind IS NULL AND topic IS NULL` → today's global SWFL digest. No `'general'` magic value.

## Steps (each a handoff unit; owner in brackets)

| # | File | Deliverable | Owner |
|---|---|---|---|
| 00 | `step-00-parity.md` | Fire `gate-a-parity.yml`, confirm green==ran, close `gate_a_parity_job_ran` | Opus/any |
| 01 | `step-01-substrate-and-contract.md` | Verify scope cols live + audit dossier assembler; fix `ScopedContent` + `resolveScope` contract | **Opus** |
| 02 | `step-02-fact-assembly.md` | `buildWelcomeAnswer` wiring + topic filter (the no-invention spine) | **Opus** |
| 03 | `step-03-render-and-wire.md` | `renderScopedBody` + scope-aware subject + `buildContent` branch + in-run cache | Sonnet (03a) / **Opus** (03b) |
| 04 | `step-04-tests.md` | resolver/topic/assembly/regression unit tests | Sonnet |
| 05 | `step-05-verify-ship.md` | DRY_RUN verify, diff-review, SESSION_LOG, close check, safe-push | **Opus** |

**Sequence & parallelism:** Opus fixes the `ScopedContent` type + `resolveScope` signature FIRST (step 01 — the
contract). Then Sonnet parallelizes render-mapping (03a) + test scaffolding (04) **while** Opus does fact
assembly (02) + the `buildContent` branch (03b). Converge at step 05.

**Size:** M (~1–1.5 days) — smaller than the original estimate; the hybrid call drops the narrative engine, the
SnapshotItem conversion, and the per-send LLM cost gate.

## Correctness flags (apply to every step)

- **No invention (LOCKED):** every figure rides from `buildWelcomeAnswer` (cited + gated). Never the chat LLM,
  never a recomputed number.
- **MOAT / grain:** a resolved scope ZIP must exist in `fixtures/swfl-zip-county.json` (6-county) via
  `lib/place-context.ts`; unresolvable → fall back to the global digest, never invent below grain.
- **RULE 3 C2 — extend, don't gate:** rides on `email_schedules` + the existing render→broadcast path. No new gate.
- **Backward compat:** `scope_kind==NULL && topic==NULL` ≡ today's global digest, byte-for-byte (the regression
  contract).
- **RULE 1:** the content path is `/api/email/*`-adjacent → **diff-review before push.**

## Handoffs — NOT in this lane (need operator input/action)

1. **Go-live flip** (`email_scheduler_f_live_verify`) — hard gate: a non-residential CAN-SPAM sender address
   from the operator + apply the 4 email migrations + set `DIGEST_BROADCAST_SECRET` in Vercel + uncomment the
   cron (`.github/workflows/email-scheduler.yml`). Task 02 is DRY_RUN-verifiable without go-live.
2. **Welcome permits hero card** (`welcome_permits_hero_card`, due Jun 29) — operator decision: clean county
   permit COUNT / saturation % / leave out. One-line add to `HERO_CARDS` in `lib/welcome/answer.ts`.
3. **Tasks 03/04/05** (go-live / Stripe / inbound reply) follow per `../2026-06-13-email-funnel-the-rest/README.md`.

## Companion docs (on `main`)

- Original funnel brief → `../2026-06-13-email-funnel-the-rest/` (task-02 doc partly superseded here).
- Engine build structure → `../2026-06-12-email-product-multitenant/plan.md`.
