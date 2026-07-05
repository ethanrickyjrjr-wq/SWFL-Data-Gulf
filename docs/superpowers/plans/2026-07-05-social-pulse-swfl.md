# SWFL Social Pulse (P1 scan+store, P2 digest+page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 10 tasks, 18 files, keywords: migration, schema, architecture

**Goal:** A scheduled scan of SWFL real-estate Instagram engagement (posts + hashtag reach) stored in Supabase, distilled into a deterministic weekly digest, published on an anonymous `/pulse` page.

**Architecture:** A pure-DI scan core (mirrors `pollEngagement`) fed by an empty-tolerant SteadyAPI client, invoked by a Bun adapter script under a GHA cron (daily bootstrap → 2×/week). Digest math is deterministic code over the stored snapshots; an LLM writes narrative only from computed figures. The public page is a server component reading the latest digest row.

**Tech Stack:** TypeScript, Bun (tests + scripts), Supabase (service-role client), Next.js App Router, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-05-social-pulse-swfl-design.md` · **Vendor contract:** `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` · **Check:** `social_pulse_swfl_live_verify`

## Global Constraints

- Vendor name ("SteadyAPI") NEVER appears in any user-facing string; product source label is exactly `live Instagram scan (MM/DD/YYYY)`.
- API key env var: `PHOTOS_API` (existing secret; same subscription as `lib/listings/steadyapi.ts`). Starter tier = 10,000 req/month; this build's steady state ≈ 640/month.
- Instagram media is never rehosted or hot-linked: store/render permalinks, captions, counts only. CDN URLs from the API are signed + expiring — do not persist them.
- Empty-tolerant everywhere (Operation Dumbo Drop posture): missing key / non-200 / empty body → empty result, log, never throw from the client; a term that yields nothing never fails a run.
- No `data_lake.*` writes; all tables are `public.social_pulse_*` product cache.
- Numbers are computed in code; the LLM narrative may only restate figures present in the digest JSON.
- Layout uses `h-full`/`dvh`, never `h-screen`. No blockquotes/tables in product copy.
- Verify app-surface changes with `bunx next build` (never bare `npx tsc`).
- Live vendor calls happen ONLY in the operator-run live-verify and the real cron — never in tests or CI.
- Commit after each task; stage explicit paths only (`git add <paths>`, never `-A`). Do not push without operator confirmation.
- The pre-push gate does not require vocab/pack work here (no packs touched); lockfile untouched (no new deps).

---

### Task 1: Migration + generated types

**Files:**
- Create: `scripts/social-pulse/migrate.mts`
- Modify: `database-generated.types.ts` (via `bun scripts/gen-supabase-types.ts` — generated, do not hand-edit)

**Interfaces:**
- Produces: tables `public.social_pulse_scans` (identity `id`), `public.social_pulse_posts` (PK `(post_id, scan_id)`), `public.social_pulse_hashtags` (PK `(name, scan_id)`), `public.social_pulse_digest` (PK `week` text like `2026-W28`). Later tasks read/write them through the typed service-role client.

- [ ] **Step 1: Write the idempotent migration script** (pattern: `scripts/migrate-email-events.mts`)

```ts
// scripts/social-pulse/migrate.mts
// Idempotent migration for SWFL Social Pulse (spec 2026-07-05-social-pulse-swfl-design.md).
// Run: bun scripts/social-pulse/migrate.mts
import { readFileSync } from "fs";
import { parse } from "dotenv";

const secrets = parse(readFileSync(".dlt/secrets.toml", "utf-8"));
const connStr =
  secrets["destination.credentials"] ??
  `postgresql://${secrets["destination__credentials__username"] ?? "postgres"}:${secrets["destination__credentials__password"]}@${secrets["destination__credentials__host"]}/${secrets["destination__credentials__database"]}?sslmode=require`;

const db = new Bun.SQL(connStr);

await db.query(`
  CREATE TABLE IF NOT EXISTS public.social_pulse_scans (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ran_at         timestamptz NOT NULL DEFAULT now(),
    terms_scanned  int         NOT NULL DEFAULT 0,
    requests_spent int         NOT NULL DEFAULT 0,
    status         text        NOT NULL DEFAULT 'ok'
      CHECK (status IN ('ok','partial','dry'))
  );
`);

await db.query(`
  CREATE TABLE IF NOT EXISTS public.social_pulse_posts (
    post_id       text        NOT NULL,
    scan_id       bigint      NOT NULL REFERENCES public.social_pulse_scans(id) ON DELETE CASCADE,
    shortcode     text        NOT NULL,
    permalink     text        NOT NULL,
    username      text        NOT NULL,
    is_verified   boolean     NOT NULL DEFAULT false,
    taken_at      timestamptz,
    media_type    int,
    product_type  text,
    caption       text,
    like_count    bigint,
    comment_count bigint,
    view_count    bigint,
    reshare_count bigint,
    matched_term  text        NOT NULL,
    area          text        NOT NULL,
    PRIMARY KEY (post_id, scan_id)
  );
`);
await db.query(
  `CREATE INDEX IF NOT EXISTS social_pulse_posts_scan_idx ON public.social_pulse_posts (scan_id, area);`,
);

await db.query(`
  CREATE TABLE IF NOT EXISTS public.social_pulse_hashtags (
    name                  text   NOT NULL,
    scan_id               bigint NOT NULL REFERENCES public.social_pulse_scans(id) ON DELETE CASCADE,
    media_count           bigint,
    formatted_media_count text,
    PRIMARY KEY (name, scan_id)
  );
`);

await db.query(`
  CREATE TABLE IF NOT EXISTS public.social_pulse_digest (
    week      text        PRIMARY KEY,
    digest    jsonb       NOT NULL,
    narrative text,
    scan_id   bigint      REFERENCES public.social_pulse_scans(id),
    built_at  timestamptz NOT NULL DEFAULT now()
  );
`);

// RLS: service-role only (server components + cron write/read via service role).
for (const t of [
  "social_pulse_scans",
  "social_pulse_posts",
  "social_pulse_hashtags",
  "social_pulse_digest",
]) {
  await db.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
}

const [{ count }] = await db.query(
  `SELECT count(*)::int AS count FROM information_schema.tables
   WHERE table_schema='public' AND table_name LIKE 'social_pulse_%';`,
);
console.log(`social_pulse tables present: ${count} (expected 4)`);
process.exit(count === 4 ? 0 : 1);
```

- [ ] **Step 2: Run the migration**

Run: `bun scripts/social-pulse/migrate.mts`
Expected: `social_pulse tables present: 4 (expected 4)`, exit 0. Re-run once to prove idempotency (same output).

- [ ] **Step 3: Regenerate Supabase types**

Run: `bun scripts/gen-supabase-types.ts`
Expected: `database-generated.types.ts` gains `social_pulse_scans` / `social_pulse_posts` / `social_pulse_hashtags` / `social_pulse_digest` entries. Verify: `grep -c social_pulse database-generated.types.ts` ≥ 4.

- [ ] **Step 4: Commit**

```bash
git add scripts/social-pulse/migrate.mts database-generated.types.ts
git commit -m "feat(social-pulse): tables + generated types (P1 task 1)"
```

---

### Task 2: Terms config

**Files:**
- Create: `lib/social-pulse/terms.ts`
- Test: `lib/social-pulse/terms.test.ts`

**Interfaces:**
- Produces: `type PulseArea = "cape-coral" | "naples" | "fort-myers" | "charlotte" | "bonita-estero" | "lehigh" | "swfl"`; `interface PulseTerm { term: string; kind: "hashtag" | "search"; area: PulseArea }`; `export const PULSE_TERMS: PulseTerm[]` (14 entries); `export const AREA_LABELS: Record<PulseArea, string>`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/social-pulse/terms.test.ts
import { test, expect } from "bun:test";
import { PULSE_TERMS, AREA_LABELS } from "./terms";

test("term set is within the spec budget (12-16) and every area bucket is covered", () => {
  expect(PULSE_TERMS.length).toBeGreaterThanOrEqual(12);
  expect(PULSE_TERMS.length).toBeLessThanOrEqual(16);
  const areas = new Set(PULSE_TERMS.map((t) => t.area));
  for (const area of Object.keys(AREA_LABELS)) expect(areas.has(area as never)).toBe(true);
});

test("hashtag terms carry no # prefix (the API takes bare names) and terms are unique", () => {
  for (const t of PULSE_TERMS) expect(t.term.startsWith("#")).toBe(false);
  expect(new Set(PULSE_TERMS.map((t) => t.term)).size).toBe(PULSE_TERMS.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/social-pulse/terms.test.ts`
