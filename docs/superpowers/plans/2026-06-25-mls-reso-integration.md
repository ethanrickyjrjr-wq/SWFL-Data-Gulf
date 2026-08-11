# MLS / RESO Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 10 tasks, 22 files, keywords: migration, schema, architecture

**Goal:** Connect licensed real estate agents to their MLS board (Bridge/Trestle), sync their own listings and local ZIP market stats via the RESO DD 2.0 standard, and surface that data in the assistant as a Lane 2 source.

**Architecture:** Static Bearer tokens per board live in Vercel env vars; users provide only their `MemberMlsId`. `lib/reso/` holds the OData client + pull functions; a Next.js API route handles connect/sync/disconnect; a Vercel cron fans out across all active connections every 6h. Phase 1 delivers the full plumbing (data + sync + UI). Brain integration is Phase 2.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgREST for data_lake + public schema), `@supabase/supabase-js` v2, RESO DD 2.0 OData API (Bridge sandbox during development), `bun:test` for tests.

## Global Constraints

- All tests: `bun:test` (`import { test, expect } from "bun:test"`)
- Run tests: `bun test lib/reso/` (or `bun test <file>` for a single file)
- Verify build: `bunx next build`
- Commit via `node scripts/safe-push.mjs` — never `--no-verify`
- Never `git add -A` — always explicit paths
- `data_lake` schema access: `.schema('data_lake').from('table_name')` via Supabase service key (bypasses RLS)
- All SQL runs via `new Bun.SQL(connectionString)` — psql is NOT installed
- DB connection string from `.dlt/secrets.toml` key `destination.credentials.database`
- `CRON_SECRET` env var guards the GET /api/mls/sync cron endpoint

---

## File Map

| File | Role |
|---|---|
| `migrations/20260625_user_mls_connections.sql` | Table + RLS for connection records |
| `migrations/20260625_user_mls_data_lake.sql` | data_lake.user_mls_listings + user_mls_stats |
| `lib/reso/boards.ts` | Board slug → env var mapping, `getBoardConfig()` |
| `lib/reso/client.ts` | `ResoClient` — OData GET with pagination |
| `lib/reso/client.test.ts` | Unit tests for client pagination + error handling |
| `lib/reso/pull-agent-listings.ts` | Fetch agent's Property records, upsert to data_lake |
| `lib/reso/pull-agent-listings.test.ts` | Unit tests |
| `lib/reso/pull-zip-stats.ts` | Fetch closed sales for agent's ZIPs, aggregate, upsert |
| `lib/reso/pull-zip-stats.test.ts` | Unit tests (median, aggregation) |
| `lib/reso/sync.ts` | Full + incremental sync via EntityEventSequence |
| `lib/reso/sync.test.ts` | Unit tests (first sync vs incremental paths) |
| `app/api/mls/connect/route.ts` | POST — create connection + initial sync |
| `app/api/mls/connect/route.test.ts` | Route unit tests |
| `app/api/mls/sync/route.ts` | POST (user) + GET (cron fan-out) |
| `app/api/mls/sync/route.test.ts` | Route unit tests |
| `app/api/mls/disconnect/route.ts` | DELETE — remove connection + data_lake rows |
| `app/api/mls/disconnect/route.test.ts` | Route unit tests |
| `app/settings/mls/page.tsx` | Server shell (metadata, no auth logic) |
| `app/settings/mls/mls-settings-client.tsx` | `'use client'` — 3-screen Connect→Preview→Status UI |
| `vercel.json` | Add crons entry for /api/mls/sync every 6h |

---

## Task 1: SQL Migrations

**Files:**
- Create: `migrations/20260625_user_mls_connections.sql`
- Create: `migrations/20260625_user_mls_data_lake.sql`
- Create: `scripts/run-mls-migration.ts` (run-once helper)

**Interfaces:**
- Produces: `public.user_mls_connections` table with RLS; `data_lake.user_mls_listings`; `data_lake.user_mls_stats`

- [ ] **Step 1: Write connections migration**

Create `migrations/20260625_user_mls_connections.sql`:

```sql
-- public.user_mls_connections
-- Stores one record per (user, board). Bearer token lives in env — NOT here.

CREATE TABLE IF NOT EXISTS public.user_mls_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_slug       text NOT NULL CHECK (board_slug IN ('swfl_mls', 'nabor')),
  member_mls_id    text NOT NULL,
  last_entity_event_sequence bigint,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error')),
  connected_at     timestamptz NOT NULL DEFAULT now(),
  last_synced_at   timestamptz,
  error_message    text,
  UNIQUE (user_id, board_slug)
);

ALTER TABLE public.user_mls_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_connections" ON public.user_mls_connections
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role bypasses RLS automatically.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_mls_connections TO service_role;
```

- [ ] **Step 2: Write data_lake migration**

Create `migrations/20260625_user_mls_data_lake.sql`:

```sql
-- data_lake.user_mls_listings — agent's own Property records
-- Keyed on (listing_key, board_slug) because keys may collide across boards.

CREATE TABLE IF NOT EXISTS data_lake.user_mls_listings (
  listing_key             text NOT NULL,
  user_id                 uuid NOT NULL,
  board_slug              text NOT NULL,
  list_price              numeric,
  close_price             numeric,
  listing_contract_date   date,
  close_date              date,
  days_on_market          integer,
  bedrooms_total          integer,
  bathrooms_total         numeric,
  living_area             numeric,
  postal_code             text,
  standard_status         text,
  property_type           text,
  synced_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_key, board_slug)
);

CREATE INDEX IF NOT EXISTS idx_user_mls_listings_user_board
  ON data_lake.user_mls_listings (user_id, board_slug);

CREATE INDEX IF NOT EXISTS idx_user_mls_listings_postal
  ON data_lake.user_mls_listings (user_id, board_slug, postal_code);

-- data_lake.user_mls_stats — computed ZIP-level market stats
-- Recomputed on each sync for affected ZIPs.

CREATE TABLE IF NOT EXISTS data_lake.user_mls_stats (
  user_id              uuid NOT NULL,
  board_slug           text NOT NULL,
  postal_code          text NOT NULL,
  period_months        integer NOT NULL DEFAULT 24,
  median_close_price   numeric,
  avg_days_on_market   numeric,
  active_count         integer NOT NULL DEFAULT 0,
  close_count          integer NOT NULL DEFAULT 0,
  avg_price_per_sqft   numeric,
  computed_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, board_slug, postal_code)
);

-- Grant PostgREST access (required after any data_lake table creation)
GRANT SELECT, INSERT, UPDATE, DELETE ON data_lake.user_mls_listings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON data_lake.user_mls_stats TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Write the run-once migration helper**

Create `scripts/run-mls-migration.ts`:

```typescript
import { readFileSync } from 'fs';

