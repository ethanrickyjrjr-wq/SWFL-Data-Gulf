# Signal-Driven ZIP Hero + Shared Sourced Figures — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 11 tasks, 25 files, keywords: migration, schema, architecture

**Goal:** Each ZIP report page leads with ITS most distinctive held signals (deterministically ranked), renders every number exactly once, unlocks flood data for all 57 SWFL ZIPs via a `flood_by_zip` detail table, and replaces structural coverage gaps with a "Find it" button whose lane-3 results land in a shared `sourced_figures` store read by the page, the site assistant, and the email/social builders.

**Architecture:** A pure signal ranker (`lib/zip-report/signal-rank.ts`) scores candidates built from data the page already loads (`lib/zip-report/candidates.ts`). env-swfl emits a new all-ZIPs detail table (top-6 key_metrics untouched — thin pipe). A new public Supabase table `sourced_figures` (typed client) caches verbatim-cited gap-fill results; `lib/figures/sourced.ts` is the one reader wired into the page, `lib/email/market-context.ts`, and the assistant's located-ZIP path in `lib/assistant/conversation-path.ts`.

**Tech Stack:** Next.js App Router (nodejs runtime), Supabase (typed client for `public.*`, untyped hatch for `data_lake.*`), bun:test, Bun.SQL migrations, Anthropic `web_search_20250305` via the existing `lib/assistant/gap-fill.ts` engine.

**Spec:** `docs/superpowers/specs/2026-07-03-zip-signal-hero-design.md` · **Check:** `zip_signal_hero_live_verify` (operator-run — do NOT close it from this plan).

## Global Constraints

- **No invented numbers.** Every figure names a real source. Gap-fill values accepted ONLY when digits appear verbatim in a returned `cited_text` (existing `fillExternalPoint` moat). A miss is a miss.
- **No paid API calls in tests/CI.** Gap-fill is mocked in every test. `*_live_verify` is operator-run.
- **Dates MM/DD/YYYY**, stated once per surface. Never the raw `SWFL-…-YYYYMMDD` token.
- **No "ZIP-level" framing** in any copy. No system nouns (master/brain-id/§/pack ids) in user-facing text.
- **Layout:** `dvh`/`h-full`, never `h-screen`.
- **Thin pipe:** env-swfl's existing top-6 key_metrics are UNTOUCHED. New emission is a detail table only → no new vocab slugs (detail tables are not scanned by `check-vocab-coverage`); still run the Gate-2 commands because packs are touched.
- **Migrations idempotent**, run via `bun scripts/run-migration.ts <file>`; creds already in `.dlt/secrets.toml`.
- **Commits:** stage explicit paths only (never `git add -A`). Commit per task. **Do NOT push** — at the end, show `git log` and STOP for operator confirmation (memory rule: no autonomous push).
- **Verify with `bunx next build`**, not bare `npx tsc`.
- v1 Find-it allowlist is EXACTLY `permits_90d` on Cape Coral ZIPs 33904/33909/33914/33990/33991 (spec §5). Wider pools are registered follow-ups (`zip_hero_pool_all_brains`, `city_permits_ingest_odd`) — do not widen here.

---

### Task 1: `sourced_figures` table — migration + regenerated types

**Files:**
- Create: `migrations/20260703_sourced_figures.sql`
- Regenerate: `database-generated.types.ts` (via `bun run gen:types`)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `public.sourced_figures` table with UNIQUE index on `(scope_kind, scope_key, metric_key)`; the typed `Database` interface gains the `sourced_figures` table so `createServiceRoleClient().from("sourced_figures")` typechecks in Tasks 2 and 5.

- [ ] **Step 1: Write the migration**

