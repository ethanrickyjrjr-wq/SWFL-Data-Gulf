// composeChartFromRequest — Tier C of the chart engine: the user-DIRECTED custom
// chart. When someone says "chart median price for these 3 ZIPs", "plot vacancy vs
// asking rent", "graph permits by corridor", the canned producers can't honor the
// exact ask — this one can. The model SELECTS which held figures to plot and the
// shape; it NEVER writes a number.
//
// THE MOAT (structural, not trust — "select rows, never emit cells"):
//   The model is handed a DATA MENU where every chartable figure is a point with a
//   stable id, its REAL entity label, the metric it measures, and its REAL value
//   (all from the audited brain outputs). The model returns a list of point IDS +
//   a title + a shape — and NOTHING ELSE numeric. Our code reads each selected
//   point's (entity, value) straight from the menu and assembles the cells. Because
//   the number AND its label travel together from one source point, a value can
//   NEVER land under the wrong entity OR the wrong metric — mispairing (gross or
//   column-level) is impossible by construction, not caught after the fact. The
//   old "model emits cells, we verify them" design could plot a real Estero number
//   in the rent column; this design cannot express that.
//
// `lintChartBlock` stays as a cheap belt-and-suspenders (every plotted number is a
// held number — trivially true here) so a future regression in the assembler can't
// ship a fabricated cell.
//
// A number we DON'T hold is the live cited gap-fill (Increment B) — layered on top
// via `external_points`; until then a request we can't satisfy returns null and the
// caller falls back to the canned chart (or text-only). Never throws.
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, TRIAGE_MODEL } from "@/refinery/agents/anthropic.mts";
import { resolveReachTargets } from "@/lib/highlighter/reach";
import { fetchBrain } from "@/lib/fetch-brain";
import {
  lintChartBlock,
  type ChartBlock,
  type ChartValueFormat,
} from "@/refinery/validate/chart-block-lint.mts";
import { summarizeChartForGrounding } from "@/lib/build-chart-for-intent.mts";
import type {
  BrainOutput,
  BrainOutputMetricDisplayFormat,
} from "@/refinery/types/brain-output.mts";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import type { ChartForQuestion } from "@/lib/assistant/chart-for-question";

const MAX_TOKENS = 900;
const MAX_MENU_CHARS = 12_000; // bound the data menu so the LLM call stays cheap
const MAX_TABLE_ROWS = 40; // per detail_table, into the menu
const MAX_POINTS = 240; // hard cap on selectable points (menu size guard)
const MAX_BARS = 12; // cap rendered bars (mirrors computeMetricChart)

/** The user is explicitly asking us to build a chart (vs. an analytical question
 *  that may auto-chart). Only then do we pay for the compose LLM call. */
export function wantsCustomChart(question: string): boolean {
  return /\b(chart|plot|graph|visuali[sz]e|bar chart|line chart|pie chart|trend\s+line)\b/i.test(
    question || "",
  );
}

/** Map a source `display_format` to the chart renderer's numeric formatter
 *  (mirrors chart-from-metrics.valueFormatFor — kept local to avoid widening
 *  that module's export surface). */
function valueFormatFor(fmt: BrainOutputMetricDisplayFormat | undefined): ChartValueFormat {
  switch (fmt) {
    case "currency":
      return "usd";
    case "percent":
      return "percent";
    case "count":
      return "count";
    default:
      return "number";
  }
}

/** One selectable figure in the data menu. The number and its labels travel
 *  TOGETHER from a single audited source — the model only references it by id. */
export interface MenuPoint {
  id: string; // "p0", "p1", … — what the model selects
  entity: string; // category-axis label (corridor / ZIP / metric name)
  metric: string; // what the value measures (column / metric label)
  value: number;
  unit: string; // normalized units ("" when none)
  format: ChartValueFormat;
  brain: string; // source slug (for citation)
}

export interface Menu {
  points: MenuPoint[];
  byId: Map<string, MenuPoint>;
  numbers: Set<number>; // every held value (belt-and-suspenders lint anchor)
  asOf: string; // newest brain refined_at (ISO YYYY-MM-DD)
  citation: string;
}

/** Collect a compact, bounded data menu of selectable points from the brains most
 *  relevant to the question (master + reach targets). Every numeric key_metric and
 *  every numeric detail_table cell becomes one point. */