Expected: FAIL — cannot resolve `./terms`.

- [ ] **Step 3: Write the config**

```ts
// lib/social-pulse/terms.ts
// Fixed v1 scan slots (spec §1). Areas are the digest's slice buckets.
export type PulseArea =
  | "cape-coral"
  | "naples"
  | "fort-myers"
  | "charlotte"
  | "bonita-estero"
  | "lehigh"
  | "swfl";

export interface PulseTerm {
  term: string; // bare hashtag name or search phrase (no '#')
  kind: "hashtag" | "search";
  area: PulseArea;
}

export const AREA_LABELS: Record<PulseArea, string> = {
  "cape-coral": "Cape Coral",
  naples: "Naples",
  "fort-myers": "Fort Myers",
  charlotte: "Punta Gorda & Charlotte",
  "bonita-estero": "Bonita Springs & Estero",
  lehigh: "Lehigh Acres",
  swfl: "SWFL-wide",
};

export const PULSE_TERMS: PulseTerm[] = [
  { term: "swflrealestate", kind: "hashtag", area: "swfl" },
  { term: "swfl", kind: "hashtag", area: "swfl" },
  { term: "floridarealestate", kind: "hashtag", area: "swfl" },
  { term: "capecoralrealestate", kind: "hashtag", area: "cape-coral" },
  { term: "capecoral", kind: "hashtag", area: "cape-coral" },
  { term: "naplesrealestate", kind: "hashtag", area: "naples" },
  { term: "naplesfl", kind: "hashtag", area: "naples" },
  { term: "fortmyersrealestate", kind: "hashtag", area: "fort-myers" },
  { term: "fortmyers", kind: "hashtag", area: "fort-myers" },
  { term: "puntagorda", kind: "hashtag", area: "charlotte" },
  { term: "bonitasprings", kind: "hashtag", area: "bonita-estero" },
  { term: "lehighacres", kind: "hashtag", area: "lehigh" },
  { term: "cape coral real estate", kind: "search", area: "cape-coral" },
  { term: "naples florida homes", kind: "search", area: "naples" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/social-pulse/terms.test.ts` — Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/social-pulse/terms.ts lib/social-pulse/terms.test.ts
git commit -m "feat(social-pulse): fixed v1 term set with area buckets (P1 task 2)"
```

---

### Task 3: SteadyAPI Instagram client (empty-tolerant)

**Files:**
- Create: `lib/social-pulse/types.ts`, `lib/social-pulse/steady-client.ts`
- Test: `lib/social-pulse/steady-client.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (fetch + env only).
- Produces:
  - `interface PulsePost { postId: string; shortcode: string; permalink: string; username: string; isVerified: boolean; takenAt: string | null; mediaType: number | null; productType: string | null; caption: string | null; likeCount: number | null; commentCount: number | null; viewCount: number | null; reshareCount: number | null }`
  - `interface PulseHashtag { name: string; mediaCount: number | null; formattedMediaCount: string | null }`
  - `searchPosts(term: string, paginationToken?: string, deps?: { fetchFn?: typeof fetch }): Promise<{ posts: PulsePost[]; paginationToken: string | null }>`
  - `searchHashtags(term: string, deps?: { fetchFn?: typeof fetch }): Promise<PulseHashtag[]>`

- [ ] **Step 1: Write the failing test** (mock `fetchFn`; response shapes verbatim from the vendor note)

```ts
// lib/social-pulse/steady-client.test.ts
import { test, expect } from "bun:test";
import { searchPosts, searchHashtags } from "./steady-client";

const OK_SEARCH = {
  meta: { version: "v1.0", status: 200, pagination_token: "tok-abc" },
  body: [
    {
      id: "3744744884516299440",
      shortcode: "DP4AaHIDiKw",
      media_type: 1,
      product_type: "feed",
      taken_at: 1760628398,
      caption: "casting call",
      like_count: 56129,
      comment_count: 2644,
      view_count: null,
      permalink: "https://www.instagram.com/p/DP4AaHIDiKw/",
      user: { id: "56844315148", username: "mrbeastcasting", is_verified: true },
    },
  ],
};

function mockFetch(status: number, json?: unknown): typeof fetch {
  return (async () =>
    new Response(json === undefined ? "" : JSON.stringify(json), { status })) as typeof fetch;
}

test("searchPosts normalizes a vendor body and surfaces the pagination token", async () => {
  process.env.PHOTOS_API = "test-key";
  const { posts, paginationToken } = await searchPosts("capecoral", undefined, {
    fetchFn: mockFetch(200, OK_SEARCH),
  });
  expect(paginationToken).toBe("tok-abc");
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    postId: "3744744884516299440",
    shortcode: "DP4AaHIDiKw",
    permalink: "https://www.instagram.com/p/DP4AaHIDiKw/",
    username: "mrbeastcasting",
    isVerified: true,
    likeCount: 56129,
    mediaType: 1,
  });
  expect(posts[0].takenAt).toBe(new Date(1760628398 * 1000).toISOString());
});

test("empty-tolerant: non-200, bad body, and missing key all yield empty results", async () => {
  process.env.PHOTOS_API = "test-key";
  expect((await searchPosts("x", undefined, { fetchFn: mockFetch(429) })).posts).toEqual([]);
  expect((await searchPosts("x", undefined, { fetchFn: mockFetch(200, { nope: 1 }) })).posts).toEqual([]);
  delete process.env.PHOTOS_API;
  expect((await searchPosts("x")).posts).toEqual([]);
  expect(await searchHashtags("x")).toEqual([]);
});

test("searchHashtags maps name + media_count", async () => {
  process.env.PHOTOS_API = "test-key";
  const tags = await searchHashtags("investing", {
    fetchFn: mockFetch(200, {
      meta: { status: 200 },
      body: [{ id: 1, name: "investingtips", media_count: 1826347, formatted_media_count: "1.8M" }],
    }),
  });
  expect(tags).toEqual([
    { name: "investingtips", mediaCount: 1826347, formattedMediaCount: "1.8M" },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/social-pulse/steady-client.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement types + client**

```ts
// lib/social-pulse/types.ts
export interface PulsePost {
  postId: string;
  shortcode: string;
  permalink: string;
  username: string;
  isVerified: boolean;
  takenAt: string | null; // ISO
  mediaType: number | null; // 1 image · 2 video/clips · 8 carousel (vendor contract)
  productType: string | null; // feed | clips | carousel_container
  caption: string | null;
  likeCount: number | null;
  commentCount: number | null;
  viewCount: number | null;
  reshareCount: number | null;
}

