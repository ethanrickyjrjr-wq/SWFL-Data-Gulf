/**
 * lib/deliverable/build.ts — the assembly engine (Session 6, task-03).
 *
 * ONE forced-tool LLM call turns a project's filed items + an instruction into a
 * narrative-ONLY deliverable. The LLM never sees raw project internals and never
 * computes a number — it writes connective prose over numbered item snapshots
 * whose numbers it must quote verbatim. The narrative is then linted (the moat,
 * task-04): on any violation we regenerate once naming the violations, then
 * hard-strip the offending sentences. This is the structural guarantee — the
 * system prevents invention, not the model's good behavior.
 *
 * Vendor-First (verified in-session against the Anthropic contract): non-stream
 * `messages.create`, `tool_choice:{type:"tool",name}`, the tool's `input_schema`
 * shapes the output; `getAnthropic()` / `SYNTHESIS_MODEL` are the repo's shared
 * client + model (mirrors refinery/agents/synthesis-agent.mts exactly).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectItem } from "../project/items";
import type { Narrative, SnapshotItem, ResolvedChartItem, ChartBlock } from "./templates";
import { lintDeliverableNarrative, type NarrativeViolation } from "./narrative-lint";
import {
  getAnthropic,
  SYNTHESIS_MODEL,
  agentsAreMocked,
} from "../../refinery/agents/anthropic.mts";
import { RULES_OF_ENGAGEMENT } from "../../refinery/lib/rules-of-engagement.mts";

/** Env override for the assembly model; defaults to the repo's Sonnet synthesis model. */
const DELIVERABLE_MODEL = process.env.DELIVERABLE_MODEL || SYNTHESIS_MODEL;

// ---------------------------------------------------------------------------
// Freeze the snapshot — resolve chart refs so the deliverable never drifts
// ---------------------------------------------------------------------------

/**
 * Deep-copy the project's items and resolve every `{kind:"chart"}` ref into an
 * embedded `chart_block` by joining `saved_charts` (public-select). The result
 * is the frozen `items_snapshot` the deliverable renders from forever — it does
 * not re-fetch. A chart whose row is missing is dropped (it cannot render).
 */