const secrets = readFileSync('.dlt/secrets.toml', 'utf8');
const match = secrets.match(/database\s*=\s*"([^"]+)"/);
if (!match) throw new Error('Could not find database connection string in .dlt/secrets.toml');

const connStr = match[1];
const sql = new Bun.SQL(connStr);

for (const file of [
  'migrations/20260625_user_mls_connections.sql',
  'migrations/20260625_user_mls_data_lake.sql',
]) {
  console.log(`Running ${file}...`);
  const ddl = readFileSync(file, 'utf8');
  await sql.unsafe(ddl);
  console.log(`  ✓ done`);
}

await sql.end();
console.log('Migrations complete.');
```

- [ ] **Step 4: Run the migration**

```bash
bun scripts/run-mls-migration.ts
```

Expected output:
```
Running migrations/20260625_user_mls_connections.sql...
  ✓ done
Running migrations/20260625_user_mls_data_lake.sql...
  ✓ done
Migrations complete.
```

- [ ] **Step 5: Verify tables exist**

```bash
bun -e "
const sql = new Bun.SQL(require('fs').readFileSync('.dlt/secrets.toml','utf8').match(/database\s*=\s*\"([^\"]+)\"/)[1]);
const r1 = await sql\`SELECT COUNT(*) FROM public.user_mls_connections\`;
const r2 = await sql\`SELECT COUNT(*) FROM data_lake.user_mls_listings\`;
const r3 = await sql\`SELECT COUNT(*) FROM data_lake.user_mls_stats\`;
console.log('connections:', r1[0].count, 'listings:', r2[0].count, 'stats:', r3[0].count);
await sql.end();
"
```

Expected: `connections: 0 listings: 0 stats: 0`

- [ ] **Step 6: Commit**

```bash
git add migrations/20260625_user_mls_connections.sql migrations/20260625_user_mls_data_lake.sql scripts/run-mls-migration.ts
git commit -m "feat(mls): create user_mls_connections + data_lake tables"
```

---

## Task 2: RESO Client + Board Config

**Files:**
- Create: `lib/reso/boards.ts`
- Create: `lib/reso/client.ts`
- Create: `lib/reso/client.test.ts`

**Interfaces:**
- Produces: `getBoardConfig(slug: BoardSlug): BoardConfig`, `new ResoClient(slug).get<T>(resource, params): Promise<T[]>`
- Consumes: `RESO_BASE_URL_SWFL_MLS`, `RESO_TOKEN_SWFL_MLS`, `RESO_BASE_URL_NABOR`, `RESO_TOKEN_NABOR` env vars

- [ ] **Step 1: Write failing tests for the client**

Create `lib/reso/client.test.ts`:

```typescript
import { test, expect, mock, beforeEach, afterEach } from 'bun:test';

// We test the client by mocking global fetch.
// The test spies on pagination: after two full pages, the third page is empty
// and the client should stop and return all items.

const makeFetchMock = (pages: unknown[][]) => {
  let call = 0;
  return mock(async (_url: string, _opts: unknown) => {
    const page = pages[call++] ?? [];
    return {
      ok: true,
      json: async () => ({ value: page }),
    };
  });
};

let originalFetch: typeof fetch;
beforeEach(() => { originalFetch = global.fetch; });
afterEach(() => { global.fetch = originalFetch; });

test('paginates until an empty page is returned', async () => {
  process.env.RESO_BASE_URL_SWFL_MLS = 'https://sandbox.example.com';
  process.env.RESO_TOKEN_SWFL_MLS = 'tok-test';

  const items200 = Array.from({ length: 200 }, (_, i) => ({ ListingKey: `K${i}` }));
  const items50  = Array.from({ length: 50 },  (_, i) => ({ ListingKey: `L${i}` }));
  global.fetch = makeFetchMock([items200, items50]) as typeof fetch;

  const { ResoClient } = await import('./client');
  const client = new ResoClient('swfl_mls');
  const results = await client.get('Property', { '$select': 'ListingKey' });

  expect(results.length).toBe(250);
});

test('throws on non-ok HTTP response', async () => {
  process.env.RESO_BASE_URL_SWFL_MLS = 'https://sandbox.example.com';
  process.env.RESO_TOKEN_SWFL_MLS = 'tok-test';

  global.fetch = mock(async () => ({
    ok: false,
    status: 401,
    text: async () => 'Unauthorized',
  })) as typeof fetch;

  const { ResoClient } = await import('./client');
  const client = new ResoClient('swfl_mls');
  await expect(client.get('Property', {})).rejects.toThrow('401');
});

test('throws when env vars are missing for a board', async () => {
  delete process.env.RESO_BASE_URL_NABOR;
  delete process.env.RESO_TOKEN_NABOR;

  const { ResoClient } = await import('./client');
  expect(() => new ResoClient('nabor')).toThrow("env vars not configured");
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
bun test lib/reso/client.test.ts
```

Expected: `FAIL` — cannot find module `./client`

- [ ] **Step 3: Write `lib/reso/boards.ts`**

```typescript
export type BoardSlug = 'swfl_mls' | 'nabor';

export interface BoardConfig {
  slug: BoardSlug;
  label: string;
  baseUrl: string;
  token: string;
  live: boolean;
}

export function getBoardConfig(slug: BoardSlug): BoardConfig {
  const map: Record<BoardSlug, { label: string; urlKey: string; tokenKey: string }> = {
    swfl_mls: { label: 'SWFL MLS (Bridge)',  urlKey: 'RESO_BASE_URL_SWFL_MLS', tokenKey: 'RESO_TOKEN_SWFL_MLS' },
    nabor:    { label: 'NABOR (Trestle)',     urlKey: 'RESO_BASE_URL_NABOR',    tokenKey: 'RESO_TOKEN_NABOR' },
  };
  const { label, urlKey, tokenKey } = map[slug];
  const baseUrl = process.env[urlKey] ?? '';
  const token   = process.env[tokenKey] ?? '';
  return { slug, label, baseUrl, token, live: !!(baseUrl && token) };
}

export const ALL_BOARDS: BoardSlug[] = ['swfl_mls', 'nabor'];
```

- [ ] **Step 4: Write `lib/reso/client.ts`**

```typescript
import { getBoardConfig, type BoardSlug } from './boards';

export class ResoClient {
  private baseUrl: string;
  private token: string;

  constructor(slug: BoardSlug) {
    const cfg = getBoardConfig(slug);
    if (!cfg.baseUrl || !cfg.token) {
      throw new Error(`RESO board '${slug}' env vars not configured`);
    }
    this.baseUrl = cfg.baseUrl;
    this.token   = cfg.token;
  }

  async get<T>(resource: string, params: Record<string, string> = {}): Promise<T[]> {
    const results: T[] = [];
    let skip = 0;
    const top = 200;

    while (true) {
      const qs = new URLSearchParams({ $top: String(top), $skip: String(skip), ...params });
      const url = `${this.baseUrl}/${resource}?${qs}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`RESO ${resource} ${res.status}: ${await res.text()}`);
      const data = await res.json() as { value?: T[] } | T[];
      const page = Array.isArray(data) ? data : (data.value ?? []);
      results.push(...page as T[]);
      if (page.length < top) break;
      skip += top;
    }
    return results;
  }
}
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
bun test lib/reso/client.test.ts
```

Expected: all 3 pass

- [ ] **Step 6: Commit**

```bash
git add lib/reso/boards.ts lib/reso/client.ts lib/reso/client.test.ts
git commit -m "feat(mls): RESO OData client + board config"
```

---

## Task 3: Pull Agent Listings

**Files:**
- Create: `lib/reso/pull-agent-listings.ts`
- Create: `lib/reso/pull-agent-listings.test.ts`

**Interfaces:**
- Consumes: `new ResoClient(slug)` from `./client`; Supabase `SupabaseClient` from `@supabase/supabase-js`
- Produces: `pullAgentListings(supabase, slug, memberMlsId, userId): Promise<{ count: number; zips: string[] }>`

- [ ] **Step 1: Write failing tests**

Create `lib/reso/pull-agent-listings.test.ts`:

```typescript
import { test, expect, mock } from 'bun:test';

