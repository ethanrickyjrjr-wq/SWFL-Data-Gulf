# Hermes Email-Builder Driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, keywords: migration, schema, architecture

**Goal:** An always-available driver loop — server detects listing transitions, Hermes pulls them outbound, calls an authed build seam that runs the normal email pipe, saves a draft to the listing project, pings Telegram. No send path exists for the agent.

**Architecture:** Four pieces per the spec (`docs/superpowers/specs/2026-08-10-hermes-email-driver-design.md`): existing ingest detector (no code), new cursor feed + test-inject routes, new single-phase build seam extending `claimOnce`, operator-box Hermes config (skill + manual cron + fail-closed hook). Auth = scope column added to existing `user_api_tokens`.

**Tech Stack:** Next.js App Router routes, Supabase (Bun.SQL for migration), bun:test, Python (Hermes cron script), Hermes skills/hooks (agentskills.io SKILL.md).

## Global Constraints (from spec — every task inherits)

- Hermes NEVER authors prose or figures; seam schema rejects free text (400).
- No send scope exists on any agent token; test-inject token never installed on Hermes.
- Test events live in `agent_feed_test_events`, NEVER in `data_lake.listing_transitions`.
- Test-inject addresses must belong to the demo account's projects, validated server-side.
- Cursor advances ONLY after a successful seam response.
- Idempotency key: `agent-build:<address_key>:<sale_or_rent>:<to_state>:<at>`.
- Migrations idempotent, run directly via Bun.SQL (memory: run-migrations-via-bun-sql), verify row count after.
- All product code follows existing route patterns in `app/api/` (read `app/api/CLAUDE.md` before Task 3).
- Verify with `bunx next build`, not `npx tsc` (locked preference).

---

### Task 1: Migration — token scopes + test-events table

**Files:**
- Create: `migrations/20260810_agent_driver.sql`
- Test: run via Bun.SQL, verify with information_schema queries

**Interfaces:**
- Produces: `user_api_tokens.scope text` (values `agent_feed_read|agent_build|agent_test_inject`, NULL = legacy full token, existing behavior unchanged); table `agent_feed_test_events(id bigserial PK, address text NOT NULL, address_key text NOT NULL, sale_or_rent text NOT NULL, from_state text, to_state text NOT NULL, price_delta numeric, at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL)`.

- [ ] **Step 1: Write the idempotent SQL**

```sql
ALTER TABLE public.user_api_tokens ADD COLUMN IF NOT EXISTS scope text;
CREATE TABLE IF NOT EXISTS public.agent_feed_test_events (
  id bigserial PRIMARY KEY,
  address text NOT NULL,
  address_key text NOT NULL,
  sale_or_rent text NOT NULL DEFAULT 'sale',
  from_state text,
  to_state text NOT NULL,
  price_delta numeric,
  at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
```

- [ ] **Step 2: Run it via Bun.SQL** (pattern: any existing `scripts/*migrate*.mts`; creds `.dlt/secrets.toml`). Then verify: `select column_name from information_schema.columns where table_name='user_api_tokens' and column_name='scope';` returns 1 row; same for the new table. Paste both outputs.
- [ ] **Step 3: Commit** `git add migrations/20260810_agent_driver.sql && git commit -m "feat(agent-driver): token scope column + test-events table"`

### Task 2: Scope-aware auth helper

**Files:**
- Create: `lib/api-tokens/scopes.ts`, Test: `lib/api-tokens/scopes.test.ts`

**Interfaces:**
- Consumes: `resolveTokenUser` from `lib/api-tokens/token.ts` (read its exact signature at line 21 first; it resolves a raw bearer token to a user row via `hashToken`).
- Produces: `requireScope(req: Request, scope: "agent_feed_read"|"agent_build"|"agent_test_inject"): Promise<{ userId: string } | Response>` — returns 401 Response for missing/bad token, 403 Response for wrong scope, `{userId}` on success. NULL-scope legacy tokens do NOT satisfy any agent scope (fail closed).

