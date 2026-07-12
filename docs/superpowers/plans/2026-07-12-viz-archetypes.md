# Viz Archetypes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 16 tasks, 26 files, 2 conflict groups, keywords: migration, schema, architecture

**Goal:** The 5 showcase viz templates become generic archetypes any data-that-goes-together can wear — data arrays tokenized via `data_json`, per-archetype zod contracts, a curated recipe registry filled from real lake data by a cron-wrapped build runner with build-time Sonnet commentary, stored builds served by a public `GET ?recipe=` render, and showcase previews going real.

**Architecture:** The existing token-substitution renderer (`renderHtmlTemplate`) is unchanged. Each shell gains one `const DATA = {{data_json}};` slot (serialized server-side with WHATWG-mandated `<` escaping) plus fully tokenized copy; per-archetype zod schemas gate every fill path; a recipe registry maps held lake tables → contracts; a bun runner (GHA cron) builds each recipe, has Sonnet write commentary against the filled payload (digit-guarded), and upserts `public.template_builds`; the render route serves stored builds with zero model calls per request.

**Tech Stack:** Next.js route handlers (nodejs runtime), bun scripts + bun:test, zod (already in repo), `@anthropic-ai/sdk` via `refinery/agents/anthropic.mts` (`getAnthropic` — spend-guarded + usage-logged), Supabase service-role clients (`utils/supabase/service-role.ts`), `bun scripts/run-migration.ts` for SQL.

**Spec:** `docs/superpowers/specs/2026-07-12-viz-archetypes-design.md` · **Check:** `viz_archetypes_live_verify`

## Global Constraints

- As-of dates render `MM/DD/YYYY`, stated once per card; the raw `SWFL-…-YYYYMMDD` freshness token is INTERNAL and its footer slot is REMOVED from every shell (spec §1).
- Never invent a number: recipe loaders read ONLY held tables (`public.corridor_profiles`, `data_lake.listing_transitions_recent_zip_stats`, `data_lake.fema_nfip_county_year_view`, `data_lake.daily_truth`); every recipe carries a real `source_line`.
- Brand stays exactly two tokens: `brand_primary` / `brand_secondary`. Rows NEVER carry raw colors — zod schemas are `.strict()` so a smuggled `color` key is a 400.
- Slugs are UNCHANGED (`viz/corridor-positioning` etc.) — manifest, showcase links, `@dsCard` registry all keep working.
- The serializer MUST escape `<` as the six-char sequence `\u003c` after `JSON.stringify` (WHATWG script-content rule, crawl4ai-verified in the spec). Every fill path uses it; callers hand rows, never pre-serialized strings.
- Empty commentary → the read block hides; a failed recipe build never replaces a stored good one.
- Verify with `bunx next build` (never `npx tsc`). Tests are `bun:test`.
- Commit per task with explicit paths (`git commit -- <paths>`); never `git add -A`. Do NOT push — the render route is a live `/api` surface; the operator pushes (RULE 1).
- WRITE-PAYLOAD TRAP: never type a literal `<` escape inside a JSON tool-call payload (it decodes to a real `<`). In code below the escape is built as `"\\u003c"` (double backslash in source) — keep it that way.

## File Structure

- `lib/templates/serialize-data-json.ts` (NEW) — the one serializer, pure.
- `lib/templates/serialize-data-json.test.ts` (NEW)
- `lib/templates/token-contracts.ts` (REWRITE) — archetype interfaces + zod row/token schemas + per-slug registry.
- `lib/templates/token-contracts.test.ts` (NEW)
- `templates/html/viz/*.html` (MODIFY ×5) — data_json slot, computed axes, semantic colors, read block, source/as-of footer.
- `lib/templates/manifest.ts` (MODIFY) — archetype copy; previewData reworked; new `previewRows`.
- `lib/templates/render-html-template.test.ts` (MODIFY) — smoke loop extended for previewRows + DATA-parseable checks.
- `app/api/templates/render/route.ts` (MODIFY) — POST zod-validates + serializes rows; GET `?slug=` uses previewRows; GET `?recipe=` serves stored builds w/ sample fallback.
- `lib/templates/template-builds-store.ts` (NEW) — read/upsert `public.template_builds`, DI-testable.
- `lib/templates/template-builds-store.test.ts` (NEW)
- `lib/templates/recipe-manifest.ts` (NEW) — client-safe recipe metadata (id, slug, label, scope).
- `lib/templates/recipes.server.ts` (NEW) — loaders + mappers (server-only).
- `lib/templates/recipes.server.test.ts` (NEW) — mapper tests on raw-row fixtures.
- `lib/templates/commentary.ts` (NEW) — digit guard + Sonnet writer.
- `lib/templates/commentary.test.ts` (NEW)
- `scripts/templates/build-recipes.mts` (NEW) — the runner.
- `scripts/templates/build-recipes.test.mts` (NEW)
- `docs/sql/20260712_template_builds.sql` (NEW)
- `.github/workflows/template-recipes.yml` (NEW)
- `app/showcase/ShowcaseGrid.tsx` (MODIFY) — recipe variant buttons per card.
- `refinery/agents/anthropic.mts` (MODIFY) — add `"template_build"` to the `CallType` union (one line).

## Starter recipe set (probed 07/12/2026 — every table verified in-repo)

| Recipe id | Archetype (slug) | Source (verified) |
|---|---|---|
| `corridor-cap-vac` | quadrant scatter (`viz/corridor-positioning`) | `public.corridor_profiles` — columns `corridor_name, city, corridor_type, evolution_direction, seasonal_index, cap_rate_pct, vacancy_rate_pct, absorption_sqft, asking_rent_psf, character, metrics_verified_date` (read exactly like `refinery/sources/cre-source.mts:473-490`: `deleted_at IS NULL`, `verification_status = 'verified'`) |
| `zip-market-activity` | quadrant scatter | `data_lake.listing_transitions_recent_zip_stats` — `county, zip_code, price_cuts_90d, sales_90d, new_listings_90d, latest_at` (view: `docs/sql/20260701_listing_transitions_recent_zip_stats.sql`) |
| `corridor-seasonal` | banded bars (`viz/seasonal-exposure`) | `public.corridor_profiles.seasonal_index` (same fetch as above) |
| `nfip-storm-years` | event timeline (`viz/storm-year-timeline`) | `data_lake.fema_nfip_county_year_view` — `county_code, year, claim_count, paid_total_usd` (view: `docs/sql/20260623_fema_nfip_county_year_view.sql`); storm names/categories are static labels with the OpenFEMA source line (storm-list reviewed 05/17/2026 — same provenance as today's shell). 2024 = Helene + Milton MERGED (the county-year grain can't split them; answer at the grain held). |
| `asking-price-nowcast` | baseline gauge (`viz/freight-nowcast`) | `data_lake.daily_truth` — `metric_key='median_asking_price', area='cape_coral', period, value, source_title` (read exactly like `lib/desk/loaders.ts:89-103`) |
| `market-activity-mix` | composition + focus (`viz/flood-exposure`) | `data_lake.listing_transitions_recent_zip_stats` county rollup (`zip_code IS NULL`) + per-ZIP focus row |

Follow-up recipe candidates (NOT in this plan): `data_lake.redfin_city_swfl` city price-growth bars (landed 07/12/2026), FDOT freight gauge (needs the freight brain's z math exposed at a readable seam), flood SFHA composition (needs the env brain's NFHL aggregates at a readable seam). The registry is designed so each lands as one `RecipeDef` + one mapper test.

---

### Task 1: Serializer — `serializeDataJson`

**Files:**
- Create: `lib/templates/serialize-data-json.ts`
- Test: `lib/templates/serialize-data-json.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `serializeDataJson(value: unknown): string` — JSON with every `<` escaped as `\u003c`, and U+2028/U+2029 as their `\u` escapes. Tasks 8, 12, 13 call it on every rows payload.

- [ ] **Step 1: Write the failing test**

```ts
// lib/templates/serialize-data-json.test.ts
import { describe, it, expect } from "bun:test";
import { serializeDataJson } from "./serialize-data-json";

const LT = String.fromCharCode(60); // "<" built without a literal, so this file can't be mangled by editors
const U2028 = String.fromCharCode(0x2028);
const U2029 = String.fromCharCode(0x2029);

