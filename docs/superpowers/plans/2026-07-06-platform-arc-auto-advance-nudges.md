# PLATFORM_ARC Auto-Advance Nudges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 10 tasks, 13 files, keywords: migration, schema, architecture

**Goal:** Surface a dismissible, nudge-only chip on the listing campaign arc strip when a real
MLS lifecycle event (new listing appeared, departed to holding, resolved sold) or a time trigger
(14 days since new-listing sent) suggests the agent should build the next arc step — never
auto-build, auto-schedule, or auto-send.

**Architecture:** A daily cron adapter reads every armed `email_sequences` row that has a
resolved `address_key`, joins the matching `data_lake.listing_state`/`listing_transitions` rows,
runs a pure decision core, and inserts idempotent rows into a new `lifecycle_nudges` table. The
UI reads unfulfilled nudges for the arc and renders one dismissible chip per matching step.

**Tech Stack:** Next.js App Router (route handlers), Supabase (Postgres + RLS), Bun (`bun test`,
`bun run gen:types`, `bun scripts/...`), TypeScript, GitHub Actions (cron).

## Global Constraints

- Nudge-only, always: no task in this plan ever calls `markBuilt`/`markScheduled`/`markSent` or
  writes `email_sequences.steps` from the nudge path. If a step you're implementing would do that,
  stop — it's out of scope.
- `market-comps`'s time trigger is fixed at 14 days, anchored ONLY on `new-listing`'s `sent_at`
  (never the raw lake "appeared" event, never configurable per setup).
- Every SQL migration is idempotent (`IF NOT EXISTS` / `DO $$...duplicate_object EXCEPTION`).
- `bun test` is this repo's test runner (not vitest, not jest) — Bun's built-in (`bun:test`).
- Owner RLS (`auth.uid() = user_id`) on every new table, mirroring `email_sequences`.
- `data_lake.*` tables are read via `createServiceRoleClientUntyped()` (`@/utils/supabase/service-role`)
  — the typed client intentionally does not cover the `data_lake` schema (known repo convention,
  see `lib/listings/select.ts`).
- Never invent a comparative claim or number — every nudge's copy is built from a real lake column
  (`price`, `price_delta`, `to_state`) or is purely structural ("14 days since your last send"),
  never a general market assertion.

---

### Task 1: Migration — `lifecycle_nudges` table + `email_sequences.address_key` column

**Files:**
- Create: `docs/sql/20260706_lifecycle_nudges.sql`

**Interfaces:**
- Produces: `public.lifecycle_nudges` (columns: `id, user_id, project_id, sequence_id, step_key,
  event_kind, from_state, to_state, at, price, price_delta, dedup_key, created_at, dismissed_at`)
  and `public.email_sequences.address_key` (nullable text), both read/written by later tasks.

- [ ] **Step 1: Write the migration file**

