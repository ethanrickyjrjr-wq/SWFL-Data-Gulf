# Contact Segmentation for Blast Sends — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 10 tasks, 22 files, keywords: migration, schema, architecture

**Goal:** Let a user build a reusable, saved filter over their own `contacts` (tags AND/OR/NOT, custom attributes, "engaged with campaign X") and use it to pick recipients for a one-off blast send, replacing the picker's single-tag click-filter.

**Architecture:** A pure filter-evaluation core (`lib/email/segments/filter.ts`) mirrors the existing `suppression.ts` "extract/decide" pattern — a JSON AST (never raw SQL) evaluated in plain JS. A thin Supabase wrapper (`lib/email/segments/resolve.ts`) fetches only the `contacts` rows and the specific `email_events` rows a filter actually references, then hands them to the pure evaluator. Saved filters persist in a new `contact_segments` table. Attribute/engagement conditions are gated paid-only through the existing `lib/email/lab/capabilities.ts` dial, enforced server-side (not just in the picker UI).

**Tech Stack:** Next.js API routes (Node runtime), Supabase/Postgres (RLS), Bun test runner, React (`ContactPickerModal`).

## Global Constraints

- The filter is a JSON AST only — no layer ever accepts or compiles a raw SQL string or free-text query box (spec: Filter DSL section).
- Operates ONLY on the `contacts` table. Never touches `email_contacts`, `outreach_recipients`, or `weekly_read_subscribers` (spec: Scope/non-goals). Does not resolve the open `contacts_email_vs_public_lane` check.
- Does not rename, merge with, or query against `email_audiences` (spec: Naming disambiguation) — that table belongs to the unrelated recurring-digest lane.
- Attribute and engagement conditions are `"paid-only"` in `lib/email/lab/capabilities.ts`'s `FEATURE_ROUTING`; tag-only filtering stays `"both"`. Every route that accepts a filter must enforce this server-side — a client-side-only gate is not sufficient (mirrors how `/api/deliverables/[id]/blast` already validates `variant_test` server-side, not just via the send-modal UI).
- `/api/deliverables/[id]/blast` is never modified — it keeps accepting only `contact_ids[]`.
- Migrations run via `bun scripts/run-migration.ts migrations/<file>.sql` (creds in `.dlt/secrets.toml`) and must be idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
- After any migration, regenerate types: `bun run gen:types`.
- Test runner: `bun test <path>` (Bun's built-in runner, `bun:test` imports — matches `suppression.test.ts`). Full typecheck: `bunx next build`, not `npx tsc`.
- Stage explicit file paths in every commit — never `git add -A`.

---

### Task 1: Schema — `contacts.attribs` column + `contact_segments` table

**Files:**
- Create: `migrations/20260714_contact_segments.sql`
- Modify: `database-generated.types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces: `public.contacts.attribs jsonb not null default '{}'` and `public.contact_segments(id, user_id, name, filter, created_at, updated_at)`, both used by every later task.

- [ ] **Step 1: Write the migration**

```sql
-- migrations/20260714_contact_segments.sql
--
-- Contact segmentation for the ONE-OFF BLAST lane (ContactPickerModal /
-- POST /api/deliverables/[id]/blast). Spec: docs/superpowers/specs/2026-07-14-contact-segments-design.md
--
-- contact_segments is NOT email_audiences (the tag -> Resend-segment-id cache
-- for the recurring DIGEST broadcast lane, lib/email/audience-sync.ts).
-- Different table, different send path — see lib/email/CLAUDE.md.
--
-- Idempotent. Safe to re-run.

BEGIN;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS attribs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.contacts.attribs IS
  'Arbitrary per-contact key/value attributes (e.g. city, budget), captured from CSV import columns not already recognised (email/name/tags). All values are strings. Read by lib/email/segments/filter.ts -- nothing else writes to this column.';

CREATE TABLE IF NOT EXISTS public.contact_segments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name       text NOT NULL,
  filter     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contact_segments IS
  'A user''s saved contact filter for the ONE-OFF BLAST lane (ContactPickerModal / POST /api/deliverables/[id]/blast). NOT email_audiences (tag -> Resend-segment-id cache for the recurring DIGEST broadcast lane, lib/email/audience-sync.ts) -- different table, different send path. filter is a lib/email/segments/filter.ts Condition AST -- never raw SQL.';

ALTER TABLE public.contact_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_segments_owner ON public.contact_segments;
CREATE POLICY contact_segments_owner
  ON public.contact_segments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- service_role still needs an explicit grant per table (it is NOT implicit).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_segments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_segments TO authenticated;

-- PostgREST must be told the schema changed, or the new table/column 404s until a restart.
NOTIFY pgrst, 'reload schema';

COMMIT;
```

- [ ] **Step 2: Run the migration**

Run: `bun scripts/run-migration.ts migrations/20260714_contact_segments.sql`
Expected: script reports success (no error output); re-running it is safe (idempotent).

- [ ] **Step 3: Regenerate types and verify**

Run: `bun run gen:types`
Then check `database-generated.types.ts` contains `attribs: string` (Json-typed as a plain object) under `contacts.Row`/`Insert`/`Update`, and a new `contact_segments: {...}` block with `id, user_id, name, filter, created_at, updated_at`.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260714_contact_segments.sql database-generated.types.ts
git commit -m "feat(db): add contacts.attribs and contact_segments table"
```

---

### Task 2: CSV/vCard import — capture `attribs`

**Files:**
- Modify: `lib/email/parse-contacts-csv.ts`
- Modify: `lib/contacts/types.ts`
- Modify: `lib/contacts/parse-vcard.ts:71`
- Modify: `app/api/contacts/import/route.ts`
- Test: `lib/email/parse-contacts-csv.test.ts` (new — no existing test file for this parser today; verify with `ls lib/email/parse-contacts-csv.test.ts` before assuming, then create if absent)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ContactRow.attribs: Record<string, string>` (both the CSV parser's local `ContactRow` and the shared `lib/contacts/types.ts` one), consumed by Task 1's `contacts.attribs` column via the import route's upsert.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/parse-contacts-csv.test.ts
import { describe, expect, it } from "bun:test";
import { parseContactsCsv } from "./parse-contacts-csv";

describe("parseContactsCsv — attribs", () => {
  it("captures unrecognised columns into attribs, keyed by lowercased header", () => {
    const csv = "email,name,tags,city,budget\nalice@x.com,Alice,buyer,Naples,450000\n";
    const { rows } = parseContactsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].attribs).toEqual({ city: "Naples", budget: "450000" });
  });

  it("omits empty-valued attrib cells", () => {
    const csv = "email,city\nalice@x.com,\n";
    const { rows } = parseContactsCsv(csv);
    expect(rows[0].attribs).toEqual({});
  });

  it("rows with no extra columns get an empty attribs object", () => {
    const csv = "email,name\nalice@x.com,Alice\n";
    const { rows } = parseContactsCsv(csv);
    expect(rows[0].attribs).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/parse-contacts-csv.test.ts`
Expected: FAIL — `rows[0].attribs` is `undefined` (property doesn't exist yet).

- [ ] **Step 3: Implement — extend the parser**

In `lib/email/parse-contacts-csv.ts`, change the `ContactRow` interface (around line 20):

```ts
export interface ContactRow {
  email: string;
  name: string | null;
  tags: string[];
  attribs: Record<string, string>;
}
```

Add a cap constant next to `MAX_TAGS_PER_ROW`/`MAX_TAG_LEN` (around line 34):

```ts
const MAX_ATTRIBS_PER_ROW = 50;
```

In `parseContactsCsv`, after the existing `emailCol`/`nameCol`/`tagsCol` lookups (around line 173), add:

```ts
  const attribCols = headers
    .map((h, idx) => ({ h, idx }))
    .filter(({ h, idx }) => h && idx !== emailCol && idx !== nameCol && idx !== tagsCol)
    .slice(0, MAX_ATTRIBS_PER_ROW);
```

In the per-row loop, after computing `mergedTags` and before `rows.push(...)` (around line 200), add:

```ts
    const attribs: Record<string, string> = {};
    for (const { h, idx } of attribCols) {
      const v = (fields[idx] ?? "").trim();
      if (v) attribs[h] = v;
    }
```

Update the `rows.push` call to include it:

```ts
    rows.push({
      email,
      name: rawName.trim() || null,
      tags: mergedTags,
      attribs,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/parse-contacts-csv.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Thread `attribs` through the shared type and vCard parser**

In `lib/contacts/types.ts`, add `attribs` to both interfaces:

```ts
export interface Contact {
  id: string;
  user_id: string;
  name: string | null;
  email: string;
  phone: string | null;
  tags: string[];
  attribs: Record<string, string>;
  unsubscribed: boolean;
  created_at: string;
}

export interface ContactRow {
  name: string | null;
  email: string;
  phone: string | null;
  tags: string[];
  attribs: Record<string, string>;
}
```

In `lib/contacts/parse-vcard.ts:71`, change:

```ts
      rows.push({ email, name, phone, tags: [] });
```

to:

```ts
      rows.push({ email, name, phone, tags: [], attribs: {} });
```

- [ ] **Step 6: Wire the import route**

In `app/api/contacts/import/route.ts`, update the CSV branch (around line 51) from:

```ts
    rows = parsed.rows.map((r) => ({ email: r.email, name: r.name, phone: null, tags: r.tags }));
```

to:

```ts
    rows = parsed.rows.map((r) => ({
      email: r.email,
      name: r.name,
      phone: null,
      tags: r.tags,
      attribs: r.attribs,
    }));
```

(The vCard branch already assigns `rows = parsed.rows` directly and needs no change — `parse-vcard.ts` now produces `attribs: {}` itself.)

- [ ] **Step 7: Run the full test suite for this area and verify no regressions**

Run: `bun test lib/email/parse-contacts-csv.test.ts lib/email/__tests__/contact-import-replay.route.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/email/parse-contacts-csv.ts lib/email/parse-contacts-csv.test.ts lib/contacts/types.ts lib/contacts/parse-vcard.ts app/api/contacts/import/route.ts
git commit -m "feat(contacts): capture unrecognised CSV columns as attribs"
```

---

### Task 3: Capability dial — `contactSegments` + tier-resolution helper

**Files:**
- Modify: `lib/email/lab/capabilities.ts`
- Modify: `lib/email/lab/capabilities.test.ts`

**Interfaces:**
- Consumes: `lib/email/usage.ts`'s tier vocabulary (`"free" | "starter" | "growth" | "pro"`, see `TIER_LIMITS`).
- Produces: `EmailLabCapabilities.contactSegments: boolean`, `emailLabTierFor(billingTier: string): EmailLabTier` — consumed by Tasks 7, 8, 9.

- [ ] **Step 1: Write the failing test**

Add to `lib/email/lab/capabilities.test.ts`:

```ts
import { emailLabTierFor } from "./capabilities";
```

```ts
test("emailLabTierFor maps billing_subscriptions.tier to the binary dial tier", () => {
  expect(emailLabTierFor("free")).toBe("free");
  expect(emailLabTierFor("starter")).toBe("paid");
  expect(emailLabTierFor("growth")).toBe("paid");
  expect(emailLabTierFor("pro")).toBe("paid");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/lab/capabilities.test.ts`
Expected: FAIL — `emailLabTierFor` is not exported.

- [ ] **Step 3: Implement**

In `lib/email/lab/capabilities.ts`, add to the `EmailLabCapabilities` interface (after `datasets`):

```ts
  /** Attribute + engagement conditions in the contact picker (lib/email/segments).
   *  Tag-only filtering stays available everywhere. */
  contactSegments: boolean;
```

Add to `FEATURE_ROUTING` (after `datasets: "paid-only",`):

```ts
  contactSegments: "paid-only",
```

Add this function near the bottom of the file, after `fontsFor`:

```ts
/** Maps a billing_subscriptions.tier string (free/starter/growth/pro — see
 *  lib/email/usage.ts TIER_LIMITS) to the binary EmailLabTier this dial uses.
 *  Anything other than "free" counts as paid. */
export function emailLabTierFor(billingTier: string): EmailLabTier {
  return billingTier === "free" ? "free" : "paid";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/email/lab/capabilities.test.ts`
Expected: PASS — including the pre-existing "every feature lands exactly where it was routed" and "paid-only features never leak into free" tests, which automatically cover `contactSegments` with no changes needed (they iterate `FEATURE_ROUTING`'s keys).

- [ ] **Step 5: Commit**

```bash
git add lib/email/lab/capabilities.ts lib/email/lab/capabilities.test.ts
git commit -m "feat(email-lab): route contactSegments paid-only, add emailLabTierFor"
```

---

### Task 4: `/api/contacts` — surface the caller's tier

**Files:**
- Modify: `app/api/contacts/route.ts`

**Interfaces:**
- Consumes: `emailLabTierFor` (Task 3).
- Produces: `GET /api/contacts` response shape becomes `{ contacts: Contact[], tier: "free"|"paid" }` (was a bare array) — consumed by Task 9's `ContactPickerModal`.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/contacts/route.test.ts
import { describe, expect, it, mock } from "bun:test";

describe("GET /api/contacts", () => {
  it("returns { contacts, tier } instead of a bare array", async () => {
    mock.module("@/utils/supabase/server", () => ({
      createClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
        from: () => ({
          select: () => ({
            order: () => Promise.resolve({ data: [{ id: "c1" }], error: null }),
          }),
        }),
      }),
    }));
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { tier: "growth" }, error: null }) }),
          }),
        }),
      }),
    }));
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ contacts: [{ id: "c1" }], tier: "paid" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test app/api/contacts/route.test.ts`
Expected: FAIL — current handler returns the bare array, not `{ contacts, tier }`.

- [ ] **Step 3: Implement**

In `app/api/contacts/route.ts`, add imports:

```ts
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { emailLabTierFor } from "@/lib/email/lab/capabilities";
```

Replace the `GET` handler body:

```ts
export async function GET() {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "read failed" }, { status: 500 });

  // Same query shape as lib/email/usage.ts#checkUsageLimit — fail open to "free"
  // on any lookup error rather than blocking the picker from loading at all.
  const db = createServiceRoleClient();
  const { data: sub } = await db
    .from("billing_subscriptions")
    .select("tier")
    .eq("user_id", user.id)
    .maybeSingle();
  const tier = emailLabTierFor(sub?.tier ?? "free");

  return NextResponse.json({ contacts: data ?? [], tier });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test app/api/contacts/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/contacts/route.ts app/api/contacts/route.test.ts
git commit -m "feat(api): GET /api/contacts also returns the caller's email-lab tier"
```

---

### Task 5: Pure filter engine

**Files:**
- Create: `lib/email/segments/filter.ts`
- Test: `lib/email/segments/filter.test.ts`

**Interfaces:**
- Consumes: nothing (pure, dependency-free).
- Produces: `Condition` (AST type), `SegmentContact`, `SegmentEventRow`, `evaluateSegment(contacts, events, filter): SegmentContact[]`, `requiresPaidTier(filter): boolean` — consumed by Tasks 6, 7, 8, 9.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/segments/filter.test.ts
import { describe, expect, it } from "bun:test";
import { evaluateSegment, requiresPaidTier, type Condition, type SegmentContact } from "./filter";

const alice: SegmentContact = { id: "c-alice", email: "alice@x.com", name: "Alice", tags: ["buyer"], attribs: { city: "Naples", budget: "450000" } };
const bob: SegmentContact = { id: "c-bob", email: "bob@x.com", name: "Bob", tags: ["seller", "vip"], attribs: {} };
const carol: SegmentContact = { id: "c-carol", email: "carol@x.com", name: "Carol", tags: ["buyer", "vip"], attribs: { city: "Fort Myers" } };

describe("evaluateSegment — tags", () => {
  it("has: matches contacts carrying the tag", () => {
    const filter: Condition = { field: "tags", op: "has", value: "buyer" };
    expect(evaluateSegment([alice, bob, carol], [], filter).map((c) => c.id)).toEqual(["c-alice", "c-carol"]);
  });

  it("not: excludes contacts carrying the tag", () => {
    const filter: Condition = { not: { field: "tags", op: "has", value: "vip" } };
    expect(evaluateSegment([alice, bob, carol], [], filter).map((c) => c.id)).toEqual(["c-alice"]);
  });

  it("and/or: buyer AND NOT vip", () => {
    const filter: Condition = {
      and: [{ field: "tags", op: "has", value: "buyer" }, { not: { field: "tags", op: "has", value: "vip" } }],
    };
    expect(evaluateSegment([alice, bob, carol], [], filter).map((c) => c.id)).toEqual(["c-alice"]);
  });
});

describe("evaluateSegment — attribs", () => {
  it("eq matches an exact string value", () => {
    const filter: Condition = { field: "attribs", key: "city", op: "eq", value: "Naples" };
    expect(evaluateSegment([alice, bob, carol], [], filter).map((c) => c.id)).toEqual(["c-alice"]);
  });

  it("gt/lt coerce stored strings to numbers; non-numeric values never match", () => {
    const gt: Condition = { field: "attribs", key: "budget", op: "gt", value: "400000" };
    expect(evaluateSegment([alice, bob, carol], [], gt).map((c) => c.id)).toEqual(["c-alice"]);
    const lt: Condition = { field: "attribs", key: "budget", op: "lt", value: "100" };
    expect(evaluateSegment([alice, bob, carol], [], lt)).toEqual([]);
  });

  it("contains does a case-insensitive substring match", () => {
    const filter: Condition = { field: "attribs", key: "city", op: "contains", value: "fort" };
    expect(evaluateSegment([alice, bob, carol], [], filter).map((c) => c.id)).toEqual(["c-carol"]);
  });

  it("a missing key never matches", () => {
    const filter: Condition = { field: "attribs", key: "nonexistent", op: "eq", value: "x" };
    expect(evaluateSegment([alice, bob, carol], [], filter)).toEqual([]);
  });
});

describe("evaluateSegment — email/name", () => {
  it("matches is a case-insensitive substring on the chosen field", () => {
    const filter: Condition = { field: "email", op: "matches", value: "ALICE" };
    expect(evaluateSegment([alice, bob, carol], [], filter).map((c) => c.id)).toEqual(["c-alice"]);
  });
});

describe("evaluateSegment — engagement", () => {
  const events = [
    { contact_id: "c-alice", event: "opened", did: "d-1" },
    { contact_id: "c-bob", event: "clicked", did: "d-1" },
    { contact_id: "c-alice", event: "opened", did: "d-2" },
  ];

  it("opened: matches only contacts with an opened row for that deliverable", () => {
    const filter: Condition = { field: "engagement", op: "opened", deliverable_id: "d-1" };
    expect(evaluateSegment([alice, bob, carol], events, filter).map((c) => c.id)).toEqual(["c-alice"]);
  });

  it("clicked: scoped to the given deliverable only", () => {
    const filter: Condition = { field: "engagement", op: "clicked", deliverable_id: "d-2" };
    expect(evaluateSegment([alice, bob, carol], events, filter)).toEqual([]);
  });

  it("never_opened: matches contacts with no opened row for that deliverable", () => {
    const filter: Condition = { field: "engagement", op: "never_opened", deliverable_id: "d-1" };
    expect(evaluateSegment([alice, bob, carol], events, filter).map((c) => c.id)).toEqual(["c-bob", "c-carol"]);
  });
});

describe("requiresPaidTier", () => {
  it("false for tag-only and email/name conditions", () => {
    expect(requiresPaidTier({ field: "tags", op: "has", value: "buyer" })).toBe(false);
    expect(requiresPaidTier({ and: [{ field: "tags", op: "has", value: "buyer" }, { field: "email", op: "matches", value: "x" }] })).toBe(false);
  });

  it("true when an attribs or engagement condition appears anywhere in the tree", () => {
    expect(requiresPaidTier({ field: "attribs", key: "city", op: "eq", value: "Naples" })).toBe(true);
    expect(requiresPaidTier({ field: "engagement", op: "opened", deliverable_id: "d-1" })).toBe(true);
    expect(
      requiresPaidTier({ and: [{ field: "tags", op: "has", value: "buyer" }, { not: { field: "engagement", op: "opened", deliverable_id: "d-1" } }] }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/segments/filter.test.ts`
Expected: FAIL — `./filter` module doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// lib/email/segments/filter.ts
//
// THE contact-segmentation filter authority for the ONE-OFF BLAST lane
// (ContactPickerModal / POST /api/deliverables/[id]/blast). Spec:
// docs/superpowers/specs/2026-07-14-contact-segments-design.md
//
// NOT email_audiences (tag -> Resend-segment-id cache for the recurring
// DIGEST broadcast lane, lib/email/audience-sync.ts) — different concept,
// different send path. See lib/email/CLAUDE.md.
//
// The filter is a JSON AST (Condition) — never raw SQL, never a free-text
// query box. This module is the pure decision core: given contacts + the
// relevant email_events rows, decide who matches. Mirrors the
// extract/decide split in lib/email/suppression.ts.

export type Condition =
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition }
  | { field: "tags"; op: "has"; value: string }
  | { field: "attribs"; key: string; op: "eq" | "gt" | "lt" | "contains"; value: string }
  | { field: "email" | "name"; op: "matches"; value: string }
  | { field: "engagement"; op: "opened" | "clicked" | "never_opened"; deliverable_id: string };

export interface SegmentContact {
  id: string;
  email: string;
  name: string | null;
  tags: string[];
  /** All values are strings — CSV/import-derived, see contacts.attribs. */
  attribs: Record<string, string>;
}

/** One relevant email_events row, as read at resolve time (scoped to the
 *  deliverable ids an engagement condition actually references). */
export interface SegmentEventRow {
  contact_id: string | null;
  event: string;
  did: string | null;
}

function matchesAttrib(c: SegmentContact, key: string, op: string, value: string): boolean {
  const raw = c.attribs[key];
  if (raw === undefined) return false;
  switch (op) {
    case "eq":
      return raw === value;
    case "contains":
      return raw.toLowerCase().includes(value.toLowerCase());
    case "gt": {
      const a = Number(raw);
      const b = Number(value);
      return !Number.isNaN(a) && !Number.isNaN(b) && a > b;
    }
    case "lt": {
      const a = Number(raw);
      const b = Number(value);
      return !Number.isNaN(a) && !Number.isNaN(b) && a < b;
    }
    default:
      return false;
  }
}

function matchesEngagement(
  c: SegmentContact,
  events: readonly SegmentEventRow[],
  op: "opened" | "clicked" | "never_opened",
  deliverableId: string,
): boolean {
  const rows = events.filter((e) => e.contact_id === c.id && e.did === deliverableId);
  const has = (name: string) => rows.some((e) => e.event === name);
  if (op === "opened") return has("opened");
  if (op === "clicked") return has("clicked");
  return !has("opened"); // never_opened
}

function matches(c: SegmentContact, events: readonly SegmentEventRow[], cond: Condition): boolean {
  if ("and" in cond) return cond.and.every((x) => matches(c, events, x));
  if ("or" in cond) return cond.or.some((x) => matches(c, events, x));
  if ("not" in cond) return !matches(c, events, cond.not);

  switch (cond.field) {
    case "tags":
      return c.tags.includes(cond.value);
    case "attribs":
      return matchesAttrib(c, cond.key, cond.op, cond.value);
    case "email":
    case "name": {
      const v = (cond.field === "email" ? c.email : c.name) ?? "";
      return v.toLowerCase().includes(cond.value.toLowerCase());
    }
    case "engagement":
      return matchesEngagement(c, events, cond.op, cond.deliverable_id);
  }
}

/** Pure: decide which contacts match a filter, given the contacts and the
 *  (already scoped) email_events rows relevant to it. No I/O. */
export function evaluateSegment(
  contacts: readonly SegmentContact[],
  events: readonly SegmentEventRow[],
  filter: Condition,
): SegmentContact[] {
  return contacts.filter((c) => matches(c, events, filter));
}

/** True if `filter` contains an attribs or engagement condition anywhere in
 *  the tree — the paid-only surface (lib/email/lab/capabilities.ts
 *  FEATURE_ROUTING.contactSegments). Tag-only and email/name-only filters
 *  return false and stay available on every tier. */
export function requiresPaidTier(filter: Condition): boolean {
  if ("and" in filter) return filter.and.some(requiresPaidTier);
  if ("or" in filter) return filter.or.some(requiresPaidTier);
  if ("not" in filter) return requiresPaidTier(filter.not);
  return filter.field === "attribs" || filter.field === "engagement";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/email/segments/filter.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/email/segments/filter.ts lib/email/segments/filter.test.ts
git commit -m "feat(email): pure contact-segment filter engine"
```

---

### Task 6: Resolve wrapper — fetch + evaluate

**Files:**
- Create: `lib/email/segments/resolve.ts`
- Test: `lib/email/segments/resolve.test.ts`

**Interfaces:**
- Consumes: `evaluateSegment`, `Condition`, `SegmentContact`, `SegmentEventRow` (Task 5).
- Produces: `resolveSegment(db, userId, filter): Promise<SegmentContact[]>` — consumed by Tasks 7 (preview) and 8.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/segments/resolve.test.ts
import { describe, expect, it } from "bun:test";
import { resolveSegment } from "./resolve";
import type { Condition } from "./filter";

/** Minimal stub matching the subset of the Supabase client resolve.ts calls. */
function stubDb(opts: {
  contacts: { id: string; email: string; name: string | null; tags: string[]; attribs: Record<string, string> }[];
  events?: { contact_id: string | null; event: string; did: string | null }[];
}) {
  return {
    from(table: string) {
      if (table === "contacts") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: opts.contacts, error: null }),
            }),
          }),
        };
      }
      if (table === "email_events") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                in: async () => ({ data: opts.events ?? [], error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe("resolveSegment", () => {
  it("resolves a tag-only filter without querying email_events", async () => {
    const db = stubDb({
      contacts: [{ id: "c1", email: "a@x.com", name: "A", tags: ["buyer"], attribs: {} }],
    });
    const filter: Condition = { field: "tags", op: "has", value: "buyer" };
    const out = await resolveSegment(db as never, "u1", filter);
    expect(out.map((c) => c.id)).toEqual(["c1"]);
  });

  it("resolves an engagement filter using the fetched email_events", async () => {
    const db = stubDb({
      contacts: [
        { id: "c1", email: "a@x.com", name: "A", tags: [], attribs: {} },
        { id: "c2", email: "b@x.com", name: "B", tags: [], attribs: {} },
      ],
      events: [{ contact_id: "c1", event: "opened", did: "d-1" }],
    });
    const filter: Condition = { field: "engagement", op: "opened", deliverable_id: "d-1" };
    const out = await resolveSegment(db as never, "u1", filter);
    expect(out.map((c) => c.id)).toEqual(["c1"]);
  });

  it("fails open (empty array, never throws) when the contacts query errors", async () => {
    const db = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: async () => ({ data: null, error: new Error("boom") }) }) }),
      }),
    };
    const filter: Condition = { field: "tags", op: "has", value: "buyer" };
    const out = await resolveSegment(db as never, "u1", filter);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/segments/resolve.test.ts`
Expected: FAIL — `./resolve` module doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// lib/email/segments/resolve.ts
//
// Thin Supabase wrapper for the pure filter engine (./filter.ts). Fetches the
// user's contacts, plus — only when the filter references an engagement
// condition — the email_events rows for those specific deliverable ids
// (never a full-table pull). Mirrors lib/email/suppression.ts's
// getSuppressedContacts chunked-fetch pattern.
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateSegment, type Condition, type SegmentContact, type SegmentEventRow } from "./filter";

const CHUNK = 100;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** Every deliverable_id referenced by an engagement leaf anywhere in the filter. */
function engagementDeliverableIds(cond: Condition): string[] {
  if ("and" in cond) return cond.and.flatMap(engagementDeliverableIds);
  if ("or" in cond) return cond.or.flatMap(engagementDeliverableIds);
  if ("not" in cond) return engagementDeliverableIds(cond.not);
  if (cond.field === "engagement") return [cond.deliverable_id];
  return [];
}

/**
 * Resolve which of `userId`'s contacts match `filter`.
 *
 * Fails open to an empty list on a contacts-read error (never throws — the
 * picker shows "0 matches" rather than crashing). An email_events lookup
 * error is likewise swallowed per chunk (fail open, matching
 * suppression.ts's posture) — a chunk that errors simply contributes no
 * engagement rows, never blocks resolution of the rest.
 */
export async function resolveSegment(
  db: SupabaseClient,
  userId: string,
  filter: Condition,
): Promise<SegmentContact[]> {
  const { data: contactRows, error: contactsErr } = await db
    .from("contacts")
    .select("id, email, name, tags, attribs")
    .eq("user_id", userId)
    .eq("unsubscribed", false);
  if (contactsErr || !contactRows) return [];

  const contacts: SegmentContact[] = contactRows.map((c: Record<string, unknown>) => ({
    id: c.id as string,
    email: c.email as string,
    name: (c.name as string) ?? null,
    tags: (c.tags as string[]) ?? [],
    attribs: (c.attribs as Record<string, string>) ?? {},
  }));

  const deliverableIds = [...new Set(engagementDeliverableIds(filter))];
  const events: SegmentEventRow[] = [];
  if (deliverableIds.length > 0) {
    const contactIds = contacts.map((c) => c.id);
    for (const idChunk of chunks(contactIds)) {
      const { data } = await db
        .from("email_events")
        .select("contact_id, event, did")
        .eq("user_id", userId)
        .in("contact_id", idChunk)
        .in("did", deliverableIds);
      if (data) events.push(...(data as SegmentEventRow[]));
    }
  }

  return evaluateSegment(contacts, events, filter);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/email/segments/resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/segments/resolve.ts lib/email/segments/resolve.test.ts
git commit -m "feat(email): resolveSegment — thin DB wrapper for the filter engine"
```

---

### Task 7: `/api/segments` CRUD

**Files:**
- Create: `app/api/segments/route.ts`
- Create: `app/api/segments/[id]/route.ts`

**Interfaces:**
- Consumes: `requiresPaidTier`, `Condition` (Task 5); `emailLabTierFor` (Task 3).
- Produces: `GET/POST /api/segments`, `PATCH/DELETE /api/segments/[id]` — consumed by Task 9's "Save as segment" UI.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/segments/route.test.ts
import { describe, expect, it, mock } from "bun:test";

function mockSupabase(user: { id: string } | null, insertResult: unknown) {
  mock.module("@/utils/supabase/server", () => ({
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user } }) },
      from: (table: string) => ({
        select: () => ({ order: async () => ({ data: [], error: null }) }),
        insert: () => ({
          select: () => ({ single: async () => ({ data: insertResult, error: null }) }),
        }),
      }),
    }),
  }));
}