async function buildMenu(question: string, origin: string): Promise<Menu | null> {
  const slugs = ["master", ...resolveReachTargets(question, "master")].filter(
    (s, i, a) => a.indexOf(s) === i,
  );
  const points: MenuPoint[] = [];
  const numbers = new Set<number>();
  const brains: string[] = [];
  let asOf = "";
  let pid = 0;

  for (const slug of slugs) {
    if (points.length >= MAX_POINTS) break;
    let output: BrainOutput;
    try {
      ({ output } = await fetchBrain(slug, { tier: 2, origin }));
    } catch {
      continue;
    }
    if (output.refined_at && output.refined_at.slice(0, 10) > asOf)
      asOf = output.refined_at.slice(0, 10);

    let added = 0;

    for (const m of output.key_metrics) {
      if (typeof m.value !== "number") continue;
      if (points.length >= MAX_POINTS) break;
      points.push({
        id: `p${pid++}`,
        entity: m.label,
        metric: m.label,
        value: m.value,
        unit: (m.units ?? "").trim().toLowerCase(),
        format: valueFormatFor(m.display_format),
        brain: slug,
      });
      numbers.add(m.value);
      added++;
    }

    for (const t of output.detail_tables ?? []) {
      for (const col of t.columns) {
        for (const r of t.rows.slice(0, MAX_TABLE_ROWS)) {
          const v = r.cells[col.id];
          if (typeof v !== "number") continue;
          if (points.length >= MAX_POINTS) break;
          points.push({
            id: `p${pid++}`,
            entity: r.label || r.key,
            metric: col.label,
            value: v,
            unit: (col.units ?? "").trim().toLowerCase(),
            format: valueFormatFor(col.display_format),
            brain: slug,
          });
          numbers.add(v);
          added++;
        }
      }
    }

    if (added > 0) brains.push(slug);
  }

  if (points.length === 0) return null; // nothing to chart honestly
  const byId = new Map(points.map((p) => [p.id, p]));
  return {
    points,
    byId,
    numbers,
    asOf: asOf || new Date(0).toISOString().slice(0, 10),
    citation: `SWFL Data Gulf — ${brains.join(", ")}`,
  };
}