```sql
-- docs/sql/20260706_lifecycle_nudges.sql
-- Lifecycle nudges (spec 2026-07-06-platform-arc-auto-advance-nudges-design.md).
-- Idempotent. Written by scripts/project-feed/lifecycle-nudges.mts (daily cron); read + dismissed
-- by the UI (ArcStrip). Nudge-only — never marks step state, never schedules, never sends.

ALTER TABLE public.email_sequences
  ADD COLUMN IF NOT EXISTS address_key text;

CREATE TABLE IF NOT EXISTS public.lifecycle_nudges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  project_id    text NOT NULL,                       -- soft-link to public.projects.id (no FK)
  sequence_id   uuid NOT NULL,                        -- soft-link to public.email_sequences.id (no FK)
  step_key      text NOT NULL,
  event_kind    text NOT NULL,                        -- appeared | departed_holding | resolved_sold | time_elapsed
  from_state    text,
  to_state      text,
  at            date NOT NULL,
  price         integer,
  price_delta   integer,
  dedup_key     text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  dismissed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS lifecycle_nudges_project_idx ON public.lifecycle_nudges (project_id);
CREATE INDEX IF NOT EXISTS lifecycle_nudges_sequence_idx ON public.lifecycle_nudges (sequence_id);

ALTER TABLE public.lifecycle_nudges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY lifecycle_nudges_owner_all ON public.lifecycle_nudges
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON public.lifecycle_nudges FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lifecycle_nudges TO authenticated;
GRANT ALL ON public.lifecycle_nudges TO service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Run the migration against the live DB**

Run: `bun scripts/run-migration.ts docs/sql/20260706_lifecycle_nudges.sql`
Expected output: `Running docs/sql/20260706_lifecycle_nudges.sql...` then `  ✓ done` then
`Migrations complete.`

- [ ] **Step 3: Verify the table + column exist**

Run: `bun scripts/check-schema-drift.ts` (or, if that script only checks known drift targets,
confirm directly: `bun -e "import('./scripts/run-migration.ts')"` is not needed — instead query
directly)

```bash
bun -e "
const { readFileSync } = require('fs');
const secrets = readFileSync('.dlt/secrets.toml', 'utf8');
const t = (k) => secrets.match(new RegExp('^' + k + '\\\\s*=\\\\s*\"([^\"]+)\"', 'm'))[1];
const port = (secrets.match(/^port\s*=\s*(\d+)/m) || [])[1] || '5432';
const conn = 'postgres://' + t('username') + ':' + encodeURIComponent(t('password')) + '@' + t('host') + ':' + port + '/' + t('database') + '?sslmode=require';
const sql = new Bun.SQL(conn);
const rows = await sql.unsafe(\"SELECT column_name FROM information_schema.columns WHERE table_name='lifecycle_nudges' ORDER BY ordinal_position\");
console.log(rows.map(r => r.column_name));
const col = await sql.unsafe(\"SELECT column_name FROM information_schema.columns WHERE table_name='email_sequences' AND column_name='address_key'\");
console.log(col);
await sql.end();
"
```

Expected: the first array lists all 13 `lifecycle_nudges` columns; the second prints one row
`{ column_name: 'address_key' }`.

- [ ] **Step 4: Regenerate typed Supabase types**

Run: `bun run gen:types`
Expected: `database-generated.types.ts` is rewritten and now includes `lifecycle_nudges` and
`email_sequences.address_key`. Confirm with:

```bash
grep -c "lifecycle_nudges" database-generated.types.ts
```

Expected: a non-zero count.

- [ ] **Step 5: Commit**

```bash
git add docs/sql/20260706_lifecycle_nudges.sql database-generated.types.ts
git commit -m "feat(db): lifecycle_nudges table + email_sequences.address_key column"
```

---

### Task 2: TS port of `address_key()` — property identity matcher

**Files:**
- Create: `lib/listings/address-key.ts`
- Test: `lib/listings/address-key.test.ts`

**Interfaces:**
- Produces: `export function addressKey(street: string, zipCode: string): string` — consumed by
  Task 3 (arm-time resolution) and Task 6 (adapter script, indirectly via the stored column).

- [ ] **Step 1: Write the failing tests (ported 1:1 from `ingest/tests/pipelines/listing_lifecycle/test_address_key.py`)**

```ts
// lib/listings/address-key.test.ts
import { describe, test, expect } from "bun:test";
import { addressKey } from "./address-key";

describe("addressKey", () => {
  test("relist under a different id collapses to the same key (short vs long suffix)", () => {
    expect(addressKey("11145 2nd Ave", "33971")).toBe(addressKey("11145 2nd Avenue", "33971"));
  });

  test("case and punctuation insensitive", () => {
    expect(addressKey("14150 OSTROM AVE.", "33971")).toBe(addressKey("14150 ostrom ave", "33971"));
  });

  test("unit is part of condo identity", () => {
    const a = addressKey("3006 Caring Way Unit 301", "33990");
    const b = addressKey("3006 Caring Way Unit 414", "33990");
    expect(a).not.toBe(b);
    expect(a).toContain("UNIT301");
  });

  test("same street different zip is distinct", () => {
    expect(addressKey("100 Main St", "33901")).not.toBe(addressKey("100 Main St", "33902"));
  });

  test("zip normalized to five digits", () => {
    expect(addressKey("100 Main St", "33901-1234")).toBe(addressKey("100 Main St", "33901"));
  });

  test("empty inputs are deterministic, not a crash", () => {
    expect(addressKey("", "")).toBe(addressKey("", ""));
  });

  test("directional long and short forms collapse", () => {
    expect(addressKey("1403 Northeast 19th Ter", "33909")).toBe(addressKey("1403 NE 19th Ter", "33909"));
    expect(addressKey("100 Southwest 5th St", "33991")).toBe(addressKey("100 SW 5th St", "33991"));
    expect(addressKey("200 North Cleveland Ave", "33901")).toBe(addressKey("200 N Cleveland Ave", "33901"));
  });

  test("directional quadrants never merge", () => {
    const z = "33990";
    const quads = new Set(["SE", "SW", "NE", "NW"].map((d) => addressKey(`123 ${d} 1st St`, z)));
    expect(quads.size).toBe(4);
    expect(addressKey("123 Southeast 1st St", z)).toBe(addressKey("123 SE 1st St", z));
    expect(addressKey("123 Southeast 1st St", z)).not.toBe(addressKey("123 SW 1st St", z));
  });

  test("suffix long and short forms collapse", () => {
    expect(addressKey("100 Pelican Cove", "34104")).toBe(addressKey("100 Pelican Cv", "34104"));
    expect(addressKey("200 Sunset Point", "33957")).toBe(addressKey("200 Sunset Pt", "33957"));
  });

  test("ordinal street collapses regardless of spacing or suffix form", () => {
    const z = "33901";
    const keys = new Set([
      addressKey("700 4th street", z),
      addressKey("700 4th st.", z),
      addressKey("700 4th ST", z),
      addressKey("700 4thST", z),
    ]);
    expect(keys.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test lib/listings/address-key.test.ts`
Expected: FAIL — `Cannot find module './address-key'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation (faithful port of `ingest/pipelines/listing_lifecycle/address_key.py`)**

```ts
// lib/listings/address-key.ts
//
// TS port of ingest/pipelines/listing_lifecycle/address_key.py. MUST stay in exact parity with
// the Python original — address-key.test.ts mirrors its test file case-for-case. address_key is
// the property identity: a relisting gets a NEW listing id, so keying on the id reads a relist
// as two unrelated events. We key on the normalized street address + ZIP instead. The unit is
// part of the key (a condo's #301 and #414 are different properties).

const SUFFIX_CANON: Record<string, string> = {
  AVENUE: "AVE",
  STREET: "ST",
  BOULEVARD: "BLVD",
  DRIVE: "DR",
  ROAD: "RD",
  LANE: "LN",
  COURT: "CT",
  PLACE: "PL",
  TERRACE: "TER",
  CIRCLE: "CIR",
  PARKWAY: "PKWY",
  HIGHWAY: "HWY",
  TRAIL: "TRL",
  POINT: "PT",
  COVE: "CV",
  // directional (long -> short; one-to-one with the eight compass abbreviations)
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  NORTHEAST: "NE",
  NORTHWEST: "NW",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",
};

const UNIT_RE = /\b(?:UNIT|APT|APARTMENT|STE|SUITE|#)\s*([A-Z0-9-]+)/i;
const UNIT_RE_G = /\b(?:UNIT|APT|APARTMENT|STE|SUITE|#)\s*([A-Z0-9-]+)/gi;

/** Deterministic, collision-resistant-within-a-ZIP, stable-across-relists property key. */
export function addressKey(street: string, zipCode: string): string {
  let s = (street || "").toUpperCase();
  let unit = "";
  const m = s.match(UNIT_RE);
  if (m) {
    unit = "UNIT" + m[1].replace(/[^A-Z0-9]/g, "");
    s = s.replace(UNIT_RE_G, "");
  }
  s = s.replace(/[^A-Z0-9 ]/g, " "); // drop punctuation
  const toks = s
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => SUFFIX_CANON[t] ?? t); // canonicalize suffixes + directionals
  const core = toks.join("");
  const z = (zipCode || "").replace(/[^0-9]/g, "").slice(0, 5); // 5-digit ZIP only
  return `${core}${unit}:${z}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test lib/listings/address-key.test.ts`
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/listings/address-key.ts lib/listings/address-key.test.ts
git commit -m "feat: TS port of the Python address_key property-identity matcher"
```

---

### Task 3: Arm-time address resolution — wire `address_key` into the arm route

**Files:**
- 🔴 Modify: `app/api/projects/[id]/sequence/route.ts:29-119` (the `ownedProject` helper and the
  `POST` handler)

**Interfaces:**
- Consumes: `addressKey(street, zipCode)` from Task 2; `geocodeAddress(q)` from
  `refinery/lib/geocode.mts` (existing — returns `{ lat, lon, zip, place, region, confidence,
  provider } | null`, no session token required).
- Produces: every newly-armed `email_sequences` row carries `address_key` (string or null) —
  consumed by Task 6's adapter script.

- [ ] **Step 1: Capture the project row (currently discarded) and compute `address_key` before the insert**

In `app/api/projects/[id]/sequence/route.ts`, the `POST` handler currently does:

```ts
if (!(await ownedProject(db, id)))
  return NextResponse.json({ error: "not found" }, { status: 404 });
```

Change it to capture the row, and add the address resolution + insert field:

```ts
const project = await ownedProject(db, id);
if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
```

Then, immediately before the `db.from("email_sequences").insert({...})` call, add:

```ts
// Address matching (spec 2026-07-06-platform-arc-auto-advance-nudges-design.md): resolve once
// at arm time so the daily nudge cron never re-geocodes. subject_address is free text like
// "1234 Main St, Cape Coral, FL 33914" — the street portion (before the first comma) is what
// the lake's own address_key() keys on (it only ever sees street_address, never city/state), so
// we split on comma rather than passing the full string. A bad/incomplete address (no comma, or
// geocode miss) leaves address_key null — that sequence is simply never a nudge candidate
// (fail closed, no invented match).
let address_key: string | null = null;
if (project.subject_address) {
  const street = project.subject_address.split(",")[0]?.trim() ?? "";
  const geo = await geocodeAddress(project.subject_address);
  if (street && geo?.zip) address_key = addressKey(street, geo.zip);
}
```

And add `address_key` to the insert object:

```ts
const { data: created, error } = await db
  .from("email_sequences")
  .insert({
    user_id: user.id,
    project_id: id,
    setup_name: source,
    status: "armed",
    audience_slug: audience,
    send_hour_et: hour,
    steps: applySetup(steps),
    address_key,
  })
  .select("id, status, setup_name, audience_slug, send_hour_et, steps")
  .single();
```

Add the two new imports at the top of the file:

```ts
import { geocodeAddress } from "@/refinery/lib/geocode.mts";
import { addressKey } from "@/lib/listings/address-key";
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit -p tsconfig.json` (or `bunx next build` if faster in this repo — either
must be clean)
Expected: no new type errors. `project.subject_address` typechecks because `ownedProject`
already selects `"id, subject_address"`.

- [ ] **Step 3: Manual verification**

Arm a test sequence for a project whose `subject_address` is a real, resolvable SWFL address
(e.g. via the existing UI flow or a direct `curl -X POST .../sequence`), then query:

```bash
bun -e "
const { readFileSync } = require('fs');
const secrets = readFileSync('.dlt/secrets.toml', 'utf8');
const t = (k) => secrets.match(new RegExp('^' + k + '\\\\s*=\\\\s*\"([^\"]+)\"', 'm'))[1];
const port = (secrets.match(/^port\s*=\s*(\d+)/m) || [])[1] || '5432';
const conn = 'postgres://' + t('username') + ':' + encodeURIComponent(t('password')) + '@' + t('host') + ':' + port + '/' + t('database') + '?sslmode=require';
const sql = new Bun.SQL(conn);
const rows = await sql.unsafe(\"SELECT id, address_key FROM email_sequences ORDER BY created_at DESC LIMIT 1\");
console.log(rows);
await sql.end();
"
```

Expected: the most recent row has a non-null `address_key` matching the pattern
`<CANONICALSTREET>:<5-digit-zip>`.

- [ ] **Step 4: Commit**

```bash
git add app/api/projects/[id]/sequence/route.ts
git commit -m "feat: resolve+store address_key at arc arm time"
```

---

### Task 4: Pure decision core — `lib/project/lifecycle-nudge.ts`

**Files:**
- Create: `lib/project/lifecycle-nudge.ts`
- Test: `lib/project/lifecycle-nudge.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure, standalone).
- Produces: `LifecycleTransition`, `SequenceForNudge`, `NudgeEventKind`, `NudgeRow` types;
  `nudgeDedupKey(sequenceId, stepKey, eventKind, toState, at): string`;
  `decideLifecycleNudges(seq, transitions, currentState, today, marketCompsDelayDays?): NudgeRow[]`
  — consumed by Task 6 (adapter script) and Task 5 (copy builder imports `NudgeEventKind`).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/project/lifecycle-nudge.test.ts
import { describe, test, expect } from "bun:test";
import {
  decideLifecycleNudges,
  nudgeDedupKey,
  type LifecycleTransition,
  type SequenceForNudge,
} from "./lifecycle-nudge";

const TODAY = new Date("2026-07-20T12:00:00Z");

function seq(steps: Partial<Record<string, { state: string; sent_at?: string | null }>>): SequenceForNudge {
  const keys = ["coming-soon", "new-listing", "market-comps", "under-contract", "sold"];
  return {
    id: "seq-1",
    project_id: "proj-1",
    user_id: "user-1",
    address_key: "123MAINST:33901",
    steps: keys.map((key) => ({
      key,
      state: steps[key]?.state ?? "pending",
      sent_at: steps[key]?.sent_at ?? null,
    })),
  };
}

describe("nudgeDedupKey", () => {
  test("builds the canonical lifecycle:<seq>:<step>:<event>:<toState>:<at> key", () => {
    expect(nudgeDedupKey("seq-1", "sold", "resolved_sold", "sold", "2026-07-15")).toBe(
      "lifecycle:seq-1:sold:resolved_sold:sold:2026-07-15",
    );
  });

  test("uses a stable placeholder when toState is null (time_elapsed)", () => {
    expect(nudgeDedupKey("seq-1", "market-comps", "time_elapsed", null, "2026-07-20")).toBe(
      "lifecycle:seq-1:market-comps:time_elapsed:-:2026-07-20",
    );
  });
});

describe("decideLifecycleNudges — appeared", () => {
  test("fires for new-listing when a from_state=null transition exists and the step is pending", () => {
    const s = seq({ "new-listing": { state: "pending" } });
    const transitions: LifecycleTransition[] = [
      { from_state: null, to_state: "active", at: "2026-07-01", price: 450000, price_delta: null },
    ];
    const out = decideLifecycleNudges(s, transitions, "active", TODAY);
    const hit = out.find((n) => n.step_key === "new-listing");
    expect(hit).toBeDefined();
    expect(hit?.event_kind).toBe("appeared");
    expect(hit?.at).toBe("2026-07-01");
  });

  test("does NOT fire when new-listing is already sent", () => {
    const s = seq({ "new-listing": { state: "sent", sent_at: "2026-07-02T00:00:00Z" } });
    const transitions: LifecycleTransition[] = [
      { from_state: null, to_state: "active", at: "2026-07-01", price: 450000, price_delta: null },
    ];
    const out = decideLifecycleNudges(s, transitions, "active", TODAY);
    expect(out.find((n) => n.step_key === "new-listing")).toBeUndefined();
  });
});

describe("decideLifecycleNudges — departed_holding", () => {
  test("fires for under-contract (ambiguous) on a to_state=holding transition", () => {
    const s = seq({ "under-contract": { state: "pending" } });
    const transitions: LifecycleTransition[] = [
      { from_state: "active", to_state: "holding", at: "2026-07-10", price: 450000, price_delta: null },
    ];
    const out = decideLifecycleNudges(s, transitions, "holding", TODAY);
    const hit = out.find((n) => n.step_key === "under-contract");
    expect(hit).toBeDefined();
    expect(hit?.event_kind).toBe("departed_holding");
  });

  test("does NOT fire when under-contract is already sent or skipped", () => {
    const s = seq({ "under-contract": { state: "skipped" } });
    const transitions: LifecycleTransition[] = [
      { from_state: "active", to_state: "holding", at: "2026-07-10", price: 450000, price_delta: null },
    ];
    const out = decideLifecycleNudges(s, transitions, "holding", TODAY);
    expect(out.find((n) => n.step_key === "under-contract")).toBeUndefined();
  });
});

describe("decideLifecycleNudges — resolved_sold", () => {
  test("fires for sold when listing_state.state is sold and the step isn't sent", () => {
    const s = seq({ sold: { state: "built" } });
    const transitions: LifecycleTransition[] = [
      { from_state: "holding", to_state: "sold", at: "2026-07-18", price: 440000, price_delta: -10000 },
    ];
    const out = decideLifecycleNudges(s, transitions, "sold", TODAY);
    const hit = out.find((n) => n.step_key === "sold");
    expect(hit).toBeDefined();
    expect(hit?.price_delta).toBe(-10000);
  });

  test("does NOT fire when sold step already sent", () => {
    const s = seq({ sold: { state: "sent" } });
    const transitions: LifecycleTransition[] = [
      { from_state: "holding", to_state: "sold", at: "2026-07-18", price: 440000, price_delta: -10000 },
    ];
    const out = decideLifecycleNudges(s, transitions, "sold", TODAY);
    expect(out.find((n) => n.step_key === "sold")).toBeUndefined();
  });
});

describe("decideLifecycleNudges — time_elapsed (market-comps)", () => {
  test("fires exactly at 14 days after new-listing's sent_at", () => {
    const s = seq({
      "new-listing": { state: "sent", sent_at: "2026-07-06T09:00:00Z" },
      "market-comps": { state: "pending" },
    });
    const today14 = new Date("2026-07-20T09:00:00Z"); // exactly 14 days later
    const out = decideLifecycleNudges(s, [], null, today14);
    expect(out.find((n) => n.step_key === "market-comps")).toBeDefined();
  });

  test("does NOT fire before 14 days", () => {
    const s = seq({
      "new-listing": { state: "sent", sent_at: "2026-07-06T09:00:00Z" },
      "market-comps": { state: "pending" },
    });
    const today13 = new Date("2026-07-19T09:00:00Z");
    const out = decideLifecycleNudges(s, [], null, today13);
    expect(out.find((n) => n.step_key === "market-comps")).toBeUndefined();
  });

  test("does NOT fire when new-listing was never sent", () => {
    const s = seq({ "market-comps": { state: "pending" } });
    const out = decideLifecycleNudges(s, [], null, TODAY);
    expect(out.find((n) => n.step_key === "market-comps")).toBeUndefined();
  });
});

describe("decideLifecycleNudges — dedup stability", () => {
  test("the same inputs always produce the same dedup_key (idempotent rerun)", () => {
    const s = seq({ "new-listing": { state: "pending" } });
    const transitions: LifecycleTransition[] = [
      { from_state: null, to_state: "active", at: "2026-07-01", price: 450000, price_delta: null },
    ];
    const first = decideLifecycleNudges(s, transitions, "active", TODAY);
    const second = decideLifecycleNudges(s, transitions, "active", TODAY);
    expect(first[0]?.dedup_key).toBe(second[0]?.dedup_key);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test lib/project/lifecycle-nudge.test.ts`
Expected: FAIL — `Cannot find module './lifecycle-nudge'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/project/lifecycle-nudge.ts
//
// Pure decision core for PLATFORM_ARC auto-advance nudges (spec
// 2026-07-06-platform-arc-auto-advance-nudges-design.md). No DB, no disk, no Date.now() — `today`
// is always injected. NUDGE-ONLY: this module only ever PRODUCES candidate rows to insert; it
// never marks step state, schedules, or sends. The adapter (scripts/project-feed/
// lifecycle-nudges.mts) supplies the live data and does the actual write.

export type NudgeEventKind = "appeared" | "departed_holding" | "resolved_sold" | "time_elapsed";

const ACTIONABLE_STATES: ReadonlySet<string> = new Set(["pending", "built"]);
const MARKET_COMPS_DELAY_DAYS_DEFAULT = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LifecycleTransition {
  from_state: string | null;
  to_state: string;
  /** ISO date string, e.g. "2026-07-10". */
  at: string;
  price: number | null;
  price_delta: number | null;
}

export interface SequenceStepForNudge {
  key: string;
  state: string;
  sent_at?: string | null;
}

export interface SequenceForNudge {
  /** email_sequences.id */
  id: string;
  project_id: string;
  user_id: string;
  address_key: string;
  steps: SequenceStepForNudge[];
}

export interface NudgeRow {
  user_id: string;
  project_id: string;
  sequence_id: string;
  step_key: string;
  event_kind: NudgeEventKind;
  from_state: string | null;
  to_state: string | null;
  at: string;
  price: number | null;
  price_delta: number | null;
  dedup_key: string;
}

/** Canonical dedup key — one row per (sequence, step, event kind, resulting state, event date). */
export function nudgeDedupKey(
  sequenceId: string,
  stepKey: string,
  eventKind: NudgeEventKind,
  toState: string | null,
  at: string,
): string {
  return `lifecycle:${sequenceId}:${stepKey}:${eventKind}:${toState ?? "-"}:${at}`;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function latestByAt(transitions: LifecycleTransition[], toState: string): LifecycleTransition | undefined {
  return transitions
    .filter((t) => t.to_state === toState)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))[0];
}

/**
 * Decide which lifecycle nudges apply right now for one armed sequence. Fully pure — the caller
 * (adapter script) supplies the sequence's own steps, the matching lake transitions, the current
 * lake state, and "today". Never fires for a step that's already `sent` or `skipped`.
 */
export function decideLifecycleNudges(
  seq: SequenceForNudge,
  transitions: LifecycleTransition[],
  currentState: string | null,
  today: Date,
  marketCompsDelayDays: number = MARKET_COMPS_DELAY_DAYS_DEFAULT,
): NudgeRow[] {
  const out: NudgeRow[] = [];
  const stepByKey = new Map(seq.steps.map((s) => [s.key, s] as const));
  const common = { user_id: seq.user_id, project_id: seq.project_id, sequence_id: seq.id };

  // ── appeared -> new-listing ────────────────────────────────────────────────
  const newListingStep = stepByKey.get("new-listing");
  const appeared = transitions.find((t) => t.from_state === null);
  if (appeared && newListingStep && ACTIONABLE_STATES.has(newListingStep.state)) {
    out.push({
      ...common,
      step_key: "new-listing",
      event_kind: "appeared",
      from_state: null,
      to_state: appeared.to_state,
      at: appeared.at,
      price: appeared.price,
      price_delta: appeared.price_delta,
      dedup_key: nudgeDedupKey(seq.id, "new-listing", "appeared", appeared.to_state, appeared.at),
    });
  }

  // ── departed to holding (ambiguous) -> under-contract ──────────────────────
  const underContractStep = stepByKey.get("under-contract");
  const holding = latestByAt(transitions, "holding");
  if (holding && underContractStep && ACTIONABLE_STATES.has(underContractStep.state)) {
    out.push({
      ...common,
      step_key: "under-contract",
      event_kind: "departed_holding",
      from_state: holding.from_state,
      to_state: "holding",
      at: holding.at,
      price: holding.price,
      price_delta: holding.price_delta,
      dedup_key: nudgeDedupKey(seq.id, "under-contract", "departed_holding", "holding", holding.at),
    });
  }

  // ── resolved sold (real county record via the off-market probe) -> sold ────
  const soldStep = stepByKey.get("sold");
  if (currentState === "sold" && soldStep && ACTIONABLE_STATES.has(soldStep.state)) {
    const soldTransition = latestByAt(transitions, "sold");
    const at = soldTransition?.at ?? toDateOnly(today);
    out.push({
      ...common,
      step_key: "sold",
      event_kind: "resolved_sold",
      from_state: soldTransition?.from_state ?? null,
      to_state: "sold",
      at,
      price: soldTransition?.price ?? null,
      price_delta: soldTransition?.price_delta ?? null,
      dedup_key: nudgeDedupKey(seq.id, "sold", "resolved_sold", "sold", at),
    });
  }

  // ── time_elapsed -> market-comps (anchored ONLY on new-listing's sent_at) ──
  const marketCompsStep = stepByKey.get("market-comps");
  if (marketCompsStep && ACTIONABLE_STATES.has(marketCompsStep.state) && newListingStep?.sent_at) {
    const sentAt = new Date(newListingStep.sent_at);
    const triggerAt = new Date(sentAt.getTime() + marketCompsDelayDays * DAY_MS);
    if (today.getTime() >= triggerAt.getTime()) {
      const at = toDateOnly(triggerAt);
      out.push({
        ...common,
        step_key: "market-comps",
        event_kind: "time_elapsed",
        from_state: null,
        to_state: null,
        at,
        price: null,
        price_delta: null,
        dedup_key: nudgeDedupKey(seq.id, "market-comps", "time_elapsed", null, at),
      });
    }
  }

  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test lib/project/lifecycle-nudge.test.ts`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/project/lifecycle-nudge.ts lib/project/lifecycle-nudge.test.ts
git commit -m "feat: pure decision core for PLATFORM_ARC auto-advance nudges"
```

---

### Task 5: Nudge copy — `lib/project/nudge-copy.ts`

**Files:**
- Create: `lib/project/nudge-copy.ts`
- Test: `lib/project/nudge-copy.test.ts`

**Interfaces:**
- Consumes: `NudgeEventKind` from Task 4.
- Produces: `nudgeChipText(eventKind, priceDelta): string` — consumed by Task 9 (`ArcNudgeChip`).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/project/nudge-copy.test.ts
import { describe, test, expect } from "bun:test";
import { nudgeChipText } from "./nudge-copy";

describe("nudgeChipText", () => {
  test("appeared", () => {
    expect(nudgeChipText("appeared", null)).toContain("live in the MLS");
  });

  test("departed_holding is explicitly hedged, never asserts a fact", () => {
    const text = nudgeChipText("departed_holding", null);
    expect(text).toContain("may have gone under contract");
  });

  test("resolved_sold with a real price_delta includes the real number", () => {
    const text = nudgeChipText("resolved_sold", -10000);
    expect(text).toContain("$10,000");
    expect(text).toContain("-$10,000".slice(0, 0) === "" ? text : text); // no-op guard, delta sign checked below
    expect(text.includes("-$10,000") || text.includes("−$10,000")).toBe(true);
  });

  test("resolved_sold with no price_delta omits any invented number", () => {
    const text = nudgeChipText("resolved_sold", null);
    expect(text).not.toMatch(/\$\d/);
  });

  test("time_elapsed", () => {
    expect(nudgeChipText("time_elapsed", null)).toContain("14 days");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test lib/project/nudge-copy.test.ts`
Expected: FAIL — `Cannot find module './nudge-copy'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/project/nudge-copy.ts
//
// Pure copy builder for the arc nudge chip (spec
// 2026-07-06-platform-arc-auto-advance-nudges-design.md). Every line is either purely structural
// ("it's been 14 days") or built from a REAL held number (price_delta) — never a general market
// claim we can't source. departed_holding is deliberately hedged: the lake genuinely cannot tell
// under-contract from a temporary pull.

import type { NudgeEventKind } from "./lifecycle-nudge";

function fmtUsd(n: number): string {
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
}

export function nudgeChipText(eventKind: NudgeEventKind, priceDelta: number | null): string {
  switch (eventKind) {
    case "appeared":
      return "This listing is now live in the MLS — build the New Listing announcement?";
    case "departed_holding":
      return "This listing left the active market — it may have gone under contract (or was pulled). Worth checking before you send.";
    case "resolved_sold":
      return priceDelta != null
        ? `County records show this sold (${fmtUsd(priceDelta)} vs list) — build the Sold announcement?`
        : "County records show this sold — build the Sold announcement?";
    case "time_elapsed":
      return "It's been 14 days since your New Listing send — a Market Comps update might keep attention on this listing.";
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test lib/project/nudge-copy.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/project/nudge-copy.ts lib/project/nudge-copy.test.ts
git commit -m "feat: nudge chip copy builder — real numbers only, never invented"
```

---

### Task 6: Adapter script — `scripts/project-feed/lifecycle-nudges.mts`

**Files:**
- Create: `scripts/project-feed/lifecycle-nudges.mts`

**Interfaces:**
- Consumes: `decideLifecycleNudges`, `SequenceForNudge`, `LifecycleTransition` from Task 4;
  `SequenceStepsSchema` from `@/lib/email/sequence/types` (existing).
- Produces: rows in `public.lifecycle_nudges` — consumed by Task 8 (GET route) and Task 9 (UI).

- [ ] **Step 1: Write the adapter script**

```ts
// scripts/project-feed/lifecycle-nudges.mts
//
// Daily cron adapter for PLATFORM_ARC auto-advance nudges (spec
// 2026-07-06-platform-arc-auto-advance-nudges-design.md). NOT a Next route — a standalone Bun
// process the GHA cron invokes after listing-lifecycle-daily has committed the day's transitions.
//
// Reads every ARMED email_sequences row with a resolved address_key, joins the matching
// data_lake.listing_state/listing_transitions rows, runs the pure decision core
// (lib/project/lifecycle-nudge.ts), and inserts new lifecycle_nudges rows
// (ON CONFLICT (dedup_key) DO NOTHING — idempotent across daily reruns).
//
// NUDGE-ONLY: this script NEVER writes to email_sequences.steps and NEVER calls any send path.
//
// Run: bun scripts/project-feed/lifecycle-nudges.mts [--dry-run]

import { createServiceRoleClient, createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { SequenceStepsSchema } from "@/lib/email/sequence/types";
import {
  decideLifecycleNudges,
  type LifecycleTransition,
  type SequenceForNudge,
} from "@/lib/project/lifecycle-nudge";

const DRY_RUN = process.argv.includes("--dry-run");

interface ArmedSequenceRow {
  id: string;
  user_id: string;
  project_id: string;
  address_key: string | null;
  steps: unknown;
}

async function main(): Promise<number> {
  console.log(`[lifecycle-nudges] start · DRY_RUN=${DRY_RUN}`);
  const db = createServiceRoleClient();
  const lake = createServiceRoleClientUntyped();

  const { data: sequences, error } = await db
    .from("email_sequences")
    .select("id, user_id, project_id, address_key, steps")
    .eq("status", "armed")
    .not("address_key", "is", null);
  if (error) {
    console.error(`FATAL: email_sequences query failed — ${error.message}`);
    return 1;
  }
  const rows = (sequences ?? []) as ArmedSequenceRow[];
  if (rows.length === 0) {
    console.log("  no armed sequences with a resolved address_key — nothing to do.");
    return 0;
  }

  const today = new Date();
  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const row of rows) {
    const parsedSteps = SequenceStepsSchema.safeParse(row.steps);
    if (!parsedSteps.success) {
      console.warn(`  skip sequence ${row.id}: steps failed to parse`);
      skipped++;
      continue;
    }
    const seq: SequenceForNudge = {
      id: row.id,
      project_id: row.project_id,
      user_id: row.user_id,
      address_key: row.address_key as string,
      steps: parsedSteps.data.map((s) => ({ key: s.key, state: s.state, sent_at: s.sent_at ?? null })),
    };

    const { data: transRows, error: transErr } = await lake
      .schema("data_lake")
      .from("listing_transitions")
      .select("from_state, to_state, at, price, price_delta")
      .eq("address_key", seq.address_key)
      .eq("sale_or_rent", "sale")
      .eq("source_name", "api_feed");
    if (transErr) {
      console.warn(`  skip sequence ${row.id}: listing_transitions query failed — ${transErr.message}`);
      skipped++;
      continue;
    }
    const transitions = (transRows ?? []) as LifecycleTransition[];

    const { data: stateRow } = await lake
      .schema("data_lake")
      .from("listing_state")
      .select("state")
      .eq("address_key", seq.address_key)
      .eq("sale_or_rent", "sale")
      .eq("source_name", "api_feed")
      .maybeSingle();
    const currentState = (stateRow as { state: string } | null)?.state ?? null;

    const nudges = decideLifecycleNudges(seq, transitions, currentState, today);
    for (const n of nudges) toInsert.push(n);
  }

  console.log(
    `  ${rows.length} armed sequence(s) checked (${skipped} skipped) · ${toInsert.length} candidate nudge(s)`,
  );

  if (DRY_RUN) {
    for (const n of toInsert) console.log("  [dry-run] would insert", n);
    return 0;
  }
  if (toInsert.length === 0) return 0;

  const { data: inserted, error: insErr } = await db
    .from("lifecycle_nudges")
    .upsert(toInsert as never[], { onConflict: "dedup_key", ignoreDuplicates: true })
    .select("id");
  if (insErr) {
    console.error(`FATAL: lifecycle_nudges insert failed — ${insErr.message}`);
    return 1;
  }
  const newCount = inserted?.length ?? 0;
  console.log(`  inserted ${newCount} new row(s) (${toInsert.length - newCount} already existed — idempotent)`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  });
```

- [ ] **Step 2: Dry-run against the live DB (no writes)**

Run: `bun scripts/project-feed/lifecycle-nudges.mts --dry-run`
Expected: prints `N armed sequence(s) checked` and, for any address with a real matching
transition, a `[dry-run] would insert` line with a fully-populated candidate row. Zero rows in
`lifecycle_nudges` change.

- [ ] **Step 3: Real run against the live DB**

Run: `bun scripts/project-feed/lifecycle-nudges.mts`
Expected: `inserted N new row(s)` — confirm by re-running the same command immediately after;
the second run must report `inserted 0 new row(s) (N already existed — idempotent)`.

- [ ] **Step 4: Commit**

```bash
git add scripts/project-feed/lifecycle-nudges.mts
git commit -m "feat: daily cron adapter for PLATFORM_ARC auto-advance nudges"
```

---

### Task 7: GHA workflow — `lifecycle-nudges-daily.yml`

**Files:**
- Create: `.github/workflows/lifecycle-nudges-daily.yml`

**Interfaces:**
- Consumes: `scripts/project-feed/lifecycle-nudges.mts` from Task 6.

- [ ] **Step 1: Write the workflow file (mirrors `project-feed-change-detection-daily.yml`)**

```yaml
name: Lifecycle-arc nudges (daily)

on:
  schedule:
    # 16:00 UTC — after all three staggered listing-lifecycle-daily county runs
    # (Lee 09:00, Collier 12:00, Hendry 15:00 UTC) have committed the day's transitions.
    - cron: "0 16 * * *"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Dry run — print every would-insert row, write nothing"
        required: false
        default: "false"

permissions:
  contents: read

jobs:
  nudge:
    if: ${{ vars.ENGINE_ENABLED != 'false' || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.14"

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run lifecycle-arc nudge detection
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
        run: |
          if [ "${{ github.event.inputs.dry_run }}" = "true" ]; then
            bun scripts/project-feed/lifecycle-nudges.mts --dry-run
          else
            bun scripts/project-feed/lifecycle-nudges.mts
          fi

      - name: Healthchecks.io heartbeat
        if: always()
        run: |
          curl -fsS -m 10 --retry 3 \
            "https://hc-ping.com/${{ secrets.HEALTHCHECKS_PING_KEY }}/lifecycle-nudges-daily?create=1" || true
```

- [ ] **Step 2: Validate YAML syntax**

Run: `bun -e "console.log(require('js-yaml') ? 'has js-yaml' : '')" 2>/dev/null || python -c "import yaml; yaml.safe_load(open('.github/workflows/lifecycle-nudges-daily.yml')); print('valid')"`
Expected: `valid` (or equivalent no-error output — this repo has Python available; `yaml.safe_load`
raising nothing confirms syntactically valid YAML).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/lifecycle-nudges-daily.yml
git commit -m "feat: daily cron wrapper for lifecycle-arc nudges"
```

---

### Task 8: API surface — expose + dismiss nudges

**Files:**
- 🔴 Modify: `app/api/projects/[id]/sequence/route.ts:38-59` (the `loadSequence` helper and `GET`
  handler)
- Create: `app/api/projects/[id]/sequence/nudges/route.ts`

**Interfaces:**
- Consumes: `public.lifecycle_nudges` (Task 1).
- Produces: `GET /api/projects/[id]/sequence` response now includes `nudges: LifecycleNudgeRow[]`
  (un-dismissed rows for the sequence); `PATCH /api/projects/[id]/sequence/nudges` with
  `{ nudge_id }` sets `dismissed_at` — consumed by Task 9 (`ArcStrip`).

- [ ] **Step 1: Extend the GET handler to also load un-dismissed nudges**

In `app/api/projects/[id]/sequence/route.ts`, add a sibling loader right after `loadSequence`:

```ts
async function loadNudges(db: Db, sequenceId: string) {
  const { data } = await db
    .from("lifecycle_nudges")
    .select("id, step_key, event_kind, price, price_delta, at")
    .eq("sequence_id", sequenceId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false });
  return data ?? [];
}
```

Then change the `GET` handler from:

```ts
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedProject(db, id)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ sequence: await loadSequence(db, id) });
}
```

to:

```ts
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownedProject(db, id)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const sequence = await loadSequence(db, id);
  const nudges = sequence ? await loadNudges(db, sequence.id) : [];
  return NextResponse.json({ sequence, nudges });
}
```

- [ ] **Step 2: Create the dismiss route**

```ts
// app/api/projects/[id]/sequence/nudges/route.ts
//
// Dismiss endpoint for lifecycle_nudges (spec
// 2026-07-06-platform-arc-auto-advance-nudges-design.md). PATCH {nudge_id} sets dismissed_at —
// the ONLY mutation the UI makes on this table; nothing here touches step state. RLS
// (auth.uid() = user_id) is the ownership check.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createClient(await cookies());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const nudgeId = typeof body?.nudge_id === "string" ? body.nudge_id : "";
  if (!nudgeId) return NextResponse.json({ error: "nudge_id required" }, { status: 422 });

  const { data, error } = await db
    .from("lifecycle_nudges")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", nudgeId)
    .eq("project_id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit -p tsconfig.json`
Expected: no new type errors (the `lifecycle_nudges` table is now in
`database-generated.types.ts` from Task 1).

- [ ] **Step 4: Manual verification**

```bash
curl -s "http://localhost:3000/api/projects/<a-project-id-with-an-armed-sequence>/sequence" \
  -H "Cookie: <your-session-cookie>" | jq '.nudges'
```

Expected: an array (empty, or containing rows inserted by Task 6's real run).

- [ ] **Step 5: Commit**

```bash
git add app/api/projects/[id]/sequence/route.ts "app/api/projects/[id]/sequence/nudges/route.ts"
git commit -m "feat: expose + dismiss lifecycle_nudges via the sequence API"
```

---

### Task 9: UI — `ArcNudgeChip` wired into `ArcStrip`

**Files:**
- Create: `components/email-lab/ArcNudgeChip.tsx`
- Modify: `components/email-lab/ArcStrip.tsx`

**Interfaces:**
- Consumes: `nudgeChipText` (Task 5); `GET`/`PATCH .../sequence/nudges` (Task 8).
- Produces: nothing further downstream — this is the leaf UI.

- [ ] **Step 1: Write `ArcNudgeChip.tsx` (mirrors `components/project/CollisionChip.tsx`)**

```tsx
// components/email-lab/ArcNudgeChip.tsx
"use client";
import { nudgeChipText } from "@/lib/project/nudge-copy";
import type { NudgeEventKind } from "@/lib/project/lifecycle-nudge";

export interface ArcNudge {
  id: string;
  step_key: string;
  event_kind: NudgeEventKind;
  price: number | null;
  price_delta: number | null;
  at: string;
}

export function ArcNudgeChip({
  nudge,
  onBuild,
  onDismiss,
  dismissing,
}: {
  nudge: ArcNudge;
  onBuild: () => void;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  return (
    <div className="mt-2 rounded-md border border-gulf-teal/30 bg-gulf-teal/5 p-2 text-[10px] text-gulf-teal">
      <p>{nudgeChipText(nudge.event_kind, nudge.price_delta)}</p>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={onBuild}
          className="rounded border border-gulf-teal/40 px-2 py-0.5 hover:bg-gulf-teal/10"
        >
          Build it →
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={dismissing}
          className="px-1 text-white/40 hover:text-white/70 disabled:opacity-50"
        >
          {dismissing ? "…" : "×"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire nudge state into `ArcStrip.tsx`**

Add imports at the top of `components/email-lab/ArcStrip.tsx`:

```ts
import { ArcNudgeChip, type ArcNudge } from "./ArcNudgeChip";
```

Add state + a mount-time fetch, right after the existing `useState` declarations
(`const [note, setNote] = useState<string | null>(null);`):

```ts
const [nudges, setNudges] = useState<ArcNudge[]>([]);
const [dismissingId, setDismissingId] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  fetch(`/api/projects/${projectId}/sequence`)
    .then((r) => r.json())
    .then((j) => {
      if (!cancelled && Array.isArray(j?.nudges)) setNudges(j.nudges);
    })
    .catch(() => {});
  return () => {
    cancelled = true;
  };
}, [projectId]);

async function dismissNudge(nudgeId: string) {
  setDismissingId(nudgeId);
  try {
    const res = await fetch(`/api/projects/${projectId}/sequence/nudges`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nudge_id: nudgeId }),
    });
    if (res.ok) setNudges((prev) => prev.filter((n) => n.id !== nudgeId));
  } finally {
    setDismissingId(null);
  }
}
```

Add the `useEffect` import to the existing React import line (`import { useState } from "react";`
becomes `import { useEffect, useState } from "react";`).

- [ ] **Step 3: Render the chip inside the matching step card**

In the step-card `.map((step) => ...)` block, immediately after the closing `</div>` of the
`previewing === step.key && (...)` block and before the action-buttons `<div>`, add:

```tsx
{nudges
  .filter((n) => n.step_key === step.key)
  .map((n) => (
    <ArcNudgeChip
      key={n.id}
      nudge={n}
      onBuild={() => router.push(arcStepDestination(projectId, step))}
      onDismiss={() => void dismissNudge(n.id)}
      dismissing={dismissingId === n.id}
    />
  ))}
