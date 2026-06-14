# Shared contract — `ProjectItem` (the spine)

Every session that touches projects depends on this exact shape. It is created once in **Session 1** (`lib/project/items.ts`), zod-validated, unit-tested, and never re-declared elsewhere — import it.

**Invariant:** every item is a **snapshot pinned at save time**. The value, citation, and (where available) `freshness_token` are copied in at the moment of filing and are **never re-fetched**. A deliverable assembled weeks later shows exactly what the user saw when they filed it. **Fixture-backed items** (charts, metrics sourced from fixtures) carry an as-of date from the fixture's own date field — that is the only required honesty mechanism; no `freshness_token` is required. `freshness_token` is present on items from live brain sources (`qa`, `metric`, `report`, `table_slice` filed from `/r/` pages). v1 surfaces the as-of **date** plainly as a citation line under each exhibit; live-refresh-before-print and cadence-aware staleness badges are a deferred higher-tier feature (operator, 2026-06-10), not built.

```ts
// lib/project/items.ts
export type ProjectItem = { id: string; added_at: string; origin: "web" | "mcp" } & (
  | { kind: "qa"; report_id: string; question: string; answer: string;
      fact?: string; selection_type?: string; reach?: string[]; freshness_token?: string }
  | { kind: "chart"; chart_id: string; title: string }            // ref → saved_charts (block lives there, already linted)
  | { kind: "metric"; report_id: string; label: string; value: string;
      source_url?: string; source_label?: string; freshness_token: string }
  | { kind: "source"; table: string; url: string; label: string }
  | { kind: "note"; text: string }
  | { kind: "report"; slug: string; title?: string; freshness_token?: string }
  | { kind: "file"; storage_path: string; mime: string; size: number; caption?: string }
  | { kind: "table_slice"; report_id: string; title: string; columns: string[];
      rows: (string | number | null)[][]; source_url?: string; freshness_token: string }
)
```

## Storage

- **Anonymous draft:** the same union in `localStorage` under key `swfl_project_draft_v1`. ~50-item cap with a quota warning. Precedent for the write-through pattern: `swfl_ai_dock_geom` (`components/highlighter/AskAiDock.tsx:14,29-39,98-104` — verified).
- **Logged-in:** `public.projects.items jsonb DEFAULT '[]'` (Session 4). Shapes are identical, so login migration via `POST /api/projects/import` is a straight insert (no transform).

## Zod

`lib/project/items.ts` also exports `projectItemSchema` (a `z.discriminatedUnion("kind", [...])` wrapped with the common `{id, added_at, origin}` fields) and `projectItemsSchema = z.array(projectItemSchema)`. Every write path validates with it:
- `PATCH /api/projects/[id]` (Session 4)
- the MCP `swfl_project_add` tool's `item` arg (Session 9) — note the MCP tool restricts the union to `note | metric | qa | report | chart_block` (chart_block is converted to a `chart` ref server-side after lint+insert).

## Cross-session field provenance

| field | filled by | from |
|---|---|---|
| `qa.report_id`, `question`, `answer`, `reach`, `freshness_token` | S1 "File this answer" | the live thread entry + page `freshnessToken` |
| `metric.source_url`, `source_label` | S1 "File this figure" | **`[AUDIT-FIX C-meta]`** the `metricSuggestions` projection at `app/r/[slug]/page.tsx:262` does **not** carry these today — S1 must widen that projection to forward `sourceUrl`/`sourceLabel` from `DisplayMetric` (they exist on the full metric, lines ~224-225) |
| `chart.chart_id` | S3 "File this chart" | the `saved_charts` row id returned by `POST /api/charts/save` |
| `file.storage_path` | S8 upload | `{user_id}/{project_id}/{uuid}.{ext}` in the `project-uploads` bucket |