export async function freezeSnapshot(
  db: SupabaseClient,
  items: ProjectItem[],
): Promise<SnapshotItem[]> {
  const chartIds = items
    .filter((i) => i.kind === "chart")
    .map((i) => (i as { chart_id: string }).chart_id);

  const blockById = new Map<string, { chart_block: ChartBlock; freshness_token: string | null }>();
  if (chartIds.length > 0) {
    const { data } = await db
      .from("saved_charts")
      .select("id, chart_block, freshness_token")
      .in("id", chartIds);
    for (const row of data ?? []) {
      blockById.set(row.id, {
        chart_block: row.chart_block as ChartBlock,
        freshness_token: row.freshness_token,
      });
    }
  }

  const out: SnapshotItem[] = [];
  for (const item of items) {
    if (item.kind === "chart") {
      const resolved = blockById.get(item.chart_id);
      if (!resolved) continue; // unresolvable chart — cannot render, drop it
      const ri: ResolvedChartItem = {
        kind: "chart",
        id: item.id,
        added_at: item.added_at,
        origin: item.origin,
        chart_id: item.chart_id,
        title: item.title,
        chart_block: resolved.chart_block,
        freshness_token: resolved.freshness_token ?? undefined,
      };
      out.push(ri);
    } else {
      // structuredClone keeps the snapshot a true deep copy (no shared refs)
      out.push(structuredClone(item));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Collect the anchor numbers + render items for the prompt
// ---------------------------------------------------------------------------

/** Every value-bearing string in the snapshot. The lint extracts + normalizes
 *  the numbers from these to build the anchor set the narrative must match. */
export function collectSnapshotNumbers(items: SnapshotItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    switch (item.kind) {
      case "metric":
        out.push(item.value, item.label);
        break;
      case "qa":
        out.push(item.answer);
        if (item.fact) out.push(item.fact);
        out.push(item.question);
        break;
      case "table_slice":
        for (const row of item.rows)
          for (const cell of row) if (cell != null) out.push(String(cell));
        break;
      case "chart":
        for (const row of item.chart_block.rows)
          for (const cell of row) if (cell != null) out.push(String(cell));
        break;
      case "note":
        out.push(item.text);
        break;
      // report / source / file carry no figures
    }
  }
  return out;
}

/** Citation suffix for an item — source + as-of only, never internal ids. */
function citation(item: SnapshotItem): string {
  const parts: string[] = [];
  if ("source_label" in item && item.source_label) parts.push(item.source_label);
  if ("source_url" in item && item.source_url) parts.push(item.source_url);
  if ("freshness_token" in item && item.freshness_token)
    parts.push(`as of ${item.freshness_token}`);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

/** Render one filed item as a numbered, customer-clean fact line for the prompt. */
function renderItem(item: SnapshotItem, n: number): string {
  switch (item.kind) {
    case "metric":
      return `[${n}] METRIC — ${item.label}: ${item.value}${citation(item)}`;
    case "qa":
      return `[${n}] ANSWER — Q: ${item.question} A: ${item.answer}${citation(item)}`;
    case "table_slice": {
      const head = item.columns.join(" | ");
      const body = item.rows
        .slice(0, 12)
        .map((r) => r.map((c) => (c == null ? "" : String(c))).join(" | "))
        .join("; ");
      return `[${n}] TABLE — ${item.title} [${head}]: ${body}${citation(item)}`;
    }
    case "chart": {
      const body = item.chart_block.rows
        .slice(0, 12)
        .map((r) => r.map((c) => (c == null ? "" : String(c))).join("="))
        .join("; ");
      return `[${n}] CHART — ${item.title}: ${body}${citation(item)}`;
    }
    case "source":
      return `[${n}] SOURCE — ${item.label}: ${item.url}`;
    case "report":
      return `[${n}] REPORT — ${item.title ?? item.slug}${citation(item)}`;
    case "note":
      return `[${n}] NOTE — ${item.text}`;
    case "file":
      return `[${n}] FILE — ${item.caption ?? item.storage_path}`;
  }
}

// ---------------------------------------------------------------------------
// The forced tool
// ---------------------------------------------------------------------------

const NARRATIVE_TOOL = {
  name: "record_deliverable_narrative",
  description:
    "Record the connective narrative for the deliverable: a lead exec summary, action-titled sections, and any inference notes.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      exec_summary: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { title: { type: "string" }, intro: { type: "string" } },
          required: ["title", "intro"],
        },
      },
      inference_notes: { type: "array", items: { type: "string" } },
    },
    required: ["exec_summary", "sections", "inference_notes"],
  },
};

function systemPrompt(): string {
  return `${RULES_OF_ENGAGEMENT}

You assemble a client-ready real-estate deliverable. You write ONLY connective narrative.
- The ONLY facts available are the numbered items in the user message. Never introduce a number, date, percentage, or place that is not present in them.
- Quote every number EXACTLY as it appears in the items — verbatim, with the same digits and units. Never round, approximate, or restate a figure in words ("about $30K" for "$30,074" is forbidden).
- Lead with the answer. Each section is ONE assertion, stated as its action title (e.g. "Rents are outrunning the county median", not "Rent data").
- Section intros and the exec summary are CITED FACTS only — no forecasts. Anything beyond the cited facts goes ONLY in inference_notes, each tagged "[INFERENCE]", naming the item it builds on, and ending with "falsifier: <a condition that would disprove it>".
- Plain English for a broker or investor. Never write the words master, brain, payload, grain, or dossier. No internal ids.`;
}