```sql
-- public.sourced_figures — shared lane-3 figure cache (spec 2026-07-03 zip-signal-hero §1).
-- One row per (scope, metric): a number found live with a named web source, cached so the
-- ZIP report page, the site assistant, and the email/social builders all read the SAME
-- figure ("found numbers are platform-wide, never page-local").
-- Idempotent; run via:  bun scripts/run-migration.ts migrations/20260703_sourced_figures.sql

CREATE TABLE IF NOT EXISTS public.sourced_figures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_kind     text NOT NULL CHECK (scope_kind IN ('zip', 'county')),
  scope_key      text NOT NULL,
  metric_key     text NOT NULL,
  label          text NOT NULL,
  value_num      numeric,
  value_text     text,
  unit           text,
  source_name    text NOT NULL,
  source_url     text NOT NULL,
  cited_text     text NOT NULL DEFAULT '',
  as_of          date,
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  requested_from text NOT NULL DEFAULT 'find-button'
);

-- Idempotent upsert target: one row per (scope, metric).
CREATE UNIQUE INDEX IF NOT EXISTS sourced_figures_scope_metric_uq
  ON public.sourced_figures (scope_kind, scope_key, metric_key);

-- Daily-cap count query scans by fetch time.
CREATE INDEX IF NOT EXISTS sourced_figures_fetched_idx
  ON public.sourced_figures (fetched_at DESC);

ALTER TABLE public.sourced_figures ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies on purpose: all reads and writes go through
-- server-side service-role code (RLS enabled + no policy = deny other roles).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sourced_figures TO service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Run it against prod**

Run: `bun scripts/run-migration.ts migrations/20260703_sourced_figures.sql`
Expected: `Running migrations/20260703_sourced_figures.sql...` → `✓ done` → `Migrations complete.`

- [ ] **Step 3: Regenerate the typed client and verify the table landed**

Run: `bun run gen:types`
Expected: `wrote database-generated.types.ts: N tables, M columns` (N includes the new table).

Run: `grep -n "sourced_figures" database-generated.types.ts | head -3`
Expected: at least one match (`sourced_figures: {`). This is the row-access verification — the generator introspects the LIVE `information_schema`, so a match proves the table exists and the typed client can see it.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260703_sourced_figures.sql database-generated.types.ts
git commit -m "feat(figures): sourced_figures shared lane-3 cache table + regenerated types"
```

---

### Task 2: `lib/figures/sourced.ts` — the one reader (+ prompt block)

**Files:**
- Create: `lib/figures/sourced.ts`
- Test: `lib/figures/sourced.test.ts`

**Interfaces:**
- Consumes: `public.sourced_figures` (Task 1) via `createServiceRoleClient` (typed) from `@/utils/supabase/service-role`.
- Produces (used by Tasks 5, 8, 9, 10):
  - `interface SourcedFigure { key: string; label: string; value: string; source: string; source_url: string; as_of?: string }`
  - `getSourcedFigures(scope: { kind: "zip" | "county"; key: string }): Promise<SourcedFigure[]>` — empty-tolerant, never throws.
  - `mapSourcedRows(rows: SourcedRow[]): SourcedFigure[]` — pure, exported for tests and for Task 5's cache-hit path.
  - `sourcedFiguresPromptBlock(figs: SourcedFigure[]): string` — pure.
  - `sourcedFiguresBlockForZip(zip: string | null): Promise<string>`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/figures/sourced.test.ts
import { describe, expect, test } from "bun:test";
import {
  getSourcedFigures,
  mapSourcedRows,
  sourcedFiguresPromptBlock,
} from "./sourced";

const ROW = {
  metric_key: "permits_90d",
  label: "New building permits issued in ZIP 33914 (Cape Coral), last 90 days",
  value_num: 412,
  value_text: "412",
  unit: null,
  source_name: "capecoral.gov",
  source_url: "https://www.capecoral.gov/permit-report",
  as_of: "2026-06-30",
};

describe("mapSourcedRows", () => {
  test("maps a row, preferring value_text, and formats as_of MM/DD/YYYY", () => {
    const [fig] = mapSourcedRows([ROW]);
    expect(fig).toEqual({
      key: "permits_90d",
      label: ROW.label,
      value: "412",
      source: "capecoral.gov",
      source_url: ROW.source_url,
      as_of: "06/30/2026",
    });
  });

  test("falls back to value_num + unit when value_text is null", () => {
    const [fig] = mapSourcedRows([{ ...ROW, value_text: null, value_num: 6.75, unit: "%" }]);
    expect(fig.value).toBe("6.75 %");
  });

  test("drops rows with neither value_text nor value_num", () => {
    expect(mapSourcedRows([{ ...ROW, value_text: null, value_num: null }])).toEqual([]);
  });
});

describe("sourcedFiguresPromptBlock", () => {
  test("empty figures → empty string (zero tokens added)", () => {
    expect(sourcedFiguresPromptBlock([])).toBe("");
  });

  test("lists label: value (source, as of date); no system nouns, no §", () => {
    const block = sourcedFiguresPromptBlock(mapSourcedRows([ROW]));
    expect(block).toContain("- New building permits issued in ZIP 33914 (Cape Coral), last 90 days: 412 (capecoral.gov, as of 06/30/2026)");
    expect(block).toContain("never invent a figure");
    expect(block).not.toContain("§");
    expect(block).not.toContain("master");
  });
});

describe("getSourcedFigures — empty-tolerant contract", () => {
  test("no creds → [] (never throws)", async () => {
    const saved = {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
      BRAINS_SUPABASE_URL: process.env.BRAINS_SUPABASE_URL,
      BRAINS_SUPABASE_SERVICE_KEY: process.env.BRAINS_SUPABASE_SERVICE_KEY,
    };
    for (const k of Object.keys(saved)) delete process.env[k];
    try {
      expect(await getSourcedFigures({ kind: "zip", key: "33914" })).toEqual([]);
    } finally {
      for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/figures/sourced.test.ts`
Expected: FAIL — `Cannot find module './sourced'`

- [ ] **Step 3: Implement**

```ts
// lib/figures/sourced.ts
//
// Reader for public.sourced_figures — the shared lane-3 figure cache. A number
// found live with a named web source is stored ONCE and read by the ZIP report
// page, the site assistant's located path, and the email/social builders
// (market-context). Spec: docs/superpowers/specs/2026-07-03-zip-signal-hero-design.md §1.
//
// Empty-tolerant by contract (four-lane / ODD): no creds, no rows, any query
// error → [] — never a thrown error and NEVER an invented figure.
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export interface SourcedFigureScope {
  kind: "zip" | "county";
  key: string;
}

export interface SourcedFigure {
  /** metric_key, e.g. "permits_90d". */
  key: string;
  label: string;
  /** Display string — value_text preferred, else value_num + unit. */
  value: string;
  /** source_name, e.g. "capecoral.gov". */
  source: string;
  source_url: string;
  /** MM/DD/YYYY. */
  as_of?: string;
}

export interface SourcedRow {
  metric_key: string;
  label: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  source_name: string;
  source_url: string;
  as_of: string | null;
}

const SELECT_COLS =
  "metric_key, label, value_num, value_text, unit, source_name, source_url, as_of";

function mdY(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** Pure row → figure mapper. Rows with no renderable value are dropped, never zero-filled. */
export function mapSourcedRows(rows: SourcedRow[]): SourcedFigure[] {
  const out: SourcedFigure[] = [];
  for (const r of rows) {
    const num = r.value_num != null ? Number(r.value_num) : null;
    const value =
      r.value_text ??
      (num != null && Number.isFinite(num)
        ? `${num.toLocaleString("en-US")}${r.unit ? ` ${r.unit}` : ""}`
        : null);
    if (!value || !r.metric_key || !r.source_name || !r.source_url) continue;
    out.push({
      key: r.metric_key,
      label: r.label,
      value,
      source: r.source_name,
      source_url: r.source_url,
      as_of: mdY(r.as_of),
    });
  }
  return out;
}

/** Unexpired cached figures for a scope. Empty-tolerant: any failure → []. */
export async function getSourcedFigures(scope: SourcedFigureScope): Promise<SourcedFigure[]> {
  let db: ReturnType<typeof createServiceRoleClient>;
  try {
    db = createServiceRoleClient();
  } catch {
    return []; // no creds in this env — degrade, never throw
  }
  try {
    const { data, error } = await db
      .from("sourced_figures")
      .select(SELECT_COLS)
      .eq("scope_kind", scope.kind)
      .eq("scope_key", scope.key)
      .gt("expires_at", new Date().toISOString());
    if (error || !data) return [];
    return mapSourcedRows(data as unknown as SourcedRow[]);
  } catch {
    return [];
  }
}

/** Grounding block for the assistant's located path. "" when nothing is cached. */
export function sourcedFiguresPromptBlock(figs: SourcedFigure[]): string {
  if (figs.length === 0) return "";
  const lines = figs.map(
    (f) => `- ${f.label}: ${f.value} (${f.source}${f.as_of ? `, as of ${f.as_of}` : ""})`,
  );
  return (
    "\n\n=== FOUND FIGURES — numbers previously found live from named web sources and " +
    "cached. State them only as written, with their source; never invent a figure not " +
    "listed here. ===\n" +
    lines.join("\n")
  );
}

/** Convenience for the located-ZIP path: fetch + format in one await. */
export async function sourcedFiguresBlockForZip(zip: string | null): Promise<string> {
  if (!zip) return "";
  return sourcedFiguresPromptBlock(await getSourcedFigures({ kind: "zip", key: zip }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/figures/sourced.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/figures/sourced.ts lib/figures/sourced.test.ts
git commit -m "feat(figures): sourced-figures reader + assistant prompt block (empty-tolerant)"
```

---

### Task 3: Signal ranker — `lib/zip-report/signal-rank.ts`

**Files:**
- Create: `lib/zip-report/signal-rank.ts`
- Test: `lib/zip-report/signal-rank.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no I/O).
- Produces (used by Tasks 7 and 8):
  - `interface SignalCandidate { key: string; label: string; display: string; sub?: string; percentile: number | null; rankPos?: number; rankOf?: number; movementPct: number | null; movementText?: string; covered: boolean; source?: { label: string; url: string } }`
  - `interface RankedSignal extends SignalCandidate { score: number; why: string }`
  - `rankSignals(candidates: SignalCandidate[]): RankedSignal[]`
  - `percentileOf(values: number[], v: number): { percentile: number; rankPos: number; rankOf: number } | null`
  - `SIGNAL_PRIORITY: readonly string[]` (tie-break order)

- [ ] **Step 1: Write the failing test**

```ts
// lib/zip-report/signal-rank.test.ts
import { describe, expect, test } from "bun:test";
import { percentileOf, rankSignals, type SignalCandidate } from "./signal-rank";

function cand(over: Partial<SignalCandidate>): SignalCandidate {
  return {
    key: "x",
    label: "X",
    display: "1",
    percentile: null,
    movementPct: null,
    covered: true,
    ...over,
  };
}

describe("percentileOf", () => {
  test("max value → 100th percentile, rank #1 of N", () => {
    const r = percentileOf([100, 200, 300, 400], 400)!;
    expect(r.percentile).toBe(100);
    expect(r.rankPos).toBe(1);
    expect(r.rankOf).toBe(4);
  });
  test("min value → 0th percentile, last rank", () => {
    const r = percentileOf([100, 200, 300, 400], 100)!;
    expect(r.percentile).toBe(0);
    expect(r.rankPos).toBe(4);
  });
  test("empty distribution → null", () => {
    expect(percentileOf([], 5)).toBeNull();
  });
});

describe("rankSignals", () => {
  test("extremity-led winner: 98th-percentile flood beats mid-pack price; why = rank text", () => {
    const ranked = rankSignals([
      cand({ key: "median_sale_price", percentile: 60, rankPos: 23, rankOf: 57 }),
      cand({ key: "flood_aal", percentile: 98, rankPos: 2, rankOf: 57 }),
    ]);
    expect(ranked[0].key).toBe("flood_aal");
    expect(ranked[0].why).toBe("#2 of 57 SWFL ZIPs");
  });

  test("movement-led winner: +18% YoY beats a quieter more-extreme metric; why = movement text", () => {
    const ranked = rankSignals([
      cand({ key: "median_dom", percentile: 70, rankPos: 17, rankOf: 57 }),
      cand({
        key: "median_sale_price",
        percentile: 55,
        rankPos: 26,
        rankOf: 57,
        movementPct: 18,
        movementText: "↑ 18% YoY",
      }),
    ]);
    expect(ranked[0].key).toBe("median_sale_price");
    expect(ranked[0].why).toBe("↑ 18% YoY");
  });

  test("uncovered candidates are excluded — they never compete", () => {
    const ranked = rankSignals([
      cand({ key: "permits_90d", percentile: 99, covered: false }),
      cand({ key: "median_sale_price", percentile: 51 }),
    ]);
    expect(ranked.map((r) => r.key)).toEqual(["median_sale_price"]);
  });

  test("deterministic tie-break follows SIGNAL_PRIORITY order", () => {
    const ranked = rankSignals([
      cand({ key: "median_dom", percentile: 80 }),
      cand({ key: "flood_aal", percentile: 80 }),
      cand({ key: "median_sale_price", percentile: 80 }),
    ]);
    expect(ranked.map((r) => r.key)).toEqual(["flood_aal", "median_sale_price", "median_dom"]);
  });

  test("movement is capped at 1 (|yoy|/20): 40% YoY does not double-count", () => {
    const a = rankSignals([cand({ key: "a", movementPct: 40 })])[0];
    const b = rankSignals([cand({ key: "b", movementPct: 20 })])[0];
    expect(a.score).toBeCloseTo(b.score, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/zip-report/signal-rank.test.ts`
Expected: FAIL — `Cannot find module './signal-rank'`

- [ ] **Step 3: Implement**

```ts
// lib/zip-report/signal-rank.ts
//
// Deterministic signal ranker for the ZIP report page (spec §2). Pure — no I/O,
// no model. Score = 0.6 × extremity + 0.4 × movement, where
//   extremity = |percentile − 50| / 50        (0..1; unknown percentile → 0)
//   movement  = min(|YoY %| / 20, 1)          (metric with no delta → 0)
// Uncovered candidates never compete — they surface as Find-it slots instead.
// The why-tag only restates held rank/delta values — never an invented number.

export interface SignalCandidate {
  key: string;
  label: string;
  /** Preformatted display value, e.g. "$485K" — restates a held number verbatim. */
  display: string;
  /** Secondary line under the value, e.g. "90-day median sale price". */
  sub?: string;
  /** 0–100 percentile across SWFL ZIPs for this metric; null when unknown. */
  percentile: number | null;
  /** Rank position in the same distribution, e.g. #3 of 57. */
  rankPos?: number;
  rankOf?: number;
  /** Signed YoY % movement; null when the metric carries no delta. */
  movementPct: number | null;
  /** The held delta restated for display, e.g. "↑ 18% YoY" / "↓ 12 days YoY". */
  movementText?: string;
  covered: boolean;
  source?: { label: string; url: string };
}

export interface RankedSignal extends SignalCandidate {
  score: number;
  /** Why this signal leads — "#2 of 57 SWFL ZIPs" or "↑ 18% YoY". */
  why: string;
}

/** Deterministic tie-break: earlier key wins. Unlisted keys sort after, alphabetically. */
export const SIGNAL_PRIORITY: readonly string[] = [
  "flood_aal",
  "median_sale_price",
  "median_dom",
  "permits_90d",
  "months_of_supply",
  "homes_sold",
  "inventory",
  "avg_sale_to_list_pct",
  "median_household_income",
  "population",
  "owner_occupied",
  "median_age",
  "poverty_rate",
  "employment_rate",
  "household_size",
  "moved_past_year",
];

function priorityIdx(key: string): number {
  const i = SIGNAL_PRIORITY.indexOf(key);
  return i === -1 ? SIGNAL_PRIORITY.length : i;
}

/**
 * Percentile (0–100, higher = larger value) + rank position (#1 = largest)
 * of `v` within `values`. Null when the distribution is empty.
 */
export function percentileOf(
  values: number[],
  v: number,
): { percentile: number; rankPos: number; rankOf: number } | null {
  const sorted = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0 || !Number.isFinite(v)) return null;
  let below = 0;
  while (below < n && sorted[below] < v) below++;
  const percentile = n === 1 ? 100 : Math.round((below / (n - 1)) * 100);
  let above = 0;
  for (const x of sorted) if (x > v) above++;
  return { percentile: Math.min(100, percentile), rankPos: above + 1, rankOf: n };
}

export function rankSignals(candidates: SignalCandidate[]): RankedSignal[] {
  const scored: RankedSignal[] = candidates
    .filter((c) => c.covered)
    .map((c) => {
      const extremity = c.percentile == null ? 0 : Math.abs(c.percentile - 50) / 50;
      const movement = c.movementPct == null ? 0 : Math.min(Math.abs(c.movementPct) / 20, 1);
      const extremityTerm = 0.6 * extremity;
      const movementTerm = 0.4 * movement;
      const rankWhy =
        c.rankPos != null && c.rankOf != null ? `#${c.rankPos} of ${c.rankOf} SWFL ZIPs` : "";
      const moveWhy = c.movementText ?? "";
      // The why-tag names the WINNING term; falls back to whichever exists.
      const why = movementTerm > extremityTerm ? moveWhy || rankWhy : rankWhy || moveWhy;
      return { ...c, score: extremityTerm + movementTerm, why };
    });
  scored.sort(
    (a, b) =>
      b.score - a.score || priorityIdx(a.key) - priorityIdx(b.key) || a.key.localeCompare(b.key),
  );
  return scored;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/zip-report/signal-rank.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/zip-report/signal-rank.ts lib/zip-report/signal-rank.test.ts
git commit -m "feat(zip-report): deterministic signal ranker (extremity + movement, why-tags)"
```

---

### Task 4: env-swfl `flood_by_zip` detail table — all 57 ZIPs

**Files:**
- Modify: `refinery/sources/fema-nfip-source.mts` (new full-list fragment; both fixture and live paths)
- Modify: `refinery/packs/env-swfl.mts` (snapshot field + detail table)
- Test: `refinery/packs/env-swfl.test.mts` (extend)

**Interfaces:**
- Consumes: existing `aggregateZipRollupTop6` / `buildZipFragmentsFromView` (already rank the FULL distribution internally — passing `Number.POSITIVE_INFINITY` as `topN` returns every ZIP with identical math, since `take = Math.min(topN, n)` and the percentile uses the full `n` regardless).
- Produces:
  - Fragment kind `"nfip-zip-window-full"` → `interface NfipZipWindowFull { kind: "nfip-zip-window-full"; zips: NfipZipAggregate[] }` (exported from fema-nfip-source.mts).
  - `BrainOutput.detail_tables` entry `id: "flood_by_zip"`, `grain: "zip"`, columns `aal_usd_per_insured_property` / `pct_rank` / `claim_count_in_window` / `county`, one row per SWFL ZIP with ≥1 claim in window. Row `key` = 5-digit ZIP.
  - Top-6 key_metrics and `storm_timeline` UNCHANGED.

- [ ] **Step 1: Write the failing tests** (append to `refinery/packs/env-swfl.test.mts`)

```ts
// --------------------------------------------------------------------------
// flood_by_zip detail table — all-ZIP emission (spec 2026-07-03 zip-signal-hero §4).
// --------------------------------------------------------------------------

test("flood_by_zip: detail table present, grain zip, one row per windowed SWFL ZIP (≥ top-6)", async () => {
  const result = await runProducer();
  const table = result.detail_tables?.find((t) => t.id === "flood_by_zip");
  assert.ok(table, "flood_by_zip detail table should be emitted");
  assert.equal(table!.grain, "zip");
  assert.ok(table!.rows.length >= 6, `expected ≥ 6 rows, got ${table!.rows.length}`);
  const colIds = table!.columns.map((c) => c.id);
  assert.deepEqual(colIds, [
    "aal_usd_per_insured_property",
    "pct_rank",
    "claim_count_in_window",
    "county",
  ]);
});

test("flood_by_zip: top-6 key_metrics UNCHANGED and mirrored exactly in the table (thin pipe)", async () => {
  const result = await runProducer();
  const table = result.detail_tables?.find((t) => t.id === "flood_by_zip");
  const perZipAal = result.key_metrics.filter((m) =>
    /^swfl_zip_\d{5}_flood_aal_usd_per_insured_property$/.test(m.metric),
  );
  assert.ok(perZipAal.length > 0 && perZipAal.length <= 6, "top-6 emission preserved");
  for (const m of perZipAal) {
    const zip = m.metric.match(/^swfl_zip_(\d{5})_/)![1];
    const row = table!.rows.find((r) => r.key === zip);
    assert.ok(row, `metric ZIP ${zip} must appear in flood_by_zip`);
    assert.equal(row!.cells["aal_usd_per_insured_property"], m.value);
  }
});

test("flood_by_zip: every row carries numeric AAL + pct_rank and a county name", async () => {
  const result = await runProducer();
  const table = result.detail_tables?.find((t) => t.id === "flood_by_zip");
  for (const row of table!.rows) {
    assert.match(row.key, /^\d{5}$/);
    assert.equal(typeof row.cells["aal_usd_per_insured_property"], "number");
    assert.equal(typeof row.cells["pct_rank"], "number");
    assert.equal(typeof row.cells["claim_count_in_window"], "number");
    assert.equal(typeof row.cells["county"], "string");
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test refinery/packs/env-swfl.test.mts`
Expected: 3 new tests FAIL (`flood_by_zip detail table should be emitted`); all pre-existing tests PASS.

- [ ] **Step 3: Emit the full-list fragment in `refinery/sources/fema-nfip-source.mts`**

3a. Export the new normalized shape (place next to the other exported interfaces, after `NfipZipAggregate`):

```ts
/**
 * Full ranked per-ZIP window list — EVERY SWFL ZIP with ≥1 claim in the rolling
 * window, carried as ONE fragment so the env-swfl pack can emit the flood_by_zip
 * detail table without widening the top-6 key_metrics surface (thin pipe).
 */
export interface NfipZipWindowFull {
  kind: "nfip-zip-window-full";
  zips: NfipZipAggregate[];
}
```

3b. Fixture path — in `fetch()`, replace the two lines that build `zipRollup`:

```ts
      const zipRollup = aggregateZipRollupTop6(data.claims);
```

with a full-list computation the top-6 is sliced from (identical math — pct uses the full distribution either way):

```ts
      const zipFullList = aggregateZipRollupTop6(data.claims, Number.POSITIVE_INFINITY);
      const zipRollup = zipFullList.slice(0, 6);
```

then AFTER the existing `for (const zipAgg of zipRollup) { ... }` loop, add:

```ts
      if (zipFullList.length > 0) {
        const full: NfipZipWindowFull = { kind: "nfip-zip-window-full", zips: zipFullList };
        fragments.push({
          fragment_id: fragmentId(SOURCE_ID, "zip-window-full"),
          source_id: SOURCE_ID,
          source_trust_tier: 1,
          fetched_at,
          raw: { zip_count: zipFullList.length },
          normalized: full as unknown as RawFragment["normalized"],
        });
      }
```

(If `normalized`'s declared type accepts the object directly — as it does for `zipAgg` — drop the cast.)

3c. Live path — replace:

```ts
      const zipAggs = buildZipFragmentsFromView(zipWindowRows);
```

with:

```ts
      const zipFullLive = buildZipFragmentsFromView(zipWindowRows, Number.POSITIVE_INFINITY);
      const zipAggs = zipFullLive.slice(0, 6);
```

and after the `for (const zipAgg of zipAggs) { ... }` loop, add the same full-fragment push using `zipFullLive`:

```ts
      if (zipFullLive.length > 0) {
        const full: NfipZipWindowFull = { kind: "nfip-zip-window-full", zips: zipFullLive };
        fragments.push({
          fragment_id: fragmentId(SOURCE_ID, "zip-window-full"),
          source_id: SOURCE_ID,
          source_trust_tier: 1,
          fetched_at,
          raw: { zip_count: zipFullLive.length },
          normalized: full as unknown as RawFragment["normalized"],
        });
      }
```

- [ ] **Step 4: Read the fragment + emit the table in `refinery/packs/env-swfl.mts`**

4a. Import the new type (extend the existing fema-nfip import block):

```ts
  type NfipZipWindowFull,
```

4b. Add snapshot fields to `interface EnvSnapshot` (after `zip_aggregates_fetched_at`):

```ts
  /**
   * Full per-ZIP window list (every SWFL ZIP with ≥1 claim in window) from the
   * nfip-zip-window-full fragment. Feeds ONLY the flood_by_zip detail table —
   * key_metrics stay top-6 (thin pipe). Empty when the fragment is absent.
   */
  zipWindowFull: NfipZipAggregate[];
  zip_window_full_fetched_at: string | null;
```

4c. Initialize them in `buildSnapshot`'s return object:

```ts
    zipWindowFull: [],
    zip_window_full_fetched_at: null,
```

4d. Add the collector (next to `zipAggregatesFrom`):

```ts
/** Find the single nfip-zip-window-full fragment (all windowed SWFL ZIPs). */
function zipWindowFullFrom(fragments: RawFragment[]): {
  zips: NfipZipAggregate[];
  fetched_at: string | null;
} {
  const hit = fragments.find(
    (f) => (f.normalized as { kind?: string } | null)?.kind === "nfip-zip-window-full",
  );
  if (!hit) return { zips: [], fetched_at: null };
  return {
    zips: (hit.normalized as unknown as NfipZipWindowFull).zips,
    fetched_at: hit.fetched_at,
  };
}
```

4e. Populate in `envSwflCorpusSummary` (after the `zipHit` block):

```ts
  const fullHit = zipWindowFullFrom(allFragments);
  snapshot.zipWindowFull = fullHit.zips;
  snapshot.zip_window_full_fetched_at = fullHit.fetched_at;
```

4f. Emit the detail table in `envSwflOutputProducer`, directly after the `storm_timeline` push (inside the same `detail_tables` build region):

```ts
  // ------------------------------------------------------------------
  // detail_tables — flood_by_zip: one row per SWFL ZIP with ≥1 claim in
  // the rolling window (spec 2026-07-03 zip-signal-hero §4). key_metrics
  // stay top-6; this is the finer-grain lookup surface (zip-drill pattern).
  // ------------------------------------------------------------------
  if (snapshot.zipWindowFull.length > 0) {
    detail_tables.push({
      id: "flood_by_zip",
      title: "SWFL flood loss by ZIP — NFIP per-insured-property AAL",
      grain: "zip",
      columns: [
        {
          id: "aal_usd_per_insured_property",
          label: "Avg annual flood loss per insured home",
          display_format: "currency",
          units: "USD/year",
        },
        { id: "pct_rank", label: "SWFL percentile rank", display_format: "raw", units: "percentile" },
        {
          id: "claim_count_in_window",
          label: `Claims in ${AAL_WINDOW_YEARS}-year window`,
          display_format: "count",
          units: "claims",
        },
        { id: "county", label: "County" },
      ],
      rows: snapshot.zipWindowFull.map((z) => ({
        key: z.zip,
        label: z.zip,
        cells: {
          aal_usd_per_insured_property: z.aal_usd_per_insured_property,
          pct_rank: z.aal_pct_swfl_rank,
          claim_count_in_window: z.claim_count_in_window,
          county: z.county_name,
        },
      })),
      source: {
        url: FEMA_NFIP_TABLE_URL,
        fetched_at: snapshot.zip_window_full_fetched_at ?? snapshot.earliest_fetched_at,
        tier: 1,
        citation:
          `OpenFEMA FimaNfipClaims via data_lake.fema_nfip_claims — every SWFL ZIP with ≥1 ` +
          `claim in the ${AAL_WINDOW_YEARS}-year rolling window; per-insured-property AAL, ` +
          `2020 ACS population × ${INSURED_PENETRATION_FACTOR} NSI proxy denominator (v1).`,
      },
      note: "NFIP policyholder claims only — uninsured flood loss is not in the archive. Percentile rank is across all SWFL ZIPs with ≥1 claim in window.",
    });
  }
```

- [ ] **Step 5: Run pack tests + Gate-2 commands**

Run: `bun test refinery/packs/env-swfl.test.mts`
Expected: PASS (all, including the 3 new).

Run: `bun test refinery/lib/corridor-aliases.test.mts && bun refinery/tools/check-vocab-coverage.mts --all`
Expected: both PASS — no new key_metric slugs were added (detail tables aren't vocab-scanned), so coverage is unchanged.

- [ ] **Step 6: Commit**

```bash
git add refinery/sources/fema-nfip-source.mts refinery/packs/env-swfl.mts refinery/packs/env-swfl.test.mts
git commit -m "feat(env-swfl): flood_by_zip detail table for every windowed SWFL ZIP (top-6 key_metrics untouched)"
```

**Note for the executor:** the live `brains/env-swfl.md` won't carry the table until the operator rebuilds (`bun run refinery -- env-swfl --target-only` locally, or the targeted GHA form). The page (Task 8) falls back to today's key_metrics until then — ship-safe. Do NOT trigger a full-cascade rebuild.

---

### Task 5: Find-it core — allowlist, domain-scoped search, `findFigure`

**Files:**
- Modify: `lib/assistant/gap-fill.ts` (extract `makeDomainSearch`)
- Create: `lib/figures/metric-gaps.ts`
- Create: `lib/figures/find.ts`
- Test: `lib/figures/find.test.ts`

**Interfaces:**
- Consumes: `fillExternalPoint`, `SEARCH_ALLOWED_DOMAINS`, `parseBlockedDomains`, `SearchFn` (gap-fill.ts); `mapSourcedRows`, `SourcedFigure` (Task 2); `public.sourced_figures` (Task 1).
- Produces:
  - gap-fill.ts: `makeDomainSearch(domains: string[]): SearchFn` (exported).
  - metric-gaps.ts: `interface MetricGap { metric_key: string; zips: readonly string[]; label: (zip: string) => string; search_query: (zip: string) => string; coverage: { name: string; url: string }; extra_domains: readonly string[] }`, `FIND_METRIC_GAPS`, `CAPE_CORAL_ZIPS`, `findGap(metricKey: string, zip: string): MetricGap | null`.
  - find.ts: `findFigure(zip: string, metricKey: string, deps?: FindDeps): Promise<FindResult>` where `FindResult = { ok: true; figure: SourcedFigure; cached: boolean } | { ok: false; reason: "not_allowed" | "unavailable" | "capped" } | { ok: false; reason: "not_found"; pointer: { name: string; url: string } }` and `FindDeps = { db?: SupabaseClient-like; fill?: (req: ExternalRequest) => Promise<ExternalPoint | null>; now?: () => Date }`.

- [ ] **Step 1: Extract `makeDomainSearch` in `lib/assistant/gap-fill.ts`**

Replace the existing `defaultSearch` const:

```ts
const defaultSearch: SearchFn = async (prompt) => {
  try {
    return await runSearch(prompt, SEARCH_ALLOWED_DOMAINS);
  } catch (err) {
    // Self-heal: a 400 naming blocked domains → strip them and retry once. A domain
    // that opted out of Anthropic's crawler must not kill the whole feature.
    const blocked = parseBlockedDomains(err instanceof Error ? err.message : String(err));
    if (blocked.length === 0) throw err;
    const pruned = SEARCH_ALLOWED_DOMAINS.filter((d) => !blocked.includes(d));
    console.warn(`[gap-fill] dropping blocked domain(s) ${blocked.join(", ")} and retrying`);
    return await runSearch(prompt, pruned);
  }
};
```

with:

```ts
/**
 * Build a SearchFn over a custom allowed-domain list, with the same self-heal on
 * vendor blocked-domain 400s as the default. Lets the Find-it endpoint add the
 * issuing city's own domain for an allowlisted metric gap without touching the
 * default chart-peer list.
 */
export function makeDomainSearch(domains: string[]): SearchFn {
  return async (prompt) => {
    try {
      return await runSearch(prompt, domains);
    } catch (err) {
      // Self-heal: a 400 naming blocked domains → strip them and retry once. A domain
      // that opted out of Anthropic's crawler must not kill the whole feature.
      const blocked = parseBlockedDomains(err instanceof Error ? err.message : String(err));
      if (blocked.length === 0) throw err;
      const pruned = domains.filter((d) => !blocked.includes(d));
      console.warn(`[gap-fill] dropping blocked domain(s) ${blocked.join(", ")} and retrying`);
      return await runSearch(prompt, pruned);
    }
  };
}

const defaultSearch: SearchFn = makeDomainSearch([...SEARCH_ALLOWED_DOMAINS]);
```

Run: `bun test lib/assistant/gap-fill.test.ts` — Expected: PASS (behavior identical; existing tests inject `deps.search`, never `defaultSearch`).

- [ ] **Step 2: Write `lib/figures/metric-gaps.ts`**

```ts
// lib/figures/metric-gaps.ts
//
// Fixed PUBLIC allowlist for the Find-it button (spec §5). The public can only
// request the metric gaps listed here — never arbitrary lookups. v1: 90-day
// building permits on ZIPs whose city runs its own permitting portal, so they are
// structurally absent from the Lee County Accela feed. The registered follow-up
// `city_permits_ingest_odd` replaces this lane-3 fill with lane-1 ingest.

export interface MetricGapCoverage {
  /** Plain-English issuing source, e.g. "City of Cape Coral permitting". */
  name: string;
  /** Homepage-level URL (data-provenance convention: citation homepage URL). */
  url: string;
}

export interface MetricGap {
  metric_key: string;
  zips: readonly string[];
  label: (zip: string) => string;
  search_query: (zip: string) => string;
  /** Honest coverage line + not-found pointer — names the real issuing source. */
  coverage: MetricGapCoverage;
  /** Extra web-search domains beyond gap-fill's defaults. */
  extra_domains: readonly string[];
}

/** Cape Coral ZIPs absent from the Lee Accela feed (spec, operator-traced 07/03/2026). */
export const CAPE_CORAL_ZIPS = ["33904", "33909", "33914", "33990", "33991"] as const;

export const FIND_METRIC_GAPS: readonly MetricGap[] = [
  {
    metric_key: "permits_90d",
    zips: CAPE_CORAL_ZIPS,
    label: (zip) => `New building permits issued in ZIP ${zip} (Cape Coral), last 90 days`,
    search_query: (zip) =>
      `Cape Coral Florida building permits issued ${zip} recent monthly count report`,
    coverage: { name: "City of Cape Coral permitting", url: "https://www.capecoral.gov/" },
    extra_domains: ["capecoral.gov"],
  },
];

/** The allowlist gate: null unless (metric, zip) is explicitly listed. */
export function findGap(metricKey: string, zip: string): MetricGap | null {
  const gap = FIND_METRIC_GAPS.find((g) => g.metric_key === metricKey);
  if (!gap || !gap.zips.includes(zip)) return null;
  return gap;
}
```

- [ ] **Step 3: Write the failing tests for `findFigure`**

```ts
// lib/figures/find.test.ts
// Contract tests with gap-fill and the db MOCKED — no paid calls, no network.
import { describe, expect, test } from "bun:test";
import { findFigure, type FindDeps } from "./find";
import { findGap } from "./metric-gaps";

interface FakeDbOpts {
  cachedRow?: Record<string, unknown> | null;
  todayCount?: number;
}

/** Minimal stub of the supabase chain findFigure uses. Records upserts. */
function fakeDb(opts: FakeDbOpts) {
  const upserts: unknown[] = [];
  const db = {
    upserts,
    from: () => ({
      select: (_cols: string, sel?: { count?: string; head?: boolean }) => {
        if (sel?.head) {
          // daily-cap count query: .gte() resolves the builder
          return { gte: async () => ({ count: opts.todayCount ?? 0, error: null }) };
        }
        // cache query: .eq().eq().eq().gt().maybeSingle()
        const chain = {
          eq: () => chain,
          gt: () => chain,
          maybeSingle: async () => ({ data: opts.cachedRow ?? null, error: null }),
        };
        return chain;
      },
      upsert: async (row: unknown) => {
        upserts.push(row);
        return { error: null };
      },
    }),
  };
  return db;
}

const deps = (db: ReturnType<typeof fakeDb>, fill?: FindDeps["fill"]): FindDeps => ({
  db: db as unknown as NonNullable<FindDeps["db"]>,
  fill: fill ?? (async () => null),
  now: () => new Date("2026-07-03T15:00:00Z"),
});

describe("findGap allowlist", () => {
  test("allowlisted (permits_90d, Cape Coral ZIP) hits", () => {
    expect(findGap("permits_90d", "33914")).not.toBeNull();
  });
  test("non-allowlisted metric or ZIP → null", () => {
    expect(findGap("median_sale_price", "33914")).toBeNull();
    expect(findGap("permits_90d", "33901")).toBeNull();
  });
});

describe("findFigure", () => {
  test("not-allowlisted request → not_allowed, no db/fill touched", async () => {
    const db = fakeDb({});
    const r = await findFigure("33901", "permits_90d", deps(db));
    expect(r).toEqual({ ok: false, reason: "not_allowed" });
  });

  test("unexpired cache row → returned cached, fill never called", async () => {
    let fillCalled = false;
    const db = fakeDb({
      cachedRow: {
        metric_key: "permits_90d",
        label: "New building permits issued in ZIP 33914 (Cape Coral), last 90 days",
        value_num: 412,
        value_text: "412",
        unit: null,
        source_name: "capecoral.gov",
        source_url: "https://www.capecoral.gov/x",
        as_of: null,
      },
    });
    const r = await findFigure("33914", "permits_90d", deps(db, async () => {
      fillCalled = true;
      return null;
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cached).toBe(true);
      expect(r.figure.value).toBe("412");
      expect(r.figure.source).toBe("capecoral.gov");
    }
    expect(fillCalled).toBe(false);
  });

  test("global daily cap reached → capped, fill never called", async () => {
    let fillCalled = false;
    const db = fakeDb({ todayCount: 9999 });
    const r = await findFigure("33914", "permits_90d", deps(db, async () => {
      fillCalled = true;
      return null;
    }));
    expect(r).toEqual({ ok: false, reason: "capped" });
    expect(fillCalled).toBe(false);
  });

  test("cold hit: verified point → upserted + returned with named source", async () => {
    const db = fakeDb({});
    const r = await findFigure("33914", "permits_90d", deps(db, async () => ({
      label: "x",
      value: 412,
      url: "https://www.capecoral.gov/permit-report",
      cited_text: "the city issued 412 permits",
    })));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cached).toBe(false);
      expect(r.figure.value).toBe("412");
      expect(r.figure.source).toBe("capecoral.gov");
      expect(r.figure.source_url).toBe("https://www.capecoral.gov/permit-report");
    }
    expect(db.upserts.length).toBe(1);
    const row = db.upserts[0] as Record<string, unknown>;
    expect(row.scope_kind).toBe("zip");
    expect(row.scope_key).toBe("33914");
    expect(row.metric_key).toBe("permits_90d");
    expect(row.cited_text).toBe("the city issued 412 permits");
  });

  test("cold miss → honest not_found with the real issuing-source pointer", async () => {
    const db = fakeDb({});
    const r = await findFigure("33914", "permits_90d", deps(db));
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "not_found") {
      expect(r.pointer.name).toBe("City of Cape Coral permitting");
      expect(r.pointer.url).toBe("https://www.capecoral.gov/");
    } else {
      throw new Error(`expected not_found, got ${JSON.stringify(r)}`);
    }
    expect(db.upserts.length).toBe(0);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `bun test lib/figures/find.test.ts`
Expected: FAIL — `Cannot find module './find'`

- [ ] **Step 5: Implement `lib/figures/find.ts`**

```ts
// lib/figures/find.ts
//
// Core of POST /api/figures/find (spec §5): allowlist → cache → lane-3 gap-fill →
// upsert into the shared sourced_figures store. A value is accepted ONLY when its
// digits appear verbatim in a returned cited_text from a real publisher URL
// (fillExternalPoint's moat). A miss is a miss — the caller renders an honest line
// plus a pointer to the real issuing source. Never throws.
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import {
  fillExternalPoint,
  makeDomainSearch,
  SEARCH_ALLOWED_DOMAINS,
  type ExternalPoint,
  type ExternalRequest,
} from "@/lib/assistant/gap-fill";
import { findGap, type MetricGapCoverage } from "./metric-gaps";
import { mapSourcedRows, type SourcedFigure, type SourcedRow } from "./sourced";

const TTL_DAYS = 30;
/** Global daily ceiling on COLD lookups (paid web-search calls), env-tunable. */
const DAILY_CAP = Number(process.env.FIGURES_FIND_DAILY_CAP ?? "25");

export type FindResult =
  | { ok: true; figure: SourcedFigure; cached: boolean }
  | { ok: false; reason: "not_allowed" | "unavailable" | "capped" }
  | { ok: false; reason: "not_found"; pointer: MetricGapCoverage };

export interface FindDeps {
  db?: ReturnType<typeof createServiceRoleClient>;
  fill?: (req: ExternalRequest) => Promise<ExternalPoint | null>;
  now?: () => Date;
}

const SELECT_COLS =
  "metric_key, label, value_num, value_text, unit, source_name, source_url, as_of";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function findFigure(
  zip: string,
  metricKey: string,
  deps: FindDeps = {},
): Promise<FindResult> {
  const gap = findGap(metricKey, zip);
  if (!gap) return { ok: false, reason: "not_allowed" };

  let db: NonNullable<FindDeps["db"]>;
  try {
    db = deps.db ?? createServiceRoleClient();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  const now = deps.now ? deps.now() : new Date();

  // 1. Cache — an unexpired stored figure is returned to everyone, no live call.
  try {
    const { data } = await db
      .from("sourced_figures")
      .select(SELECT_COLS)
      .eq("scope_kind", "zip")
      .eq("scope_key", zip)
      .eq("metric_key", metricKey)
      .gt("expires_at", now.toISOString())
      .maybeSingle();
    if (data) {
      const [figure] = mapSourcedRows([data as unknown as SourcedRow]);
      if (figure) return { ok: true, figure, cached: true };
    }
  } catch {
    /* fall through to the cold path */
  }

  // 2. Global daily cap on cold (paid) lookups — count today's stored rows.
  try {
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();
    const { count } = await db
      .from("sourced_figures")
      .select("id", { count: "exact", head: true })
      .gte("fetched_at", dayStart);
    if ((count ?? 0) >= DAILY_CAP) return { ok: false, reason: "capped" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  // 3. Cold: lane-3 gap-fill over the default domains + the issuing city's own.
  const fill =
    deps.fill ??
    ((req: ExternalRequest) =>
      fillExternalPoint(req, {
        search: makeDomainSearch([...SEARCH_ALLOWED_DOMAINS, ...gap.extra_domains]),
      }));
  let point: ExternalPoint | null = null;
  try {
    point = await fill({ label: gap.label(zip), search_query: gap.search_query(zip) });
  } catch {
    point = null;
  }
  if (!point) return { ok: false, reason: "not_found", pointer: gap.coverage };

  // 4. Upsert so every consumer (page, assistant, builders) reads the SAME figure.
  const label = gap.label(zip);
  const valueText = point.value.toLocaleString("en-US");
  const sourceName = hostnameOf(point.url);
  try {
    await db.from("sourced_figures").upsert(
      {
        scope_kind: "zip",
        scope_key: zip,
        metric_key: metricKey,
        label,
        value_num: point.value,
        value_text: valueText,
        unit: null,
        source_name: sourceName,
        source_url: point.url,
        cited_text: point.cited_text.slice(0, 300),
        as_of: null,
        fetched_at: now.toISOString(),
        expires_at: new Date(now.getTime() + TTL_DAYS * 24 * 3600 * 1000).toISOString(),
        requested_from: "find-button",
      },
      { onConflict: "scope_kind,scope_key,metric_key" },
    );
  } catch {
    /* cache-write failure — the figure is still verified; return it anyway */
  }
  return {
    ok: true,
    cached: false,
    figure: { key: metricKey, label, value: valueText, source: sourceName, source_url: point.url },
  };
}
```

- [ ] **Step 6: Run tests**

Run: `bun test lib/figures/find.test.ts lib/assistant/gap-fill.test.ts`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add lib/assistant/gap-fill.ts lib/figures/metric-gaps.ts lib/figures/find.ts lib/figures/find.test.ts
git commit -m "feat(figures): Find-it core — fixed allowlist, cache-first lane-3 gap-fill, daily cap"
```

---

### Task 6: `POST /api/figures/find` route + FindItButton client component

**Files:**
- Create: `app/api/figures/find/route.ts`
- Create: `app/r/zip-report/_components/find-it-button.tsx`

**Interfaces:**
- Consumes: `findFigure` (Task 5), `checkRateLimit`/`clientIpFromHeaders`/`rateLimitHeaders` (`lib/rate-limit.ts`), `resolveZip` (`refinery/lib/zip-resolver.mts`), `SourcedFigure` (Task 2).
- Produces:
  - Route contract: `POST { zip: string, metric_key: string }` → `200 { found: true, figure, cached }` | `200 { found: false, pointer: { name, url } }` | `400 invalid_request | not_allowed` | `429 rate_limited | capped` | `503 unavailable`.
  - `<FindItButton zip metricKey label coverage initialFigure? />` client component (used by Task 8).

- [ ] **Step 1: Write the route**

```ts
// app/api/figures/find/route.ts
//
// POST { zip, metric_key } — the Find-it button endpoint (spec §5). Public but
// hard-bounded: fixed metric-gap ALLOWLIST (lib/figures/metric-gaps.ts), per-IP
// burst limit, and a global daily cap on cold lookups inside findFigure. A found
// figure is cached in sourced_figures for every consumer; a miss returns an
// honest pointer to the real issuing source — never an invented number.
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, clientIpFromHeaders, rateLimitHeaders } from "@/lib/rate-limit";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import { findFigure } from "@/lib/figures/find";

export const runtime = "nodejs";

const VALID_ZIP = /^\d{5}$/;

export async function POST(req: NextRequest) {
  // Per-IP burst limit — inline (house pattern: app/api/email/contacts/phone).
  const rl = checkRateLimit(clientIpFromHeaders(req.headers));
  if (rl.limited) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    zip?: unknown;
    metric_key?: unknown;
  } | null;
  const zip = typeof body?.zip === "string" ? body.zip : "";
  const metricKey = typeof body?.metric_key === "string" ? body.metric_key : "";
  if (!VALID_ZIP.test(zip) || !metricKey || !resolveZip(zip).in_scope) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await findFigure(zip, metricKey);
  if (result.ok) {
    return NextResponse.json({ found: true, figure: result.figure, cached: result.cached });
  }
  if (result.reason === "not_found") {
    return NextResponse.json({ found: false, pointer: result.pointer });
  }
  if (result.reason === "not_allowed") {
    return NextResponse.json({ error: "not_allowed" }, { status: 400 });
  }
  if (result.reason === "capped") {
    return NextResponse.json({ error: "capped" }, { status: 429 });
  }
  return NextResponse.json({ error: "unavailable" }, { status: 503 });
}
```

- [ ] **Step 2: Write the client component**

```tsx
// app/r/zip-report/_components/find-it-button.tsx
//
// Find-it slot (spec §5) — renders where a source structurally can't cover this
// ZIP. Click → the engine finds the number live with a named source, or honestly
// reports the miss with a pointer to the real issuing source. Found figures are
// cached server-side, so everyone (page, assistant, builders) gets the number.
"use client";

import { useState } from "react";

export interface FoundFigure {
  key: string;
  label: string;
  value: string;
  source: string;
  source_url: string;
  as_of?: string;
}

interface Pointer {
  name: string;
  url: string;
}

type Phase = "idle" | "finding" | "found" | "not_found" | "error";

export function FindItButton({
  zip,
  metricKey,
  label,
  coverage,
  initialFigure,
}: {
  zip: string;
  metricKey: string;
  /** Card title, e.g. "New Permits (90 Days)". */
  label: string;
  /** The real issuing source — shown as the coverage line and the miss pointer. */
  coverage: Pointer;
  /** A figure already cached for this slot → render found state with no click. */
  initialFigure?: FoundFigure | null;
}) {
  const [phase, setPhase] = useState<Phase>(initialFigure ? "found" : "idle");
  const [figure, setFigure] = useState<FoundFigure | null>(initialFigure ?? null);
  const [pointer, setPointer] = useState<Pointer>(coverage);

  async function onFind() {
    setPhase("finding");
    try {
      const res = await fetch("/api/figures/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip, metric_key: metricKey }),
      });
      const json = (await res.json().catch(() => null)) as {
        found?: boolean;
        figure?: FoundFigure;
        pointer?: Pointer;
      } | null;
      if (res.ok && json?.found && json.figure) {
        setFigure(json.figure);
        setPhase("found");
      } else if (res.ok && json) {
        if (json.pointer) setPointer(json.pointer);
        setPhase("not_found");
      } else {
        setPhase("error");
      }
    } catch {
      setPhase("error");
    }
  }

  const sourceLink = (
    <a
      href={pointer.url}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-white/30 underline-offset-2 hover:text-white"
    >
      {pointer.name}
    </a>
  );

  return (
    <div className="rounded-xl glass-card-modern border border-dashed border-white/15 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>

      {phase === "found" && figure ? (
        <>
          <p className="mt-1 font-mono text-lg font-semibold text-white">{figure.value}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            <a
              href={figure.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-white/30 underline-offset-2 hover:text-white"
            >
              {figure.source}
            </a>
            {figure.as_of ? ` · as of ${figure.as_of}` : ""}
          </p>
        </>
      ) : phase === "finding" ? (
        <p className="mt-2 text-sm text-gray-400">Finding it from a named source…</p>
      ) : phase === "not_found" ? (
        <p className="mt-2 text-sm leading-relaxed text-gray-400">
          No published figure found. The issuing source is {sourceLink}.
        </p>
      ) : phase === "error" ? (
        <p className="mt-2 text-sm text-gray-400">Couldn&apos;t run the lookup right now — try again.</p>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            Not in our data for this ZIP — permits here are issued by {sourceLink}.
          </p>
          <button
            type="button"
            onClick={onFind}
            className="mt-3 inline-flex items-center rounded-lg border border-teal-primary/40 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-teal-primary"
          >
            Find it →
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify compile**

Run: `bunx next build`
Expected: build succeeds (route + component compile; page wiring comes in Task 8).

- [ ] **Step 4: Commit**

```bash
git add app/api/figures/find/route.ts app/r/zip-report/_components/find-it-button.tsx
git commit -m "feat(zip-report): /api/figures/find endpoint + Find-it button component"
```

---

### Task 7: Candidate builder — `lib/zip-report/candidates.ts`

**Files:**
- Create: `lib/zip-report/candidates.ts`
- Test: `lib/zip-report/candidates.test.ts`
- Modify: `verification/supabase-untyped-allowlist.json` (add `"lib/zip-report/candidates.ts"` to the array — it reads `data_lake.census_acs_zcta` via the untyped hatch)

**Interfaces:**
- Consumes: `percentileOf`, `SignalCandidate` (Task 3); `findGap` (Task 5); `createServiceRoleClientUntyped`; `resolveZip`.
- Produces (used by Task 8):
  - `interface GapSlot { metric_key: string; label: string; coverage: { name: string; url: string } }`
  - `interface CandidateInput { zip: string; housingRows: { key: string; cells: Record<string, number | string | boolean | null> }[]; housingSource?: { label: string; url: string }; floodRows: { zip: string; aal: number; pctRank: number | null }[]; floodForZip: { zip: string; aal: number; pctRank: number | null } | null; floodSource?: { label: string; url: string }; permitsCounts: Map<string, number>; permitsSource?: { label: string; url: string }; censusValues: { key: string; label: string; value: number; display: string; sourceLabel: string; sourceUrl: string }[]; censusDistribution: Map<string, number[]> }`
  - `buildZipCandidates(input: CandidateInput): { candidates: SignalCandidate[]; gaps: GapSlot[] }` — pure.
  - `loadCensusSignals(zip: string): Promise<{ numericByKey: Map<string, number>; distribution: Map<string, number[]> }>` — I/O, empty-tolerant.
  - `TOTAL_SWFL_ZIPS = 57` (exported constant for the flood key_metrics fallback).

- [ ] **Step 1: Write the failing test**

```ts
// lib/zip-report/candidates.test.ts
import { describe, expect, test } from "bun:test";
import { buildZipCandidates, type CandidateInput } from "./candidates";

function baseInput(over: Partial<CandidateInput> = {}): CandidateInput {
  return {
    zip: "33914",
    housingRows: [],
    floodRows: [],
    floodForZip: null,
    permitsCounts: new Map(),
    censusValues: [],
    censusDistribution: new Map(),
    ...over,
  };
}

const HOUSING_ROWS = [
  { key: "33914", cells: { median_sale_price: 485_000, median_sale_price_yoy_pct: 18, median_dom: 60, median_dom_yoy_days: 12, homes_sold: 90, inventory: 300, months_of_supply: 5, avg_sale_to_list_pct: 96 } },
  { key: "33901", cells: { median_sale_price: 300_000, median_sale_price_yoy_pct: null, median_dom: 40, median_dom_yoy_days: null, homes_sold: 50, inventory: 100, months_of_supply: 3, avg_sale_to_list_pct: 97 } },
  { key: "34102", cells: { median_sale_price: 900_000, median_sale_price_yoy_pct: 2, median_dom: 80, median_dom_yoy_days: -5, homes_sold: 20, inventory: 200, months_of_supply: 8, avg_sale_to_list_pct: 94 } },
];

describe("buildZipCandidates — housing", () => {
  test("price candidate: percentile from the all-ZIP distribution + YoY movement restated", () => {
    const { candidates } = buildZipCandidates(baseInput({ housingRows: HOUSING_ROWS }));
    const price = candidates.find((c) => c.key === "median_sale_price")!;
    expect(price.covered).toBe(true);
    expect(price.percentile).toBe(50); // middle of 3
    expect(price.rankPos).toBe(2);
    expect(price.rankOf).toBe(3);
    expect(price.movementPct).toBe(18);
    expect(price.movementText).toBe("↑ 18% YoY");
    expect(price.display).toBe("$485K");
  });

  test("DOM movement % derives from held days delta: 12 days on a 48-day prior = +25%", () => {
    const { candidates } = buildZipCandidates(baseInput({ housingRows: HOUSING_ROWS }));
    const dom = candidates.find((c) => c.key === "median_dom")!;
    expect(dom.movementPct).toBe(25); // 12 / (60 - 12) * 100
    expect(dom.movementText).toBe("↑ 12 days YoY");
  });
});

describe("buildZipCandidates — flood", () => {
  test("flood candidate ranks from the all-ZIP table rows", () => {
    const floodRows = [
      { zip: "33914", aal: 500, pctRank: null },
      { zip: "33931", aal: 30_000, pctRank: null },
      { zip: "33901", aal: 100, pctRank: null },
    ];
    const { candidates } = buildZipCandidates(
      baseInput({ floodRows, floodForZip: floodRows[0] }),
    );
    const flood = candidates.find((c) => c.key === "flood_aal")!;
    expect(flood.covered).toBe(true);
    expect(flood.percentile).toBe(50);
    expect(flood.rankPos).toBe(2);
    expect(flood.rankOf).toBe(3);
  });

  test("key_metrics fallback (no table rows): held pct_rank used, rankOf = 57", () => {
    const { candidates } = buildZipCandidates(
      baseInput({ floodRows: [], floodForZip: { zip: "33914", aal: 500, pctRank: 89.29 } }),
    );
    const flood = candidates.find((c) => c.key === "flood_aal")!;
    expect(flood.percentile).toBe(89);
    expect(flood.rankOf).toBe(57);
  });

  test("no flood data at all → no flood candidate (it doesn't compete)", () => {
    const { candidates } = buildZipCandidates(baseInput());
    expect(candidates.find((c) => c.key === "flood_aal")).toBeUndefined();
  });
});

describe("buildZipCandidates — permits + gaps", () => {
  test("covered permits ZIP → candidate, no gap", () => {
    const { candidates, gaps } = buildZipCandidates(
      baseInput({ zip: "33901", permitsCounts: new Map([["33901", 120], ["33914", 0], ["33903", 40]]) }),
    );
    expect(candidates.find((c) => c.key === "permits_90d")?.covered).toBe(true);
    expect(gaps).toEqual([]);
  });

  test("city-permitted ZIP with zero Accela rows → Find-it gap slot, no candidate", () => {
    const { candidates, gaps } = buildZipCandidates(
      baseInput({ zip: "33914", permitsCounts: new Map([["33901", 120]]) }),
    );
    expect(candidates.find((c) => c.key === "permits_90d")).toBeUndefined();
    expect(gaps.length).toBe(1);
    expect(gaps[0].metric_key).toBe("permits_90d");
    expect(gaps[0].coverage.name).toBe("City of Cape Coral permitting");
  });

  test("non-city ZIP with zero permits → no candidate AND no gap (not allowlisted)", () => {
    const { candidates, gaps } = buildZipCandidates(
      baseInput({ zip: "33901", permitsCounts: new Map() }),
    );
    expect(candidates.find((c) => c.key === "permits_90d")).toBeUndefined();
    expect(gaps).toEqual([]);
  });
});

describe("buildZipCandidates — census", () => {
  test("census value gets percentile from its SWFL distribution", () => {
    const { candidates } = buildZipCandidates(
      baseInput({
        censusValues: [
          { key: "median_household_income", label: "Median household income", value: 90_000, display: "$90,000", sourceLabel: "U.S. Census ACS 5-year (2019–2023)", sourceUrl: "https://data.census.gov/" },
        ],
        censusDistribution: new Map([["median_household_income", [40_000, 60_000, 90_000, 120_000]]]),
      }),
    );
    const inc = candidates.find((c) => c.key === "median_household_income")!;
    expect(inc.percentile).toBe(67);
    expect(inc.rankPos).toBe(2);
    expect(inc.rankOf).toBe(4);
    expect(inc.movementPct).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/zip-report/candidates.test.ts`
Expected: FAIL — `Cannot find module './candidates'`

- [ ] **Step 3: Implement**

```ts
// lib/zip-report/candidates.ts
//
// Builds the ZIP page's SignalCandidate pool (spec §2, pool v1) from data the page
// already loads: housing_by_zip (all-ZIP distribution held in the brain),
// flood_by_zip (all-ZIP detail table, key_metrics fallback), permits_by_zip, and
// census ACS covariates + their SWFL distribution. Pure math over held values —
// percentiles/ranks are computed from held distributions, movement restates held
// deltas. No invented numbers; an absent metric simply doesn't compete.
import { percentileOf, type SignalCandidate } from "./signal-rank";
import { findGap, type MetricGapCoverage } from "@/lib/figures/metric-gaps";
// KNOWN-DEBT(data_lake: census_acs_zcta lives in the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";

/** Denominator for the flood key_metrics fallback (matches the page's historical constant). */
export const TOTAL_SWFL_ZIPS = 57;

export interface GapSlot {
  metric_key: string;
  label: string;
  coverage: MetricGapCoverage;
}

export interface HousingZipRow {
  key: string;
  cells: Record<string, number | string | boolean | null>;
}

export interface FloodZipRow {
  zip: string;
  aal: number;
  /** Held SWFL percentile rank (from the brain), when present. */
  pctRank: number | null;
}

export interface CensusValue {
  key: string;
  label: string;
  value: number;
  display: string;
  sourceLabel: string;
  sourceUrl: string;
}

export interface CandidateInput {
  zip: string;
  housingRows: HousingZipRow[];
  housingSource?: { label: string; url: string };
  floodRows: FloodZipRow[];
  floodForZip: FloodZipRow | null;
  floodSource?: { label: string; url: string };
  permitsCounts: Map<string, number>;
  permitsSource?: { label: string; url: string };
  censusValues: CensusValue[];
  censusDistribution: Map<string, number[]>;
}

const fmtUsdShort = (v: number): string => {
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return "$" + Math.round(v / 1_000) + "K";
  return "$" + v.toLocaleString("en-US");
};

const arrow = (n: number) => (n > 0 ? "↑" : "↓");

interface HousingMetricSpec {
  key: string;
  cell: string;
  label: string;
  sub: string;
  display: (v: number) => string;
}

const HOUSING_METRICS: HousingMetricSpec[] = [
  { key: "median_sale_price", cell: "median_sale_price", label: "Median Home Value", sub: "90-day median sale price", display: fmtUsdShort },
  { key: "median_dom", cell: "median_dom", label: "Days on Market", sub: "90-day median", display: (v) => `${v} days` },
  { key: "avg_sale_to_list_pct", cell: "avg_sale_to_list_pct", label: "Sale-to-List Ratio", sub: "Average, 90-day window", display: (v) => `${v}%` },
  { key: "months_of_supply", cell: "months_of_supply", label: "Months of Supply", sub: "At the current sales pace", display: (v) => `${v} mo` },
  { key: "homes_sold", cell: "homes_sold", label: "Homes Sold", sub: "Last 90 days", display: (v) => v.toLocaleString("en-US") },
  { key: "inventory", cell: "inventory", label: "Active Inventory", sub: "Homes for sale now", display: (v) => v.toLocaleString("en-US") },
];

function numCell(row: HousingZipRow | undefined, cell: string): number | null {
  const v = row?.cells[cell];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function buildZipCandidates(input: CandidateInput): {
  candidates: SignalCandidate[];
  gaps: GapSlot[];
} {
  const candidates: SignalCandidate[] = [];
  const gaps: GapSlot[] = [];
  const row = input.housingRows.find((r) => r.key === input.zip);

  // ── Housing — percentile from the all-ZIP detail table the page already loads.
  for (const spec of HOUSING_METRICS) {
    const v = numCell(row, spec.cell);
    if (v == null) continue;
    const dist = input.housingRows
      .map((r) => numCell(r, spec.cell))
      .filter((n): n is number => n != null);
    const pct = percentileOf(dist, v);

    let movementPct: number | null = null;
    let movementText: string | undefined;
    if (spec.key === "median_sale_price") {
      const yoy = numCell(row, "median_sale_price_yoy_pct");
      if (yoy != null && yoy !== 0) {
        movementPct = yoy;
        movementText = `${arrow(yoy)} ${Math.abs(yoy)}% YoY`;
      }
    } else if (spec.key === "median_dom") {
      const days = numCell(row, "median_dom_yoy_days");
      if (days != null && days !== 0) {
        const prior = v - days;
        movementPct = prior > 0 ? Math.round((days / prior) * 100) : null;
        movementText = `${arrow(days)} ${Math.abs(days)} days YoY`;
      }
    }

    candidates.push({
      key: spec.key,
      label: spec.label,
      display: spec.display(v),
      sub: spec.sub,
      percentile: pct?.percentile ?? null,
      rankPos: pct?.rankPos,
      rankOf: pct?.rankOf,
      movementPct,
      movementText,
      covered: true,
      source: input.housingSource,
    });
  }

  // ── Flood — all-ZIP detail table preferred; key_metrics fallback keeps today's page working.
  if (input.floodForZip) {
    const f = input.floodForZip;
    let percentile: number | null = null;
    let rankPos: number | undefined;
    let rankOf: number | undefined;
    if (input.floodRows.length > 1) {
      const pct = percentileOf(
        input.floodRows.map((r) => r.aal),
        f.aal,
      );
      percentile = pct?.percentile ?? null;
      rankPos = pct?.rankPos;
      rankOf = pct?.rankOf;
    } else if (f.pctRank != null) {
      percentile = Math.round(f.pctRank);
      rankOf = TOTAL_SWFL_ZIPS;
      rankPos = Math.max(1, Math.round((1 - percentile / 100) * TOTAL_SWFL_ZIPS) + 1);
    }
    candidates.push({
      key: "flood_aal",
      label: "Annual Flood Loss",
      display: fmtUsdShort(f.aal),
      sub: "Flood insurance avg/home per year",
      percentile,
      rankPos,
      rankOf,
      movementPct: null,
      covered: true,
      source: input.floodSource,
    });
  }

  // ── Permits — competes only where the Lee Accela feed covers (count > 0).
  const permitCount = input.permitsCounts.get(input.zip) ?? 0;
  if (permitCount > 0) {
    const dist = [...input.permitsCounts.values()].filter((n) => n > 0);
    const pct = percentileOf(dist, permitCount);
    candidates.push({
      key: "permits_90d",
      label: "New Permits (90 Days)",
      display: permitCount.toLocaleString("en-US"),
      sub: "Lee County building permits",
      percentile: pct?.percentile ?? null,
      rankPos: pct?.rankPos,
      rankOf: pct?.rankOf,
      movementPct: null,
      covered: true,
      source: input.permitsSource,
    });
  } else {
    // Structurally-absent source → Find-it slot (never an em-dash, never a fake zero).
    const gap = findGap("permits_90d", input.zip);
    if (gap) {
      gaps.push({
        metric_key: "permits_90d",
        label: "New Permits (90 Days)",
        coverage: gap.coverage,
      });
    }
  }

  // ── Census — joins the same ranked pool; percentile from the SWFL ACS distribution.
  for (const cv of input.censusValues) {
    const dist = input.censusDistribution.get(cv.key) ?? [];
    const pct = dist.length > 1 ? percentileOf(dist, cv.value) : null;
    candidates.push({
      key: cv.key,
      label: cv.label,
      display: cv.display,
      sub: cv.sourceLabel,
      percentile: pct?.percentile ?? null,
      rankPos: pct?.rankPos,
      rankOf: pct?.rankOf,
      movementPct: null,
      covered: true,
      source: { label: cv.sourceLabel, url: cv.sourceUrl },
    });
  }

  return { candidates, gaps };
}

// ---------------------------------------------------------------------------
// Census signals loader — numeric per-ZIP values + the SWFL distribution, one
// query. Empty-tolerant: no creds / no rows / error → empty maps, never throws.
// ---------------------------------------------------------------------------

/** ACS column → the figure key loadZipQuickSummary already uses (render-once join). */
const CENSUS_KEY_BY_COLUMN: Record<string, string> = {
  total_population: "population",
  median_household_income: "median_household_income",
  median_age: "median_age",
  owner_occupied_pct: "owner_occupied",
  avg_household_size: "household_size",
  poverty_rate: "poverty_rate",
  employment_rate: "employment_rate",
  moved_in_past_year_pct: "moved_past_year",
};

export async function loadCensusSignals(zip: string): Promise<{
  numericByKey: Map<string, number>;
  distribution: Map<string, number[]>;
}> {
  const empty = { numericByKey: new Map<string, number>(), distribution: new Map<string, number[]>() };
  let db: ReturnType<typeof createServiceRoleClientUntyped>;
  try {
    db = createServiceRoleClientUntyped();
  } catch {
    return empty;
  }
  try {
    const { data, error } = await db
      .schema("data_lake")
      .from("census_acs_zcta")
      .select(`geo_id, ${Object.keys(CENSUS_KEY_BY_COLUMN).join(", ")}`);
    if (error || !data) return empty;
    const numericByKey = new Map<string, number>();
    const distribution = new Map<string, number[]>();
    for (const raw of data as Record<string, unknown>[]) {
      const geoId = typeof raw.geo_id === "string" ? raw.geo_id : "";
      if (!/^\d{5}$/.test(geoId) || !resolveZip(geoId).in_scope) continue;
      for (const [col, key] of Object.entries(CENSUS_KEY_BY_COLUMN)) {
        const n = Number(raw[col]);
        if (!Number.isFinite(n)) continue;
        const arr = distribution.get(key) ?? [];
        arr.push(n);
        distribution.set(key, arr);
        if (geoId === zip) numericByKey.set(key, n);
      }
    }
    return { numericByKey, distribution };
  } catch {
    return empty;
  }
}
```

- [ ] **Step 4: Add the untyped-hatch allowlist entry**

In `verification/supabase-untyped-allowlist.json`, add `"lib/zip-report/candidates.ts"` to the existing array (alphabetical position within the list).

- [ ] **Step 5: Run tests**

Run: `bun test lib/zip-report/candidates.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/zip-report/candidates.ts lib/zip-report/candidates.test.ts verification/supabase-untyped-allowlist.json
git commit -m "feat(zip-report): candidate pool builder (housing/flood/permits/census) + census distribution loader"
```

---

### Task 8: ZIP page restructure — render-once, signal-led

**Files:**
- Modify: `app/r/zip-report/[zip]/page.tsx`

**Interfaces:**
- Consumes: `rankSignals`, `RankedSignal` (Task 3); `buildZipCandidates`, `loadCensusSignals`, `TOTAL_SWFL_ZIPS`, `FloodZipRow`, `CensusValue` (Task 7); `getSourcedFigures` (Task 2); `FindItButton`, `FoundFigure` (Task 6); everything the page already imports.
- Produces: the restructured page. **Render-once invariant:** hero = top-3 ranked signals with why-tags; ranked grid = every remaining covered candidate exactly once + Find-it gap slots; rail = context/coverage card with ZERO metric values; the old at-a-glance blocks, rail number rows, and below-fold unified data grid are DELETED. Dossier sections, metro chart, CitationList, nearby ZIPs, funnel bridge, subscribe, footer, highlighter bridge all stay.

- [ ] **Step 1: Update imports and data assembly (top half of the file)**

Add imports (keep all existing ones except those that become unused — remove `resolveGradeConfig`/`DirectionPolarity` only if the delta-badge helpers go unused after the rewrite; `deltaForSlug`, `badgeColor` are deleted below):

```tsx
import { rankSignals, type RankedSignal } from "../../../../lib/zip-report/signal-rank";
import {
  buildZipCandidates,
  loadCensusSignals,
  TOTAL_SWFL_ZIPS,
  type CensusValue,
  type FloodZipRow,
  type GapSlot,
} from "../../../../lib/zip-report/candidates";
import { getSourcedFigures } from "../../../../lib/figures/sourced";
import { FindItButton, type FoundFigure } from "../../_components/find-it-button";
```

Delete the module-level `const TOTAL_SWFL_ZIPS = 57;` (now imported) and the `deltaForSlug` helper + `badgeColor` helper (movement now renders via candidate `movementText`).

Extend the parallel load:

```tsx
  const [housing, env, permits, dossier, summary, metroTrend, censusSignals, sourcedFigures] =
    await Promise.all([
      loadParsedBrain("housing-swfl"),
      loadParsedBrain("env-swfl"),
      loadParsedBrain("permits-swfl"),
      assembleLocationDossier(loc),
      loadZipQuickSummary(zip),
      loadMetroTrend("zhvi_pivoted"),
      loadCensusSignals(zip),
      getSourcedFigures({ kind: "zip", key: zip }),
    ]);
```

Replace the `// ── Housing`, `// ── Flood`, `// ── Home value ranking`, `// ── Permits`, and `// ── Delta badges` sections with:

```tsx
  // ── Housing (all-ZIP detail table — the candidate builder ranks from it) ──
  const housingTable = housing?.output.detail_tables?.find((t) => t.id === "housing_by_zip");
  const housingRows = housingTable?.rows ?? [];
  const housingRow = housingRows.find((r) => r.key === zip);
  const price = housingRow?.cells["median_sale_price"] as number | undefined;
  const dom = housingRow?.cells["median_dom"] as number | undefined;
  const saleToList = housingRow?.cells["avg_sale_to_list_pct"] as number | null | undefined;
  const mos = housingRow?.cells["months_of_supply"] as number | null | undefined;
  const homesSold = housingRow?.cells["homes_sold"] as number | null | undefined;
  const inventory = housingRow?.cells["inventory"] as number | null | undefined;
  const hasHousing = housingRow !== undefined && price !== undefined && dom !== undefined;
  const housingSource = housingTable
    ? { label: housingTable.source.citation || "SWFL Data Gulf", url: housingTable.source.url }
    : undefined;

  // ── Flood — flood_by_zip detail table first (all 57 ZIPs), key_metrics fallback ──
  const floodTable = env?.output.detail_tables?.find((t) => t.id === "flood_by_zip");
  const floodRows: FloodZipRow[] = (floodTable?.rows ?? [])
    .map((r) => ({
      zip: r.key,
      aal: r.cells["aal_usd_per_insured_property"] as number,
      pctRank: typeof r.cells["pct_rank"] === "number" ? (r.cells["pct_rank"] as number) : null,
    }))
    .filter((r) => typeof r.aal === "number" && Number.isFinite(r.aal));
  let floodForZip: FloodZipRow | null = floodRows.find((r) => r.zip === zip) ?? null;
  const floodMetric = env?.output.key_metrics.find(
    (m) => m.metric === `swfl_zip_${zip}_flood_aal_usd_per_insured_property`,
  );
  const rankMetric = env?.output.key_metrics.find(
    (m) => m.metric === `swfl_zip_${zip}_flood_aal_pct_swfl_rank`,
  );
  if (!floodForZip && floodMetric && rankMetric) {
    floodForZip = {
      zip,
      aal: floodMetric.value as number,
      pctRank: rankMetric.value as number,
    };
  }
  const hasFlood = floodForZip !== null;
  const floodSourceUrl = floodTable?.source.url ?? floodMetric?.source.url ?? "";
  const floodSourceCitation = floodTable?.source.citation ?? floodMetric?.source.citation ?? "";

  // ── Permits (unchanged aggregation; the builder decides covered vs gap) ──
  const permitsTable = permits?.output.detail_tables?.find((t) => t.id === "permits_by_zip");
  const permitsCountMap = new Map<string, number>();
  for (const r of permitsTable?.rows ?? []) {
    const n = r.cells["n_current"];
    if (typeof n === "number") {
      permitsCountMap.set(r.key, (permitsCountMap.get(r.key) ?? 0) + n);
    }
  }
  const permitsCount = permitsCountMap.get(zip) ?? 0;
  const hasPermits = permitsCount > 0;
  const permitsSourceUrl = hasPermits ? (permitsTable?.source.url ?? "") : "";
  const permitsSourceCitation = hasPermits
    ? (permitsTable?.source.citation ?? "Lee County permits")
    : "";

  // ── Candidate pool + deterministic ranking (spec §2) ──────────────────────
  const censusValues: CensusValue[] = summary.figures.flatMap((fig) => {
    const value = censusSignals.numericByKey.get(fig.key);
    if (value === undefined) return [];
    return [
      {
        key: fig.key,
        label: fig.label,
        value,
        display: fig.value,
        sourceLabel: fig.source_label,
        sourceUrl: fig.source_url,
      },
    ];
  });
  const { candidates, gaps } = buildZipCandidates({
    zip,
    housingRows,
    housingSource,
    floodRows,
    floodForZip,
    floodSource: floodSourceUrl
      ? { label: floodSourceCitation || "FEMA NFIP", url: floodSourceUrl }
      : undefined,
    permitsCounts: permitsCountMap,
    permitsSource: permitsSourceUrl
      ? { label: permitsSourceCitation, url: permitsSourceUrl }
      : undefined,
    censusValues,
    censusDistribution: censusSignals.distribution,
  });
  const ranked = rankSignals(candidates);
  const heroSignals = ranked.slice(0, 3);
  const gridSignals = ranked.slice(3);
  const sourcedByKey = new Map(sourcedFigures.map((f) => [f.key, f]));
```

Keep `fillColor` but source it from the new flood variable:

```tsx
  const fillColor = computeZipGradient(
    hasFlood ? (floodForZip as FloodZipRow).aal : undefined,
    FLOOD_GRADIENT.low,
    FLOOD_GRADIENT.high,
    FLOOD_GRADIENT.c0,
    FLOOD_GRADIENT.c1,
    FLOOD_GRADIENT.c2,
  );
```

Citations — keep the existing `sources` assembly, but swap the flood/permits guards to the new variables and append sourced figures:

```tsx
  const sources: SourceEntry[] = [];
  if (hasFlood && floodSourceUrl)
    sources.push({ label: floodSourceCitation || "FEMA NFIP", url: floodSourceUrl });
  if (hasPermits && permitsSourceUrl)
    sources.push({ label: permitsSourceCitation, url: permitsSourceUrl });
  for (const l of rollupLines) {
    if (l.source_url) sources.push({ label: l.source_citation || l.brain_id, url: l.source_url });
  }
  for (const fig of summary.figures) {
    if (fig.source_url) sources.push({ label: fig.source_label, url: fig.source_url });
  }
  for (const f of sourcedFigures) {
    sources.push({ label: f.source, url: f.source_url });
  }
```

Metric suggestions — keep the `hasHousing` block as-is; replace the `hasFlood` block's internals with the new variables:

```tsx
  if (hasFlood && floodForZip) {
    const aalVal = floodForZip.aal;
    const floodPctVal = floodForZip.pctRank != null ? Math.round(floodForZip.pctRank) : null;
    const fp = {
      sourceUrl: floodSourceUrl,
      sourceLabel: floodSourceCitation || "FEMA NFIP",
      freshnessToken,
    };
    metricSuggestions.push({
      label: "Avg Annual Loss",
      suggestions: suggestionsForMetric({ metric: "avg annual loss", value: aalVal }, "env-swfl"),
      value: `$${aalVal.toLocaleString(undefined, { maximumFractionDigits: 0 })} / yr`,
      ...fp,
    });
    if (floodPctVal !== null) {
      metricSuggestions.push({
        label: "SWFL percentile rank",
        suggestions: suggestionsForMetric(
          { metric: "SWFL percentile rank", value: floodPctVal },
          "env-swfl",
        ),
        value: `${floodPctVal}th`,
        ...fp,
      });
    }
  }
```

- [ ] **Step 2: Replace the render body — stats bar, at-a-glance, rail, unified grid**

2a. In the HERO identity block, DELETE the as-of line (`{asOf && <p className="mt-3 text-xs text-gray-500">As of {asOf}</p>}`) — the as-of date renders ONCE, in the rail.

2b. Replace the entire `{/* ── STATS BAR ... */}` block with the top-3 signal hero:

```tsx
      {/* ── HERO SIGNALS — this ZIP's top-3 ranked signals, each with its why ── */}
      {heroSignals.length > 0 && (
        <div className="zp-stats-bar">
          <div className="zp-stats-inner">
            {heroSignals.map((s) => (
              <div key={s.key} className="zp-stat-cell">
                <div className="zp-stat-label">{s.label}</div>
                <div className="zp-stat-value">{s.display}</div>
                {s.sub && <div className="zp-stat-sub">{s.sub}</div>}
                {s.why && <div className="zp-stat-tag">{s.why}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
```

2c. Replace the entire `{/* ── BODY: breakdown (left) + rail (right) ── */}` block (everything from `<div className="zp-body">` through the closing `</div>` after `</aside>`) with:

```tsx
      {/* ── BODY: ranked grid (left) + context rail (right) — every number once ── */}
      <div className="zp-body">
        <div className="zp-breakdown-header">
          <h1 className="zp-breakdown-title">{zip} in detail</h1>
        </div>

        {/* LEFT — every remaining held metric exactly once, ranked; gaps become Find-it */}
        <div className="zp-breakdown">
          {didYouMean && <DidYouMeanBanner message={didYouMean} />}

          <div className="grid gap-3 sm:grid-cols-2">
            {gridSignals.map((s) => (
              <SignalCard key={s.key} s={s} />
            ))}
            {gaps.map((g) => (
              <FindItButton
                key={g.metric_key}
                zip={zip}
                metricKey={g.metric_key}
                label={g.label}
                coverage={g.coverage}
                initialFigure={(sourcedByKey.get(g.metric_key) as FoundFigure | undefined) ?? null}
              />
            ))}
          </div>
        </div>

        {/* RIGHT — context & coverage card. No metric values here, ever. */}
        <aside className="zp-rail">
          <div className="zp-rail-header">
            <div className="zp-rail-metric-name">About This Page</div>
            <div className="zp-rail-sublabel">What leads and why</div>
          </div>
          <div className="zp-rail-zip-header">
            <div className="zp-rail-zip-code">{zip}</div>
            {primaryPlace && <div className="zp-rail-place">{primaryPlace}</div>}
            {res.county_names[0] && (
              <div className="zp-rail-county">{res.county_names[0]} County</div>
            )}
          </div>

          <p className="mt-4 text-xs leading-relaxed text-gray-400">
            The numbers up top are this area&apos;s strongest signals — ranked by how far
            they sit from the Southwest Florida middle and how fast they&apos;re moving.
            Everything else we hold is in the grid, each figure exactly once.
          </p>

          {asOf && <p className="mt-3 text-xs text-gray-500">As of {asOf}</p>}

          {gaps.map((g) => (
            <p key={g.metric_key} className="mt-3 text-xs leading-relaxed text-gray-500">
              Building permits here are issued by the{" "}
              <a
                href={g.coverage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-white/30 underline-offset-2 hover:text-white"
              >
                {g.coverage.name.replace(/ permitting$/, "")}
              </a>{" "}
              — not the county feed our permit counts come from.
            </p>
          ))}

          <div className="zp-rail-footer">Every figure is cited — sources listed below.</div>
        </aside>
      </div>
```

2d. DELETE the entire below-fold `{/* Unified data grid — census + housing + flood, same card style */}` section (`<section id="section-data">` and everything inside it) — those numbers now render once via the ranked grid. Keep the City/County/SWFL dossier sections, chart, CitationList, nearby, funnel bridge, subscribe, legend, footer exactly as they are.

2e. Add the `SignalCard` server helper next to the other helpers at the bottom of the file (replacing the deleted `badgeColor`):

```tsx
function SignalCard({ s }: { s: RankedSignal }) {
  return (
    <div className="rounded-xl glass-card-modern border border-white/10 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{s.label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-white">{s.display}</p>
      {s.sub && <p className="mt-0.5 text-xs text-gray-500">{s.sub}</p>}
      {s.why && <p className="mt-1 text-xs text-teal-primary/80">{s.why}</p>}
      {s.movementText && s.movementText !== s.why && (
        <p className="mt-1 text-xs text-gray-400">{s.movementText}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Clean up unused code**

Remove now-unused imports/variables the rewrite orphaned: `resolveGradeConfig` + `DirectionPolarity` (if nothing references them), the old `stripStatAnnotation` STAYS (dossier sections use it). Verify `price`, `dom`, `saleToList`, `mos`, `homesSold`, `inventory` are still used by `metricSuggestions`; keep them.

- [ ] **Step 4: Verify with build**

Run: `bunx next build`
Expected: compiles clean. Fix any unused-variable/type errors surfaced.

- [ ] **Step 5: Commit**

```bash
git add "app/r/zip-report/[zip]/page.tsx"
git commit -m "feat(zip-report): signal-led render-once page — ranked hero + grid, context rail, Find-it gap slots"
```

---

### Task 9: Builder feed merge — `lib/email/market-context.ts`

**Files:**
- Modify: `lib/email/market-context.ts`
- Test: `lib/email/market-context.test.ts` (extend)

**Interfaces:**
- Consumes: `getSourcedFigures`, `SourcedFigure` (Task 2).
- Produces: `mergeSourcedFigures(held: MarketFigure[], sourced: SourcedFigure[]): MarketFigure[]` (exported, pure); `loadMarketFigures` now folds cached sourced figures in — email lab AND social builders inherit automatically (market-context is the shared feed).

- [ ] **Step 1: Write the failing test** (append to `lib/email/market-context.test.ts`)

```ts
import { mergeSourcedFigures } from "./market-context";
import type { SourcedFigure } from "@/lib/figures/sourced";

describe("mergeSourcedFigures", () => {
  const held: MarketFigure[] = [
    { key: "home_value", label: "Median home value", value: "$485,000", source: "Zillow ZHVI", as_of: "06/30/2026" },
  ];
  const sourced: SourcedFigure[] = [
    { key: "permits_90d", label: "New building permits issued in ZIP 33914 (Cape Coral), last 90 days", value: "412", source: "capecoral.gov", source_url: "https://www.capecoral.gov/x", as_of: "06/30/2026" },
    { key: "home_value", label: "dupe", value: "$999", source: "elsewhere", source_url: "https://x", as_of: undefined },
  ];

  test("a stored figure appears in builder context with citation + as-of", () => {
    const merged = mergeSourcedFigures(held, sourced);
    const found = merged.find((f) => f.key === "permits_90d");
    expect(found).toBeDefined();
    expect(found!.value).toBe("412");
    expect(found!.source).toBe("capecoral.gov");
    expect(found!.as_of).toBe("06/30/2026");
  });

  test("held lake figures win on key collision — sourced never overrides", () => {
    const merged = mergeSourcedFigures(held, sourced);
    const hv = merged.filter((f) => f.key === "home_value");
    expect(hv.length).toBe(1);
    expect(hv[0].value).toBe("$485,000");
  });
});
```

(If the test file lacks `describe`/`expect` imports from `bun:test`, extend its existing import line.)

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/email/market-context.test.ts`
Expected: new tests FAIL (`mergeSourcedFigures` not exported); existing PASS.

- [ ] **Step 3: Implement**

3a. Add the import at the top of `lib/email/market-context.ts`:

```ts
import { getSourcedFigures, type SourcedFigure } from "@/lib/figures/sourced";
```

3b. Add the pure merger above `loadMarketFigures`:

```ts
/** Fold cached lane-3 figures (sourced_figures) into the builder feed. Held lake
 *  figures win on key collision — a found figure only fills a key the lake doesn't
 *  cover. Pure; exported for tests. */
export function mergeSourcedFigures(
  held: MarketFigure[],
  sourced: SourcedFigure[],
): MarketFigure[] {
  const heldKeys = new Set(held.map((f) => f.key));
  const extra = sourced
    .filter((s) => !heldKeys.has(s.key))
    .map((s) => ({ key: s.key, label: s.label, value: s.value, source: s.source, as_of: s.as_of }));
  return [...held, ...extra];
}
```

3c. In `loadMarketFigures`, replace the final assembly:

```ts
  const { figures, discrepancies } = singleSourcePerMetric(figs);
```

with:

```ts
  // Shared lane-3 cache: figures found via the Find-it button ride into every
  // builder (email lab + social) — found numbers are platform-wide, never page-local.
  let merged = figs;
  if (scope.kind === "zip" || scope.kind === "county") {
    try {
      const sourced = await getSourcedFigures({ kind: scope.kind, key: scope.value });
      merged = mergeSourcedFigures(figs, sourced);
    } catch {
      /* degrade — held figures only */
    }
  }
  const { figures, discrepancies } = singleSourcePerMetric(merged);
```

- [ ] **Step 4: Run tests**

Run: `bun test lib/email/market-context.test.ts && bun test lib/email/zip-seed.test.ts`
Expected: PASS (zip-seed mocks the db chain at the service-role seam; `getSourcedFigures` degrades to `[]` under the mock or missing table — confirm no failures; if the zip-seed mock throws on the new `.from("sourced_figures")` call, extend that mock to return an empty chain the same way its other tables do).

- [ ] **Step 5: Commit**

```bash
git add lib/email/market-context.ts lib/email/market-context.test.ts
git commit -m "feat(email): merge cached sourced figures into the builder data feed (held figures win)"
```

---

### Task 10: Assistant located-ZIP seam — `lib/assistant/conversation-path.ts`

**Files:**
- Modify: `lib/assistant/conversation-path.ts` (located-ZIP branch — the seam named after probing per spec §1)
- Modify: `lib/assistant/conversation-path.test.ts` (mock the new module seam)

**Interfaces:**
- Consumes: `sourcedFiguresBlockForZip` (Task 2).
- Produces: the located-ZIP grounded system prompt now carries the FOUND FIGURES block (empty string when nothing is cached — zero-cost no-op).

- [ ] **Step 1: Keep tests deterministic — mock the seam**

In `lib/assistant/conversation-path.test.ts`, add alongside the existing `mock.module` calls (and register the original in the `ORIG` snapshot map the file maintains, following the same pattern as the `@/lib/welcome/dossier-cache` entry):

```ts
mock.module("@/lib/figures/sourced", () => ({
  sourcedFiguresBlockForZip: async () => "",
  getSourcedFigures: async () => [],
  sourcedFiguresPromptBlock: () => "",
  mapSourcedRows: () => [],
}));
```

- [ ] **Step 2: Wire the block in the located branch**

2a. Add the import at the top of `conversation-path.ts`:

```ts
import { sourcedFiguresBlockForZip } from "@/lib/figures/sourced";
```

2b. In the located-ZIP branch, directly after `const system = buildWelcomeGroundedSystem({ ... });`, add:

```ts
  // Shared lane-3 cache — figures found via the ZIP page's Find-it button ground
  // this answer too, so the assistant never says "I don't know" about a number
  // the platform already found and cited. "" when nothing is cached (no-op).
  const sourcedBlock = await sourcedFiguresBlockForZip(dossier.zip);
```

2c. Include it in the final `streamAnswer` concatenation for the located path:

```ts
  return streamAnswer(
    system +
      locatedChartBlock +
      sourcedBlock +
      gapBlock +
      buildUploadsBlock(uploadsText) +
      clientContext +
      otherProjectsBlock,
    messages,
    GROUNDED_MAX_TOKENS,
    prelude,
  );
```

- [ ] **Step 3: Run the assistant suites**

Run: `bun test lib/assistant/conversation-path.test.ts && bun test lib/assistant/`
Expected: PASS (all — including the display-leak wall; the block carries only labels, values, and source names, no internal IDs).

- [ ] **Step 4: Commit**

```bash
git add lib/assistant/conversation-path.ts lib/assistant/conversation-path.test.ts
git commit -m "feat(assistant): located answers ground on cached sourced figures (found numbers are platform-wide)"
```

---

### Task 11: Full verification + session bookkeeping

**Files:**
- Modify: `SESSION_LOG.md` (new top entry)
- Modify: `_AUDIT_AND_ROADMAP/build-queue.md` (flip the zip-signal-hero line to built/in-review wording)

- [ ] **Step 1: Full test + build sweep**

Run:
```bash
bun test lib/figures/ lib/zip-report/ lib/email/market-context.test.ts lib/assistant/conversation-path.test.ts refinery/packs/env-swfl.test.mts && bunx next build
```
Expected: all PASS; build clean. If a pre-existing flaky test reddens (proposal-nonce), loop it locally before blaming the diff (memory rule).

- [ ] **Step 2: Manual smoke (local, no paid calls)**

Run: `bun run dev` (or the project's dev command) and load `/r/zip-report/33914` and `/r/zip-report/33957`.
Expected: 33914 — no em-dashes; hero = its top-3 signals with why-tags; permits slot renders the Find-it button (do NOT click it — the cold path is a paid call; operator runs `zip_signal_hero_live_verify`). 33957 — flood leads only if it genuinely ranks top-3 by score. Note: flood for non-top-6 ZIPs appears only after the operator's env-swfl `--target-only` rebuild lands the detail table in `brains/env-swfl.md`.

- [ ] **Step 3: SESSION_LOG entry + build-queue sync**

Append a top-of-file `SESSION_LOG.md` entry: what shipped (signal ranker, render-once page, flood_by_zip emission, sourced_figures store + Find-it lane, market-context + assistant wiring), what's operator-run next (env-swfl targeted rebuild, `zip_signal_hero_live_verify` live click-through), and the plan path. Sync the `_AUDIT_AND_ROADMAP/build-queue.md` line in the same commit.

- [ ] **Step 4: Commit bookkeeping — then STOP**

```bash
git add SESSION_LOG.md _AUDIT_AND_ROADMAP/build-queue.md
git commit -m "log: zip-signal-hero build session entry + queue sync"
git log --oneline origin/main..HEAD
```

Show the log to the operator and **ask before pushing** (no autonomous push; `node scripts/safe-push.mjs` only after explicit go — and check for foreign commits per the safe-push memory rules). Do NOT close `zip_signal_hero_live_verify` — it's operator-run against prod.

---

## Self-review (done at authoring time)

- **Spec coverage:** §1 store+reader+3 consumers → Tasks 1, 2, 8, 9, 10 (assistant seam named: `lib/assistant/conversation-path.ts` located branch, probed). §2 ranker → Task 3. §3 render-once page → Task 8. §4 flood_by_zip → Task 4. §5 Find-it → Tasks 5, 6, 8. §6 non-goals respected (no new brains, fixed allowlist, no city ingest). §7 testing → each task's steps + Task 11.
- **Type consistency:** `SourcedFigure`/`SourcedRow`/`mapSourcedRows` (T2) reused in T5/T8/T9/T10; `SignalCandidate`/`rankSignals`/`percentileOf` (T3) reused in T7/T8; `FloodZipRow`/`CensusValue`/`GapSlot`/`TOTAL_SWFL_ZIPS` (T7) reused in T8; `makeDomainSearch` (T5) matches gap-fill's `SearchFn`.
- **No placeholders:** every code step carries the actual code; the two "probe" moments the spec required were resolved during planning, not deferred.