describe("POST /api/segments", () => {
  it("401s when signed out", async () => {
    mockSupabase(null, null);
    mock.module("@/utils/supabase/service-role", () => ({ createServiceRoleClient: () => ({}) }));
    const { POST } = await import("./route");
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "n", filter: {} }) }));
    expect(res.status).toBe(401);
  });

  it("403s a paid-only filter for a free-tier caller", async () => {
    mockSupabase({ id: "u1" }, { id: "s1" });
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClient: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tier: "free" } }) }) }) }),
      }),
    }));
    const { POST } = await import("./route");
    const body = { name: "VIPs", filter: { field: "attribs", key: "city", op: "eq", value: "Naples" } };
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(403);
  });

  it("201s and saves a tag-only filter for a free-tier caller", async () => {
    mockSupabase({ id: "u1" }, { id: "s1", name: "Buyers", filter: { field: "tags", op: "has", value: "buyer" } });
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClient: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tier: "free" } }) }) }) }),
      }),
    }));
    const { POST } = await import("./route");
    const body = { name: "Buyers", filter: { field: "tags", op: "has", value: "buyer" } };
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test app/api/segments/route.test.ts`
Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 3: Implement `app/api/segments/route.ts`**

```ts
// app/api/segments/route.ts
//
// GET  /api/segments — list the signed-in user's saved contact segments
// POST /api/segments — create one ({ name, filter })
//
// NOT the Resend "Segments" API and NOT email_audiences (the tag ->
// Resend-segment-id cache for the recurring digest lane,
// lib/email/audience-sync.ts). This is the ONE-OFF BLAST lane's saved
// filter — see lib/email/CLAUDE.md.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { requiresPaidTier, type Condition } from "@/lib/email/segments/filter";
import { emailLabTierFor } from "@/lib/email/lab/capabilities";