- [ ] **Step 1: Failing tests** — bun:test with a mocked token resolver: wrong scope → 403; null scope → 403; matching scope → userId; no header → 401.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** — parse `Authorization: Bearer`, resolve via `resolveTokenUser`, compare the row's `scope` strictly.
- [ ] **Step 4: Run, green. Step 5: Commit** `feat(agent-driver): requireScope token gate`

### Task 3: GET /api/agent-feed/transitions

**Files:**
- Create: `app/api/agent-feed/transitions/route.ts`, Test: `app/api/agent-feed/transitions/route.test.ts` (mirror test style of `app/api/projects/[id]/action/route.ts`'s neighbors)

**Interfaces:**
- Consumes: `requireScope(req,"agent_feed_read")` (Task 2).
- Produces JSON: `{ events: [{origin:"real"|"test", address, address_key, sale_or_rent, from_state, to_state, price_delta, at, source_name}], next_cursor: string }`. Cursor = `<at ISO>|<id>` strictly-greater paging, page cap 50. (AMENDED 08/10/2026 by final whole-branch review F1: the real table's `at` is DATE grain while test events are timestamptz, so a shared (at,id) cursor shadows late-arriving same-date real rows; the cursor gains OPAQUE per-source suffixes `|r:<lastRealId>|t:<lastTestId>`, each source keysets on its own (at, own-id) at its own grain; legacy 2-segment cursors parse compatibly. Consumers always treat the cursor as opaque.) UNION of `data_lake.listing_transitions` (origin real, source_name from row) and `agent_feed_test_events` (origin test, source_name `"test-inject"`), ordered by at.

- [ ] **Step 1: Failing tests** — empty feed → `{events:[],next_cursor:<same>}`; rows after cursor only; test rows stamped origin test; wrong-scope token → 403.
- [ ] **Step 2: Run, fail. Step 3: Implement route. Step 4: Green.**
- [ ] **Step 5: Commit** `feat(agent-driver): transitions cursor feed`

### Task 4: POST /api/agent-feed/test-inject

**Files:**
- Create: `app/api/agent-feed/test-inject/route.ts`, Test: alongside.

**Interfaces:**
- Consumes: `requireScope(req,"agent_test_inject")`; demo-account membership: query `projects` where `kind='listing'` and owner = the DEMO account user id (resolve the demo user by its known account email in env/config — read memory `project_demo-account-allstatecoop` + how `projects.subject_address` stores addresses; normalize via `ingest`'s address_key convention already mirrored in `lib/listings/resolve-subject.ts`).
- Produces: 201 `{id}` writing ONLY `agent_feed_test_events`; 403 when address not in demo projects; schema-rejects any extra fields (400).

- [ ] **Step 1: Failing tests** — real-account address → 403; demo address → 201 + row exists; extra field `prose:"hi"` → 400; feed-read token → 403.
- [ ] **Steps 2–4: fail → implement → green. Step 5: Commit** `feat(agent-driver): demo-scoped test-inject`

### Task 5: POST /api/agent/build — the seam

**Files:**
- Create: `app/api/agent/build/route.ts`, Test: alongside.
- Read first (recon inside this task, 10 min): `lib/deliverable/recipes/index.ts` (`builderFor`, `RecipeBuildContext`), `lib/listings/resolve-subject.ts` (`resolveSubject`), ONE acceptance script `scripts/email/render-just-sold.mts` end-to-end (it is the canonical recipe→doc→HTML chain), and the persistence call in `app/api/projects/[id]/action/route.ts` after its `claimOnce` win (line ~154) — mirror exactly how it saves a doc to a project.

**Interfaces:**
- Consumes: `requireScope(req,"agent_build")`; `claimOnce(db, key, ctx)` from `lib/email/idempotency.ts` (signature verified: `(db: SupabaseClient, key: string, ctx: SendLedgerContext) => Promise<boolean>`); `builderFor(recipe_key)`.
- Produces: 200 `{draft_id, preview_url, built_from:{recipe_key, address, transition_at}}`. Body schema STRICT: `{recipe_key, address, sale_or_rent, to_state, at}` — any other key → 400. Allowed recipe_keys: `new-listing|price-reduced|under-contract|just-sold|back-on-market|coming-soon|open-house`. claimOnce key per Global Constraints; on claim lost → return the EXISTING draft (look up by idempotency key in the ledger ctx), 200, `duplicate:true`.

- [ ] **Step 1: Failing tests** — extra field → 400; unknown recipe_key → 400; wrong scope → 403; happy path builds + persists draft (mock builder); replay same body → same draft_id, `duplicate:true`; claimOnce ctx kind = `"agent-build"`.
- [ ] **Steps 2–4: fail → implement → green.** Run `bunx next build` — paste the green line.
- [ ] **Step 5: Commit** `feat(agent-driver): single-phase agent build seam (claimOnce-idempotent)`

### Task 6: Operator-box Hermes config (no product code)

**Files (NOT in repo — machine-local, document paths in SESSION_LOG):**
- Create: `%LOCALAPPDATA%\hermes\skills\swfl\swfl-email-driver\SKILL.md`
- Create: `%LOCALAPPDATA%\hermes\scripts\pull_transitions.py` (cron pre-agent script)
- Create: `%LOCALAPPDATA%\hermes\hooks\block-send\HOOK.yaml` + `handler.py`

**Interfaces:** consumes the three routes above with the two Hermes-held tokens (feed-read, build) minted via `app/api/tokens` after Task 1 adds scope.

- [ ] **Step 1: pull_transitions.py** — reads cursor from `cursor.json` beside it, GETs the feed with the feed token from env `SWFL_FEED_TOKEN`; empty → print `[SILENT]`; else collapse to LATEST state per address, print the JSON array. NEVER advances cursor itself — prints `candidate_cursor`; the skill instructs the agent to call a tiny `advance_cursor.py <cursor>` ONLY after every build returned 200 (spec failure mode 9).
- [ ] **Step 2: SKILL.md** (agentskills.io format, ≤64-char name, ≤1024 desc) — transition→recipe map, keyed on the REAL pipeline vocabulary (corrected 08/10/2026 after Task 4 re-review traced `pipeline.py:65-70`: every scan is state `active`; real `to_state` set is `{active, holding, sold, withdrawn}`): `from_state` NULL + `to_state active` → `new-listing` · `to_state holding` → `under-contract` · `to_state sold` → `just-sold` · `from_state holding|withdrawn` + `to_state active` → `back-on-market` · `price_delta`<0 with state unchanged → `price-reduced`. Map on the (from_state, to_state, price_delta) TRIPLE, never to_state alone. Instruction: POST ONLY `{recipe_key,address,sale_or_rent,to_state,at}` with env `SWFL_BUILD_TOKEN`; then message Telegram: address, what happened (MM/DD/YYYY), preview_url. FORBIDDEN: composing any other field, any figure, any send/schedule call.
- [ ] **Step 3: hook** — HOOK.yaml `events: [pre_tool_call]`; handler.py blocks (fail closed) any tool arg containing `/api/email/send`, `/api/blast`, `schedule-command`, or `send` in an outbound URL to our domain.
- [ ] **Step 4: Rehearsal (the fake test run)** — mint the 3 tokens; `curl` test-inject a fake `price_reduced` on a demo address; `hermes cron run swfl-email-tick`; assert: Telegram message received, draft visible in demo project, `email_send_ledger` has ONE `agent-build:` row, zero sends. Paste all four evidences into SESSION_LOG.
- [ ] **Step 5: Attach the live-verify signal** once a REAL transition drafts unprompted: `node scripts/check.mjs close hermes_email_driver_live_verify` (human step, operator).

---

## Self-review (done at write time)
- Spec coverage: pieces 1–4 → Tasks 1–6 (piece 1 needs no task); all 9+7b failure modes have a guard step (FM1/9→T5+T6 cursor rule, FM2→T6 collapse, FM3/7b→T4, FM4→T5 strict schema, FM5→T6 hook + no send scope anywhere, FM6→cursor design, FM7→T1 scopes, FM8→T6 SKILL wording MM/DD/YYYY).
- No placeholders: recon steps name exact files/lines, not "figure it out".
- Type consistency: `requireScope` return shape used identically in T3/T4/T5; claimOnce signature matches verified code.