```

- [ ] **Step 4: Refresh nudges after a fire/patch action completes**

In the existing `fire()` function, right after `if (fresh.sequence) onChanged(fresh.sequence);`,
add:

```ts
if (Array.isArray(fresh.nudges)) setNudges(fresh.nudges);
```

(`fresh` already comes from the same `GET .../sequence` response that now includes `nudges` —
no new fetch needed.)

- [ ] **Step 5: Typecheck + build**

Run: `bunx next build`
Expected: build succeeds with no new type or lint errors.

- [ ] **Step 6: Manual browser verification**

Start the dev server (`bun dev` or the repo's existing dev script), open a project with an armed
arc that has at least one `lifecycle_nudges` row (from Task 6's real run), confirm:
- the matching step card shows the chip with the correct copy for its `event_kind`,
- clicking "Build it →" navigates to the same URL the existing manual "Build"/"Edit" button uses,
- clicking "×" removes the chip and a page refresh does not bring it back (dismissed_at persisted).

- [ ] **Step 7: Commit**

```bash
git add components/email-lab/ArcNudgeChip.tsx components/email-lab/ArcStrip.tsx
git commit -m "feat: render dismissible lifecycle-arc nudge chips on the arc strip"
```

---

### Task 10: Final integration pass

**Files:** none new — verification only.

- [ ] **Step 1: Run the full relevant test suite**

Run: `bun test lib/listings/address-key.test.ts lib/project/lifecycle-nudge.test.ts lib/project/nudge-copy.test.ts`
Expected: all green, zero failures.

- [ ] **Step 2: Run the existing sequence/scheduler test suites to confirm nothing regressed**

Run: `bun test lib/email/sequence lib/email/__tests__/scheduler.test.ts`
Expected: all green — this build must be purely additive to the manual milestone flow.

- [ ] **Step 3: Full production build**

Run: `bunx next build`
Expected: green, no new errors or warnings.

- [ ] **Step 4: Manual end-to-end dry-run of the cron path**

Run: `bun scripts/project-feed/lifecycle-nudges.mts --dry-run` one more time against the live DB
after all code is merged, confirming the candidate rows look correct and reference real armed
sequences.

- [ ] **Step 5: Update SESSION_LOG.md and close the check**

Append a top-of-file entry describing what shipped (per RULE 0 in this repo's `CLAUDE.md`), then:

```bash
node scripts/check.mjs close platform_arc_nudges_live_verify
```

(Only run this once the operator has confirmed the feature works live — this check is prod
evidence, not a dev attestation.)

- [ ] **Step 6: Push**

```bash
node scripts/safe-push.mjs
```

(Requires the operator's explicit go-ahead per this repo's push-approval gate — do not run
unattended.)

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 3, Task 8 | `app/api/projects/[id]/sequence/route.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
