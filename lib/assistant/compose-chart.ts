// composeChartFromRequest — Tier C of the chart engine: the user-DIRECTED custom
// chart. When someone says "chart median price for these 3 ZIPs", "plot vacancy vs
// asking rent", "graph permits by month", the canned producers can't honor the
// exact ask — this one can. An LLM SELECTS which numbers to plot and the shape;
// it NEVER supplies a number.
//
// THE MOAT (structural, not trust): the model may only chart figures that already
// exist in the grounding dossiers' "data menu". Every numeric cell it returns is
// run through `lintChartBlock(block, numberSet)` with provenance ON — any cell that
// doesn't anchor (within 5% / 0.05) to a real held figure REJECTS the whole block
// → null. So "chart whatever you want" works for everything we hold, and a number
// we don't hold can't be faked here (that's the live cited gap-fill, a later pass).
//
// Never throws — a failed compose returns null and the caller falls back to the
// canned chart (or text-only).
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, TRIAGE_MODEL } from "@/refinery/agents/anthropic.mts";
import { resolveReachTargets } from "@/lib/highlighter/reach";
import { fetchBrain } from "@/lib/fetch-brain";
import { lintChartBlock, type ChartBlock } from "@/refinery/validate/chart-block-lint.mts";
import { summarizeChartForGrounding } from "@/lib/build-chart-for-intent.mts";
import type { BrainOutput } from "@/refinery/types/brain-output.mts";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import type { ChartForQuestion } from "@/lib/assistant/chart-for-question";

const MAX_TOKENS = 900;
const MAX_MENU_CHARS = 12_000; // bound the data menu so the LLM call stays cheap
const MAX_TABLE_ROWS = 40; // per detail_table, into the menu

/** The user is explicitly asking us to build a chart (vs. an analytical question
 *  that may auto-chart). Only then do we pay for the compose LLM call. */
export function wantsCustomChart(question: string): boolean {
  return /\b(chart|plot|graph|visuali[sz]e|bar chart|line chart|pie chart|trend\s+line)\b/i.test(
    question || "",
  );
}

// The forced tool. The model fills a ChartBlock; our code provenance-gates it.
const RECORD_CHART_TOOL = {
  name: "record_chart_block",
  description:
    "Record the chart the user asked for, built ONLY from numbers present in the DATA MENU. " +
    "Labels (column headers, row labels) are free text; every NUMERIC cell MUST be a value copied " +
    "from the menu — never compute, round, average, or invent a number. If the menu cannot answer " +
    "the request, return an empty rows array.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", description: "Short, plain chart title (no internal ids/jargon)." },
      columns: {
        type: "array",
        items: { type: "string" },
        description:
          "Column headers. columns[0] = the category/label column; columns[1..] numeric.",
      },
      rows: {
        type: "array",
        items: { type: "array", items: { type: ["string", "number", "null"] } },
        description:
          "Each row.length === columns.length. row[0] = label (string), rest = menu numbers.",
      },
      chart_type: {
        type: "string",
        enum: ["bar", "table"],
        description: "bar renders a chart; table renders a labeled table.",
      },
      value_format: {
        type: "string",
        enum: ["currency", "usd", "percent", "count", "number"],
        description: "How to format the numeric column.",
      },
    },
    required: ["title", "columns", "rows", "chart_type", "value_format"],
  },
} as const;

interface Menu {
  text: string;
  numbers: Set<number>;
  /** Every (entity-label, numeric-value) pair that legitimately exists in the source
   *  rows. Used to verify the LLM didn't just plot a real number under the WRONG label
   *  — the provenance-number check alone can't catch a misattribution. */
  pairs: Array<{ label: string; value: number }>;
  asOf: string; // newest brain refined_at (ISO YYYY-MM-DD)
  citation: string;
}