// Mock the ResoClient module so network never fires.
const mockGet = mock(async () => [
  { ListingKey: 'K1', ListPrice: 400000, PostalCode: '33901', StandardStatus: 'Active',  LivingArea: 1800 },
  { ListingKey: 'K2', ListPrice: 520000, ClosePrice: 510000, CloseDate: '2025-12-01', PostalCode: '33907', StandardStatus: 'Closed', LivingArea: 2200 },
]);
mock.module('./client', () => ({ ResoClient: class { get = mockGet; } }));

const mockUpsert = mock(() => ({ error: null }));
const mockSupabase = {
  schema: () => ({ from: () => ({ upsert: mockUpsert }) }),
};

test('upserts fetched listings and returns count + zips', async () => {
  const { pullAgentListings } = await import('./pull-agent-listings');
  const result = await pullAgentListings(mockSupabase as never, 'swfl_mls', 'AGT001', 'user-uuid-1');

  expect(result.count).toBe(2);
  expect(result.zips.sort()).toEqual(['33901', '33907']);
  expect(mockUpsert).toHaveBeenCalledTimes(1);

  const [rows] = mockUpsert.mock.calls[0] as [unknown[]];
  expect((rows as { listing_key: string }[]).find(r => r.listing_key === 'K1')).toBeDefined();
});