async function authed() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Same query shape as lib/email/usage.ts#checkUsageLimit. */
async function currentTier(userId: string): Promise<"free" | "paid"> {
  const db = createServiceRoleClient();
  const { data } = await db
    .from("billing_subscriptions")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();
  return emailLabTierFor(data?.tier ?? "free");
}

export async function GET() {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("contact_segments")
    .select("id, name, filter, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "read failed" }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const filter = body?.filter as Condition | undefined;
  if (!name || !filter) {
    return NextResponse.json({ error: "name and filter required" }, { status: 400 });
  }

  // Server-side tier floor — the picker UI already hides these controls from
  // free tier, but that must not be the only gate (a raw fetch could bypass it).
  if (requiresPaidTier(filter) && (await currentTier(user.id)) !== "paid") {
    return NextResponse.json({ error: "paid_tier_required" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("contact_segments")
    .insert({ user_id: user.id, name, filter })
    .select("id, name, filter, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: "save failed" }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test app/api/segments/route.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Implement `app/api/segments/[id]/route.ts`** (no separate test file — covered by the manual live-verify in Task 10; the logic is a thin, direct reuse of `requiresPaidTier`/`currentTier` already unit-tested above)

```ts
// app/api/segments/[id]/route.ts
//
// PATCH  /api/segments/[id] — update a saved segment's name/filter
// DELETE /api/segments/[id] — delete a saved segment
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { requiresPaidTier, type Condition } from "@/lib/email/segments/filter";
import { emailLabTierFor } from "@/lib/email/lab/capabilities";

async function authed() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function currentTier(userId: string): Promise<"free" | "paid"> {
  const db = createServiceRoleClient();
  const { data } = await db
    .from("billing_subscriptions")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();
  return emailLabTierFor(data?.tier ?? "free");
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const update: { name?: string; filter?: Condition; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body?.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (body?.filter) update.filter = body.filter as Condition;
  if (!update.name && !update.filter) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  if (update.filter && requiresPaidTier(update.filter) && (await currentTier(user.id)) !== "paid") {
    return NextResponse.json({ error: "paid_tier_required" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("contact_segments")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, filter, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: "update failed" }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await authed();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("contact_segments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/segments/route.ts app/api/segments/route.test.ts app/api/segments/[id]/route.ts
git commit -m "feat(api): /api/segments CRUD with server-side paid-tier enforcement"
```

---

### Task 8: Preview + sent-deliverables support routes

**Files:**
- Create: `app/api/segments/preview/route.ts`
- Create: `app/api/deliverables/sent/route.ts`

**Interfaces:**
- Consumes: `resolveSegment` (Task 6), `requiresPaidTier` (Task 5), `emailLabTierFor` (Task 3).
- Produces: `POST /api/segments/preview` → `{ contacts, count }`; `GET /api/deliverables/sent` → `{ id, label }[]` — both consumed by Task 9.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/segments/preview/route.test.ts
import { describe, expect, it, mock } from "bun:test";

describe("POST /api/segments/preview", () => {
  it("403s a paid-only filter for a free-tier caller", async () => {
    mock.module("@/utils/supabase/server", () => ({
      createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
    }));
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClient: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tier: "free" } }) }) }) }),
      }),
    }));
    const { POST } = await import("./route");
    const body = { filter: { field: "engagement", op: "opened", deliverable_id: "d-1" } };
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test app/api/segments/preview/route.test.ts`
Expected: FAIL — `./route` doesn't exist yet.

- [ ] **Step 3: Implement `app/api/segments/preview/route.ts`**

```ts
// app/api/segments/preview/route.ts
//
// POST /api/segments/preview — resolve a filter (saved or ad-hoc) against the
// signed-in user's own contacts. Used by ContactPickerModal to show a live
// match count as conditions are built, before saving or sending.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { resolveSegment } from "@/lib/email/segments/resolve";
import { requiresPaidTier, type Condition } from "@/lib/email/segments/filter";
import { emailLabTierFor } from "@/lib/email/lab/capabilities";

