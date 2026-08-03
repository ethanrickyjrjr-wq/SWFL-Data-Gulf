# Typed Lane for User-Brought Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 12 tasks, 29 files, 2 conflict groups, keywords: migration, schema, architecture

**Spec:** `docs/superpowers/specs/2026-08-03-user-data-typed-lane-design.md` — read it first.

**Goal:** User-brought listings and stated figures become typed, verifiable, computable inputs to deliverables, entering through one API contract per shape with a verify-first-record echo, while shapeless CSVs park visibly instead of vanishing.

**Architecture:** Mirror the proven contacts lane (pure parser → canonical upsert → RLS table) for listings; add one `ProjectItem` kind for user-stated figures; every intake door (web UI, hosted skill file, direct REST with per-user token) is a client of the same import endpoints. Verify = post-write read-back echo, never the parsed payload.

**Tech Stack:** Next.js App Router routes (`runtime = "nodejs"`), Supabase (RLS via cookie client; `Bun.SQL` idempotent migrations per `scripts/migrate-email-events.mts` pattern), zod (item schema), `bun:test`.

## Global Constraints

- Caps copied from the contacts lane verbatim: `MAX_BYTES = 5 * 1024 * 1024`, `MAX_ROWS = 5000` (route), `MAX_ATTRIBS_PER_ROW = 50`, `MAX_TAGS_PER_ROW = 50`, `MAX_TAG_LEN = 64` (parser).
- Store raw, escape at exit: NEVER sanitize cell values on import (`lib/email/csv-escape.ts` is the exit-side root — pinned 07/10/2026).
- User-scoped data lives in `public.*` with RLS by `user_id` — never in `data_lake.*`. No cadence entry, no consuming-brain requirement (user-initiated imports, not Tier-2 ingest).
- Routes: `export const runtime = "nodejs"`; errors as `NextResponse.json({ error }, { status })`; cookie client `createClient` from `@/utils/supabase/server` + `auth.getUser()` gate (81-route default).
- Verify-first-record: every import response's `echo` rows come from a SELECT AFTER the write. Partial success is normal — one bad row degrades counts, never fails the import.
- SKILL.md contract (live-verified 08/02/2026, agentskills.io/specification): frontmatter `name` required ≤64 chars lowercase/numbers/hyphens (no leading/trailing hyphen), `description` required ≤1024 chars non-empty.
- Migrations idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE POLICY` guarded), run directly, verify row/table after (RULE 1).
- Commit per task with explicit paths only — never `git add -A`. Do not push (operator approves pushes per-push).

---

### Task 1: `user_listings` + `user_api_tokens` migration

**Files:**
- Create: `scripts/migrate-user-listings.mts`

**Interfaces:**
- Produces: tables `public.user_listings` (UNIQUE `(user_id, address_key)`) and `public.user_api_tokens` (UNIQUE `token_hash`), RLS-enabled, used by Tasks 4, 6, 10.

- [ ] **Step 1: Write the migration script**

```ts
// scripts/migrate-user-listings.mts
// Idempotent: user_listings (typed lane, spec 2026-08-03) + user_api_tokens.
// Run: bun scripts/migrate-user-listings.mts
import { readFileSync } from "fs";

const secrets = readFileSync(".dlt/secrets.toml", "utf8");
const tomlStr = (key: string): string => {
  const m = secrets.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  if (!m) throw new Error(`missing ${key} in .dlt/secrets.toml`);
  return m[1];
};
const port = secrets.match(/^port\s*=\s*(\d+)/m)?.[1] ?? "5432";
const sql = new Bun.SQL(
  `postgres://${tomlStr("username")}:${encodeURIComponent(tomlStr("password"))}@${tomlStr("host")}:${port}/${tomlStr("database")}?sslmode=require`,
);

await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS public.user_listings (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address     text NOT NULL,
    address_key text NOT NULL,
    price       numeric,
    beds        integer,
    baths       numeric,
    sqft        integer,
    status      text,
    url         text,
    attribs     jsonb NOT NULL DEFAULT '{}'::jsonb,
    zip_code    text,
    county      text,
    parcel_id   text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, address_key)
  );
  ALTER TABLE public.user_listings ENABLE ROW LEVEL SECURITY;
`);

await sql.unsafe(`
  DO $$ BEGIN
    CREATE POLICY user_listings_own ON public.user_listings
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`);

await sql.unsafe(`
  CREATE TABLE IF NOT EXISTS public.user_api_tokens (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash   text NOT NULL UNIQUE,
    label        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
  );
  ALTER TABLE public.user_api_tokens ENABLE ROW LEVEL SECURITY;
`);

await sql.unsafe(`
  DO $$ BEGIN
    CREATE POLICY user_api_tokens_own ON public.user_api_tokens
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`);

const t = await sql.unsafe(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('user_listings','user_api_tokens') ORDER BY 1`);
console.log("tables now present:", JSON.stringify(t));
process.exit(0);
```

- [ ] **Step 2: Run it**

Run: `bun scripts/migrate-user-listings.mts`
Expected: `tables now present: [{"table_name":"user_api_tokens"},{"table_name":"user_listings"}]`

- [ ] **Step 3: Run it AGAIN (idempotence proof)**

Run: `bun scripts/migrate-user-listings.mts`
Expected: same output, no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-user-listings.mts
git commit -m "feat(user-data): user_listings + user_api_tokens tables (idempotent migration)"
```

---

### Task 2: Address key normalizer (pure)

**Files:**
- Create: `lib/listings-user/address-key.ts`
- Test: `lib/listings-user/address-key.test.ts`

**Interfaces:**
- Produces: `normalizeAddressKey(address: string): string` — the dedupe key for `UNIQUE(user_id, address_key)`. Used by Tasks 3, 5, 6.

- [ ] **Step 1: Write the failing test**

```ts
// lib/listings-user/address-key.test.ts
// Guard: duplicate imports (failure mode 9) — same house, different formatting, ONE key.
import { describe, expect, test } from "bun:test";
import { normalizeAddressKey } from "./address-key";

describe("normalizeAddressKey", () => {
  test("case, punctuation, and whitespace collapse to one key", () => {
    expect(normalizeAddressKey("16447 Rainbow Meadows Court, Punta Gorda, FL 33955")).toBe(
      normalizeAddressKey("16447 rainbow meadows ct   punta gorda fl 33955"),
    );
  });
  test("common suffixes abbreviate", () => {
    expect(normalizeAddressKey("12 Main Street")).toBe("12 main st");
    expect(normalizeAddressKey("12 Ocean Drive")).toBe("12 ocean dr");
    expect(normalizeAddressKey("12 Palm Avenue")).toBe("12 palm ave");
    expect(normalizeAddressKey("12 Gulf Boulevard")).toBe("12 gulf blvd");
    expect(normalizeAddressKey("12 Bay Lane")).toBe("12 bay ln");
    expect(normalizeAddressKey("12 Park Place")).toBe("12 park pl");
    expect(normalizeAddressKey("12 River Road")).toBe("12 river rd");
    expect(normalizeAddressKey("12 Isle Circle")).toBe("12 isle cir");
    expect(normalizeAddressKey("12 Sunset Terrace")).toBe("12 sunset ter");
  });
  test("empty/whitespace input returns empty string", () => {
    expect(normalizeAddressKey("   ")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings-user/address-key.test.ts`
Expected: FAIL — Cannot find module './address-key'