/** Normalize a label for tolerant matching ("Estero / Bonita line" ~ "estero"). */
function normLabel(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Collect a compact, bounded data menu + the anchor number set from the brains
 *  most relevant to the question (master + reach targets). */
async function buildMenu(question: string, origin: string): Promise<Menu | null> {
  const slugs = ["master", ...resolveReachTargets(question, "master")].filter(
    (s, i, a) => a.indexOf(s) === i,
  );
  const numbers = new Set<number>();
  const pairs: Array<{ label: string; value: number }> = [];
  const brains: string[] = [];
  const labels: string[] = [];
  let asOf = "";

  for (const slug of slugs) {
    let output: BrainOutput;
    try {
      ({ output } = await fetchBrain(slug, { tier: 2, origin }));
    } catch {
      continue;
    }
    if (output.refined_at && output.refined_at.slice(0, 10) > asOf)
      asOf = output.refined_at.slice(0, 10);

    const metricLines: string[] = [];
    for (const m of output.key_metrics) {
      if (typeof m.value === "number") {
        numbers.add(m.value);
        pairs.push({ label: m.label, value: m.value });
        metricLines.push(`  - ${m.label}: ${m.value}${m.units ? ` ${m.units}` : ""}`);
      }
    }

    const tableLines: string[] = [];
    for (const t of output.detail_tables ?? []) {
      const cols = t.columns.map((c) => c.label).join(" | ");
      tableLines.push(`  TABLE "${t.grain}" [${cols}]:`);
      for (const r of t.rows.slice(0, MAX_TABLE_ROWS)) {
        const rowLabel = r.label || r.key;
        const cells = t.columns.map((c) => {
          const v = r.cells[c.id];
          if (typeof v === "number") {
            numbers.add(v);
            pairs.push({ label: rowLabel, value: v });
          }
          return `${c.label}=${v ?? ""}`;
        });
        tableLines.push(`    ${rowLabel}: ${cells.join(", ")}`);
      }
    }

    if (metricLines.length || tableLines.length) {
      labels.push(`BRAIN ${slug}:\n${[...metricLines, ...tableLines].join("\n")}`);
      brains.push(slug);
    }
  }

  if (numbers.size === 0) return null; // nothing to chart honestly
  const text = labels.join("\n\n").slice(0, MAX_MENU_CHARS);
  return {
    text,
    numbers,
    pairs,
    asOf: asOf || new Date(0).toISOString().slice(0, 10),
    citation: `SWFL Data Gulf — ${brains.join(", ")}`,
  };
}

/** Every numeric cell in the block must trace to a real (entity-label, value) pair in
 *  the source — not merely to SOME held number. Catches the LLM plotting a real figure
 *  under the wrong label. row[0] is the entity label; row[1..] are its numbers. A label
 *  with no source match, or a value that doesn't anchor to that label's real numbers,
 *  fails the whole block (→ caller falls back to the deterministic canned chart). */
export function pairsAreFaithful(
  block: Pick<ChartBlock, "rows">,
  pairs: Array<{ label: string; value: number }>,
): boolean {
  const byLabel = new Map<string, number[]>();
  for (const p of pairs) {
    const k = normLabel(p.label);
    const arr = byLabel.get(k);
    if (arr) arr.push(p.value);
    else byLabel.set(k, [p.value]);
  }
  const anchored = (value: number, anchors: number[]): boolean =>
    anchors.some((a) =>
      a === 0
        ? Math.abs(value) <= 0.05
        : Math.abs((value - a) / a) <= 0.05 || Math.abs(value - a) <= 0.05,
    );

  for (const row of block.rows) {
    const label = typeof row[0] === "string" ? normLabel(row[0]) : "";
    // The label must match a real source entity (tolerant: either contains the other).
    const allowed: number[] = [];
    let matched = false;
    for (const [k, vals] of byLabel) {
      if (k && label && (k.includes(label) || label.includes(k))) {
        allowed.push(...vals);
        matched = true;
      }
    }
    if (!matched) return false; // unknown label — can't verify attribution → reject
    for (let i = 1; i < row.length; i++) {
      const cell = row[i];
      if (typeof cell === "number" && !anchored(cell, allowed)) return false;
    }
  }
  return true;
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

  let input: Record<string, unknown> = {};
  try {
    const client = getAnthropic();
    const msg = await client.messages.create({
      model: TRIAGE_MODEL,
      max_tokens: MAX_TOKENS,
      tools: [RECORD_CHART_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "record_chart_block" },
      messages: [
        {
          role: "user",
          content:
            `The user asked: "${question}"\n\n` +
            `Build the chart they asked for, using ONLY numbers from this DATA MENU. ` +
            `Copy numbers verbatim — never compute, round, average, or invent. If the menu can't ` +
            `answer the request, return an empty rows array.\n\n=== DATA MENU ===\n${menu.text}`,
        },
      ],
    });
    const block = msg.content.find((b) => b.type === "tool_use") as
      | Anthropic.ToolUseBlock
      | undefined;
    input = (block?.input ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }

  // Assemble the candidate block (our asOf + citation, never the model's).
  const block: ChartBlock = {
    title: typeof input.title === "string" && input.title ? input.title : "Chart",
    columns: Array.isArray(input.columns) ? (input.columns as string[]) : [],
    rows: Array.isArray(input.rows) ? (input.rows as ChartBlock["rows"]) : [],
    chart_type: input.chart_type === "table" ? "table" : "bar",
    value_format:
      typeof input.value_format === "string"
        ? (input.value_format as ChartBlock["value_format"])
        : "number",
    asOf: menu.asOf,
    source: { citation: menu.citation },
  };

  if (block.rows.length < 1) return null; // model declined — fall back to canned

  // THE MOAT GATE — two layers:
  //  1. provenance: every numeric cell anchors to a held figure (lintChartBlock).
  //  2. attribution: every cell traces to a real (label, value) PAIR — so a real
  //     number can't be plotted under the wrong entity. Either failure → reject
  //     (the caller falls back to the deterministic canned chart, which can't mispair).
  if (!lintChartBlock(block, menu.numbers).ok) return null;
  if (!pairsAreFaithful(block, menu.pairs)) return null;

  const chart: ChartSpec = { ...block, frameId: "bar-table" };
  return { chart, groundingNote: summarizeChartForGrounding(chart) };
}
