# Un-closeable check without live prod proof (Operation July task 16)

- **Slug:** `uncloseable-check-proof` · **Check:** `uncloseable_check_proof_live_verify`
- **Status:** design (operator picked both forks 2026-07-05) — DB-trigger + two-tier
- **Owner:** SESSION (Opus build)
- **Source:** autopsy §9.1 + §10 · task file `_AUDIT_AND_ROADMAP/Operation July/16-uncloseable-check-live-proof.md`

## Problem (verified against live code 2026-07-05, RULE 0.5 — not the autopsy)

The real backlog is ~34 checks built-but-never-run: a check closes with `node scripts/check.mjs close <key>`,
which PATCHes `state='done'` with **zero verification** that the thing it attests actually works in prod.

Two premises in the task file needed correcting after reading the code:

1. **The `signal` seam already exists and is dormant.** `public.checks.signal` (jsonb) was designed to hold a
   machine-checkable assertion — the seed rows carry `{"type":"table_fresh","table":"data_lake.city_pulse",
   "column":"run_at","since":"due_at"}` and `{"type":"workflow_success","workflow":"city-pulse-daily.yml"}`.
   But **`scripts/check.mjs` never reads `signal`.** `close` ignores it entirely. So the fix is to *animate an
   existing seam* (C2 ✓), not erect a brand-new one.
2. **The `answer-fix-proof` gate is NOT pure honor-system** (the task calls it that). It *does* validate a captured
   answer (`validateProofs`: deflection phrases, a real number, freshness). The genuine hole is that **the agent
   writes the proof JSON** — `verification/answer-proofs.jsonl` is agent-authored text, so nothing makes an
   independent live call. The structural fix here is therefore: **the CLI makes the HTTP/DB call itself at close
   time.** There is no proof argument for a session to fabricate — the verifier does the observing.