- [ ] **Step 3: Implement**

```ts
// lib/listings-user/address-key.ts
// Deterministic dedupe key for user-brought listings: lowercase, strip
// punctuation, collapse whitespace, abbreviate the common street suffixes.
// This is a DEDUPE key, not a canonical postal address — it only has to be
// stable across re-imports of the same row (UNIQUE(user_id, address_key)).
const SUFFIXES: Record<string, string> = {
  street: "st",
  drive: "dr",
  avenue: "ave",
  boulevard: "blvd",
  lane: "ln",
  place: "pl",
  road: "rd",
  circle: "cir",
  terrace: "ter",
  court: "ct",
  parkway: "pkwy",
  highway: "hwy",
};

export function normalizeAddressKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SUFFIXES[w] ?? w)
    .join(" ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/listings-user/address-key.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/listings-user/address-key.ts lib/listings-user/address-key.test.ts
git commit -m "feat(user-data): deterministic address dedupe key"
```

---

### Task 3: Listings CSV parser (pure)

**Files:**
- Create: `lib/listings-user/parse-listings-csv.ts`
- Test: `lib/listings-user/parse-listings-csv.test.ts`

**Interfaces:**
- Consumes: `normalizeAddressKey` (Task 2). Tokenizer: same single-pass quote-state contract as `lib/email/parse-contacts-csv.ts` — implemented locally below (its tokenizer is module-private; do NOT reach into it).
- Produces:
  `interface UserListingRow { address: string; address_key: string; price: number | null; beds: number | null; baths: number | null; sqft: number | null; status: string | null; url: string | null; attribs: Record<string, string>; }`
  `parseListingsCsv(csv: string): { rows: UserListingRow[]; skippedCount: number; skipReasons: string[] }`
  Used by Tasks 5, 6.

- [ ] **Step 1: Write the failing test**

```ts
// lib/listings-user/parse-listings-csv.test.ts
// Guards: failure mode 1 (caps), 10 (row-grain failure: bad rows degrade counts,
// good rows land), and lenient number parsing ($ and commas are user reality).
import { describe, expect, test } from "bun:test";
import { parseListingsCsv } from "./parse-listings-csv";

describe("parseListingsCsv", () => {
  test("happy row: typed fields parsed, unknown headers land in attribs", () => {
    const csv = [
      "Address,Price,Beds,Baths,SqFt,Status,URL,My Notes",
      '"12 Main Street, Fort Myers, FL 33901","$450,000",3,2.5,"1,978",Active,https://x.com/l/1,pool home',
    ].join("\n");
    const { rows, skippedCount } = parseListingsCsv(csv);
    expect(skippedCount).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("12 Main Street, Fort Myers, FL 33901");
    expect(rows[0].address_key).toBe("12 main st fort myers fl 33901");
    expect(rows[0].price).toBe(450000);
    expect(rows[0].beds).toBe(3);
    expect(rows[0].baths).toBe(2.5);
    expect(rows[0].sqft).toBe(1978);
    expect(rows[0].status).toBe("Active");
    expect(rows[0].url).toBe("https://x.com/l/1");
    expect(rows[0].attribs).toEqual({ "my notes": "pool home" });
  });
  test("row without an address is skipped WITH a reason; good rows still land", () => {
    const csv = ["address,price", ",100000", '"5 Palm Ave",200000'].join("\n");
    const { rows, skippedCount, skipReasons } = parseListingsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(skippedCount).toBe(1);
    expect(skipReasons.join(" ")).toContain("address");
  });
  test("header aliases: street address / list price / square feet / link", () => {
    const csv = ["Street Address,List Price,Square Feet,Link", '"7 Bay Ln",300000,1200,https://y.com'].join("\n");
    const { rows } = parseListingsCsv(csv);
    expect(rows[0].address).toBe("7 Bay Ln");
    expect(rows[0].price).toBe(300000);
    expect(rows[0].sqft).toBe(1200);
    expect(rows[0].url).toBe("https://y.com");
  });
  test("no address column at all → zero rows, reason says so", () => {
    const { rows, skipReasons } = parseListingsCsv("price,beds\n100,2");
    expect(rows).toHaveLength(0);
    expect(skipReasons.join(" ")).toContain("no address column");
  });
  test("unparseable number degrades to null, row still lands (row-grain, never throws)", () => {
    const { rows } = parseListingsCsv('address,price\n"9 Isle Cir",call for price');
    expect(rows[0].price).toBeNull();
    expect(rows[0].address).toBe("9 Isle Cir");
  });
  test("attribs capped at 50 unknown columns", () => {
    const extras = Array.from({ length: 60 }, (_, i) => `x${i}`);
    const header = ["address", ...extras].join(",");
    const row = ['"1 A St"', ...extras.map((_, i) => `v${i}`)].join(",");
    const { rows } = parseListingsCsv(`${header}\n${row}`);
    expect(Object.keys(rows[0].attribs).length).toBeLessThanOrEqual(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings-user/parse-listings-csv.test.ts`
Expected: FAIL — Cannot find module './parse-listings-csv'

- [ ] **Step 3: Implement**

```ts
// lib/listings-user/parse-listings-csv.ts
// Pure CSV → user-listing rows. Mirrors lib/email/parse-contacts-csv.ts:
// header row required, `address` required per row (aliases below), typed
// columns parsed leniently (null on failure — a bad cell never drops the
// row, a missing address does), every other header → attribs (capped).
// Values stored RAW (escape at exit only — csv-escape.ts policy).
import { normalizeAddressKey } from "./address-key";

export interface UserListingRow {
  address: string;
  address_key: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  status: string | null;
  url: string | null;
  attribs: Record<string, string>;
}

export interface ListingsParseResult {
  rows: UserListingRow[];
  skippedCount: number;
  skipReasons: string[];
}

const MAX_ATTRIBS_PER_ROW = 50;

const ADDRESS_ALIASES = ["address", "street address", "full address", "property address"];
const PRICE_ALIASES = ["price", "list price", "asking price"];
const BEDS_ALIASES = ["beds", "bedrooms", "br"];
const BATHS_ALIASES = ["baths", "bathrooms", "ba"];
const SQFT_ALIASES = ["sqft", "square feet", "living area", "sq ft"];
const STATUS_ALIASES = ["status", "listing status"];
const URL_ALIASES = ["url", "link", "listing url"];

/** Single-pass RFC-4180 tokenizer — same contract as parse-contacts-csv.ts
 *  (quote state carried across newlines, `""` → literal `"`). */
function tokenizeCsv(text: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let started = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { current += '"'; i++; continue; }
        inQuotes = false;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; started = true; continue; }
    if (ch === ",") { fields.push(current.trim()); current = ""; started = true; continue; }
    if (ch === "\n") {
      fields.push(current.trim());
      records.push(fields);
      fields = []; current = ""; started = false;
      continue;
    }
    current += ch;
    started = true;
  }
  if (started || current !== "" || fields.length > 0) {
    fields.push(current.trim());
    records.push(fields);
  }
  return records;
}

function isBlank(record: string[]): boolean {
  return record.length === 1 && record[0] === "";
}

/** "$450,000" → 450000 · "2.5" → 2.5 · "call for price" → null. Never throws. */
function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function findCol(headers: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = headers.indexOf(a);
    if (i !== -1) return i;
  }
  return -1;
}

