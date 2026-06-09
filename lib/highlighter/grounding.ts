import type { Dossier } from "../fetch-brain";
import type { BrainOutputMetric } from "../../refinery/types/brain-output.mts";
import type { MethodologyEntry } from "../../refinery/lib/methodology-registry.mts";

export interface GroundingBlock {
  /** Human label the model uses to attribute a number ("Naples housing", "Naples flood (env-swfl)"). */
  label: string;
  dossier: Dossier;
}

export interface GroundingInput {
  rules: string; // RULES_OF_ENGAGEMENT, verbatim
  gazetteer: string; // GEOGRAPHY_GAZETTEER, verbatim
  blocks: GroundingBlock[]; // [0] = current report; [1..] = reach targets
  /** Authored derivation for the highlighted metric, when its slug resolved to a
   *  registry entry. Injected so the model recites the real equation + held/need
   *  components instead of guessing (never-dead-end doctrine). */
  method?: MethodologyEntry | null;
}

/** Inline a dossier's detail_tables as compact rows so cross-area lookups are in-context (R0). */
function renderDetailTables(d: Dossier): string {
  if (!d.detail_tables || d.detail_tables.length === 0) return "";
  const out: string[] = [];
  for (const t of d.detail_tables) {
    out.push(`  Table "${t.title}" (grain: ${t.grain}; source: ${t.source.citation}):`);
    for (const r of t.rows) {
      const cells = Object.entries(r.cells)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      out.push(`    - ${r.key} (${r.label}): ${cells}`);
    }
  }
  return out.join("\n");
}

function renderKeyMetrics(d: Dossier): string {
  return d.key_metrics
    .map(
      (m: BrainOutputMetric) =>
        `  - ${m.metric}: ${m.value}${m.source?.citation ? ` [${m.source.citation}]` : ""}`,
    )
    .join("\n");
}

function renderBlock(b: GroundingBlock): string {
  const d = b.dossier;
  const parts = [
    `### ${b.label}`,
    `Conclusion: ${d.conclusion}`,
    `Key metrics:\n${renderKeyMetrics(d)}`,
  ];
  const tables = renderDetailTables(d);
  if (tables) parts.push(`Detail rows (every covered area — use these to compare):\n${tables}`);
  if (d.caveats.length) parts.push(`Caveats: ${d.caveats.join("; ")}`);
  if (d.grain_boundary) parts.push(`What we do NOT hold: ${JSON.stringify(d.grain_boundary)}`);
  return parts.join("\n");
}

/**
 * Render an authored methodology entry as a "use ONLY this, never guess" block.
 * The `components` list is the anti-invention allowlist: a `have` part is the
 * published figure (state it as HELD, never partial); a `need` part is offered
 * to find, never estimated.
 */
function renderMethod(m: MethodologyEntry): string {
  const have = (m.components ?? []).filter((c) => c.role === "have").map((c) => c.name);
  const need = (m.components ?? []).filter((c) => c.role === "need");
  const lines = [
    `How "${m.label}" works (authored — use ONLY this, never guess):`,
    `Means: ${m.measures}`,
    m.equation ? `Equation: ${m.equation}` : "",
    have.length
      ? `We HOLD: ${have.join(", ")} (this is the published figure — state it as held, never as partial).`
      : "",
    need.length
      ? `We do NOT hold: ${need
          .map((c) => `${c.name} (could come from ${c.candidateSource})`)
          .join("; ")}. Offer to find these; do not estimate them.`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Build the model's system prompt from N grounded dossier blocks.
 *
 * TRUST ASSUMPTION: every block is server-authored, pre-validated brain output —
 * NEVER user-authored text. Dossier strings are interpolated raw (no delimiter
 * escaping) on that basis. Do NOT pipe user input through a GroundingBlock, or
 * the never-invent guarantee breaks (prompt-injection surface).
 */
export function buildGroundingContext(input: GroundingInput): string {
  const primary = input.blocks[0];
  const token = primary?.dossier.freshness_token ?? "";
  return [
    "You are the SWFL Data Gulf in-page analyst. Answer from the grounded blocks below and the authored method block when present. Cite the block label for every number you state.",
    "NEVER say we don't have the data, can't find it, or don't know what's driving a number. Two shapes only:",
    "  (a) DERIVE IT — explain how the figure is built from what we hold; or",
    "  (b) OFFER TO FIND IT — say we can pull the missing piece, or that they can hand it to their own Claude. An offer, never a refusal.",
    "A published figure in a block is HELD — state it as held, never as partial or missing.",
    "NEVER invent or guess components, drivers, or breakdowns. If an authored method block is present, you may name ONLY the components it lists. If there is NO method block, give the held figure and offer to find finer detail — do NOT speculate about what the drivers might be. Never invent a SWFL number finer than a block provides.",
    "Tag any projection beyond the cited numbers inline with [INFERENCE] and give one falsifying condition.",
    `Quote this freshness token exactly once in your answer: ${token}`,
    "",
    input.method ? "=== METHOD ===\n" + renderMethod(input.method) + "\n" : "",
    "=== RULES OF ENGAGEMENT ===",
    input.rules,
    "",
    "=== GEOGRAPHY ===",
    input.gazetteer,
    "",
    "=== GROUNDED DATA ===",
    input.blocks.map(renderBlock).join("\n\n"),
  ]
    .filter((s) => s !== "")
    .join("\n");
}