describe("serializeDataJson", () => {
  it("escapes </script> breakout attempts", () => {
    const out = serializeDataJson([{ note: `${LT}/script${LT}script>alert(1)` }]);
    expect(out).not.toContain(LT);
    expect(out).toContain("\\u003c/script");
  });

  it("escapes <!-- comment openers", () => {
    const out = serializeDataJson([{ note: `${LT}!-- sneaky` }]);
    expect(out).not.toContain(LT);
  });

  it("escapes U+2028 / U+2029 line separators", () => {
    const out = serializeDataJson([{ note: `a${U2028}b${U2029}c` }]);
    expect(out).not.toContain(U2028);
    expect(out).not.toContain(U2029);
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  it("round-trips through JSON.parse unchanged", () => {
    const rows = [{ id: "a", label: `x ${LT} y`, x: 6.5, y: 4.2, nested: { deep: true } }];
    expect(JSON.parse(serializeDataJson(rows))).toEqual(rows);
  });

  it("plain rows serialize like JSON.stringify", () => {
    const rows = [{ id: "a", x: 1 }];
    expect(serializeDataJson(rows)).toBe(JSON.stringify(rows));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/templates/serialize-data-json.test.ts`
Expected: FAIL — `Cannot find module './serialize-data-json'`

- [ ] **Step 3: Write the implementation**

```ts
// lib/templates/serialize-data-json.ts
/**
 * The ONE serializer for data poured into a shell's `const DATA = {{data_json}};`
 * slot. The renderer substitutes tokens verbatim, so raw `<` in a JSON string
 * could open `</script>` / `<script` / `<!--` inside the script block — the
 * WHATWG script-content restrictions mean the parser then never closes the
 * block. The spec-sanctioned remedy is escaping `<` as the six-char
 * sequence `\u003c` after
 * JSON.stringify (see spec 2026-07-12-viz-archetypes-design.md, research
 * findings). U+2028/U+2029 are escaped too — belt-and-suspenders for old JS
 * engines where they terminate a line.
 *
 * JSON.parse treats the escaped form inside a string as an ordinary JSON escape, so the
 * emitted text stays valid JSON AND a valid JS object literal.
 */
export function serializeDataJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/templates/serialize-data-json.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/templates/serialize-data-json.ts lib/templates/serialize-data-json.test.ts
git commit -m "feat(templates): serializeDataJson — WHATWG-safe JSON-in-script serializer" -- lib/templates/serialize-data-json.ts lib/templates/serialize-data-json.test.ts
```

---

### Task 2: Contracts — archetype interfaces + zod schemas

**Files:**
- Rewrite: `lib/templates/token-contracts.ts`
- Test: `lib/templates/token-contracts.test.ts`

**Interfaces:**
- Consumes: `zod` (`import { z } from "zod"` — same style as `lib/project/items.ts`).
- Produces (used by Tasks 8, 10, 12):
  - `BrandTokens` (unchanged: `brand_primary`, `brand_secondary`).
  - Row schemas: `quadrantScatterRowSchema`, `bandedBarsRowSchema`, `eventTimelineRowSchema` (all `.strict()`).
  - Scalar token schemas per slug: `quadrantScatterTokensSchema`, `bandedBarsTokensSchema`, `eventTimelineTokensSchema`, `baselineGaugeTokensSchema`, `compositionFocusTokensSchema`.
  - `getContract(slug: string): { tokensSchema: z.ZodTypeAny; rowsSchema: z.ZodTypeAny | null } | undefined` — `rowsSchema` is `null` for the two scalar archetypes.
  - Inferred TS types: `QuadrantScatterRow`, `BandedBarsRow`, `EventTimelineRow`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/templates/token-contracts.test.ts
import { describe, it, expect } from "bun:test";
import {
  getContract,
  quadrantScatterRowSchema,
  bandedBarsRowSchema,
  eventTimelineRowSchema,
} from "./token-contracts";

const BRAND = { brand_primary: "#3DC9C0", brand_secondary: "#E08158" };
const COMMON = { source_line: "SWFL Data Gulf", as_of: "07/12/2026", card_read: "" };

describe("contract registry", () => {
  it("every viz slug has a contract; scalar archetypes have null rowsSchema", () => {
    expect(getContract("viz/corridor-positioning")?.rowsSchema).not.toBeNull();
    expect(getContract("viz/seasonal-exposure")?.rowsSchema).not.toBeNull();
    expect(getContract("viz/storm-year-timeline")?.rowsSchema).not.toBeNull();
    expect(getContract("viz/freight-nowcast")?.rowsSchema).toBeNull();
    expect(getContract("viz/flood-exposure")?.rowsSchema).toBeNull();
    expect(getContract("viz/nope")).toBeUndefined();
  });
});

describe("quadrant scatter rows", () => {
  const good = {
    id: "alico", label: "Alico Industrial", sublabel: "Fort Myers · industrial flex",
    x: 6.0, y: 3.0, size: 185000, category: "growing", labeled: true,
    note: "Zero seasonality.", metrics: [{ label: "Rent PSF", value: "$16.50" }],
  };
  it("accepts a full row", () => {
    expect(quadrantScatterRowSchema.safeParse(good).success).toBe(true);
  });
  it("rejects a missing numeric axis", () => {
    const { x: _x, ...noX } = good;
    expect(quadrantScatterRowSchema.safeParse(noX).success).toBe(false);
  });
  it("rejects raw-color smuggling (strict)", () => {
    expect(quadrantScatterRowSchema.safeParse({ ...good, color: "#FF0000" }).success).toBe(false);
  });
  it("rejects more than 4 metrics", () => {
    const m = { label: "L", value: "v" };
    expect(quadrantScatterRowSchema.safeParse({ ...good, metrics: [m, m, m, m, m] }).success).toBe(false);
  });
});

describe("banded bars rows", () => {
  it("accepts and rejects", () => {
    expect(bandedBarsRowSchema.safeParse({ id: "a", label: "Alico", value: 0.1 }).success).toBe(true);
    expect(bandedBarsRowSchema.safeParse({ id: "a", label: "Alico", value: "x" }).success).toBe(false);
  });
});

describe("event timeline rows", () => {
  it("accepts and rejects", () => {
    expect(eventTimelineRowSchema.safeParse({ when: "2022", title: "Ian", value: 8200000, emphasis: true }).success).toBe(true);
    expect(eventTimelineRowSchema.safeParse({ when: "2022", value: 1 }).success).toBe(false);
  });
});

describe("scalar token contracts", () => {
  it("gauge tokens validate", () => {
    const t = getContract("viz/freight-nowcast")!.tokensSchema;
    const parsed = t.safeParse({
      ...BRAND, ...COMMON,
      eyebrow: "e", title: "t", subtitle: "s",
      z_value: -0.02, state_name: "normal", state_detail: "on baseline",
      gauge_caption: "DEVIATION FROM 90-DAY ROLLING MEAN", verdict_pill: "Shock state",
      grid_1_label: "Deviation %", grid_1_value: "0.0%",
      grid_2_label: "Baseline flag", grid_2_value: "valid",
      grid_3_label: "History days", grid_3_value: "90",
      grid_4_label: "Breach days", grid_4_value: "0",
      compare_title: "Activity · current vs rolling baseline",
      value_label: "Current activity", value_sub: "annualized", value_display: "242,430,080", value_units: "tons/year",
      baseline_label: "Rolling-mean baseline", baseline_sub: "90-day window", baseline_display: "242,477,266",
      stddev_label: "Rolling-stddev baseline", stddev_sub: "z denominator", stddev_display: "±2,179,960",
      current_target: 100, mean_target: 100.02, stddev_target: 0.9,
      rail_1_label: "Segments", rail_1_value: "9", rail_1_sub: "freight-coded",
      rail_2_label: "Avg payload", rail_2_value: "16", rail_2_sub: "tons/truck",
      rail_3_label: "FAF5 context", rail_3_value: "0", rail_3_sub: "context only",
      rail_4_label: "Counties", rail_4_value: "2", rail_4_sub: "Lee · Collier",
    });
    expect(parsed.success).toBe(true);
  });
  it("rejects a freshness_token key on every contract (internal token banned)", () => {
    for (const slug of ["viz/corridor-positioning", "viz/freight-nowcast", "viz/flood-exposure"]) {
      const t = getContract(slug)!.tokensSchema;
      const r = t.safeParse({ freshness_token: "SWFL-1-1-20260101" });
      expect(r.success).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/templates/token-contracts.test.ts`
Expected: FAIL — `getContract` not exported

- [ ] **Step 3: Rewrite `lib/templates/token-contracts.ts`**

```ts
// lib/templates/token-contracts.ts
import { z } from "zod";

/**
 * Token contracts for the 5 viz archetypes in `templates/html/viz/`.
 *
 * v2 (spec 2026-07-12-viz-archetypes-design.md): the shells are GENERIC.
 * Data arrays travel as validated rows (serialized into `{{data_json}}` by
 * `serializeDataJson`); all copy is scalar tokens. Every contract carries:
 *  - `brand_primary` / `brand_secondary` — the ONLY brand knobs.
 *  - `source_line` — names the real source (rule 1; never invented).
 *  - `as_of` — MM/DD/YYYY, stated once. The old `freshness_token` footer slot
 *    is GONE: the raw token is internal and never ships on a card.
 *  - `card_read` — the labeled AI read block; empty string → block hides.
 * Rows are `.strict()` so callers can NEVER smuggle raw colors — color is
 * semantic (`category` order / band / `emphasis`), resolved in-shell.
 */

export interface BrandTokens {
  brand_primary: string;
  brand_secondary: string;
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const asOf = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/); // MM/DD/YYYY only
const fmt = z.enum(["percent", "currency", "number"]);

const commonTokens = {
  brand_primary: hex,
  brand_secondary: hex,
  source_line: z.string().min(1),
  as_of: asOf,
  card_read: z.string(), // "" allowed — block hides
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string(),
};

// ── Quadrant scatter (viz/corridor-positioning) ─────────────────────────────
export const quadrantScatterRowSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    sublabel: z.string().optional(),
    x: z.number().finite(),
    y: z.number().finite(),
    size: z.number().finite(),
    category: z.string().min(1),
    labeled: z.boolean().optional(),
    note: z.string().optional(),
    metrics: z.array(z.object({ label: z.string(), value: z.string() }).strict()).max(4).optional(),
  })
  .strict();
export type QuadrantScatterRow = z.infer<typeof quadrantScatterRowSchema>;

export const quadrantScatterTokensSchema = z
  .object({
    ...commonTokens,
    frame_title: z.string(),
    frame_sub: z.string(),
    x_label: z.string(),
    y_label: z.string(),
    x_format: fmt,
    y_format: fmt,
    median_x: z.number().finite(),
    median_y: z.number().finite(),
    median_label: z.string(),
    quad_label_low: z.string(),  // bottom-left quadrant (mangrove)
    quad_label_high: z.string(), // top-right quadrant (brand secondary)
    size_caption: z.string(),
    detail_empty: z.string(),
  })
  .strict();

// ── Banded bars (viz/seasonal-exposure) ─────────────────────────────────────
export const bandedBarsRowSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    sublabel: z.string().optional(),
    value: z.number().finite(),
    note: z.string().optional(),
  })
  .strict();
export type BandedBarsRow = z.infer<typeof bandedBarsRowSchema>;

export const bandedBarsTokensSchema = z
  .object({
    ...commonTokens,
    frame_title: z.string(),
    frame_sub: z.string(),
    band_1_label: z.string(),
    band_2_label: z.string(),
    band_3_label: z.string(),
    band_1_max: z.number().finite(), // value cut-point band1/band2
    band_2_max: z.number().finite(), // value cut-point band2/band3
    scale_max: z.number().positive(), // right edge of the track
    value_format: fmt,
    rail_total_label: z.string(),
    rail_total_sub: z.string(),
    detail_empty: z.string(),
  })
  .strict();

// ── Event timeline (viz/storm-year-timeline) ────────────────────────────────
export const eventTimelineRowSchema = z
  .object({
    when: z.string().min(1),
    title: z.string().min(1),
    badge: z.string().optional(),
    value: z.number().finite(),
    note: z.string().optional(),
    emphasis: z.boolean().optional(),
  })
  .strict();
export type EventTimelineRow = z.infer<typeof eventTimelineRowSchema>;

export const eventTimelineTokensSchema = z
  .object({
    ...commonTokens,
    frame_title: z.string(),
    frame_sub: z.string(),
    value_format: fmt,
    rail_1_label: z.string(), rail_1_sub: z.string(),   // count cell — value computed in-shell
    rail_2_label: z.string(), rail_2_sub: z.string(),   // cumulative cell — computed in-shell
    baseline_label: z.string(),
    baseline_value: z.string(),
    baseline_sub: z.string(),
    scope_label: z.string(), scope_value: z.string(), scope_sub: z.string(),
    baseline_note: z.string(),
  })
  .strict();

// ── Baseline gauge (viz/freight-nowcast) — scalar ────────────────────────────
export const baselineGaugeTokensSchema = z
  .object({
    ...commonTokens,
    z_value: z.number().finite(),
    state_name: z.string(),
    state_detail: z.string(),
    gauge_caption: z.string(),
    verdict_pill: z.string(),
    grid_1_label: z.string(), grid_1_value: z.string(),
    grid_2_label: z.string(), grid_2_value: z.string(),
    grid_3_label: z.string(), grid_3_value: z.string(),
    grid_4_label: z.string(), grid_4_value: z.string(),
    compare_title: z.string(),
    value_label: z.string(), value_sub: z.string(), value_display: z.string(), value_units: z.string(),
    baseline_label: z.string(), baseline_sub: z.string(), baseline_display: z.string(),
    stddev_label: z.string(), stddev_sub: z.string(), stddev_display: z.string(),
    current_target: z.number(), mean_target: z.number(), stddev_target: z.number(),
    rail_1_label: z.string(), rail_1_value: z.string(), rail_1_sub: z.string(),
    rail_2_label: z.string(), rail_2_value: z.string(), rail_2_sub: z.string(),
    rail_3_label: z.string(), rail_3_value: z.string(), rail_3_sub: z.string(),
    rail_4_label: z.string(), rail_4_value: z.string(), rail_4_sub: z.string(),
  })
  .strict();

// ── Composition + focus (viz/flood-exposure) — scalar ────────────────────────
export const compositionFocusTokensSchema = z
  .object({
    ...commonTokens,
    section_1_label: z.string(), section_1_title: z.string(),
    seg_1_label: z.string(), seg_1_pct: z.number().min(0).max(100), seg_1_detail: z.string(),
    seg_2_label: z.string(), seg_2_pct: z.number().min(0).max(100), seg_2_detail: z.string(),
    seg_3_label: z.string(), seg_3_pct: z.number().min(0).max(100), seg_3_detail: z.string(),
    section_2_label: z.string(), section_2_title: z.string(),
    multiple_value: z.string(), multiple_caption: z.string(),
    row_1_label: z.string(), row_1_value: z.string(), row_1_target: z.number(),
    row_2_label: z.string(), row_2_value: z.string(), row_2_target: z.number(),
    row_3_label: z.string(), row_3_left: z.string(), row_3_value: z.string(),
    section_3_label: z.string(), section_3_title: z.string(),
    focus_tag: z.string(), focus_name: z.string(), focus_place: z.string(),
    cell_1_label: z.string(), cell_1_value: z.string(), cell_1_sub: z.string(),
    cell_2_label: z.string(), cell_2_value: z.string(), cell_2_sub: z.string(),
    cell_3_label: z.string(), cell_3_value: z.string(), cell_3_sub: z.string(),
    trans_label: z.string(), trans_text: z.string(),
  })
  .strict();

// ── Registry ────────────────────────────────────────────────────────────────
const CONTRACTS: Record<string, { tokensSchema: z.ZodTypeAny; rowsSchema: z.ZodTypeAny | null }> = {
  "viz/corridor-positioning": {
    tokensSchema: quadrantScatterTokensSchema,
    rowsSchema: z.array(quadrantScatterRowSchema).min(1),
  },
  "viz/seasonal-exposure": {
    tokensSchema: bandedBarsTokensSchema,
    rowsSchema: z.array(bandedBarsRowSchema).min(1),
  },
  "viz/storm-year-timeline": {
    tokensSchema: eventTimelineTokensSchema,
    rowsSchema: z.array(eventTimelineRowSchema).min(1),
  },
  "viz/freight-nowcast": { tokensSchema: baselineGaugeTokensSchema, rowsSchema: null },
  "viz/flood-exposure": { tokensSchema: compositionFocusTokensSchema, rowsSchema: null },
};

export function getContract(slug: string) {
  return CONTRACTS[slug];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/templates/token-contracts.test.ts`
Expected: PASS. (The old interfaces are gone — nothing else imports them except `manifest.ts`'s doc comment; confirm with `grep -r "CorridorPositioningTokens\|FloodExposureTokens\|FreightNowcastTokens\|SeasonalExposureTokens\|StormYearTimelineTokens" --include="*.ts" --include="*.tsx" .` and update any hit to the new names. `manifest.ts` `tokenType` strings update in Task 3–7.)

- [ ] **Step 5: Commit**

```bash
git add lib/templates/token-contracts.ts lib/templates/token-contracts.test.ts
git commit -m "feat(templates): per-archetype zod contracts — strict rows, as-of replaces freshness_token" -- lib/templates/token-contracts.ts lib/templates/token-contracts.test.ts
```

---

### Task 3: Shell — corridor-positioning → generic quadrant scatter

**Files:**
- Modify: `templates/html/viz/corridor-positioning.html`
- 🔴 Modify: `lib/templates/manifest.ts` (this slug's entry only)
- Modify: `lib/templates/render-html-template.test.ts`

**Interfaces:**
- Consumes: `{{data_json}}` filled with `QuadrantScatterRow[]` (Task 2), scalar tokens from `quadrantScatterTokensSchema`.
- Produces: a shell whose per-render behavior Tasks 8/13 rely on: `const DATA = {{data_json}};`, axes computed from DATA, category colors from first-seen order over `CAT_COLORS`, `card_read` block that hides when empty.

Shell edit map (exact replacements; everything not named stays byte-identical):

- [ ] **Step 1: Replace the hardcoded body copy with tokens.** In the `<main>` block replace lines 91–95 (eyebrow → sub) with:

```html
  <span class="v-eyebrow">{{eyebrow}}</span>
  <h1>{{title}}</h1>
  <p class="v-sub">{{subtitle}}</p>
```

Replace the frame head (lines 98–101 contents) with `{{frame_title}}` / `{{frame_sub}}`. Replace the footer block (lines 112–115) with:

```html
  <div class="v-read" id="read" hidden>
    <span class="v-read-label">THE READ</span>
    <p class="v-read-text" id="read-text"></p>
  </div>

  <div class="v-foot">
    <span>{{source_line}}</span>
    <span>As of {{as_of}}</span>
  </div>
```

And add the read-block styles next to `.v-foot` in the `<style>` block:

```css
  .v-read { margin-top: 24px; background: var(--gulf-deep); border: 1px solid var(--gulf-haze); border-radius: 8px; padding: 18px 22px; }
  .v-read-label { font-family: var(--font-mono); font-size: 10px; color: var(--gulf-teal); letter-spacing: 0.1em; text-transform: uppercase; font-weight: 500; display: block; margin-bottom: 8px; }
  .v-read-text { margin: 0; font-size: 14px; line-height: 1.55; color: var(--text-primary); max-width: 70ch; }
```

- [ ] **Step 2: Replace the entire `<script type="module">` body** with the generic version (CORRIDORS array and EVOLUTION_COLOR are deleted — this is the whole script):

```html
<script type="module">
// Generic quadrant scatter. DATA is validated server-side (quadrantScatterRowSchema)
// and serialized via serializeDataJson — never hand-inject this token.
const DATA = {{data_json}};
const CARD_READ = `{{card_read}}`;

// Semantic colors: categories take palette slots in FIRST-SEEN order.
// Slots 2 & 4 are the brand pair, so the caller's category order decides
// where the brand lands (rows never carry raw colors).
const CAT_COLORS = ["#5BC97A", "{{brand_primary}}", "#D4B370", "{{brand_secondary}}"];
const categories = [...new Set(DATA.map(d => d.category))];
const colorFor = c => CAT_COLORS[categories.indexOf(c) % CAT_COLORS.length];

const FMT = { x: "{{x_format}}", y: "{{y_format}}" };
function fmtVal(v, kind) {
  if (kind === "percent") return `${v}%`;
  if (kind === "currency") return `$${v.toLocaleString("en-US")}`;
  return v.toLocaleString("en-US");
}

// Axis ranges from DATA — pad 12%, then 5 evenly spaced ticks.
function range(vals, pad = 0.12) {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  return [lo - span * pad, hi + span * pad];
}
function ticks(lo, hi, n = 5) {
  const step = (hi - lo) / (n - 1);
  return Array.from({ length: n }, (_, i) => lo + step * i);
}
const tickLabel = v => Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : (Math.round(v * 10) / 10).toString();

const SVG = document.getElementById("scatter");
const W = 700, H = 360;
const PAD = { top: 24, right: 28, bottom: 44, left: 56 };
const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;
const [xMin, xMax] = range(DATA.map(d => d.x));
const [yMin, yMax] = range(DATA.map(d => d.y));
const xPos = v => PAD.left + ((v - xMin) / (xMax - xMin)) * innerW;
const yPos = v => PAD.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
const sizes = DATA.map(d => Math.abs(d.size));
const sizeMax = Math.max(...sizes, 1);
const rPos = s => 4 + Math.sqrt(Math.abs(s) / sizeMax) * 14;

let svgContent = "";
ticks(xMin, xMax).forEach(t => {
  svgContent += `<line class="v-grid" x1="${xPos(t)}" y1="${PAD.top}" x2="${xPos(t)}" y2="${PAD.top + innerH}" />`;
  svgContent += `<text class="v-tick" x="${xPos(t)}" y="${H - 22}" text-anchor="middle">${fmtVal(tickLabel(t), FMT.x === "percent" ? "percent" : "number")}</text>`;
});
ticks(yMin, yMax).forEach(t => {
  svgContent += `<line class="v-grid" x1="${PAD.left}" y1="${yPos(t)}" x2="${PAD.left + innerW}" y2="${yPos(t)}" />`;
  svgContent += `<text class="v-tick" x="${PAD.left - 12}" y="${yPos(t) + 3}" text-anchor="end">${fmtVal(tickLabel(t), FMT.y === "percent" ? "percent" : "number")}</text>`;
});

svgContent += `<text class="v-axis-label" x="${PAD.left + innerW / 2}" y="${H - 4}" text-anchor="middle">{{x_label}}</text>`;
svgContent += `<g transform="translate(16, ${PAD.top + innerH / 2}) rotate(-90)"><text class="v-axis-label" text-anchor="middle">{{y_label}}</text></g>`;

// Median crosshair (values are tokens — the caller computes them)
const MEDIAN_X = {{median_x}}, MEDIAN_Y = {{median_y}};
const medX = xPos(MEDIAN_X), medY = yPos(MEDIAN_Y);
svgContent += `<line class="v-median" x1="${medX}" y1="${PAD.top}" x2="${medX}" y2="${PAD.top + innerH}" />`;
svgContent += `<line class="v-median" x1="${PAD.left}" y1="${medY}" x2="${PAD.left + innerW}" y2="${medY}" />`;
svgContent += `<text class="v-quad" x="${medX + 6}" y="${PAD.top + 12}" fill="{{brand_primary}}">{{median_label}}</text>`;

// Quadrant labels
svgContent += `<text class="v-quad" x="${PAD.left + 8}" y="${PAD.top + innerH - 8}" fill="#5BC97A">{{quad_label_low}}</text>`;
svgContent += `<text class="v-quad" x="${PAD.left + innerW - 8}" y="${PAD.top + 14}" text-anchor="end" fill="{{brand_secondary}}">{{quad_label_high}}</text>`;

DATA.forEach(d => {
  const cx = xPos(d.x), cy = yPos(d.y), r = rPos(d.size), color = colorFor(d.category);
  svgContent += `
    <g class="v-bubble" data-id="${d.id}">
      <circle class="v-bubble-ring" cx="${cx}" cy="${cy}" r="${r + 6}" stroke="${color}" />
      <circle class="v-bubble-fill" cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity="0.22" stroke="${color}" />
      <circle cx="${cx}" cy="${cy}" r="2.5" fill="${color}" />
      ${d.labeled ? `<text class="v-bubble-label" x="${cx + r + 8}" y="${cy + 4}">${d.label}</text>` : ""}
    </g>
  `;
});
SVG.innerHTML = svgContent;

const legend = document.getElementById("legend");
legend.innerHTML = categories.map(k =>
  `<span class="v-legend-item"><span class="v-legend-dot" style="background:${colorFor(k)};color:${colorFor(k)};"></span>${k}</span>`
).join("") + `<span class="v-legend-item" style="margin-left:auto;color:var(--text-tertiary);">{{size_caption}}</span>`;

// The read block hides when commentary is empty (empty-tolerant).
const readEl = document.getElementById("read");
if (CARD_READ.trim()) {
  document.getElementById("read-text").textContent = CARD_READ;
  readEl.hidden = false;
}

const detail = document.getElementById("detail");
const page = document.querySelector(".v-page");
let selectedId = null;

function renderDetail(id) {
  if (!id) {
    detail.innerHTML = `<div class="v-detail-empty">{{detail_empty}}</div>`;
    return;
  }
  const d = DATA.find(x => x.id === id);
  const color = colorFor(d.category);
  const metrics = (d.metrics ?? []).map(m =>
    `<div class="v-detail-metric"><span class="v-detail-mlabel">${m.label}</span><span class="v-detail-mvalue">${m.value}</span></div>`
  ).join("");
  detail.innerHTML = `
    <div class="v-detail-head">
      <div>
        <div class="v-detail-meta">${d.sublabel ?? ""}</div>
        <h3 class="v-detail-name">${d.label}</h3>
      </div>
      <span class="v-evolution-pill" style="color:${color};border-color:${color};">${d.category}</span>
    </div>
    ${d.note ? `<blockquote class="v-detail-quote" style="color:${color};"><span style="color:var(--text-primary);">${d.note}</span></blockquote>` : ""}
    ${metrics ? `<div class="v-detail-metrics">${metrics}</div>` : ""}
  `;
}
renderDetail(null);

SVG.querySelectorAll(".v-bubble").forEach(g => {
  g.addEventListener("click", () => {
    const id = g.dataset.id;
    if (id === selectedId) {
      selectedId = null;
      g.classList.remove("is-active");
      page.classList.remove("has-selection");
    } else {
      selectedId = id;
      SVG.querySelectorAll(".v-bubble").forEach(x => x.classList.remove("is-active"));
      g.classList.add("is-active");
      page.classList.add("has-selection");
    }
    renderDetail(selectedId);
  });
});
</script>
```

Also update the top-of-file HTML comment: the "Per-corridor data stays inline… out of scope for v1" paragraph is replaced with "Generic quadrant scatter — DATA arrives via {{data_json}} (serializeDataJson-escaped), categories map to palette slots in first-seen order (slots 2/4 = brand pair)."

- [ ] **Step 3: Rework this slug's manifest entry.** `TemplateEntry` gains `previewRows?: Record<string, unknown>[]` (add the field to the type in this task; the other entries gain theirs in Tasks 4–7). Replace the corridor entry with archetype copy plus the ex-inline corridors as sample rows — values are the SAME real profile figures the shell carried (unchanged provenance):

```ts
  {
    slug: "viz/corridor-positioning",
    family: "viz",
    id: "001",
    name: "Quadrant scatter",
    subtitle: "Any x × y positioning, sized + categorized",
    description:
      "Quadrant scatter for any two measures that position a set — corridors on cap rate × vacancy, ZIPs on listings × sales. Bubble size, categories, median crosshair, and click-through detail all come from your data.",
    tokenType: "quadrantScatterTokensSchema",
    previewData: {
      eyebrow: "SWFL CRE · 7 corridors",
      title: "Where does each corridor sit on cap rate × vacancy?",
      subtitle:
        "Bubble size scales with absorption magnitude. Color marks corridor evolution. Pack medians fall at 6.5% cap / 6.0% vacancy — the dashed crosshair. Click any bubble for the full profile.",
      frame_title: "Cap rate × vacancy positioning",
      frame_sub: "Tightening pricing → · Tightening space ↑",
      x_label: "CAP RATE", y_label: "VACANCY",
      x_format: "percent", y_format: "percent",
      median_x: 6.5, median_y: 6.0,
      median_label: "PACK MEDIAN · 6.5% / 6.0%",
      quad_label_low: "LANDLORD MARKET", quad_label_high: "DISTRESSED",
      size_caption: "Bubble size · |net absorption|",
      detail_empty: "Click any corridor to inspect →",
      card_read: "",
      source_line: "Sourced from SWFL CRE corridor profiles · Lee + Collier counties",
      as_of: "05/22/2026",
      brand_primary: SWFL_BRAND_PRIMARY,
      brand_secondary: SWFL_BRAND_SECONDARY,
    },
    previewRows: [
      { id: "immokalee", label: "Immokalee Rd", sublabel: "Naples · Collier · highway strip mall", x: 5.8, y: 4.2, size: 120500, category: "stable", labeled: true,
        note: "The 'Suburban 5th Avenue' — true commercial gravity center of north Collier, anchored by daytime medical-tech employment.",
        metrics: [{ label: "Cap rate", value: "5.8%" }, { label: "Vacancy", value: "4.2%" }, { label: "Absorption", value: "+121K sqft" }, { label: "Rent PSF", value: "$42.50" }] },
      { id: "gulf-coast", label: "Gulf Coast TC", sublabel: "Estero · Lee · anchor-dependent", x: 7.5, y: 12.0, size: 45000, category: "repositioning",
        note: "Big-box power center whose health tracks a handful of anchor leases. Anchor turnover is the dominant risk variable.",
        metrics: [{ label: "Cap rate", value: "7.5%" }, { label: "Vacancy", value: "12.0%" }, { label: "Absorption", value: "+45K sqft" }, { label: "Rent PSF", value: "$28.00" }] },
      { id: "estero", label: "Estero Blvd", sublabel: "Fort Myers Beach · Lee · beachfront tourism", x: 8.5, y: 18.0, size: -5000, category: "repositioning", labeled: true,
        note: "Barrier-island tourism corridor mid-rebuild after Hurricane Ian. Extreme seasonality — winter-quarter revenue carries the year.",
        metrics: [{ label: "Cap rate", value: "8.5%" }, { label: "Vacancy", value: "18.0%" }, { label: "Absorption", value: "-5K sqft" }, { label: "Rent PSF", value: "$45.00" }] },
      { id: "pine-ridge", label: "Pine Ridge Rd", sublabel: "Naples · Collier · medical-anchored", x: 6.5, y: 6.0, size: 28000, category: "stable",
        note: "Medical-office and health-services corridor with a stable, age-driven demand base less exposed to tourist seasonality.",
        metrics: [{ label: "Cap rate", value: "6.5%" }, { label: "Vacancy", value: "6.0%" }, { label: "Absorption", value: "+28K sqft" }, { label: "Rent PSF", value: "$38.00" }] },
      { id: "cape-coral", label: "Cape Coral Pkwy", sublabel: "Cape Coral · Lee · suburban residential", x: 6.2, y: 5.0, size: 32000, category: "growing",
        note: "Neighborhood-serving retail spine for a fast-growing residential base. Demand is rooftop-driven, not destination-driven.",
        metrics: [{ label: "Cap rate", value: "6.2%" }, { label: "Vacancy", value: "5.0%" }, { label: "Absorption", value: "+32K sqft" }, { label: "Rent PSF", value: "$32.50" }] },
      { id: "alico", label: "Alico Industrial", sublabel: "Fort Myers · Lee · industrial flex", x: 6.0, y: 3.0, size: 185000, category: "growing", labeled: true,
        note: "Logistics and light-industrial flex corridor riding regional distribution growth. Effectively zero seasonality.",
        metrics: [{ label: "Cap rate", value: "6.0%" }, { label: "Vacancy", value: "3.0%" }, { label: "Absorption", value: "+185K sqft" }, { label: "Rent PSF", value: "$16.50" }] },
      { id: "us41-bonita", label: "US-41 Bonita", sublabel: "Bonita Springs · Lee · highway strip mall", x: 7.0, y: 8.0, size: 12000, category: "stable",
        metrics: [{ label: "Cap rate", value: "7.0%" }, { label: "Vacancy", value: "8.0%" }, { label: "Absorption", value: "+12K sqft" }, { label: "Rent PSF", value: "$26.50" }] },
    ],
  },
```

NOTE the category order in previewRows starts with `stable`… which would give `stable` the mangrove slot. Category first-seen order controls color; to keep today's exact look (growing=mangrove, stable=teal, repositioning=gold), order rows so a `growing` row is first: move `cape-coral` (growing) to the front of previewRows, then `immokalee` (stable), then `gulf-coast` (repositioning), then the rest. Apply that ordering in the actual edit; recipes do the same (Task 10).

- [ ] **Step 4: Wire the smoke test.** In `render-html-template.test.ts` the manifest loop must now serialize previewRows. Replace the loop body's render calls:

```ts
import { serializeDataJson } from "./serialize-data-json";

const fill = (entry: (typeof TEMPLATE_MANIFEST)[number]) => ({
  ...entry.previewData,
  ...(entry.previewRows ? { data_json: serializeDataJson(entry.previewRows) } : {}),
});
```

…and use `renderHtmlTemplate(entry.slug, fill(entry))` in both existing loop tests. Add one new test in the loop:

```ts
    it(`${entry.slug} — DATA parses back out of the emitted HTML`, async () => {
      if (!entry.previewRows) return; // scalar archetypes carry no DATA slot
      const html = await renderHtmlTemplate(entry.slug, fill(entry));
      const m = html.match(/const DATA = (.*);/);
      expect(m).not.toBeNull();
      expect(JSON.parse(m![1])).toEqual(entry.previewRows);
    });
```

Also update the existing `corridor-positioning tokenizes JS-driven SVG fills` test — `EVOLUTION_COLOR` is gone; assert the brand pair appears in `CAT_COLORS` instead:

```ts
    expect(html).toMatch(/CAT_COLORS = \["#5BC97A", "#FF0000", "#D4B370", "#00FF00"\]/);
```

- [ ] **Step 5: Run tests**

Run: `bun test lib/templates/`
Expected: PASS — corridor card renders with no residual `{{ }}`, DATA round-trips, brand override wins. (Other 4 cards still pass because their shells are untouched and their previewData is unchanged until their tasks.)

- [ ] **Step 6: Visual check + commit**

Run: `bunx next build` (route compiles), then visually: `bun --eval "const {renderHtmlTemplate}=await import('./lib/templates/render-html-template.ts'); ..."` is NOT needed — instead run the dev server or trust the smoke test; the live-verify covers pixels.

```bash
git add templates/html/viz/corridor-positioning.html lib/templates/manifest.ts lib/templates/render-html-template.test.ts
git commit -m "feat(templates): corridor-positioning generalizes to quadrant scatter — data_json rows, computed axes, semantic colors, read block" -- templates/html/viz/corridor-positioning.html lib/templates/manifest.ts lib/templates/render-html-template.test.ts
```

---

### Task 4: Shell — seasonal-exposure → generic banded bars

**Files:**
- Modify: `templates/html/viz/seasonal-exposure.html`
- 🔴 Modify: `lib/templates/manifest.ts` (this entry)

**Interfaces:**
- Consumes: `BandedBarsRow[]` via `{{data_json}}`; `bandedBarsTokensSchema` tokens.
- Produces: bars sorted ascending by value; band geometry from `band_1_max`/`band_2_max`/`scale_max`; the 4-cell rail computed in-shell (total + per-band counts/lists); read block + source/as-of footer.

- [ ] **Step 1: Tokenize the markup.** Replace eyebrow/h1/sub with `{{eyebrow}}`/`{{title}}`/`{{subtitle}}`. Rail cells become (the three band cells derive labels from band tokens; values/lists are filled by JS ids):

```html
  <div class="v-rail">
    <div class="v-rail-cell">
      <span class="v-rail-l">{{rail_total_label}}</span>
      <span class="v-rail-v" id="rail-total"></span>
      <span class="v-rail-s">{{rail_total_sub}}</span>
    </div>
    <div class="v-rail-cell">
      <span class="v-rail-l" id="rail-b1-l"></span>
      <span class="v-rail-v" style="color:var(--mangrove);" id="rail-b1-v"></span>
      <span class="v-rail-s" id="rail-b1-s"></span>
    </div>
    <div class="v-rail-cell">
      <span class="v-rail-l" id="rail-b2-l"></span>
      <span class="v-rail-v" style="color:var(--neutral-gold);" id="rail-b2-v"></span>
      <span class="v-rail-s" id="rail-b2-s"></span>
    </div>
    <div class="v-rail-cell">
      <span class="v-rail-l" id="rail-b3-l"></span>
      <span class="v-rail-v" style="color:var(--sunset-coral);" id="rail-b3-v"></span>
      <span class="v-rail-s" id="rail-b3-s"></span>
    </div>
  </div>
```

Frame head → `{{frame_title}}` / `{{frame_sub}}`. The band header divs get ids (`band-1`,`band-2`,`band-3`) and empty text (JS sets label + geometry). The `.v-ticks` five spans get ids `tick-0`…`tick-4` with empty text. Footer → read block (same HTML/CSS as Task 3) + `{{source_line}}` / `As of {{as_of}}`. Detail empty text → `{{detail_empty}}`.

- [ ] **Step 2: Replace the whole script** (CORRIDORS/EVOLUTION_COLOR/colorForIdx deleted):

```html
<script type="module">
const DATA = {{data_json}};
const CARD_READ = `{{card_read}}`;
const B1_MAX = {{band_1_max}}, B2_MAX = {{band_2_max}}, SCALE_MAX = {{scale_max}};
const FORMAT = "{{value_format}}";

const fmt = v =>
  FORMAT === "percent" ? `${v.toFixed(2)}%`
  : FORMAT === "currency" ? `$${Math.round(v).toLocaleString("en-US")}`
  : Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(2);

const BAND_COLORS = ["#5BC97A", "#D4B370", "{{brand_secondary}}"];
const bandOf = v => (v <= B1_MAX ? 0 : v <= B2_MAX ? 1 : 2);
const colorFor = v => BAND_COLORS[bandOf(v)];
const pct = v => Math.min(100, (v / SCALE_MAX) * 100);

// Band header + backing-band geometry from the cut-point tokens.
const b1w = pct(B1_MAX), b2w = pct(B2_MAX) - b1w, b3w = 100 - pct(B2_MAX);
const bandLabels = [`{{band_1_label}}`, `{{band_2_label}}`, `{{band_3_label}}`];
const bandEls = [document.getElementById("band-1"), document.getElementById("band-2"), document.getElementById("band-3")];
bandEls[0].style.left = "0%";            bandEls[0].style.width = `${b1w}%`;  bandEls[0].textContent = bandLabels[0];
bandEls[1].style.left = `${b1w}%`;       bandEls[1].style.width = `${b2w}%`;  bandEls[1].textContent = bandLabels[1];
bandEls[2].style.left = `${b1w + b2w}%`; bandEls[2].style.width = `${b3w}%`;  bandEls[2].textContent = bandLabels[2];
document.querySelectorAll(".v-bar-bands").forEach(() => {}); // per-row bands are built inline below

// Ticks: 5 stops across the scale.
for (let i = 0; i < 5; i++) {
  const v = (SCALE_MAX / 4) * i;
  const el = document.getElementById(`tick-${i}`);
  el.style.left = `${i * 25}%`;
  el.textContent = fmt(v);
}

// Rail: total + per-band counts and label lists (computed, never tokens).
const byBand = [0, 1, 2].map(b => DATA.filter(d => bandOf(d.value) === b));
document.getElementById("rail-total").textContent = DATA.length;
[["b1", 0], ["b2", 1], ["b3", 2]].forEach(([key, b]) => {
  document.getElementById(`rail-${key}-l`).textContent = bandLabels[b];
  document.getElementById(`rail-${key}-v`).textContent = byBand[b].length;
  document.getElementById(`rail-${key}-s`).textContent = byBand[b].map(d => d.label).join(" · ") || "—";
});

const sorted = [...DATA].sort((a, b) => a.value - b.value);
const rowsEl = document.getElementById("rows");
rowsEl.innerHTML = sorted.map(d => {
  const color = colorFor(d.value);
  return `
    <div class="v-row" data-id="${d.id}">
      <div class="v-row-label">
        <div class="v-row-name">${d.label}</div>
        <span class="v-row-meta">${d.sublabel ?? ""}</span>
      </div>
      <div class="v-bar-wrap">
        <div class="v-bar-bands">
          <div class="b" style="width:${b1w}%;background:color-mix(in srgb, var(--mangrove) 10%, transparent);"></div>
          <div class="b" style="width:${b2w}%;background:color-mix(in srgb, var(--neutral-gold) 8%, transparent);"></div>
          <div class="b" style="width:${b3w}%;background:color-mix(in srgb, var(--sunset-coral) 10%, transparent);"></div>
        </div>
        <div class="v-bar-fill" data-target="${pct(d.value).toFixed(2)}" style="background:${color};color:${color};"></div>
      </div>
      <span class="v-row-val" style="color:${color};">${fmt(d.value)}</span>
    </div>
  `;
}).join("");

requestAnimationFrame(() => {
  rowsEl.querySelectorAll(".v-bar-fill").forEach((bar, i) => {
    setTimeout(() => { bar.style.width = bar.dataset.target + "%"; }, 200 + i * 80);
  });
});

const readEl = document.getElementById("read");
if (CARD_READ.trim()) {
  document.getElementById("read-text").textContent = CARD_READ;
  readEl.hidden = false;
}

const detail = document.getElementById("detail");
let selectedId = null;
rowsEl.querySelectorAll(".v-row").forEach(row => {
  row.addEventListener("click", () => {
    const id = row.dataset.id;
    if (id === selectedId) {
      selectedId = null;
      row.classList.remove("is-active");
      detail.innerHTML = `<div class="v-detail-empty">{{detail_empty}}</div>`;
      detail.style.borderColor = "var(--gulf-haze)";
      return;
    }
    selectedId = id;
    rowsEl.querySelectorAll(".v-row").forEach(r => r.classList.toggle("is-active", r.dataset.id === id));
    const d = DATA.find(x => x.id === id);
    const color = colorFor(d.value);
    detail.style.borderColor = color;
    detail.innerHTML = `
      <div class="v-detail-row">
        <div>
          <h4 class="v-detail-name" style="color:${color};">${d.label}</h4>
          <span class="v-detail-sub">${fmt(d.value)}</span>
        </div>
        ${d.note ? `<p class="v-detail-quote" style="color:${color};"><span style="color:var(--text-primary);">${d.note}</span></p>` : ""}
      </div>
    `;
  });
});
</script>
```

The static `.v-bands` divs in markup lose their hardcoded `left/width` styles and `is-year/is-season/is-winter` keep only their color classes (geometry now set by JS). Fix the three band divs to:

```html
    <div class="v-bands">
      <div class="v-band is-year"   id="band-1"></div>
      <div class="v-band is-season" id="band-2"></div>
      <div class="v-band is-winter" id="band-3"></div>
    </div>
```

- [ ] **Step 3: Manifest entry** — name `Banded bars`, subtitle `Ranked values against labeled bands`, tokenType `bandedBarsTokensSchema`, previewData carries the archetype tokens (`band_1_label: "YEAR-ROUND"`, `band_1_max: 0.30`, `band_2_label: "SEASONAL"`, `band_2_max: 0.60`, `band_3_label: "WINTER-DEPENDENT"`, `scale_max: 1`, `value_format: "number"`, `rail_total_label: "Corridors"`, `rail_total_sub: "with seasonal index"`, eyebrow/title/subtitle/frame copy from the current shell text, `detail_empty: "Click any corridor to read its seasonality →"`, `source_line: "Sourced from SWFL CRE corridor profiles · pack range 0.10 – 0.88"`, `as_of: "05/22/2026"`, `card_read: ""`), previewRows = the 7 ex-inline corridors as `{ id, label, sublabel: "<city> · <evolution>", value: <seasonalIdx>, note }`.

- [ ] **Step 4: Run tests**

Run: `bun test lib/templates/`
Expected: PASS incl. the DATA round-trip test for this slug.

- [ ] **Step 5: Commit**

```bash
git add templates/html/viz/seasonal-exposure.html lib/templates/manifest.ts
git commit -m "feat(templates): seasonal-exposure generalizes to banded bars — tokenized bands, computed rail, data_json rows" -- templates/html/viz/seasonal-exposure.html lib/templates/manifest.ts
```

---

### Task 5: Shell — storm-year-timeline → generic event timeline

**Files:**
- Modify: `templates/html/viz/storm-year-timeline.html`
- 🔴 Modify: `lib/templates/manifest.ts` (this entry)

**Interfaces:**
- Consumes: `EventTimelineRow[]` via `{{data_json}}`; `eventTimelineTokensSchema` tokens.
- Produces: peak = max(value); emphasis-or-peak row → brand secondary, others gold; count + cumulative rail cells computed in-shell.

- [ ] **Step 1: Tokenize the markup.** Eyebrow/h1/sub → tokens. Rail:

```html
  <div class="v-rail">
    <div class="v-rail-cell">
      <span class="v-rail-l">{{rail_1_label}}</span>
      <span class="v-rail-v" id="rail-count"></span>
      <span class="v-rail-s">{{rail_1_sub}}</span>
    </div>
    <div class="v-rail-cell">
      <span class="v-rail-l">{{rail_2_label}}</span>
      <span class="v-rail-v" id="rail-cumulative"></span>
      <span class="v-rail-s">{{rail_2_sub}}</span>
    </div>
    <div class="v-rail-cell">
      <span class="v-rail-l">{{baseline_label}}</span>
      <span class="v-rail-v">{{baseline_value}}</span>
      <span class="v-rail-s">{{baseline_sub}}</span>
    </div>
    <div class="v-rail-cell">
      <span class="v-rail-l">{{scope_label}}</span>
      <span class="v-rail-v">{{scope_value}}</span>
      <span class="v-rail-s">{{scope_sub}}</span>
    </div>
  </div>
```

Frame head → tokens. `.v-baseline` line → `{{baseline_note}}`. Footer → read block + `{{source_line}}` / `As of {{as_of}}` (read-block CSS from Task 3).

- [ ] **Step 2: Replace the script** (STORMS deleted):

```html
<script type="module">
const DATA = {{data_json}};
const CARD_READ = `{{card_read}}`;
const FORMAT = "{{value_format}}";

const fmtValue = v => {
  if (FORMAT === "currency") {
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return `$${Math.round(v).toLocaleString("en-US")}`;
  }
  if (FORMAT === "percent") return `${v}%`;
  return Math.round(v).toLocaleString("en-US");
};

const PEAK = Math.max(...DATA.map(d => d.value));
const colorFor = d => (d.emphasis || d.value === PEAK) ? "{{brand_secondary}}" : "#D4B370";

document.getElementById("rail-count").textContent = DATA.length;
document.getElementById("rail-cumulative").textContent = fmtValue(DATA.reduce((s, d) => s + d.value, 0));

const tl = document.getElementById("timeline");
tl.innerHTML = DATA.map((d, i) => {
  const widthPct = (d.value / PEAK) * 100;
  const color = colorFor(d);
  return `
    <div class="v-event" data-i="${i}">
      <span class="v-event-dot" style="background:${color};color:${color};"></span>
      <div class="v-event-head">
        <span class="v-event-year">${d.when}</span>
        <span class="v-event-name">${d.title}</span>
        ${d.badge ? `<span class="v-event-cat3">${d.badge}</span>` : ""}
      </div>
      <div class="v-event-bar-wrap">
        <div class="v-event-bar">
          <div class="v-event-fill" style="background:${color};color:${color};" data-target="${widthPct.toFixed(2)}"></div>
        </div>
        <span class="v-event-claims" style="color:${color};">${fmtValue(d.value)}</span>
      </div>
      ${d.note ? `<p class="v-event-note">${d.note}</p>` : ""}
    </div>
  `;
}).join("");

requestAnimationFrame(() => {
  tl.querySelectorAll(".v-event-fill").forEach((bar, i) => {
    setTimeout(() => { bar.style.width = bar.dataset.target + "%"; }, 200 + i * 100);
  });
});

const readEl = document.getElementById("read");
if (CARD_READ.trim()) {
  document.getElementById("read-text").textContent = CARD_READ;
  readEl.hidden = false;
}

tl.querySelectorAll(".v-event").forEach(ev => {
  ev.addEventListener("click", () => {
    tl.querySelectorAll(".v-event").forEach(x => x.classList.remove("is-active"));
    ev.classList.add("is-active");
  });
});
</script>
```

- [ ] **Step 3: Manifest entry** — name `Event timeline`, subtitle `Dated events sized against a baseline`, tokenType `eventTimelineTokensSchema`; previewData = current copy tokenized (`rail_1_label: "Storms in record"`, `rail_1_sub: "2004 – 2024"`, `rail_2_label: "Cumulative claims"`, `rail_2_sub: "B + C + ICO, paid"`, `baseline_label/value/sub`, `scope_label: "Counties covered"`, `scope_value: "6"`, `scope_sub: "Lee · Collier + 4 adjacent"`, `baseline_note`, `value_format: "currency"`, `source_line: "OpenFEMA NFIP Paid Claims · 6 SWFL counties · storm-list reviewed 05/17/2026"`, `as_of: "05/20/2026"`, `card_read: ""`); previewRows = the 6 ex-inline storms as `{ when: "2004", title: "Charley", badge: "Cat 4", value: 3200000, note: "…" }` with `emphasis: true` on Ian. NOTE the subtitle's hardcoded "Ian alone cleared 137×" sentence lives entirely in the `subtitle` token now.

- [ ] **Step 4: Run + commit**

Run: `bun test lib/templates/` → PASS.

```bash
git add templates/html/viz/storm-year-timeline.html lib/templates/manifest.ts
git commit -m "feat(templates): storm-year-timeline generalizes to event timeline — data_json rows, computed rail, emphasis color" -- templates/html/viz/storm-year-timeline.html lib/templates/manifest.ts
```

---

### Task 6: Shell — freight-nowcast → generic baseline gauge (scalar)

**Files:**
- Modify: `templates/html/viz/freight-nowcast.html`
- 🔴 Modify: `lib/templates/manifest.ts` (this entry)

**Interfaces:**
- Consumes: `baselineGaugeTokensSchema` tokens (Task 2). No rows.
- Produces: a gauge shell where every label is a token; `z_value` still drives needle + readout.

- [ ] **Step 1: Tokenize every hardcoded label.** Replacements (markup only — gauge SVG geometry, needle JS, and bar-fill JS stay as-is):
  - Eyebrow/h1/sub → `{{eyebrow}}` / `{{title}}` / `{{subtitle}}`.
  - `Shock state` pill → `{{verdict_pill}}`.
  - The `v-state-detail` paragraph ("Current activity sits on baseline. No anomaly…") → `{{state_detail}}`.
  - The four `v-state-cell` label/value pairs → `{{grid_1_label}}`/`{{grid_1_value}}` … `{{grid_4_label}}`/`{{grid_4_value}}`. Remove the hardcoded `style="color:#5BC97A;"` on grid 2's value (a generic flag can't assume green; plain text-primary).
  - `DEVIATION FROM 90-DAY ROLLING MEAN` → `{{gauge_caption}}`.
  - Compare panel: title → `{{compare_title}}`; row 1 label/sub/value → `{{value_label}}`/`{{value_sub}}`/`{{value_display}}` with `<span class="delta">{{value_units}}</span>`; row 2 → `{{baseline_label}}`/`{{baseline_sub}}`/`{{baseline_display}}` + same units span; row 3 → `{{stddev_label}}`/`{{stddev_sub}}`/`{{stddev_display}}` + same units span.
  - Rail cells 1–4 → `{{rail_N_label}}`/`{{rail_N_value}}`/`{{rail_N_sub}}`.
  - Footer → read block + `{{source_line}}` / `As of {{as_of}}` (read-block CSS from Task 3). Append the read-block JS to the existing script:

```js
const CARD_READ = `{{card_read}}`;
const readEl = document.getElementById("read");
if (CARD_READ.trim()) {
  document.getElementById("read-text").textContent = CARD_READ;
  readEl.hidden = false;
}
```

- [ ] **Step 2: Manifest entry** — name `Baseline gauge`, subtitle `One value against its own rolling baseline`, tokenType `baselineGaugeTokensSchema`; previewData = the Task 2 test fixture values (the freight numbers, now labeled through the generic tokens; drop `freshness_token`, add `source_line: "FDOT freight-coded segments · 90-day rolling baseline (Path B)"`, `as_of: "05/20/2026"`, `card_read: ""`, eyebrow/title/subtitle from the current shell copy).

- [ ] **Step 3: Run + commit**

Run: `bun test lib/templates/` → PASS.

```bash
git add templates/html/viz/freight-nowcast.html lib/templates/manifest.ts
git commit -m "feat(templates): freight-nowcast generalizes to baseline gauge — every label a token, read block, as-of footer" -- templates/html/viz/freight-nowcast.html lib/templates/manifest.ts
```

---

### Task 7: Shell — flood-exposure → generic composition + focus (scalar)

**Files:**
- Modify: `templates/html/viz/flood-exposure.html`
- 🔴 Modify: `lib/templates/manifest.ts` (this entry)

**Interfaces:**
- Consumes: `compositionFocusTokensSchema` tokens. No rows.
- Produces: three-segment composition + big multiple + focus card + translation banner, all copy tokenized.

- [ ] **Step 1: Tokenize.** Replacements:
  - Eyebrow/h1/sub → tokens (`{{title}}` absorbs the current `{{vve_pct}}%…` headline — the recipe/composes the prose).
  - Section 1: label/title → `{{section_1_label}}`/`{{section_1_title}}`; the three stack segments keep width tokens but renamed `{{seg_1_pct}}`/`{{seg_2_pct}}`/`{{seg_3_pct}}`; the three legend cards → `{{seg_N_label}}` / `{{seg_N_pct}}%` / `{{seg_N_detail}}` (details collapse each card's two hardcoded lines into one token; drop the inner `<br/>` pair).
  - Section 2: label/title → `{{section_2_label}}`/`{{section_2_title}}`; big number → `{{multiple_value}}` (string — the recipe decides "357×" vs "3.4×"); caption → `{{multiple_caption}}`; row 1 → `{{row_1_label}}`/`data-target="{{row_1_target}}"`/`{{row_1_value}}`; row 2 same with `row_2_*`; row 3 → `{{row_3_label}}` / `{{row_3_left}}` / `{{row_3_value}}`.
  - Section 3: label/title → `{{section_3_label}}`/`{{section_3_title}}`; focus block → `{{focus_tag}}`/`{{focus_name}}`/`{{focus_place}}`; cells → `{{cell_N_label}}`/`{{cell_N_value}}`/`{{cell_N_sub}}` (subs collapse to one token each, drop `<br/>`).
  - Section 4: `{{trans_label}}` / `{{trans_text}}` (whole sentence is the token — no embedded sub-tokens).
  - Footer → read block + `{{source_line}}` / `As of {{as_of}}`; read-block JS appended to the existing script like Task 6.

- [ ] **Step 2: Manifest entry** — name `Composition + focus`, subtitle `Part-to-whole split, a headline multiple, one spotlight`, tokenType `compositionFocusTokensSchema`; previewData = today's flood values mapped into the generic tokens verbatim (safe/sfha/vve → seg_1/2/3; storm multiple rows → row_1/2/3; zip focus → focus_*/cell_*; `source_line: "FEMA NFHL Flood Hazard Zones · OpenFEMA NFIP claims · 6 SWFL counties"`, `as_of: "05/20/2026"`, `card_read: ""`).

- [ ] **Step 3: Run + commit**

Run: `bun test lib/templates/` → PASS (all 5 shells now render clean through the new manifest).

```bash
git add templates/html/viz/flood-exposure.html lib/templates/manifest.ts
git commit -m "feat(templates): flood-exposure generalizes to composition+focus — segment/focus/translation copy fully tokenized" -- templates/html/viz/flood-exposure.html lib/templates/manifest.ts
```

---

### Task 8: Render route — zod-gated POST, previewRows GET

**Files:**
- 🟡 Modify: `app/api/templates/render/route.ts`

**Interfaces:**
- Consumes: `getContract` (Task 2), `serializeDataJson` (Task 1), manifest `previewRows` (Tasks 3–7).
- Produces: `POST { slug, tokens, rows? }` → 400 with zod detail on contract violation, else HTML. `GET ?slug=` renders previewData+previewRows. (The `?recipe=` branch lands in Task 13.)

- [ ] **Step 1: Extend GET.** Replace the render call in GET with:

```ts
    const tokens: Record<string, string | number> = { ...entry.previewData };
    if (entry.previewRows) tokens.data_json = serializeDataJson(entry.previewRows);
    const html = await renderHtmlTemplate(slug, tokens);
```

- [ ] **Step 2: Rework POST.** After the manifest lookup, validate:

```ts
  const contract = getContract(body.slug);
  if (!contract) {
    return Response.json({ error: `no contract for slug: ${body.slug}` }, { status: 400 });
  }

  const tokensParsed = contract.tokensSchema.safeParse(body.tokens ?? {});
  if (!tokensParsed.success) {
    return Response.json(
      { error: "invalid tokens", detail: tokensParsed.error.flatten() },
      { status: 400 },
    );
  }

  let dataJson: string | undefined;
  if (contract.rowsSchema) {
    const rowsParsed = contract.rowsSchema.safeParse((body as { rows?: unknown }).rows);
    if (!rowsParsed.success) {
      return Response.json(
        { error: "invalid rows", detail: rowsParsed.error.flatten() },
        { status: 400 },
      );
    }
    dataJson = serializeDataJson(rowsParsed.data);
  }

  const tokens: Record<string, string | number> = {
    ...(tokensParsed.data as Record<string, string | number>),
    ...(dataJson !== undefined ? { data_json: dataJson } : {}),
  };
```

…then the existing `renderHtmlTemplate(body.slug, tokens)` path. Imports: `getContract` from `@/lib/templates/token-contracts`, `serializeDataJson` from `@/lib/templates/serialize-data-json`. Update the POST doc comment: body is `{ slug, tokens, rows? }`, callers hand ROWS — never a pre-serialized string; `data_json` arriving inside `tokens` is rejected by `.strict()`.

- [ ] **Step 3: Verify**

Run: `bunx next build`
Expected: compiles clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/templates/render/route.ts
git commit -m "feat(templates): render POST zod-gates tokens+rows and serializes data_json server-side" -- app/api/templates/render/route.ts
```

---

### Task 9: `template_builds` migration

**Files:**
- Create: `docs/sql/20260712_template_builds.sql`

**Interfaces:**
- Produces: `public.template_builds` — read by Task 12's store writes and Task 13's GET.

- [ ] **Step 1: Write the migration** (idempotent — RULE 1):

```sql
-- docs/sql/20260712_template_builds.sql
-- Stored viz-archetype recipe builds (spec 2026-07-12-viz-archetypes-design.md).
-- One row per recipe id — the runner upserts; the public render route reads the
-- latest build and serves it with zero model calls / zero lake queries.
-- Apply: bun scripts/run-migration.ts docs/sql/20260712_template_builds.sql

CREATE TABLE IF NOT EXISTS public.template_builds (
  recipe_id text PRIMARY KEY,
  slug      text NOT NULL,
  tokens    jsonb NOT NULL,
  rows      jsonb,                -- null for scalar archetypes
  as_of     text NOT NULL,        -- MM/DD/YYYY (display form; the only date on the card)
  built_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.template_builds ENABLE ROW LEVEL SECURITY;
-- No policies: service_role bypasses RLS; anon/authenticated get nothing.

GRANT SELECT, INSERT, UPDATE ON public.template_builds TO service_role;
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply + verify**

Run: `bun scripts/run-migration.ts docs/sql/20260712_template_builds.sql`
Expected: applies clean. Verify: re-run the same command (idempotency proof — second run also clean), then confirm 0 rows:
`bun -e "..."` is unnecessary — Task 12's dry-run covers the read path; the migration output itself confirms creation.

- [ ] **Step 3: Regenerate DB types** so the typed client sees the table:

Run: the repo's types-regen command (check `package.json` scripts for `types:*` / `gen:types`; if none exists, add a `// KNOWN-DEBT(data_lake: …)` untyped access in Task 12 instead — do NOT invent a regen pipeline for this task).

- [ ] **Step 4: Commit**

```bash
git add docs/sql/20260712_template_builds.sql
git commit -m "feat(templates): template_builds table — stored recipe builds, service-role only" -- docs/sql/20260712_template_builds.sql
```

---

### Task 10: Recipe registry — manifest, loaders, mappers

**Files:**
- Create: `lib/templates/recipe-manifest.ts`
- Create: `lib/templates/recipes.server.ts`
- Test: `lib/templates/recipes.server.test.ts`

**Interfaces:**
- Consumes: contracts (Task 2); `createServiceRoleClientUntyped` from `@/utils/supabase/service-role`.
- Produces:
  - `RECIPE_MANIFEST: RecipeMeta[]` where `RecipeMeta = { id: string; slug: string; label: string; scope: string }` (client-safe, imported by ShowcaseGrid in Task 15).
  - `RECIPES: RecipeDef[]` where:

```ts
export interface RecipeDef {
  meta: RecipeMeta;
  sourceLine: string;
  commentaryInstructions: string;
  /** Fetch raw rows from the held source. Empty array → build skipped. */
  load(sb: SupabaseClient): Promise<unknown[]>;
  /** Pure. Raw rows → validated contract payload. Throws on unusable data. */
  map(raw: unknown[]): { tokens: Record<string, string | number>; rows: unknown[] | null; asOf: string };
}
```

  - `mmddyyyy(d: Date | string): string` — the one as-of formatter.

- [ ] **Step 1: Write the mapper tests first** (fixtures = hand-built raw rows shaped like the verified tables):

```ts
// lib/templates/recipes.server.test.ts
import { describe, it, expect } from "bun:test";
import { RECIPES, mmddyyyy } from "./recipes.server";
import { getContract } from "./token-contracts";

const byId = (id: string) => RECIPES.find((r) => r.meta.id === id)!;

describe("mmddyyyy", () => {
  it("formats ISO dates", () => {
    expect(mmddyyyy("2026-07-12")).toBe("07/12/2026");
    expect(mmddyyyy("2026-07-12T14:00:00Z")).toBe("07/12/2026");
  });
});

describe("corridor-cap-vac mapper", () => {
  const raw = [
    { corridor_name: "Alico Rd Industrial Flex", city: "Fort Myers", corridor_type: "industrial flex",
      evolution_direction: "growing", seasonal_index: 0.1, cap_rate_pct: 6.0, vacancy_rate_pct: 3.0,
      absorption_sqft: 185000, asking_rent_psf: 16.5, character: "Zero seasonality.", metrics_verified_date: "2026-05-22" },
    { corridor_name: "Estero Blvd", city: "Fort Myers Beach", corridor_type: "beachfront tourism",
      evolution_direction: "repositioning", seasonal_index: 0.88, cap_rate_pct: 8.5, vacancy_rate_pct: 18.0,
      absorption_sqft: -5000, asking_rent_psf: 45.0, character: null, metrics_verified_date: "2026-05-22" },
    { corridor_name: "No Metrics Rd", city: "Naples", corridor_type: "strip",
      evolution_direction: "stable", seasonal_index: null, cap_rate_pct: null, vacancy_rate_pct: null,
      absorption_sqft: null, asking_rent_psf: null, character: null, metrics_verified_date: "2026-05-22" },
  ];
  it("maps to a valid quadrant-scatter payload, dropping rows without both axes", () => {
    const out = byId("corridor-cap-vac").map(raw);
    const contract = getContract("viz/corridor-positioning")!;
    expect(contract.tokensSchema.safeParse(out.tokens).success).toBe(true);
    expect(contract.rowsSchema!.safeParse(out.rows).success).toBe(true);
    expect((out.rows as unknown[]).length).toBe(2); // No Metrics Rd dropped
    expect(out.asOf).toBe("05/22/2026");
  });
  it("median tokens are computed from the kept rows (deterministic math in code)", () => {
    const out = byId("corridor-cap-vac").map(raw);
    expect(out.tokens.median_x).toBe(7.25); // median of [6.0, 8.5]
    expect(out.tokens.median_y).toBe(10.5); // median of [3.0, 18.0]
  });
  it("throws on fully unusable data (never a hollow build)", () => {
    expect(() => byId("corridor-cap-vac").map([raw[2]])).toThrow();
  });
});

describe("nfip-storm-years mapper", () => {
  const raw = [
    { county_code: "12071", year: 2022, claim_count: 900, paid_total_usd: 5_000_000 },
    { county_code: "12021", year: 2022, claim_count: 400, paid_total_usd: 3_200_000 },
    { county_code: "12071", year: 2004, claim_count: 300, paid_total_usd: 3_200_000 },
    { county_code: "12071", year: 2019, claim_count: 5, paid_total_usd: 40_000 }, // non-storm year → excluded
  ];
  it("sums claims per storm year and marks the peak", () => {
    const out = byId("nfip-storm-years").map(raw);
    const rows = out.rows as { when: string; title: string; value: number; emphasis?: boolean }[];
    expect(rows.find((r) => r.when === "2022")!.value).toBe(8_200_000);
    expect(rows.find((r) => r.when === "2022")!.emphasis).toBe(true);
    expect(rows.some((r) => r.when === "2019")).toBe(false);
    expect(getContract("viz/storm-year-timeline")!.rowsSchema!.safeParse(rows).success).toBe(true);
  });
});

describe("asking-price-nowcast mapper", () => {
  const series = Array.from({ length: 30 }, (_, i) => ({
    metric_key: "median_asking_price", area: "cape_coral",
    period: `2026-06-${String(i + 1).padStart(2, "0")}`, value: 400000 + i * 100, source_title: "SWFL Data Gulf",
  }));
  it("computes z from the trailing window and validates the gauge contract", () => {
    const out = byId("asking-price-nowcast").map(series);
    expect(getContract("viz/freight-nowcast")!.tokensSchema.safeParse(out.tokens).success).toBe(true);
    expect(out.rows).toBeNull();
    expect(typeof out.tokens.z_value).toBe("number");
  });
  it("throws when the window is too thin (< 14 prior points)", () => {
    expect(() => byId("asking-price-nowcast").map(series.slice(0, 5))).toThrow();
  });
});

describe("market-activity-mix mapper", () => {
  const raw = [
    { county: "Lee", zip_code: null, price_cuts_90d: 30, sales_90d: 50, new_listings_90d: 120, latest_at: "2026-07-11T00:00:00Z" },
    { county: "Lee", zip_code: "33914", price_cuts_90d: 10, sales_90d: 20, new_listings_90d: 40, latest_at: "2026-07-11T00:00:00Z" },
    { county: "Lee", zip_code: "33904", price_cuts_90d: 5, sales_90d: 8, new_listings_90d: 15, latest_at: "2026-07-11T00:00:00Z" },
  ];
  it("segments sum to 100 (±0.1) and the focus is the busiest ZIP", () => {
    const out = byId("market-activity-mix").map(raw);
    const t = out.tokens as Record<string, number | string>;
    const sum = (t.seg_1_pct as number) + (t.seg_2_pct as number) + (t.seg_3_pct as number);
    expect(Math.abs(sum - 100)).toBeLessThan(0.11);
    expect(t.focus_name).toBe("33914");
    expect(getContract("viz/flood-exposure")!.tokensSchema.safeParse(out.tokens).success).toBe(true);
  });
});

describe("zip-market-activity + corridor-seasonal validate their contracts", () => {
  it("zip scatter", () => {
    const raw = [
      { county: "Lee", zip_code: "33914", price_cuts_90d: 10, sales_90d: 20, new_listings_90d: 40, latest_at: "2026-07-11T00:00:00Z" },
      { county: "Lee", zip_code: "33904", price_cuts_90d: 5, sales_90d: 8, new_listings_90d: 15, latest_at: "2026-07-11T00:00:00Z" },
    ];
    const out = byId("zip-market-activity").map(raw);
    expect(getContract("viz/corridor-positioning")!.rowsSchema!.safeParse(out.rows).success).toBe(true);
  });
  it("seasonal bars", () => {
    const raw = [
      { corridor_name: "Alico Rd Industrial Flex", city: "Fort Myers", evolution_direction: "growing",
        seasonal_index: 0.1, character: "Zero seasonality.", metrics_verified_date: "2026-05-22" },
    ];
    const out = byId("corridor-seasonal").map(raw);
    expect(getContract("viz/seasonal-exposure")!.rowsSchema!.safeParse(out.rows).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test lib/templates/recipes.server.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement.** `recipe-manifest.ts` is trivial metadata:

```ts
// lib/templates/recipe-manifest.ts
/** Client-safe recipe metadata — ShowcaseGrid imports THIS, never the loaders. */
export interface RecipeMeta {
  id: string;
  slug: string;
  label: string;
  scope: string;
}

export const RECIPE_MANIFEST: RecipeMeta[] = [
  { id: "corridor-cap-vac", slug: "viz/corridor-positioning", label: "CRE corridors · cap × vacancy", scope: "Lee + Collier corridors" },
  { id: "zip-market-activity", slug: "viz/corridor-positioning", label: "ZIPs · listings × sales (90d)", scope: "busiest county, by ZIP" },
  { id: "corridor-seasonal", slug: "viz/seasonal-exposure", label: "CRE corridors · seasonal index", scope: "Lee + Collier corridors" },
  { id: "nfip-storm-years", slug: "viz/storm-year-timeline", label: "NFIP paid claims · named-storm years", scope: "SWFL counties" },
  { id: "asking-price-nowcast", slug: "viz/freight-nowcast", label: "Cape Coral asking price vs 90-day baseline", scope: "daily median asking" },
  { id: "market-activity-mix", slug: "viz/flood-exposure", label: "Listing activity mix · 90 days", scope: "busiest county + ZIP focus" },
];
```

`recipes.server.ts` implements the six `RecipeDef`s. Skeleton with the two most intricate mappers in full (the others follow the identical shape — fetch → filter → compute → tokens; write them out completely in the file, no stubs):

```ts
// lib/templates/recipes.server.ts
// KNOWN-DEBT(data_lake: recipe loaders read data_lake views (typed public only))
import type { SupabaseClient } from "@supabase/supabase-js";
import { RECIPE_MANIFEST, type RecipeMeta } from "./recipe-manifest";
import { getContract } from "./token-contracts";

export interface RecipeDef {
  meta: RecipeMeta;
  sourceLine: string;
  commentaryInstructions: string;
  load(sb: SupabaseClient): Promise<unknown[]>;
  map(raw: unknown[]): { tokens: Record<string, string | number>; rows: unknown[] | null; asOf: string };
}

export function mmddyyyy(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d) : d;
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getUTCFullYear()}`;
}

function medianOf(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const meta = (id: string): RecipeMeta => RECIPE_MANIFEST.find((m) => m.id === id)!;

// Named-storm labels — static facts riding the OpenFEMA source line (the same
// storm-list provenance the shell carried; reviewed 05/17/2026). The claims
// FIGURES always come from the view — these are labels only. 2024 merges
// Helene + Milton: the county-year grain cannot split same-year storms (GRAIN
// rule — answer at the grain held, never invent a split).
const STORM_YEARS: Record<number, { title: string; badge: string; note: string }> = {
  2004: { title: "Charley", badge: "Cat 4", note: "First major SWFL landfall in decades — peaked on the Lee coast." },
  2005: { title: "Wilma", badge: "Cat 3", note: "Crossed the peninsula east-to-west; SWFL caught the trailing surge and rain bands." },
  2017: { title: "Irma", badge: "Cat 4", note: "Marco Island landfall. Widespread inland flood damage across Collier." },
  2022: { title: "Ian", badge: "Cat 5", note: "Fort Myers Beach landfall. Single largest claim footprint in SWFL NFIP history." },
  2024: { title: "Helene + Milton", badge: "2 storms", note: "Back-to-back 2024 landfalls; compounding-loss claims slowed the payout cycle." },
};

interface CorridorRaw {
  corridor_name: string; city: string | null; corridor_type: string | null;
  evolution_direction: string | null; seasonal_index: number | null;
  cap_rate_pct: number | null; vacancy_rate_pct: number | null;
  absorption_sqft: number | null; asking_rent_psf: number | null;
  character: string | null; metrics_verified_date: string | null;
}

const loadCorridors = async (sb: SupabaseClient) => {
  const { data, error } = await sb
    .from("corridor_profiles")
    .select(
      "corridor_name, city, corridor_type, evolution_direction, seasonal_index, cap_rate_pct, vacancy_rate_pct, absorption_sqft, asking_rent_psf, character, metrics_verified_date",
    )
    .is("deleted_at", null)
    .eq("verification_status", "verified");
  if (error) throw new Error(`corridor_profiles: ${error.message}`);
  return data ?? [];
};

const fmtAbs = (v: number) =>
  Math.abs(v) >= 1000 ? `${v >= 0 ? "+" : "-"}${Math.round(Math.abs(v) / 1000)}K sqft` : `${v} sqft`;

const corridorCapVac: RecipeDef = {
  meta: meta("corridor-cap-vac"),
  sourceLine: "Sourced from SWFL CRE corridor profiles · Lee + Collier counties",
  commentaryInstructions:
    "You are reading a cap-rate × vacancy scatter of SWFL CRE corridors. Card read: 2-3 sentences on where the pack sits and which corridor stands out, citing only figures present in the data. Per-item notes: one sentence per corridor on its position vs the medians.",
  load: loadCorridors,
  map(raw) {
    const rows = (raw as CorridorRaw[])
      .filter((c) => c.cap_rate_pct != null && c.vacancy_rate_pct != null)
      // Order categories growing → stable → repositioning → declining so the
      // palette slots land exactly where the original card put them
      // (mangrove, brand primary, gold, brand secondary).
      .sort((a, b) => {
        const order = ["growing", "stable", "repositioning", "declining"];
        return order.indexOf(a.evolution_direction ?? "stable") - order.indexOf(b.evolution_direction ?? "stable");
      })
      .map((c) => ({
        id: c.corridor_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label: c.corridor_name,
        sublabel: [c.city, c.corridor_type].filter(Boolean).join(" · "),
        x: c.cap_rate_pct as number,
        y: c.vacancy_rate_pct as number,
        size: c.absorption_sqft ?? 0,
        category: c.evolution_direction ?? "stable",
        labeled: false,
        ...(c.character ? { note: c.character } : {}),
        metrics: [
          { label: "Cap rate", value: `${(c.cap_rate_pct as number).toFixed(1)}%` },
          { label: "Vacancy", value: `${(c.vacancy_rate_pct as number).toFixed(1)}%` },
          ...(c.absorption_sqft != null ? [{ label: "Absorption", value: fmtAbs(c.absorption_sqft) }] : []),
          ...(c.asking_rent_psf != null ? [{ label: "Rent PSF", value: `$${c.asking_rent_psf.toFixed(2)}` }] : []),
        ],
      }));
    if (rows.length < 2) throw new Error("corridor-cap-vac: fewer than 2 corridors with both axes");
    // Label the extremes so the card reads without clicking.
    const byX = [...rows].sort((a, b) => a.x - b.x);
    byX[0].labeled = true;
    byX[byX.length - 1].labeled = true;
    const medianX = medianOf(rows.map((r) => r.x));
    const medianY = medianOf(rows.map((r) => r.y));
    const asOfSrc = (raw as CorridorRaw[]).map((c) => c.metrics_verified_date).filter(Boolean).sort().at(-1);
    const asOf = mmddyyyy(asOfSrc ?? new Date());
    const tokens = {
      eyebrow: `SWFL CRE · ${rows.length} corridors`,
      title: "Where does each corridor sit on cap rate × vacancy?",
      subtitle: `Bubble size scales with absorption magnitude. Color marks corridor evolution. Pack medians fall at ${medianX.toFixed(1)}% cap / ${medianY.toFixed(1)}% vacancy — the dashed crosshair. Click any bubble for the full profile.`,
      frame_title: "Cap rate × vacancy positioning",
      frame_sub: "Tightening pricing → · Tightening space ↑",
      x_label: "CAP RATE", y_label: "VACANCY",
      x_format: "percent" as const, y_format: "percent" as const,
      median_x: medianX, median_y: medianY,
      median_label: `PACK MEDIAN · ${medianX.toFixed(1)}% / ${medianY.toFixed(1)}%`,
      quad_label_low: "LANDLORD MARKET", quad_label_high: "DISTRESSED",
      size_caption: "Bubble size · |net absorption|",
      detail_empty: "Click any corridor to inspect →",
      card_read: "",
      source_line: this.sourceLine,
      as_of: asOf,
      brand_primary: "#3DC9C0", brand_secondary: "#E08158",
    };
    return { tokens, rows, asOf };
  },
};

interface ZipStatsRaw {
  county: string | null; zip_code: string | null;
  price_cuts_90d: number; sales_90d: number; new_listings_90d: number; latest_at: string | null;
}

const loadZipStats = async (sb: SupabaseClient) => {
  const { data, error } = await sb
    .schema("data_lake")
    .from("listing_transitions_recent_zip_stats")
    .select("county, zip_code, price_cuts_90d, sales_90d, new_listings_90d, latest_at");
  if (error) throw new Error(`listing_transitions_recent_zip_stats: ${error.message}`);
  return data ?? [];
};

// …zipMarketActivity, corridorSeasonal, nfipStormYears, askingPriceNowcast,
// marketActivityMix follow the SAME shape: filter → deterministic math →
// tokens matching their contract → { tokens, rows, asOf }. Implement each per
// the fixtures in recipes.server.test.ts (the tests are the spec for the
// arithmetic: zip scatter = top-12 ZIPs of the busiest county by
// new_listings_90d (x) × sales_90d (y), size = price_cuts_90d + 1, top-3 by
// activity labeled; seasonal bars = corridors with a non-null seasonal_index,
// bands 0.30 / 0.60 / scale 1; storm timeline = paid_total_usd summed per
// STORM_YEARS year, peak → emphasis, baseline cell = "see source" text tokens
// from the median non-storm year in the same view rows; gauge = latest
// median_asking_price value vs the trailing ≤90 prior points (mean, stddev,
// z = (current − mean) / stddev, throws if fewer than 14 prior points or
// stddev is 0 → skip build); composition = the county rollup with the highest
// event total, segments = new listings / price cuts / sales shares of their
// sum ×100 rounded to 0.1, focus = that county's ZIP row with max sales_90d).

export const RECIPES: RecipeDef[] = [
  corridorCapVac,
  zipMarketActivity,
  corridorSeasonal,
  nfipStormYears,
  askingPriceNowcast,
  marketActivityMix,
];

export function getRecipe(id: string): RecipeDef | undefined {
  return RECIPES.find((r) => r.meta.id === id);
}
```

(The comment block above is a WRITING AID for this plan document only — the actual file contains all six mappers fully implemented; the test fixtures in Step 1 pin each one's arithmetic. No mapper may call `Date.now()` for as-of when the source rows carry a date — as_of comes from the data (`metrics_verified_date`, `latest_at`, `period`, max `year`), falling back to `new Date()` only for `corridor-cap-vac` when every `metrics_verified_date` is null.)

- [ ] **Step 4: Run tests**

Run: `bun test lib/templates/recipes.server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/templates/recipe-manifest.ts lib/templates/recipes.server.ts lib/templates/recipes.server.test.ts
git commit -m "feat(templates): recipe registry — six held-data recipes with deterministic mappers" -- lib/templates/recipe-manifest.ts lib/templates/recipes.server.ts lib/templates/recipes.server.test.ts
```

---

### Task 11: Commentary — digit guard + Sonnet writer

**Files:**
- Create: `lib/templates/commentary.ts`
- Test: `lib/templates/commentary.test.ts`
- Modify: `refinery/agents/anthropic.mts` (CallType union only)

**Interfaces:**
- Consumes: `getAnthropic`, `SYNTHESIS_MODEL`, `agentsAreMocked` from `@/refinery/agents/anthropic.mts`.
- Produces (used by Task 12):
  - `collectAnchors(payload: unknown): Set<string>` — every numeric substring in the payload, normalized (commas stripped).
  - `commentaryDigitsOk(text: string, anchors: Set<string>): boolean` — every digit-bearing figure in `text` exists in `anchors`.
  - `writeCommentary(recipe: { commentaryInstructions: string }, tokens: Record<string, string | number>, rows: unknown[] | null): Promise<{ cardRead: string; notes: Map<string, string> } | null>` — one Sonnet call, forced tool use; returns `null` on refusal/digit-guard violation/mock mode (data ships without commentary — never blocks the build).

- [ ] **Step 1: Add the CallType.** In `refinery/agents/anthropic.mts`, extend the union (after `"narrative_bake"`):

```ts
  // Viz-archetype recipe builds (scripts/templates/build-recipes.mts) — one
  // Sonnet commentary call per recipe build (spec 2026-07-12-viz-archetypes-design.md).
  | "template_build"
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/templates/commentary.test.ts
import { describe, it, expect } from "bun:test";
import { collectAnchors, commentaryDigitsOk } from "./commentary";

describe("collectAnchors", () => {
  it("collects numbers from nested tokens and rows, comma-normalized", () => {
    const anchors = collectAnchors({
      tokens: { median_x: 6.5, value_display: "242,430,080", title: "Where at 6.5%?" },
      rows: [{ x: 8.5, metrics: [{ value: "$16.50" }] }],
    });
    expect(anchors.has("6.5")).toBe(true);
    expect(anchors.has("242430080")).toBe(true);
    expect(anchors.has("8.5")).toBe(true);
    expect(anchors.has("16.50")).toBe(true);
  });
});

describe("commentaryDigitsOk", () => {
  const anchors = collectAnchors({ rows: [{ x: 8.5, y: 18.0, size: 185000 }] });
  it("passes commentary citing only payload figures", () => {
    expect(commentaryDigitsOk("Estero sits at 8.5% cap and 18.0% vacancy.", anchors)).toBe(true);
  });
  it("fails a minted number", () => {
    expect(commentaryDigitsOk("Cap rates will hit 9.9% next year.", anchors)).toBe(false);
  });
  it("passes digit-free prose", () => {
    expect(commentaryDigitsOk("The pack clusters tight; one outlier drifts.", anchors)).toBe(true);
  });
  it("accepts formatting variants of an anchored figure (185,000 vs 185000, 185K)", () => {
    expect(commentaryDigitsOk("Absorption of 185,000 sqft leads.", anchors)).toBe(true);
    expect(commentaryDigitsOk("Roughly 185K sqft.", anchors)).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `bun test lib/templates/commentary.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement**

```ts
// lib/templates/commentary.ts
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, SYNTHESIS_MODEL, agentsAreMocked } from "@/refinery/agents/anthropic.mts";

/**
 * Build-time commentary for recipe builds. One Sonnet call per build; the
 * public render path NEVER calls a model. The digit guard is structural
 * (gateNarrative-style): every digit-bearing figure in the commentary must
 * already exist in the token/row payload — a minted number drops the whole
 * commentary while the data build ships (rule 1: invented numbers are the
 * only hard block, and commentary is optional by design).
 */

const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;
const norm = (s: string) => s.replace(/,/g, "");

export function collectAnchors(payload: unknown): Set<string> {
  const anchors = new Set<string>();
  const visit = (v: unknown): void => {
    if (typeof v === "number" && Number.isFinite(v)) {
      anchors.add(norm(String(v)));
      if (Number.isInteger(v)) anchors.add(String(v / 1000)); // K-scaled variant
    } else if (typeof v === "string") {
      for (const m of v.match(NUM_RE) ?? []) anchors.add(norm(m));
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(payload);
  return anchors;
}

export function commentaryDigitsOk(text: string, anchors: Set<string>): boolean {
  for (const m of text.match(NUM_RE) ?? []) {
    const n = norm(m);
    // Accept exact match or trailing-zero variants (18 vs 18.0 vs 18.00).
    const asNum = Number(n);
    const variants = [n, String(asNum), asNum.toFixed(1), asNum.toFixed(2)];
    if (!variants.some((v) => anchors.has(v))) return false;
  }
  return true;
}

const COMMENTARY_TOOL = {
  name: "record_commentary",
  description: "Record the card-level read and optional per-item notes for a data card.",
  input_schema: {
    type: "object" as const,
    properties: {
      card_read: { type: "string", description: "2-3 sentences reading the card as a whole. Cite ONLY figures present in the payload." },
      notes: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, note: { type: "string" } },
          required: ["id", "note"],
        },
        description: "One short note per item id, for items worth a caption. Optional.",
      },
    },
    required: ["card_read"],
  },
};

export async function writeCommentary(
  recipe: { commentaryInstructions: string },
  tokens: Record<string, string | number>,
  rows: unknown[] | null,
): Promise<{ cardRead: string; notes: Map<string, string> } | null> {
  if (agentsAreMocked()) return null;
  const anchors = collectAnchors({ tokens, rows });
  const client = getAnthropic("template_build");
  const payload = JSON.stringify({ tokens, rows }, null, 2);
  const response = await client.messages.create({
    model: SYNTHESIS_MODEL,
    max_tokens: 1024,
    tool_choice: { type: "tool", name: "record_commentary" },
    tools: [COMMENTARY_TOOL as unknown as Anthropic.Tool],
    messages: [
      {
        role: "user",
        content: `${recipe.commentaryInstructions}

Rules: cite ONLY numbers that appear verbatim in the payload below. No predictions, no invented figures, no internal jargon. Plain professional English.

PAYLOAD:
${payload}`,
      },
    ],
  });
  const tool = response.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  if (!tool) return null;
  const input = tool.input as { card_read?: string; notes?: { id: string; note: string }[] };
  const cardRead = (input.card_read ?? "").trim();
  const notes = new Map<string, string>();
  for (const n of input.notes ?? []) {
    if (commentaryDigitsOk(n.note, anchors)) notes.set(n.id, n.note);
  }
  if (!cardRead || !commentaryDigitsOk(cardRead, anchors)) {
    // Card read minted a number (or came back empty) → drop commentary entirely;
    // surviving notes still ride if the read itself failed? NO — one violation
    // poisons trust in the batch: drop everything, keep the data build.
    return null;
  }
  return { cardRead, notes };
}
```

- [ ] **Step 5: Run tests**

Run: `bun test lib/templates/commentary.test.ts` → PASS.
Also: `bun test refinery/` quick-check that the CallType addition broke nothing (the union is additive).

- [ ] **Step 6: Commit**

```bash
git add lib/templates/commentary.ts lib/templates/commentary.test.ts refinery/agents/anthropic.mts
git commit -m "feat(templates): build-time Sonnet commentary with structural digit guard — template_build call type" -- lib/templates/commentary.ts lib/templates/commentary.test.ts refinery/agents/anthropic.mts
```

---

### Task 12: Builds store + runner script

**Files:**
- Create: `lib/templates/template-builds-store.ts`
- Test: `lib/templates/template-builds-store.test.ts`
- Create: `scripts/templates/build-recipes.mts`
- Test: `scripts/templates/build-recipes.test.mts`

**Interfaces:**
- Consumes: `RECIPES`/`getRecipe` (Task 10), `writeCommentary` (Task 11), `getContract` (Task 2), `createServiceRoleClientUntyped`.
- Produces:
  - `upsertBuild(sb, build: { recipeId, slug, tokens, rows, asOf }): Promise<void>`
  - `readBuild(sb, recipeId): Promise<{ slug, tokens, rows, asOf, builtAt } | null>` (Task 13 uses this)
  - `runRecipes(opts: { recipeId?: string; dryRun: boolean; sb; recipes; commentary }): Promise<{ built: string[]; skipped: string[]; failed: string[] }>` — DI-shaped core so the test injects fakes.
  - CLI: `bun scripts/templates/build-recipes.mts [--recipe <id>] [--dry-run]` — exit 1 if any recipe failed.

- [ ] **Step 1: Store tests** (inject a fake supabase client):

```ts
// lib/templates/template-builds-store.test.ts
import { describe, it, expect } from "bun:test";
import { upsertBuild, readBuild } from "./template-builds-store";

function fakeSb(row: unknown | null = null) {
  const calls: Record<string, unknown>[] = [];
  const chain = {
    upsert: (v: Record<string, unknown>) => { calls.push(v); return Promise.resolve({ error: null }); },
    select: () => chain, eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  };
  return { sb: { from: () => chain } as never, calls };
}

describe("template-builds store", () => {
  it("upsert writes one row keyed by recipe_id", async () => {
    const { sb, calls } = fakeSb();
    await upsertBuild(sb, { recipeId: "corridor-cap-vac", slug: "viz/corridor-positioning", tokens: { a: 1 }, rows: [{ id: "x" }], asOf: "07/12/2026" });
    expect(calls[0]).toMatchObject({ recipe_id: "corridor-cap-vac", slug: "viz/corridor-positioning", as_of: "07/12/2026" });
  });
  it("readBuild null on missing", async () => {
    const { sb } = fakeSb(null);
    expect(await readBuild(sb, "nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Implement the store**

```ts
// lib/templates/template-builds-store.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface StoredBuild {
  slug: string;
  tokens: Record<string, string | number>;
  rows: unknown[] | null;
  asOf: string;
  builtAt: string;
}

export async function upsertBuild(
  sb: SupabaseClient,
  b: { recipeId: string; slug: string; tokens: Record<string, string | number>; rows: unknown[] | null; asOf: string },
): Promise<void> {
  const { error } = await sb.from("template_builds").upsert({
    recipe_id: b.recipeId,
    slug: b.slug,
    tokens: b.tokens,
    rows: b.rows,
    as_of: b.asOf,
    built_at: new Date().toISOString(),
  });
  if (error) throw new Error(`template_builds upsert (${b.recipeId}): ${error.message}`);
}

export async function readBuild(sb: SupabaseClient, recipeId: string): Promise<StoredBuild | null> {
  const { data, error } = await sb
    .from("template_builds")
    .select("slug, tokens, rows, as_of, built_at")
    .eq("recipe_id", recipeId)
    .maybeSingle();
  if (error) throw new Error(`template_builds read (${recipeId}): ${error.message}`);
  if (!data) return null;
  return {
    slug: data.slug as string,
    tokens: data.tokens as Record<string, string | number>,
    rows: (data.rows as unknown[] | null) ?? null,
    asOf: data.as_of as string,
    builtAt: data.built_at as string,
  };
}
```

- [ ] **Step 3: Runner core + CLI.** Test first (`scripts/templates/build-recipes.test.mts`): inject 2 fake recipes (one loads rows and maps clean; one whose `load` returns `[]` → skipped; add a third whose `map` throws → failed), a fake `commentary` fn returning `{ cardRead: "Read.", notes: new Map([["a", "note"]]) }`, and a fake sb capturing upserts. Assert: built/skipped/failed sets; commentary lands in `tokens.card_read` and notes merge into rows by id; dryRun performs NO upserts and NO commentary calls; zod validation runs before store (a recipe whose map emits a contract-violating payload lands in `failed`).

```ts
// scripts/templates/build-recipes.mts (core exported for tests; CLI at bottom)
import { getContract } from "../../lib/templates/token-contracts";
import { RECIPES, type RecipeDef } from "../../lib/templates/recipes.server";
import { writeCommentary } from "../../lib/templates/commentary";
import { upsertBuild } from "../../lib/templates/template-builds-store";
import { createServiceRoleClientUntyped } from "../../utils/supabase/service-role";
import type { SupabaseClient } from "@supabase/supabase-js";

type CommentaryFn = typeof writeCommentary;

export async function runRecipes(opts: {
  sb: SupabaseClient;
  recipes: RecipeDef[];
  commentary: CommentaryFn;
  recipeId?: string;
  dryRun: boolean;
}): Promise<{ built: string[]; skipped: string[]; failed: string[] }> {
  const built: string[] = [], skipped: string[] = [], failed: string[] = [];
  const targets = opts.recipeId ? opts.recipes.filter((r) => r.meta.id === opts.recipeId) : opts.recipes;
  if (opts.recipeId && targets.length === 0) throw new Error(`unknown recipe: ${opts.recipeId}`);

  for (const recipe of targets) {
    const id = recipe.meta.id;
    try {
      const raw = await recipe.load(opts.sb);
      if (raw.length === 0) {
        console.log(`[${id}] loader empty — skipped, prior build keeps serving`);
        skipped.push(id);
        continue;
      }
      const { tokens, rows, asOf } = recipe.map(raw);

      // Validators gate writes: a payload that fails its contract NEVER stores.
      const contract = getContract(recipe.meta.slug);
      if (!contract) throw new Error(`no contract for ${recipe.meta.slug}`);
      const t = contract.tokensSchema.safeParse(tokens);
      if (!t.success) throw new Error(`tokens contract: ${t.error.message}`);
      if (contract.rowsSchema) {
        const r = contract.rowsSchema.safeParse(rows);
        if (!r.success) throw new Error(`rows contract: ${r.error.message}`);
      }

      if (opts.dryRun) {
        console.log(`[${id}] DRY RUN — payload valid (${rows?.length ?? 0} rows, as of ${asOf}); no commentary, no write`);
        built.push(id);
        continue;
      }

      // Commentary is best-effort: null (refusal / digit-guard trip / mock) →
      // fresh data ships with empty read + no notes; retry next cron.
      let finalTokens = tokens;
      let finalRows = rows;
      try {
        const c = await opts.commentary(recipe, tokens, rows);
        if (c) {
          finalTokens = { ...tokens, card_read: c.cardRead };
          if (rows && c.notes.size) {
            finalRows = rows.map((row) => {
              const r = row as { id?: string; note?: string };
              const note = r.id ? c.notes.get(r.id) : undefined;
              return note ? { ...r, note } : row;
            });
          }
        }
      } catch (e) {
        console.error(`[${id}] commentary failed — shipping data without it:`, e instanceof Error ? e.message : e);
      }

      await upsertBuild(opts.sb, { recipeId: id, slug: recipe.meta.slug, tokens: finalTokens, rows: finalRows, asOf });
      console.log(`[${id}] built — ${finalRows?.length ?? 0} rows, as of ${asOf}`);
      built.push(id);
    } catch (e) {
      console.error(`[${id}] FAILED — prior build keeps serving:`, e instanceof Error ? e.message : e);
      failed.push(id);
    }
  }
  return { built, skipped, failed };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || process.env.DRY_RUN === "true";
  const ri = args.indexOf("--recipe");
  const recipeId = ri >= 0 ? args[ri + 1] : undefined;
  const sb = createServiceRoleClientUntyped();
  const result = await runRecipes({ sb, recipes: RECIPES, commentary: writeCommentary, recipeId, dryRun });
  console.log(`done: built=${result.built.length} skipped=${result.skipped.length} failed=${result.failed.length}`);
  if (result.failed.length > 0) process.exit(1);
}
```

NOTE: commentary rows merge overwrites a mapper-supplied `note` only when Sonnet produced a digit-clean one for that id — mapper notes (e.g. corridor `character`) are the fallback text. Re-validate `finalRows` against the rows contract after the merge (notes are strings, so this cannot fail structurally, but the re-parse keeps the gate honest) — add that line in the implementation.

- [ ] **Step 4: Run tests**

Run: `bun test lib/templates/template-builds-store.test.ts scripts/templates/build-recipes.test.mts` → PASS.

- [ ] **Step 5: Live dry-run** (reads real tables, zero writes, zero model calls):

Run: `bun scripts/templates/build-recipes.mts --dry-run`
Expected: each recipe logs `DRY RUN — payload valid` (or a named skip/failure to investigate — a loader that can't see its table means a missing GRANT; fix before proceeding).

- [ ] **Step 6: Commit**

```bash
git add lib/templates/template-builds-store.ts lib/templates/template-builds-store.test.ts scripts/templates/build-recipes.mts scripts/templates/build-recipes.test.mts
git commit -m "feat(templates): recipe build runner — validate, commentary, upsert; failures never replace a good build" -- lib/templates/template-builds-store.ts lib/templates/template-builds-store.test.ts scripts/templates/build-recipes.mts scripts/templates/build-recipes.test.mts
```

---

### Task 13: `GET ?recipe=` — serve stored builds

**Files:**
- 🟡 Modify: `app/api/templates/render/route.ts`

**Interfaces:**
- Consumes: `getRecipe` (recipe-manifest via recipes — import ONLY `RECIPE_MANIFEST` here to keep the route light: the route needs id→slug, not loaders), `readBuild` (Task 12), `serializeDataJson` (Task 1).
- Produces: `GET /api/templates/render?recipe=<id>` → stored build HTML; no stored build yet → the slug's sample render (never a broken card); unknown id → 404 JSON.

- [ ] **Step 1: Add the branch at the top of GET:**

```ts
  const url = new URL(request.url);
  const recipeId = url.searchParams.get("recipe");
  if (recipeId) {
    const meta = RECIPE_MANIFEST.find((m) => m.id === recipeId);
    if (!meta) return Response.json({ error: `unknown recipe: ${recipeId}` }, { status: 404 });
    const sb = createServiceRoleClientUntyped();
    const build = await readBuild(sb, recipeId).catch(() => null);
    const entry = getTemplateEntry(meta.slug);
    if (!entry) return Response.json({ error: "template unavailable" }, { status: 400 });
    const tokens: Record<string, string | number> = build
      ? { ...build.tokens, ...(build.rows ? { data_json: serializeDataJson(build.rows) } : {}) }
      : { ...entry.previewData, ...(entry.previewRows ? { data_json: serializeDataJson(entry.previewRows) } : {}) };
    const html = await renderHtmlTemplate(meta.slug, tokens);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${recipeId}.html"`,
        // Stored builds change at most daily (cron); let the edge absorb repeats.
        "Cache-Control": "public, max-age=300",
      },
    });
  }
```

Imports: `RECIPE_MANIFEST` from `@/lib/templates/recipe-manifest`, `readBuild` from `@/lib/templates/template-builds-store`, `createServiceRoleClientUntyped` from `@/utils/supabase/service-role`. The existing `?slug=` path continues below unchanged.

- [ ] **Step 2: Verify**

Run: `bunx next build` → clean. Then locally: `bun scripts/templates/build-recipes.mts --recipe corridor-cap-vac` (FIRST real commentary call — one Sonnet call, spend-guarded; this is a known pre-approved surface cost per the spec's build description), then hit `http://localhost:3000/api/templates/render?recipe=corridor-cap-vac` on `next dev` and confirm real corridors render with a read block.

- [ ] **Step 3: Commit**

```bash
git add app/api/templates/render/route.ts
git commit -m "feat(templates): GET ?recipe= serves stored builds with sample fallback" -- app/api/templates/render/route.ts
```

---

### Task 14: Cron wrapper

**Files:**
- Create: `.github/workflows/template-recipes.yml`

- [ ] **Step 1: Write the workflow** (pipeline-freshness rule: cron + `--dry-run` ship with the pipeline):

```yaml
# .github/workflows/template-recipes.yml
#
# Viz-archetype recipe builds (spec: docs/superpowers/specs/2026-07-12-viz-archetypes-design.md).
# Rebuilds each recipe's stored payload from the lake + one Sonnet commentary
# call per recipe (spend-guarded via refinery/agents/anthropic.mts caps). A
# failed recipe never replaces its prior stored build.
name: template-recipes
on:
  schedule:
    - cron: "40 10 * * *" # 10:40 UTC daily — off the :00/:23 herd
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Validate payloads only — no writes, no model calls"
        type: boolean
        default: false
      recipe:
        description: "Build one recipe id only (blank = all)"
        type: string
        default: ""

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Build recipes
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          DRY_RUN: ${{ inputs.dry_run == true && 'true' || 'false' }}
        run: bun scripts/templates/build-recipes.mts ${{ inputs.recipe != '' && format('--recipe {0}', inputs.recipe) || '' }}
```

All three secrets already exist in the repo (same trio as `social-pulse-scan.yml`) — no `gh secret set` step needed.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/template-recipes.yml
git commit -m "feat(templates): template-recipes daily cron wrapper with dry_run + per-recipe dispatch" -- .github/workflows/template-recipes.yml
```

(After the operator pushes: `gh workflow run template-recipes.yml -f dry_run=true` proves the wrapper before the first scheduled run.)

---

### Task 15: Showcase — recipe variants per card

**Files:**
- Modify: `app/showcase/ShowcaseGrid.tsx`
- Modify: `app/showcase/page.tsx` (section copy only)

**Interfaces:**
- Consumes: `RECIPE_MANIFEST` (client-safe), existing modal/iframe.

- [ ] **Step 1: Variant buttons.** In `ShowcaseGrid`, preview state becomes `{ src: string; name: string }`. Each card keeps its `Preview →` button (sample render, `?slug=`) and adds one button per recipe variant:

```tsx
import { RECIPE_MANIFEST } from "@/lib/templates/recipe-manifest";
// inside the card map:
const variants = RECIPE_MANIFEST.filter((r) => r.slug === t.slug);
// after the sample Preview button:
{variants.map((v) => (
  <button
    key={v.id}
    type="button"
    onClick={() => setPreview({ src: `/api/templates/render?recipe=${encodeURIComponent(v.id)}`, name: `${t.name} — ${v.label}` })}
    className="mt-2 self-start rounded-md border border-gulf-teal-dim bg-gulf-slate-hi px-4 py-2 font-mono text-xs font-medium tracking-wide text-gulf-teal transition-colors hover:border-gulf-teal"
  >
    {v.label} →
  </button>
))}
```

The sample button becomes `setPreview({ src: \`/api/templates/render?slug=${encodeURIComponent(t.slug)}\`, name: t.name })` and the iframe uses `preview.src`. The `?recipe=` endpoint's built-in sample fallback guarantees no broken card pre-first-cron.

- [ ] **Step 2: Section copy** in `page.tsx` — replace the Visual Templates header paragraph (lines 60–64) with archetype language:

```tsx
        <p className="mt-3 max-w-2xl text-text-secondary">
          Five chart layouts that take any data that goes together — position a set on two measures,
          rank against bands, walk a timeline, gauge a value against its own baseline, split a whole
          and spotlight one piece. Each card below runs on live SWFL data today; the same layout
          takes yours, in your brand.
        </p>
```

- [ ] **Step 3: Verify + commit**

Run: `bunx next build` → clean; `/showcase` prerenders with variant buttons.

```bash
git add app/showcase/ShowcaseGrid.tsx app/showcase/page.tsx
git commit -m "feat(showcase): viz cards list live recipe variants; archetype copy" -- app/showcase/ShowcaseGrid.tsx app/showcase/page.tsx
```

---

### Task 16: Full gates + ship

- [ ] **Step 1: Full test sweep**

Run: `bun test lib/templates/ scripts/templates/ && bun test refinery/agents/`
Expected: all green.

- [ ] **Step 2: Build gate**

Run: `bunx next build`
Expected: clean full typecheck; `/showcase` + `/api/templates/render` in the route table.

- [ ] **Step 3: First real builds (local, spend-guarded).** `bun scripts/templates/build-recipes.mts` — all six recipes build (≈6 Sonnet calls, logged to `api_usage_log` under `template_build`). Recipes whose loaders find empty tables (possible for `zip-market-activity` on a quiet day) log a named skip — that's correct behavior, not a failure.

- [ ] **Step 4: SESSION_LOG + build-queue.** Append the SESSION_LOG entry (what shipped, test counts, dry-run/live evidence) and flip the build-queue viz-archetypes line to `[~] BUILT local`. Commit both with explicit paths.

- [ ] **Step 5: STOP — operator gate.** Do NOT push. The render route is a live `/api` surface (RULE 1 "ask first"). Show `git log --oneline origin/main..HEAD` and hand the operator the push. After push + deploy, the live-verify closes `viz_archetypes_live_verify` per the spec: showcase card → recipe preview renders real lake data with brand pair, source line + MM/DD/YYYY as-of, commentary in the read block; a POST with custom rows + custom brand returns a branded render (served-bytes check).

---

## Self-Review Notes (run after drafting — resolved inline)

- **Spec coverage:** shells ×5 (Tasks 3–7), serializer (1), contracts (2), registry (10), runner+storage (9, 12), render surface (8, 13), showcase (15), cron (14), CallType (11). Freshness-token removal: enforced by `.strict()` contracts + new footers. ✔
- **Type consistency:** `getContract` / `serializeDataJson` / `readBuild` / `upsertBuild` / `runRecipes` / `RecipeDef.map → { tokens, rows, asOf }` used identically across Tasks 8, 10, 12, 13. Row field `note` is both mapper-supplied (fallback) and commentary-merged (Task 12 note). ✔
- **No invented numbers:** every preview/recipe figure traces to the shells' existing sourced values or a verified table; storm labels are static facts riding the OpenFEMA source line; 2024 merged at grain held. ✔
- **YAGNI:** no PDF, no AI-fill chat flow, no new ingest, no second gauge/composition recipes until their sources have readable seams (named as follow-ups). ✔

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 3, Task 4, Task 5, Task 6, Task 7 | `lib/templates/manifest.ts` |
| 🟡 | Task 8, Task 13 | `app/api/templates/render/route.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