export function parseListingsCsv(csv: string): ListingsParseResult {
  const deBommed = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const records = tokenizeCsv(deBommed.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));

  let headerIndex = -1;
  for (let i = 0; i < records.length; i++) {
    if (!isBlank(records[i])) { headerIndex = i; break; }
  }
  if (headerIndex === -1) return { rows: [], skippedCount: 0, skipReasons: [] };

  const headers = records[headerIndex].map((h) => h.toLowerCase());
  const col = {
    address: findCol(headers, ADDRESS_ALIASES),
    price: findCol(headers, PRICE_ALIASES),
    beds: findCol(headers, BEDS_ALIASES),
    baths: findCol(headers, BATHS_ALIASES),
    sqft: findCol(headers, SQFT_ALIASES),
    status: findCol(headers, STATUS_ALIASES),
    url: findCol(headers, URL_ALIASES),
  };
  if (col.address === -1) {
    return { rows: [], skippedCount: 0, skipReasons: ["no address column found"] };
  }

  const typedCols = new Set(Object.values(col).filter((i) => i !== -1));
  const attribCols = headers
    .map((h, idx) => ({ h, idx }))
    .filter(({ h, idx }) => h && !typedCols.has(idx))
    .slice(0, MAX_ATTRIBS_PER_ROW);

  const rows: UserListingRow[] = [];
  let skippedCount = 0;
  const skipReasons: string[] = [];

  for (let i = headerIndex + 1; i < records.length; i++) {
    const fields = records[i];
    if (isBlank(fields)) continue;
    const address = (fields[col.address] ?? "").trim();
    if (!address) {
      skippedCount++;
      continue;
    }
    const pick = (c: number) => (c !== -1 ? (fields[c] ?? "").trim() : "");
    const attribs: Record<string, string> = {};
    for (const { h, idx } of attribCols) {
      const v = (fields[idx] ?? "").trim();
      if (v) attribs[h] = v;
    }
    rows.push({
      address,
      address_key: normalizeAddressKey(address),
      price: toNumber(pick(col.price)),
      beds: toNumber(pick(col.beds)),
      baths: toNumber(pick(col.baths)),
      sqft: toNumber(pick(col.sqft)),
      status: pick(col.status) || null,
      url: pick(col.url) || null,
      attribs,
    });
  }
  if (skippedCount > 0) skipReasons.push(`${skippedCount} row(s) had no address`);
  return { rows, skippedCount, skipReasons };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/listings-user/parse-listings-csv.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/listings-user/parse-listings-csv.ts lib/listings-user/parse-listings-csv.test.ts
git commit -m "feat(user-data): listings CSV parser — row-grain failure, lenient numbers, capped attribs"
```

---

### Task 4: County join mapper (pure, crosswalk-backed)

**Files:**
- Create: `lib/listings-user/join-county.ts`
- Test: `lib/listings-user/join-county.test.ts`
- Read first (reference data): `fixtures/swfl-zip-county.json` — VERIFY its actual shape by opening the file before implementing; the code below assumes `Record<zip, county>` — adapt the lookup if the real shape differs and note it in the commit body.

**Interfaces:**
- Consumes: `UserListingRow` (Task 3).
- Produces: `joinCounty(row: UserListingRow): { zip_code: string | null; county: string | null }` — ZIP extracted from the listing's own site address text (ZIP gate G1-compliant), county via crosswalk. `parcel_id` stays null in v1: the deep lake join runs at BUILD time via the existing `lib/listings/resolve-subject.ts`; never duplicate it inside a 5,000-row import loop. Used by Task 5.

- [ ] **Step 1: Write the failing test**

```ts
// lib/listings-user/join-county.test.ts
// Guard: failure mode 4 — bad address never blocks the row; miss is a null, counted upstream.
import { describe, expect, test } from "bun:test";
import { joinCounty } from "./join-county";
import { normalizeAddressKey } from "./address-key";

const row = (address: string) => ({
  address,
  address_key: normalizeAddressKey(address),
  price: null, beds: null, baths: null, sqft: null, status: null, url: null,
  attribs: {},
});