test('returns empty zips and count 0 when no listings found', async () => {
  mockGet.mockImplementation(async () => []);
  const { pullAgentListings } = await import('./pull-agent-listings');
  const result = await pullAgentListings(mockSupabase as never, 'swfl_mls', 'AGT999', 'user-uuid-2');
  expect(result.count).toBe(0);
  expect(result.zips).toEqual([]);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
bun test lib/reso/pull-agent-listings.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement `pull-agent-listings.ts`**

Create `lib/reso/pull-agent-listings.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { ResoClient } from './client';
import type { BoardSlug } from './boards';

interface ResoProperty {
  ListingKey: string;
  ListPrice?: number;
  ClosePrice?: number;
  ListingContractDate?: string;
  CloseDate?: string;
  DaysOnMarket?: number;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  LivingArea?: number;
  PostalCode?: string;
  StandardStatus?: string;
  PropertyType?: string;
}

export async function pullAgentListings(
  supabase: SupabaseClient,
  slug: BoardSlug,
  memberMlsId: string,
  userId: string,
): Promise<{ count: number; zips: string[] }> {
  const client = new ResoClient(slug);

  // Note: some boards don't support OData `in()` for enum fields.
  // Using OR chain is always safe per RESO DD 2.0.
  const properties = await client.get<ResoProperty>('Property', {
    '$filter': `ListAgentMlsId eq '${memberMlsId}' and (StandardStatus eq 'Active' or StandardStatus eq 'Closed' or StandardStatus eq 'Pending' or StandardStatus eq 'ActiveUnderContract')`,
    '$select': 'ListingKey,ListPrice,ClosePrice,ListingContractDate,CloseDate,DaysOnMarket,BedroomsTotal,BathroomsTotalInteger,LivingArea,PostalCode,StandardStatus,PropertyType',
  });

  if (properties.length === 0) return { count: 0, zips: [] };

  const rows = properties.map(p => ({
    listing_key:           p.ListingKey,
    user_id:               userId,
    board_slug:            slug,
    list_price:            p.ListPrice            ?? null,
    close_price:           p.ClosePrice           ?? null,
    listing_contract_date: p.ListingContractDate  ?? null,
    close_date:            p.CloseDate            ?? null,
    days_on_market:        p.DaysOnMarket         ?? null,
    bedrooms_total:        p.BedroomsTotal        ?? null,
    bathrooms_total:       p.BathroomsTotalInteger ?? null,
    living_area:           p.LivingArea           ?? null,
    postal_code:           p.PostalCode           ?? null,
    standard_status:       p.StandardStatus       ?? null,
    property_type:         p.PropertyType         ?? null,
    synced_at:             new Date().toISOString(),
  }));

  const { error } = await supabase
    .schema('data_lake')
    .from('user_mls_listings')
    .upsert(rows, { onConflict: 'listing_key,board_slug' });
  if (error) throw new Error(`upsert listings: ${error.message}`);

  const zips = [...new Set(rows.map(r => r.postal_code).filter((z): z is string => z !== null))];
  return { count: rows.length, zips };
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
bun test lib/reso/pull-agent-listings.test.ts
```

Expected: 2 pass

- [ ] **Step 5: Commit**

```bash
git add lib/reso/pull-agent-listings.ts lib/reso/pull-agent-listings.test.ts
git commit -m "feat(mls): pull-agent-listings with upsert"
```

---

## Task 4: Pull ZIP Stats

**Files:**
- Create: `lib/reso/pull-zip-stats.ts`
- Create: `lib/reso/pull-zip-stats.test.ts`

**Interfaces:**
- Consumes: `new ResoClient(slug)` from `./client`; `SupabaseClient`
- Produces: `pullZipStats(supabase, slug, userId, zips): Promise<void>` — writes to `data_lake.user_mls_stats`

- [ ] **Step 1: Write failing tests — focus on aggregation logic**

Create `lib/reso/pull-zip-stats.test.ts`:

```typescript
import { test, expect, mock } from 'bun:test';

const mockGet = mock(async () => [
  { PostalCode: '33901', ClosePrice: 300000, DaysOnMarket: 30, LivingArea: 1500, CloseDate: '2025-06-01' },
  { PostalCode: '33901', ClosePrice: 500000, DaysOnMarket: 10, LivingArea: 2500, CloseDate: '2025-08-01' },
  { PostalCode: '33907', ClosePrice: 450000, DaysOnMarket: 20, LivingArea: 2000, CloseDate: '2025-07-01' },
]);
mock.module('./client', () => ({ ResoClient: class { get = mockGet; } }));

const upsertedRows: unknown[] = [];
const mockSelect = mock(() => ({ count: 2, error: null }));
const mockSupabase = {
  schema: () => ({
    from: (table: string) => ({
      upsert: (rows: unknown[]) => { upsertedRows.push(...rows); return { error: null }; },
      select: () => ({
        eq: () => ({ eq: () => ({ eq: () => ({ eq: () => mockSelect() }) }) }),
      }),
    }),
  }),
};

test('computes median close price per ZIP', async () => {
  upsertedRows.length = 0;
  const { pullZipStats } = await import('./pull-zip-stats');
  await pullZipStats(mockSupabase as never, 'swfl_mls', 'user-1', ['33901', '33907']);

  const zip33901 = (upsertedRows as { postal_code: string; median_close_price: number }[])
    .find(r => r.postal_code === '33901');
  expect(zip33901?.median_close_price).toBe(400000); // median of [300000, 500000]

  const zip33907 = (upsertedRows as { postal_code: string; close_count: number }[])
    .find(r => r.postal_code === '33907');
  expect(zip33907?.close_count).toBe(1);
});

test('returns early when zips array is empty', async () => {
  upsertedRows.length = 0;
  const { pullZipStats } = await import('./pull-zip-stats');
  await pullZipStats(mockSupabase as never, 'swfl_mls', 'user-1', []);
  expect(upsertedRows.length).toBe(0);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
bun test lib/reso/pull-zip-stats.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement `pull-zip-stats.ts`**

Create `lib/reso/pull-zip-stats.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { ResoClient } from './client';
import type { BoardSlug } from './boards';

interface ResoStat {
  ClosePrice?: number;
  DaysOnMarket?: number;
  PostalCode?: string;
  LivingArea?: number;
  CloseDate?: string;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function pullZipStats(
  supabase: SupabaseClient,
  slug: BoardSlug,
  userId: string,
  zips: string[],
): Promise<void> {
  if (zips.length === 0) return;

  const client = new ResoClient(slug);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);
  const cutoffDate = cutoff.toISOString().split('T')[0];

  const zipFilter = zips.map(z => `PostalCode eq '${z}'`).join(' or ');
  const properties = await client.get<ResoStat>('Property', {
    '$filter': `(${zipFilter}) and CloseDate ge ${cutoffDate}`,
    '$select': 'ClosePrice,DaysOnMarket,PostalCode,LivingArea,CloseDate',
  });

  // Group by ZIP
  const byZip = new Map<string, ResoStat[]>();
  for (const p of properties) {
    if (!p.PostalCode) continue;
    const bucket = byZip.get(p.PostalCode) ?? [];
    bucket.push(p);
    byZip.set(p.PostalCode, bucket);
  }

  const rows = [];
  for (const [zip, listings] of byZip) {
    const closePrices = listings.flatMap(l => l.ClosePrice != null ? [l.ClosePrice] : []);
    const doms        = listings.flatMap(l => l.DaysOnMarket != null ? [l.DaysOnMarket] : []);
    const ppsf        = listings.flatMap(l =>
      l.ClosePrice && l.LivingArea && l.LivingArea > 0
        ? [l.ClosePrice / l.LivingArea]
        : [],
    );

    // Active count: agent's own actives in this ZIP (from already-synced user_mls_listings)
    const { count: activeCount } = await supabase
      .schema('data_lake')
      .from('user_mls_listings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('board_slug', slug)
      .eq('postal_code', zip)
      .eq('standard_status', 'Active');

    rows.push({
      user_id:            userId,
      board_slug:         slug,
      postal_code:        zip,
      period_months:      24,
      median_close_price: median(closePrices),
      avg_days_on_market: avg(doms),
      active_count:       activeCount ?? 0,
      close_count:        closePrices.length,
      avg_price_per_sqft: avg(ppsf),
      computed_at:        new Date().toISOString(),
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .schema('data_lake')
    .from('user_mls_stats')
    .upsert(rows, { onConflict: 'user_id,board_slug,postal_code' });
  if (error) throw new Error(`upsert stats: ${error.message}`);
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
bun test lib/reso/pull-zip-stats.test.ts
```

Expected: 2 pass

- [ ] **Step 5: Commit**

```bash
git add lib/reso/pull-zip-stats.ts lib/reso/pull-zip-stats.test.ts
git commit -m "feat(mls): pull-zip-stats with local aggregation"
```

---

## Task 5: Sync Orchestration

**Files:**
- Create: `lib/reso/sync.ts`
- Create: `lib/reso/sync.test.ts`

**Interfaces:**
- Consumes: `pullAgentListings`, `pullZipStats`, `new ResoClient(slug)`
- Produces: `syncConnection(supabase, connection): Promise<{ listings: number; zips: string[] }>`
- Produces: `Connection` type (exported for API routes)

- [ ] **Step 1: Write failing tests**

Create `lib/reso/sync.test.ts`:

```typescript
import { test, expect, mock } from 'bun:test';

// Mock all dependencies
mock.module('./pull-agent-listings', () => ({
  pullAgentListings: mock(async () => ({ count: 5, zips: ['33901', '33907'] })),
}));
mock.module('./pull-zip-stats', () => ({
  pullZipStats: mock(async () => {}),
}));

const mockClientGet = mock(async () => []);
mock.module('./client', () => ({ ResoClient: class { get = mockClientGet; } }));

const mockUpdate = mock(() => ({ error: null }));
const mockSupabase = {
  from: () => ({ update: () => ({ eq: () => mockUpdate() }) }),
  schema: () => ({ from: () => ({ upsert: mock(() => ({ error: null })), delete: () => ({ eq: () => ({ eq: () => ({ in: mock(() => ({ error: null })) }) }) }) }) }),
};

const baseConn = {
  id: 'conn-1',
  user_id: 'user-1',
  board_slug: 'swfl_mls' as const,
  member_mls_id: 'AGT001',
  last_entity_event_sequence: null,
};

test('first sync: calls pullAgentListings + pullZipStats + stores max sequence', async () => {
  // Return one event to seed the max sequence
  mockClientGet.mockImplementation(async () => [{ EntityEventSequence: 999 }]);
  mockUpdate.mockClear();

  const { syncConnection } = await import('./sync');
  const result = await syncConnection(mockSupabase as never, baseConn);

  expect(result.listings).toBe(5);
  expect(result.zips).toEqual(['33901', '33907']);
  // Should have updated with last_entity_event_sequence = 999
  expect(mockUpdate).toHaveBeenCalled();
});

test('incremental sync: returns 0 when no events since last sequence', async () => {
  mockClientGet.mockImplementation(async () => []); // no events
  mockUpdate.mockClear();

  const { syncConnection } = await import('./sync');
  const conn = { ...baseConn, last_entity_event_sequence: 999 };
  const result = await syncConnection(mockSupabase as never, conn);

  expect(result.listings).toBe(0);
  expect(result.zips).toEqual([]);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
bun test lib/reso/sync.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement `sync.ts`**

Create `lib/reso/sync.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { ResoClient } from './client';
import type { BoardSlug } from './boards';
import { pullAgentListings } from './pull-agent-listings';
import { pullZipStats } from './pull-zip-stats';

export interface Connection {
  id: string;
  user_id: string;
  board_slug: BoardSlug;
  member_mls_id: string;
  last_entity_event_sequence: number | null;
}

interface EntityEvent {
  EntityEventSequence: number;
  ResourceName?: string;
  EntityKey: string;
  EventType?: string;
}

interface ResoProperty {
  ListingKey: string;
  ListAgentMlsId?: string;
  ListPrice?: number;
  ClosePrice?: number;
  ListingContractDate?: string;
  CloseDate?: string;
  DaysOnMarket?: number;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  LivingArea?: number;
  PostalCode?: string;
  StandardStatus?: string;
  PropertyType?: string;
}

export async function syncConnection(
  supabase: SupabaseClient,
  conn: Connection,
): Promise<{ listings: number; zips: string[] }> {
  const { id, user_id, board_slug, member_mls_id, last_entity_event_sequence } = conn;

  // ── First sync: full pull ────────────────────────────────────────────────
  if (last_entity_event_sequence === null) {
    const result = await pullAgentListings(supabase, board_slug, member_mls_id, user_id);
    await pullZipStats(supabase, board_slug, user_id, result.zips);

    // Seed the sequence pointer so next sync is incremental
    const client = new ResoClient(board_slug);
    const events = await client.get<EntityEvent>('EntityEvent', {
      '$orderby': 'EntityEventSequence desc',
      '$top': '1',
      '$select': 'EntityEventSequence',
    });
    const maxSeq = events[0]?.EntityEventSequence ?? 0;

    await supabase
      .from('user_mls_connections')
      .update({ last_entity_event_sequence: maxSeq, last_synced_at: new Date().toISOString(), status: 'active' })
      .eq('id', id);

    return result;
  }

  // ── Incremental sync via EntityEventSequence ─────────────────────────────
  const client = new ResoClient(board_slug);
  const events = await client.get<EntityEvent>('EntityEvent', {
    '$filter': `EntityEventSequence gt ${last_entity_event_sequence} and ResourceName eq 'Property'`,
    '$select': 'EntityEventSequence,EntityKey,EventType',
    '$orderby': 'EntityEventSequence asc',
  });

  if (events.length === 0) {
    await supabase
      .from('user_mls_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', id);
    return { listings: 0, zips: [] };
  }

  const maxSeq      = Math.max(...events.map(e => e.EntityEventSequence));
  const changedKeys = [...new Set(events.map(e => e.EntityKey))];

  // Re-fetch changed listings that belong to this agent — batch in chunks of 50
  const CHUNK = 50;
  const allUpdated: ResoProperty[] = [];
  for (let i = 0; i < changedKeys.length; i += CHUNK) {
    const chunk     = changedKeys.slice(i, i + CHUNK);
    const keyFilter = chunk.map(k => `ListingKey eq '${k}'`).join(' or ');
    const props     = await client.get<ResoProperty>('Property', {
      '$filter': `(${keyFilter}) and ListAgentMlsId eq '${member_mls_id}'`,
      '$select': 'ListingKey,ListPrice,ClosePrice,ListingContractDate,CloseDate,DaysOnMarket,BedroomsTotal,BathroomsTotalInteger,LivingArea,PostalCode,StandardStatus,PropertyType',
    });
    allUpdated.push(...props);
  }

  // Keys that changed but weren't re-fetched = no longer this agent's listing
  const returnedKeys = new Set(allUpdated.map(p => p.ListingKey));
  const deletedKeys  = changedKeys.filter(k => !returnedKeys.has(k));
  if (deletedKeys.length > 0) {
    await supabase
      .schema('data_lake')
      .from('user_mls_listings')
      .delete()
      .eq('user_id', user_id)
      .eq('board_slug', board_slug)
      .in('listing_key', deletedKeys);
  }

  if (allUpdated.length > 0) {
    const rows = allUpdated.map(p => ({
      listing_key:           p.ListingKey,
      user_id,
      board_slug,
      list_price:            p.ListPrice            ?? null,
      close_price:           p.ClosePrice           ?? null,
      listing_contract_date: p.ListingContractDate  ?? null,
      close_date:            p.CloseDate            ?? null,
      days_on_market:        p.DaysOnMarket         ?? null,
      bedrooms_total:        p.BedroomsTotal        ?? null,
      bathrooms_total:       p.BathroomsTotalInteger ?? null,
      living_area:           p.LivingArea           ?? null,
      postal_code:           p.PostalCode           ?? null,
      standard_status:       p.StandardStatus       ?? null,
      property_type:         p.PropertyType         ?? null,
      synced_at:             new Date().toISOString(),
    }));
    const { error } = await supabase
      .schema('data_lake')
      .from('user_mls_listings')
      .upsert(rows, { onConflict: 'listing_key,board_slug' });
    if (error) throw new Error(`upsert listings: ${error.message}`);
  }

  // Recompute stats for affected ZIPs
  const affectedZips = [...new Set(allUpdated.map(p => p.PostalCode).filter((z): z is string => z != null))];
  if (affectedZips.length > 0) {
    await pullZipStats(supabase, board_slug, user_id, affectedZips);
  }

  await supabase
    .from('user_mls_connections')
    .update({ last_entity_event_sequence: maxSeq, last_synced_at: new Date().toISOString(), status: 'active' })
    .eq('id', id);

  return { listings: allUpdated.length, zips: affectedZips };
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
bun test lib/reso/sync.test.ts
```

Expected: 2 pass

- [ ] **Step 5: Run the full lib/reso suite**

```bash
bun test lib/reso/
```

Expected: all tests pass (client + pull-agent-listings + pull-zip-stats + sync)

- [ ] **Step 6: Commit**

```bash
git add lib/reso/sync.ts lib/reso/sync.test.ts
git commit -m "feat(mls): sync orchestration — first sync + EntityEvent incremental"
```

---

## Task 6: Connect API Route

**Files:**
- Create: `app/api/mls/connect/route.ts`
- Create: `app/api/mls/connect/route.test.ts`

**Interfaces:**
- Consumes: `getBoardConfig` from `@/lib/reso/boards`; `syncConnection` from `@/lib/reso/sync`
- Produces: `POST /api/mls/connect` → `{ connection, preview: { listing_count, zips } | null, queued?: true }`

- [ ] **Step 1: Write failing test**

Create `app/api/mls/connect/route.test.ts`:

```typescript
import { test, expect, mock } from 'bun:test';

mock.module('@/lib/reso/boards', () => ({
  getBoardConfig: mock((slug: string) => ({
    slug, label: 'SWFL MLS', baseUrl: 'https://sandbox', token: 'tok', live: true,
  })),
}));
mock.module('@/lib/reso/sync', () => ({
  syncConnection: mock(async () => ({ listings: 7, zips: ['33901'] })),
}));

const mockSingle    = mock(() => ({ data: { id: 'conn-1', user_id: 'uid-1', board_slug: 'swfl_mls', member_mls_id: 'AGT001', status: 'pending', last_entity_event_sequence: null }, error: null }));
const mockGetUser   = mock(() => ({ data: { user: { id: 'uid-1' } }, error: null }));
const mockSupabase  = {
  auth: { getUser: mockGetUser },
  from: () => ({ upsert: () => ({ select: () => ({ single: mockSingle }) }) }),
};
mock.module('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

test('POST returns preview on successful initial sync', async () => {
  const { POST } = await import('./route');
  const req = new Request('http://localhost/api/mls/connect', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify({ board_slug: 'swfl_mls', member_mls_id: 'AGT001' }),
  });
  const res = await POST(req);
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.preview.listing_count).toBe(7);
  expect(body.preview.zips).toEqual(['33901']);
});

test('POST returns 400 when member_mls_id is missing', async () => {
  const { POST } = await import('./route');
  const req = new Request('http://localhost/api/mls/connect', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify({ board_slug: 'swfl_mls' }),
  });
  const res = await POST(req);
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
bun test app/api/mls/connect/route.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the route**

Create `app/api/mls/connect/route.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getBoardConfig, type BoardSlug } from '@/lib/reso/boards';
import { syncConnection } from '@/lib/reso/sync';

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    req.headers.get('Authorization')?.replace('Bearer ', '') ?? '',
  );
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { board_slug?: string; member_mls_id?: string };
  const { board_slug, member_mls_id } = body;
  if (!board_slug || !member_mls_id) {
    return NextResponse.json({ error: 'board_slug and member_mls_id required' }, { status: 400 });
  }

  const config = getBoardConfig(board_slug as BoardSlug);

  const { data: conn, error: connError } = await supabase
    .from('user_mls_connections')
    .upsert(
      {
        user_id: user.id,
        board_slug,
        member_mls_id,
        status: 'pending',
        last_entity_event_sequence: null,
        error_message: null,
      },
      { onConflict: 'user_id,board_slug', ignoreDuplicates: false },
    )
    .select()
    .single();

  if (connError || !conn) {
    return NextResponse.json({ error: connError?.message ?? 'Failed to create connection' }, { status: 500 });
  }

  // Board not yet live — save the connection for when env vars land
  if (!config.live) {
    return NextResponse.json({ connection: conn, preview: null, queued: true });
  }

  try {
    const result = await syncConnection(supabase, {
      id: conn.id,
      user_id: user.id,
      board_slug: board_slug as BoardSlug,
      member_mls_id,
      last_entity_event_sequence: null,
    });
    return NextResponse.json({ connection: conn, preview: { listing_count: result.listings, zips: result.zips } });
  } catch (err) {
    await supabase
      .from('user_mls_connections')
      .update({ status: 'error', error_message: String(err) })
      .eq('id', conn.id);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
bun test app/api/mls/connect/route.test.ts
```

Expected: 2 pass

- [ ] **Step 5: Commit**

```bash
git add app/api/mls/connect/route.ts app/api/mls/connect/route.test.ts
git commit -m "feat(mls): POST /api/mls/connect"
```

---

## Task 7: Sync + Disconnect Routes

**Files:**
- Create: `app/api/mls/sync/route.ts`
- Create: `app/api/mls/sync/route.test.ts`
- Create: `app/api/mls/disconnect/route.ts`
- Create: `app/api/mls/disconnect/route.test.ts`

**Interfaces:**
- Consumes: `syncConnection` from `@/lib/reso/sync`
- Produces: `POST /api/mls/sync` (user-triggered), `GET /api/mls/sync` (cron), `DELETE /api/mls/disconnect`

- [ ] **Step 1: Write failing tests for sync route**

Create `app/api/mls/sync/route.test.ts`:

```typescript
import { test, expect, mock } from 'bun:test';

mock.module('@/lib/reso/sync', () => ({
  syncConnection: mock(async () => ({ listings: 3, zips: ['33901'] })),
}));

const mockConn     = { id: 'conn-1', user_id: 'uid-1', board_slug: 'swfl_mls', member_mls_id: 'AGT1', last_entity_event_sequence: 100 };
const mockSingle   = mock(() => ({ data: mockConn, error: null }));
const mockGetUser  = mock(() => ({ data: { user: { id: 'uid-1' } }, error: null }));
const mockSelect   = mock(() => ({ data: [mockConn], error: null }));
const mockSupabase = {
  auth: { getUser: mockGetUser },
  from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ single: mockSingle }) }) }),
    select_all: () => ({ eq: mockSelect }),
    update: () => ({ eq: mock(() => ({})) }),
  }),
};
mock.module('@supabase/supabase-js', () => ({ createClient: () => mockSupabase }));

