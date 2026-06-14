# Task 01 — Per-schedule scope: column + parser capture (safe-additive)

**Check key:** `email_scope_column` · **Order:** first · **Risk:** low (ships behind a null check;
zero send-time behavior change until Task 02 reads the column).

## Goal

Give a schedule somewhere to *store* a scope, and the NL parser a param to *capture* it — so
"auto-email Cape Coral flood weekly" round-trips into a row. This task does **not** change what sends;
that's Task 02. Keeping the two split is what makes this PR risk-free.

## Grounded refs

- `docs/sql/20260612_email_product.sql:21-36` — `email_schedules` (no scope column today).
- `lib/email/scheduler.ts:46-59` — `ScheduleRow` interface.
- `lib/email/schedule-command.ts:33-64` (tool schema), `:77-86` (`ParsedCommand`), `:110-119`
  (`rawSchema`), `:90-102` (`buildSystemPrompt`), `:188-213` (`summarizeCommand`).
- `lib/place-context.ts` — `buildPlaceContext` (gazetteer crosswalk, the resolution helper to reuse).
- `fixtures/swfl-zip-county.json` — the 6-county scope gate.

## Steps

1. **DB (idempotent, run direct via psycopg — RULE 1, creds `.dlt/secrets.toml`):**
   ```sql
   ALTER TABLE public.email_schedules ADD COLUMN IF NOT EXISTS scope jsonb;
   -- shape: { "raw": "Cape Coral flood", "zip": "33904", "place": "Cape Coral",
   --          "county": "12071", "topic": "flood" }  -- any field nullable
   NOTIFY pgrst, 'reload schema';
   ```
   Verify the column exists; `scope IS NULL` on every existing row (= today's global digest).
2. **Type-lift (one commit):** add `scope: ScopeJson | null` to `ScheduleRow`
   (`lib/email/scheduler.ts:46`) and `ExistingSchedule` (`lib/email/schedule-command.ts:66`). Define a
   `ScopeJson` type (`{ raw?: string; zip?: string; place?: string; county?: string; topic?: string }`).
3. **Parser capture:** add a single `scope` *string* param to `SCHEDULE_COMMAND_TOOL` properties
   (`:40`), `ParsedCommand` (`:77`), and `rawSchema` (`:110`). Add one line to `buildSystemPrompt`
   (`:90`) telling the model to copy the user's place/topic phrase verbatim into `scope`
   (e.g. "Cape Coral flood") and never invent one.
4. **Resolution stays in the route, not the model:** the schedule-command route normalizes the raw
   phrase → `{zip, place, county, topic}` via `buildPlaceContext` (`lib/place-context.ts`) before
   writing the row. A ZIP that does not resolve inside `fixtures/swfl-zip-county.json` → park/clarify,
   never store an invented scope.
5. **Confirm line:** echo the scope in `summarizeCommand` (`:188`) — "… that sends every Monday at 7am
   **about Cape Coral flood** to …".
6. **Tests:** parser captures `scope`; validator rejects an out-of-scope ZIP; summary includes the
   scope; `ScheduleRow`/`ExistingSchedule` carry it. (`bun test lib/email/…`.)

## Done when

- `email_schedules.scope` column live in prod; existing rows all `NULL`.
- Parser captures a scope phrase; route resolves it via `buildPlaceContext`; out-of-scope ZIP parked.
- Unit tests green; `tsc`/eslint clean.
- **Send-time behavior unchanged** (verified: a scoped row still sends the global digest until Task 02).

## Correctness flags

- Atomic type-lift: SQL + both interfaces in one commit (Brain-Factory #3).
- MOAT: resolution reuses `lib/place-context.ts`; never invent a ZIP/number below grain.
- RULE 3 C2: extends `email_schedules` + the parser; no new gate.

> Status lives in the `checks` ledger (`email_scope_column`), not in this file.
