# Paid CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** ⚡ Sonnet — 8 files, keywords: architecture

**Goal:** One gated `GET /api/export/[surface]` route + one surface registry so paying users can download their contacts and listings as Excel-safe CSV; free users get 402 with the upgrade path.

**Architecture:** A pure registry (`lib/export/surfaces.ts`) is the whitelist — internal columns are structurally unexportable because a column not in the registry does not exist to the builder. A pure CSV builder (`lib/export/build-csv.ts`) routes every cell through the pinned OWASP escaper `lib/email/csv-escape.ts`. One thin route does auth → tier gate (fail-open on billing degrade, same contract as sends) → RLS-client paged read → in-memory CSV response.

**Tech Stack:** Next.js App Router route handler (nodejs runtime), Supabase (cookie RLS client for data, service-role ONLY for the tier lookup), `bun:test` with `mock.module`, existing `selectAllPaged` from `refinery/lib/paginate.mts`.

**Spec:** `docs/superpowers/specs/2026-08-03-csv-export-paid-design.md` — all 9 failure modes get a named test.

## Global Constraints

- Paid tiers are exactly `starter | growth | pro` (matches `PAID` in `lib/billing/effective-tier.ts`).
- `degraded: true` from `resolveEffectiveTier` → FAIL OPEN (serve the CSV). Same for a thrown tier lookup. Contract twin: `lib/email/usage.ts#checkUsageLimit`.
- Free → `402` JSON `{ error: "upgrade required", upgrade_url: "/billing" }`.
- Every cell exits through `escapeCsvCell`/`toCsvLine` from `@/lib/email/csv-escape` — never a raw string join.
- NEVER exported, any surface: `id`, `user_id`, `address_key`, anything matching /token|hash|secret/i.
- Data reads happen on the cookie RLS client ONLY. Service role touches ONLY `billing_subscriptions`/`switch_passes` (inside `resolveEffectiveTier`).
- Body starts with UTF-8 BOM (U+FEFF); records CRLF-separated (RFC 4180); headers `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="swfl-<surface>-YYYY-MM-DD.csv"`.
- Zero rows → 200 header-only CSV. Read error → 500 JSON, never `text/csv`.
- In-memory build, no streaming, no pagination params, no XLSX, no lake tables, no bearer-token door (explicit v1 non-goals).
- Route conventions (app/api/CLAUDE.md): `runtime = "nodejs"`, `dynamic = "force-dynamic"`, errors as `NextResponse.json({ error }, { status })`. Dynamic params are a Promise: `{ params }: { params: Promise<{ surface: string }> }` (verified against `app/api/segments/[id]/route.ts`).
- `selectAllPaged` requires a unique-together order column set and owns ALL ordering — pass `["created_at", "id"]`, never call `.order()` in the query builder (verified against `refinery/lib/paginate.mts:47` and the `lib/desk/loaders.ts` precedent).
- Commits per task; NO push without operator approval (standing rule).

## Probe results the plan is built on (verified 08/03/2026, this session)

- `lib/email/csv-escape.ts` exports `escapeCsvCell(value)` and `toCsvLine(cells)` — cells double-quoted, `"` doubled, `'` prefix on triggers `= + - @` tab/CR/LF/full-width. Zero production consumers today.
- `resolveEffectiveTier(db, userId) → Promise<{ tier: string; degraded: boolean }>` in `lib/billing/effective-tier.ts`; never throws internally but callers still belt-and-suspenders it (`app/api/contacts/route.ts:30-38`).
- `contacts` columns: `id, user_id, email, name, phone, tags (string[]), created_at, unsubscribed…` — spec's five exported columns all exist.
- `user_listings` columns (database-generated.types.ts:4047): `id, user_id, address, address_key, price, beds, baths, sqft, status, url, attribs (Json), zip_code, county, parcel_id, created_at, updated_at` — spec's ten exported columns all exist; `parcel_id` is simply not whitelisted.
- `app/contacts/page.tsx` is a client component that currently fetches `GET /api/contacts` and **drops the returned `tier` on the floor** (its own comment, line 20-21) — Task 4 wires it.
- The listings list UI has NOT landed — per spec the route ships anyway; no listings button task in this plan.
- Route test convention: co-located `route.test.ts`, `mock.module` at module boundaries, mutable `let` state to steer fakes (`app/api/listings/import/route.test.ts` is the model).