export interface PulseHashtag {
  name: string;
  mediaCount: number | null;
  formattedMediaCount: string | null;
}
```

```ts
// lib/social-pulse/steady-client.ts
//
// Instagram public-data client for the Social Pulse scan.
// Contract: docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md (crawled 07/05/2026).
// Empty-tolerant: no key, non-200, quota, or malformed body → empty result, never throws.
// Pagination tokens expire in 15 min and pagination sessions cap at 20 req/15 min —
// callers keep walks short (scan uses ≤2 pages per term).
import type { PulsePost, PulseHashtag } from "./types";

const BASE = "https://api.steadyapi.com/v1/instagram";

// Cloudflare in front of the API blocks default UAs; browser-like headers work
// (same finding as lib/listings/steadyapi.ts, verified live 06/30).
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://steadyapi.com",
  Referer: "https://steadyapi.com/",
};

interface Deps {
  fetchFn?: typeof fetch;
}

async function getBody(url: string, deps?: Deps): Promise<unknown[] | null> {
  const key = process.env.PHOTOS_API;
  if (!key) return null;
  const fetchFn = deps?.fetchFn ?? fetch;
  try {
    const res = await fetchFn(url, {
      headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { body?: unknown };
    return Array.isArray(json?.body) ? (json.body as unknown[]) : null;
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function normalizePost(raw: Record<string, unknown>): PulsePost | null {
  const postId = raw.id == null ? "" : String(raw.id);
  const shortcode = str(raw.shortcode);
  if (!postId || !shortcode) return null;
  const user = (raw.user ?? {}) as Record<string, unknown>;
  const takenAt = num(raw.taken_at);
  return {
    postId,
    shortcode,
    permalink: str(raw.permalink) ?? `https://www.instagram.com/p/${shortcode}/`,
    username: str(user.username) ?? "",
    isVerified: user.is_verified === true,
    takenAt: takenAt ? new Date(takenAt * 1000).toISOString() : null,
    mediaType: num(raw.media_type),
    productType: str(raw.product_type),
    caption: str(raw.caption),
    likeCount: num(raw.like_count),
    commentCount: num(raw.comment_count),
    viewCount: num(raw.view_count),
    reshareCount: num(raw.reshare_count),
  };
}

/** GET /v1/instagram/search — posts matching a term. Weight 2 per call. */
export async function searchPosts(
  term: string,
  paginationToken?: string,
  deps?: Deps,
): Promise<{ posts: PulsePost[]; paginationToken: string | null }> {
  const key = process.env.PHOTOS_API;
  if (!key) return { posts: [], paginationToken: null };
  const fetchFn = deps?.fetchFn ?? fetch;
  const url = new URL(`${BASE}/search`);
  url.searchParams.set("search", term);
  if (paginationToken) url.searchParams.set("pagination_token", paginationToken);
  try {
    const res = await fetchFn(url.toString(), {
      headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { posts: [], paginationToken: null };
    const json = (await res.json()) as {
      meta?: { pagination_token?: unknown };
      body?: unknown;
    };
    const body = Array.isArray(json?.body) ? json.body : [];
    const posts = body
      .map((r) => normalizePost(r as Record<string, unknown>))
      .filter((p): p is PulsePost => p !== null);
    return { posts, paginationToken: str(json?.meta?.pagination_token) };
  } catch {
    return { posts: [], paginationToken: null };
  }
}

/** GET /v1/instagram/hashtags/search — tag reach (media_count). Weight 1. */
export async function searchHashtags(term: string, deps?: Deps): Promise<PulseHashtag[]> {
  const url = new URL(`${BASE}/hashtags/search`);
  url.searchParams.set("search", term);
  const body = await getBody(url.toString(), deps);
  if (!body) return [];
  return body
    .map((r) => {
      const raw = r as Record<string, unknown>;
      const name = str(raw.name);
      if (!name) return null;
      return {
        name,
        mediaCount: num(raw.media_count),
        formattedMediaCount: str(raw.formatted_media_count),
      };
    })
    .filter((t): t is PulseHashtag => t !== null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/social-pulse/steady-client.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/social-pulse/types.ts lib/social-pulse/steady-client.ts lib/social-pulse/steady-client.test.ts
git commit -m "feat(social-pulse): empty-tolerant Instagram search/hashtag client (P1 task 3)"
```

---

### Task 4: Scan core (pure DI)

**Files:**
- Create: `lib/social-pulse/scan.ts`
- Test: `lib/social-pulse/scan.test.ts`

**Interfaces:**
- Consumes: `PULSE_TERMS`/`PulseTerm` (task 2), `PulsePost`/`PulseHashtag` (task 3).
- Produces:
  - `interface ScanRowWriter { insertScan(meta: { status: "ok" | "partial" | "dry" }): Promise<number>; finishScan(scanId: number, patch: { terms_scanned: number; requests_spent: number; status: string }): Promise<void>; insertPosts(rows: PostInsert[]): Promise<void>; insertHashtags(rows: HashtagInsert[]): Promise<void> }`
  - `type PostInsert = { post_id: string; scan_id: number; shortcode: string; permalink: string; username: string; is_verified: boolean; taken_at: string | null; media_type: number | null; product_type: string | null; caption: string | null; like_count: number | null; comment_count: number | null; view_count: number | null; reshare_count: number | null; matched_term: string; area: string }`
  - `type HashtagInsert = { name: string; scan_id: number; media_count: number | null; formatted_media_count: string | null }`
  - `runScan(deps: { terms: PulseTerm[]; searchPosts: typeof searchPosts; searchHashtags: typeof searchHashtags; writer: ScanRowWriter; pagesPerTerm?: number; log?: (m: string) => void }): Promise<{ scanId: number; posts: number; hashtags: number; requests: number }>`
- Dedupe rule: within one scan, a `post_id` seen under two terms keeps the FIRST match (insert order by `PULSE_TERMS` order).

- [ ] **Step 1: Write the failing test**

```ts
// lib/social-pulse/scan.test.ts
import { test, expect } from "bun:test";
import { runScan, type ScanRowWriter, type PostInsert, type HashtagInsert } from "./scan";
import type { PulseTerm } from "./terms";
import type { PulsePost } from "./types";

const post = (id: string, likes: number): PulsePost => ({
  postId: id,
  shortcode: `sc${id}`,
  permalink: `https://www.instagram.com/p/sc${id}/`,
  username: "u",
  isVerified: false,
  takenAt: null,
  mediaType: 1,
  productType: "feed",
  caption: null,
  likeCount: likes,
  commentCount: 0,
  viewCount: null,
  reshareCount: null,
});

function memWriter() {
  const posts: PostInsert[] = [];
  const hashtags: HashtagInsert[] = [];
  const writer: ScanRowWriter = {
    insertScan: async () => 7,
    finishScan: async () => {},
    insertPosts: async (rows) => void posts.push(...rows),
    insertHashtags: async (rows) => void hashtags.push(...rows),
  };
  return { writer, posts, hashtags };
}

const TERMS: PulseTerm[] = [
  { term: "capecoral", kind: "hashtag", area: "cape-coral" },
  { term: "naplesfl", kind: "hashtag", area: "naples" },
];

test("scans every term, pages up to pagesPerTerm, dedupes cross-term posts, counts requests", async () => {
  const { writer, posts, hashtags } = memWriter();
  const result = await runScan({
    terms: TERMS,
    // page 1 returns a token, page 2 returns none; naplesfl repeats post "a".
    searchPosts: async (term, tok) =>
      tok
        ? { posts: [post(`${term}-p2`, 5)], paginationToken: null }
        : { posts: [post("a", 10), post(`${term}-p1`, 9)], paginationToken: "t1" },
    searchHashtags: async (term) => [
      { name: term, mediaCount: 100, formattedMediaCount: "100" },
    ],
    writer,
    pagesPerTerm: 2,
  });
  expect(result.scanId).toBe(7);
  // post "a" kept once (first term wins its area); 2 terms × (p1 unique + p2) + shared "a"
  const ids = posts.map((p) => p.post_id);
  expect(ids.filter((i) => i === "a")).toHaveLength(1);
  expect(posts.find((p) => p.post_id === "a")!.area).toBe("cape-coral");
  expect(ids).toContain("capecoral-p1");
  expect(ids).toContain("naplesfl-p2");
  expect(hashtags).toHaveLength(2);
  // requests: 2 search pages × 2 terms (weight 2 each) + 2 hashtag lookups (weight 1) = 4*2+2 = 10
  expect(result.requests).toBe(10);
});

test("a term whose search returns empty never fails the run (empty-tolerant)", async () => {
  const { writer, posts } = memWriter();
  const result = await runScan({
    terms: TERMS,
    searchPosts: async () => ({ posts: [], paginationToken: null }),
    searchHashtags: async () => [],
    writer,
  });
  expect(result.posts).toBe(0);
  expect(posts).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/social-pulse/scan.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement the core**

```ts
// lib/social-pulse/scan.ts
// Pure DI scan core (pattern: pollEngagement in lib/social). The adapter script
// wires the real client + Supabase writer; tests wire memory fakes.
import type { PulseTerm } from "./terms";
import type { searchPosts as SearchPostsFn, searchHashtags as SearchHashtagsFn } from "./steady-client";

export interface PostInsert {
  post_id: string;
  scan_id: number;
  shortcode: string;
  permalink: string;
  username: string;
  is_verified: boolean;
  taken_at: string | null;
  media_type: number | null;
  product_type: string | null;
  caption: string | null;
  like_count: number | null;
  comment_count: number | null;
  view_count: number | null;
  reshare_count: number | null;
  matched_term: string;
  area: string;
}

export interface HashtagInsert {
  name: string;
  scan_id: number;
  media_count: number | null;
  formatted_media_count: string | null;
}

export interface ScanRowWriter {
  insertScan(meta: { status: "ok" | "partial" | "dry" }): Promise<number>;
  finishScan(
    scanId: number,
    patch: { terms_scanned: number; requests_spent: number; status: string },
  ): Promise<void>;
  insertPosts(rows: PostInsert[]): Promise<void>;
  insertHashtags(rows: HashtagInsert[]): Promise<void>;
}

const SEARCH_WEIGHT = 2; // vendor contract: /search = 2
const HASHTAG_WEIGHT = 1;

export async function runScan(deps: {
  terms: PulseTerm[];
  searchPosts: typeof SearchPostsFn;
  searchHashtags: typeof SearchHashtagsFn;
  writer: ScanRowWriter;
  pagesPerTerm?: number;
  log?: (m: string) => void;
}): Promise<{ scanId: number; posts: number; hashtags: number; requests: number }> {
  const { terms, writer } = deps;
  const pages = deps.pagesPerTerm ?? 2;
  const log = deps.log ?? (() => {});
  const scanId = await writer.insertScan({ status: "ok" });

  const seen = new Set<string>();
  const postRows: PostInsert[] = [];
  const tagRows: HashtagInsert[] = [];
  let requests = 0;

  for (const t of terms) {
    let token: string | undefined;
    for (let page = 0; page < pages; page++) {
      const { posts, paginationToken } = await deps.searchPosts(t.term, token);
      requests += SEARCH_WEIGHT;
      for (const p of posts) {
        if (seen.has(p.postId)) continue;
        seen.add(p.postId);
        postRows.push({
          post_id: p.postId,
          scan_id: scanId,
          shortcode: p.shortcode,
          permalink: p.permalink,
          username: p.username,
          is_verified: p.isVerified,
          taken_at: p.takenAt,
          media_type: p.mediaType,
          product_type: p.productType,
          caption: p.caption,
          like_count: p.likeCount,
          comment_count: p.commentCount,
          view_count: p.viewCount,
          reshare_count: p.reshareCount,
          matched_term: t.term,
          area: t.area,
        });
      }
      if (!paginationToken) break;
      token = paginationToken;
    }
    if (t.kind === "hashtag") {
      const tags = await deps.searchHashtags(t.term);
      requests += HASHTAG_WEIGHT;
      // keep only the exact tag (the endpoint returns fuzzy matches)
      const exact = tags.find((x) => x.name === t.term);
      if (exact) {
        tagRows.push({
          name: exact.name,
          scan_id: scanId,
          media_count: exact.mediaCount,
          formatted_media_count: exact.formattedMediaCount,
        });
      }
    }
    log(`${t.term}: ${postRows.length} cumulative posts`);
  }

  if (postRows.length) await writer.insertPosts(postRows);
  if (tagRows.length) await writer.insertHashtags(tagRows);
  await writer.finishScan(scanId, {
    terms_scanned: terms.length,
    requests_spent: requests,
    status: "ok",
  });
  return { scanId, posts: postRows.length, hashtags: tagRows.length, requests };
}
```

- [ ] **Step 4: Run test — the hashtag count in test 1 expects 2 rows but the core keeps only exact-name matches.** The fake returns `name: term`, so both survive. Expected: PASS (2 tests). If the request-count assertion fails, recount: 2 terms × 2 pages × 2 + 2 × 1 = 10.

- [ ] **Step 5: Commit**

```bash
git add lib/social-pulse/scan.ts lib/social-pulse/scan.test.ts
git commit -m "feat(social-pulse): pure DI scan core with cross-term dedupe (P1 task 4)"
```

---

### Task 5: Adapter script + GHA cron

**Files:**
- 🔴 Create: `scripts/social-pulse/scan.mts`, `.github/workflows/social-pulse-scan.yml`

**Interfaces:**
- Consumes: `runScan` + writer types (task 4), `PULSE_TERMS` (task 2), client (task 3), `createServiceRoleClient` (`utils/supabase/service-role.ts`).
- Produces: the cron entry point later tasks extend with digest building (task 7 modifies THIS file).

- [ ] **Step 1: Write the adapter** (pattern: `scripts/social/poll-engagement.mts` — DRY_RUN-aware, exit 0 clean / 1 fatal)

```ts
// scripts/social-pulse/scan.mts
// SOCIAL PULSE SCANNER. Standalone Bun process the GHA cron invokes.
// DRY_RUN=true reads + logs what it WOULD insert and never writes.
// Exit: clean (incl. zero posts) → 0; top-level fatal (env, client) → 1.
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { PULSE_TERMS } from "@/lib/social-pulse/terms";
import { searchPosts, searchHashtags } from "@/lib/social-pulse/steady-client";
import { runScan, type ScanRowWriter } from "@/lib/social-pulse/scan";

const DRY_RUN = process.env.DRY_RUN === "true";

async function main() {
  if (!process.env.PHOTOS_API) throw new Error("PHOTOS_API is not set");
  const supabase = createServiceRoleClient();

  const writer: ScanRowWriter = DRY_RUN
    ? {
        insertScan: async () => {
          console.log("[dry] would insert scan row");
          return -1;
        },
        finishScan: async (_id, patch) => console.log("[dry] finish", JSON.stringify(patch)),
        insertPosts: async (rows) => console.log(`[dry] would insert ${rows.length} posts`),
        insertHashtags: async (rows) => console.log(`[dry] would insert ${rows.length} hashtags`),
      }
    : {
        insertScan: async (meta) => {
          const { data, error } = await supabase
            .from("social_pulse_scans")
            .insert({ status: meta.status })
            .select("id")
            .single();
          if (error) throw new Error(`insertScan: ${error.message}`);
          return data.id;
        },
        finishScan: async (scanId, patch) => {
          const { error } = await supabase
            .from("social_pulse_scans")
            .update(patch)
            .eq("id", scanId);
          if (error) throw new Error(`finishScan: ${error.message}`);
        },
        insertPosts: async (rows) => {
          const { error } = await supabase.from("social_pulse_posts").insert(rows);
          if (error) throw new Error(`insertPosts: ${error.message}`);
        },
        insertHashtags: async (rows) => {
          const { error } = await supabase.from("social_pulse_hashtags").insert(rows);
          if (error) throw new Error(`insertHashtags: ${error.message}`);
        },
      };

  const result = await runScan({
    terms: PULSE_TERMS,
    searchPosts,
    searchHashtags,
    writer,
    pagesPerTerm: 2,
    log: (m) => console.log(m),
  });
  console.log(
    `scan ${DRY_RUN ? "(dry) " : ""}done: scan_id=${result.scanId} posts=${result.posts} hashtags=${result.hashtags} weighted_requests=${result.requests}`,
  );
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Dry-run locally against mocks is covered by task 4 tests; verify the adapter compiles**

Run: `bun build --target=bun scripts/social-pulse/scan.mts --outdir /tmp/pulse-build 2>&1 | tail -2` (or `bunx tsc --noEmit -p tsconfig.json` if the repo's config covers scripts).
Expected: no type errors. Do NOT run it live (paid API — operator-run only).

- [ ] **Step 3: Write the workflow**

```yaml
# .github/workflows/social-pulse-scan.yml
#
# SWFL Social Pulse scan (spec: docs/superpowers/specs/2026-07-05-social-pulse-swfl-design.md).
# BOOTSTRAP CADENCE: daily until 07/26/2026 (3 weeks from first live scan) to build
# week-over-week history fast. THEN flip the cron to '0 11 * * 1,4' (Mon/Thu) —
# that flip is a one-line edit here, tracked by check social_pulse_cadence_flip.
name: social-pulse-scan
on:
  schedule:
    - cron: "0 11 * * *" # 11:00 UTC daily (bootstrap — see header note)
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Log without writing"
        type: boolean
        default: false

jobs:
  scan:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Run pulse scan
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          PHOTOS_API: ${{ secrets.PHOTOS_API }}
          DRY_RUN: ${{ inputs.dry_run == true && 'true' || 'false' }}
        run: bun scripts/social-pulse/scan.mts
```

- [ ] **Step 4: Confirm the secrets exist** (never ask the operator for keys — they're in gh secrets)

Run: `gh secret list -R ethanrickyjrjr-wq/SWFL-Data-Gulf | grep -E "PHOTOS_API|SUPABASE_URL|SUPABASE_SERVICE_KEY"`
Expected: all three listed. If `PHOTOS_API` is missing from the repo secrets (it may only exist in Vercel), STOP and flag to the operator — `gh secret set` is step 1, workflow wiring is step 2 (pre-push gate 3).

- [ ] **Step 5: Open the cadence-flip check and commit**

```bash
node scripts/check.mjs open social-pulse-swfl social_pulse_cadence_flip "Flip social-pulse-scan cron to Mon/Thu after 3-week bootstrap (due 07/26/2026)"
git add scripts/social-pulse/scan.mts .github/workflows/social-pulse-scan.yml
git commit -m "feat(social-pulse): scan adapter + GHA cron, daily bootstrap with dated Mon/Thu flip (P1 task 5)"
```

---

### Task 6: Topic rules

**Files:**
- Create: `lib/social-pulse/topics.ts`
- Test: `lib/social-pulse/topics.test.ts`

**Interfaces:**
- Produces: `type PulseTopic = "waterfront" | "new-construction" | "open-house" | "market-stats" | "lifestyle" | "listing-tour" | "other"`; `classifyTopic(caption: string | null): PulseTopic`; `TOPIC_LABELS: Record<PulseTopic, string>`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/social-pulse/topics.test.ts
import { test, expect } from "bun:test";
import { classifyTopic } from "./topics";

test("keyword rules bucket captions; first-match priority; null → other", () => {
  expect(classifyTopic("Gulf-access canal home with private dock")).toBe("waterfront");
  expect(classifyTopic("New construction spec home, CO in hand")).toBe("new-construction");
  expect(classifyTopic("OPEN HOUSE Sunday 1-3pm!")).toBe("open-house");
  expect(classifyTopic("Median price in Cape Coral rose again — market update")).toBe("market-stats");
  expect(classifyTopic("Best beaches and sunsets in Naples living")).toBe("lifestyle");
  expect(classifyTopic("Just listed! Take the full walkthrough tour")).toBe("listing-tour");
  expect(classifyTopic("random words")).toBe("other");
  expect(classifyTopic(null)).toBe("other");
  // priority: waterfront beats listing-tour when both match
  expect(classifyTopic("Just listed waterfront pool home tour")).toBe("waterfront");
});
```

- [ ] **Step 2: Run to verify FAIL**, `bun test lib/social-pulse/topics.test.ts`.

- [ ] **Step 3: Implement**

```ts
// lib/social-pulse/topics.ts
// v1 caption topic buckets (spec §2). Deterministic keyword rules, first match wins.
export type PulseTopic =
  | "waterfront"
  | "new-construction"
  | "open-house"
  | "market-stats"
  | "lifestyle"
  | "listing-tour"
  | "other";

export const TOPIC_LABELS: Record<PulseTopic, string> = {
  waterfront: "Waterfront & canal",
  "new-construction": "New construction",
  "open-house": "Open house",
  "market-stats": "Market stats",
  lifestyle: "Lifestyle & community",
  "listing-tour": "Listing tours",
  other: "Other",
};

const RULES: [PulseTopic, RegExp][] = [
  ["waterfront", /\b(waterfront|gulf[- ]access|canal|dock|boat|sailboat|intersecting)\b/i],
  ["new-construction", /\b(new construction|new build|spec home|builder|under construction|\bCO\b)\b/i],
  ["open-house", /\bopen house\b/i],
  ["market-stats", /\b(median|market (update|report|stats)|inventory|days on market|price(s)? (rose|fell|dropped))\b/i],
  ["lifestyle", /\b(beach(es)?|sunset|lifestyle|living|community|downtown|farmers market)\b/i],
  ["listing-tour", /\b(just listed|new listing|walkthrough|tour|listed at)\b/i],
];

export function classifyTopic(caption: string | null): PulseTopic {
  if (!caption) return "other";
  for (const [topic, re] of RULES) if (re.test(caption)) return topic;
  return "other";
}
```

- [ ] **Step 4: Run to verify PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/social-pulse/topics.ts lib/social-pulse/topics.test.ts
git commit -m "feat(social-pulse): deterministic caption topic rules (P2 task 6)"
```

---

### Task 7: Digest math + persistence in the scan adapter

**Files:**
- Create: `lib/social-pulse/digest.ts`
- Test: `lib/social-pulse/digest.test.ts`
- 🔴 Modify: `scripts/social-pulse/scan.mts` (append digest build after a non-dry scan)

**Interfaces:**
- Consumes: `PostInsert`/`HashtagInsert` shapes (task 4), `classifyTopic` (task 6), `AREA_LABELS` (task 2).
- Produces:
  - `interface PulseDigest { week: string; asOf: string; scanId: number; benchmarks: { area: string; label: string; medianLikes: number; topQuartileLikes: number; postCount: number }[]; formats: { format: "image" | "video" | "carousel" | "unknown"; share: number; medianLikes: number }[]; topPosts: { area: string; permalink: string; username: string; likeCount: number; commentCount: number; format: string; captionPreview: string | null }[]; hashtags: { name: string; mediaCount: number | null; deltaFromPrev: number | null }[]; topics: { topic: string; label: string; postCount: number; medianLikes: number }[] }`
  - `computeDigest(input: { scanId: number; asOf: string; week: string; posts: PostInsertLike[]; hashtags: HashtagInsertLike[]; prevHashtags?: { name: string; media_count: number | null }[] }): PulseDigest` — `PostInsertLike`/`HashtagInsertLike` are the DB row shapes minus `scan_id`.
  - `medianOf(nums: number[]): number` and `quantileOf(nums: number[], q: number): number` (exported for tests; nearest-rank method).
  - `isoWeekOf(date: Date): string` → `"2026-W28"`.
- Format mapping (vendor contract): `media_type` 1 → image, 2 → video, 8 → carousel, else unknown.
- `topPosts`: top 3 per area by `like_count` (nulls excluded), `captionPreview` = first 140 chars.

- [ ] **Step 1: Write the failing test**

```ts
// lib/social-pulse/digest.test.ts
import { test, expect } from "bun:test";
import { computeDigest, medianOf, quantileOf, isoWeekOf } from "./digest";

const p = (id: string, area: string, likes: number | null, mediaType = 1, caption: string | null = null) => ({
  post_id: id,
  shortcode: id,
  permalink: `https://www.instagram.com/p/${id}/`,
  username: "u",
  is_verified: false,
  taken_at: null,
  media_type: mediaType,
  product_type: null,
  caption,
  like_count: likes,
  comment_count: 1,
  view_count: null,
  reshare_count: null,
  matched_term: "t",
  area,
});

test("median and quantile use nearest-rank and tolerate empty input", () => {
  expect(medianOf([1, 2, 3, 4])).toBe(2);
  expect(medianOf([5])).toBe(5);
  expect(medianOf([])).toBe(0);
  expect(quantileOf([10, 20, 30, 40], 0.75)).toBe(30);
});

test("isoWeekOf pins the ISO week", () => {
  expect(isoWeekOf(new Date("2026-07-05T12:00:00Z"))).toBe("2026-W27");
});

test("computeDigest: benchmarks per area + swfl-wide, format split, top posts, hashtag deltas", () => {
  const digest = computeDigest({
    scanId: 7,
    asOf: "07/05/2026",
    week: "2026-W27",
    posts: [
      p("a", "cape-coral", 100, 1, "gulf access canal home"),
      p("b", "cape-coral", 300, 2),
      p("c", "naples", 50, 8),
      p("d", "naples", null), // null likes excluded from math
    ],
    hashtags: [{ name: "capecoral", media_count: 1100, formatted_media_count: "1.1K" }],
    prevHashtags: [{ name: "capecoral", media_count: 1000 }],
  });
  const swfl = digest.benchmarks.find((b) => b.area === "swfl")!;
  expect(swfl.postCount).toBe(3);
  expect(swfl.medianLikes).toBe(100);
  const cc = digest.benchmarks.find((b) => b.area === "cape-coral")!;
  expect(cc.topQuartileLikes).toBe(300);
  expect(digest.formats.find((f) => f.format === "video")!.medianLikes).toBe(300);
  expect(digest.topPosts.filter((t) => t.area === "cape-coral")[0].likeCount).toBe(300);
  expect(digest.hashtags[0].deltaFromPrev).toBe(100);
  expect(digest.topics.find((t) => t.topic === "waterfront")!.postCount).toBe(1);
});
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement**

```ts
// lib/social-pulse/digest.ts
// Deterministic digest math (spec §2). NO LLM here — every figure a user sees
// is computed in this file from stored scan rows.
import { classifyTopic, TOPIC_LABELS, type PulseTopic } from "./topics";
import { AREA_LABELS, type PulseArea } from "./terms";

type PostInsertLike = {
  post_id: string;
  permalink: string;
  username: string;
  media_type: number | null;
  caption: string | null;
  like_count: number | null;
  comment_count: number | null;
  area: string;
};
type HashtagInsertLike = { name: string; media_count: number | null };

export interface PulseDigest {
  week: string;
  asOf: string; // MM/DD/YYYY, stated once by the renderer
  scanId: number;
  benchmarks: { area: string; label: string; medianLikes: number; topQuartileLikes: number; postCount: number }[];
  formats: { format: "image" | "video" | "carousel" | "unknown"; share: number; medianLikes: number }[];
  topPosts: { area: string; permalink: string; username: string; likeCount: number; commentCount: number; format: string; captionPreview: string | null }[];
  hashtags: { name: string; mediaCount: number | null; deltaFromPrev: number | null }[];
  topics: { topic: string; label: string; postCount: number; medianLikes: number }[];
}

export function medianOf(nums: number[]): number {
  return quantileOf(nums, 0.5);
}

/** Nearest-rank quantile; empty input → 0. */
export function quantileOf(nums: number[], q: number): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[rank - 1];
}

export function isoWeekOf(date: Date): string {
  // ISO-8601 week number (UTC)
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function formatOf(mediaType: number | null): "image" | "video" | "carousel" | "unknown" {
  if (mediaType === 1) return "image";
  if (mediaType === 2) return "video";
  if (mediaType === 8) return "carousel";
  return "unknown";
}

export function computeDigest(input: {
  scanId: number;
  asOf: string;
  week: string;
  posts: PostInsertLike[];
  hashtags: HashtagInsertLike[];
  prevHashtags?: HashtagInsertLike[];
}): PulseDigest {
  const withLikes = input.posts.filter((p) => typeof p.like_count === "number");
  const likesOf = (list: PostInsertLike[]) => list.map((p) => p.like_count as number);

  // "swfl"-term posts belong only to the overall entry appended below — including
  // them as a per-area bucket would shadow the true SWFL-wide benchmark in the dedupe.
  const areas = [...new Set(input.posts.map((p) => p.area))].filter((a) => a !== "swfl");
  const benchmarks = [
    ...areas.map((area) => {
      const rows = withLikes.filter((p) => p.area === area);
      return {
        area,
        label: AREA_LABELS[area as PulseArea] ?? area,
        medianLikes: medianOf(likesOf(rows)),
        topQuartileLikes: quantileOf(likesOf(rows), 0.75),
        postCount: rows.length,
      };
    }),
    {
      area: "swfl",
      label: AREA_LABELS.swfl,
      medianLikes: medianOf(likesOf(withLikes)),
      topQuartileLikes: quantileOf(likesOf(withLikes), 0.75),
      postCount: withLikes.length,
    },
  ].filter((b, i, all) => all.findIndex((x) => x.area === b.area) === i);

  const formats = (["image", "video", "carousel", "unknown"] as const)
    .map((format) => {
      const rows = withLikes.filter((p) => formatOf(p.media_type) === format);
      return {
        format,
        share: withLikes.length ? rows.length / withLikes.length : 0,
        medianLikes: medianOf(likesOf(rows)),
      };
    })
    .filter((f) => f.share > 0);

  const topPosts = [...areas, "swfl"].flatMap((area) =>
    withLikes
      .filter((p) => p.area === area)
      .sort((a, b) => (b.like_count as number) - (a.like_count as number))
      .slice(0, 3)
      .map((p) => ({
        area,
        permalink: p.permalink,
        username: p.username,
        likeCount: p.like_count as number,
        commentCount: p.comment_count ?? 0,
        format: formatOf(p.media_type),
        captionPreview: p.caption ? p.caption.slice(0, 140) : null,
      })),
  );

  const prev = new Map((input.prevHashtags ?? []).map((h) => [h.name, h.media_count]));
  const hashtags = input.hashtags.map((h) => {
    const prevCount = prev.get(h.name);
    return {
      name: h.name,
      mediaCount: h.media_count,
      deltaFromPrev:
        typeof h.media_count === "number" && typeof prevCount === "number"
          ? h.media_count - prevCount
          : null,
    };
  });

  const byTopic = new Map<PulseTopic, PostInsertLike[]>();
  for (const p of withLikes) {
    const topic = classifyTopic(p.caption);
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), p]);
  }
  const topics = [...byTopic.entries()]
    .filter(([topic]) => topic !== "other")
    .map(([topic, rows]) => ({
      topic,
      label: TOPIC_LABELS[topic],
      postCount: rows.length,
      medianLikes: medianOf(likesOf(rows)),
    }))
    .sort((a, b) => b.postCount - a.postCount);

  return { week: input.week, asOf: input.asOf, scanId: input.scanId, benchmarks, formats, topPosts, hashtags, topics };
}
```

- [ ] **Step 4: Run to verify PASS**, `bun test lib/social-pulse/digest.test.ts`.

- [ ] **Step 5: Wire digest persistence into the adapter.** In `scripts/social-pulse/scan.mts`, after the `runScan` call (non-dry only), add:

```ts
  if (!DRY_RUN && result.scanId > 0) {
    const { computeDigest, isoWeekOf } = await import("@/lib/social-pulse/digest");
    const now = new Date();
    const week = isoWeekOf(now);
    const asOf = `${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}/${now.getUTCFullYear()}`;

    const { data: posts } = await supabase
      .from("social_pulse_posts")
      .select("post_id, permalink, username, media_type, caption, like_count, comment_count, area")
      .eq("scan_id", result.scanId);
    const { data: hashtags } = await supabase
      .from("social_pulse_hashtags")
      .select("name, media_count")
      .eq("scan_id", result.scanId);

    // previous week's hashtag counts for deltas (latest digest before this week)
    const { data: prevDigest } = await supabase
      .from("social_pulse_digest")
      .select("digest")
      .lt("week", week)
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle();
    const prevHashtags = (prevDigest?.digest as { hashtags?: { name: string; mediaCount: number | null }[] } | null)
      ?.hashtags?.map((h) => ({ name: h.name, media_count: h.mediaCount })) ?? [];

    const digest = computeDigest({
      scanId: result.scanId,
      asOf,
      week,
      posts: posts ?? [],
      hashtags: hashtags ?? [],
      prevHashtags,
    });
    const { error } = await supabase
      .from("social_pulse_digest")
      .upsert({ week, digest, scan_id: result.scanId, built_at: now.toISOString() }, { onConflict: "week" });
    if (error) throw new Error(`digest upsert: ${error.message}`);
    console.log(`digest upserted for ${week} (scan ${result.scanId})`);
  }
```

- [ ] **Step 6: Verify compile + full suite, commit**

Run: `bun test lib/social-pulse/` — Expected: all social-pulse tests PASS.

```bash
git add lib/social-pulse/digest.ts lib/social-pulse/digest.test.ts scripts/social-pulse/scan.mts
git commit -m "feat(social-pulse): deterministic digest math + weekly upsert in scan adapter (P2 task 7)"
```

---

### Task 8: Narrative writer (LLM, figures-only)

**Files:**
- Create: `lib/social-pulse/narrative.ts`
- Test: `lib/social-pulse/narrative.test.ts`
- 🔴 Modify: `scripts/social-pulse/scan.mts` (set `narrative` on the digest upsert)

**Interfaces:**
- Consumes: `PulseDigest` (task 7); `getAnthropic("other")` from `@/refinery/agents/anthropic.mts` (existing — same import as `lib/email/social-calendar/build-canvas-fill.ts`).
- Produces: `buildNarrative(digest: PulseDigest, deps?: { complete?: (system: string, user: string) => Promise<string> }): Promise<string | null>` — DI'd `complete` so tests never touch the network; `narrativeSystem(): string` exported for prompt tests.

- [ ] **Step 1: Write the failing test**

```ts
// lib/social-pulse/narrative.test.ts
import { test, expect } from "bun:test";
import { buildNarrative, narrativeSystem } from "./narrative";
import type { PulseDigest } from "./digest";

const digest: PulseDigest = {
  week: "2026-W27",
  asOf: "07/05/2026",
  scanId: 7,
  benchmarks: [{ area: "swfl", label: "SWFL-wide", medianLikes: 100, topQuartileLikes: 300, postCount: 3 }],
  formats: [{ format: "video", share: 0.5, medianLikes: 300 }],
  topPosts: [],
  hashtags: [],
  topics: [],
};

test("system prompt forbids invention and bans the vendor name", () => {
  const sys = narrativeSystem();
  expect(sys).toContain("ONLY the figures");
  expect(sys.toLowerCase()).not.toContain("steadyapi");
});

test("buildNarrative passes digest JSON to the completer and returns its text", async () => {
  let sawUser = "";
  const text = await buildNarrative(digest, {
    complete: async (_sys, user) => {
      sawUser = user;
      return "Reels led the week.";
    },
  });
  expect(text).toBe("Reels led the week.");
  expect(sawUser).toContain('"medianLikes":100');
});

test("a completer failure yields null, never a throw (digest still publishes)", async () => {
  const text = await buildNarrative(digest, {
    complete: async () => {
      throw new Error("model down");
    },
  });
  expect(text).toBeNull();
});
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement**

```ts
// lib/social-pulse/narrative.ts
// Weekly narrative over the computed digest. The model restates figures; it never
// computes or invents one. Failure → null (the digest publishes without prose).
import type { PulseDigest } from "./digest";

export function narrativeSystem(): string {
  return [
    "You write a 3-5 sentence weekly brief about Southwest Florida real-estate social media engagement.",
    "You may use ONLY the figures present in the JSON the user provides — never compute, extrapolate, or invent a number.",
    "Attribute figures to a live Instagram scan of public posts; never name any internal system or data vendor.",
    "Plain text only: no blockquotes, no tables, no hashtags, no emojis, no marketing adjectives (no 'boost', 'supercharge', 'unlock').",
    "State the as-of date exactly once, as given in asOf.",
  ].join("\n");
}

async function defaultComplete(system: string, user: string): Promise<string> {
  const { getAnthropic } = await import("@/refinery/agents/anthropic.mts");
  const msg = await getAnthropic("other").messages.create({
    model: process.env.PULSE_NARRATIVE_MODEL ?? "claude-sonnet-5",
    max_tokens: 400,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = msg.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}

export async function buildNarrative(
  digest: PulseDigest,
  deps?: { complete?: (system: string, user: string) => Promise<string> },
): Promise<string | null> {
  const complete = deps?.complete ?? defaultComplete;
  try {
    const text = await complete(narrativeSystem(), JSON.stringify(digest));
    return text || null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify PASS.**

- [ ] **Step 5: Wire into the adapter.** In `scripts/social-pulse/scan.mts`, before the digest upsert, add `const { buildNarrative } = await import("@/lib/social-pulse/narrative");` and `const narrative = await buildNarrative(digest);`, then include `narrative` in the upsert row.

- [ ] **Step 6: Run all pulse tests + commit**

Run: `bun test lib/social-pulse/` — Expected: PASS.

```bash
git add lib/social-pulse/narrative.ts lib/social-pulse/narrative.test.ts scripts/social-pulse/scan.mts
git commit -m "feat(social-pulse): figures-only narrative writer wired into digest publish (P2 task 8)"
```

---

### Task 9: Public /pulse page

**Files:**
- Create: `app/pulse/page.tsx`, `lib/social-pulse/load.ts`
- Test: `lib/social-pulse/load.test.ts`

**Interfaces:**
- Consumes: `PulseDigest` (task 7), `createServiceRoleClient` (`utils/supabase/service-role.ts`).
- Produces: `loadLatestDigest(deps?: { client?: SupabaseClient<Database> }): Promise<{ digest: PulseDigest; narrative: string | null } | null>`.

- [ ] **Step 1: Write the failing loader test**

```ts
// lib/social-pulse/load.test.ts
import { test, expect } from "bun:test";
import { loadLatestDigest } from "./load";

test("returns null when the table is empty (page renders the pre-launch state)", async () => {
  const fake = {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    }),
  };
  expect(await loadLatestDigest({ client: fake as never })).toBeNull();
});

test("returns digest + narrative from the latest week row", async () => {
  const row = { week: "2026-W27", digest: { week: "2026-W27", asOf: "07/05/2026" }, narrative: "brief" };
  const fake = {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        }),
      }),
    }),
  };
  const out = await loadLatestDigest({ client: fake as never });
  expect(out?.narrative).toBe("brief");
  expect(out?.digest.week).toBe("2026-W27");
});
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement loader**

```ts
// lib/social-pulse/load.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import type { PulseDigest } from "./digest";

export async function loadLatestDigest(deps?: {
  client?: SupabaseClient<Database>;
}): Promise<{ digest: PulseDigest; narrative: string | null } | null> {
  const client =
    deps?.client ??
    (await import("@/utils/supabase/service-role")).createServiceRoleClient();
  const { data, error } = await client
    .from("social_pulse_digest")
    .select("week, digest, narrative")
    .order("week", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return { digest: data.digest as unknown as PulseDigest, narrative: data.narrative };
}
```

- [ ] **Step 4: Run to verify PASS.**

- [ ] **Step 5: Build the page** (server component, anonymous, revalidated hourly)

```tsx
// app/pulse/page.tsx
// SWFL Social Pulse — public weekly digest of what's earning engagement in
// SWFL real-estate Instagram. Anonymous surface (spec §3): current week only.
import Link from "next/link";
import { loadLatestDigest } from "@/lib/social-pulse/load";
import { AREA_LABELS } from "@/lib/social-pulse/terms";

export const revalidate = 3600;

export const metadata = {
  title: "SWFL Social Pulse — what's working in Southwest Florida real-estate social",
  description:
    "Weekly engagement benchmarks, winning formats, and top posts from a live Instagram scan of Southwest Florida real-estate content.",
};

export default async function PulsePage() {
  const latest = await loadLatestDigest();
  if (!latest) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-semibold">SWFL Social Pulse</h1>
        <p className="mt-4 text-muted-foreground">
          The first weekly scan hasn&apos;t landed yet. Check back shortly.
        </p>
      </main>
    );
  }
  const { digest, narrative } = latest;
  const swfl = digest.benchmarks.find((b) => b.area === "swfl");
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold">SWFL Social Pulse</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Live Instagram scan ({digest.asOf}) · SWFL Data Gulf
      </p>

      {swfl ? (
        <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Posts scanned" value={String(swfl.postCount)} />
          <Stat label="Median likes" value={swfl.medianLikes.toLocaleString()} />
          <Stat label="Top-quartile likes" value={swfl.topQuartileLikes.toLocaleString()} />
        </section>
      ) : null}

      {narrative ? <p className="mt-8 leading-relaxed">{narrative}</p> : null}

      {digest.formats.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-medium">Formats earning likes this week</h2>
          <ul className="mt-3 space-y-2">
            {digest.formats.map((f) => (
              <li key={f.format} className="flex items-baseline justify-between border-b border-border/40 pb-2">
                <span className="capitalize">{f.format}</span>
                <span className="text-sm text-muted-foreground">
                  {Math.round(f.share * 100)}% of posts · median {f.medianLikes.toLocaleString()} likes
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {digest.topPosts.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-medium">Top posts by area</h2>
          <ul className="mt-3 space-y-4">
            {digest.topPosts.map((p) => (
              <li key={p.permalink}>
                <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline">
                  @{p.username}
                </a>
                <span className="ml-2 text-sm text-muted-foreground">
                  {AREA_LABELS[p.area as keyof typeof AREA_LABELS] ?? p.area} · {p.likeCount.toLocaleString()} likes ·{" "}
                  {p.commentCount.toLocaleString()} comments · {p.format}
                </span>
                {p.captionPreview ? (
                  <p className="mt-1 text-sm text-muted-foreground">{p.captionPreview}…</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {digest.hashtags.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-medium">Hashtag reach</h2>
          <ul className="mt-3 space-y-2">
            {digest.hashtags.map((h) => (
              <li key={h.name} className="flex items-baseline justify-between border-b border-border/40 pb-2">
                <span>#{h.name}</span>
                <span className="text-sm text-muted-foreground">
                  {h.mediaCount != null ? `${h.mediaCount.toLocaleString()} posts` : "—"}
                  {h.deltaFromPrev != null ? ` · ${h.deltaFromPrev >= 0 ? "+" : ""}${h.deltaFromPrev.toLocaleString()} vs prior scan` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-12 text-xs text-muted-foreground">
        Engagement figures are read from public Instagram posts as written — never estimated. Posts
        link to their creators on Instagram.{" "}
        <Link href="/" className="underline underline-offset-2">
          Built by SWFL Data Gulf
        </Link>
        .
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
```

- [ ] **Step 6: Verify with a real build**

Run: `bunx next build 2>&1 | tail -15`
Expected: build succeeds, `/pulse` listed in the route table. (If `Stat`'s classnames clash with the design system, match the closest existing card component in `components/` rather than inventing new styles.)

- [ ] **Step 7: Commit**

```bash
git add app/pulse/page.tsx lib/social-pulse/load.ts lib/social-pulse/load.test.ts
git commit -m "feat(social-pulse): public /pulse weekly digest page (P2 task 9)"
```

---

### Task 10: Ship gate — full verify + SESSION_LOG + handoff to operator

**Files:**
- Modify: `SESSION_LOG.md` (new top entry), `_AUDIT_AND_ROADMAP/build-queue.md` (sync entry)

- [ ] **Step 1: Full test + build**

Run: `bun test lib/social-pulse/ && bunx next build 2>&1 | tail -5`
Expected: all pulse tests PASS; build green.

- [ ] **Step 2: SESSION_LOG entry** (top of file): what shipped (P1+P2 tasks 1–9), that the cron is daily-bootstrap with the 07/26/2026 flip check open, and that live verification is operator-run.

- [ ] **Step 3: Commit docs, then STOP for the operator**

```bash
git add SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "docs(social-pulse): session log + build queue sync (P1+P2 complete)"
```

Do NOT push without operator confirmation. Then hand off, verbatim ask:
1. Operator dispatches `gh workflow run social-pulse-scan.yml -f dry_run=true` (free of DB writes; spends ~80 weighted vendor requests) and reviews the log.
2. If clean, operator dispatches the real run, checks `/pulse` renders the digest, and closes `social_pulse_swfl_live_verify` with the run URL as proof (checks are prod evidence, never dev attestation).

---

## Out of scope for this plan (next plans, in order)

- **P3 — AI wiring:** `fetchPulseContext(scope)` reading `social_pulse_digest`, injected into `buildWeek`/`socialPostSystem`, `buildSocialCanvasFill`, and the composer hashtag suggester + receipt chips. Plan after the digest shape has survived one live week.
- **P4 — Ladder:** signup unlocks (area slices, history, weekly Pulse email as a deliverable).
- **P5 — Own-results loop:** `social_events` comparison line ("this post: X likes · your prior median: Y").

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 5, Task 7, Task 8 | `scripts/social-pulse/scan.mts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
