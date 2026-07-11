# Checks Airtable Mirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 8 files, keywords: migration, schema, architecture

**Goal:** Delta-sync open rows in Supabase `public.checks` into a read-only Airtable table, on a 2-hour cron, without exceeding Airtable's free-tier 1,000 calls/month cap.

**Architecture:** A new standalone script (`scripts/airtable-checks-sync.mjs`, not called from `check.mjs`) tracks per-row sync state in two new Supabase columns (`airtable_record_id`, `airtable_synced_at`), so each run only touches rows that actually changed. It batches upserts (≤10 records/request, Airtable's per-request record cap) via `update-multiple-records`'s `performUpsert`, and batches deletes for closed checks the same way. A GHA cron (mirroring `tripwire-hourly.yml`'s shape) runs it every 2 hours.

**Tech Stack:** Node ESM (`.mjs`), `fetch` (no SDK dependency — matches `scripts/check.mjs`'s own hand-rolled Supabase REST calls), `bun test` for unit tests, Airtable Web API directly (no `airtable-mcp` CLI subprocess in the running script — that's for the one-time interactive base setup only).

## Global Constraints

- Airtable Free plan: 1,000 API calls/month, workspace-wide, 5 req/s per base (verified via crawl4ai against `support.airtable.com/docs/managing-api-call-limits-in-airtable` and `airtable.com/developers/web/api/rate-limits`, 2026-07-11).
- Airtable batch limit: ≤10 records per create/update/delete request. Airtable's own docs pages render this figure via client-side JS that crawl4ai's static fetch didn't surface in two attempts — this value is sourced from the `airtable-mcp` CLI skill's documented gotcha table (`Batch limit is 10 records per request`), not a direct vendor-doc quote. Using 10 is the conservative/safe choice: if the real cap were higher we'd just be marginally less batch-efficient; if a future account had a lower cap we'd get a loud 422, not silent data loss.
- `check.mjs` itself is NOT modified by this plan — the sync is fully out-of-band.
- Supabase is source of truth; Airtable is never written to by a human, only by this sync.
- Design doc: `docs/superpowers/specs/2026-07-11-checks-airtable-mirror-design.md` (commit `ab8341c4`).

---

## File Structure

- `migrations/20260711_checks_airtable_sync_columns.sql` — new. Adds the two tracking columns to `public.checks`.
- `scripts/lib/airtable-creds.mjs` — new. Resolves `AIRTABLE_TOKEN`/`AIRTABLE_CHECKS_BASE_ID`/`AIRTABLE_CHECKS_TABLE_ID` from `.dlt/secrets.toml` or env, same shape as `scripts/lib/supabase-creds.mjs`.
- `scripts/lib/airtable-creds.test.mjs` — new.
- `scripts/lib/airtable-checks-sync-core.mjs` — new. Pure, network-free helpers: batching, field-mapping, request-body/URL building.
- `scripts/lib/airtable-checks-sync-core.test.mjs` — new.
- `scripts/airtable-checks-sync.mjs` — new. The runnable sync: Supabase queries + Airtable REST calls, wired from the two lib modules above.
- `.github/workflows/airtable-checks-sync.yml` — new. 2-hourly cron wrapper, mirrors `tripwire-hourly.yml`.
- `.dlt/secrets.toml` — modified (gitignored, not committed). Adds `AIRTABLE_CHECKS_BASE_ID`/`AIRTABLE_CHECKS_TABLE_ID`.

---

### Task 1: Supabase schema — sync-tracking columns

**Files:**
- Create: `migrations/20260711_checks_airtable_sync_columns.sql`

**Interfaces:**
- Produces: `public.checks.airtable_record_id` (`text`, nullable), `public.checks.airtable_synced_at` (`timestamptz`, nullable) — read/written by Task 5's script.

- [ ] **Step 1: Write the migration**

```sql
-- migrations/20260711_checks_airtable_sync_columns.sql
-- Tracking columns for the read-only Airtable mirror of the checks ledger.
-- Spec: docs/superpowers/specs/2026-07-11-checks-airtable-mirror-design.md
-- Check: checks_airtable_mirror_live_verify
--
-- airtable_record_id lets the sync delete a closed check without a lookup
-- call (Airtable's delete endpoint takes its own record id, not our
-- check_key). airtable_synced_at lets the sync find "dirty" open rows
-- (never synced, or touched since last sync) without resyncing every open
-- row on every run.
--
-- Idempotent; run via:
--   bun scripts/run-migration.ts migrations/20260711_checks_airtable_sync_columns.sql

alter table public.checks
  add column if not exists airtable_record_id text,
  add column if not exists airtable_synced_at timestamptz;
```

- [ ] **Step 2: Run the migration**

Run: `bun scripts/run-migration.ts migrations/20260711_checks_airtable_sync_columns.sql`
Expected: `Running migrations/20260711_checks_airtable_sync_columns.sql...` then `  ✓ done` then `Migrations complete.`

- [ ] **Step 3: Verify the columns exist and are nullable-safe**

Run:
```bash
node -e "
import('./scripts/lib/supabase-creds.mjs').then(async ({ resolveSupabaseCreds }) => {
  const { readFileSync } = await import('node:fs');
  const c = resolveSupabaseCreds({ tomlText: readFileSync('.dlt/secrets.toml', 'utf8'), env: process.env });
  const res = await fetch(\`\${c.url}/rest/v1/checks?select=check_key,airtable_record_id,airtable_synced_at&limit=1\`, {
    headers: { apikey: c.key, Authorization: \`Bearer \${c.key}\` },
  });
  console.log(res.status, await res.text());
});
"
```
Expected: `200` and a JSON array with one row showing `airtable_record_id: null, airtable_synced_at: null` (existing rows were never synced).

- [ ] **Step 4: Commit**

```bash
git add migrations/20260711_checks_airtable_sync_columns.sql
git commit -m "feat(checks): add airtable sync-tracking columns to public.checks"
```

---

### Task 2: Airtable base + table (one-time live setup)

**Files:**
- Modify: `.dlt/secrets.toml` (gitignored — add-only, not committed)

**Interfaces:**
- Produces: an Airtable base id (`app...`) and table id (`tbl...`) that Task 3's `resolveAirtableCreds` and Task 5's script will read from `.dlt/secrets.toml` as `AIRTABLE_CHECKS_BASE_ID`/`AIRTABLE_CHECKS_TABLE_ID`, alongside the already-present `AIRTABLE_TOKEN`.

This is a live external action (creates real state in the operator's Airtable account under workspace `wspNAGu8QSphZv63Z`, "My First Workspace" — confirmed empty via `airtable-mcp list-bases` on 2026-07-11), not a TDD cycle. Flag it to the operator before running if executing autonomously.

- [ ] **Step 1: Create the base with its table and all 8 fields in one call**

```bash
export AIRTABLE_TOKEN=$(grep -m1 -i "^AIRTABLE_TOKEN=" .env.local | cut -d= -f2- | tr -d '"')
airtable-mcp create-base --input - <<'JSON'
{
  "workspaceId": "wspNAGu8QSphZv63Z",
  "name": "Brain Platform — Checks Ledger",
  "tables": [
    {
      "name": "Open Checks",
      "fields": [
        { "name": "check_key", "type": "singleLineText" },
        { "name": "project", "type": "singleLineText" },
        { "name": "label", "type": "singleLineText" },
        { "name": "detail", "type": "multilineText" },
        { "name": "priority", "type": "number", "options": { "precision": 0 } },
        { "name": "due_at", "type": "dateTime", "options": { "timeZone": "America/New_York", "dateFormat": { "name": "iso" }, "timeFormat": { "name": "24hour" } } },
        { "name": "created_at", "type": "dateTime", "options": { "timeZone": "America/New_York", "dateFormat": { "name": "iso" }, "timeFormat": { "name": "24hour" } } },
        { "name": "updated_at", "type": "dateTime", "options": { "timeZone": "America/New_York", "dateFormat": { "name": "iso" }, "timeFormat": { "name": "24hour" } } }
      ]
    }
  ]
}
JSON
```
Expected: JSON response containing `id` (the base id, `app...`) and `tables[0].id` (the table id, `tbl...`). Note both — the field types match the spec's field table; `check_key` (first field) becomes the primary field, satisfying `create-base`'s "first field must be a supported primary type" rule (`singleLineText` qualifies).

- [ ] **Step 2: Verify the table shape**

Run: `airtable-mcp list-tables-for-base --baseId <appId from step 1>`
Expected: one table, "Open Checks", with 8 fields matching the names/types above.

- [ ] **Step 3: Store the IDs**

Add to `.dlt/secrets.toml` under the existing `[sources]` section, next to `AIRTABLE_TOKEN`:
```
AIRTABLE_CHECKS_BASE_ID  = "<appId from step 1>"
AIRTABLE_CHECKS_TABLE_ID = "<tblId from step 1>"
```

- [ ] **Step 4: Provision the same IDs for CI**

```bash
gh secret set AIRTABLE_CHECKS_BASE_ID --body "<appId from step 1>"
gh secret set AIRTABLE_CHECKS_TABLE_ID --body "<tblId from step 1>"
```
(`AIRTABLE_TOKEN` is already provisioned as a repo secret — confirmed via `gh secret list` on 2026-07-11.)

No commit — `.dlt/secrets.toml` is gitignored. Nothing else changes in this task.

---

### Task 3: `scripts/lib/airtable-creds.mjs`

**Files:**
- Create: `scripts/lib/airtable-creds.mjs`
- Test: `scripts/lib/airtable-creds.test.mjs`

**Interfaces:**
- Produces: `resolveAirtableCreds({ tomlText, env }) => { token, baseId, tableId } | null` — consumed by Task 5's script.

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/airtable-creds.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAirtableCreds } from "./airtable-creds.mjs";

test("prefers TOML over env", () => {
  const r = resolveAirtableCreds({
    tomlText:
      'AIRTABLE_TOKEN = "tomltoken"\nAIRTABLE_CHECKS_BASE_ID = "appToml"\nAIRTABLE_CHECKS_TABLE_ID = "tblToml"',
    env: { AIRTABLE_TOKEN: "envtoken", AIRTABLE_CHECKS_BASE_ID: "appEnv", AIRTABLE_CHECKS_TABLE_ID: "tblEnv" },
  });
  assert.deepEqual(r, { token: "tomltoken", baseId: "appToml", tableId: "tblToml" });
});

test("falls back to env when TOML absent (CI)", () => {
  const r = resolveAirtableCreds({
    tomlText: "",
    env: { AIRTABLE_TOKEN: "envtoken", AIRTABLE_CHECKS_BASE_ID: "appEnv", AIRTABLE_CHECKS_TABLE_ID: "tblEnv" },
  });
  assert.deepEqual(r, { token: "envtoken", baseId: "appEnv", tableId: "tblEnv" });
});

test("returns null when token present but base/table id missing", () => {
  assert.equal(resolveAirtableCreds({ tomlText: "", env: { AIRTABLE_TOKEN: "envtoken" } }), null);
});

test("returns null when nothing present", () => {
  assert.equal(resolveAirtableCreds({ tomlText: "", env: {} }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/lib/airtable-creds.test.mjs`
Expected: FAIL — `Cannot find module './airtable-creds.mjs'` (or equivalent resolve error; the file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/airtable-creds.mjs
// Pure Airtable-credential resolver, same shape as scripts/lib/supabase-creds.mjs.
// TOML (local .dlt/secrets.toml) wins; env vars are the CI fallback.
function tomlStr(toml, key) {
  for (const line of toml.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`));
    if (m) return m[1];
  }
  return null;
}

export function resolveAirtableCreds({ tomlText = "", env = {} }) {
  const token = tomlStr(tomlText, "AIRTABLE_TOKEN") ?? env.AIRTABLE_TOKEN;
  const baseId = tomlStr(tomlText, "AIRTABLE_CHECKS_BASE_ID") ?? env.AIRTABLE_CHECKS_BASE_ID;
  const tableId = tomlStr(tomlText, "AIRTABLE_CHECKS_TABLE_ID") ?? env.AIRTABLE_CHECKS_TABLE_ID;
  if (!token || !baseId || !tableId) return null;
  return { token, baseId, tableId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/lib/airtable-creds.test.mjs`
Expected: `4 pass, 0 fail`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/airtable-creds.mjs scripts/lib/airtable-creds.test.mjs
git commit -m "feat(checks): add resolveAirtableCreds credential resolver"
```

---

### Task 4: `scripts/lib/airtable-checks-sync-core.mjs`

**Files:**
- Create: `scripts/lib/airtable-checks-sync-core.mjs`
- Test: `scripts/lib/airtable-checks-sync-core.test.mjs`

**Interfaces:**
- Consumes: nothing (pure, no network, no creds).
- Produces: `BATCH_SIZE` (number, `10`), `chunk(items, size) => array[]`, `toAirtableFields(row) => object`, `buildUpsertBody(rows) => object`, `buildDeleteUrl({ baseId, tableId }, recordIds) => string` — all consumed by Task 5's script.

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/airtable-checks-sync-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { BATCH_SIZE, chunk, toAirtableFields, buildUpsertBody, buildDeleteUrl } from "./airtable-checks-sync-core.mjs";

test("BATCH_SIZE is 10", () => {
  assert.equal(BATCH_SIZE, 10);
});

test("chunk splits into groups of at most `size`", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("chunk returns [] for an empty array", () => {
  assert.deepEqual(chunk([], 10), []);
});

test("chunk returns one group when items fit in one batch", () => {
  assert.deepEqual(chunk([1, 2, 3], 10), [[1, 2, 3]]);
});

test("toAirtableFields picks the mirrored columns and drops null/undefined", () => {
  const row = {
    check_key: "surface_parent_links",
    project: "brain-platform",
    label: "Wire corridor links",
    detail: null,
    priority: 0,
    due_at: undefined,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-05T00:00:00Z",
    id: "should-not-appear",
    state: "should-not-appear",
  };
  assert.deepEqual(toAirtableFields(row), {
    check_key: "surface_parent_links",
    project: "brain-platform",
    label: "Wire corridor links",
    priority: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-05T00:00:00Z",
  });
});

test("buildUpsertBody wraps rows with performUpsert on check_key and typecast", () => {
  const body = buildUpsertBody([{ check_key: "a", label: "A" }, { check_key: "b", label: "B" }]);
  assert.deepEqual(body.performUpsert, { fieldsToMergeOn: ["check_key"] });
  assert.equal(body.typecast, true);
  assert.deepEqual(body.records, [
    { fields: { check_key: "a", label: "A" } },
    { fields: { check_key: "b", label: "B" } },
  ]);
});

test("buildDeleteUrl builds a records[]= query string, URL-encoding ids", () => {
  const url = buildDeleteUrl({ baseId: "appXXX", tableId: "tblYYY" }, ["rec1", "rec 2"]);
  assert.equal(url, "https://api.airtable.com/v0/appXXX/tblYYY?records[]=rec1&records[]=rec%202");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/lib/airtable-checks-sync-core.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/airtable-checks-sync-core.mjs
// Pure, network-free helpers for scripts/airtable-checks-sync.mjs. No fetch,
// no Supabase/Airtable creds — easy to unit test in isolation.

// Airtable's per-request record cap on create/update/delete. Sourced from the
// airtable-mcp CLI skill's documented gotcha (Airtable's own docs render this
// figure via client-side JS that a static crawl doesn't surface) — 10 is the
// conservative choice either way.
export const BATCH_SIZE = 10;

/** Split an array into chunks of at most `size`. */
export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// 1:1 by name with the spec's field table — picks the mirrored columns and
// drops null/undefined so an upsert never clears an Airtable cell with an
// explicit null (Airtable's typecast is best-effort on strings, not on null).
const MIRRORED_FIELDS = [
  "check_key",
  "project",
  "label",
  "detail",
  "priority",
  "due_at",
  "created_at",
  "updated_at",
];

export function toAirtableFields(row) {
  const fields = {};
  for (const key of MIRRORED_FIELDS) {
    const v = row[key];
    if (v !== null && v !== undefined) fields[key] = v;
  }
  return fields;
}

/** Request body for one upsert batch (≤BATCH_SIZE rows) against update-multiple-records. */
export function buildUpsertBody(rows) {
  return {
    performUpsert: { fieldsToMergeOn: ["check_key"] },
    typecast: true,
    records: rows.map((row) => ({ fields: toAirtableFields(row) })),
  };
}

/** Full URL (with query string) for a delete-multiple-records batch (≤BATCH_SIZE ids). */
export function buildDeleteUrl({ baseId, tableId }, recordIds) {
  const params = recordIds.map((id) => `records[]=${encodeURIComponent(id)}`).join("&");
  return `https://api.airtable.com/v0/${baseId}/${tableId}?${params}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/lib/airtable-checks-sync-core.test.mjs`
Expected: `7 pass, 0 fail`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/airtable-checks-sync-core.mjs scripts/lib/airtable-checks-sync-core.test.mjs
git commit -m "feat(checks): add pure Airtable batching/field-mapping helpers"
```

---

### Task 5: `scripts/airtable-checks-sync.mjs`

**Files:**
- Create: `scripts/airtable-checks-sync.mjs`

**Interfaces:**
- Consumes: `resolveSupabaseCreds` (`scripts/lib/supabase-creds.mjs`, existing), `resolveAirtableCreds` (Task 3), `BATCH_SIZE`/`chunk`/`buildUpsertBody`/`buildDeleteUrl` (Task 4).
- Produces: a runnable CLI (`node scripts/airtable-checks-sync.mjs [--dry-run]`), consumed by Task 6's cron workflow. Also exports `findDirtyOpens`, `findStaleCloses`, `syncUpserts`, `syncDeletes` for Task 7's manual verification if needed.

This task has no unit test of its own — it's the network-calling glue between two already-tested pure/creds modules, and its correctness is verified live in Task 7 (per the spec's testing section, which calls for a live-verify, not a mocked unit test).

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// scripts/airtable-checks-sync.mjs — delta sync of open `public.checks` rows
// into the read-only Airtable mirror.
//
// Spec: docs/superpowers/specs/2026-07-11-checks-airtable-mirror-design.md
// Check: checks_airtable_mirror_live_verify
//
// Supabase stays the source of truth. Each run:
//   1. finds "dirty" open rows (never synced, or touched since last sync)
//      and upserts them to Airtable in batches of ≤BATCH_SIZE (performUpsert
//      on check_key), then stamps airtable_record_id/airtable_synced_at back
//      onto Supabase from the upsert response — no extra lookup call.
//   2. finds rows that closed since they were last synced (state != open but
//      still carrying an airtable_record_id) and deletes them from Airtable
//      in batches of ≤BATCH_SIZE, then clears airtable_record_id on Supabase.
//
// Usage: node scripts/airtable-checks-sync.mjs [--dry-run]
//
// Airtable failures are logged and end the run WITHOUT touching Supabase's
// sync-tracking columns for the failed batch — those rows just stay dirty
// and get retried on the next run. This script is never a hard dependency
// for check.mjs, which doesn't call it at all.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";
import { resolveAirtableCreds } from "./lib/airtable-creds.mjs";
import { chunk, buildUpsertBody, buildDeleteUrl, BATCH_SIZE } from "./lib/airtable-checks-sync-core.mjs";

const ROOT = process.cwd();
const SECRETS_PATH = resolve(ROOT, ".dlt/secrets.toml");
const DRY_RUN = process.argv.includes("--dry-run");

function secretsToml() {
  try {
    return readFileSync(SECRETS_PATH, "utf8");
  } catch {
    return "";
  }
}

function creds() {
  const tomlText = secretsToml();
  const supabase = resolveSupabaseCreds({ tomlText, env: process.env });
  if (!supabase) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY not found in secrets or env");
  const airtable = resolveAirtableCreds({ tomlText, env: process.env });
  if (!airtable)
    throw new Error("AIRTABLE_TOKEN / AIRTABLE_CHECKS_BASE_ID / AIRTABLE_CHECKS_TABLE_ID not found in secrets or env");
  return { supabase, airtable };
}

async function supabaseRest(supabase, path, init = {}) {
  const res = await fetch(`${supabase.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabase.key,
      Authorization: `Bearer ${supabase.key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function airtableRest(airtable, urlOrPath, init = {}) {
  const url = urlOrPath.startsWith("http")
    ? urlOrPath
    : `https://api.airtable.com/v0/${airtable.baseId}/${airtable.tableId}${urlOrPath}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${airtable.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const OPEN_ROW_FIELDS =
  "check_key,project,label,detail,priority,due_at,created_at,updated_at,airtable_record_id,airtable_synced_at";

async function findDirtyOpens(supabase) {
  const rows = await supabaseRest(supabase, `checks?state=eq.open&select=${OPEN_ROW_FIELDS}`);
  // airtable_synced_at < updated_at is a column-to-column comparison PostgREST
  // can't express as a query filter — fetch the (small) open set and filter
  // here, same approach check.mjs's own list() uses for staleness sorting.
  return rows.filter((r) => !r.airtable_synced_at || new Date(r.airtable_synced_at) < new Date(r.updated_at));
}

async function findStaleCloses(supabase) {
  return supabaseRest(
    supabase,
    "checks?state=neq.open&airtable_record_id=not.is.null&select=check_key,airtable_record_id",
  );
}

async function syncUpserts(supabase, airtable, dirtyRows) {
  let synced = 0;
  for (const batch of chunk(dirtyRows, BATCH_SIZE)) {
    if (DRY_RUN) {
      console.log(`  [dry-run] would upsert ${batch.length}: ${batch.map((r) => r.check_key).join(", ")}`);
      continue;
    }
    const body = buildUpsertBody(batch);
    const result = await airtableRest(airtable, "", { method: "PATCH", body: JSON.stringify(body) });
    const nowIso = new Date().toISOString();
    for (const record of result.records) {
      const checkKey = record.fields.check_key;
      await supabaseRest(supabase, `checks?check_key=eq.${encodeURIComponent(checkKey)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ airtable_record_id: record.id, airtable_synced_at: nowIso }),
      });
      synced++;
    }
  }
  return synced;
}

async function syncDeletes(supabase, airtable, staleRows) {
  let deleted = 0;
  for (const batch of chunk(staleRows, BATCH_SIZE)) {
    const keys = batch.map((r) => r.check_key);
    if (DRY_RUN) {
      console.log(`  [dry-run] would delete ${batch.length}: ${keys.join(", ")}`);
      continue;
    }
    const url = buildDeleteUrl(airtable, batch.map((r) => r.airtable_record_id));
    await airtableRest(airtable, url, { method: "DELETE" });
    await supabaseRest(supabase, `checks?check_key=in.(${keys.map(encodeURIComponent).join(",")})`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ airtable_record_id: null }),
    });
    deleted += batch.length;
  }
  return deleted;
}

async function main() {
  const { supabase, airtable } = creds();
  const [dirty, stale] = await Promise.all([findDirtyOpens(supabase), findStaleCloses(supabase)]);
  console.log(
    `airtable-checks-sync: ${dirty.length} dirty open row(s), ${stale.length} stale close(s)${DRY_RUN ? " (dry-run)" : ""}`,
  );
  const synced = await syncUpserts(supabase, airtable, dirty);
  const deleted = await syncDeletes(supabase, airtable, stale);
  console.log(`airtable-checks-sync: synced ${synced}, deleted ${deleted}`);
}

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error(`airtable-checks-sync: ${err.message}`);
    process.exitCode = 1;
  });
}

export { findDirtyOpens, findStaleCloses, syncUpserts, syncDeletes };
```

- [ ] **Step 2: Dry-run against real Supabase data (no Airtable writes yet)**

Run: `node scripts/airtable-checks-sync.mjs --dry-run`
Expected: a line like `airtable-checks-sync: 326 dirty open row(s), 0 stale close(s) (dry-run)` (the count will match whatever `state=eq.open` currently returns — every open row is "dirty" on the first-ever run since `airtable_synced_at` is `NULL` for all of them), followed by `[dry-run] would upsert 10: ...` lines (one per batch of ≤10) and a final `synced 0, deleted 0` (dry-run never calls Airtable, so the counts it returns are 0 — the batch log lines are the real signal here).

- [ ] **Step 3: Commit**

```bash
git add scripts/airtable-checks-sync.mjs
git commit -m "feat(checks): add delta sync script for the Airtable checks mirror"
```

---

### Task 6: GHA cron wrapper

**Files:**
- Create: `.github/workflows/airtable-checks-sync.yml`

**Interfaces:**
- Consumes: `scripts/airtable-checks-sync.mjs` (Task 5), repo secrets `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `AIRTABLE_TOKEN` (all already provisioned), `AIRTABLE_CHECKS_BASE_ID`/`AIRTABLE_CHECKS_TABLE_ID` (provisioned in Task 2, Step 4).

- [ ] **Step 1: Write the workflow**

```yaml
name: Airtable checks sync

# Delta-syncs open public.checks rows into the read-only Airtable mirror.
# Spec: docs/superpowers/specs/2026-07-11-checks-airtable-mirror-design.md
# Check: checks_airtable_mirror_live_verify
#
# Every 2 hours, not hourly — the spec's cost math keeps this comfortably
# under Airtable's free-tier 1,000-calls/month cap at this repo's observed
# checks-ledger velocity (~33 opens+updates/day, ~15-20 closes/day).

on:
  schedule:
    - cron: "23 */2 * * *" # off the top-of-hour congestion, same convention as tripwire-hourly.yml
  workflow_dispatch: {}

permissions:
  contents: read

concurrency:
  group: airtable-checks-sync
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v5
        with:
          node-version: "20"

      - name: Run Airtable checks sync
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          AIRTABLE_TOKEN: ${{ secrets.AIRTABLE_TOKEN }}
          AIRTABLE_CHECKS_BASE_ID: ${{ secrets.AIRTABLE_CHECKS_BASE_ID }}
          AIRTABLE_CHECKS_TABLE_ID: ${{ secrets.AIRTABLE_CHECKS_TABLE_ID }}
        run: node scripts/airtable-checks-sync.mjs
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `gh workflow list --repo ethanrickyjrjr-wq/SWFL-Data-Gulf 2>&1 | grep -i "airtable checks sync" || echo "not yet visible (expected until pushed to main)"`

(GHA only registers a workflow once its file exists on the default branch — this step just confirms the file parses; a `workflow_dispatch` smoke run happens after this plan's commits are pushed.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/airtable-checks-sync.yml
git commit -m "feat(checks): add 2-hourly cron for the Airtable checks sync"
```

---

### Task 7: Live verify and close the check

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: a closed `checks_airtable_mirror_live_verify` check.

- [ ] **Step 1: Real (non-dry-run) first sync — backfill**

Run: `node scripts/airtable-checks-sync.mjs`
Expected: `airtable-checks-sync: <N> dirty open row(s), 0 stale close(s)` followed by `airtable-checks-sync: synced <N>, deleted 0`, where `<N>` matches the open-row count from Task 5 Step 2's dry-run.

- [ ] **Step 2: Confirm the backfill landed in Airtable**

Run: `airtable-mcp list-records-for-table --baseId <appId> --tableId <tblId> --pageSize 5`
Expected: 5 records with populated `check_key`/`project`/`label` fields matching real open checks (cross-check one `check_key` against `node scripts/check.mjs list` output).

- [ ] **Step 3: Prove the "dirty" tracking works — open a throwaway check, sync, confirm it appears**

```bash
node scripts/check.mjs open brain-platform airtable_mirror_smoke_test "Airtable mirror smoke test — safe to close immediately"
node scripts/airtable-checks-sync.mjs
airtable-mcp search-records --baseId <appId> --table <tblId> --query "airtable_mirror_smoke_test" --fields '["check_key"]'
```
Expected: the sync log shows `1 dirty open row(s)` (only the new check — everything else was already synced in Step 1), and the search returns exactly one record.

- [ ] **Step 4: Prove deletion works — close the throwaway check, sync, confirm it's gone**

```bash
node scripts/check.mjs close airtable_mirror_smoke_test "smoke test — verified appear/disappear cycle"
node scripts/airtable-checks-sync.mjs
airtable-mcp search-records --baseId <appId> --table <tblId> --query "airtable_mirror_smoke_test" --fields '["check_key"]'
```
Expected: the sync log shows `1 stale close(s)` and `deleted 1`; the search returns zero records.

- [ ] **Step 5: Close the tracking check**

```bash
node scripts/check.mjs close checks_airtable_mirror_live_verify "Live-verified 2026-07-11: backfill (Task 7 Step 1), appear-on-open (Step 3), and disappear-on-close (Step 4) all confirmed against the real Airtable base."
```

No code commit for this task — it's pure verification. If Step 1's push script logic is used to auto-push per SESSION_LOG conventions, add a SESSION_LOG.md entry summarizing all six tasks before that push (per this repo's RULE 0 — required before any `git push`, not before this plan's local commits).

---

## Self-Review

**Spec coverage:** Schema change → Task 1. Airtable base/table setup → Task 2. Sync script (dirty-tracking, batched upsert/delete, `--dry-run`) → Tasks 3-5. Cron wrapper on the spec's 2-hour cadence → Task 6. Live-verify closing the existing check → Task 7. Error handling (failed batch stays dirty, retried next run — no partial-write of sync columns on failure) is built into Task 5's `syncUpserts`/`syncDeletes` (they only write `airtable_record_id`/`airtable_synced_at` after a successful Airtable call, and `airtableRest` throws on non-2xx, aborting the loop before any further writes). Cost math from the spec is restated in the Global Constraints and the cron workflow's own comment so it isn't lost if the workflow file is read in isolation.

**Placeholder scan:** No TBD/TODO; every step has complete, runnable code or an exact command with expected output.

**Type consistency:** `resolveAirtableCreds` returns `{ token, baseId, tableId }` in both Task 3's implementation and every later consumer (Task 5's `creds()`, Task 5's `airtableRest`/`buildDeleteUrl` calls). `chunk`/`buildUpsertBody`/`buildDeleteUrl`/`BATCH_SIZE` names and signatures match between Task 4's implementation and Task 5's imports. Field names in `MIRRORED_FIELDS` (Task 4) match the Airtable field names created in Task 2 and the Supabase columns selected in Task 5's `OPEN_ROW_FIELDS`.
