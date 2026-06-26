# Typed Supabase Client Migration — kill "real column, wrong table" at compile time

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, keywords: migration, refactor, schema

**Goal:** Make a route that names a column that is real-but-on-the-wrong-table a TypeScript compile error instead of a silent runtime 404/500, by generating a `Database` type from the live production DB and threading it through the Supabase client factories.

**Architecture:** Generate `database.types.ts` from the **live prod DB** (the only reliable source of table shape — the repo `.sql` files are stale/unapplied). Override the jsonb columns to their concrete TS types with `type-fest`'s `MergeDeep` (so reads of `projects.items`, `deliverables.doc`, etc. stay concrete, not `Json`). Add the `<Database>` generic to the four client factories in `utils/supabase/`. Most call-sites compile unchanged; the real mismatches surface as build errors and get fixed — or, for changes deferred by the operator (the news-crawl cron, all `data_lake` callers), get a single explicit, greppable opt-out marker. A regen script keeps the type reproducible; an ESLint rule keeps the opt-out hatch shrinking. **Run the whole migration in a git worktree (RULE 1.5)** — it is repo-wide and One Assistant is actively editing `lib/assistant/*`; never commit a known-red build to `main`.

**Tech Stack:** Next.js App Router, `@supabase/ssr ^0.10.3`, `@supabase/supabase-js ^2.106.1`, `type-fest`, Supabase CLI (added as devDep; Docker-or-fallback caveat below), Bun, TypeScript.

## Measured blast radius (spike, 2026-06-26 — not estimated)

Generated a faithful `Database` type from live `information_schema` (jsonb→`Json`), flipped **only** `utils/supabase/server.ts` to `<Database>`, ran `tsc --noEmit`. Baseline was **0 errors**; typed produced **26 errors across 10 files**. Breakdown:
- **~11 are the news-crawl route alone** — the known `lat/lng` bug **plus** its `.schema("data_lake")` reach. supabase-js 2.106 types the bad query as `SelectQueryError<"column 'lat' does not exist">` — the compiler literally prints the bug. All 11 vanish once news-crawl goes to the opt-out hatch (Task 4).
- **~8–9 are `Json`-vs-concrete** jsonb reads/writes (`ai-material` items, `deliverables/blast` narrative, `domain-verify`/`user/brand` jsonb writes). The `MergeDeep` override module (Task 2) eliminates the read-side class at the root.
- **~3 are the dynamic `.update(Record<string,unknown>)` PATCH pattern** (`projects/[id]`, `contacts/[id]`, `schedule-command`) — fixed by typing the accumulator as the table's `Update` type. A genuine tightening.
- **~2 are latent bugs newly caught** (e.g. `app/alerts/[id]/page.tsx` passes a `string` to a numeric `.eq()`).

Conclusion: efficacy proven (it catches both real bugs at compile time); the surface is a 1–2 session migration, not a multi-week slog. This count is the **cookie client only**; typing `service-role.ts` + the browser client adds more (fewer callers), so budget for a somewhat higher total.

## Global Constraints

- **Live DB is the source of truth, not `.sql`.** Generate from live prod. Verbatim verified this session: live `public.projects` = `id, user_id, title, items, branding, mcp_key, created_at, updated_at, ui_state, project_type, derived_project_type` — **no `scope_kind/scope_value`, no `lat/lng`.**
- **Verify the build with `bun run build` (Next.js), not bare `tsc`** for the final gate (memory: feedback_verify-with-next-build-not-npx-tsc). `tsc --noEmit` is fine for *counting* during triage.
- **Lockfile gate (RULE 1):** adding `supabase` and `type-fest` to `package.json` requires `bun install` + `git add bun.lock` in the SAME commit.
- **No secrets in committed files.** The DB password lives in `.dlt/secrets.toml` (gitignored). The regen script reads it at runtime; never inline it.
- **Worktree isolation (RULE 1.5):** `node scripts/worktree.mjs new typed-client` → work in `../bp-typed-client`; never commit a red build to `main`.
- **Coexist with One Assistant.** Type `lib/assistant/*` only if it appears in triage; do not refactor/consolidate routes here.
- **news-crawl is plan-only (operator decision 2026-06-26).** Do NOT fix `app/api/cron/news-crawl/route.ts`. Route it to the opt-out hatch with a `KNOWN-DEBT` comment; the real fix (derive coords from the `items` jsonb) is deferred.
- **Generated schema scope:** `public` only. `data_lake.*` stays untyped; its callers use the opt-out hatch. Add `data_lake` in a follow-up.
- **Commit discipline:** stage explicit paths only, never `git add -A`; SESSION_LOG entry before any push; `node scripts/safe-push.mjs`.