---

### Task 1: Surface registry — `lib/export/surfaces.ts`

**Files:**
- Create: `lib/export/surfaces.ts`
- Test: `lib/export/surfaces.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces: `ExportColumn { key: string; header: string; format?: "raw" | "date" | "join-semicolon" }`, `ExportSurfaceDef { table: "contacts" | "user_listings"; filenameBase: string; orderCols: readonly string[]; columns: readonly ExportColumn[]; withAttribsUnion?: boolean }`, `EXPORT_SURFACES: Record<string, ExportSurfaceDef>`, `BANNED_EXPORT_KEYS`, `BANNED_KEY_PATTERN`, `ATTRIBS_UNION_CAP = 50`, `attribsUnionColumns(rows) → ExportColumn[]`. Task 2 and 3 rely on these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/export/surfaces.test.ts
// Guards: failure mode 6 (internal-column leak — enforced GENERICALLY over
// every registry entry so a future surface can't regress it) and failure
// mode 9 (attribs column explosion — union capped at 50, alphabetical).
import { describe, expect, test } from "bun:test";
import {
  ATTRIBS_UNION_CAP,
  BANNED_EXPORT_KEYS,
  BANNED_KEY_PATTERN,
  EXPORT_SURFACES,
  attribsUnionColumns,
} from "./surfaces";

describe("export surface registry", () => {
  test("FM6: no surface whitelists a banned or token/hash-shaped column", () => {
    for (const [name, def] of Object.entries(EXPORT_SURFACES)) {
      for (const col of def.columns) {
        expect(BANNED_EXPORT_KEYS.has(col.key), `${name}.${col.key}`).toBe(false);
        expect(BANNED_KEY_PATTERN.test(col.key), `${name}.${col.key}`).toBe(false);
      }
    }
  });

  test("every surface has a stable unique order (created_at, id)", () => {
    for (const def of Object.values(EXPORT_SURFACES)) {
      expect(def.orderCols).toEqual(["created_at", "id"]);
    }
  });

  test("v1 surfaces are exactly contacts and listings, tables as specced", () => {
    expect(Object.keys(EXPORT_SURFACES).sort()).toEqual(["contacts", "listings"]);
    expect(EXPORT_SURFACES.contacts.table).toBe("contacts");
    expect(EXPORT_SURFACES.listings.table).toBe("user_listings");
    expect(EXPORT_SURFACES.listings.withAttribsUnion).toBe(true);
  });

  test("FM9: attribs union caps at 50 keys, alphabetical, ignores non-object attribs", () => {
    const rows = [
      { attribs: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${String(i).padStart(2, "0")}`, "v"])) },
      { attribs: null },
      { attribs: "not-an-object" },
      { attribs: ["not", "a", "record"] },
    ];
    const cols = attribsUnionColumns(rows);
    expect(cols.length).toBe(ATTRIBS_UNION_CAP);
    const headers = cols.map((c) => c.header);
    expect(headers).toEqual([...headers].sort());
    expect(cols[0]).toEqual({ key: "attribs.k00", header: "k00" });
  });

  test("attribs union is deterministic regardless of row order", () => {
    const a = [{ attribs: { b: 1, a: 1 } }, { attribs: { c: 1 } }];
    const b = [{ attribs: { c: 1 } }, { attribs: { a: 1, b: 1 } }];
    expect(attribsUnionColumns(a)).toEqual(attribsUnionColumns(b));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/export/surfaces.test.ts`
Expected: FAIL — cannot resolve `./surfaces`.

- [ ] **Step 3: Write the registry**

```ts
// lib/export/surfaces.ts
// ONE registry — the Clay export-view principle. Adding a future export
// (lake/desk/brain tables) = one entry here, never a new route. The registry
// IS the whitelist: a column not listed does not exist to the CSV builder, so
// internal columns are structurally unexportable (spec 2026-08-03, FM6).
export type CellFormat = "raw" | "date" | "join-semicolon";

export interface ExportColumn {
  /** Row property. `attribs.<name>` reads row.attribs[name] (listings). */
  key: string;
  header: string;
  format?: CellFormat;
}

export interface ExportSurfaceDef {
  table: "contacts" | "user_listings";
  filenameBase: string;
  /** Unique-together — selectAllPaged needs a stable total order. */
  orderCols: readonly string[];
  columns: readonly ExportColumn[];
  /** Listings: append the union of the user's own attribs keys. */
  withAttribsUnion?: boolean;
}

export const BANNED_EXPORT_KEYS: ReadonlySet<string> = new Set(["id", "user_id", "address_key"]);
export const BANNED_KEY_PATTERN = /token|hash|secret/i;

export const EXPORT_SURFACES: Record<string, ExportSurfaceDef> = {
  contacts: {
    table: "contacts",
    filenameBase: "swfl-contacts",
    orderCols: ["created_at", "id"],
    columns: [
      { key: "name", header: "name" },
      { key: "email", header: "email" },
      { key: "phone", header: "phone" },
      { key: "tags", header: "tags", format: "join-semicolon" },
      { key: "created_at", header: "created", format: "date" },
    ],
  },
  listings: {
    table: "user_listings",
    filenameBase: "swfl-listings",
    orderCols: ["created_at", "id"],
    columns: [
      { key: "address", header: "address" },
      { key: "price", header: "price" },
      { key: "beds", header: "beds" },
      { key: "baths", header: "baths" },
      { key: "sqft", header: "sqft" },
      { key: "status", header: "status" },
      { key: "url", header: "url" },
      { key: "zip_code", header: "zip_code" },
      { key: "county", header: "county" },
      { key: "updated_at", header: "imported", format: "date" },
    ],
    withAttribsUnion: true,
  },
};

/** FM9 guard: a user with 60 brought columns gets 50, deterministically. */
export const ATTRIBS_UNION_CAP = 50;

export function attribsUnionColumns(
  rows: ReadonlyArray<Record<string, unknown>>,
): ExportColumn[] {
  const keys = new Set<string>();
  for (const row of rows) {
    const attribs = row.attribs;
    if (attribs && typeof attribs === "object" && !Array.isArray(attribs)) {
      for (const k of Object.keys(attribs)) keys.add(k);
    }
  }
  return [...keys]
    .sort()
    .slice(0, ATTRIBS_UNION_CAP)
    .map((k) => ({ key: `attribs.${k}`, header: k }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/export/surfaces.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/export/surfaces.ts lib/export/surfaces.test.ts
git commit -m "feat(export): surface registry — the export-view whitelist (contacts, listings)"
```

---

### Task 2: Pure CSV builder — `lib/export/build-csv.ts`

**Files:**
- Create: `lib/export/build-csv.ts`
- Test: `lib/export/build-csv.test.ts`

**Interfaces:**
- Consumes: `ExportSurfaceDef`, `ExportColumn`, `attribsUnionColumns` from Task 1; `toCsvLine` from `@/lib/email/csv-escape`.
- Produces: `buildCsv(def: ExportSurfaceDef, rows: ReadonlyArray<Record<string, unknown>>) → string` (BOM-prefixed full document). Task 3's route calls exactly this.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/export/build-csv.test.ts
// Guards: failure mode 1 (formula injection — the OWASP worked example must
// arrive escaped), 6 (no internal column in header or body), 7 (BOM first
// code point), plus zero-rows→header-only and the format rules (tags "; ",
// dates YYYY-MM-DD only).
import { describe, expect, test } from "bun:test";
import { EXPORT_SURFACES } from "./surfaces";
import { buildCsv } from "./build-csv";

const contactRow = {
  id: "c-1",
  user_id: "u-1",
  name: '=1+2";=1+2', // OWASP's worked example
  email: "jose@example.com",
  phone: null,
  tags: ["investors", "FMB"],
  created_at: "2026-08-01T14:03:22.000Z",
};

describe("buildCsv", () => {
  test("FM7: first code point is U+FEFF", () => {
    const csv = buildCsv(EXPORT_SURFACES.contacts, [contactRow]);
    expect(csv.codePointAt(0)).toBe(0xfeff);
  });

  test("FM1: formula cell arrives in OWASP-escaped form", () => {
    const csv = buildCsv(EXPORT_SURFACES.contacts, [contactRow]);
    expect(csv).toContain('"\'=1+2"";=1+2"'); // '=1+2";=1+2 → "'=1+2"";=1+2"
  });

  test("FM6: id/user_id never appear in header or body", () => {
    const csv = buildCsv(EXPORT_SURFACES.contacts, [contactRow]);
    expect(csv).not.toContain("user_id");
    expect(csv).not.toContain("c-1");
    expect(csv).not.toContain("u-1");
  });

  test("header line + formats: tags joined '; ', date YYYY-MM-DD only, null → empty cell", () => {
    const csv = buildCsv(EXPORT_SURFACES.contacts, [contactRow]);
    const lines = csv.slice(1).split("\r\n"); // strip BOM
    expect(lines[0]).toBe('"name","email","phone","tags","created"');
    expect(lines[1]).toContain('"investors; FMB"');
    expect(lines[1]).toContain('"2026-08-01"');
    expect(lines[1]).toContain('""'); // null phone
  });

  test("zero rows → header-only document (a true answer)", () => {
    const csv = buildCsv(EXPORT_SURFACES.contacts, []);
    expect(csv.slice(1)).toBe('"name","email","phone","tags","created"\r\n');
  });

  test("listings: attribs union columns appended after fixed columns, values land", () => {
    const row = {
      address: "1 A St",
      price: 100000,
      beds: 3,
      baths: 2,
      sqft: 1500,
      status: "active",
      url: null,
      zip_code: "33901",
      county: "Lee",
      updated_at: "2026-08-02T00:00:00.000Z",
      attribs: { hoa_fee: "120", pool: "yes" },
      address_key: "SECRET-KEY",
    };
    const csv = buildCsv(EXPORT_SURFACES.listings, [row]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0].endsWith('"imported","hoa_fee","pool"')).toBe(true);
    expect(lines[1]).toContain('"120"');
    expect(lines[1]).toContain('"yes"');
    expect(csv).not.toContain("SECRET-KEY"); // FM6 on listings
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/export/build-csv.test.ts`
Expected: FAIL — cannot resolve `./build-csv`.

- [ ] **Step 3: Write the builder**

```ts
// lib/export/build-csv.ts
// Pure: (registry entry, rows) → full CSV document. EVERY cell exits through
// toCsvLine/escapeCsvCell (lib/email/csv-escape.ts — the pinned OWASP exit
// root, FM1). BOM prefix so Excel reads UTF-8 (FM7). CRLF records (RFC 4180).
import { toCsvLine } from "@/lib/email/csv-escape";
import { attribsUnionColumns, type ExportColumn, type ExportSurfaceDef } from "./surfaces";

const BOM = "\uFEFF"; // explicit escape — an invisible literal gets lost in copy-paste

function cellValue(row: Record<string, unknown>, col: ExportColumn): string | null {
  const raw = col.key.startsWith("attribs.")
    ? (row.attribs as Record<string, unknown> | null | undefined)?.[col.key.slice("attribs.".length)]
    : row[col.key];
  if (raw === null || raw === undefined) return null;
  if (col.format === "date") return String(raw).slice(0, 10);
  if (col.format === "join-semicolon") {
    return Array.isArray(raw) ? raw.map(String).join("; ") : String(raw);
  }
  // attribs values come from user CSV imports (strings/numbers), but a nested
  // object must never ship as "[object Object]".
  return typeof raw === "object" ? JSON.stringify(raw) : String(raw);
}

export function buildCsv(
  def: ExportSurfaceDef,
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  const columns: ExportColumn[] = def.withAttribsUnion
    ? [...def.columns, ...attribsUnionColumns(rows)]
    : [...def.columns];
  const lines = [toCsvLine(columns.map((c) => c.header))];
  for (const row of rows) {
    lines.push(toCsvLine(columns.map((c) => cellValue(row, c))));
  }
  return BOM + lines.join("\r\n") + "\r\n";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/export/build-csv.test.ts`
Expected: 6 pass. Also run `bun test lib/export lib/email/__tests__/csv-escape.test.ts` — everything green together.

- [ ] **Step 5: Commit**

```bash
git add lib/export/build-csv.ts lib/export/build-csv.test.ts
git commit -m "feat(export): pure CSV builder — BOM + OWASP-escaped cells + attribs union"
```

---

### Task 3: Gated route — `app/api/export/[surface]/route.ts`

**Files:**
- Create: `app/api/export/[surface]/route.ts`
- Test: `app/api/export/[surface]/route.test.ts`

**Interfaces:**
- Consumes: `EXPORT_SURFACES` (Task 1), `buildCsv` (Task 2), `resolveEffectiveTier` from `@/lib/billing/effective-tier`, `selectAllPaged` + `PagedQuery` from `@/refinery/lib/paginate.mts`, `createClient` from `@/utils/supabase/server`, `createServiceRoleClient` from `@/utils/supabase/service-role`.
- Produces: `GET(req, { params: Promise<{ surface }> })` — the public contract. The future listings UI and bearer-token branch build on this route, never a second one.

- [ ] **Step 1: Write the failing tests**

```ts
// app/api/export/[surface]/route.test.ts
// Guards, one test per spec failure mode: FM1 escaped body, FM2 free→402,
// FM3 degraded fails OPEN, FM4 no service-role data read (the service-role
// fake THROWS on .from — any data read via it explodes every test), FM5
// page-boundary truth through the REAL selectAllPaged (1001 rows, two pages),
// FM7 BOM, FM8 read error → 500 JSON never text/csv. Plus 404/401/headers.
import { describe, expect, test, mock } from "bun:test";

let fakeUser: { id: string } | null = { id: "user-1" };
let tierResult: { tier: string; degraded: boolean } = { tier: "free", degraded: false };
let tierThrows = false;
let dataRows: Record<string, unknown>[] = [];
let dataError = false;
const cookieReads: string[] = [];

function pagedQuery() {
  return {
    order() {
      return this;
    },
    async range(from: number, to: number) {
      if (dataError) return { data: null, error: { message: "boom" } };
      return { data: dataRows.slice(from, to + 1), error: null };
    },
  };
}

mock.module("next/headers", () => ({ cookies: async () => ({}) }));
mock.module("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: fakeUser } }) },
    from: (table: string) => {
      cookieReads.push(table);
      return { select: () => pagedQuery() };
    },
  }),
}));
mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      throw new Error("FM4 violation: service-role data read");
    },
  }),
}));
mock.module("@/lib/billing/effective-tier", () => ({
  resolveEffectiveTier: async () => {
    if (tierThrows) throw new Error("billing outage");
    return tierResult;
  },
}));

const { GET } = await import("./route");

function get(surface: string) {
  return GET(new Request(`http://localhost/api/export/${surface}`), {
    params: Promise.resolve({ surface }),
  });
}

function contactRow(i: number) {
  return {
    id: `c-${i}`,
    user_id: "u-1",
    name: `Contact ${i}`,
    email: `c${i}@example.com`,
    phone: null,
    tags: [],
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

describe("GET /api/export/[surface]", () => {
  test("404 on unknown surface", async () => {
    const res = await get("lake_secrets");
    expect(res.status).toBe(404);
  });

  test("401 when unauthenticated", async () => {
    fakeUser = null;
    const res = await get("contacts");
    expect(res.status).toBe(401);
    fakeUser = { id: "user-1" };
  });

  test("FM2: free tier → 402 JSON with upgrade path, no CSV body", async () => {
    tierResult = { tier: "free", degraded: false };
    const res = await get("contacts");
    expect(res.status).toBe(402);
    expect(res.headers.get("content-type")).not.toContain("text/csv");
    const body = await res.json();
    expect(body.upgrade_url).toBe("/billing");
  });

  test("paid tier → 200 text/csv with dated attachment filename", async () => {
    tierResult = { tier: "starter", degraded: false };
    dataRows = [contactRow(1)];
    const res = await get("contacts");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="swfl-contacts-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });

  test("FM7 + FM1 + FM6 on the wire: BOM first, formula escaped, no internal ids", async () => {
    tierResult = { tier: "growth", degraded: false };
    dataRows = [{ ...contactRow(1), name: "=2+2" }];
    const res = await get("contacts");
    const body = await res.text();
    expect(body.codePointAt(0)).toBe(0xfeff);
    expect(body).toContain('"\'=2+2"');
    expect(body).not.toContain("user_id");
    expect(body).not.toContain("c-1");
  });

  test("FM3: degraded tier read fails OPEN — free-looking user still gets the CSV", async () => {
    tierResult = { tier: "free", degraded: true };
    dataRows = [contactRow(1)];
    const res = await get("contacts");
    expect(res.status).toBe(200);
  });

  test("FM3 belt-and-suspenders: a THROWN tier lookup also fails open", async () => {
    tierThrows = true;
    dataRows = [contactRow(1)];
    const res = await get("contacts");
    expect(res.status).toBe(200);
    tierThrows = false;
  });

  test("FM5: 1001 rows cross the PostgREST page boundary intact (real selectAllPaged)", async () => {
    tierResult = { tier: "pro", degraded: false };
    dataRows = Array.from({ length: 1001 }, (_, i) => contactRow(i));
    const res = await get("contacts");
    const lines = (await res.text()).trimEnd().split("\r\n");
    expect(lines.length).toBe(1002); // header + 1001 rows
  });

  test("FM8: read error → 500 JSON, NEVER a valid-looking empty CSV", async () => {
    tierResult = { tier: "pro", degraded: false };
    dataError = true;
    const res = await get("contacts");
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).not.toContain("text/csv");
    dataError = false;
  });

  test("FM4: the data read happened on the cookie RLS client", async () => {
    // The service-role fake throws on .from() — reaching this line at all
    // proves no test above routed a data read through service role.
    expect(cookieReads).toContain("contacts");
  });

  test("zero rows → 200 header-only CSV (a true answer, not an error)", async () => {
    tierResult = { tier: "starter", degraded: false };
    dataRows = [];
    const res = await get("contacts");
    expect(res.status).toBe(200);
    const lines = (await res.text()).trimEnd().split("\r\n");
    expect(lines.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test "app/api/export/[surface]/route.test.ts"`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the route**

Before writing, confirm one assumption from the probe: `selectAllPaged` THROWS on a returned PostgREST error (read `refinery/lib/paginate.mts` around lines 75–100). The FM8 test above depends on it; if it instead returns partial data on error, adapt the route's error handling accordingly — but the throw is expected (`lib/desk/loaders.ts:170` calls it bare).

```ts
// app/api/export/[surface]/route.ts
// Paid CSV download of user-owned tables (spec 2026-08-03-csv-export-paid).
// ONE gated route; which tables/columns exist is lib/export/surfaces.ts —
// adding an export is one registry entry, never a sibling route.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { resolveEffectiveTier } from "@/lib/billing/effective-tier";
import { selectAllPaged, type PagedQuery } from "@/refinery/lib/paginate.mts";
import { EXPORT_SURFACES } from "@/lib/export/surfaces";
import { buildCsv } from "@/lib/export/build-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAID = new Set(["starter", "growth", "pro"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ surface: string }> },
) {
  const { surface } = await params;
  const def = EXPORT_SURFACES[surface];
  if (!def) return NextResponse.json({ error: "unknown export" }, { status: 404 });

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Tier gate. Service role touches ONLY the billing tables inside
  // resolveEffectiveTier. `degraded: true` (or a thrown lookup) fails OPEN —
  // same contract as sends (lib/email/usage.ts#checkUsageLimit): a billing
  // outage never blocks a paying customer; worst case a free user gets one
  // CSV during an outage.
  let allowed: boolean;
  try {
    const { tier, degraded } = await resolveEffectiveTier(createServiceRoleClient(), user.id);
    allowed = degraded || PAID.has(tier);
  } catch {
    allowed = true;
  }
  if (!allowed) {
    return NextResponse.json(
      { error: "upgrade required", upgrade_url: "/billing" },
      { status: 402 },
    );
  }

  // Data read on the RLS cookie client — the cross-user guard is structural,
  // not a WHERE clause we have to remember. Paged (PostgREST caps a bare
  // select at 1000 rows with NO error); selectAllPaged owns the ordering.
  let rows: Record<string, unknown>[];
  try {
    rows = await selectAllPaged<Record<string, unknown>>(
      () => supabase.from(def.table).select("*") as unknown as PagedQuery<Record<string, unknown>>,
      def.orderCols,
    );
  } catch {
    // NEVER a valid-looking empty file on a failed read.
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(buildCsv(def, rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${def.filenameBase}-${date}.csv"`,
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test "app/api/export/[surface]/route.test.ts"`
Expected: 11 pass. FM5 must show the real two-page fetch (1002 lines) — if it returns 1000 rows the fake's `range` slicing or orderCols wiring is wrong; fix before proceeding.

- [ ] **Step 5: Run the full export + billing test set**

Run: `bun test lib/export lib/billing "app/api/export/[surface]/route.test.ts"`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add "app/api/export/[surface]/route.ts" "app/api/export/[surface]/route.test.ts"
git commit -m "feat(export): gated GET /api/export/[surface] — paid CSV, fail-open billing, RLS reads"
```

---

### Task 4: Contacts page button — wire the tier that's currently dropped

**Files:**
- Modify: `app/contacts/page.tsx` (state block ~lines 8–15, both fetch sites ~lines 17–33, header button group ~lines 110–131)

**Interfaces:**
- Consumes: `GET /api/contacts` already returns `{ contacts, tier }` where `tier` is the email-lab tier string (`emailLabTierFor` output) — free is exactly `"free"`. The page currently discards it (its own comment says so).
- Produces: nothing downstream; pure UI.

- [ ] **Step 1: Add tier state and capture it at both fetch sites**

```tsx
const [tier, setTier] = useState<string>("free");
```

In `load()`:

```tsx
const body = await res.json();
setContacts(body.contacts ?? []);
setTier(body.tier ?? "free");
```

In the mount effect (keep the `.then` shape — `react-set-state-in-effect` is a hard error in this repo):

```tsx
fetch("/api/contacts")
  .then((r) => (r.ok ? r.json() : { contacts: [] }))
  .then((body) => {
    setContacts(body.contacts ?? []);
    setTier(body.tier ?? "free");
  })
  .catch(() => {});
```

Delete the now-false "drops tier on the floor" comment at both sites.

- [ ] **Step 2: Add the Download button to the header button group** (before "Import CSV / vCard", matching its styling)

```tsx
{(() => {
  const paid = tier !== "free";
  return (
    <a
      href={paid ? "/api/export/contacts" : "/billing"}
      title={paid ? "Download your contacts as a CSV file" : "Downloads are a paid feature — upgrade to export your data"}
      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10"
    >
      {paid ? "Download CSV" : "Download CSV 🔒"}
    </a>
  );
})()}
```

A plain `<a href>` is deliberate: a `Content-Disposition: attachment` response downloads in place without navigating the SPA. The lock is UI-courtesy only — the 402 gate is server-side (FM2); a free user hand-typing the URL gets JSON, not data.

- [ ] **Step 3: Verify with a production build**

Run: `bunx next build`
Expected: builds clean (repo norm — this is the verification command, not `npx tsc`).

- [ ] **Step 4: Commit**

```bash
git add app/contacts/page.tsx
git commit -m "feat(contacts): Download CSV button — paid direct, free locked to /billing"
```

> Listings button: intentionally ABSENT. The user-data lane's list UI hasn't landed; per spec the API is the contract and the button follows the lane. When that UI lands, copy this button with `href="/api/export/listings"`.

---

### Task 5: Close-out — full verify, ledger, log

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)
- Verify: checks ledger entry `csv_export_paid_live_verify`

- [ ] **Step 1: Full test + build pass, paste real output**

```bash
bun test lib/export lib/billing "app/api/export/[surface]/route.test.ts"
bunx next build
```

Expected: all green. RULE 0.8: paste the actual test-count line and build result into the session summary — "done" requires the evidence, not the claim.

- [ ] **Step 2: Confirm the live-verify check exists (open it if the spec session didn't)**

```bash
node scripts/check.mjs list | grep -i csv_export
```

If `csv_export_paid_live_verify` is absent: `node scripts/check.mjs open brain-platform csv_export_paid_live_verify "Paid CSV export live-verified: paid download both surfaces in Excel, =2+2 arrives as text; free session 402/locked"`. It stays OPEN — closing requires the live Excel evidence per the spec, which needs a real paid session (operator involvement).

- [ ] **Step 3: SESSION_LOG entry**

Top-of-file entry: what shipped (registry + builder + route + contacts button), test counts, the 9 failure modes → named tests mapping, listings-button deferral (follows the user-data lane's UI), live-verify check still open. Note for the ops architecture snapshot: `/api/export/[surface]` is a new gated route — the curated route map at swfldatagulf-ops `/architecture#routes` is stale until regenerated.

- [ ] **Step 4: STOP — ask the operator before pushing**

Standing rule: no autonomous push, approval is per-push. Commits are local; hand the operator the summary and wait.

---

## Self-review (done at plan time)

- **Spec coverage:** registry → Task 1; builder + BOM/escaping/formats → Task 2; route steps 1–7 → Task 3; contacts UI → Task 4; listings UI explicitly deferred per spec; non-goals untouched; all 9 failure modes have a named test (FM1: T2+T3, FM2: T3, FM3: T3 ×2, FM4: T3 throwing service-role fake + assertion, FM5: T3 1001-row real-pager, FM6: T1 generic + T2 + T3, FM7: T2 + T3, FM8: T3, FM9: T1).
- **Known deltas from spec text:** spec says listings "ordered by created/updated" — plan uses `["created_at", "id"]` because `selectAllPaged` requires a unique-together order; `updated_at` still ships as the "imported" column. Spec's registry sketch didn't name `orderCols`/`format` — they're implementation shape, whitelist semantics unchanged.
- **Type consistency:** `ExportColumn`/`ExportSurfaceDef`/`EXPORT_SURFACES`/`attribsUnionColumns`/`buildCsv` names match across Tasks 1–3; route imports verified against real module paths probed this session.