This makes the task's literal done-when ("reject a *fabricated JSON* proof") **inexpressible by design** — there is
no proof arg to fake. That is an improvement over the task file, stated here rather than diverged from silently
(same RULE 0.5 posture as task 18's news_swfl exclusion).

## Research (RULE 0.4, in-session crawl4ai 2026-07-05)

- **`gh run list`** (cli.github.com/manual/gh_run_list) — flags `-w/--workflow`, `-b/--branch`, `-L/--limit`,
  `-s/--status`, `--json <fields>`. `--json` fields include `conclusion, status, databaseId, headBranch,
  workflowName, createdAt`. Our own `heal-cron-failure.mjs` / `log-cron-incident.mjs` already treat
  `conclusion === "success"|"failure"` as canonical → verbatim-consistent. (Used only by the recognized-but-next
  `workflow_success` type — NOT gated on in phase 1.)
- **PostgREST count** (docs.postgrest.org/.../pagination_count) — existence via `?<filter>&limit=1` + array length;
  a ≥N assertion via `Prefer: count=exact` → response header `Content-Range: 0-24/<total>` (total after the slash).
  Both ride `check.mjs`'s existing `rest()` helper. Cross-schema reads (`data_lake.*`) use the `Accept-Profile:
  <schema>` request header.

## Decisions (operator, 2026-07-05)

- **Enforcement locus = DB trigger + CLI (structural).** The CLI makes the live call and writes the proof; a
  Postgres trigger on `public.checks` rejects any transition **into `done`** unless a valid proof is present. A
  direct `rest()` / lake-MCP PATCH is **also** blocked — not just the CLI. Matches memory
  `structural-guarantee-not-ai-virtue`. Cost the operator accepted: a raw `UPDATE ... SET state='done'` (like the
  historical `20260531_checks_resolve_volume_guard.sql` attest) **stops working** — every close carries proof now.
- **Manual checks = two-tier (signal OR recorded evidence).** A check with a `signal` runs it live; a signal-less
  (pure-human-decision) check closes with a recorded, non-empty `--evidence` string. Honest caveat: the evidence
  tier is self-reported and therefore weaker — but **tier is fixed at creation** and a signal-bearing check
  **cannot be downgraded** to the evidence path at close (trigger-enforced).

## Mechanism

### 1. `proof` column (audit trail + what the trigger validates)

Additive, nullable: `ALTER TABLE public.checks ADD COLUMN IF NOT EXISTS proof jsonb;`

Two shapes:

```jsonc
// signal-verified (strong tier)
{ "kind": "signal", "ok": true,
  "signal":   { "type": "http_ok", "url": "https://www.swfldatagulf.com/api/b/master?..." },
  "observed": { "status": 200, "matched": true, "snippet": "freshness_token: SWFL-..." },
  "observed_at": "2026-07-05T18:22:07Z", "by": "session" }

// manual attestation (weak tier — signal-less checks only)
{ "kind": "manual", "evidence": "CSV-injection policy pinned in docs/... @ commit abc1234",
  "observed_at": "2026-07-05T18:22:07Z", "by": "session" }
```

### 2. Signal-runner — `scripts/lib/check-signals.mjs` (the CLI makes the call)

`runSignal(signal, { rest, fetchImpl })` → `{ ok, observed, detail }`. The caller never supplies the result.

Phase-1 types (all ride existing `fetch` / `rest()` — **no `gh`-auth dependency in the close path**):

| type | shape | ok when |
| --- | --- | --- |
| `http_ok` | `{ url, expect_status? }` | GET is 2xx (or `=== expect_status`) |
| `http_body` | `{ url, contains }` | GET 2xx **and** body includes `contains` |
| `db_row_exists` | `{ table, filter, schema?, min? }` | `?<filter>&limit=1` returns ≥1 (≥`min` via `count=exact`) |
| `db_fresh` | `{ table, column, max_age_days, schema? }` | newest `column` within `max_age_days` |
| `workflow_success` | `{ workflow, branch? }` | **recognized-but-next** — returns `ok:false, detail:"not enabled in phase 1"` |

`table_fresh` (the seed's name) is accepted as an alias of `db_fresh`; the seed's `since:"due_at"` relative
semantics is a phase-2 refinement (phase 1 uses explicit `max_age_days`).

### 3. `scripts/check.mjs` changes

- **`open ... --signal '<json>'`** — attach a signal at creation (INSERT). Today `open` can't write `signal` at all.
- **`update <key> --signal '<json>'`** — attach a signal to a *signal-less* check (OLD.signal IS NULL). Rewriting a
  *set* signal is refused by the trigger; check.mjs pre-checks and fails gracefully with the Bun.SQL override hint.
- **`close <key> [note] [--evidence "..."]`**:
  1. fetch the row's stored `signal` + `resolution` + `state`.
  2. **signal-bearing** → `runSignal(row.signal)`. `!ok` → **fail loud, do not close** ("live signal did NOT pass:
     <detail>"). `ok` → build a `kind:signal` proof.
  3. **signal-less** → require non-empty `--evidence` (a bare close is refused) → build a `kind:manual` proof.
  4. single PATCH `{ state:'done', resolved_at, resolved_by, proof }`. The trigger is the backstop; a rejection
     surfaces as a loud `rest()` failure.
  - **No `--force-unverified`.** If a signal can't be *run* (surface down / no creds), the check stays open — that
    IS the guarantee. The only override in the whole system is a deliberate Bun.SQL `ALTER TABLE ... DISABLE
    TRIGGER` / `SET LOCAL app.allow_signal_edit`, an explicit operator act, never reachable from the CLI.
- **`reopen`** also clears `proof` (`proof:null`) — a re-opened check's old proof is stale.
- **`--drop`** unchanged: transitions to `'dropped'`, which the trigger does **not** gate (abandoning ≠ attesting).

### 4. The trigger — `docs/sql/20260705_checks_proof_gate.sql` (idempotent, Bun.SQL)

`BEFORE INSERT OR UPDATE ON public.checks`, `checks_require_proof()`:

- **Signal immutability:** on UPDATE, if `OLD.signal IS NOT NULL` and `NEW.signal` differs → RAISE, unless
  `current_setting('app.allow_signal_edit', true) = '1'` (operator-only, set only by a deliberate Bun.SQL session).
- **Gate only transitions INTO `done`** (INSERT with `state='done'`, or UPDATE where `OLD.state <> 'done'`); every
  other write (metadata, reopen, drop) passes untouched.
- **Tier from the stored signal** (`OLD.signal` on UPDATE — immutable; `NEW.signal` on INSERT):
  - **signal-bearing** → require `proof.kind='signal'` **and** `proof.ok='true'` **and** `observed_at` within
    **1 day** (fresh) **and** `proof->'signal'` equals the stored `signal` (`IS NOT DISTINCT FROM` — the proof must
    record running the *stored* signal, not a trivial substitute). No downgrade to manual. (A `BEFORE` trigger
    cannot make the outbound call itself, so a hand-forged direct PATCH claiming `ok:true` for the exact stored
    signal is the residual forgery surface — the CLI never does this; the trigger lifts the cost from "close with
    no args" to "hand-forge a structured proof echoing the stored signal.")
  - **signal-less** → require `proof.kind='manual'` **and** non-empty `proof.evidence`.
- `proof IS NULL` on a close → RAISE ("run `check.mjs close` which asserts the live signal").
- All RAISEs use `ERRCODE='check_violation'` and name the `check_key`.

## Files

1. `docs/sql/20260705_checks_proof_gate.sql` — new migration (column + function + trigger; `ADD COLUMN IF NOT
   EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`).
2. `scripts/lib/check-signals.mjs` — new signal-runner.
3. `scripts/lib/check-signals.test.mjs` — new tests (each type, pass + fail paths, mocked fetch/rest).
4. `scripts/check.mjs` — `open --signal`, `update --signal` guard, `close` proof path, `reopen` proof-clear;
   extract `buildProof`/tier logic as pure exports.
5. `scripts/check.test.mjs` — new tests for the extracted close/tier/proof logic.
6. `docs/superpowers/plans/2026-07-05-uncloseable-check-proof.md` — implementation plan (writing-plans).
7. Task file status + SESSION_LOG entry (same push).

## Risks / integration

- **swfldatagulf-ops close path.** The checks page/API live in the `swfldatagulf-ops` repo (per
  `20260530_checks.sql` header). If that repo has a "close" button that PATCHes `state='done'` **without** proof,
  the trigger will now reject it. **Pre-migration verification step:** confirm the ops surface is read-only for
  closes (or route its close through the proof path). The additive nullable `proof` column itself is safe for any
  `SELECT`. Ops-side changes are a **separate repo / separate PR** (memory `ops-page-belongs-in-ops-repo`) — tracked
  as a follow-up check, not built here.
- **Shared prod table.** The migration changes close-semantics for every consumer of `public.checks`. It is
  revertable in <5 min (`DROP TRIGGER`), but it is **held for operator go** — not run autonomously — because it
  touches a live shared surface (consistent with the standing push-hold).
- **Legacy 34 checks are signal-less** → currently closeable via the manual/evidence tier (no worse than today,
  and now they at least record evidence). Attaching signals to the high-value `*_live_verify` checks is a backfill
  pass (see Non-goals) — phase 1 proves the mechanism on one check end-to-end.

## Non-goals (deferred)

- **Backfilling signals onto all ~34 open checks** — data work; phase 1 demonstrates one check end-to-end. A
  scripted backfill (`update <key> --signal ...` per live-verify) is a fast follow.
- **`workflow_success` gating** — recognized in the runner but not gated on in the close path (avoids a `gh`-auth
  dependency wedging a close). Enable once close-from-CI is a real need.
- **`new-build.mjs` auto-attaching a signal** to the `*_live_verify` check it opens — nice-to-have; it doesn't know
  the URL/table at creation. Phase 2 could prompt.
- **Auto-resolver daemon** (periodically run all signals, auto-close/reopen) — the `auto` resolution dream; not
  needed to close the "built-but-never-run" hole. YAGNI.
- **smoke-prod convergence** — `scripts/smoke-prod.mts` already HTTP-asserts 9 checks (`assertOk`/`assertBodyContains`
  = exactly `http_ok`/`http_body`) but only `update --detail`s them ("smoke passed"), never `close`s — so they sit
  open forever, and the migration does NOT break it (the trigger gates only transitions into `done`; `update` leaves
  state `open`). The natural phase-2 win: backfill those 9 checks with `http_ok`/`http_body` signals and have
  smoke-prod `close` them with signal-proofs on pass. Left as follow-up.
- **In-repo close callers reconciled here (not deferred):** `.github/scripts/log-cron-incident.mjs` auto-close now
  passes the succeeding run URL as `--evidence` (the incident check is signal-less → manual tier; a `workflow_success`
  signal would return `ok:false` in phase 1 and wrongly block the auto-resolve). smoke-prod's printed manual-close
  hint updated to `--evidence`. These ship in the same commit so applying the migration reddens nothing.
- **`table_fresh since:"due_at"` relative semantics** — phase 1 uses explicit `max_age_days`.

## Done when (live proof — operator-run `uncloseable_check_proof_live_verify`)

After the migration is applied to prod:

1. A check whose stored signal points at a **failing** surface (e.g. `http_ok` on a 404, or `db_row_exists` on an
   empty predicate) → `close` is **refused**, the check stays `open`.
2. A check whose signal points at a **live-passing** surface (e.g. `http_ok` against the `master` endpoint whose
   `freshness_token` we already quote) → `close` **succeeds** and the real observed result is stored in `proof`.
3. A **direct** `PATCH state='done'` (bypassing check.mjs) on a signal-bearing check with no/forged proof → **rejected
   by the trigger** (proves it's structural, not CLI-only).

Offline bar (my completion gate): signal-runner + check.mjs tier/proof unit tests green; trigger SQL syntax-valid;
a read-only `http_ok` run against the live `master` endpoint returns `ok:true` (no write, no paid API). The live
write path (1–3 above) is the operator-run check.