async function callModel(userContent: string): Promise<Narrative> {
  const client = getAnthropic();
  const response = await client.messages.create({
    model: DELIVERABLE_MODEL,
    max_tokens: 2048,
    system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
    tools: [NARRATIVE_TOOL],
    tool_choice: { type: "tool", name: NARRATIVE_TOOL.name },
    messages: [{ role: "user", content: userContent }],
  });
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Deliverable build: response contained no tool_use block");
  }
  const parsed = toolUse.input as Partial<Narrative>;
  return {
    exec_summary: typeof parsed.exec_summary === "string" ? parsed.exec_summary : "",
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    inference_notes: Array.isArray(parsed.inference_notes) ? parsed.inference_notes : [],
  };
}

/** Deterministic mock narrative for offline / no-key builds. Always lint-clean:
 *  it only ever emits values verbatim from the items, and no forecasts. */
function mockNarrative(items: SnapshotItem[]): Narrative {
  const metrics = items.filter((i) => i.kind === "metric") as Extract<
    SnapshotItem,
    { kind: "metric" }
  >[];
  const exec_summary = metrics[0]
    ? `${metrics[0].label} is ${metrics[0].value}.`
    : "This deliverable compiles the filed research for review.";
  const sections = (metrics.length ? metrics.slice(0, 3) : [null]).map((m) =>
    m
      ? { title: m.label, intro: `${m.label} is ${m.value}.` }
      : { title: "Filed research", intro: "" },
  );
  return { exec_summary, sections, inference_notes: [] };
}

function describeViolations(violations: NarrativeViolation[]): string {
  const numbers = [
    ...new Set(violations.filter((v) => v.gate === "number" && v.token).map((v) => v.token)),
  ];
  const grounded = violations.filter((v) => v.gate === "grounded").map((v) => v.sentence);
  const smoothing = [
    ...new Set(violations.filter((v) => v.gate === "smoothing" && v.token).map((v) => v.token)),
  ];
  const jargon = [
    ...new Set(violations.filter((v) => v.gate === "jargon" && v.token).map((v) => v.token)),
  ];
  const lines: string[] = [];
  if (numbers.length)
    lines.push(
      `- These numbers are NOT in any item — remove them or quote the exact item value instead: ${numbers.join(", ")}`,
    );
  if (grounded.length)
    lines.push(
      `- These are forecasts in fact prose — restate as a cited fact, or move to an inference_note with "falsifier: ...": ${grounded.map((s) => `"${s}"`).join("; ")}`,
    );
  if (smoothing.length)
    lines.push(`- Remove smoothing language and give the exact figure: ${smoothing.join(", ")}`);
  if (jargon.length) lines.push(`- Remove internal jargon: ${jargon.join(", ")}`);
  return lines.join("\n");
}

export interface BuildResult {
  narrative: Narrative;
  regenerations: number;
  stripped: boolean;
}

/**
 * Assemble the deliverable narrative for an instruction + frozen snapshot.
 * Forced-tool call → lint → (on violation) one regeneration naming the
 * violations → (still bad) hard-strip the offending sentences.
 */
export async function buildDeliverableNarrative(opts: {
  instruction: string;
  items: SnapshotItem[];
  template: string;
}): Promise<BuildResult> {
  const { instruction, items } = opts;
  const anchors = collectSnapshotNumbers(items);
  const itemBlock = items.map((it, i) => renderItem(it, i + 1)).join("\n");
  const baseUser = `Instruction: ${instruction || "Assemble a professional summary of the filed research."}

The numbered items are the ONLY facts you may use:
${itemBlock}`;

  if (agentsAreMocked()) {
    return { narrative: mockNarrative(items), regenerations: 0, stripped: false };
  }

  let narrative = await callModel(baseUser);
  let lint = lintDeliverableNarrative(narrative, anchors);
  let regenerations = 0;
  let stripped = false;

  if (!lint.ok) {
    regenerations = 1;
    const retryUser = `${baseUser}

Your previous draft had these problems — fix every one and re-emit via the tool:
${describeViolations(lint.violations)}`;
    narrative = await callModel(retryUser);
    lint = lintDeliverableNarrative(narrative, anchors);
    if (!lint.ok) {
      narrative = lint.stripped; // hard-strip offending sentences and proceed
      stripped = true;
    }
  }

  return { narrative, regenerations, stripped };
}
