# Two-phase plan+fill grid authoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 6 tasks, 9 files, keywords: refactor, schema, architecture

**Goal:** Split `authorDoc()`'s single 8192-token `callAuthor` tool-call into a
PLAN call (structure + style, no prose — can never truncate) and per-row FILL
calls (content only, run in parallel against PLAN's frozen style contract),
merged back into the exact same `AuthoredDoc` shape `assembleAuthoredDoc`
already consumes.

**Architecture:** Two new pure modules (`author-plan.ts`, `author-fill.ts`)
hold schemas/prompts/merge logic, mirroring the existing pure/orchestration
split between `author-doc.ts` (pure) and `build-doc.ts` (I/O). `build-doc.ts`
gets three new orchestration functions (`callPlan`, `callFillRow`,
`authorContent`) that wrap PLAN+FILL with a fallback ladder to the existing,
untouched `callAuthor` single-shot path. `authorDoc()` changes by exactly one
call site.

**Tech Stack:** TypeScript, Zod v4, `@anthropic-ai/sdk`, `bun:test`.

## Global Constraints

- Every existing guarantee is reused, never re-implemented: id-selection
  (`value_figure`/`asset`), the no-invention prose lint, `voiceGuard`, brand
  overlay, the regenerate-once-then-strip repair loop. None of their code
  changes.
- The free-tier `buildContentDoc` content-patch path is untouched.
- This codebase's test convention (confirmed in `author-doc.test.ts`) is
  **pure functions only** — schemas, prompt builders, and merge logic get
  `bun:test` unit tests; the actual Anthropic network calls (`callAuthor`
  today, `callPlan`/`callFillRow` here) are NOT mocked/unit-tested — they're
  covered by the live-verify check already opened
  (`email_grid_plan_fill_live_verify`). Do not invent a mocking framework not
  used elsewhere in this codebase.
- Follow existing patterns exactly: `cache_control: { type: "ephemeral" }` on
  static tool definitions (mirrors `AUTHOR_TOOL`, `author-doc.ts:120`); forced
  `tool_choice`; the `console.error` + `return null` failure shape `callAuthor`
  already uses (`build-doc.ts:654-689`).

---

## File Structure

- **Create:** `lib/email/author-plan.ts` — PLAN schemas (`PlanBlockSchema`,
  `PlanRowSchema`, `PlanDocSchema`), `PLAN_TOOL`, `planSystem()`. Pure, no I/O.
- **Create:** `lib/email/author-plan.test.ts` — schema + `planSystem()` tests.
- **Create:** `lib/email/author-fill.ts` — `FillRowDocSchema`, `FILL_ROW_TOOL`,
  `fillRowSystem()`, `neighborContext()`, `mergeRows()`. Pure, no I/O.
- **Create:** `lib/email/author-fill.test.ts` — schema/merge/context tests.
- **Modify:** `lib/email/author-doc.ts` — extract `AUTHORED_BLOCK_ITEM_SCHEMA`
  (shared JSON schema for one authored block, used by both `AUTHOR_TOOL` and
  the new `FILL_ROW_TOOL`); add `renderFigureMenuLabels()`.
- **Modify:** `lib/email/author-doc.test.ts` — add coverage for
  `renderFigureMenuLabels()`; confirm `AUTHOR_TOOL` still validates identically
  after the extraction (regression).
- **Modify:** `lib/email/build-doc.ts` — add `callPlan()`, `callFillRow()`,
  `authorContent()`; change one line in `authorDoc()` to call `authorContent()`
  instead of `callAuthor()` directly.

---

### Task 1: Extract the shared authored-block JSON schema

**Files:**
- 🔴 Modify: `lib/email/author-doc.ts:114-303` (the `AUTHOR_TOOL` constant)
- 🔴 Test: `lib/email/author-doc.test.ts` (existing `AUTHOR_TOOL.input_schema...`
  tests must still pass unchanged — this is a pure refactor, zero behavior
  change)

**Interfaces:**
- Produces: `export const AUTHORED_BLOCK_ITEM_SCHEMA` — the exact JSON-schema
  object for one authored block (same shape `AUTHOR_TOOL.input_schema
  .properties.blocks.items` already has). Task 3/4 do not consume this
  directly (PLAN gets its own narrower schema); Task 4's `FILL_ROW_TOOL`
  imports and reuses it verbatim.

- [ ] **Step 1: Extract `AUTHORED_BLOCK_ITEM_SCHEMA` as a standalone const**

In `lib/email/author-doc.ts`, immediately BEFORE the `AUTHOR_TOOL` constant
(currently starting at line 114), insert:

```ts
/** The JSON-schema shape for ONE authored block — shared verbatim with
 *  FILL_ROW_TOOL (author-fill.ts), which reuses every content field but NOT
 *  the structural ones (type/span/new_row/value_figure/image_role/asset/band/
 *  pad — PLAN owns those; FILL's merge step ignores them if the model still
 *  emits them, since PlanBlock's values are authoritative). */
export const AUTHORED_BLOCK_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      description: "Block type — one of the BLOCK VOCABULARY listed in the prompt.",
    },
    span: {
      type: "integer",
      minimum: 1,
      maximum: 12,
      description: "Column width 1–12 (12 = full width).",
    },
    new_row: {
      type: "boolean",
      description: "true = start a new row; false = sit beside the previous block.",
    },
    value_figure: {
      type: "string",
      description:
        "A [fN] DATA MENU id whose verbatim value becomes this block's headline number.",
    },
    kicker: { type: "string" },
    label: { type: "string" },
    prose: { type: "string" },
    title: { type: "string" },
    body: { type: "string" },
    caption: { type: "string" },
    alt: { type: "string" },
    tagline: { type: "string" },
    designation: { type: "string" },
    bio: { type: "string" },
    button_label: { type: "string" },
    align: { type: "string", enum: ["left", "center", "right"] },
    image_role: {
      type: "string",
      enum: ["chart", "photo"],
      description: "For an image block: which offered asset to place.",
    },
    asset: {
      type: "string",
      description:
        "For an image block: an [aN] ASSET MENU id — the system places that " +
        "library image. Takes precedence over image_role.",
    },
    overlay_title: {
      type: "string",
      description: "Image blocks only: a short headline rendered on top of the image.",
    },
    overlay_body: {
      type: "string",
      description: "Image blocks only: supporting text under the overlay headline.",
    },
    band: {
      type: "string",
      enum: ["light", "dark", "accent"],
      description:
        "Optional background band — the system resolves the color from the user's " +
        "palette and flips text on dark.",
    },
    pad: {
      type: "string",
      enum: ["airy", "normal", "tight"],
      description: "Breathing room for this section. Airy reads premium.",
    },
    columns: {
      type: "array",
      description: "multi-column blocks only: 2–3 feature cards.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
          link_label: {
            type: "string",
            description: "Optional link text; the system supplies the destination.",
          },
          asset: {
            type: "string",
            description: "Optional [aN] ASSET MENU id for this card's image.",
          },
        },
      },
    },
    items: {
      type: "array",
      description: "list blocks only: up to 8 rows.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          lead: { type: "string", description: "Short bold prefix, e.g. a date tag." },
          text: { type: "string" },
        },
        required: ["text"],
      },
    },
    stats: {
      type: "array",
      description: "KPI cells (max 3). Each number is a [fN] menu id via value_figure.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          value_figure: {
            type: "string",
            description: "A [fN] menu id; its verbatim value fills this cell.",
          },
          value: {
            type: "string",
            description:
              "Only for a non-figure cell (e.g. 'Buyer\\'s market'); avoid raw numbers.",
          },
          label: { type: "string" },
        },
      },
    },
  },
  required: ["type"],
} as const;
```

- [ ] **Step 2: Point `AUTHOR_TOOL` at the extracted constant**

In the same file, inside `AUTHOR_TOOL.input_schema.properties.blocks`, replace
the inline `items: { type: "object", additionalProperties: false, properties:
{ ... }, required: ["type"] }` block (everything between `items: {` and its
matching closing `},` right before `description: "Ordered blocks..."` stays —
only the `items` value changes) with:

```ts
        items: AUTHORED_BLOCK_ITEM_SCHEMA,
```

So `AUTHOR_TOOL.input_schema.properties.blocks` reads:

```ts
      blocks: {
        type: "array",
        description: "Ordered blocks, top of the email first.",
        items: AUTHORED_BLOCK_ITEM_SCHEMA,
      },
```

- [ ] **Step 3: Run the existing test suite to confirm zero behavior change**

Run: `bun test lib/email/author-doc.test.ts`
Expected: PASS — every existing test (including the
`AUTHOR_TOOL.input_schema declares schedule_suggestion as optional` test at
`author-doc.test.ts:256`) still passes unchanged, since `AUTHOR_TOOL`'s
resolved shape is byte-identical.

- [ ] **Step 4: Commit**

```bash
git add lib/email/author-doc.ts
git commit -m "refactor(email): extract AUTHORED_BLOCK_ITEM_SCHEMA for reuse by the fill tool"
```

---

### Task 2: Add `renderFigureMenuLabels()`

**Files:**
- 🔴 Modify: `lib/email/author-doc.ts` (beside the existing `renderFigureMenu`,
  around line 58-68)
- 🔴 Test: `lib/email/author-doc.test.ts`

**Interfaces:**
- Consumes: `MenuFigure` (already defined, `author-doc.ts:45-48`)
- Produces: `export function renderFigureMenuLabels(menu: MenuFigure[]): string`
  — Task 3's `planSystem()` calls this.

- [ ] **Step 1: Write the failing test**

Add to `lib/email/author-doc.test.ts` (new `describe` block, anywhere after
the existing imports — add `renderFigureMenuLabels` to the import list at the
top of the file alongside the other named imports from `./author-doc`):

```ts
describe("renderFigureMenuLabels (PLAN sees ids+labels, never values)", () => {
  test("renders id + label, omits value and source", () => {
    const menu = buildFigureMenu(FIGURES);
    const out = renderFigureMenuLabels(menu);
    expect(out).toContain("[f0] Median home value — Naples (34102)");
    expect(out).toContain("[f1] Average days on market");
    expect(out).not.toContain("$1,250,000");
    expect(out).not.toContain("Zillow ZHVI");
  });

  test("empty menu renders the same no-figures notice as renderFigureMenu", () => {
    expect(renderFigureMenuLabels([])).toBe(
      "(no held figures for this scope — write a cited-figure-free email)",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/email/author-doc.test.ts -t "renderFigureMenuLabels"`
Expected: FAIL with "renderFigureMenuLabels is not defined" (or similar
import error)

- [ ] **Step 3: Implement**

In `lib/email/author-doc.ts`, immediately after the existing
`renderFigureMenu` function (ends around line 68), add:

```ts
/** Render the menu as ids+labels ONLY — no value, no source. Used by the PLAN
 *  phase (author-plan.ts): PLAN references which figure a block will carry,
 *  it never quotes one, so it never needs the formatted value. */
export function renderFigureMenuLabels(menu: MenuFigure[]): string {
  if (!menu.length) return "(no held figures for this scope — write a cited-figure-free email)";
  return menu.map((m) => `  [${m.id}] ${m.figure.label}`).join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/email/author-doc.test.ts -t "renderFigureMenuLabels"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/email/author-doc.ts lib/email/author-doc.test.ts
git commit -m "feat(email): add renderFigureMenuLabels for the plan-phase prompt"
```

---

### Task 3: Create `lib/email/author-plan.ts` (PLAN schemas + tool + prompt)

**Files:**
- Create: `lib/email/author-plan.ts`
- Create: `lib/email/author-plan.test.ts`

**Interfaces:**
- Consumes: `ScheduleSuggestionSchema` (from `./doc/schema`),
  `renderFigureMenuLabels`, `MenuFigure` (from `./author-doc`)
- Produces: `PlanBlockSchema`, `PlanRowSchema`, `PlanDocSchema`, `PlanBlock`,
  `PlanRow`, `PlanDoc` (types), `PLAN_TOOL`, `planSystem(opts): string` —
  Task 4 (`mergeRows`) and Task 5 (`callPlan`) both import from here.

- [ ] **Step 1: Write the failing tests**

Create `lib/email/author-plan.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { PlanDocSchema, PLAN_TOOL, planSystem } from "./author-plan";
import { buildFigureMenu } from "./author-doc";
import type { MarketFigure } from "./market-context";

const FIGURES: MarketFigure[] = [
  { key: "home_value", label: "Median home value — Naples (34102)", value: "$1,250,000", source: "Zillow ZHVI", as_of: "06/01/2026" },
];

describe("PlanDocSchema", () => {
  test("accepts a minimal valid plan", () => {
    const r = PlanDocSchema.safeParse({
      rows: [{ blocks: [{ type: "hero", span: 12 }] }],
    });
    expect(r.success).toBe(true);
  });

  test("rejects a row with zero blocks", () => {
    const r = PlanDocSchema.safeParse({ rows: [{ blocks: [] }] });
    expect(r.success).toBe(false);
  });

  test("rejects more than 3 blocks in one row", () => {
    const r = PlanDocSchema.safeParse({
      rows: [{ blocks: [{ type: "text" }, { type: "text" }, { type: "text" }, { type: "text" }] }],
    });
    expect(r.success).toBe(false);
  });

  test("a plan block carries NO content fields (prose is structurally impossible)", () => {
    const r = PlanDocSchema.safeParse({
      rows: [{ blocks: [{ type: "hero", span: 12, prose: "should be stripped or rejected" }] }],
    });
    // strip-mode z.object: unknown keys are dropped, not rejected
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data.rows[0].blocks[0] as Record<string, unknown>).prose).toBeUndefined();
    }
  });

  test("accepts band/pad on a row and value_figure/image_role/asset on a block", () => {
    const r = PlanDocSchema.safeParse({
      rows: [
        {
          band: "accent",
          pad: "airy",
          blocks: [{ type: "hero", span: 12, value_figure: "f0", image_role: "chart", asset: "a0" }],
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  test("accepts an optional schedule_suggestion", () => {
    const r = PlanDocSchema.safeParse({
      rows: [{ blocks: [{ type: "footer" }] }],
      schedule_suggestion: { cadence: "weekly", reason: "recurring market update" },
    });
    expect(r.success).toBe(true);
  });
});

describe("PLAN_TOOL", () => {
  test("is a forced-tool definition named plan_email with cache_control", () => {
    expect(PLAN_TOOL.name).toBe("plan_email");
    expect(PLAN_TOOL.cache_control).toEqual({ type: "ephemeral" });
  });

  test("input_schema requires rows but not schedule_suggestion", () => {
    expect(PLAN_TOOL.input_schema.required).toEqual(["rows"]);
  });
});

describe("planSystem", () => {
  test("carries the block vocabulary and figure labels (never values)", () => {
    const menu = buildFigureMenu(FIGURES);
    const out = planSystem({ menu, vocabulary: ["hero", "text", "footer"], hasChart: false, hasPhoto: false });
    expect(out).toContain("hero, text, footer");
    expect(out).toContain("Median home value — Naples (34102)");
    expect(out).not.toContain("$1,250,000");
  });

  test("mentions chart/photo availability only when offered", () => {
    const menu = buildFigureMenu(FIGURES);
    const withChart = planSystem({ menu, vocabulary: ["hero"], hasChart: true, hasPhoto: false });
    const without = planSystem({ menu, vocabulary: ["hero"], hasChart: false, hasPhoto: false });
    expect(withChart).toContain("CHART");
    expect(without).not.toContain("CHART");
  });

  test("appends the recipe verbatim when provided", () => {
    const menu = buildFigureMenu(FIGURES);
    const out = planSystem({ menu, vocabulary: ["hero"], hasChart: false, hasPhoto: false, recipe: "RECIPE — TEST" });
    expect(out).toContain("RECIPE — TEST");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/email/author-plan.test.ts`
Expected: FAIL — `./author-plan` does not exist yet.

- [ ] **Step 3: Implement `lib/email/author-plan.ts`**

```ts
// lib/email/author-plan.ts
//
// PLAN phase (build 06 — grid plan+fill). The model decides STRUCTURE and
// STYLE ONLY — which blocks, how they group into rows, band/pad per row,
// and which DATA MENU figure / offered asset each block carries. No prose:
// PlanBlockSchema has no content fields at all, so the model cannot write
// copy here even if it tried (a structural guarantee, same philosophy as
// AUTHOR_TOOL's "NOT YOURS" fields — see author-doc.ts).
//
// This call is small by construction (no prose fields), so it can never
// approach a token ceiling regardless of email size — the fix for the
// truncation-on-bigger-builds failure mode (spec:
// docs/superpowers/specs/2026-07-08-email-grid-plan-fill-design.md).
import { z } from "zod";
import { ScheduleSuggestionSchema } from "./doc/schema";
import { renderFigureMenuLabels, type MenuFigure, type MenuAsset, renderAssetMenu } from "./author-doc";

export const PlanBlockSchema = z.object({
  type: z.string().max(40),
  span: z.number().int().min(1).max(12).optional(),
  value_figure: z.string().max(40).optional(),
  image_role: z.enum(["chart", "photo"]).optional(),
  asset: z.string().max(8).optional(),
});

export const PlanRowSchema = z.object({
  band: z.enum(["light", "dark", "accent"]).optional(),
  pad: z.enum(["airy", "normal", "tight"]).optional(),
  blocks: z.array(PlanBlockSchema).min(1).max(3),
});

export const PlanDocSchema = z.object({
  rows: z.array(PlanRowSchema).min(1).max(12),
  schedule_suggestion: ScheduleSuggestionSchema.optional(),
});

export type PlanBlock = z.infer<typeof PlanBlockSchema>;
export type PlanRow = z.infer<typeof PlanRowSchema>;
export type PlanDoc = z.infer<typeof PlanDocSchema>;

export const PLAN_TOOL = {
  name: "plan_email",
  // Byte-identical on every plan call — cache it (mirrors AUTHOR_TOOL, author-doc.ts:120).
  cache_control: { type: "ephemeral" },
  description:
    "Plan a marketing email's STRUCTURE ONLY — which blocks, grouped into which " +
    "rows, in what order, and each row's band/pad. Do NOT write any copy here; a " +
    "separate pass fills content into the structure you choose.\n\n" +
    "ROWS — each element of `rows` is one visual row, 1-3 blocks wide, blocks " +
    "in a row should sum to about 12 `span`. Order rows top to bottom.\n\n" +
    "STYLE CONTRACT — `band` (\"light\"|\"dark\"|\"accent\") and `pad` " +
    "(\"airy\"|\"normal\"|\"tight\") are decided ONCE per row, here, and are FROZEN " +
    "for the rest of the build — the content-fill pass cannot change them. Plan " +
    "these deliberately so the whole email reads as one designed piece, not a " +
    "sequence of independent guesses.\n\n" +
    "ASSETS — set `value_figure` to a [fN] DATA MENU id on any block that will " +
    "carry a headline number; set `image_role` (\"chart\"|\"photo\") on an image " +
    "block to claim an offered asset, or `asset` to an [aN] ASSET MENU id.\n\n" +
    "Always include a footer block as the last row.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      rows: {
        type: "array",
        description: "Ordered rows, top of the email first.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            band: { type: "string", enum: ["light", "dark", "accent"] },
            pad: { type: "string", enum: ["airy", "normal", "tight"] },
            blocks: {
              type: "array",
              description: "1-3 blocks sitting side by side in this row.",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  type: { type: "string", description: "One of the BLOCK VOCABULARY listed in the prompt." },
                  span: { type: "integer", minimum: 1, maximum: 12 },
                  value_figure: { type: "string", description: "A [fN] DATA MENU id for this block's headline number." },
                  image_role: { type: "string", enum: ["chart", "photo"] },
                  asset: { type: "string", description: "An [aN] ASSET MENU id." },
                },
                required: ["type"],
              },
            },
          },
          required: ["blocks"],
        },
      },
      schedule_suggestion: {
        type: "object",
        additionalProperties: false,
        description:
          "OPTIONAL. Only if this content reads like a recurring digest — suggest a send cadence.",
        properties: {
          cadence: { type: "string", enum: ["weekly", "monthly"] },
          reason: { type: "string", description: "One sentence: why this cadence fits." },
        },
        required: ["cadence", "reason"],
      },
    },
    required: ["rows"],
  },
} as const;

/** The PLAN-phase system prompt: structure only. Menu figures are ids+labels
 *  (renderFigureMenuLabels) — PLAN references a figure, it never quotes one. */
export function planSystem(opts: {
  menu: MenuFigure[];
  vocabulary: string[];
  hasChart: boolean;
  hasPhoto: boolean;
  assetMenu?: MenuAsset[];
  recipe?: string;
}): string {
  const parts: string[] = [
    "You are planning the STRUCTURE of a marketing email for SWFL Data Gulf, a " +
      "Southwest Florida real estate intelligence platform, by calling the " +
      "plan_email tool.",
    `BLOCK VOCABULARY (use only these \`type\` values): ${opts.vocabulary.join(", ")}.`,
    `DATA MENU — figures available to reference by id (values are filled later; ` +
      `you never see or quote them here):\n${renderFigureMenuLabels(opts.menu)}`,
  ];
  if (opts.hasChart) {
    parts.push(
      "A market CHART is available — reserve one image block with " +
        '`image_role:"chart"` for it, wherever it best fits the plan.',
    );
  }
  if (opts.hasPhoto) {
    parts.push(
      'A property/agent PHOTO is available — reserve one image block with `image_role:"photo"`.',
    );
  }
  if (opts.assetMenu?.length) {
    parts.push(
      `ASSET MENU — the user's image library; reserve one via \`asset:"aN"\` on an ` +
        `image block. Only these ids exist.\n${renderAssetMenu(opts.assetMenu)}`,
    );
  }
  if (opts.recipe) parts.push(opts.recipe);
  return parts.join("\n\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/email/author-plan.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/email/author-plan.ts lib/email/author-plan.test.ts
git commit -m "feat(email): add PLAN phase — structure/style tool, schema, and prompt"
```

---

### Task 4: Create `lib/email/author-fill.ts` (FILL schema + tool + prompt + merge)

**Files:**
- Create: `lib/email/author-fill.ts`
- Create: `lib/email/author-fill.test.ts`

**Interfaces:**
- Consumes: `AuthoredBlockSchema`, `AuthoredBlock`, `AuthoredDoc` (from
  `./doc/schema`), `AUTHORED_BLOCK_ITEM_SCHEMA` (from `./author-doc`,
  Task 1), `PlanDoc`, `PlanRow`, `PlanBlock` (from `./author-plan`, Task 3),
  `MenuFigure`, `renderFigureMenu` (from `./author-doc`)
- Produces: `FillRowDocSchema`, `FILL_ROW_TOOL`, `fillRowSystem(opts): string`,
  `neighborContext(plan, rowIndex): string`,
  `mergeRows(plan: PlanDoc, filled: Array<{ blocks: AuthoredBlock[] } | null>): AuthoredDoc`
  — Task 5's `callFillRow`/`authorContent` both import from here.

- [ ] **Step 1: Write the failing tests**

Create `lib/email/author-fill.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { FillRowDocSchema, FILL_ROW_TOOL, fillRowSystem, neighborContext, mergeRows } from "./author-fill";
import type { PlanDoc } from "./author-plan";
import { buildFigureMenu } from "./author-doc";
import type { MarketFigure } from "./market-context";
import type { AuthoredBlock } from "./doc/schema";

const FIGURES: MarketFigure[] = [
  { key: "home_value", label: "Median home value — Naples (34102)", value: "$1,250,000", source: "Zillow ZHVI", as_of: "06/01/2026" },
];

describe("FillRowDocSchema", () => {
  test("accepts content fields for a row's blocks", () => {
    const r = FillRowDocSchema.safeParse({ blocks: [{ kicker: "Naples", prose: "The market moved." }] });
    expect(r.success).toBe(true);
  });

  test("rejects an empty blocks array", () => {
    const r = FillRowDocSchema.safeParse({ blocks: [] });
    expect(r.success).toBe(false);
  });
});

describe("FILL_ROW_TOOL", () => {
  test("is a forced-tool definition named fill_row with cache_control", () => {
    expect(FILL_ROW_TOOL.name).toBe("fill_row");
    expect(FILL_ROW_TOOL.cache_control).toEqual({ type: "ephemeral" });
  });

  test("reuses AUTHORED_BLOCK_ITEM_SCHEMA verbatim for its blocks.items", () => {
    expect(FILL_ROW_TOOL.input_schema.properties.blocks.items.properties.prose).toBeDefined();
    expect(FILL_ROW_TOOL.input_schema.properties.blocks.items.properties.body).toBeDefined();
  });
});

describe("fillRowSystem", () => {
  test("carries only the figures referenced by this row's plan blocks", () => {
    const menu = buildFigureMenu(FIGURES);
    const out = fillRowSystem({
      row: { blocks: [{ type: "hero", span: 12, value_figure: "f0" }] },
      menu,
      neighborNote: "previous row: none. next row: footer.",
      recipe: undefined,
    });
    expect(out).toContain("Median home value");
    expect(out).toContain("$1,250,000");
    expect(out).toContain("previous row: none. next row: footer.");
  });
});

describe("neighborContext", () => {
  const plan: PlanDoc = {
    rows: [
      { blocks: [{ type: "hero", span: 12 }] },
      { blocks: [{ type: "text", span: 12 }] },
      { blocks: [{ type: "footer", span: 12 }] },
    ],
  };

  test("middle row names both neighbors", () => {
    expect(neighborContext(plan, 1)).toBe("previous row: hero. next row: footer.");
  });

  test("first row has no previous", () => {
    expect(neighborContext(plan, 0)).toBe("previous row: none (this is the opening row). next row: text.");
  });

  test("last row has no next", () => {
    expect(neighborContext(plan, 2)).toBe("previous row: text. next row: none (this is the closing row).");
  });
});

describe("mergeRows", () => {
  const plan: PlanDoc = {
    rows: [
      { band: "accent", pad: "airy", blocks: [{ type: "hero", span: 12, value_figure: "f0" }] },
      { blocks: [{ type: "footer", span: 12 }] },
    ],
    schedule_suggestion: { cadence: "weekly", reason: "recurring digest" },
  };

  test("merges plan structure with fill content, sets new_row at row boundaries", () => {
    const filled: Array<{ blocks: AuthoredBlock[] } | null> = [
      { blocks: [{ type: "ignored-by-merge", kicker: "Naples", prose: "The market moved." } as AuthoredBlock] },
      { blocks: [{ type: "ignored-by-merge" } as AuthoredBlock] },
    ];
    const doc = mergeRows(plan, filled);
    expect(doc.blocks).toHaveLength(2);
    expect(doc.blocks[0]).toMatchObject({
      type: "hero", // from PLAN, not FILL's "ignored-by-merge"
      span: 12,
      new_row: true,
      value_figure: "f0",
      band: "accent",
      pad: "airy",
      kicker: "Naples",
      prose: "The market moved.",
    });
    expect(doc.blocks[1]).toMatchObject({ type: "footer", new_row: true });
    expect(doc.schedule_suggestion).toEqual({ cadence: "weekly", reason: "recurring digest" });
  });

  test("a dropped row (null fill, after retry exhausted) is omitted, not blocked", () => {
    const filled: Array<{ blocks: AuthoredBlock[] } | null> = [
      null,
      { blocks: [{ type: "ignored" } as AuthoredBlock] },
    ];
    const doc = mergeRows(plan, filled);
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0].type).toBe("footer");
  });

  test("multi-block row: new_row true on the first block only, span carried per-block", () => {
    const twoBlockPlan: PlanDoc = {
      rows: [{ blocks: [{ type: "hero", span: 6 }, { type: "text", span: 6 }] }],
    };
    const filled: Array<{ blocks: AuthoredBlock[] } | null> = [
      { blocks: [{ type: "x", kicker: "A" } as AuthoredBlock, { type: "x", body: "B" } as AuthoredBlock] },
    ];
    const doc = mergeRows(twoBlockPlan, filled);
    expect(doc.blocks).toHaveLength(2);
    expect(doc.blocks[0]).toMatchObject({ type: "hero", span: 6, new_row: true, kicker: "A" });
    expect(doc.blocks[1]).toMatchObject({ type: "text", span: 6, new_row: false, body: "B" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/email/author-fill.test.ts`
Expected: FAIL — `./author-fill` does not exist yet.

- [ ] **Step 3: Implement `lib/email/author-fill.ts`**

```ts
// lib/email/author-fill.ts
//
// FILL phase (build 06 — grid plan+fill). One call per PLAN row, run in
// PARALLEL (Promise.all in build-doc.ts's authorContent): each call writes
// ONLY that row's content, against the row's ALREADY-FROZEN structure
// (type/span/band/pad/value_figure/image_role/asset — all decided by PLAN,
// author-plan.ts). This is the parallel-but-safe shape: what makes parallel
// agents dangerous (Anthropic's multi-agent engineering post) is each one
// independently deciding SHARED state; here the shared state is already
// frozen before fan-out, so nothing a fill call decides can conflict with
// another. See docs/superpowers/specs/2026-07-08-email-grid-plan-fill-design.md.
import { z } from "zod";
import { AuthoredBlockSchema, type AuthoredBlock, type AuthoredDoc } from "./doc/schema";
import { AUTHORED_BLOCK_ITEM_SCHEMA, renderFigureMenu, type MenuFigure } from "./author-doc";
import type { PlanDoc, PlanRow, PlanBlock } from "./author-plan";

export const FillRowDocSchema = z.object({
  blocks: z.array(AuthoredBlockSchema).min(1).max(3),
});

export const FILL_ROW_TOOL = {
  name: "fill_row",
  // Byte-identical on every fill call — cache it (mirrors AUTHOR_TOOL, author-doc.ts:120).
  // Every row-fill call in one build shares this exact prefix, so only the
  // first call pays full price; the rest read from cache.
  cache_control: { type: "ephemeral" },
  description:
    "Write the COPY for one row of a marketing email. The row's block types, " +
    "widths, and styling are ALREADY DECIDED — write ONLY the content fields " +
    "(kicker/prose/title/body/caption/alt/tagline/bio/button_label/columns/" +
    "items/stats). Do not set type, span, new_row, band, pad, value_figure, " +
    "image_role, or asset — those are ignored even if you set them.\n\n" +
    "THE ONE HARD RULE — you never write a number. Any number in prose must " +
    "appear verbatim in the DATA MENU below, digit-for-digit. If the menu " +
    "lacks a figure, write around it — never invent one.\n\n" +
    "Return exactly as many `blocks` entries as the row has, in the same order.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      blocks: {
        type: "array",
        description: "Content for this row's blocks, in order.",
        items: AUTHORED_BLOCK_ITEM_SCHEMA,
      },
    },
    required: ["blocks"],
  },
} as const;

/** Figures THIS row's plan blocks actually reference — a fill call never sees
 *  the whole menu, only what it might need to quote in prose. */
function figuresForRow(row: PlanRow, menu: MenuFigure[]): MenuFigure[] {
  const ids = new Set(row.blocks.map((b) => b.value_figure).filter((x): x is string => !!x));
  return menu.filter((m) => ids.has(m.id));
}

/** The FILL-phase system prompt for one row. */
export function fillRowSystem(opts: {
  row: PlanRow;
  menu: MenuFigure[];
  neighborNote: string;
  recipe?: string;
}): string {
  const rowMenu = figuresForRow(opts.row, opts.menu);
  const parts: string[] = [
    "You are the copywriter for one row of a SWFL Data Gulf marketing email by " +
      "calling the fill_row tool.",
    `THIS ROW'S BLOCKS (structure already fixed): ${opts.row.blocks
      .map((b: PlanBlock) => b.type)
      .join(", ")}.`,
    `DATA MENU — figures this row may quote verbatim in prose:\n${renderFigureMenu(rowMenu)}`,
    `CONTEXT — ${opts.neighborNote}`,
  ];
  if (opts.recipe) parts.push(opts.recipe);
  return parts.join("\n\n");
}

/** A short, free (no model call) neighbor-context string built from the
 *  PLAN's row TYPES only — enough for a fill call to write a transition that
 *  reads coherent, without creating a real dependency between rows. */
export function neighborContext(plan: PlanDoc, rowIndex: number): string {
  const typesOf = (row: PlanRow) => row.blocks.map((b) => b.type).join("/");
  const prev =
    rowIndex === 0 ? "none (this is the opening row)" : typesOf(plan.rows[rowIndex - 1]);
  const next =
    rowIndex === plan.rows.length - 1
      ? "none (this is the closing row)"
      : typesOf(plan.rows[rowIndex + 1]);
  return `previous row: ${prev}. next row: ${next}.`;
}

/** Merge PLAN's structure with each row's FILL content into one flat
 *  AuthoredDoc — the exact shape assembleAuthoredDoc already consumes. PLAN's
 *  structural fields are authoritative; a fill call's type/span/band/pad/
 *  value_figure/image_role/asset (if it emitted any) are ignored. A `null`
 *  entry (a row whose fill failed even after retry) is dropped — never
 *  blocks the build. */
export function mergeRows(
  plan: PlanDoc,
  filled: ReadonlyArray<{ blocks: AuthoredBlock[] } | null>,
): AuthoredDoc {
  const blocks: AuthoredBlock[] = [];
  plan.rows.forEach((row, rowIndex) => {
    const fill = filled[rowIndex];
    if (!fill) return; // dropped row — never blocks the rest of the build
    row.blocks.forEach((planBlock, blockIndex) => {
      const content = fill.blocks[blockIndex] ?? {};
      blocks.push({
        ...content,
        type: planBlock.type,
        span: planBlock.span,
        new_row: blockIndex === 0,
        value_figure: planBlock.value_figure,
        image_role: planBlock.image_role,
        asset: planBlock.asset,
        band: row.band,
        pad: row.pad,
      });
    });
  });
  return {
    blocks,
    ...(plan.schedule_suggestion ? { schedule_suggestion: plan.schedule_suggestion } : {}),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test lib/email/author-fill.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/email/author-fill.ts lib/email/author-fill.test.ts
git commit -m "feat(email): add FILL phase — per-row content tool, schema, and merge"
```

---

### Task 5: Wire PLAN+FILL into `build-doc.ts` with the fallback ladder

**Files:**
- Modify: `lib/email/build-doc.ts` (add functions beside `callAuthor`, lines
  654-689; change one line inside `authorDoc()`, currently line 933)

**Interfaces:**
- Consumes: `PLAN_TOOL`, `PlanDocSchema`, `planSystem`, `type PlanDoc` (from
  `./author-plan`); `FILL_ROW_TOOL`, `FillRowDocSchema`, `fillRowSystem`,
  `neighborContext`, `mergeRows` (from `./author-fill`); existing
  `callAuthor`, `AuthorDocSchema`, `type AuthoredDoc` (already imported)
- Produces: `authorContent(args: AuthorContentArgs): Promise<AuthoredDoc | null>`
  — `authorDoc()` (same file) is the only caller.

- [ ] **Step 1: Add the new imports**

In `lib/email/build-doc.ts`, beside the existing import of `author-doc.ts`
(around line 56-69), add:

```ts
import { PLAN_TOOL, PlanDocSchema, planSystem, type PlanDoc } from "@/lib/email/author-plan";
import {
  FILL_ROW_TOOL,
  FillRowDocSchema,
  fillRowSystem,
  neighborContext,
  mergeRows,
} from "@/lib/email/author-fill";
```

- [ ] **Step 2: Add `callPlan()` and `callFillRow()` beside `callAuthor()`**

Immediately after the existing `callAuthor` function (ends at
`build-doc.ts:689`), add:

```ts
const PLAN_MAX_TOKENS = 2048; // no prose fields — structure never approaches this

/** One forced-tool plan call → a validated PlanDoc, or null on a miss. Mirrors
 *  callAuthor's shape exactly (same failure logging, same null-on-miss contract). */
async function callPlan(model: string, system: string, user: string): Promise<PlanDoc | null> {
  try {
    const msg = await getAnthropic("email_build").messages.create({
      model,
      max_tokens: PLAN_MAX_TOKENS,
      system,
      tools: [PLAN_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: PLAN_TOOL.name },
      messages: [{ role: "user", content: user }],
    });
    const tool = msg.content.find((b) => b.type === "tool_use") as
      Anthropic.ToolUseBlock | undefined;
    if (!tool) {
      console.error("[email-lab/ai] callPlan: model returned no tool_use block");
      return null;
    }
    const parsed = PlanDocSchema.safeParse(tool.input);
    if (!parsed.success) {
      console.error("[email-lab/ai] callPlan: tool input failed PlanDocSchema:", parsed.error);
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.error("[email-lab/ai] callPlan: request failed:", err);
    return null;
  }
}

const FILL_MAX_TOKENS = 2048; // one row's content — well under any truncation risk

/** One forced-tool fill call for a single row → its blocks' content, or null
 *  on a miss (the caller retries once, then drops the row — never blocks). */
async function callFillRow(
  model: string,
  system: string,
  user: string,
): Promise<{ blocks: import("@/lib/email/doc/schema").AuthoredBlock[] } | null> {
  try {
    const msg = await getAnthropic("email_build").messages.create({
      model,
      max_tokens: FILL_MAX_TOKENS,
      system,
      tools: [FILL_ROW_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: FILL_ROW_TOOL.name },
      messages: [{ role: "user", content: user }],
    });
    const tool = msg.content.find((b) => b.type === "tool_use") as
      Anthropic.ToolUseBlock | undefined;
    if (!tool) {
      console.error("[email-lab/ai] callFillRow: model returned no tool_use block");
      return null;
    }
    const parsed = FillRowDocSchema.safeParse(tool.input);
    if (!parsed.success) {
      console.error("[email-lab/ai] callFillRow: tool input failed FillRowDocSchema:", parsed.error);
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.error("[email-lab/ai] callFillRow: request failed:", err);
    return null;
  }
}
```

- [ ] **Step 3: Add `authorContent()` — the orchestration with the fallback ladder**

Immediately after `callFillRow`, add:

```ts
export interface AuthorContentArgs {
  model: string;
  menu: MenuFigure[];
  vocabulary: string[];
  hasChart: boolean;
  hasPhoto: boolean;
  assetMenu: import("@/lib/email/author-doc").MenuAsset[];
  recipe?: string;
  baseUser: string;
  /** The existing full authorSystem(...) prompt — the fallback path when PLAN
   *  fails, byte-identical to today's single-shot behavior. */
  fallbackSystem: string;
}

/** PLAN → per-row FILL (parallel) → merge. Falls back to today's single-shot
 *  callAuthor on a PLAN miss — zero regression risk, today's path becomes the
 *  safety net rather than a deleted code path (spec, "Fallback ladder"). */
export async function authorContent(args: AuthorContentArgs): Promise<AuthoredDoc | null> {
  const { model, menu, vocabulary, hasChart, hasPhoto, assetMenu, recipe, baseUser, fallbackSystem } =
    args;
  const plan = await callPlan(
    model,
    planSystem({ menu, vocabulary, hasChart, hasPhoto, assetMenu, recipe }),
    baseUser,
  );
  if (!plan) {
    // PLAN failed to parse — fall back to the existing, untouched single-shot path.
    return callAuthor(model, fallbackSystem, baseUser);
  }

  const fillOnce = (rowIndex: number) =>
    callFillRow(
      model,
      fillRowSystem({ row: plan.rows[rowIndex], menu, neighborNote: neighborContext(plan, rowIndex), recipe }),
      baseUser,
    );

  const filled = await Promise.all(
    plan.rows.map(async (_row, rowIndex) => {
      const first = await fillOnce(rowIndex);
      if (first) return first;
      // Retry once; still failing → drop this row (never block the build).
      return fillOnce(rowIndex);
    }),
  );

  return mergeRows(plan, filled);
}
```

- [ ] **Step 4: Wire `authorContent()` into `authorDoc()`**

In `authorDoc()`, extract the inline vocabulary expression to a named local
(it's currently computed inline at the `authorSystem({...})` call site around
line 914-928) and pass the raw pieces through. Locate:

```ts
  const recipeId = detectRecipe(prompt);
  const assetMenu = buildAssetMenu(assets ?? []);
  const system = authorSystem({
    menu,
    dossier: lakeParts.dossier,
    // `metric-card` is DATA-SEEDED only (its held value is `metricValue`, sourced
    // from the ranked-candidate pool — see lib/email/zip-seed.ts). The author
    // writes `value_figure`, not `metricValue`, so an authored metric-card would
    // ship its placeholder number. Keep it out of the author's block vocabulary
    // (it reaches a doc only via the ZIP seed builder.
    vocabulary: Object.keys(DEFAULT_BLOCK_PROPS).filter((t) => t !== "metric-card"),
    hasChart: !!chartRes,
    chartGrounding: chartRes?.groundingNote,
    hasPhoto: !!photoRes,
    assetMenu,
    recipe: recipeId ? recipeSection(recipeId) : undefined,
  });
```

Replace with:

```ts
  const recipeId = detectRecipe(prompt);
  const assetMenu = buildAssetMenu(assets ?? []);
  const vocabulary = Object.keys(DEFAULT_BLOCK_PROPS).filter((t) => t !== "metric-card");
  const system = authorSystem({
    menu,
    dossier: lakeParts.dossier,
    vocabulary,
    hasChart: !!chartRes,
    chartGrounding: chartRes?.groundingNote,
    hasPhoto: !!photoRes,
    assetMenu,
    recipe: recipeId ? recipeSection(recipeId) : undefined,
  });
```

Then locate the single call site (currently `build-doc.ts:933`):

```ts
  const authored = await callAuthor(model, system, baseUser);
```

Replace with:

```ts
  const authored = await authorContent({
    model,
    menu,
    vocabulary,
    hasChart: !!chartRes,
    hasPhoto: !!photoRes,
    assetMenu,
    recipe: recipeId ? recipeSection(recipeId) : undefined,
    baseUser,
    fallbackSystem: system,
  });
```

Everything after this line (the `if (!authored)` miss check, `assemble`,
`firstParse`, the lint/voiceGuard repair loop) is untouched — `authorContent`
returns the same `AuthoredDoc | null` shape `callAuthor` always returned.

- [ ] **Step 5: Run the full email test suite**

Run: `bun test lib/email`
Expected: PASS — every existing test in `lib/email/*.test.ts` still passes
(no existing behavior changed; `authorContent`/`callPlan`/`callFillRow` are
new code paths with no unit tests per this codebase's established
network-call convention — see Global Constraints).

- [ ] **Step 6: Typecheck**

Run: `bunx next build`
Expected: compiles clean (per this repo's own convention — `feedback_verify-
with-next-build-not-npx-tsc.md` — never `npx tsc` alone).

- [ ] **Step 7: Commit**

```bash
git add lib/email/build-doc.ts
git commit -m "feat(email): wire PLAN+FILL into authorDoc, fallback to single-shot on a PLAN miss"
```

---

### Task 6: Close the loop — live-verify + session log

**Files:**
- Modify: `SESSION_LOG.md`
- Modify: `_AUDIT_AND_ROADMAP/build-queue.md` (if it tracks in-flight builds —
  check current contents first; add an entry only if the file's existing
  format has a slot for this)

**Interfaces:** none (bookkeeping only).

- [ ] **Step 1: Build one real email through the AUTHOR path in the running
  app (or the existing local script/route this repo uses to exercise
  `authorDoc` — check for one before assuming; if none exists, this step is
  the operator's manual live-verify against `/email-lab`) and confirm: (a) no
  truncation on a larger prompt that previously risked it, (b) band/pad reads
  consistent row to row, (c) the merged doc still passes
  `EmailDocSchema.safeParse`.**

- [ ] **Step 2: Close the live-verify check**

Run: `node scripts/check.mjs close email_grid_plan_fill_live_verify`

- [ ] **Step 3: Append a SESSION_LOG entry** (top of file, per RULE 0 —
  never rewrite past entries) summarizing what shipped, referencing this
  plan's commits.

- [ ] **Step 4: Push**

Run: `node scripts/safe-push.mjs` — per this repo's autonomy rules, ask the
operator for explicit confirmation before this step; do not push
automatically.

---

## Self-Review

**Spec coverage:** PLAN call (Task 3) ✓ · per-row FILL call, parallel via
`Promise.all` (Task 5 `authorContent`) ✓ · frozen style contract (band/pad set
only in `PlanRow`, `mergeRows` takes them from `row`, never from `fill`) ✓ ·
merge back into the unchanged `AuthoredDoc`/`assembleAuthoredDoc` shape
(Task 4 `mergeRows`, Task 5 wiring) ✓ · fallback ladder — PLAN miss → existing
`callAuthor` (Task 5 Step 3), one row's FILL miss → retry once then drop
(Task 5 Step 3 `fillOnce` + `mergeRows`'s null-row handling) ✓ · caching on
both new tools (Task 3, Task 4) ✓ · testing convention matches the existing
codebase (pure-only, `bun:test`, no invented mocking) ✓.

**Placeholder scan:** no TBD/TODO; every step has real code; Task 6 explicitly
says to check for an existing exercise script rather than assuming one, which
is a real instruction (check first), not a placeholder.

**Type consistency:** `AuthoredBlock` (doc/schema.ts) flows through
`mergeRows`'s `filled` param and `authorContent`'s `callFillRow` return type
consistently. `PlanDoc`/`PlanRow`/`PlanBlock` (author-plan.ts) are the same
names used in `author-fill.ts`'s imports and `build-doc.ts`'s
`authorContent`. `MenuFigure`/`MenuAsset` (author-doc.ts) are reused, never
redefined.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 1, Task 2 | `lib/email/author-doc.ts`, `lib/email/author-doc.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