describe("joinCounty", () => {
  test("SWFL zip in the address resolves county from the crosswalk", () => {
    const j = joinCounty(row("12 Main St, Fort Myers, FL 33901"));
    expect(j.zip_code).toBe("33901");
    expect(j.county).toBe("Lee");
  });
  test("address with no zip → both null, no throw", () => {
    expect(joinCounty(row("12 Main St, Fort Myers"))).toEqual({ zip_code: null, county: null });
  });
  test("non-SWFL zip → zip captured, county null (honest miss)", () => {
    const j = joinCounty(row("1 Broadway, New York, NY 10004"));
    expect(j.zip_code).toBe("10004");
    expect(j.county).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings-user/join-county.test.ts`
Expected: FAIL — Cannot find module './join-county'

- [ ] **Step 3: Implement**

```ts
// lib/listings-user/join-county.ts
// Import-time lake join, v1: ZIP from the listing's own site address text
// (ZIP gate G1 — site address only, never a mailing-address column), county
// via the fixtures/swfl-zip-county.json crosswalk. Free, deterministic, no
// vendor calls in the import loop (rule 11).
import crosswalk from "@/fixtures/swfl-zip-county.json";
import type { UserListingRow } from "./parse-listings-csv";

const ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/g;

export function joinCounty(row: UserListingRow): {
  zip_code: string | null;
  county: string | null;
} {
  const matches = [...row.address.matchAll(ZIP_RE)].map((m) => m[1]);
  const zip = matches.length > 0 ? matches[matches.length - 1] : null;
  if (!zip) return { zip_code: null, county: null };
  const county = (crosswalk as Record<string, string>)[zip] ?? null;
  return { zip_code: zip, county };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/listings-user/join-county.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/listings-user/join-county.ts lib/listings-user/join-county.test.ts
git commit -m "feat(user-data): import-time zip/county join from site address via crosswalk"
```

---

### Task 5: Listings upsert (canonical write path)

**Files:**
- Create: `lib/listings-user/upsert.ts`
- Test: `lib/listings-user/upsert.test.ts`

**Interfaces:**
- Consumes: `UserListingRow` (Task 3), `joinCounty` (Task 4).
- Produces: `upsertUserListings(supabase: SupabaseClient<Database>, userId: string, rows: UserListingRow[]): Promise<{ added: number; matchedToCounty: number; error: string | null }>` — batches of 100, in-batch dedupe on `address_key` (later non-null wins per field), `onConflict: "user_id,address_key"`. Used by Task 6.
- NOTE: `user_listings` won't be in `database.types.ts` until types regenerate. Regenerate via the repo's existing Supabase type-gen path in this task and commit `database.types.ts`; do NOT cast to `any`.

- [ ] **Step 1: Write the failing test** (the `fakeDb` capture pattern is copied from `lib/contacts/upsert.test.ts`, table name changed)

```ts
// lib/listings-user/upsert.test.ts
// Guards: failure mode 9 (duplicate imports → idempotent key), Postgres
// "cannot affect row a second time" (in-batch dedupe), batching at 100.
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import { upsertUserListings } from "./upsert";
import type { UserListingRow } from "./parse-listings-csv";

type Batch = Record<string, unknown>[];
type Call = { batch: Batch; opts: unknown };

function fakeDb(
  handler: (batch: Batch, opts: unknown) => Promise<{ data: unknown; error: unknown }>,
) {
  const calls: Call[] = [];
  const client = {
    from: (table: string) => {
      if (table !== "user_listings") throw new Error(`unexpected table: ${table}`);
      return {
        upsert: async (batch: Batch, opts: unknown) => {
          calls.push({ batch, opts });
          return handler(batch, opts);
        },
      };
    },
  };
  return { db: client as unknown as SupabaseClient<Database>, calls };
}

const ok = async () => ({ data: null, error: null });

function row(address: string, key: string, overrides: Partial<UserListingRow> = {}): UserListingRow {
  return {
    address, address_key: key,
    price: null, beds: null, baths: null, sqft: null, status: null, url: null,
    attribs: {}, ...overrides,
  };
}

describe("upsertUserListings", () => {
  test("batches at 100 and stamps user_id + joined county on every row", async () => {
    const { db, calls } = fakeDb(ok);
    const rows = Array.from({ length: 150 }, (_, i) =>
      row(`${i} Main St, Fort Myers, FL 33901`, `${i} main st fort myers fl 33901`),
    );
    const result = await upsertUserListings(db, "user-1", rows);
    expect(calls).toHaveLength(2);
    expect(calls[0].batch).toHaveLength(100);
    expect(calls[0].batch[0]).toMatchObject({ user_id: "user-1", zip_code: "33901", county: "Lee" });
    expect(calls[0].opts).toEqual({ onConflict: "user_id,address_key" });
    expect(result.added).toBe(150);
    expect(result.matchedToCounty).toBe(150);
  });
  test("same address_key twice in one file collapses to one payload row (later non-null wins)", async () => {
    const { db, calls } = fakeDb(ok);
    const rows = [
      row("5 Palm Ave 33901", "5 palm ave 33901", { price: 100000 }),
      row("5 Palm Ave 33901", "5 palm ave 33901", { beds: 3 }),
    ];
    const result = await upsertUserListings(db, "u", rows);
    expect(calls[0].batch).toHaveLength(1);
    expect(calls[0].batch[0]).toMatchObject({ price: 100000, beds: 3 });
    expect(result.added).toBe(1);
  });
  test("db error stops and reports; added reflects only landed batches", async () => {
    const { db } = fakeDb(async () => ({ data: null, error: { message: "boom" } }));
    const result = await upsertUserListings(db, "u", [row("1 A St", "1 a st")]);
    expect(result.error).toBe("boom");
    expect(result.added).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings-user/upsert.test.ts`
Expected: FAIL — Cannot find module './upsert'

- [ ] **Step 3: Implement**

```ts
// lib/listings-user/upsert.ts
// THE canonical write path into public.user_listings — mirrors
// lib/contacts/upsert.ts (batching, in-batch dedupe before a single
// .upsert() call so Postgres never sees the same (user_id, address_key)
// twice in one statement). County join happens here so every door (route,
// REST, skill) gets it without remembering to call it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import type { UserListingRow } from "./parse-listings-csv";
import { joinCounty } from "./join-county";

const BATCH_SIZE = 100;

function dedupeSameKey(rows: UserListingRow[]): UserListingRow[] {
  const order: string[] = [];
  const byKey = new Map<string, UserListingRow>();
  for (const r of rows) {
    const prev = byKey.get(r.address_key);
    if (!prev) {
      order.push(r.address_key);
      byKey.set(r.address_key, { ...r, attribs: { ...r.attribs } });
      continue;
    }
    byKey.set(r.address_key, {
      address: r.address || prev.address,
      address_key: r.address_key,
      price: r.price ?? prev.price,
      beds: r.beds ?? prev.beds,
      baths: r.baths ?? prev.baths,
      sqft: r.sqft ?? prev.sqft,
      status: r.status ?? prev.status,
      url: r.url ?? prev.url,
      attribs: { ...prev.attribs, ...r.attribs },
    });
  }
  return order.map((k) => byKey.get(k)!);
}

export async function upsertUserListings(
  supabase: SupabaseClient<Database>,
  userId: string,
  rows: UserListingRow[],
): Promise<{ added: number; matchedToCounty: number; error: string | null }> {
  let added = 0;
  let matchedToCounty = 0;
  const deduped = dedupeSameKey(rows);

  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE).map((r) => {
      const joined = joinCounty(r);
      if (joined.county) matchedToCounty++;
      return {
        user_id: userId,
        address: r.address,
        address_key: r.address_key,
        price: r.price,
        beds: r.beds,
        baths: r.baths,
        sqft: r.sqft,
        status: r.status,
        url: r.url,
        attribs: r.attribs,
        zip_code: joined.zip_code,
        county: joined.county,
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await supabase
      .from("user_listings")
      .upsert(batch, { onConflict: "user_id,address_key" });
    if (error) return { added, matchedToCounty, error: error.message };
    added += batch.length;
  }
  return { added, matchedToCounty, error: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/listings-user/upsert.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/listings-user/upsert.ts lib/listings-user/upsert.test.ts database.types.ts
git commit -m "feat(user-data): canonical user_listings upsert — in-batch dedupe, county join, batch 100"
```

---

### Task 6: Import route with verify-first-record echo

**Files:**
- 🔴 Create: `app/api/listings/import/route.ts`
- Test: `app/api/listings/import/route.test.ts`

**Interfaces:**
- Consumes: `parseListingsCsv` (Task 3), `upsertUserListings` (Task 5). (Cookie-auth only in this task; Task 9 adds the Bearer branch.)
- Produces: `POST /api/listings/import` (multipart `file`) → 200 JSON
  `{ total: number; added: number; skipped: number; skip_reasons: string[]; matched_to_county: number; echo: Array<{ address: string; price: number | null; beds: number | null; county: string | null }> }`
  where `echo` is ≤3 rows SELECTed back AFTER the write. Used by the web UI, the skill file (Task 10), and REST callers.
- Deliberate spec simplification, stated: the spec mentions "a status endpoint the skill loop can poll" — at our 5,000-row cap imports are synchronous, so the import RESPONSE is the status; no separate poll endpoint (YAGNI, rule 11). The skill file (Task 10) reflects this.

- [ ] **Step 1: Write the failing test** (mock modules with `mock.module` — the repo's established mock-at-the-data-boundary pattern)

```ts
// app/api/listings/import/route.test.ts
// Guards: failure mode 7 (echo is a post-write read-back — the fake SELECT
// returns a MARKER row and the response must carry the marker, proving the
// echo did not come from the parsed payload), 1 (caps), 5 (401 without auth).
import { describe, expect, test, mock } from "bun:test";

let fakeUser: { id: string } | null = { id: "user-1" };

mock.module("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: fakeUser } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            limit: async () => ({
              data: [{ address: "READBACK MARKER", price: 1, beds: 1, county: "Lee" }],
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));
mock.module("next/headers", () => ({ cookies: async () => ({}) }));
mock.module("@/lib/listings-user/upsert", () => ({
  upsertUserListings: async () => ({ added: 1, matchedToCounty: 1, error: null }),
}));

const { POST } = await import("./route");

function csvRequest(csv: string): Request {
  const fd = new FormData();
  fd.set("file", new File([csv], "listings.csv", { type: "text/csv" }));
  return new Request("http://localhost/api/listings/import", { method: "POST", body: fd });
}

describe("POST /api/listings/import", () => {
  test("401 when unauthenticated", async () => {
    fakeUser = null;
    const res = await POST(csvRequest("address\n1 A St") as never);
    expect(res.status).toBe(401);
    fakeUser = { id: "user-1" };
  });
  test("happy path: parses, upserts, and echoes ROWS READ BACK (marker proves read-back)", async () => {
    const res = await POST(csvRequest('address,price\n"1 A St, Fort Myers, FL 33901",100000') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toBe(1);
    expect(body.matched_to_county).toBe(1);
    expect(body.echo[0].address).toBe("READBACK MARKER");
  });
  test("413 over 5000 rows", async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => `"${i} A St"`).join("\n");
    const res = await POST(csvRequest(`address\n${rows}`) as never);
    expect(res.status).toBe(413);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test app/api/listings/import/route.test.ts`
Expected: FAIL — Cannot find module './route'

- [ ] **Step 3: Implement**

```ts
// app/api/listings/import/route.ts
// POST — bulk import user listings from CSV. Mirrors app/api/contacts/import.
// Verify-first-record: the `echo` rows are SELECTed back after the write —
// "connected" means a row round-tripped, never "a file parsed" (spec §3).
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { parseListingsCsv } from "@/lib/listings-user/parse-listings-csv";
import { upsertUserListings } from "@/lib/listings-user/upsert";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — same cap as contacts
const MAX_ROWS = 5000;
const ECHO_LIMIT = 3;

export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 5 MB)" }, { status: 413 });
  }

  const { rows, skippedCount, skipReasons } = parseListingsCsv(await file.text());
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `too many rows (max ${MAX_ROWS})` }, { status: 413 });
  }
  if (rows.length === 0) {
    return NextResponse.json({
      total: 0, added: 0, skipped: skippedCount, skip_reasons: skipReasons,
      matched_to_county: 0, echo: [],
    });
  }

  const { added, matchedToCounty, error } = await upsertUserListings(supabase, user.id, rows);
  if (error) {
    return NextResponse.json({ error: "import failed", detail: error }, { status: 500 });
  }

  // Verify-first-record: read back what actually landed (never echo the payload).
  const keys = rows.slice(0, ECHO_LIMIT).map((r) => r.address_key);
  const { data: echoRows } = await supabase
    .from("user_listings")
    .select("address, price, beds, county")
    .eq("user_id", user.id)
    .in("address_key", keys)
    .limit(ECHO_LIMIT);

  return NextResponse.json({
    total: rows.length,
    added,
    skipped: skippedCount,
    skip_reasons: skipReasons,
    matched_to_county: matchedToCounty,
    echo: echoRows ?? [],
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test app/api/listings/import/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/listings/import/route.ts app/api/listings/import/route.test.ts
git commit -m "feat(user-data): listings import route with post-write read-back echo"
```

---

### Task 7: `user_figure` item kind

**Files:**
- 🟡 Modify: `lib/project/items.ts` (add one member to the `kinds` discriminated union, after the `frame` member at line 113–126)
- Test: `lib/project/__tests__/items.test.ts` (append cases)

**Interfaces:**
- Produces: `{ kind: "user_figure"; label: string; value: string; unit?: string; as_of?: string; stated_by: "user" }` on `ProjectItem`. Used by Task 8.

- [ ] **Step 1: Write the failing test** (append to the existing suite, matching its import style)

```ts
// append to lib/project/__tests__/items.test.ts
// Guard: failure mode 3 — a figure without label+value cannot enter the spine.
describe("user_figure kind", () => {
  const base = { id: "i1", added_at: "2026-08-03T00:00:00Z", origin: "web" as const };
  test("valid figure parses", () => {
    const parsed = projectItemSchema.parse({
      ...base,
      kind: "user_figure",
      label: "My average days to close",
      value: "21",
      unit: "days",
      as_of: "08/03/2026",
      stated_by: "user",
    });
    expect(parsed.kind).toBe("user_figure");
  });
  test("figure without value is rejected", () => {
    expect(() =>
      projectItemSchema.parse({ ...base, kind: "user_figure", label: "x", stated_by: "user" }),
    ).toThrow();
  });
  test("empty label is rejected", () => {
    expect(() =>
      projectItemSchema.parse({ ...base, kind: "user_figure", label: "", value: "21", stated_by: "user" }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/project/__tests__/items.test.ts`
Expected: FAIL — invalid discriminator value

- [ ] **Step 3: Implement** — add to the `kinds` union in `lib/project/items.ts`:

```ts
  z.object({
    // A figure the USER stated (four-lane sourcing lane 4). NOT lake data:
    // no freshness_token, no report_id. It renders ONLY with its "as stated
    // by you" provenance (spec 2026-08-03 §5); the build-side no-invention
    // lint remains the output enforcement point.
    kind: z.literal("user_figure"),
    label: z.string().min(1),
    /** The value exactly as the user stated it — string, never re-typed. */
    value: z.string().min(1),
    unit: z.string().optional(),
    /** MM/DD/YYYY, per the as-of convention. */
    as_of: z.string().optional(),
    stated_by: z.literal("user"),
  }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/project/__tests__/items.test.ts`
Expected: PASS (existing suite + 3 new)

- [ ] **Step 5: Commit**

```bash
git add lib/project/items.ts lib/project/__tests__/items.test.ts
git commit -m "feat(user-data): user_figure item kind — user-stated value with mandatory provenance"
```

---

### Task 8: User-data build feed (origin travels with the binding)

**Files:**
- Create: `lib/project/user-data-feed.ts`
- Test: `lib/project/user-data-feed.test.ts`
- Modify: `app/api/email-lab/social/generate/route.ts:37` — alongside the existing `loadProjectUploadsText(projectId)` call, also load `loadUserDataText(projectId)` and pass `[filesText, userDataText].filter(Boolean).join("\n\n") || undefined` where `filesText` was passed. Find any OTHER `loadProjectUploadsText` call sites via `Grep loadProjectUploadsText` and wire identically.

**Interfaces:**
- Consumes: `ProjectItem` union incl. `user_figure` (Task 7); `public.user_listings` (Task 1).
- Produces: `loadUserDataText(projectId: string): Promise<string>` — fail-open (`""`), RLS-scoped, mirrors `lib/project/uploads-text.ts`. Pure TDD unit: `formatUserData(items: ProjectItem[], listings: UserListingFeedRow[]): string` with `interface UserListingFeedRow { address: string; price: number | null; beds: number | null; baths: number | null; sqft: number | null; status: string | null; county: string | null; updated_at: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/project/user-data-feed.test.ts
// Guard: spec §5 — provenance travels with the binding. Every emitted block
// names its origin; a figure NEVER renders without "stated by the user".
import { describe, expect, test } from "bun:test";
import { formatUserData } from "./user-data-feed";
import type { ProjectItem } from "./items";

const figure: ProjectItem = {
  id: "f1", added_at: "2026-08-03T00:00:00Z", origin: "web",
  kind: "user_figure", label: "Avg days to close", value: "21", unit: "days",
  as_of: "08/03/2026", stated_by: "user",
};

describe("formatUserData", () => {
  test("figure block carries label, value, unit, and stated-by provenance", () => {
    const out = formatUserData([figure], []);
    expect(out).toContain("Avg days to close");
    expect(out).toContain("21 days");
    expect(out).toContain("stated by the user");
    expect(out).toContain("as of 08/03/2026");
  });
  test("listing block names its origin (user-brought) and import date", () => {
    const out = formatUserData([], [{
      address: "1 A St, Fort Myers, FL 33901", price: 450000, beds: 3, baths: 2.5,
      sqft: 1978, status: "Active", county: "Lee", updated_at: "2026-08-03T12:00:00Z",
    }]);
    expect(out).toContain("1 A St");
    expect(out).toContain("450000");
    expect(out).toContain("brought by the user");
  });
  test("empty inputs → empty string", () => {
    expect(formatUserData([], [])).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/project/user-data-feed.test.ts`
Expected: FAIL — Cannot find module './user-data-feed'

- [ ] **Step 3: Implement**

```ts
// lib/project/user-data-feed.ts
// Server loader + pure formatter for the TYPED user-data lane, the sibling
// of uploads-text.ts (the blob lane). Every block names its ORIGIN — a
// user-stated figure or user-brought listing is quotable ONLY with its
// provenance attached (spec 2026-08-03 §5). Fail-open: any miss → "".
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { ProjectItem } from "@/lib/project/items";

export interface UserListingFeedRow {
  address: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  status: string | null;
  county: string | null;
  updated_at: string;
}

export function formatUserData(
  items: ProjectItem[],
  listings: UserListingFeedRow[],
): string {
  const parts: string[] = [];
  for (const it of items) {
    if (it.kind !== "user_figure") continue;
    const unit = it.unit ? ` ${it.unit}` : "";
    const asOf = it.as_of ? `, as of ${it.as_of}` : "";
    parts.push(
      `USER FIGURE (stated by the user${asOf}): ${it.label} = ${it.value}${unit}`,
    );
  }
  for (const l of listings) {
    const fields = [
      l.price != null ? `price ${l.price}` : null,
      l.beds != null ? `${l.beds} beds` : null,
      l.baths != null ? `${l.baths} baths` : null,
      l.sqft != null ? `${l.sqft} sqft` : null,
      l.status ? `status ${l.status}` : null,
      l.county ? `county ${l.county}` : null,
    ].filter(Boolean).join(", ");
    parts.push(
      `USER LISTING (brought by the user, imported ${l.updated_at.slice(0, 10)}): ${l.address}${fields ? ` — ${fields}` : ""}`,
    );
  }
  return parts.join("\n\n");
}

export async function loadUserDataText(projectId: string): Promise<string> {
  if (!projectId) return "";
  try {
    const supabase = createClient(await cookies());
    const { data: proj } = await supabase
      .from("projects")
      .select("items")
      .eq("id", projectId)
      .maybeSingle();
    const items = (proj?.items ?? []) as ProjectItem[];
    const { data: listings } = await supabase
      .from("user_listings")
      .select("address, price, beds, baths, sqft, status, county, updated_at")
      .limit(50);
    return formatUserData(items, (listings ?? []) as UserListingFeedRow[]);
  } catch {
    return "";
  }
}
```

- [ ] **Step 4: Run test, wire the call sites, build**

Run: `bun test lib/project/user-data-feed.test.ts` → PASS (3 tests).
Wire `app/api/email-lab/social/generate/route.ts` (and any other `loadProjectUploadsText` call site found by Grep) per the Files block. Run `bunx next build` → completes without type errors (the repo's verification norm — never bare `npx tsc`).

- [ ] **Step 5: Commit**

```bash
git add lib/project/user-data-feed.ts lib/project/user-data-feed.test.ts app/api/email-lab/social/generate/route.ts
git commit -m "feat(user-data): typed user-data build feed — origin travels with every block"
```

---

### Task 9: Per-user API token (the REST/skill door)

**Files:**
- Create: `lib/api-tokens/token.ts`
- Create: `app/api/tokens/route.ts`
- Test: `lib/api-tokens/token.test.ts`
- 🔴 Modify: `app/api/listings/import/route.ts` (Bearer branch), `app/api/contacts/import/route.ts` (same branch)

**Interfaces:**
- Produces: `hashToken(raw: string): string` (sha256 hex); `mintToken(): string` (`sdg_` + 64 hex chars); `resolveTokenUser(admin: SupabaseClient<Database>, authHeader: string | null): Promise<string | null>`. Routes: cookie user first, else token user via `createServiceRoleClient` — service role bypasses RLS, so EVERY query in the token branch carries explicit `.eq("user_id", userId)` scoping (the cross-user guard, per `app/api/CLAUDE.md`).
- NOT in this task: token-management UI (mint route below returns the raw token once; revocation = delete the row, UI later).

- [ ] **Step 1: Write the failing test**

```ts
// lib/api-tokens/token.test.ts
// Guards: failure mode 6 (token abuse → hashed at rest, prefix-checked) and
// 5 (cross-user: resolveTokenUser returns the token's OWN user, never a default).
import { describe, expect, test } from "bun:test";
import { hashToken, mintToken, resolveTokenUser } from "./token";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

function fakeAdmin(rows: Array<{ token_hash: string; user_id: string }>) {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, hash: string) => ({
          maybeSingle: async () => ({
            data: rows.find((r) => r.token_hash === hash) ?? null,
            error: null,
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("api tokens", () => {
  test("mintToken → sdg_ prefix + 64 hex chars; hash is stable sha256 hex", () => {
    const t = mintToken();
    expect(t).toMatch(/^sdg_[0-9a-f]{64}$/);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
  });
  test("resolveTokenUser finds the row by hash and returns its user_id", async () => {
    const t = mintToken();
    const admin = fakeAdmin([{ token_hash: hashToken(t), user_id: "user-9" }]);
    expect(await resolveTokenUser(admin, `Bearer ${t}`)).toBe("user-9");
  });
  test("wrong token, wrong prefix, or missing header → null", async () => {
    const admin = fakeAdmin([]);
    expect(await resolveTokenUser(admin, "Bearer sdg_" + "0".repeat(64))).toBeNull();
    expect(await resolveTokenUser(admin, "Bearer not-our-prefix")).toBeNull();
    expect(await resolveTokenUser(admin, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/api-tokens/token.test.ts`
Expected: FAIL — Cannot find module './token'

- [ ] **Step 3: Implement**

```ts
// lib/api-tokens/token.ts
// Per-user API tokens for the REST/skill intake door. Raw token shown ONCE
// at mint; only the sha256 hash is stored (user_api_tokens.token_hash).
// The MCP bearer (app/api/mcp/auth.ts) is a SINGLE shared env token — this
// is deliberately separate and per-user.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

const PREFIX = "sdg_";

export function mintToken(): string {
  return PREFIX + randomBytes(32).toString("hex");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** `Authorization: Bearer sdg_…` → the owning user_id, or null. */
export async function resolveTokenUser(
  admin: SupabaseClient<Database>,
  authHeader: string | null,
): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const raw = authHeader.slice("Bearer ".length);
  if (!raw.startsWith(PREFIX)) return null;
  const { data } = await admin
    .from("user_api_tokens")
    .select("token_hash, user_id")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  if (!data) return null;
  await admin
    .from("user_api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", data.token_hash);
  return data.user_id;
}
```

Mint route:

```ts
// app/api/tokens/route.ts
// POST — mint a per-user API token for the REST/skill intake door.
// The raw token is returned ONCE and never stored; only its hash lands.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { mintToken, hashToken } from "@/lib/api-tokens/token";

export const runtime = "nodejs";

export async function POST() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = mintToken();
  const { error } = await supabase
    .from("user_api_tokens")
    .insert({ user_id: user.id, token_hash: hashToken(raw), label: "data-connect" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token: raw, note: "shown once — store it now" });
}
```

Bearer branch in BOTH import routes (listings + contacts) — replace the plain 401 block:

```ts
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { resolveTokenUser } from "@/lib/api-tokens/token";

// inside POST, replacing `if (!user) return 401`:
let userId = user?.id ?? null;
let db = supabase;
if (!userId) {
  const admin = createServiceRoleClient();
  const tokenUser = await resolveTokenUser(admin, req.headers.get("authorization"));
  if (!tokenUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  userId = tokenUser;
  db = admin; // bypasses RLS — every query below MUST carry .eq("user_id", userId)
}
// then use `db` and `userId` everywhere `supabase` and `user.id` were used
```

(The listings read-back SELECT already filters `.eq("user_id", …)` — keep it. `upsertCanonicalContacts(db, userId, rows)` and `upsertUserListings(db, userId, rows)` stamp `user_id` on every row.)

While editing the contacts route, ALSO give it the verify-first-record echo the spec grants contacts (spec §1 "gets only the verify upgrade") — after the upsert succeeds, read back and include in the response:

```ts
// after result.added = added; in app/api/contacts/import/route.ts:
const echoEmails = rows.slice(0, 3).map((r) => r.email);
const { data: echoRows } = await db
  .from("contacts")
  .select("email, name, tags")
  .eq("user_id", userId)
  .in("email", echoEmails)
  .limit(3);
return NextResponse.json({ ...result, echo: echoRows ?? [] });
```

Extend `app/api/listings/import/route.test.ts`'s mock pattern into a sibling `app/api/contacts/import/route.test.ts` asserting the contacts echo carries the read-back marker (same fake-SELECT marker technique) — the contacts route previously had no test file; this adds one.

- [ ] **Step 4: Run tests + build**

Run: `bun test lib/api-tokens/token.test.ts app/api/listings/import/route.test.ts` → PASS.
Run: `bunx next build` → completes.

- [ ] **Step 5: Commit**

```bash
git add lib/api-tokens/token.ts lib/api-tokens/token.test.ts app/api/tokens/route.ts app/api/listings/import/route.ts app/api/contacts/import/route.ts
git commit -m "feat(user-data): per-user API tokens — hashed at rest, Bearer door on both import routes"
```

---

### Task 10: Hosted skill file (agentskills.io-compliant)

**Files:**
- Create: `lib/connect/skill-content.ts`
- Create: `app/api/connect/skill/route.ts` (GET, public, `text/markdown`)
- Test: `lib/connect/skill-content.test.ts`

**Interfaces:**
- Consumes: endpoint contracts from Tasks 6 and 9 (documented in the body).
- Produces: `GET /api/connect/skill` serving `SKILL_MD: string`. Format per the live spec (08/02/2026, filed `_RESEARCH/competitor-and-strategy/2026-08-02-agent-skills-spec-for-intake.md`).

- [ ] **Step 1: Write the failing test**

```ts
// lib/connect/skill-content.test.ts
// Guard: failure mode 11 is solved by serving from OUR deploy; THIS test
// guards the format contract (frontmatter constraints are the spec's hard
// requirements) and that the endpoints it documents are the real ones.
import { describe, expect, test } from "bun:test";
import { SKILL_MD } from "./skill-content";

describe("SKILL_MD (agentskills.io contract)", () => {
  const fm = /^---\n([\s\S]*?)\n---/.exec(SKILL_MD)?.[1] ?? "";
  test("frontmatter name: required, ≤64 chars, lowercase/digits/hyphens, no edge hyphens", () => {
    const name = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim() ?? "";
    expect(name.length).toBeGreaterThan(0);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
  });
  test("frontmatter description: required, non-empty, ≤1024 chars", () => {
    const desc = /^description:\s*(.+)$/m.exec(fm)?.[1]?.trim() ?? "";
    expect(desc.length).toBeGreaterThan(0);
    expect(desc.length).toBeLessThanOrEqual(1024);
  });
  test("body documents both import endpoints, the verify step, and asks before writing", () => {
    expect(SKILL_MD).toContain("/api/contacts/import");
    expect(SKILL_MD).toContain("/api/listings/import");
    expect(SKILL_MD).toContain("echo");
    expect(SKILL_MD).toMatch(/ASK the user/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/connect/skill-content.test.ts`
Expected: FAIL — Cannot find module './skill-content'

- [ ] **Step 3: Implement**

```ts
// lib/connect/skill-content.ts
// The hosted intake skill — served by /api/connect/skill from THIS deploy so
// it can never drift from the endpoints it documents (spec §2, failure mode 11).
export const SKILL_MD = `---
name: swfl-data-connect
description: Import a user's own data (contacts, listings, stated figures) into SWFL Data Gulf through its typed import endpoints, with a verify-first-record check. Use when a SWFL Data Gulf user asks to connect, upload, or import their contacts, listings, or figures.
---

# Connect your data to SWFL Data Gulf

CRITICAL — DO NOT SEND ANY DATA YET. This is a guided conversation, not a batch job.

## Before anything, ASK the user:

1. What is the data? (contacts / property listings / individual figures — anything else stops here: tell the user SWFL Data Gulf parks unrecognized files visibly in the web app instead.)
2. Where does it come from? (which tool exported it — so column names can be mapped)
3. Do they have their API token? (minted at POST /api/tokens while signed in — shown once)

## Contacts

POST https://www.swfldatagulf.com/api/contacts/import
- Auth: Authorization: Bearer <token>
- Body: multipart/form-data, field "file" = CSV (header row required; "email" column required; "name", "tags" recognized; every other column is kept as an attribute)
- Caps: 5 MB, 5000 rows

## Listings

POST https://www.swfldatagulf.com/api/listings/import
- Auth: Authorization: Bearer <token>
- Body: multipart/form-data, field "file" = CSV (header row required; "address" column required — aliases: street address, full address, property address; recognized: price, beds, baths, sqft, status, url; every other column kept as an attribute)
- Caps: 5 MB, 5000 rows

## VERIFY — do not tell the user it worked until this passes

The import response carries an "echo" array: rows read back from the database AFTER the write, plus counts (added / skipped with reasons / matched_to_county). Show the user the echo rows and the counts VERBATIM. If echo is empty or counts don't match expectations, the import did NOT fully land — say so plainly and show skip_reasons.

## Rules

- Never invent or repair a value while mapping columns — a cell you can't map stays unmapped (it lands as an attribute).
- Never send data the user didn't hand you in this conversation.
- Report partial success honestly: "X of Y rows landed, Z skipped because …" — that is the normal outcome, not an error.
`;
```

Route:

```ts
// app/api/connect/skill/route.ts
// Public GET serving the intake skill — same deploy as the endpoints it
// documents (drift-proof by construction).
import { SKILL_MD } from "@/lib/connect/skill-content";

export const runtime = "nodejs";

export async function GET() {
  return new Response(SKILL_MD, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/connect/skill-content.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/connect/skill-content.ts lib/connect/skill-content.test.ts app/api/connect/skill/route.ts
git commit -m "feat(user-data): hosted intake skill file — agentskills.io format, served from our deploy"
```

---

### Task 11: File-door park (header census on shapeless CSVs)

**Files:**
- Create: `lib/listings-user/csv-census.ts`
- Test: `lib/listings-user/csv-census.test.ts`
- 🟡 Modify: `lib/project/items.ts` — add three optional fields to the existing `kind: "file"` member: `csv_headers: z.array(z.string()).optional()`, `csv_row_count: z.number().optional()`, `parked: z.boolean().optional()`
- Modify: `components/project/UploadDrop.tsx` — read the component FIRST, then: where a dropped file is `.csv`, run `censusCsv` client-side (pure); attach the census fields to the file item it writes; `matchedShape === "none"` → also set `parked: true` and render the item row with a "parked — no shape yet" badge; `"contacts"`/`"listings"` → surface a link/button to that import flow instead of parking. Follow the component's existing item-write path; the census is data, the badge is one conditional span.

**Interfaces:**
- Produces: `censusCsv(text: string): { headers: string[]; rowCount: number; matchedShape: "contacts" | "listings" | "none" }`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/listings-user/csv-census.test.ts
// Guard: failure mode 8 — a shapeless CSV is SEEN (headers + count recorded),
// and shape detection routes CSVs that DO fit to their endpoint.
import { describe, expect, test } from "bun:test";
import { censusCsv } from "./csv-census";

describe("censusCsv", () => {
  test("email header → contacts shape", () => {
    const c = censusCsv("Email,Name\na@x.com,A");
    expect(c.matchedShape).toBe("contacts");
    expect(c.headers).toEqual(["email", "name"]);
    expect(c.rowCount).toBe(1);
  });
  test("address alias header → listings shape", () => {
    expect(censusCsv("Street Address,Price\n1 A St,100").matchedShape).toBe("listings");
  });
  test("neither → none, census still recorded", () => {
    const c = censusCsv("sku,qty,warehouse\nA1,5,FTM\nB2,3,NAP");
    expect(c.matchedShape).toBe("none");
    expect(c.headers).toEqual(["sku", "qty", "warehouse"]);
    expect(c.rowCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/listings-user/csv-census.test.ts`
Expected: FAIL — Cannot find module './csv-census'

- [ ] **Step 3: Implement**

```ts
// lib/listings-user/csv-census.ts
// Header census for the file door (spec §4): a structured file that matches
// no shape is PARKED with its census — never silently blobbed, never
// rejected. Pure + tiny so it can run client-side in UploadDrop.
// Deliberate approximation: comma-naive header split — quoted commas in
// HEADER names are rare, and the census is descriptive metadata, not a
// parse path; the real parsers own correctness.
const ADDRESS_ALIASES = ["address", "street address", "full address", "property address"];

export interface CsvCensus {
  headers: string[];
  rowCount: number;
  matchedShape: "contacts" | "listings" | "none";
}

export function censusCsv(text: string): CsvCensus {
  const deBommed = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = deBommed.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const headerLine = lines.find((l) => l.trim().length > 0) ?? "";
  const headers = headerLine
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase())
    .filter(Boolean);
  const rowCount = lines.filter((l) => l.trim().length > 0).length - (headerLine ? 1 : 0);
  const matchedShape = headers.includes("email")
    ? ("contacts" as const)
    : headers.some((h) => ADDRESS_ALIASES.includes(h))
      ? ("listings" as const)
      : ("none" as const);
  return { headers, rowCount: Math.max(rowCount, 0), matchedShape };
}
```

- [ ] **Step 4: Run test, add the schema fields, wire UploadDrop, build**

Run: `bun test lib/listings-user/csv-census.test.ts` → PASS.
Add the three optional fields to the `file` member of `lib/project/items.ts`; run `bun test lib/project/__tests__/items.test.ts` → still PASS (non-breaking).
Wire `UploadDrop.tsx` per the Files block. For `matchedShape === "listings"`, the button POSTs the file straight to `/api/listings/import` (no dedicated listings page exists — the endpoint is the flow) and shows the response's echo + counts. Run `bunx next build` → completes.

- [ ] **Step 4b: Parked file opens a checks entry (spec failure mode 8, second half)**

Create `app/api/uploads/parked/route.ts` — cookie-authed POST called by UploadDrop after it parks a file; records shape demand in the checks ledger via service role:

```ts
// app/api/uploads/parked/route.ts
// POST { itemId, headers, rowCount } — a parked (shapeless) CSV opens a
// checks entry so shape demand is COUNTED, not forgotten (spec §4).
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId.slice(0, 64) : null;
  const headers = Array.isArray(body?.headers) ? body.headers.slice(0, 50).join(", ").slice(0, 500) : "";
  const rowCount = typeof body?.rowCount === "number" ? body.rowCount : 0;
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const admin = createServiceRoleClient();
  // Same shape scripts/check.mjs writes; key is idempotent per item.
  const { error } = await admin.from("checks").upsert(
    {
      project: "user-data",
      key: `parked_upload_${itemId}`,
      label: `Parked upload (no shape): ${rowCount} rows — columns: ${headers}`,
      status: "open",
      class: "task",
    },
    { onConflict: "project,key" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

BEFORE implementing, open `scripts/check.mjs` and confirm the `public.checks` column names and conflict key it writes (`project`/`key`/`label`/`status`/`class` assumed above) — match them exactly; if the real columns differ, follow the real ones.
UploadDrop calls this route only when `matchedShape === "none"`, after the item lands.

- [ ] **Step 5: Commit**

```bash
git add lib/listings-user/csv-census.ts lib/listings-user/csv-census.test.ts lib/project/items.ts components/project/UploadDrop.tsx app/api/uploads/parked/route.ts
git commit -m "feat(user-data): file-door park — header census, shape routing, parked badge + checks entry"
```

---

### Task 12: Catalog + docs close-out

**Files:**
- Modify: `docs/standards/data-roots.md` — append a "User-brought data (user-scoped, beside the lake)" section after the PARCELS section: three concept rows — user contacts → `public.contacts` 🟢 · user listings → `public.user_listings` 🟢 (Task 1 ran) · user-stated figures → `projects.items` kind `user_figure` 🟢 — each noting "user-scoped, RLS, NEVER `data_lake.*`, no brain".
- Modify: `docs/standards/repo-inventory-audit.md` — routes section gains `/api/listings/import`, `/api/tokens`, `/api/connect/skill` (no LLM calls in any of them — say so explicitly).
- Modify: `SESSION_LOG.md` — entry naming the spec, the plan, tasks landed, and that check `user_data_typed_lane_live_verify` stays open pending live verify.

- [ ] **Step 1: Write all three doc updates**
- [ ] **Step 2: Verify no regressions across the touched area**

Run: `bun test lib/listings-user lib/api-tokens lib/connect lib/project app/api/listings`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/standards/data-roots.md docs/standards/repo-inventory-audit.md SESSION_LOG.md
git commit -m "docs(user-data): data-roots user-scoped section + route inventory + session log"
```

---

## Post-plan gates (session-loop obligations, not tasks)

- Push only with operator approval, via `node scripts/safe-push.mjs`, after checking `git log origin/main..HEAD` for foreign parallel-session commits.
- Check `user_data_typed_lane_live_verify` closes ONLY on the spec's live-verify evidence (real CSV through the prod endpoint → echo; listing in a deliverable with both sources named; figure rendering with provenance; parked CSV visible with its census) — evidence pasted, not narrated (RULE 0.8).
- `_RESEARCH/INDEX.md` line for `2026-08-02-agent-skills-spec-for-intake.md` was blocked by a parallel session's file claim at plan time — verify it landed; if not, add it.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 6, Task 9 | `app/api/listings/import/route.ts` |
| 🟡 | Task 7, Task 11 | `lib/project/items.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
