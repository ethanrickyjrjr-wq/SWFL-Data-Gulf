# Plan — Un-closeable check without live prod proof (Operation July task 16)

Spec: `docs/superpowers/specs/2026-07-05-uncloseable-check-proof-design.md`
Check: `uncloseable_check_proof_live_verify`

Brief, not a status board (RULE 2). Obligations live in `checks`. Build order below; each phase names its
verification. **The migration is NOT run against prod and the push is HELD — both are the operator's call.**

## Phase A — migration SQL (file only, not applied)

`docs/sql/20260705_checks_proof_gate.sql`, idempotent:

1. `ALTER TABLE public.checks ADD COLUMN IF NOT EXISTS proof jsonb;`
2. `CREATE OR REPLACE FUNCTION public.checks_require_proof() RETURNS trigger` — the guard (see spec §4):
   - signal immutability (`OLD.signal` non-null & changed → RAISE unless `current_setting('app.allow_signal_edit',
     true)='1'`);
   - gate only transitions INTO `done`;
   - tier from the stored signal (`OLD.signal` on UPDATE, `NEW.signal` on INSERT);
   - signal tier → `proof.kind='signal'` & `ok='true'` & `observed_at` < 1 day & `proof->'signal' IS NOT DISTINCT
     FROM` the stored signal;
   - manual tier → `proof.kind='manual'` & non-empty `evidence`;
   - `proof IS NULL` on close → RAISE. All RAISE `ERRCODE='check_violation'`, name the `check_key`.
3. `DROP TRIGGER IF EXISTS checks_require_proof_trg ON public.checks;` + `CREATE TRIGGER ... BEFORE INSERT OR
   UPDATE ... FOR EACH ROW`.

**Verify:** SQL parses (Bun.SQL dry-parse or psql-less syntax read); do NOT execute. Note the ops-repo close-path
risk in the migration header.

## Phase B — signal-runner `scripts/lib/check-signals.mjs` (+ `.test.mjs`)

`export async function runSignal(signal, { rest, fetchImpl = fetch }) → { ok, observed, detail }`.

- `http_ok` `{url, expect_status?}` — GET; ok = 2xx (or `===expect_status`); observed `{status}`.
- `http_body` `{url, contains}` — GET 2xx & body includes `contains`; observed `{status, matched, snippet}`.
- `db_row_exists` `{table, filter, schema?, min?}` — `rest(\`${table}?${filter}&limit=1\`)` (Accept-Profile if
  `schema`); ok = length ≥ 1 (≥`min` via `count=exact` + Content-Range); observed `{count}`.
- `db_fresh` / `table_fresh` `{table, column, max_age_days, schema?}` — newest `column` desc limit 1; ok =
  age ≤ max_age_days; observed `{newest, age_days}`.
- `workflow_success` — recognized, returns `{ok:false, detail:"not enabled in phase 1"}` (no gh-auth in close path).
- unknown type → `{ok:false, detail:"unknown signal type: <t>"}`.

**Verify:** `node --test scripts/lib/check-signals.test.mjs` green — each type pass + fail, mocked `fetchImpl`/`rest`.

## Phase C — `scripts/check.mjs` (+ `scripts/check.test.mjs`)

- Extract pure, tested helpers: `buildSignalProof({signal, observed, nowIso, by})`,
  `buildManualProof({evidence, nowIso, by})`, `closeTier(row)` (`'signal'|'manual'`).
- `open` — accept `--signal '<json>'` (parse → row.signal on INSERT).
- `update` — accept `--signal '<json>'`; if the row already has a non-null signal, fail gracefully BEFORE the PATCH
  ("signal is immutable via the CLI — change it with a Bun.SQL `SET LOCAL app.allow_signal_edit='1'` migration").
- `close <handle> [note] [--evidence "..."]`:
  - fetch `check_key,label,state,signal,resolution`;
  - `--drop` path unchanged (state `dropped`, no proof);
  - signal tier → `runSignal(row.signal,{rest})`; `!ok` → `fail("live signal did NOT pass: <detail> — not closing")`;
    ok → `buildSignalProof`;
  - manual tier → require non-empty `--evidence` else `fail(...)`; → `buildManualProof`;
  - single PATCH `{state:'done', resolved_at, resolved_by, proof}`.
- `reopen` — add `proof:null` to the patch (+ existing `resolved_at:null, resolved_by:null`).

**Verify:** `node --test scripts/check.test.mjs` green (helper + tier logic); `node scripts/check.mjs` usage
unchanged for `list`. No live PATCH in tests (pure helpers only).

## Phase D — verification

- `node --test` on both new test files green.
- Migration SQL syntax read (no execute).
- Read-only proof-of-life: `runSignal({type:'http_ok', url:'<live master endpoint>'})` returns `ok:true` — a GET to
  our own public endpoint, no write, no paid API. (The WRITE path — actual close + trigger — is the operator-run
  `uncloseable_check_proof_live_verify`.)

## Phase E — docs + commit (HELD)

- Flip task-file status to 🟡 BUILT (held for push + migration).
- SESSION_LOG entry (before any push).
- Commit explicit paths only. **Do NOT push. Do NOT run the migration.**

## Deferred (spec Non-goals)

Backfill signals onto the other ~34 checks; `workflow_success` gating; `new-build.mjs` signal prompt; auto-resolver;
`table_fresh since:"due_at"` relative semantics; the swfldatagulf-ops close-path update (separate repo/PR).