---

### Task 1: Generate `database.types.ts` from the live DB + a reproducible regen script

**Files:**
- Create: `scripts/gen-supabase-types.ts`
- Create: `database-generated.types.ts` (raw generated output, committed)
- Modify: `package.json` (add `supabase` + `type-fest` deps + `gen:types` script), `bun.lock`

**Interfaces:**
- Produces: `database-generated.types.ts` exporting `Database` (raw) and `Json`. Task 2 wraps it.
- Produces: `bun run gen:types` — regenerates the raw type from live prod.

- [ ] **Step 1: Create the worktree and add deps**

```bash
node scripts/worktree.mjs new typed-client
cd ../bp-typed-client
bun add -d supabase
bun add type-fest
```

- [ ] **Step 2: Write the regen script**

The official `supabase gen types --db-url` path requires Docker (spins a `postgres-meta` container) — confirmed unavailable on this box this session. Two supported routes; the script tries the CLI and documents the fallback:

```ts
// scripts/gen-supabase-types.ts — regenerates database-generated.types.ts from live prod.
// Run: bun run gen:types. Live DB is the source of truth (repo .sql is stale/unapplied).
// NOTE: `supabase gen types --db-url` needs Docker. If Docker is unavailable, generate from
// the Supabase dashboard (Project → API → tables) OR use the information_schema fallback
// generator (see scripts/gen-database-type.ts companion). Either way the OUTPUT shape is identical.
import { readFileSync, writeFileSync } from "fs";
const secrets = readFileSync(".dlt/secrets.toml", "utf8");
function tomlStr(key: string): string {
  const m = secrets.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  if (!m) throw new Error(`Could not find ${key} in .dlt/secrets.toml`);
  return m[1];
}
const port = (secrets.match(/^port\s*=\s*(\d+)/m) || [])[1] || "5432";
const dbUrl = `postgres://${tomlStr("username")}:${encodeURIComponent(tomlStr("password"))}@${tomlStr("host")}:${port}/${tomlStr("database")}?sslmode=require`;
const proc = Bun.spawnSync(
  ["bunx", "supabase", "gen", "types", "typescript", "--db-url", dbUrl, "--schema", "public"],
  { stdout: "pipe", stderr: "pipe", cwd: process.env.TMPDIR || "." }, // run from a dir with no .env.local — the CLI chokes on it
);
const out = new TextDecoder().decode(proc.stdout);
if (proc.exitCode !== 0 || out.length < 500) {
  console.error("CLI gen failed (Docker?). Use the dashboard or information_schema fallback.");
  console.error(new TextDecoder().decode(proc.stderr).slice(0, 1500));
  process.exit(1);
}
writeFileSync("database-generated.types.ts", out);
console.log("Wrote database-generated.types.ts from live prod (public schema).");
```

(The information_schema fallback — pg→TS mapping with `jsonb→Json`, `nullable→| null`, `ARRAY→T[]` — was proven this session and produces the identical interface shape; keep it as `scripts/gen-database-type.ts` if Docker stays unavailable.)

- [ ] **Step 3: Add the npm script** — in `package.json` `scripts`: `"gen:types": "bun scripts/gen-supabase-types.ts"`.

- [ ] **Step 4: Run it and verify the shape against the verified live schema**

```bash
bun run gen:types
grep -A14 "      projects: {" database-generated.types.ts
```

Expected: `projects.Row` has `ui_state`, `project_type`, `derived_project_type`; `items: Json`, `branding: Json | null`; and **no `scope_kind`, no `lat`, no `lng`.**

- [ ] **Step 5: Commit** (lockfile + generated type + script together)

```bash
git add package.json bun.lock scripts/gen-supabase-types.ts database-generated.types.ts
git commit -m "feat(types): generate raw Database type from live prod DB + gen:types script"
```

---

### Task 2: jsonb type-override module (`MergeDeep`) — concrete types for jsonb columns

**Files:**
- Create: `database.types.ts` (the wrapper that the app imports)

**Interfaces:**
- Consumes: `database-generated.types.ts` from Task 1; existing concrete types `ProjectItem` (`@/lib/project/items`), the email doc type (`@/lib/email/doc/schema`), and the narrative/branding shapes.
- Produces: `import type { Database } from "@/database.types"` — generated shape with jsonb columns replaced by concrete types. This is what eliminates the ~8–9 `Json`-vs-concrete read errors at the root.

Vendor-verified pattern (Supabase docs, `typescript-support`): `MergeDeep<DatabaseGenerated, {...}>` overrides named columns; `.overrideTypes<T>()` is the per-query escape hatch.

- [ ] **Step 1: Write the override wrapper**

```ts
// database.types.ts — app-facing Database type. Overrides jsonb columns with concrete types
// so reads of items/doc/narrative are not the opaque `Json` union. Pattern: Supabase docs.
import type { MergeDeep } from "type-fest";
import type { Database as DatabaseGenerated } from "./database-generated.types";
import type { ProjectItem } from "@/lib/project/items";
export type { Json } from "./database-generated.types";