test('POST syncs user connection and returns ok', async () => {
  const { POST } = await import('./route');
  const req = new Request('http://localhost/api/mls/sync', {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection_id: 'conn-1' }),
  });
  const res = await POST(req);
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.ok).toBe(true);
});

test('GET returns 403 without CRON_SECRET', async () => {
  const { GET } = await import('./route');
  const req = new Request('http://localhost/api/mls/sync', { method: 'GET' });
  const res = await GET(req);
  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Write failing test for disconnect route**

Create `app/api/mls/disconnect/route.test.ts`:

```typescript
import { test, expect, mock } from 'bun:test';

const mockDelete   = mock(() => ({ error: null }));
const mockGetUser  = mock(() => ({ data: { user: { id: 'uid-1' } }, error: null }));
const mockConn     = { id: 'conn-1', user_id: 'uid-1', board_slug: 'swfl_mls' };
const mockSingle   = mock(() => ({ data: mockConn, error: null }));
const mockSupabase = {
  auth: { getUser: mockGetUser },
  from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ single: mockSingle }) }) }),
    delete: () => ({ eq: () => ({ error: null }) }),
  }),
  schema: () => ({ from: () => ({ delete: () => ({ eq: () => ({ eq: () => mockDelete() }) }) }) }),
};
mock.module('@supabase/supabase-js', () => ({ createClient: () => mockSupabase }));

test('DELETE removes connection and returns ok', async () => {
  const { DELETE } = await import('./route');
  const req = new Request('http://localhost/api/mls/disconnect', {
    method: 'DELETE',
    headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection_id: 'conn-1' }),
  });
  const res = await DELETE(req);
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.ok).toBe(true);
});
```

- [ ] **Step 3: Run to confirm both fail**

```bash
bun test app/api/mls/sync/route.test.ts app/api/mls/disconnect/route.test.ts
```

Expected: FAIL — modules not found

- [ ] **Step 4: Implement `app/api/mls/sync/route.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { syncConnection, type Connection } from '@/lib/reso/sync';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// User-triggered sync
export async function POST(req: Request) {
  const supabase = makeSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    req.headers.get('Authorization')?.replace('Bearer ', '') ?? '',
  );
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { connection_id } = await req.json() as { connection_id: string };
  const { data: conn, error } = await supabase
    .from('user_mls_connections')
    .select()
    .eq('id', connection_id)
    .eq('user_id', user.id)
    .single();
  if (error || !conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  try {
    const result = await syncConnection(supabase, conn as Connection);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await supabase
      .from('user_mls_connections')
      .update({ status: 'error', error_message: String(err) })
      .eq('id', conn.id);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Vercel cron fan-out
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = makeSupabase();
  const { data: connections, error } = await supabase
    .from('user_mls_connections')
    .select()
    .eq('status', 'active');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const conn of connections ?? []) {
    try {
      await syncConnection(supabase, conn as Connection);
      results.push({ id: conn.id, ok: true });
    } catch (err) {
      results.push({ id: conn.id, ok: false, error: String(err) });
      await supabase
        .from('user_mls_connections')
        .update({ status: 'error', error_message: String(err) })
        .eq('id', conn.id);
    }
  }
  return NextResponse.json({ synced: results.length, results });
}
```

- [ ] **Step 5: Implement `app/api/mls/disconnect/route.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function DELETE(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    req.headers.get('Authorization')?.replace('Bearer ', '') ?? '',
  );
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { connection_id } = await req.json() as { connection_id: string };
  const { data: conn, error } = await supabase
    .from('user_mls_connections')
    .select('id, user_id, board_slug')
    .eq('id', connection_id)
    .eq('user_id', user.id)
    .single();
  if (error || !conn) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete data_lake rows first
  await supabase.schema('data_lake').from('user_mls_listings')
    .delete().eq('user_id', user.id).eq('board_slug', conn.board_slug);
  await supabase.schema('data_lake').from('user_mls_stats')
    .delete().eq('user_id', user.id).eq('board_slug', conn.board_slug);

  // Delete the connection record
  await supabase.from('user_mls_connections').delete().eq('id', connection_id);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run all route tests**

```bash
bun test app/api/mls/
```

Expected: all 5 tests pass (connect + sync POST + sync GET forbidden + disconnect)

- [ ] **Step 7: Commit**

```bash
git add app/api/mls/sync/route.ts app/api/mls/sync/route.test.ts app/api/mls/disconnect/route.ts app/api/mls/disconnect/route.test.ts
git commit -m "feat(mls): sync + disconnect API routes"
```

---

## Task 8: Vercel Cron Config

**Files:**
- Modify: `vercel.json` (create if absent)

**Interfaces:**
- Produces: Vercel cron hits `GET /api/mls/sync` every 6 hours with `Authorization: Bearer {CRON_SECRET}`

- [ ] **Step 1: Check if vercel.json exists**

```bash
ls vercel.json 2>/dev/null && echo "exists" || echo "absent"
```

- [ ] **Step 2a: If absent — create it**

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/mls/sync",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

- [ ] **Step 2b: If present — add the crons entry**

Open `vercel.json` and merge in:

```json
"crons": [
  {
    "path": "/api/mls/sync",
    "schedule": "0 */6 * * *"
  }
]
```

(Append to existing `crons` array if one already exists; don't overwrite.)

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat(mls): add Vercel cron for /api/mls/sync every 6h"
```

- [ ] **Step 4: Add CRON_SECRET to Vercel env (manual)**

In the Vercel dashboard (or via `vercel env add`):
- Key: `CRON_SECRET`
- Value: any random string ≥32 chars (e.g. `openssl rand -hex 32` output)
- Environments: Production + Preview

Also add it to `.env.local` for local testing:
```
CRON_SECRET=<same value>
```

---

## Task 9: Settings UI — /settings/mls

**Files:**
- Create: `app/settings/mls/page.tsx`
- Create: `app/settings/mls/mls-settings-client.tsx`

**Interfaces:**
- Consumes: `POST /api/mls/connect`, `POST /api/mls/sync`, `DELETE /api/mls/disconnect`, `GET /api/mls/status` (read connection state — add to sync route or a separate status endpoint below)
- Produces: `/settings/mls` — three-screen Connect → Preview → Status UI

- [ ] **Step 1: Add a GET /api/mls/status route for loading existing connection**

Add to `app/api/mls/sync/route.ts` — insert before the existing `GET` handler and rename the cron handler (or create a separate status route). **Better: add a separate status route.**

Create `app/api/mls/status/route.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { ALL_BOARDS, getBoardConfig } from '@/lib/reso/boards';

export async function GET(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    req.headers.get('Authorization')?.replace('Bearer ', '') ?? '',
  );
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: connections } = await supabase
    .from('user_mls_connections')
    .select()
    .eq('user_id', user.id);

  const boards = ALL_BOARDS.map(slug => ({
    slug,
    label: getBoardConfig(slug).label,
    live: getBoardConfig(slug).live,
    connection: connections?.find(c => c.board_slug === slug) ?? null,
  }));

  return NextResponse.json({ boards });
}
```

- [ ] **Step 2: Create the server page shell**

Create `app/settings/mls/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { MlsSettingsClient } from './mls-settings-client';

export const metadata: Metadata = {
  title: 'MLS Connection — SWFL Data Gulf',
};

export default function MlsSettingsPage() {
  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <MlsSettingsClient />
    </main>
  );
}
```

- [ ] **Step 3: Implement the client component**

Create `app/settings/mls/mls-settings-client.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/auth/use-session';

type BoardSlug = 'swfl_mls' | 'nabor';

interface BoardStatus {
  slug: BoardSlug;
  label: string;
  live: boolean;
  connection: {
    id: string;
    status: 'pending' | 'active' | 'error';
    last_synced_at: string | null;
    error_message: string | null;
    member_mls_id: string;
  } | null;
}

type Screen = 'connect' | 'preview' | 'status';

interface Preview {
  listing_count: number;
  zips: string[];
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export function MlsSettingsClient() {
  const { session } = useSession();
  const token = session?.access_token ?? '';

  const [boards, setBoards]       = useState<BoardStatus[]>([]);
  const [screen, setScreen]       = useState<Screen>('connect');
  const [selectedSlug, setSlug]   = useState<BoardSlug>('swfl_mls');
  const [mlsId, setMlsId]         = useState('');
  const [preview, setPreview]     = useState<Preview | null>(null);
  const [activeConn, setConn]     = useState<BoardStatus['connection'] | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    const res = await fetch('/api/mls/status', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const { boards: data } = await res.json() as { boards: BoardStatus[] };
    setBoards(data);
    const active = data.flatMap(b => b.connection ? [b] : []).find(b => b.connection?.status === 'active');
    if (active?.connection) {
      setConn(active.connection);
      setSlug(active.slug);
      setScreen('status');
    }
  }, [token]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/mls/connect', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ board_slug: selectedSlug, member_mls_id: mlsId.trim() }),
      });
      const body = await res.json() as { preview: Preview | null; queued?: boolean; error?: string };
      if (!res.ok) { setError(body.error ?? 'Connection failed'); return; }
      if (body.queued) {
        setError("This board isn't live yet — we'll notify you when it's ready.");
        return;
      }
      setPreview(body.preview);
      setScreen('preview');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    await loadStatus();
    setScreen('status');
  }

  async function handleRefresh() {
    if (!activeConn) return;
    setLoading(true);
    setError(null);
    try {
      await fetch('/api/mls/sync', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ connection_id: activeConn.id }),
      });
      await loadStatus();
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!activeConn) return;
    setLoading(true);
    try {
      await fetch('/api/mls/disconnect', {
        method: 'DELETE',
        headers: authHeaders(token),
        body: JSON.stringify({ connection_id: activeConn.id }),
      });
      setConn(null);
      setPreview(null);
      setMlsId('');
      setScreen('connect');
    } finally {
      setLoading(false);
    }
  }

  if (screen === 'connect') return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Connect your MLS</h1>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Board</label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={selectedSlug}
            onChange={e => setSlug(e.target.value as BoardSlug)}
          >
            {boards.map(b => (
              <option key={b.slug} value={b.slug}>
                {b.label}{!b.live ? ' (coming soon)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Your MLS ID — this is on your license
          </label>
          <input
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="e.g. 123456789"
            value={mlsId}
            onChange={e => setMlsId(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          className="w-full bg-black text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          disabled={loading || !mlsId.trim()}
          onClick={handleConnect}
        >
          {loading ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </div>
  );

  if (screen === 'preview' && preview) return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Confirm your data</h1>
      <div className="rounded-lg border p-4 space-y-2 text-sm">
        <p>We found <strong>{preview.listing_count}</strong> listings in your history.</p>
        {preview.zips.length > 0 && (
          <p>Covering ZIPs: {preview.zips.join(', ')}</p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          className="flex-1 bg-black text-white rounded-md px-4 py-2 text-sm font-medium"
          onClick={handleConfirm}
        >
          Confirm
        </button>
        <button
          className="flex-1 border rounded-md px-4 py-2 text-sm"
          onClick={() => setScreen('connect')}
        >
          Back
        </button>
      </div>
    </div>
  );

  if (screen === 'status' && activeConn) return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">MLS Connected</h1>
      <div className="rounded-lg border p-4 space-y-2 text-sm text-gray-700">
        <p><span className="font-medium">Board:</span> {boards.find(b => b.slug === selectedSlug)?.label}</p>
        <p><span className="font-medium">MLS ID:</span> {activeConn.member_mls_id}</p>
        <p>
          <span className="font-medium">Status:</span>{' '}
          <span className={activeConn.status === 'error' ? 'text-red-600' : 'text-green-700'}>
            {activeConn.status}
          </span>
        </p>
        {activeConn.last_synced_at && (
          <p><span className="font-medium">Last synced:</span> {new Date(activeConn.last_synced_at).toLocaleString()}</p>
        )}
        {activeConn.error_message && (
          <p className="text-red-600">{activeConn.error_message}</p>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button
          className="flex-1 border rounded-md px-4 py-2 text-sm disabled:opacity-50"
          disabled={loading}
          onClick={handleRefresh}
        >
          {loading ? 'Syncing…' : 'Refresh now'}
        </button>
        <button
          className="flex-1 border border-red-300 text-red-600 rounded-md px-4 py-2 text-sm disabled:opacity-50"
          disabled={loading}
          onClick={handleDisconnect}
        >
          Disconnect
        </button>
      </div>
    </div>
  );

  return <div className="text-sm text-gray-500">Loading…</div>;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
bunx next build 2>&1 | tail -20
```

Expected: no TypeScript errors on the new files; build succeeds

- [ ] **Step 5: Commit**

```bash
git add app/settings/mls/page.tsx app/settings/mls/mls-settings-client.tsx app/api/mls/status/route.ts
git commit -m "feat(mls): /settings/mls UI — Connect → Preview → Status"
```

---

## Task 10: Full Test Suite + SESSION_LOG

**Files:**
- Modify: `SESSION_LOG.md`

- [ ] **Step 1: Run all new tests**

```bash
bun test lib/reso/ app/api/mls/
```

Expected: all tests pass (client + pull-agent-listings + pull-zip-stats + sync + connect + sync-route + disconnect)

- [ ] **Step 2: Run full build**

```bash
bunx next build
```

Expected: clean build, no type errors

- [ ] **Step 3: Update SESSION_LOG.md**

Prepend a new entry at the top of `SESSION_LOG.md`:

```markdown
## 2026-06-25 (main) — feat(mls): RESO DD 2.0 MLS integration Phase 1

Static Bearer tokens per board (env vars), users provide MemberMlsId only. Three lib/reso/ modules: OData client with pagination, pull-agent-listings (VOW Property feed), pull-zip-stats (local aggregation). Sync via EntityEventSequence (RCP-27 incremental). API routes: POST /api/mls/connect, POST+GET /api/mls/sync (user + Vercel cron every 6h), DELETE /api/mls/disconnect, GET /api/mls/status. UI at /settings/mls (3 screens: Connect → Preview → Status). data_lake.user_mls_listings + user_mls_stats + public.user_mls_connections with RLS. bun test all pass. Brain integration (Lane 2 FactChip) is Phase 2.
```

- [ ] **Step 4: Push**

```bash
node scripts/safe-push.mjs
```

---

## Phase 2 Stub (not in this plan)

After board approval is live and Phase 1 is verified in prod:
- Inject `user_mls_stats` rows into the assistant context as Lane 2 assertions when a connection is `active`
- Add `FactChip` citation with label `[Your MLS listings — SWFL MLS]`
- Collision detection when lake housing stats overlap same ZIP + period