/** Render the menu as compact text the model selects from (grouped by brain). */
function renderMenu(menu: Menu): string {
  const byBrain = new Map<string, MenuPoint[]>();
  for (const p of menu.points) {
    const g = byBrain.get(p.brain);
    if (g) g.push(p);
    else byBrain.set(p.brain, [p]);
  }
  const blocks: string[] = [];
  for (const [brain, pts] of byBrain) {
    const lines = pts.map((p) => {
      const metricSuffix = p.metric && p.metric !== p.entity ? ` — ${p.metric}` : "";
      const unit = p.unit ? ` ${p.unit}` : "";
      return `  [${p.id}] ${p.entity}${metricSuffix}: ${p.value}${unit}`;
    });
    blocks.push(`BRAIN ${brain}:\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n").slice(0, MAX_MENU_CHARS);
}

// The forced tool. The model SELECTS point ids — it never writes a number.
const RECORD_CHART_TOOL = {
  name: "build_chart",
  description:
    "Build the chart the user asked for by SELECTING points from the DATA MENU. " +
    "You choose WHICH figures to plot (by their [pN] id) and the shape — you NEVER " +
    "write a number yourself; every value comes from the point you selected. Prefer " +
    "points that share one metric/unit for a clean comparison (e.g. all the vacancy " +
    "points across corridors). If the menu has nothing that answers the request, " +
    "return an empty point_ids array.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", description: "Short, plain chart title (no internal ids/jargon)." },
      category_label: {
        type: "string",
        description: "Header for the label column, e.g. 'Corridor', 'ZIP', 'Area'.",
      },
      point_ids: {
        type: "array",
        items: { type: "string" },
        description: "Ordered list of [pN] ids from the DATA MENU to plot.",
      },
      chart_type: {
        type: "string",
        enum: ["bar", "table"],
        description: "bar renders a chart; table renders a labeled table.",
      },
    },
    required: ["title", "category_label", "point_ids", "chart_type"],
  },
} as const;

interface BuildChartInput {
  title: string;
  category_label: string;
  point_ids: string[];
  chart_type: "bar" | "table";
}

/** Pure assembler: resolve the model's selected ids against the menu and build a
 *  ChartBlock whose every cell is a REAL (entity, value) pair copied verbatim from
 *  a source point. Returns null when no valid point was selected. Exported for unit
 *  testing — this is where the structural moat lives, so it is tested directly. */
export function buildHeldChartBlock(input: BuildChartInput, menu: Menu): ChartBlock | null {
  const seen = new Set<string>();
  const picked: MenuPoint[] = [];
  for (const id of Array.isArray(input.point_ids) ? input.point_ids : []) {
    const p = menu.byId.get(id);
    if (p && !seen.has(id)) {
      seen.add(id);
      picked.push(p);
    }
    if (picked.length >= MAX_BARS) break;
  }
  if (picked.length < 1) return null;

  // Series coherence: a single shared metric → clean single-series axis; mixed
  // metrics → label each bar by entity+metric and use a neutral numeric axis (we
  // never claim one $/% format across heterogeneous figures).
  const metrics = new Set(picked.map((p) => p.metric));
  const singleMetric = metrics.size === 1;

  let valueHeader: string;
  let valueFormat: ChartValueFormat;
  let rows: ChartBlock["rows"];
  if (singleMetric) {
    const m = picked[0];
    valueHeader = m.unit ? `${m.metric} (${m.unit})` : m.metric;
    valueFormat = m.format;
    rows = picked.map((p): [string, number] => [p.entity, p.value]);
  } else {
    valueHeader = "Value";
    valueFormat = "number";
    rows = picked.map((p): [string, number] => [
      p.entity === p.metric ? p.entity : `${p.entity} — ${p.metric}`,
      p.value,
    ]);
  }

  const block: ChartBlock = {
    title: typeof input.title === "string" && input.title ? input.title : "Chart",
    columns: [
      typeof input.category_label === "string" && input.category_label
        ? input.category_label
        : "Item",
      valueHeader,
    ],
    rows,
    chart_type: input.chart_type === "table" ? "table" : "bar",
    value_format: valueFormat,
    asOf: menu.asOf,
    source: { citation: menu.citation },
  };
  return block;
}

export async function composeChartFromRequest(
  question: string,
  origin: string,
): Promise<ChartForQuestion | null> {
  if (!wantsCustomChart(question)) return null;

  let menu: Menu | null;
  try {
    menu = await buildMenu(question, origin);
  } catch {
    return null;
  }
  if (!menu) return null;

  let input: BuildChartInput | null = null;
  try {
    const client = getAnthropic();
    const msg = await client.messages.create({
      model: TRIAGE_MODEL,
      max_tokens: MAX_TOKENS,
      tools: [RECORD_CHART_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "build_chart" },
      messages: [
        {
          role: "user",
          content:
            `The user asked: "${question}"\n\n` +
            `Build the chart they asked for by selecting point ids from this DATA MENU. ` +
            `Never write a number — only select [pN] ids. If the menu can't answer the ` +
            `request, return an empty point_ids array.\n\n=== DATA MENU ===\n${renderMenu(menu)}`,
        },
      ],
    });
    const tool = msg.content.find((b) => b.type === "tool_use") as
      | Anthropic.ToolUseBlock
      | undefined;
    const raw = (tool?.input ?? {}) as Record<string, unknown>;
    input = {
      title: typeof raw.title === "string" ? raw.title : "Chart",
      category_label: typeof raw.category_label === "string" ? raw.category_label : "Item",
      point_ids: Array.isArray(raw.point_ids) ? (raw.point_ids as string[]) : [],
      chart_type: raw.chart_type === "table" ? "table" : "bar",
    };
  } catch {
    return null;
  }

  const block = buildHeldChartBlock(input, menu);
  if (!block) return null; // model declined / no valid selection → fall back to canned

  // BELT-AND-SUSPENDERS: every plotted number must trace to a held figure. This is
  // trivially true (the assembler copies values straight from menu points), but it
  // guards against any future regression in the assembler shipping a fabricated cell.
  if (!lintChartBlock(block, menu.numbers).ok) return null;

  const chart: ChartSpec = { ...block, frameId: "bar-table" };
  return { chart, groundingNote: summarizeChartForGrounding(chart) };
}
