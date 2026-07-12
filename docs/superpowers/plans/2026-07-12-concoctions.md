# Concoctions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 14 tasks, 31 files, 3 conflict groups, keywords: migration, schema, architecture

**Goal:** A curated, parameterized registry of data bundles (concoctions; user-facing "Datasets") whose slices materialize as ordinary grid blocks — values baked, bindings remembered — so users and the AI compose, splice, re-shape, rebind, and refresh deliverables, exported to email and social PNG.

**Architecture:** New `lib/concoctions/` layer (types re-exported from the pure doc contract, guard evaluator, registry of 4 starter defs, materializer with load/rebind/turn-into, freshness prober). One engine-owned `binding` field added to `EmailBlock` beside `layout` — AI patch paths cannot write it. Every existing renderer/export is untouched because block props still carry baked values. Lab surfaces (browser panel, chips, toggle) and author-engine seeding ride existing seams.

**Tech Stack:** bun:test, zod, Supabase service-role clients, `chart-image.ts` (SVG→PNG→`email-media`), `render-social-image.ts` (resvg), react-grid-layout v2 canvas.

**Spec:** `docs/superpowers/specs/2026-07-12-concoctions-design.md` · **Check:** `concoctions_live_verify`

## Global Constraints

- Never invent a number: every materialized value restates a held row verbatim (formatted, never computed beyond the def's declared derivations). Prose stays AI-authored under the existing no-invention lint.
- As-of renders `MM/DD/YYYY`, derived from rows (`metrics_verified_date`, `latest_at`, `period`, max `year`) — never a stamped constant, never the raw freshness token.
- `binding` is ENGINE-OWNED: never writable via `BlockContentPatchSchema` or `AuthoredBlockSchema` (both are zod strip-mode — the fence is "not listed"; tests pin it).
- `lib/email/doc/types.ts` imports from NO ONE — `BlockBinding` is therefore DEFINED there; `lib/concoctions/*` imports it.
- User-facing copy says "Datasets" — never concoction/registry/binding/lane (no system nouns).
- Refresh spends no AI tokens; staleness checks are metadata compares; auto-refresh (when the per-doc toggle is on) fires on the FIRST EDIT ACTION, never on open.
- data_lake reads use `createServiceRoleClientUntyped` + `.schema("data_lake")` (typed client is public-only); `public.corridor_profiles` uses the typed client.
- Known data traps are LAW in defs: corridors predicate `deleted_at IS NULL AND verification_status = 'verified'`; ZIP county rollups need `county IS NOT NULL` with `zip_code IS NULL` (the SWFL total row is `county IS NULL`); the NFIP view is `data_lake.fema_nfip_county_year` (no `_view` suffix); daily_truth `median_sale_price` values are all-NULL — use `median_asking_price`.
- Verify with `bunx next build` (never `npx tsc`). Tests are `bun:test` (`node --test` only for hooks — not used here).
- Commit per task with explicit paths (`git commit -- <paths>`); never `git add -A`; do NOT push (operator pushes; live `/api` surface).
- Lab features route through `capabilitiesFor` — new capability key `datasets: "paid-only"` (grid lane).

## File Structure

- `lib/email/doc/types.ts` (MODIFY) — `BlockBinding` + `binding?` on the block variant.
- `lib/email/doc/schema.ts` (MODIFY) — `BindingSchema`, merged `.and()` like `layout`; patch/author schemas untouched (that IS the fence).
- `lib/concoctions/types.ts` (NEW) — ColumnSpec/guards/def contract; re-exports binding types.
- `lib/concoctions/guards.ts` (NEW) + test — distribution guard evaluator (pure).
- `lib/concoctions/format.ts` (NEW) + test — one value formatter (pure).
- `lib/concoctions/defs/corridor-profiles.ts` (NEW) + test — first def.
- `lib/concoctions/defs/zip-listing-activity.ts`, `defs/nfip-storm-years.ts`, `defs/asking-price-trend.ts` (NEW) + tests.
- `lib/concoctions/registry.ts` (NEW) + test — `CONCOCTIONS`, `getConcoction`, `concoctionIndex`.
- `lib/concoctions/materialize.ts` (NEW) + test — mappers + load/rebind/turn-into.
- `lib/concoctions/chart-block.ts` (NEW) + test — rows → SVG → PNG → image block (upload DI'd).
- `lib/concoctions/freshness.ts` (NEW) + test — probeAsOf compare, per-block stale map.
- `lib/concoctions/author-section.ts` (NEW) + test — digit-free Datasets index for authorSystem + `resolveConcoction`.
- `lib/concoctions/social-export.ts` (NEW) + test — block selection → `SocialModel` → PNG.
- `app/api/concoctions/route.ts` (NEW) — GET index / POST load·rebind·turn-into·freshness.
- `components/email-lab/DatasetBrowser.tsx`, `components/email-lab/DatasetChip.tsx` (NEW) + tests; `app/email-lab/grid/EmailLabGridClient.tsx` (MODIFY — wiring only).
- `lib/email/lab/capabilities.ts` (MODIFY) — `datasets` routing key.
- `lib/email/build-doc.ts` (MODIFY) — dataset seeding pre-author (upsertChartBlock precedent).

## Starter data facts (ALL probed live 07/12/2026 — do not re-derive, do not trust older docs)

- `public.corridor_profiles` (27 verified rows): columns `corridor_name, city, corridor_type, evolution_direction, seasonal_index, cap_rate_pct, vacancy_rate_pct, absorption_sqft, asking_rent_psf, character, metrics_verified_date`. `cap_rate_pct` is near-constant (6.7 ×22 / 8.3 ×3 / null ×2) — guard-fenced, never a scatter axis. Real spread: `asking_rent_psf` $16.04–$60.84, `vacancy_rate_pct` 0.2–7.7.
- `data_lake.listing_transitions_recent_zip_stats`: `county, zip_code, price_cuts_90d, sales_90d, new_listings_90d, latest_at`. Contains per-ZIP rows, county rollups (`county NOT NULL, zip_code NULL`) AND one SWFL total (`county NULL, zip_code NULL`). `sales_90d` is thin at ZIP grain (Lee max 7) — guard-fenced pending the ingest-gap check.
- `data_lake.fema_nfip_county_year`: `county_code varchar, year bigint, claim_count bigint, paid_total_usd double`.
- `data_lake.daily_truth`: `metric_key, area, period date, value numeric, unit, source_title, source_url, …`. Read like `lib/desk/loaders.ts` (`metric_key='median_asking_price'`, city areas).

---

### Task 1: Binding contract on the pure doc layer

**Files:**
- Modify: `lib/email/doc/types.ts` (binding types + `binding?` on the variant at the mapped type, lines 368–370)
- Modify: `lib/email/doc/schema.ts` (BindingSchema `.and()` merge beside `layout`, line 329 pattern)
- Test: `lib/email/doc/binding-fence.test.ts` (NEW)

**Interfaces:**
- Consumes: existing `EmailBlock` mapped type, `LayoutSchema` merge pattern, `BlockContentPatchSchema`, `AuthoredBlockSchema`.
- Produces (every later task relies on these exact names): `BindingLane = "lake" | "upload" | "web" | "user"`, `BindingSlice { measures: string[]; dimension?: string; filter?: Record<string, string | number>; topN?: number }`, `BlockBinding { v: number; lane: BindingLane; concoctionId?: string; params?: Record<string, string | number>; bundleRef?: string; slice: BindingSlice; asOf: string; sourceLine: string }`, `BINDING_VERSION = 1`, and `EmailBlock` variants carrying `binding?: BlockBinding`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/email/doc/binding-fence.test.ts
import { describe, it, expect } from "bun:test";
import { EmailBlockSchema, BlockContentPatchSchema, AuthoredBlockSchema } from "./schema";
import { BINDING_VERSION } from "./types";

const BINDING = {
  v: BINDING_VERSION,
  lane: "lake",
  concoctionId: "corridor-profiles",
  params: { county: "Lee" },
  slice: { measures: ["asking_rent_psf"], dimension: "corridor_name" },
  asOf: "07/12/2026",
  sourceLine: "SWFL Data Gulf verified corridor metrics",
};

describe("binding fence", () => {
  it("EmailBlockSchema round-trips a binding", () => {
    const parsed = EmailBlockSchema.parse({
      id: "b1", type: "metric-card",
      props: { metricValue: "$16.50", metricLabel: "Rent PSF" },
      binding: BINDING,
    });
    expect(parsed.binding?.concoctionId).toBe("corridor-profiles");
    expect(parsed.binding?.lane).toBe("lake");
  });

  it("a block with NO binding parses unchanged (back-compat)", () => {
    const parsed = EmailBlockSchema.parse({ id: "b2", type: "text", props: { body: "hi" } });
    expect(parsed.binding).toBeUndefined();
  });

  it("the AI content-patch CANNOT write a binding (strip mode drops it)", () => {
    const patch = BlockContentPatchSchema.parse({ body: "new text", binding: BINDING });
    expect("binding" in patch).toBe(false);
  });

  it("the AUTHOR schema CANNOT write a binding (strip mode drops it)", () => {
    const authored = AuthoredBlockSchema.parse({
      type: "text", body: "authored text", binding: BINDING,
    });
    expect("binding" in authored).toBe(false);
  });

  it("rejects an unknown lane", () => {
    const r = EmailBlockSchema.safeParse({
      id: "b3", type: "text", props: {},
      binding: { ...BINDING, lane: "invented" },
    });
    expect(r.success).toBe(false);
  });
});
```

NOTE: if `AuthoredBlockSchema`'s parse input requires different top-level keys than shown (check its definition around `lib/email/doc/schema.ts:375-500` before writing), adapt the two fence tests to construct a minimal VALID input for each schema plus the smuggled `binding` key — the assertion (`"binding" in parsed === false`) is the contract, not the fixture shape. Same for `EmailBlockSchema`'s exact export name — confirm via `grep -n "export const.*BlockSchema" lib/email/doc/schema.ts` and use the real names.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/doc/binding-fence.test.ts`
Expected: FAIL — `BINDING_VERSION` not exported / binding key stripped by block schema.

- [ ] **Step 3: Add the types (pure layer)**

In `lib/email/doc/types.ts`, above the `BlockLayout` interface, add:

```ts
// ── Data binding (concoctions) ──────────────────────────────────────────────
// ENGINE-OWNED like `layout`: written only by the materializer
// (lib/concoctions/materialize.ts). The AI patch/author schemas never list it,
// so strip mode drops any attempt. Props still carry BAKED values — a binding
// is memory (refresh/rebind/turn-into/provenance), never render plumbing.

export const BINDING_VERSION = 1;

export type BindingLane = "lake" | "upload" | "web" | "user";

/** Which slice of the bundle this block renders. */
export interface BindingSlice {
  measures: string[];
  dimension?: string;
  filter?: Record<string, string | number>;
  topN?: number;
}

export interface BlockBinding {
  /** Binding schema version — old versions degrade to "can't refresh", never throw. */
  v: number;
  lane: BindingLane;
  /** lane "lake": registry id + params. */
  concoctionId?: string;
  params?: Record<string, string | number>;
  /** lanes "upload" | "web" | "user": reference to the extracted/cited/stated bundle. */
  bundleRef?: string;
  slice: BindingSlice;
  /** MM/DD/YYYY at materialization — the chip + staleness compare read this. */
  asOf: string;
  sourceLine: string;
}
```

Then extend the block variant (types.ts:368-370) to:

```ts
export type EmailBlock = {
  [K in BlockType]: {
    id: string;
    type: K;
    props: BlockPropsMap[K];
    layout?: BlockLayout;
    binding?: BlockBinding;
  };
}[BlockType];
```

- [ ] **Step 4: Add the schema (validation layer)**

In `lib/email/doc/schema.ts`, next to `LayoutSchema`, add (mirror the layout merge at line 329):

```ts
const BindingSliceSchema = z.object({
  measures: z.array(z.string().min(1)).min(1),
  dimension: z.string().optional(),
  filter: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  topN: z.number().int().positive().optional(),
});

const BindingSchema = z.object({
  v: z.number().int().positive(),
  lane: z.enum(["lake", "upload", "web", "user"]),
  concoctionId: z.string().optional(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  bundleRef: z.string().optional(),
  slice: BindingSliceSchema,
  asOf: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  sourceLine: z.string().min(1),
});
```

and extend the existing `.and(z.object({ layout: LayoutSchema.optional() }))` to `.and(z.object({ layout: LayoutSchema.optional(), binding: BindingSchema.optional() }))`. Do NOT touch `BlockContentPatchSchema` or `AuthoredBlockSchema` — their strip mode IS the fence.

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test lib/email/doc/binding-fence.test.ts`
Expected: PASS (5 tests). Also run `bun test lib/email/doc/` — every existing doc test stays green (back-compat pin).

- [ ] **Step 6: Commit**

```bash
git add lib/email/doc/types.ts lib/email/doc/schema.ts lib/email/doc/binding-fence.test.ts
git commit -m "feat(concoctions): BlockBinding on the pure doc contract — engine-owned, AI-unwritable, versioned" -- lib/email/doc/types.ts lib/email/doc/schema.ts lib/email/doc/binding-fence.test.ts
```

---

### Task 2: Guards + formatter (pure core)

**Files:**
- Create: `lib/concoctions/types.ts`, `lib/concoctions/guards.ts`, `lib/concoctions/format.ts`
- Test: `lib/concoctions/guards.test.ts`, `lib/concoctions/format.test.ts`

**Interfaces:**
- Consumes: `BlockBinding`/`BindingSlice`/`BindingLane`/`BINDING_VERSION` from `@/lib/email/doc/types`; `BlockType` from same.
- Produces:
  - `ColumnKind = "measure" | "dimension"`, `ColumnFormat = "usd" | "percent" | "number" | "text" | "date"`.
  - `ColumnGuards { minDistinct?: number; maxNullShare?: number; minSpreadRatio?: number }`.
  - `ColumnSpec { key; label; kind; format; guards?; note? }`.
  - `ConcoctionRow = Record<string, string | number | null>`.
  - `DefaultBlockSpec { type: BlockType; slice: BindingSlice; layout: { x: number; y: number; w: number; h: number } }`.
  - `ConcoctionDef<P>` — `{ id; label; description; category; tags; params: z.ZodType<P>; load(sb, params): Promise<ConcoctionRow[]>; columns: ColumnSpec[]; asOf(rows): string; probeAsOf(sb, params): Promise<string>; sourceLine: string; defaultLayout: DefaultBlockSpec[] }` (sb is `unknown`-typed here; defs cast to their client).
  - `evaluateGuards(rows: ConcoctionRow[], col: ColumnSpec): { ok: boolean; reasons: string[] }`.
  - `formatValue(v: number | string | null, format: ColumnFormat): string` — null → `""` (an empty string is an omitted slot, NEVER "N/A"/"—"/0).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/concoctions/guards.test.ts
import { describe, it, expect } from "bun:test";
import { evaluateGuards } from "./guards";
import type { ColumnSpec, ConcoctionRow } from "./types";

const col = (guards: ColumnSpec["guards"]): ColumnSpec => ({
  key: "x", label: "X", kind: "measure", format: "number", guards,
});
const rows = (vals: (number | null)[]): ConcoctionRow[] => vals.map((x) => ({ x }));

describe("evaluateGuards — the cap-rate lesson as law", () => {
  it("near-constant column fails minDistinct (6.7×22, 8.3×3, null×2)", () => {
    const capRateish = rows([...Array(22).fill(6.7), ...Array(3).fill(8.3), null, null]);
    const r = evaluateGuards(capRateish, col({ minDistinct: 5 }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toContain("distinct");
  });
  it("spread-bearing column passes (rent-PSF-like)", () => {
    const r = evaluateGuards(rows([16.04, 22.5, 31.0, 42.5, 60.84]), col({ minDistinct: 5, minSpreadRatio: 0.2 }));
    expect(r.ok).toBe(true);
  });
  it("near-zero column fails minSpreadRatio (sales_90d-like)", () => {
    const r = evaluateGuards(rows([0, 0, 1, 0, 2, 0, 1]), col({ minDistinct: 5 }));
    expect(r.ok).toBe(false);
  });
  it("mostly-null column fails maxNullShare", () => {
    const r = evaluateGuards(rows([null, null, null, 5]), col({ maxNullShare: 0.5 }));
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toContain("null");
  });
  it("no guards → always ok", () => {
    expect(evaluateGuards(rows([1, 1, 1]), col(undefined)).ok).toBe(true);
  });
  it("fewer than 2 non-null values fails any spread guard", () => {
    const r = evaluateGuards(rows([7, null]), col({ minSpreadRatio: 0.1 }));
    expect(r.ok).toBe(false);
  });
});
```

```ts
// lib/concoctions/format.test.ts
import { describe, it, expect } from "bun:test";
import { formatValue } from "./format";

describe("formatValue", () => {
  it("usd", () => expect(formatValue(495000, "usd")).toBe("$495,000"));
  it("usd decimals round", () => expect(formatValue(16.04, "usd")).toBe("$16.04"));
  it("percent", () => expect(formatValue(4.2, "percent")).toBe("4.2%"));
  it("number", () => expect(formatValue(12071, "number")).toBe("12,071"));
  it("date passes through ISO → MM/DD/YYYY", () => expect(formatValue("2026-05-22", "date")).toBe("05/22/2026"));
  it("text passes through", () => expect(formatValue("Alico Industrial", "text")).toBe("Alico Industrial"));
  it("null → empty string, NEVER a placeholder", () => {
    expect(formatValue(null, "usd")).toBe("");
    expect(formatValue(null, "text")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/concoctions/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```ts
// lib/concoctions/types.ts
import type { z } from "zod";
import type { BlockType, BindingSlice } from "@/lib/email/doc/types";

export type { BlockBinding, BindingSlice, BindingLane } from "@/lib/email/doc/types";
export { BINDING_VERSION } from "@/lib/email/doc/types";

export type ColumnKind = "measure" | "dimension";
export type ColumnFormat = "usd" | "percent" | "number" | "text" | "date";

/** Distribution guards — a shape may only use a measure whose guards pass on the
 *  LIVE rows. This is where 07/12's traps became law instead of tribal memory. */
export interface ColumnGuards {
  minDistinct?: number;
  /** 0–1 ceiling on null share. */
  maxNullShare?: number;
  /** (max−min)/max(|max|,|min|) floor over non-null values. */
  minSpreadRatio?: number;
}

export interface ColumnSpec {
  key: string;
  label: string;
  kind: ColumnKind;
  format: ColumnFormat;
  guards?: ColumnGuards;
  /** Probe-facts worth keeping next to the column (e.g. why a guard exists). */
  note?: string;
}

export type ConcoctionRow = Record<string, string | number | null>;

export interface DefaultBlockSpec {
  type: BlockType;
  slice: BindingSlice;
  layout: { x: number; y: number; w: number; h: number };
}

export interface ConcoctionDef<P = Record<string, string | number>> {
  id: string;
  /** Product copy — the picker + AI read these verbatim. No system nouns. */
  label: string;
  description: string;
  category: string;
  tags: string[];
  params: z.ZodType<P>;
  /** Server-only. `sb` is the caller-supplied Supabase client (typed or untyped
   *  per the def's tables) — defs never construct clients, so tests stub them. */
  load(sb: unknown, params: P): Promise<ConcoctionRow[]>;
  columns: ColumnSpec[];
  /** MM/DD/YYYY derived from rows — never a stamped constant. */
  asOf(rows: ConcoctionRow[]): string;
  /** Cheap staleness probe (metadata-scale query) — MM/DD/YYYY. */
  probeAsOf(sb: unknown, params: P): Promise<string>;
  sourceLine: string;
  defaultLayout: DefaultBlockSpec[];
}
```

```ts
// lib/concoctions/guards.ts
import type { ColumnSpec, ConcoctionRow } from "./types";

/** Evaluate a column's distribution guards against live rows. Pure. */
export function evaluateGuards(
  rows: ConcoctionRow[],
  col: ColumnSpec,
): { ok: boolean; reasons: string[] } {
  const g = col.guards;
  if (!g || rows.length === 0) return { ok: true, reasons: [] };
  const reasons: string[] = [];
  const raw = rows.map((r) => r[col.key]);
  const nonNull = raw.filter((v): v is number | string => v !== null && v !== undefined);
  const nullShare = raw.length === 0 ? 0 : (raw.length - nonNull.length) / raw.length;

  if (g.maxNullShare !== undefined && nullShare > g.maxNullShare) {
    reasons.push(`null share ${nullShare.toFixed(2)} exceeds ${g.maxNullShare}`);
  }
  if (g.minDistinct !== undefined && new Set(nonNull).size < g.minDistinct) {
    reasons.push(`distinct values ${new Set(nonNull).size} below ${g.minDistinct}`);
  }
  if (g.minSpreadRatio !== undefined) {
    const nums = nonNull.filter((v): v is number => typeof v === "number");
    if (nums.length < 2) {
      reasons.push("fewer than 2 numeric values — no spread");
    } else {
      const max = Math.max(...nums);
      const min = Math.min(...nums);
      const denom = Math.max(Math.abs(max), Math.abs(min));
      const spread = denom === 0 ? 0 : (max - min) / denom;
      if (spread < g.minSpreadRatio) {
        reasons.push(`spread ratio ${spread.toFixed(3)} below ${g.minSpreadRatio}`);
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
}
```

`minDistinct` failing on the near-zero fixture: `[0,0,1,0,2,0,1]` has 3 distinct < 5 — that is the test's mechanism; sales-thinness ALSO fails spread when configured. Implement `format.ts`:

```ts
// lib/concoctions/format.ts
import type { ColumnFormat } from "./types";

/** ONE formatter for baked block values. null/undefined → "" (an omitted slot —
 *  the no-placeholder moat: never "N/A", never "—", never a fabricated 0). */
export function formatValue(
  v: number | string | null | undefined,
  format: ColumnFormat,
): string {
  if (v === null || v === undefined || v === "") return "";
  if (format === "text") return String(v);
  if (format === "date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    return m ? `${m[2]}/${m[3]}/${m[1]}` : String(v);
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (format === "usd") {
    return Number.isInteger(n)
      ? `$${n.toLocaleString("en-US")}`
      : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === "percent") return `${n}%`;
  return n.toLocaleString("en-US");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/concoctions/`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/concoctions/types.ts lib/concoctions/guards.ts lib/concoctions/format.ts lib/concoctions/guards.test.ts lib/concoctions/format.test.ts
git commit -m "feat(concoctions): def contract + distribution guards + one value formatter" -- lib/concoctions/types.ts lib/concoctions/guards.ts lib/concoctions/format.ts lib/concoctions/guards.test.ts lib/concoctions/format.test.ts
```

---

### Task 3: First definition — corridor profiles

**Files:**
- Create: `lib/concoctions/defs/corridor-profiles.ts`
- Test: `lib/concoctions/defs/corridor-profiles.test.ts`

**Interfaces:**
- Consumes: `ConcoctionDef`, `ConcoctionRow`, `evaluateGuards` (Task 2).
- Produces: `corridorProfiles: ConcoctionDef<{ county?: "Lee" | "Collier" }>` — later tasks reference `corridorProfiles.id === "corridor-profiles"` and its measure keys `asking_rent_psf`, `vacancy_rate_pct`, `seasonal_index`, `absorption_sqft` and dimension `corridor_name`.

- [ ] **Step 1: Write the failing test** (fixture = 5 real-shaped rows + the degenerate cap-rate column; stub client implements the exact query-builder chain the loader uses)

```ts
// lib/concoctions/defs/corridor-profiles.test.ts
import { describe, it, expect } from "bun:test";
import { corridorProfiles } from "./corridor-profiles";
import { evaluateGuards } from "../guards";

const FIXTURE = [
  { corridor_name: "Alico Industrial", city: "Fort Myers", corridor_type: "industrial flex", evolution_direction: "growing", seasonal_index: 0.1, cap_rate_pct: 6.7, vacancy_rate_pct: 3.0, absorption_sqft: 185000, asking_rent_psf: 16.04, character: "Logistics corridor.", metrics_verified_date: "2026-05-22" },
  { corridor_name: "Immokalee Rd", city: "Naples", corridor_type: "highway strip mall", evolution_direction: "stable", seasonal_index: 0.45, cap_rate_pct: 6.7, vacancy_rate_pct: 4.2, absorption_sqft: 120500, asking_rent_psf: 42.5, character: "North Collier gravity center.", metrics_verified_date: "2026-05-22" },
  { corridor_name: "Estero Blvd", city: "Fort Myers Beach", corridor_type: "beachfront tourism", evolution_direction: "repositioning", seasonal_index: 0.88, cap_rate_pct: 8.3, vacancy_rate_pct: 7.7, absorption_sqft: -5000, asking_rent_psf: 60.84, character: "Barrier-island rebuild.", metrics_verified_date: "2026-06-01" },
  { corridor_name: "Pine Ridge Rd", city: "Naples", corridor_type: "medical-anchored", evolution_direction: "stable", seasonal_index: 0.3, cap_rate_pct: 6.7, vacancy_rate_pct: 0.2, absorption_sqft: 28000, asking_rent_psf: 38.0, character: "Medical corridor.", metrics_verified_date: "2026-05-22" },
  { corridor_name: "Null Cap Corridor", city: "Cape Coral", corridor_type: "suburban", evolution_direction: "growing", seasonal_index: null, cap_rate_pct: null, vacancy_rate_pct: 5.0, absorption_sqft: 32000, asking_rent_psf: 32.5, character: null, metrics_verified_date: null },
];

/** Stub of the typed client's builder chain: .from().select().is().eq()[.eq()] resolves rows. */
function stubSb(rows: unknown[], capture: Record<string, unknown> = {}) {
  const result = Promise.resolve({ data: rows, error: null });
  const builder: any = {
    select: (cols: string) => { capture.select = cols; return builder; },
    is: (col: string, v: unknown) => { capture[`is:${col}`] = v; return builder; },
    eq: (col: string, v: unknown) => { capture[`eq:${col}`] = v; return builder; },
    order: () => builder,
    then: result.then.bind(result),
  };
  return { from: (table: string) => { capture.table = table; return builder; } };
}

describe("corridorProfiles def", () => {
  it("loads with the verified predicate", async () => {
    const capture: Record<string, unknown> = {};
    const rows = await corridorProfiles.load(stubSb(FIXTURE, capture), {});
    expect(capture.table).toBe("corridor_profiles");
    expect(capture["is:deleted_at"]).toBeNull();
    expect(capture["eq:verification_status"]).toBe("verified");
    expect(rows).toHaveLength(5);
  });
  it("optional county param narrows via eq", async () => {
    const capture: Record<string, unknown> = {};
    await corridorProfiles.load(stubSb(FIXTURE, capture), { county: "Lee" });
    expect(capture["eq:county"]).toBe("Lee");
  });
  it("cap_rate_pct is guard-fenced — near-constant on real-shaped data", () => {
    const col = corridorProfiles.columns.find((c) => c.key === "cap_rate_pct")!;
    expect(col.guards?.minDistinct).toBeGreaterThanOrEqual(5);
    const many = [...Array(22).fill(FIXTURE[0]), ...Array(3).fill(FIXTURE[2]), FIXTURE[4], FIXTURE[4]];
    expect(evaluateGuards(many as never, col).ok).toBe(false);
  });
  it("asking_rent_psf and vacancy_rate_pct pass their own guards on the fixture", () => {
    for (const key of ["asking_rent_psf", "vacancy_rate_pct"]) {
      const col = corridorProfiles.columns.find((c) => c.key === key)!;
      expect(evaluateGuards(FIXTURE as never, col).ok).toBe(true);
    }
  });
  it("asOf = max metrics_verified_date as MM/DD/YYYY; null-safe", () => {
    expect(corridorProfiles.asOf(FIXTURE as never)).toBe("06/01/2026");
  });
  it("defaultLayout references only declared columns and valid block types", () => {
    const keys = new Set(corridorProfiles.columns.map((c) => c.key));
    for (const spec of corridorProfiles.defaultLayout) {
      for (const m of spec.slice.measures) expect(keys.has(m)).toBe(true);
      if (spec.slice.dimension) expect(keys.has(spec.slice.dimension)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/concoctions/defs/corridor-profiles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the def**

```ts
// lib/concoctions/defs/corridor-profiles.ts
import { z } from "zod";
import { formatValue } from "../format";
import type { ConcoctionDef, ConcoctionRow } from "../types";

const COLS =
  "corridor_name, city, corridor_type, evolution_direction, seasonal_index, cap_rate_pct, vacancy_rate_pct, absorption_sqft, asking_rent_psf, character, metrics_verified_date";

const ParamsSchema = z.object({ county: z.enum(["Lee", "Collier"]).optional() });
type Params = z.infer<typeof ParamsSchema>;

function maxDate(rows: ConcoctionRow[], key: string): string {
  const dates = rows.map((r) => r[key]).filter((v): v is string => typeof v === "string" && v.length > 0);
  if (dates.length === 0) return "";
  return formatValue(dates.sort().at(-1)!, "date");
}

/** SWFL CRE corridors — same read as refinery/sources/cre-source.mts + the
 *  embed asking-rent card: verified, non-deleted, live public.corridor_profiles. */
export const corridorProfiles: ConcoctionDef<Params> = {
  id: "corridor-profiles",
  label: "Commercial corridors",
  description:
    "Every verified commercial corridor in Lee and Collier — asking rent, vacancy, seasonality, absorption, and the corridor's character read. Position corridors against each other or profile one.",
  category: "Commercial",
  tags: ["corridors", "rent", "vacancy", "CRE", "retail", "industrial"],
  params: ParamsSchema,
  async load(sb, params) {
    let q = (sb as any)
      .from("corridor_profiles")
      .select(COLS)
      .is("deleted_at", null)
      .eq("verification_status", "verified");
    if (params.county) q = q.eq("county", params.county);
    const { data, error } = await q;
    if (error) throw new Error(`corridor_profiles: ${error.message}`);
    return (data ?? []) as ConcoctionRow[];
  },
  columns: [
    { key: "corridor_name", label: "Corridor", kind: "dimension", format: "text" },
    { key: "city", label: "City", kind: "dimension", format: "text" },
    { key: "corridor_type", label: "Type", kind: "dimension", format: "text" },
    { key: "evolution_direction", label: "Direction", kind: "dimension", format: "text" },
    { key: "asking_rent_psf", label: "Asking rent (per sqft)", kind: "measure", format: "usd",
      guards: { minDistinct: 5, minSpreadRatio: 0.2, maxNullShare: 0.3 },
      note: "Probed 07/12/2026: $16.04–$60.84 across 27 verified — real spread." },
    { key: "vacancy_rate_pct", label: "Vacancy", kind: "measure", format: "percent",
      guards: { minDistinct: 5, minSpreadRatio: 0.2, maxNullShare: 0.3 },
      note: "Probed 07/12/2026: 0.2–7.7% — real spread." },
    { key: "seasonal_index", label: "Seasonality", kind: "measure", format: "number",
      guards: { minDistinct: 4, maxNullShare: 0.5 } },
    { key: "absorption_sqft", label: "Net absorption (sqft)", kind: "measure", format: "number",
      guards: { minDistinct: 5 } },
    { key: "cap_rate_pct", label: "Cap rate", kind: "measure", format: "percent",
      guards: { minDistinct: 5 },
      note: "FENCED — probed 07/12/2026: 6.7 ×22 / 8.3 ×3 / null ×2. Near-constant; may render as a single stated figure, never an axis. The guard enforces it." },
    { key: "character", label: "Character", kind: "dimension", format: "text" },
    { key: "metrics_verified_date", label: "Verified", kind: "dimension", format: "date" },
  ],
  asOf(rows) {
    return maxDate(rows, "metrics_verified_date") || "";
  },
  async probeAsOf(sb, params) {
    const rows = await this.load(sb, params); // 27 rows — already metadata-scale
    return this.asOf(rows);
  },
  sourceLine: "SWFL Data Gulf verified corridor metrics",
  defaultLayout: [
    { type: "hero", slice: { measures: ["asking_rent_psf"], dimension: "corridor_name" }, layout: { x: 0, y: 0, w: 12, h: 3 } },
    { type: "stats", slice: { measures: ["asking_rent_psf", "vacancy_rate_pct", "seasonal_index"] }, layout: { x: 0, y: 3, w: 12, h: 3 } },
    { type: "image", slice: { measures: ["asking_rent_psf"], dimension: "corridor_name", topN: 8 }, layout: { x: 0, y: 6, w: 12, h: 6 } },
    { type: "list", slice: { measures: ["asking_rent_psf", "vacancy_rate_pct"], dimension: "corridor_name", topN: 6 }, layout: { x: 0, y: 12, w: 12, h: 5 } },
    { type: "sources", slice: { measures: ["asking_rent_psf"] }, layout: { x: 0, y: 17, w: 12, h: 2 } },
  ],
};
```

NOTE: the `county` eq-filter requires `corridor_profiles` to HAVE a `county` column — verify with one lake query (`SELECT column_name FROM pg.information_schema.columns WHERE table_schema='public' AND table_name='corridor_profiles'`) before implementing. If absent, derive the filter from `city` (Naples→Collier etc.) is INVENTION — instead drop the param entirely (`ParamsSchema = z.object({})`) and adjust the test. Do not guess.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/concoctions/defs/corridor-profiles.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/concoctions/defs/corridor-profiles.ts lib/concoctions/defs/corridor-profiles.test.ts
git commit -m "feat(concoctions): corridor-profiles def — verified predicate, cap-rate fence, rent/vacancy spread guards" -- lib/concoctions/defs/corridor-profiles.ts lib/concoctions/defs/corridor-profiles.test.ts
```

---

### Task 4: Three more definitions + registry

**Files:**
- Create: `lib/concoctions/defs/zip-listing-activity.ts`, `lib/concoctions/defs/nfip-storm-years.ts`, `lib/concoctions/defs/asking-price-trend.ts`, `lib/concoctions/registry.ts`
- Test: `lib/concoctions/defs/more-defs.test.ts`, `lib/concoctions/registry.test.ts`

**Interfaces:**
- Consumes: Task 2 contract; Task 3 pattern (stub client chain).
- Produces: `zipListingActivity` (params `{ county?: "Lee" | "Collier" | "Hendry" }`; measures `new_listings_90d`, `price_cuts_90d`, `sales_90d` (fenced); dimension `zip_code`); `nfipStormYears` (params `{ countyCode?: string }`; measures `claim_count`, `paid_total_usd`; dimension `year`); `askingPriceTrend` (params `{ area: "cape_coral" | "fort_myers" | "naples" }`; measure `value`; dimension `period`); `CONCOCTIONS: ConcoctionDef[]`, `getConcoction(id): ConcoctionDef | undefined`, `concoctionIndex(): { id; label; description; category; tags; paramKeys: string[] }[]`.

- [ ] **Step 1: Write the failing tests.** `more-defs.test.ts` covers, per def (reuse the Task 3 `stubSb` — extract it to `lib/concoctions/defs/test-stub.ts` and import in both test files):

```ts
// lib/concoctions/defs/more-defs.test.ts — full file
import { describe, it, expect } from "bun:test";
import { zipListingActivity } from "./zip-listing-activity";
import { nfipStormYears } from "./nfip-storm-years";
import { askingPriceTrend } from "./asking-price-trend";
import { evaluateGuards } from "../guards";
import { stubSb } from "./test-stub";

describe("zipListingActivity", () => {
  const FIXTURE = [
    { county: null, zip_code: null, new_listings_90d: 1612, price_cuts_90d: 1996, sales_90d: 91, latest_at: "2026-07-11T00:00:00Z" },
    { county: "Lee", zip_code: null, new_listings_90d: 1183, price_cuts_90d: 1519, sales_90d: 38, latest_at: "2026-07-11T00:00:00Z" },
    { county: "Lee", zip_code: "33914", new_listings_90d: 92, price_cuts_90d: 120, sales_90d: 3, latest_at: "2026-07-11T00:00:00Z" },
    { county: "Lee", zip_code: "33904", new_listings_90d: 61, price_cuts_90d: 75, sales_90d: 0, latest_at: "2026-07-11T00:00:00Z" },
    { county: "Collier", zip_code: "34112", new_listings_90d: 45, price_cuts_90d: 51, sales_90d: 1, latest_at: "2026-07-11T00:00:00Z" },
  ];
  it("load returns ONLY per-ZIP rows — county rollups and the SWFL total row are filtered in code", async () => {
    const rows = await zipListingActivity.load(stubSb(FIXTURE), {});
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.zip_code !== null && r.county !== null)).toBe(true);
  });
  it("county param narrows", async () => {
    const rows = await zipListingActivity.load(stubSb(FIXTURE), { county: "Lee" });
    expect(rows).toHaveLength(2);
  });
  it("sales_90d is FENCED (thin at ZIP grain, probed 07/12/2026)", () => {
    const col = zipListingActivity.columns.find((c) => c.key === "sales_90d")!;
    const zipRows = FIXTURE.filter((r) => r.zip_code !== null);
    expect(evaluateGuards(zipRows as never, col).ok).toBe(false);
  });
  it("new_listings_90d passes on ZIP rows", () => {
    const col = zipListingActivity.columns.find((c) => c.key === "new_listings_90d")!;
    expect(evaluateGuards(FIXTURE.filter((r) => r.zip_code) as never, col).ok).toBe(true);
  });
  it("asOf from latest_at", () => {
    expect(zipListingActivity.asOf(FIXTURE as never)).toBe("07/11/2026");
  });
});

describe("nfipStormYears", () => {
  const FIXTURE = [
    { county_code: "12071", year: 2017, claim_count: 4200, paid_total_usd: 310000000 },
    { county_code: "12071", year: 2022, claim_count: 21000, paid_total_usd: 2100000000 },
    { county_code: "12071", year: 2024, claim_count: 9800, paid_total_usd: 780000000 },
  ];
  it("loads from data_lake.fema_nfip_county_year (NOT *_view)", async () => {
    const capture: Record<string, unknown> = {};
    await nfipStormYears.load(stubSb(FIXTURE, capture), {});
    expect(capture.table).toBe("fema_nfip_county_year");
  });
  it("asOf = max year rendered 12/31/<year>", () => {
    expect(nfipStormYears.asOf(FIXTURE as never)).toBe("12/31/2024");
  });
});

describe("askingPriceTrend", () => {
  const FIXTURE = [
    { metric_key: "median_asking_price", area: "cape_coral", period: "2026-07-01", value: 389000, unit: "usd", source_title: "SWFL Data Gulf daily truth" },
    { metric_key: "median_asking_price", area: "cape_coral", period: "2026-07-10", value: 391500, unit: "usd", source_title: "SWFL Data Gulf daily truth" },
  ];
  it("requires area; reads median_asking_price (median_sale_price is all-NULL — 07/11 check)", async () => {
    const capture: Record<string, unknown> = {};
    await askingPriceTrend.load(stubSb(FIXTURE, capture), { area: "cape_coral" });
    expect(capture["eq:metric_key"]).toBe("median_asking_price");
    expect(capture["eq:area"]).toBe("cape_coral");
  });
  it("value column guards against all-null (maxNullShare)", () => {
    const col = askingPriceTrend.columns.find((c) => c.key === "value")!;
    const allNull = FIXTURE.map((r) => ({ ...r, value: null }));
    expect(evaluateGuards(allNull as never, col).ok).toBe(false);
  });
  it("asOf = max period", () => {
    expect(askingPriceTrend.asOf(FIXTURE as never)).toBe("07/10/2026");
  });
});
```

`registry.test.ts`:

```ts
// lib/concoctions/registry.test.ts
import { describe, it, expect } from "bun:test";
import { CONCOCTIONS, getConcoction, concoctionIndex } from "./registry";

describe("registry", () => {
  it("holds the 4 starter defs with unique ids", () => {
    const ids = CONCOCTIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining(["corridor-profiles", "zip-listing-activity", "nfip-storm-years", "asking-price-trend"]),
    );
  });
  it("getConcoction resolves and misses safely", () => {
    expect(getConcoction("corridor-profiles")?.label).toBe("Commercial corridors");
    expect(getConcoction("nope")).toBeUndefined();
  });
  it("index is picker/AI-safe: no digits in descriptions (no smuggled figures), params listed", () => {
    for (const e of concoctionIndex()) {
      expect(e.description).not.toMatch(/\d/);
      expect(Array.isArray(e.paramKeys)).toBe(true);
    }
  });
  it("every defaultLayout slice references declared columns (all defs)", () => {
    for (const def of CONCOCTIONS) {
      const keys = new Set(def.columns.map((c) => c.key));
      for (const spec of def.defaultLayout) {
        for (const m of spec.slice.measures) expect(keys.has(m)).toBe(true);
      }
    }
  });
});
```

The no-digits rule forces Task 3's description to stay digit-free — reword it there if this test reddens (it is digit-free as written).

- [ ] **Step 2: Run tests to verify they fail** — `bun test lib/concoctions/` → module-not-found FAILs.

- [ ] **Step 3: Implement the three defs + registry.** Follow Task 3's def shape exactly. Key loader specifics:
  - `zipListingActivity.load`: untyped client — `(sb as any).schema("data_lake").from("listing_transitions_recent_zip_stats").select("county, zip_code, price_cuts_90d, sales_90d, new_listings_90d, latest_at")`; adapt `stubSb` so `.schema()` returns the same stub root (add `schema: () => stub` to the test-stub). Filter IN CODE after fetch: keep only rows where `zip_code !== null && county !== null` (per-ZIP grain — rollups are a different concoction later); then optional `params.county` narrowing in code. `sales_90d` guards: `{ minDistinct: 6, minSpreadRatio: 0.5 }` with `note` naming the 07/12 probe + the open ingest-gap question. `asOf`: max `latest_at` → `formatValue(iso.slice(0,10), "date")`.
  - `nfipStormYears.load`: untyped client, `.schema("data_lake").from("fema_nfip_county_year").select("county_code, year, claim_count, paid_total_usd")`, optional `eq("county_code", params.countyCode)`. `asOf`: `12/31/<max year>` (the county-year grain's honest "data through"). Measures `claim_count`/`paid_total_usd` with `{ minDistinct: 3 }`. `year` is a `dimension`, format `"number"`.
  - `askingPriceTrend.load`: untyped client, `.schema("data_lake").from("daily_truth").select("metric_key, area, period, value, unit, source_title").eq("metric_key", "median_asking_price").eq("area", params.area).order("period", { ascending: true })` — mirror `lib/desk/loaders.ts`'s daily_truth read (open the file; if it applies additional status/verified filters, copy them exactly). `value` guards: `{ maxNullShare: 0.4, minDistinct: 3 }`. `sourceLine`: "SWFL Data Gulf daily market truth". `defaultLayout`: hero (latest value) + image chart (trend) + sources.
  - `registry.ts`:

```ts
// lib/concoctions/registry.ts
import type { ConcoctionDef } from "./types";
import { corridorProfiles } from "./defs/corridor-profiles";
import { zipListingActivity } from "./defs/zip-listing-activity";
import { nfipStormYears } from "./defs/nfip-storm-years";
import { askingPriceTrend } from "./defs/asking-price-trend";

export const CONCOCTIONS: ConcoctionDef<any>[] = [
  corridorProfiles,
  zipListingActivity,
  nfipStormYears,
  askingPriceTrend,
];

export function getConcoction(id: string): ConcoctionDef<any> | undefined {
  return CONCOCTIONS.find((d) => d.id === id);
}

/** Picker/AI-facing index — product copy only, no loaders, no digits. */
export function concoctionIndex() {
  return CONCOCTIONS.map((d) => ({
    id: d.id,
    label: d.label,
    description: d.description,
    category: d.category,
    tags: d.tags,
    paramKeys: Object.keys((d.params as any).shape ?? {}),
  }));
}
```

- [ ] **Step 4: Run tests** — `bun test lib/concoctions/` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/concoctions/defs/ lib/concoctions/registry.ts lib/concoctions/registry.test.ts
git commit -m "feat(concoctions): zip-listing-activity + nfip-storm-years + asking-price-trend defs, registry + digit-free index" -- lib/concoctions/defs/ lib/concoctions/registry.ts lib/concoctions/registry.test.ts
```

---

### Task 5: Materializer — scalar mappers + load

**Files:**
- 🔴 Create: `lib/concoctions/materialize.ts`
- Test: `lib/concoctions/materialize.test.ts`

**Interfaces:**
- Consumes: registry (Task 4), `evaluateGuards`, `formatValue`, `BlockBinding`/`BINDING_VERSION`, `EmailBlock` types.
- Produces (Tasks 6–13 rely on these):
  - `mapSliceToBlock(def, rows, spec: DefaultBlockSpec, ids: () => string): EmailBlock | null` — pure; null when guards/shape minimums fail AND no fallback applies (fallbacks: scatter/chart-needing shapes degrade to `list`; a `list` with zero rows returns null).
  - `materializeLoad(def, params, deps: { sb: unknown; hostPng?: (key: string, buf: Buffer) => Promise<string> }): Promise<{ blocks: EmailBlock[]; asOf: string }>`.
  - Binding stamped on every produced block: `{ v: BINDING_VERSION, lane: "lake", concoctionId: def.id, params, slice: spec.slice, asOf, sourceLine: def.sourceLine }`.
  - Block ids: `conc-<def.id>-<n>` via the injected `ids` counter (deterministic — no Date/random).

- [ ] **Step 1: Write the failing test**

```ts
// lib/concoctions/materialize.test.ts
import { describe, it, expect } from "bun:test";
import { materializeLoad, mapSliceToBlock } from "./materialize";
import { corridorProfiles } from "./defs/corridor-profiles";
import { stubSb } from "./defs/test-stub";

const ROWS = [
  { corridor_name: "Alico Industrial", city: "Fort Myers", corridor_type: "industrial flex", evolution_direction: "growing", seasonal_index: 0.1, cap_rate_pct: 6.7, vacancy_rate_pct: 3.0, absorption_sqft: 185000, asking_rent_psf: 16.04, character: "Logistics.", metrics_verified_date: "2026-05-22" },
  { corridor_name: "Estero Blvd", city: "Fort Myers Beach", corridor_type: "beachfront", evolution_direction: "repositioning", seasonal_index: 0.88, cap_rate_pct: 8.3, vacancy_rate_pct: 7.7, absorption_sqft: -5000, asking_rent_psf: 60.84, character: "Rebuild.", metrics_verified_date: "2026-06-01" },
  { corridor_name: "Pine Ridge Rd", city: "Naples", corridor_type: "medical", evolution_direction: "stable", seasonal_index: 0.3, cap_rate_pct: 6.7, vacancy_rate_pct: 0.2, absorption_sqft: 28000, asking_rent_psf: 38.0, character: "Medical.", metrics_verified_date: "2026-05-22" },
  { corridor_name: "Immokalee Rd", city: "Naples", corridor_type: "strip", evolution_direction: "stable", seasonal_index: 0.45, cap_rate_pct: 6.7, vacancy_rate_pct: 4.2, absorption_sqft: 120500, asking_rent_psf: 42.5, character: "Gravity.", metrics_verified_date: "2026-05-22" },
  { corridor_name: "Cape Coral Pkwy", city: "Cape Coral", corridor_type: "suburban", evolution_direction: "growing", seasonal_index: 0.2, cap_rate_pct: 6.7, vacancy_rate_pct: 5.0, absorption_sqft: 32000, asking_rent_psf: 32.5, character: "Rooftops.", metrics_verified_date: "2026-05-22" },
];

describe("materializeLoad", () => {
  it("produces the defaultLayout as blocks with baked values + bindings; deterministic ids", async () => {
    const { blocks, asOf } = await materializeLoad(corridorProfiles, {}, { sb: stubSb(ROWS), hostPng: async () => "https://cdn.example/chart.png" });
    expect(asOf).toBe("06/01/2026");
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const b of blocks) {
      expect(b.binding?.lane).toBe("lake");
      expect(b.binding?.concoctionId).toBe("corridor-profiles");
      expect(b.binding?.asOf).toBe("06/01/2026");
      expect(b.id).toMatch(/^conc-corridor-profiles-\d+$/);
      expect(b.layout).toBeDefined();
    }
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("stats block bakes formatted values verbatim", () => {
    const spec = corridorProfiles.defaultLayout.find((s) => s.type === "stats")!;
    let n = 0;
    const block = mapSliceToBlock(corridorProfiles, ROWS as never, spec, () => `conc-corridor-profiles-${n++}`)!;
    expect(block.type).toBe("stats");
    const stats = (block.props as { stats: { value: string; label: string }[] }).stats;
    expect(stats.length).toBeGreaterThanOrEqual(2);
    expect(stats.length).toBeLessThanOrEqual(3);
    expect(stats.every((s) => s.value.length > 0)).toBe(true);
  });
  it("list block: topN rows ordered by first measure desc, values formatted", () => {
    const spec = corridorProfiles.defaultLayout.find((s) => s.type === "list")!;
    let n = 0;
    const block = mapSliceToBlock(corridorProfiles, ROWS as never, spec, () => `x-${n++}`)!;
    const items = (block.props as { items: { lead?: string; text: string }[] }).items;
    expect(items).toHaveLength(Math.min(spec.slice.topN ?? 6, ROWS.length));
    expect(items[0].text).toContain("Estero Blvd"); // highest asking_rent_psf
    expect(items[0].text).toContain("$60.84");
  });
  it("guard-failing slice returns a FALLBACK, never a lie: cap_rate scatter-ish slice degrades to list", () => {
    let n = 0;
    const spec = { type: "image" as const, slice: { measures: ["cap_rate_pct"], dimension: "corridor_name", topN: 8 }, layout: { x: 0, y: 0, w: 12, h: 6 } };
    const near = [...Array(22).fill(ROWS[0]), ...Array(3).fill(ROWS[1])];
    const block = mapSliceToBlock(corridorProfiles, near as never, spec, () => `y-${n++}`);
    expect(block).not.toBeNull();
    expect(block!.type).toBe("list"); // degraded, not refused (FOCUS rule 4)
  });
  it("empty rows → sources-only never; materializeLoad throws a labeled error", async () => {
    await expect(materializeLoad(corridorProfiles, {}, { sb: stubSb([]) })).rejects.toThrow(/no rows/i);
  });
  it("sources block carries the def's citation", () => {
    const spec = corridorProfiles.defaultLayout.find((s) => s.type === "sources")!;
    let n = 0;
    const block = mapSliceToBlock(corridorProfiles, ROWS as never, spec, () => `s-${n++}`)!;
    const sources = (block.props as { sources: { label?: string }[] }).sources;
    expect(sources[0].label).toBe("SWFL Data Gulf verified corridor metrics");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — module not found.

- [ ] **Step 3: Implement.** Core rules (complete mapper table — implement all of it):
  - `hero` ← first measure's TOP row by that measure: `{ kicker: def.label.toUpperCase(), value: formatValue(top[measure], fmt), label: `${columnLabel} · ${top[dimension] ?? ""}`.trim() }`.
  - `stats` ← up to 3 measures; each cell `{ value: formatValue(median-of-measure? NO — computation is capped at: max row by FIRST measure supplies the row context; each cell restates THAT ROW's value for its measure), label: columnLabel }`. Simpler and honest: all cells restate the SAME top row (the hero row) — a row profile, never a cross-row aggregate (deterministic math beyond restatement is a later, spec'd derivation).
  - `list` ← `topN` (default 6) rows sorted desc by first measure; `lead = formatValue(row[dimension])`, `text = "<dim>: <m1 label> <m1>, <m2 label> <m2>"` built only from non-empty formatted values.
  - `metric-card` ← one measure, top row: `{ metricValue, metricLabel: columnLabel, sub: row[dimension] }`.
  - `image` ← handled in Task 6 (chart); in THIS task `image` slices route through the guard check and, when guards pass, call the (not-yet-written) `buildChartBlock` — import it lazily and in this task stub it as a thrown "not implemented" caught into the LIST fallback, so Task 5 tests pass with the degraded list and Task 6 flips the real chart on. Guard-fail → `list` fallback directly.
  - `sources` ← `{ sources: [{ label: def.sourceLine }], note: `As of ${asOf}` }`.
  - Guard pipeline in `mapSliceToBlock`: for each measure in the slice, `evaluateGuards(rows, column)`; measures that fail are DROPPED from the slice; if the primary (first) measure fails for a chart-shaped block (`image`), degrade to `list` using surviving measures; if NO measures survive, return null.
  - `materializeLoad`: parse params via `def.params.parse`, load rows (throw `"<id>: no rows"` on empty), compute `asOf = def.asOf(rows)`, map every `defaultLayout` spec, drop nulls, stamp bindings + layouts.

- [ ] **Step 4: Run tests** — `bun test lib/concoctions/materialize.test.ts` → PASS; run the whole dir too.

- [ ] **Step 5: Commit**

```bash
git add lib/concoctions/materialize.ts lib/concoctions/materialize.test.ts
git commit -m "feat(concoctions): materializer — guard-checked slice mappers, load path, bindings stamped" -- lib/concoctions/materialize.ts lib/concoctions/materialize.test.ts
```

---

### Task 6: Chart block mapper (SVG → PNG → hosted URL)

**Files:**
- Create: `lib/concoctions/chart-block.ts`
- Test: `lib/concoctions/chart-block.test.ts`
- 🔴 Modify: `lib/concoctions/materialize.ts` (replace the Task 5 stub call with the real import)

**Interfaces:**
- Consumes: `barChartSvg`/`trendChartSvg`/`svgToPng` and `hostEmailPng` from `@/lib/email/chart-image` (verified: `hostEmailPng(pngKey: string, png: Buffer): Promise<string>` at chart-image.ts:343); `formatValue`; def columns.
- Produces: `buildChartBlock(def, rows, spec, opts: { asOf: string; hostPng?: typeof hostEmailPng; accent?: string }): Promise<EmailBlock>` → an `image` block `{ props: { url, alt, caption, kind: "chart" } }`. Dimension `period`/`year`-like (date/number format) → trend line via `trendChartSvg`; categorical dimension → `barChartSvg` top-N desc. `caption = "<measure label> · <sourceLine> · As of <asOf>"`. PNG key: `concoctions/<def.id>/<slice-hash>.png` where slice-hash = stable stringify of {measures, dimension, topN, params} run through the same hash helper chart keys already use (open `lib/email/inject-chart.ts` to find and REUSE its key/hash helper rather than writing a new one).

- [ ] **Step 1: Write the failing test** — DI `hostPng` capture; assert: bar path for corridor slice (categorical), trend path for asking-price slice (date dimension), kind:"chart" set, caption carries source + as-of, PNG bytes non-empty (svgToPng real — it's pure native), hostPng key stable across two identical calls.

```ts
// lib/concoctions/chart-block.test.ts
import { describe, it, expect } from "bun:test";
import { buildChartBlock } from "./chart-block";
import { corridorProfiles } from "./defs/corridor-profiles";
import { askingPriceTrend } from "./defs/asking-price-trend";

const CORRIDOR_ROWS = [
  { corridor_name: "A", asking_rent_psf: 16.04, vacancy_rate_pct: 3.0, city: "X", corridor_type: "t", evolution_direction: "g", seasonal_index: 0.1, cap_rate_pct: 6.7, absorption_sqft: 1, character: "", metrics_verified_date: "2026-05-22" },
  { corridor_name: "B", asking_rent_psf: 60.84, vacancy_rate_pct: 7.7, city: "Y", corridor_type: "t", evolution_direction: "r", seasonal_index: 0.8, cap_rate_pct: 8.3, absorption_sqft: 2, character: "", metrics_verified_date: "2026-05-22" },
];
const TREND_ROWS = [
  { metric_key: "median_asking_price", area: "cape_coral", period: "2026-06-01", value: 380000, unit: "usd", source_title: "t" },
  { metric_key: "median_asking_price", area: "cape_coral", period: "2026-07-01", value: 391500, unit: "usd", source_title: "t" },
];

describe("buildChartBlock", () => {
  it("categorical dimension → bar chart image block, hosted URL, provenance caption", async () => {
    const keys: string[] = [];
    const block = await buildChartBlock(
      corridorProfiles, CORRIDOR_ROWS as never,
      { type: "image", slice: { measures: ["asking_rent_psf"], dimension: "corridor_name", topN: 8 }, layout: { x: 0, y: 0, w: 12, h: 6 } },
      { asOf: "05/22/2026", hostPng: async (k, buf) => { keys.push(k); expect(buf.byteLength).toBeGreaterThan(0); return `https://cdn/x/${k}`; } },
    );
    expect(block.type).toBe("image");
    const props = block.props as { url?: string; kind?: string; caption?: string };
    expect(props.kind).toBe("chart");
    expect(props.url).toContain("concoctions/corridor-profiles/");
    expect(props.caption).toContain("SWFL Data Gulf verified corridor metrics");
    expect(props.caption).toContain("As of 05/22/2026");
  });
  it("date dimension → trend chart; key is stable across identical calls", async () => {
    const keys: string[] = [];
    const host = async (k: string) => { keys.push(k); return `https://cdn/x/${k}`; };
    const spec = { type: "image" as const, slice: { measures: ["value"], dimension: "period" }, layout: { x: 0, y: 0, w: 12, h: 6 } };
    await buildChartBlock(askingPriceTrend, TREND_ROWS as never, spec, { asOf: "07/01/2026", hostPng: host });
    await buildChartBlock(askingPriceTrend, TREND_ROWS as never, spec, { asOf: "07/01/2026", hostPng: host });
    expect(keys[0]).toBe(keys[1]);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.** — module not found.

- [ ] **Step 3: Implement** `chart-block.ts`: pick trend vs bar by the dimension column's `format` (`"date"` → trend, else bar); build points via `formatValue`-consistent raw numbers; `svgToPng`; `hostPng ?? hostEmailPng`; assemble the image block. Reuse `trendChartSvg`'s `TrendPoint {label, value}` and `barChartSvg`'s real signature — OPEN `lib/email/chart-image.ts:232` first and match it exactly (it was verified to exist; its parameter list was not transcribed here — read it, don't guess). Then in `materialize.ts`, replace the Task 5 stub with the real `buildChartBlock` call (guard-pass path only; guard-fail still degrades to list).

- [ ] **Step 4: Run tests** — chart-block + materialize suites PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/concoctions/chart-block.ts lib/concoctions/chart-block.test.ts lib/concoctions/materialize.ts
git commit -m "feat(concoctions): chart block mapper — bar/trend SVG→PNG→email-media, stable keys, provenance caption" -- lib/concoctions/chart-block.ts lib/concoctions/chart-block.test.ts lib/concoctions/materialize.ts
```

---

### Task 7: rebind + turn-into + version degradation

**Files:**
- 🔴 Modify: `lib/concoctions/materialize.ts`
- Test: `lib/concoctions/rebind.test.ts` (NEW)

**Interfaces:**
- Consumes: Tasks 5–6.
- Produces: `rebindBlock(block: EmailBlock, newParams: Record<string, string | number>, deps: { sb: unknown; hostPng?: ... }): Promise<EmailBlock>` — same id/type/layout/slice, re-loaded values, updated binding params + asOf. `turnIntoBlock(block: EmailBlock, newType: BlockType, deps): Promise<EmailBlock>` — same id/layout/binding (slice preserved verbatim), new type's mapper output. Both throw `BindingUnrefreshable` (exported Error subclass) when: no binding, `binding.v !== BINDING_VERSION`, unknown `concoctionId`, or params fail the def's current schema — callers render the block unchanged and flag "can't refresh".

- [ ] **Step 1: Write the failing test**

```ts
// lib/concoctions/rebind.test.ts
import { describe, it, expect } from "bun:test";
import { materializeLoad, rebindBlock, turnIntoBlock, BindingUnrefreshable } from "./materialize";
import { corridorProfiles } from "./defs/corridor-profiles";
import { stubSb } from "./defs/test-stub";

const LEE = [{ corridor_name: "Alico", city: "Fort Myers", corridor_type: "flex", evolution_direction: "growing", seasonal_index: 0.1, cap_rate_pct: 6.7, vacancy_rate_pct: 3.0, absorption_sqft: 185000, asking_rent_psf: 16.04, character: "", metrics_verified_date: "2026-05-22" },
  { corridor_name: "Estero", city: "FMB", corridor_type: "beach", evolution_direction: "repositioning", seasonal_index: 0.88, cap_rate_pct: 8.3, vacancy_rate_pct: 7.7, absorption_sqft: -5000, asking_rent_psf: 60.84, character: "", metrics_verified_date: "2026-06-01" },
  { corridor_name: "PineRidge", city: "Naples", corridor_type: "med", evolution_direction: "stable", seasonal_index: 0.3, cap_rate_pct: 6.7, vacancy_rate_pct: 0.2, absorption_sqft: 28000, asking_rent_psf: 38.0, character: "", metrics_verified_date: "2026-05-22" },
  { corridor_name: "Immok", city: "Naples", corridor_type: "strip", evolution_direction: "stable", seasonal_index: 0.45, cap_rate_pct: 6.7, vacancy_rate_pct: 4.2, absorption_sqft: 120500, asking_rent_psf: 42.5, character: "", metrics_verified_date: "2026-05-22" },
  { corridor_name: "CCPkwy", city: "Cape Coral", corridor_type: "sub", evolution_direction: "growing", seasonal_index: 0.2, cap_rate_pct: 6.7, vacancy_rate_pct: 5.0, absorption_sqft: 32000, asking_rent_psf: 32.5, character: "", metrics_verified_date: "2026-05-22" }];
const FRESHER = LEE.map((r) => ({ ...r, asking_rent_psf: (r.asking_rent_psf as number) + 1, metrics_verified_date: "2026-07-01" }));

async function firstMetricish() {
  const { blocks } = await materializeLoad(corridorProfiles, {}, { sb: stubSb(LEE), hostPng: async () => "https://cdn/x.png" });
  return blocks.find((b) => b.type === "stats")!;
}

describe("rebindBlock", () => {
  it("re-bakes values, keeps id/type/layout/slice, updates asOf", async () => {
    const block = await firstMetricish();
    const re = await rebindBlock(block, {}, { sb: stubSb(FRESHER), hostPng: async () => "https://cdn/x.png" });
    expect(re.id).toBe(block.id);
    expect(re.type).toBe(block.type);
    expect(re.layout).toEqual(block.layout);
    expect(re.binding?.slice).toEqual(block.binding?.slice);
    expect(re.binding?.asOf).toBe("07/01/2026");
    expect(JSON.stringify(re.props)).not.toBe(JSON.stringify(block.props)); // values moved
  });
  it("throws BindingUnrefreshable on version mismatch (degrade, never break)", async () => {
    const block = await firstMetricish();
    const old = { ...block, binding: { ...block.binding!, v: 999 } };
    await expect(rebindBlock(old as never, {}, { sb: stubSb(LEE) })).rejects.toBeInstanceOf(BindingUnrefreshable);
  });
  it("throws BindingUnrefreshable when the block has no binding", async () => {
    const block = { ...(await firstMetricish()), binding: undefined };
    await expect(rebindBlock(block as never, {}, { sb: stubSb(LEE) })).rejects.toBeInstanceOf(BindingUnrefreshable);
  });
});

describe("turnIntoBlock", () => {
  it("stats → list keeps binding + layout, renders the list mapper (Notion semantics)", async () => {
    const block = await firstMetricish();
    const li = await turnIntoBlock(block, "list", { sb: stubSb(LEE), hostPng: async () => "https://cdn/x.png" });
    expect(li.id).toBe(block.id);
    expect(li.type).toBe("list");
    expect(li.binding?.slice).toEqual(block.binding?.slice);
    expect((li.props as { items: unknown[] }).items.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: FAIL run.** · **Step 3: Implement** — both resolve `getConcoction(binding.concoctionId)`, re-parse `{...binding.params, ...newParams}`, re-load, and call `mapSliceToBlock` with the preserved slice, overriding the produced id/layout with the original's. Export `class BindingUnrefreshable extends Error`. · **Step 4: PASS run (whole `lib/concoctions/`).** · **Step 5: Commit**

```bash
git add lib/concoctions/materialize.ts lib/concoctions/rebind.test.ts
git commit -m "feat(concoctions): rebind + turn-into — stable identity, version degradation as BindingUnrefreshable" -- lib/concoctions/materialize.ts lib/concoctions/rebind.test.ts
```

---

### Task 8: Freshness — probe + per-block stale map

**Files:**
- Create: `lib/concoctions/freshness.ts`
- Test: `lib/concoctions/freshness.test.ts`

**Interfaces:**
- Consumes: registry, `BlockBinding`.
- Produces: `checkDocFreshness(blocks: EmailBlock[], deps: { sb: unknown }): Promise<Record<string, { stale: boolean; currentAsOf: string | null }>>` — keyed by block id, ONLY for blocks with a lane:"lake" binding; one `probeAsOf` per distinct (concoctionId, params) pair (dedup — a doc with 6 blocks of one concoction costs ONE probe); binding version mismatch / unknown id → `{ stale: false, currentAsOf: null }` ("can't refresh" is not "stale"). NO loaders beyond `probeAsOf`, no chart re-renders, no AI calls — this is the zero-cost open path.

- [ ] **Step 1: Failing test** — two blocks same concoction+params (assert one probe call via counting stub), one block newer source (stale true), one version-999 binding (stale false, currentAsOf null), one unbound block (absent from map).
- [ ] **Step 2: FAIL run.** · **Step 3: Implement** (dedup key = `${concoctionId}::${JSON.stringify(params ?? {})}` with sorted keys). · **Step 4: PASS run.** · **Step 5: Commit**

```bash
git add lib/concoctions/freshness.ts lib/concoctions/freshness.test.ts
git commit -m "feat(concoctions): freshness — deduped metadata probes, per-block stale map, zero-cost opens" -- lib/concoctions/freshness.ts lib/concoctions/freshness.test.ts
```

---

### Task 9: API route + capability key

**Files:**
- 🟡 Create: `app/api/concoctions/route.ts`
- Modify: `lib/email/lab/capabilities.ts` (add `datasets` to `EmailLabCapabilities` + `FEATURE_ROUTING: { datasets: "paid-only" }`)
- Test: `lib/concoctions/api-actions.test.ts` (NEW — test the pure action dispatcher, not the HTTP shell)

**Interfaces:**
- Consumes: registry, materializer, freshness (Tasks 4–8); `capabilitiesFor` (verified `lib/email/lab/capabilities.ts:72`).
- Produces: `GET /api/concoctions` → `{ datasets: concoctionIndex() }`. `POST /api/concoctions` body (zod discriminated union on `action`): `{ action: "load", id, params }` → `{ blocks, asOf }` · `{ action: "rebind", block, params }` → `{ block }` (or `{ unrefreshable: true }` on BindingUnrefreshable) · `{ action: "turn-into", block, newType }` → `{ block }` · `{ action: "freshness", blocks }` → `{ staleness }`. Also exports pure `runConcoctionAction(body, deps)` from `lib/concoctions/api-actions.ts` — the route is a thin shell around it.

- [ ] **Step 1: Failing test on `runConcoctionAction`** — load happy path (stubbed sb), rebind unrefreshable → `{ unrefreshable: true }` not a throw, invalid action → labeled error, freshness passthrough.
- [ ] **Step 2: FAIL.** · **Step 3: Implement** `lib/concoctions/api-actions.ts` (pure dispatcher, zod-validated) + `app/api/concoctions/route.ts`: `export const runtime = "nodejs"`; BEFORE writing the auth/session shell, `grep -rn "createServiceRoleClient\|auth" app/api/email-lab app/api/deliverables --include=route.ts | head -30` and MIRROR the auth + error-shape pattern the email-lab doc routes use (do not invent a new auth style); gate on `capabilitiesFor(tier).datasets` the same way those routes gate paid features. Add the `datasets` key to `EmailLabCapabilities`/`FEATURE_ROUTING` — the existing `capabilities.test.ts` derivation tests pick it up automatically (run them).
- [ ] **Step 4: PASS** `bun test lib/concoctions/ lib/email/lab/` + `bunx next build` (route compiles).
- [ ] **Step 5: Commit**

```bash
git add app/api/concoctions/route.ts lib/concoctions/api-actions.ts lib/concoctions/api-actions.test.ts lib/email/lab/capabilities.ts
git commit -m "feat(concoctions): API — index/load/rebind/turn-into/freshness, datasets paid-only capability" -- app/api/concoctions/route.ts lib/concoctions/api-actions.ts lib/concoctions/api-actions.test.ts lib/email/lab/capabilities.ts
```

---

### Task 10: Lab — Dataset browser panel (load to canvas)

**Files:**
- Create: `components/email-lab/DatasetBrowser.tsx`
- 🟢 Modify: `app/email-lab/grid/EmailLabGridClient.tsx` (mount + wire)
- Test: `components/email-lab/DatasetBrowser.test.tsx`

**Interfaces:**
- Consumes: `GET /api/concoctions` (index), `POST { action: "load" }` (Task 9).
- Produces: `<DatasetBrowser onLoad={(blocks: EmailBlock[]) => void} />` — fetches the index once, renders category-grouped entries (label + description + tags), a param form per entry derived from `paramKeys` (text input for zip-ish keys, select when the def's index exposes enum values — extend `concoctionIndex()` with `paramOptions: Record<string, string[]>` derived from zod enum defs if not already), and a "Load onto canvas" button that POSTs load and hands the returned blocks up. All copy says Datasets; loading/error states inline; never renders an empty dataset silently (API error → visible message).

- [ ] **Step 1: Failing render test** — mock `fetch`; assert: index renders labels/categories, clicking Load POSTs `{ action: "load", id }` and calls `onLoad` with returned blocks, API error renders a message. Match the testing style of the newest `components/email-lab/*.test.tsx` (open one first and copy its harness — same renderer, same fetch-mock idiom).
- [ ] **Step 2: FAIL.** · **Step 3: Implement the component.** Then wire into `EmailLabGridClient.tsx`: read the file FIRST; mount `DatasetBrowser` in the existing side-panel/tab surface next to the block palette (whatever the client calls it), and implement `onLoad` as: append blocks to the doc through the SAME add-block/updateDoc path the palette uses (grep the client for its add-block handler; blocks arrive with `layout` — RGL renders them; ids are already unique per materializer). Gate visibility on the `datasets` capability.
- [ ] **Step 4: PASS** component tests + `bunx next build`.
- [ ] **Step 5: Commit**

```bash
git add components/email-lab/DatasetBrowser.tsx components/email-lab/DatasetBrowser.test.tsx app/email-lab/grid/EmailLabGridClient.tsx
git commit -m "feat(concoctions): Dataset browser in the grid lab — load a dataset's blocks onto the canvas" -- components/email-lab/DatasetBrowser.tsx components/email-lab/DatasetBrowser.test.tsx app/email-lab/grid/EmailLabGridClient.tsx
```

---

### Task 11: Lab — chips, Update/Update-all, always-fresh toggle

**Files:**
- Create: `components/email-lab/DatasetChip.tsx`
- 🟢 Modify: `app/email-lab/grid/EmailLabGridClient.tsx`
- Test: `components/email-lab/DatasetChip.test.tsx`

**Interfaces:**
- Consumes: freshness + rebind + turn-into API actions (Task 9); `BlockBinding` (chip reads `sourceLine`/`asOf`).
- Produces: `<DatasetChip binding={BlockBinding} stale={boolean} unrefreshable={boolean} onUpdate={() => void} onTurnInto={(t: BlockType) => void} onRebind={(params) => void} />` — renders `"<sourceLine> · As of <asOf>"`; when `stale`, an "Update" affordance (Google-pattern); when `unrefreshable`, a "Can't refresh — values kept" note and NO update affordance. Canvas-level behaviors wired in the client: on doc open run ONE `freshness` POST (metadata-only) and store the stale map; "Update all" button appears when any block is stale; per-doc "Keep always fresh" toggle persisted on the doc (add `alwaysFresh?: boolean` to the doc's meta the same way other doc-level settings are stored — find one in the doc schema and mirror it), and when ON, the FIRST EDIT ACTION of the session (the first updateBlock/add/remove call — hook the same dispatch the canvas already routes edits through) triggers Update-all once. NEVER on open (operator rule: accidental opens cost nothing). AI prose blocks are untouched by Update-all (only lane:"lake" bindings re-materialize).

- [ ] **Step 1: Failing tests** — chip renders source+as-of; stale → Update visible + onUpdate fires; unrefreshable → no Update; a small pure helper `shouldAutoRefresh({ alwaysFresh, hasEditedThisSession, anyStale })` returns true exactly once per session (test the helper directly — export it from the chip module).
- [ ] **Step 2: FAIL.** · **Step 3: Implement** chip + client wiring (freshness on open, Update per block → rebind POST with same params, Update-all loop, toggle persisted, first-edit trigger through the helper). · **Step 4: PASS + `bunx next build`.** · **Step 5: Commit**

```bash
git add components/email-lab/DatasetChip.tsx components/email-lab/DatasetChip.test.tsx app/email-lab/grid/EmailLabGridClient.tsx
git commit -m "feat(concoctions): dataset chips + Update/Update-all + edit-armed always-fresh toggle" -- components/email-lab/DatasetChip.tsx components/email-lab/DatasetChip.test.tsx app/email-lab/grid/EmailLabGridClient.tsx
```

---

### Task 12: Author engine — Datasets section + pre-author seeding

**Files:**
- Create: `lib/concoctions/author-section.ts`
- Modify: `lib/email/build-doc.ts` (two seams: system section + seeding)
- Test: `lib/concoctions/author-section.test.ts`

**Interfaces:**
- Consumes: `concoctionIndex()` (Task 4), `materializeLoad` (Task 5); the verified seams `lib/email/build-doc.ts:975-988` (`authorSystem({ ..., recipe: recipeSection(...) })`) and the `upsertChartBlock` seeding precedent.
- Produces: `datasetsSection(): string` — digit-free advisory prose listing each dataset (label + description + when to reach for it), appended into `authorSystem` exactly like `recipeSection` (add a `datasets?: string` arg alongside `recipe`). `resolveConcoction(explicit: string | null | undefined, prompt: string): string | null` — explicit id wins (validated against the registry, unknown → keyword detection, mirror `resolveRecipe`'s shape at `lib/email/author-recipes.ts:60-66`); keyword detection matches label/tags words against the prompt (e.g. /corridor|commercial|retail rent/i → corridor-profiles). In the build path: when `resolveConcoction` hits AND the resolved def's params can be satisfied from the prompt's already-parsed scope (ZIP/city/county the build path has), call `materializeLoad` and seed the blocks into the doc BEFORE the author model runs (same placement as chart upsert); the author then writes prose around real blocks. Params NOT satisfiable → skip seeding entirely (never guess a ZIP).

- [ ] **Step 1: Failing tests** — `datasetsSection()` contains every registry label and ZERO digits; `resolveConcoction("corridor-profiles", "anything")` → explicit wins; `resolveConcoction(null, "email about commercial corridor rents in Naples")` → "corridor-profiles"; `resolveConcoction(null, "hello")` → null; unknown explicit falls through to detection.
- [ ] **Step 2: FAIL.** · **Step 3: Implement + wire both seams** (read build-doc.ts around :975 and the chart-upsert call site before editing; keep the seeding conditional and logged with the doc's existing debug style). · **Step 4: PASS** `bun test lib/concoctions/ lib/email/` (the full email suite guards the author path) + `bunx next build`. · **Step 5: Commit**

```bash
git add lib/concoctions/author-section.ts lib/concoctions/author-section.test.ts lib/email/build-doc.ts
git commit -m "feat(concoctions): author engine reads the Datasets index + seeds resolved dataset blocks pre-author" -- lib/concoctions/author-section.ts lib/concoctions/author-section.test.ts lib/email/build-doc.ts
```

---

### Task 13: Social export — selection → PNG

**Files:**
- Create: `lib/concoctions/social-export.ts`
- Test: `lib/concoctions/social-export.test.ts`
- 🟡 Modify: `app/api/concoctions/route.ts` + `lib/concoctions/api-actions.ts` (new action `"social"`), `app/email-lab/grid/EmailLabGridClient.tsx` (selection → Export as image)

**Interfaces:**
- Consumes: `renderSocialImage` + `SocialModel`/`SOCIAL_FORMATS` from `@/lib/social/render-social-image` (verified: SocialModel `{ headline, stat?: { label, value, caption? }, chart?, … }`, resvg → PNG Buffer; read the full input model + function signature in the file before implementing); block selection with bindings.
- Produces: `blocksToSocialModel(blocks: EmailBlock[]): SocialModel` — headline from the first hero/signal/text block's text; stat from the first metric-card/stats cell (value restated VERBATIM — empty omits the stat, the renderer's own moat); provenance (sourceLine + asOf) from the first binding, feeding the renderer's watermark fields. `exportSocialPng(blocks, format: SocialFormat): Promise<Buffer>`. API action `{ action: "social", blocks, format }` → PNG (base64 in JSON, or binary response — mirror how existing routes return images; probe `app/api` for a social/og image route first and copy its response shape). Client: multi-select on the canvas (or simplest v1: "Export card" on a selected group) → POST → download. Flatten touches ONLY the export; canvas unchanged.

- [ ] **Step 1: Failing tests on `blocksToSocialModel`** — hero+metric-card+binding in → headline/stat/provenance out; no metric-card → stat undefined (omitted, no placeholder); no binding → provenance fields absent but model still valid.
- [ ] **Step 2: FAIL.** · **Step 3: Implement + wire the action + minimal client affordance.** · **Step 4: PASS + `bunx next build`.** · **Step 5: Commit**

```bash
git add lib/concoctions/social-export.ts lib/concoctions/social-export.test.ts lib/concoctions/api-actions.ts app/api/concoctions/route.ts app/email-lab/grid/EmailLabGridClient.tsx
git commit -m "feat(concoctions): social export — block selection flattens to a provenance-watermarked PNG" -- lib/concoctions/social-export.ts lib/concoctions/social-export.test.ts lib/concoctions/api-actions.ts app/api/concoctions/route.ts app/email-lab/grid/EmailLabGridClient.tsx
```

---

### Task 14: Lane "user" + email-export integration proof

**Files:**
- Create: `lib/concoctions/user-bundle.ts`, `lib/concoctions/integration.test.ts`
- Test: `lib/concoctions/user-bundle.test.ts`

**Interfaces:**
- Consumes: everything above; the email render path (find the render entry the lab's send/preview uses — `lib/email/render-email-doc.ts` — and call it directly in the integration test).
- Produces: `materializeUserFigure(figure: { label: string; value: string; attribution: string }, ids: () => string): EmailBlock` — a metric-card with lane:"user" binding (`bundleRef: "user-stated"`, `sourceLine: "Figure provided by <attribution>"`, `asOf` = the DOC's insertion date passed in by the caller — the client supplies it; never `new Date()` inside the pure function). Integration test proves the spec's end-to-end claims.

- [ ] **Step 1: Failing tests.** `user-bundle.test.ts`: figure in → metric-card out, value VERBATIM, lane "user", attribution in sourceLine. `integration.test.ts` (the mixed-lane canvas proof):

```ts
// lib/concoctions/integration.test.ts — assembled canvas renders everywhere
import { describe, it, expect } from "bun:test";
import { materializeLoad } from "./materialize";
import { materializeUserFigure } from "./user-bundle";
import { corridorProfiles } from "./defs/corridor-profiles";
import { stubSb } from "./defs/test-stub";
// import the real email renderer — read lib/email/render-email-doc.ts for the exact
// exported name + doc envelope it takes, and construct a minimal valid doc around
// the blocks (same shape the lab saves). Do NOT hand-roll HTML assertions beyond these.

const ROWS = [/* reuse the 5-row corridor fixture from materialize.test.ts verbatim */];

describe("mixed-lane canvas", () => {
  it("lake blocks + a user-stated figure render to email HTML with both provenances and no placeholders", async () => {
    const { blocks } = await materializeLoad(corridorProfiles, {}, { sb: stubSb(ROWS as never), hostPng: async () => "https://cdn/x.png" });
    const userBlock = materializeUserFigure(
      { label: "My building's rent", value: "$21.50", attribution: "operator" },
      () => "user-1",
    );
    const html = await renderDocToHtml([...blocks, userBlock]); // helper in this test wrapping the real renderer
    expect(html).toContain("SWFL Data Gulf verified corridor metrics");
    expect(html).toContain("Figure provided by operator");
    expect(html).toContain("$21.50");
    expect(html).not.toMatch(/\{\{|N\/A|undefined/);
  });
});
```

- [ ] **Step 2: FAIL.** · **Step 3: Implement `user-bundle.ts` + the test's `renderDocToHtml` helper around the real renderer.** · **Step 4: PASS** the whole `lib/concoctions/` + `lib/email/doc/` suites, then `bunx next build`, then the repo-wide `bun test lib/email/` (regression sweep — bindings must not disturb any send path). · **Step 5: Commit**

```bash
git add lib/concoctions/user-bundle.ts lib/concoctions/user-bundle.test.ts lib/concoctions/integration.test.ts
git commit -m "feat(concoctions): lane-user figures + mixed-lane canvas email-render integration proof" -- lib/concoctions/user-bundle.ts lib/concoctions/user-bundle.test.ts lib/concoctions/integration.test.ts
```

---

## Self-review (done at write time)

- Spec coverage: registry+manifest+guards (T2–4), binding+fence (T1), materializer load/rebind/turn-into (T5–7), refresh model incl. zero-cost opens + edit-armed toggle (T8, T11), lab browser+splice (T10–11 — splice itself is the grid's native ops, no new code), AI wiring (T12), email+social exports (T13–14), four lanes (T1 lanes + T14 user lane; upload/web extractors are spec phase 2), degenerate fixtures throughout (T2, T3, T4, T5). Binding versioning (T1, T7, T8).
- Not covered on purpose (spec non-goals): PDF/web exports, open composer, upload/web extractors, gallery/chat/desk loader migration.
- Type consistency: `BlockBinding`/`BindingSlice`/`BINDING_VERSION` (T1) used verbatim in T2 re-exports and T5–T14; `mapSliceToBlock`/`materializeLoad`/`rebindBlock`/`turnIntoBlock`/`BindingUnrefreshable` names stable across T5–T12; `stubSb` extracted once (T4) and reused.
- Honesty markers: every place the plan could NOT verify a seam in-session, the task says "open the file first and match it" (barChartSvg params, AuthoredBlockSchema fixture shape, corridor `county` column, api auth shell, renderer entry, image-route response shape) — no invented signatures. Every DATA fact is probed-live-07/12 and stamped as such.

## Execution notes

- After the final task: close-out session updates `_AUDIT_AND_ROADMAP/build-queue.md`, appends SESSION_LOG, and the operator pushes; `concoctions_live_verify` closes only on live evidence (load a Dataset on prod lab, splice, Update, export social PNG, receive a mixed-lane email).
- The old `viz_archetypes_live_verify` check: resolve as superseded when the operator retires that plan doc (named here so it is not a silent deferral).

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 5, Task 6, Task 7 | `lib/concoctions/materialize.ts` |
| 🟡 | Task 9, Task 13 | `app/api/concoctions/route.ts` |
| 🟢 | Task 10, Task 11 | `app/email-lab/grid/EmailLabGridClient.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