export type Database = MergeDeep<
  DatabaseGenerated,
  {
    public: {
      Tables: {
        projects: { Row: { items: ProjectItem[] }; Insert: { items?: ProjectItem[] }; Update: { items?: ProjectItem[] } };
        // Add deliverables.doc / narrative, etc. as their concrete types are confirmed during triage.
        // Keep each override to columns whose concrete type is a single source-of-truth interface.
      };
    };
  }
>;
```

(Only override columns whose concrete type is already a single-root interface. For one-off shapes, prefer `.overrideTypes<T>()` at the call site over bloating this module.)

- [ ] **Step 2: Typecheck the module in isolation**

```bash
bunx tsc --noEmit -p tsconfig.json
```

Expected: still 0 errors (no factory is typed yet; the wrapper just compiles).

- [ ] **Step 3: Commit**

```bash
git add database.types.ts
git commit -m "feat(types): MergeDeep override module — concrete jsonb column types"
```

---

### Task 3: Thread `<Database>` through the four client factories, then TRIAGE

**Files:**
- Modify: `utils/supabase/server.ts`, `utils/supabase/service-role.ts`, `utils/supabase/client.ts`, `utils/supabase/middleware.ts`

**Interfaces:**
- Consumes: `Database` from Task 2.
- Produces: typed `createClient()` (server, cookie) → `SupabaseClient<Database>`; typed `createServiceRoleClient()`, browser `createClient()`, middleware client.
- Produces: `createClientUntyped()` in `utils/supabase/server.ts` — the SINGLE temporary opt-out. Identical runtime, untyped return. Every use carries a `// KNOWN-DEBT(<reason>):` comment.

- [ ] **Step 1: Type the server (cookie) client + add the opt-out hatch**

```ts
// utils/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const cookieAdapter = (cookieStore: Awaited<ReturnType<typeof cookies>>) => ({
  getAll() {
    return cookieStore.getAll();
  },
  setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
    try {
      cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
    } catch {
      // setAll from a Server Component — ignored; middleware refreshes sessions.
    }
  },
});

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) =>
  createServerClient<Database>(supabaseUrl!, supabaseKey!, { cookies: cookieAdapter(cookieStore) });

// TEMPORARY opt-out — deferred fixes / data_lake reach only. ESLint (Task 5) blocks new uses.
export const createClientUntyped = (cookieStore: Awaited<ReturnType<typeof cookies>>) =>
  createServerClient(supabaseUrl!, supabaseKey!, { cookies: cookieAdapter(cookieStore) });
```

(Verify the `createServerClient<Database>` generic against the installed `@supabase/ssr ^0.10.3` in-session — RULE 1; the supabase-js `createClient<Database>` generic is doc-confirmed and `@supabase/ssr` mirrors it.)