export async function POST(req: Request) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const filter = body?.filter as Condition | undefined;
  if (!filter) return NextResponse.json({ error: "filter required" }, { status: 400 });

  if (requiresPaidTier(filter)) {
    const db = createServiceRoleClient();
    const { data: sub } = await db
      .from("billing_subscriptions")
      .select("tier")
      .eq("user_id", user.id)
      .maybeSingle();
    if (emailLabTierFor(sub?.tier ?? "free") !== "paid") {
      return NextResponse.json({ error: "paid_tier_required" }, { status: 403 });
    }
  }

  const contacts = await resolveSegment(supabase, user.id, filter);
  return NextResponse.json({ contacts, count: contacts.length });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test app/api/segments/preview/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `app/api/deliverables/sent/route.ts`** (no relational embed — `database-generated.types.ts` shows `Relationships: []` for both `email_blasts` and `deliverables`, so this does two plain queries and joins in JS rather than assuming a PostgREST embed that isn't configured)

```ts
// app/api/deliverables/sent/route.ts
//
// GET /api/deliverables/sent — the signed-in user's own previously-blasted
// deliverables (id + a short label), for the "engaged with campaign ___"
// condition in ContactPickerModal. Only deliverables with a completed
// email_blasts row are listed — an unsent deliverable has no email_events to
// match against anyway.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: blasts, error: blastsErr } = await supabase
    .from("email_blasts")
    .select("deliverable_id, sent_at")
    .eq("user_id", user.id)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(50);
  if (blastsErr) return NextResponse.json({ error: "read failed" }, { status: 500 });

  const ids = [...new Set((blasts ?? []).map((b) => b.deliverable_id))];
  if (ids.length === 0) return NextResponse.json([]);

  const { data: deliverables, error: delivErr } = await supabase
    .from("deliverables")
    .select("id, instruction, campaign_key")
    .in("id", ids);
  if (delivErr) return NextResponse.json({ error: "read failed" }, { status: 500 });

  const byId = new Map((deliverables ?? []).map((d) => [d.id, d]));
  const sentAtById = new Map((blasts ?? []).map((b) => [b.deliverable_id, b.sent_at]));
  const out = ids.map((id) => {
    const d = byId.get(id);
    const sentAt = sentAtById.get(id);
    const label =
      (d?.instruction ?? "").trim().slice(0, 60) ||
      d?.campaign_key ||
      `Sent ${sentAt ? new Date(sentAt).toLocaleDateString() : ""}`;
    return { id, label };
  });
  return NextResponse.json(out);
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/segments/preview/route.ts app/api/segments/preview/route.test.ts app/api/deliverables/sent/route.ts
git commit -m "feat(api): segment preview + sent-deliverables list for the engagement picker"
```

---

### Task 9: `ContactPickerModal` — condition builder UI

**Files:**
- Modify: `components/contacts/ContactPickerModal.tsx`

**Interfaces:**
- Consumes: `GET /api/contacts` → `{ contacts, tier }` (Task 4); `GET /api/deliverables/sent` (Task 8); `POST /api/segments/preview` (Task 8); `GET/POST /api/segments` (Task 7); `Condition` (Task 5).
- Produces: still POSTs `contact_ids: string[]` to `/api/deliverables/[id]/blast` — that route is unchanged.

- [ ] **Step 1: Replace state and data-fetching**

In `components/contacts/ContactPickerModal.tsx`, replace the top of the component (imports through the `useEffect` contact fetch, roughly lines 1–45) with:

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import type { Contact } from "@/lib/contacts/types";
import type { Condition } from "@/lib/email/segments/filter";
import { SendCeilingMeter } from "@/components/email/SendCeilingMeter";
import { BlastResultsPanel } from "./BlastResultsPanel";

interface Props {
  deliverableId: string;
  isBlockCanvas: boolean;
  onClose: () => void;
  subjectVariants?: string[];
  ctaVariants?: string[];
}

type SendResult = { sent: number; failed: number } | { error: string; limit?: number };
type SentDeliverable = { id: string; label: string };

/** One condition row in the builder UI. Compiles to a filter.ts Condition via
 *  uiConditionsToFilter — the picker never emits raw SQL or free text. */
type UiCondition =
  | { kind: "tag"; mode: "has_any" | "not_any"; values: string[] }
  | { kind: "attrib"; key: string; op: "eq" | "gt" | "lt" | "contains"; value: string }
  | { kind: "engagement"; op: "opened" | "clicked" | "never_opened"; deliverableId: string };

function uiConditionToAst(c: UiCondition): Condition {
  if (c.kind === "tag") {
    const or: Condition = { or: c.values.map((value) => ({ field: "tags", op: "has", value })) };
    return c.mode === "has_any" ? or : { not: or };
  }
  if (c.kind === "attrib") {
    return { field: "attribs", key: c.key, op: c.op, value: c.value };
  }
  return { field: "engagement", op: c.op, deliverable_id: c.deliverableId };
}

/** All conditions are ANDed together. Empty → null (no filter — the caller
 *  falls back to the client-side "all contacts" view, today's behavior). */
function conditionsToFilter(conditions: UiCondition[]): Condition | null {
  if (conditions.length === 0) return null;
  return { and: conditions.map(uiConditionToAst) };
}

export function ContactPickerModal({
  deliverableId,
  isBlockCanvas,
  onClose,
  subjectVariants,
  ctaVariants,
}: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tier, setTier] = useState<"free" | "paid">("free");
  const [search, setSearch] = useState("");
  const [conditions, setConditions] = useState<UiCondition[]>([]);
  const [matched, setMatched] = useState<Contact[] | null>(null);
  const [sentDeliverables, setSentDeliverables] = useState<SentDeliverable[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [attachPdf, setAttachPdf] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [splitTest, setSplitTest] = useState(false);
  const [ctaOverride, setCtaOverride] = useState<string | null>(null);
  const [segmentName, setSegmentName] = useState("");
  const hasVariants = (subjectVariants?.length ?? 0) >= 2 || (ctaVariants?.length ?? 0) >= 2;

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : { contacts: [], tier: "free" }))
      .then((body: { contacts: Contact[]; tier: "free" | "paid" }) => {
        setContacts(body.contacts ?? []);
        setTier(body.tier ?? "free");
        if (body.tier === "paid") {
          fetch("/api/deliverables/sent")
            .then((r) => (r.ok ? r.json() : []))
            .then(setSentDeliverables)
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const filter = useMemo(() => conditionsToFilter(conditions), [conditions]);

  // Resolve matches server-side whenever the filter changes (attribs/engagement
  // conditions can't be evaluated client-side — the picker doesn't hold
  // email_events). An empty filter clears back to the plain client-side view.
  useEffect(() => {
    if (!filter) {
      setMatched(null);
      return;
    }
    let cancelled = false;
    fetch("/api/segments/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filter }),
    })
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((body: { contacts: Contact[] }) => {
        if (!cancelled) setMatched(body.contacts ?? []);
      })
      .catch(() => {
        if (!cancelled) setMatched([]);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const allTags = Array.from(new Set(contacts.flatMap((c) => c.tags))).sort();
  const q = search.trim().toLowerCase();
  const base = matched ?? contacts;
  const visible = base.filter((c) => {
    if (c.unsubscribed) return false;
    const matchSearch =
      !q || c.email.toLowerCase().includes(q) || (c.name ?? "").toLowerCase().includes(q);
    return matchSearch;
  });
```

- [ ] **Step 2: Replace the toggle/save helpers and `handleSend`** (unchanged send logic, keep as-is — only the section above it changes). Directly after the `visible` computation from Step 1, keep the existing `toggleAll`/`toggle`/`handleSend` functions verbatim (lines 57–100 of the original file) — no changes needed there, since they already operate on `visible`/`selected` regardless of how `visible` was computed.

- [ ] **Step 3: Add condition-builder handlers.** Immediately after `handleSend` (still inside the component, before the `return`), add:

```tsx
  function addTagCondition() {
    setConditions((prev) => [...prev, { kind: "tag", mode: "has_any", values: [] }]);
  }
  function addAttribCondition() {
    setConditions((prev) => [...prev, { kind: "attrib", key: "", op: "eq", value: "" }]);
  }
  function addEngagementCondition() {
    if (sentDeliverables.length === 0) return;
    setConditions((prev) => [
      ...prev,
      { kind: "engagement", op: "opened", deliverableId: sentDeliverables[0].id },
    ]);
  }
  function updateCondition(i: number, next: UiCondition) {
    setConditions((prev) => prev.map((c, idx) => (idx === i ? next : c)));
  }
  function removeCondition(i: number) {
    setConditions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveSegment() {
    if (!filter || !segmentName.trim()) return;
    await fetch("/api/segments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: segmentName.trim(), filter }),
    }).catch(() => {});
    setSegmentName("");
  }
```

- [ ] **Step 4: Replace the tag-filter UI block.** In the JSX, replace the existing single-tag filter block (the `{allTags.length > 0 && (...)}` block, originally around lines 225–243) with:

```tsx
              <div className="space-y-2">
                {conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
                    {c.kind === "tag" && (
                      <>
                        <select
                          value={c.mode}
                          onChange={(e) => updateCondition(i, { ...c, mode: e.target.value as "has_any" | "not_any" })}
                          className="rounded bg-white/10 px-1.5 py-1 text-white"
                        >
                          <option value="has_any">has any of</option>
                          <option value="not_any">has none of</option>
                        </select>
                        <div className="flex flex-1 flex-wrap gap-1">
                          {allTags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() =>
                                updateCondition(i, {
                                  ...c,
                                  values: c.values.includes(tag)
                                    ? c.values.filter((v) => v !== tag)
                                    : [...c.values, tag],
                                })
                              }
                              className={`rounded-full px-2 py-0.5 ${c.values.includes(tag) ? "bg-gulf-teal text-[#0a1419]" : "border border-white/10 text-gray-400"}`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {c.kind === "attrib" && tier === "paid" && (
                      <>
                        <input
                          value={c.key}
                          onChange={(e) => updateCondition(i, { ...c, key: e.target.value })}
                          placeholder="attribute (e.g. city)"
                          className="w-28 rounded bg-white/10 px-1.5 py-1 text-white placeholder-gray-500"
                        />
                        <select
                          value={c.op}
                          onChange={(e) => updateCondition(i, { ...c, op: e.target.value as UiCondition extends { kind: "attrib" } ? never : never })}
                          className="rounded bg-white/10 px-1.5 py-1 text-white"
                        >
                          <option value="eq">=</option>
                          <option value="contains">contains</option>
                          <option value="gt">&gt;</option>
                          <option value="lt">&lt;</option>
                        </select>
                        <input
                          value={c.value}
                          onChange={(e) => updateCondition(i, { ...c, value: e.target.value })}
                          placeholder="value"
                          className="flex-1 rounded bg-white/10 px-1.5 py-1 text-white placeholder-gray-500"
                        />
                      </>
                    )}
                    {c.kind === "engagement" && tier === "paid" && (
                      <>
                        <select
                          value={c.op}
                          onChange={(e) => updateCondition(i, { ...c, op: e.target.value as "opened" | "clicked" | "never_opened" })}
                          className="rounded bg-white/10 px-1.5 py-1 text-white"
                        >
                          <option value="opened">opened</option>
                          <option value="clicked">clicked</option>
                          <option value="never_opened">never opened</option>
                        </select>
                        <select
                          value={c.deliverableId}
                          onChange={(e) => updateCondition(i, { ...c, deliverableId: e.target.value })}
                          className="flex-1 rounded bg-white/10 px-1.5 py-1 text-white"
                        >
                          {sentDeliverables.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    <button onClick={() => removeCondition(i)} className="text-gray-500 hover:text-white">
                      ×
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={addTagCondition}
                    className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-400 hover:text-white"
                  >
                    + tag condition
                  </button>
                  {tier === "paid" && (
                    <>
                      <button
                        type="button"
                        onClick={addAttribCondition}
                        className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-400 hover:text-white"
                      >
                        + attribute condition
                      </button>
                      {sentDeliverables.length > 0 && (
                        <button
                          type="button"
                          onClick={addEngagementCondition}
                          className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-400 hover:text-white"
                        >
                          + engagement condition
                        </button>
                      )}
                    </>
                  )}
                </div>
                {tier === "free" && (
                  <p className="text-[11px] text-gray-500">
                    Attribute and engagement conditions are a paid feature — tag filtering is free.
                  </p>
                )}
                {filter && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      value={segmentName}
                      onChange={(e) => setSegmentName(e.target.value)}
                      placeholder="Save as segment…"
                      className="flex-1 rounded bg-white/10 px-2 py-1 text-xs text-white placeholder-gray-500"
                    />
                    <button
                      type="button"
                      onClick={saveSegment}
                      disabled={!segmentName.trim()}
                      className="rounded-full bg-gulf-teal px-2.5 py-1 text-xs font-medium text-[#0a1419] disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
```

Note: the `onChange` handler for the attrib `op` select above has a placeholder cast (`UiCondition extends { kind: "attrib" } ? never : never`) that must NOT ship — fix it in Step 5.

- [ ] **Step 5: Fix the attrib `op` select's type** (the code sample above needs a concrete type — this step exists because the conditional-type placeholder in Step 4 is not valid TypeScript). Replace that one `onChange` with:

```tsx
                        <select
                          value={c.op}
                          onChange={(e) =>
                            updateCondition(i, { ...c, op: e.target.value as "eq" | "gt" | "lt" | "contains" })
                          }
                          className="rounded bg-white/10 px-1.5 py-1 text-white"
                        >
```

- [ ] **Step 6: Manual verification in the running app**

Run: `bun run dev`, open a deliverable's page, click "Send to contacts."
Expected:
- A free-tier account sees only "+ tag condition" (no attribute/engagement buttons, and the "paid feature" note shows).
- A paid-tier account (set a `billing_subscriptions.tier` row to `"growth"` for the test user) sees all three condition buttons.
- Adding a tag condition and toggling a tag narrows the list live (via `/api/segments/preview`).
- Adding an attribute condition (e.g. `city eq Naples`) narrows correctly.
- Adding an engagement condition populates from `/api/deliverables/sent` and narrows correctly.
- "Save as segment" creates a row visible via `curl -H "cookie: ..." localhost:3000/api/segments`.
- Removing all conditions returns to the original unfiltered contact list (no regression for the empty-filter case).

- [ ] **Step 7: Run full typecheck**

Run: `bunx next build`
Expected: build succeeds with no type errors.

- [ ] **Step 8: Commit**

```bash
git add components/contacts/ContactPickerModal.tsx
git commit -m "feat(email-lab): condition-builder UI in ContactPickerModal"
```

---

### Task 10: Findability — docs, cross-references, live-verify

**Files:**
- Modify: `lib/email/CLAUDE.md`
- Modify: `lib/email/audience-sync.ts` (top-of-file comment only)
- Modify: `SESSION_LOG.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by other tasks — this is the "so a future session finds this" step (spec: Findability section).

- [ ] **Step 1: Add the one-root bullet to `lib/email/CLAUDE.md`**

Add this bullet to the list in `lib/email/CLAUDE.md` (after the "Social platforms have ONE root" bullet, matching that bullet's format):

```markdown
- **Contact segmentation has ONE root:** `lib/email/segments/` (`filter.ts` pure engine +
  `resolve.ts` DB wrapper), persisted in `contact_segments`. This is the ONE-OFF BLAST
  lane (`ContactPickerModal` / `POST /api/deliverables/[id]/blast`) — NOT `email_audiences`
  (the tag → Resend-segment-id cache for the recurring DIGEST broadcast lane,
  `lib/email/audience-sync.ts`). Different table, different send path; don't merge them.
  Attribute/engagement conditions are `"paid-only"` in `lib/email/lab/capabilities.ts`,
  enforced server-side in every `/api/segments*` route, not just in the picker UI.
```

- [ ] **Step 2: Add the cross-reference comment to `audience-sync.ts`**

In `lib/email/audience-sync.ts`, add one line to the top-of-file doc comment (after the existing description, before the "The slug → list mapping" paragraph):

```ts
 * NOT the same thing as `contact_segments` / lib/email/segments/ (the saved-filter
 * engine for the ONE-OFF BLAST lane, ContactPickerModal). This module is the
 * recurring DIGEST broadcast lane's tag → Resend-segment-id cache — different
 * table, different send path. See lib/email/CLAUDE.md.
 *
```

- [ ] **Step 3: Run the manual live-verify and close the check**

Using a real (or sandbox) account: build a segment with a tag condition AND an engagement condition, confirm the match count in the picker and the resulting blast's actual recipient count agree (send to a test address you control, or dry-run by reading the `/api/segments/preview` response against a known fixture set of contacts/events).

Run: `node scripts/check.mjs close contact_segments_live_verify --evidence "<what you observed — match count / recipients matched>"`

- [ ] **Step 4: Append the SESSION_LOG entry (RULE 0) and commit**

Add a new top-of-file entry to `SESSION_LOG.md` describing what shipped (schema, engine, API, UI) and the closed check, following the existing entry format in that file.

```bash
git add lib/email/CLAUDE.md lib/email/audience-sync.ts SESSION_LOG.md
git commit -m "docs(email): document contact-segments as one root, close live-verify"
```

- [ ] **Step 5: Push**

Run: `node scripts/safe-push.mjs`
Expected: push succeeds; hook-enforced gates (lockfile, vocab, secrets, ingest, pack↔catalog) all pass or don't apply to this change.

---

## Plan Self-Review Notes

- **Spec coverage:** Data model (Task 1), filter DSL + engine (Task 5), API + persistence (Tasks 7–8), UI wiring (Task 9), naming disambiguation (Task 10 Steps 1–2), error handling (fail-open behavior tested in Task 6 Step 1's third case; empty-filter fallback in Task 9 Step 1's `matched` state), testing (a test file per new pure/wrapper module, plus the capabilities dial test), findability (Task 10) — every spec section has a task.
- **Type consistency check:** `Condition`/`SegmentContact`/`SegmentEventRow` (Task 5) are the single definitions reused verbatim in Tasks 6–9 — no renamed duplicates. `resolveSegment(db, userId, filter)` signature (Task 6) matches every call site in Tasks 8–9.
- **Known follow-up, not part of this plan:** the AST technically supports arbitrary nesting (`and`/`or`/`not` at any depth), but the Task 9 UI only ever emits a flat AND-of-conditions (with per-tag-condition OR/NOT). A fully nested visual builder is bigger UI scope than "operator-first, phased" calls for — if ever needed, it's additive to `uiConditionToAst`/`conditionsToFilter`, not a rewrite of the engine.