- [ ] **Step 2: Type the service-role client** — `utils/supabase/service-role.ts`: add `import type { Database } from "@/database.types";`, change `createClient(...)` → `createClient<Database>(...)`.

- [ ] **Step 3: Type the browser + middleware clients** — `utils/supabase/client.ts`: `createBrowserClient<Database>(...)`. `utils/supabase/middleware.ts`: `createServerClient<Database>(...)`.

- [ ] **Step 4: Build to surface the FULL error inventory (do NOT fix yet)**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS" | cut -c1-140 > /tmp/typed-client-triage.txt
cat /tmp/typed-client-triage.txt
```

Expected: the inventory. Guaranteed entries: `app/api/cron/news-crawl/route.ts` (lat/lng + data_lake), the jsonb-write sites not covered by the override, the PATCH `Record` sites. This IS the mechanically-enumerated "404s-waiting-to-happen" list.

- [ ] **Step 5: Commit the typed factories** (build is red at this checkpoint — that is why we are in a worktree, not on `main`)

```bash
git add utils/supabase/server.ts utils/supabase/service-role.ts utils/supabase/client.ts utils/supabase/middleware.ts
git commit -m "feat(types): thread Database generic through client factories (triage checkpoint)"
```

---

### Task 4: Burn down the triage to a green build

**Files:** every file in the Task 3 inventory; guaranteed `app/api/cron/news-crawl/route.ts` (opt-out only, NOT a real fix).

**Interfaces:** Consumes the inventory. Produces `bun run build` GREEN with opt-out markers only on documented deferrals.

For EACH error apply exactly one resolution:
1. **Real phantom-column bug, fixable now** → fix as the ai-material bug was fixed (select the real column; derive from `items`/`doc` via the existing helper). Never invent a column.
2. **jsonb read still `Json`** → add the column to the Task 2 `MergeDeep` override if it has a single-root concrete type; else `.overrideTypes<T>()` at the call site.
3. **jsonb write (`T[]`/`unknown` → `Json`)** → the value is valid JSON; widen via the column's `Insert`/`Update` type or a localized cast at the write boundary (documented).
4. **PATCH `Record<string,unknown>`** → type the accumulator as `Database["public"]["Tables"][T]["Update"]`.
5. **Deferred (news-crawl, any `data_lake` caller)** → `createClientUntyped(...)` + a `KNOWN-DEBT(<reason>):` comment.

- [ ] **Step 1: Resolve news-crawl via the hatch (worked example of #5)**

```ts
// KNOWN-DEBT(news-crawl): selects projects.lat/lng which do NOT exist on the live table
// (proven: `column "lat" does not exist`); the cron 500s at the projects step every run.
// Real fix (deferred per operator 2026-06-26): derive coords from the items jsonb, drop the
// phantom lat/lng select, and stop reaching data_lake untyped. Until then: untyped client.
import { createClientUntyped } from "@/utils/supabase/server";
const supabase = createClientUntyped(await cookies());
```

- [ ] **Step 2: Resolve every remaining inventory entry** with #1–#4 (or #5 + its own `KNOWN-DEBT` for genuine deferrals).

- [ ] **Step 3: Build green** — `bun run build` → compiles, no errors.

- [ ] **Step 4: Test** — `bun test` → green, or no worse than the pre-migration baseline (note any pre-existing reds).

- [ ] **Step 5: Commit** — `git add -- app utils lib database.types.ts` then `git commit -m "fix(types): resolve column conformance across routes; news-crawl opt-out documented"`.

---

### Task 5: Lock it — ESLint ban on new opt-outs + a live-schema drift guard

**Files:** Modify the repo ESLint config; Create `verification/supabase-untyped-allowlist.json`; Create `scripts/check-schema-drift.ts`.

**Interfaces:** Produces a lint error on `createClientUntyped` outside the allowlist (hatch can only shrink); produces `bun run check:schema-drift` (fails if `database-generated.types.ts` is stale vs live).

- [ ] **Step 1: Add the ban** (verify the repo's flat-config shape first):

```js
"no-restricted-syntax": [
  "error",
  {
    selector: "CallExpression[callee.name='createClientUntyped']",
    message:
      "createClientUntyped is the deferred-fix hatch. Use the typed createClient; if a fix is " +
      "genuinely deferred, add the file to verification/supabase-untyped-allowlist.json + a KNOWN-DEBT comment.",
  },
],
```

Seed the allowlist (or a config `overrides` block scoped to the allowlisted globs) with exactly the files Task 4 opted out (news-crawl + any `data_lake` callers).

- [ ] **Step 2: Verify the rule fires** — `bun run lint` clean; temporarily add a non-allowlisted `createClientUntyped` call, confirm it errors, remove it.

- [ ] **Step 3: Write the drift guard** (regenerate to memory, diff against committed):

```ts
// scripts/check-schema-drift.ts — fails if database-generated.types.ts is stale vs live prod.
import { readFileSync } from "fs";
const current = readFileSync("database-generated.types.ts", "utf8");
// reuse the conn-build + gen block from scripts/gen-supabase-types.ts; capture stdout as `fresh`
// ...
// if (fresh.trim() !== current.trim()) { console.error("STALE — run bun run gen:types"); process.exit(1); }
```

Add `"check:schema-drift": "bun scripts/check-schema-drift.ts"`. Wire into CI only where the DB-URL secret exists; do not add to the local pre-push hook (no DB creds guarantee there).

- [ ] **Step 4: Commit** — `git add <eslint config> verification/supabase-untyped-allowlist.json scripts/check-schema-drift.ts package.json` then commit.

- [ ] **Step 5: Land the worktree** — `node scripts/worktree.mjs land typed-client`, then SESSION_LOG entry + `git push origin HEAD:main` + `node scripts/worktree.mjs cleanup typed-client`.

---

### Task 6 (Track C, independent — can ship separately on `main`): collapse duplicated email_schedules column constants

**Files:** Create `lib/email/schedule-columns.ts`; Modify `app/api/email/send-status/route.ts`, `app/api/email/schedule-command/route.ts`.

Context: `send-status` defines `SCHEDULE_COLS` (7 cols); `schedule-command` defines `SCHEDULE_COLUMNS` (8 cols, adds `template_id`). Already diverged — Class-C "duplicated constant" drift.

- [ ] **Step 1: Single root**

```ts
// lib/email/schedule-columns.ts — one projection for email_schedules reads.
export const SCHEDULE_SELECT =
  "id,status,cadence,day_of_week,day_of_month,send_hour_et,audience_slug,template_id";
```

- [ ] **Step 2: Point both routes at it** — delete the local constants, `import { SCHEDULE_SELECT }`, use at each `.select(...)`. (Superset select; `send-status` gaining `template_id` is harmless.)

- [ ] **Step 3: Build + test + commit** — `bun run build && bun test lib/email`, then commit the three files.

---

## Deferred (documented, NOT in this plan's scope)

- **news-crawl real fix:** derive coords from the `items` jsonb, drop the phantom `lat/lng` select, type its `data_lake` reach, remove the opt-out marker + allowlist entry. Open a `checks` entry when done.
- **`data_lake` schema typing:** extend `gen:types` to also emit `data_lake`, migrate its callers off the hatch.
- **Scope-helper unification:** `inferScopeFromItems` / `project-scope` / `email-scope` / `parse-scope` are 4 entry points; routes call them correctly today. Consolidation belongs with One Assistant, not here.

## Self-Review notes

- Spec coverage: typed client (Tasks 1–5) ✓; jsonb strategy (Task 2, the spike's main finding) ✓; news-crawl opt-out per operator (Task 4 Step 1) ✓; schedule-constant drift (Task 6) ✓; "stays in sync" guard (Task 5) ✓; worktree isolation (RULE 1.5) ✓.
- The Task 3 inventory cannot be fully pre-enumerated (it's whatever the compiler finds); the spike measured it at ~26 for the cookie client and Task 4 gives the concrete per-error decision procedure + the one guaranteed worked example. Intentional, not a placeholder.
- Verify before writing (RULE 1): the ESLint flat-config shape (Task 5), the `@supabase/ssr` `<Database>` generic (Task 3), and the Docker-vs-fallback gen path (Task 1) against the installed versions in-session.
