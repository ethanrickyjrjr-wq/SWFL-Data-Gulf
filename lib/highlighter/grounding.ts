import type { Dossier } from "../fetch-brain";
import type { BrainOutputMetric } from "../../refinery/types/brain-output.mts";
import type { MethodologyEntry } from "../../refinery/lib/methodology-registry.mts";
import { freshnessDirective } from "@/lib/assistant/system-prompt";
import {
  cleanCitationForDisplay,
  sanitizeProse,
  scrubBrainSlugs,
  scrubCaveatTechnical,
  scrubVendorSystems,
  isDisplayableCaveat,
} from "@/refinery/render/speaker.mts";

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
  /** Title of a chart being rendered to the user RIGHT NOW (the caller built it
   *  before this prompt). When set, the CHARTS directive tells the model a chart is
   *  on screen and to describe it — NEVER "I can't chart that / outside this report's
   *  scope" (the live deflection bug). Absent → the no-chart guard (still no flat
   *  refusal, still no "go build it in Excel"). */
  chartShown?: string;
}

/** Inline a dossier's detail_tables as compact rows so cross-area lookups are in-context (R0). */
function renderDetailTables(d: Dossier): string {
  if (!d.detail_tables || d.detail_tables.length === 0) return "";
  const out: string[] = [];
  for (const t of d.detail_tables) {
    // Map column id → human label so cells read "Cap Rate=6.2%", never the raw
    // snake_case column id (e.g. `cap_rate_median`) — those are internal slugs
    // the customer must never see (CLEAN rule).
    const colLabel = new Map(t.columns.map((c) => [c.id, c.label]));
    out.push(
      `  Table "${t.title}" (grain: ${t.grain}; source: ${cleanCitationForDisplay(t.source.citation)}):`,
    );
    for (const r of t.rows) {
      const cells = Object.entries(r.cells)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${colLabel.get(k) ?? k}=${v}`)
        .join(", ");
      out.push(`    - ${r.key} (${r.label}): ${cells}`);
    }
  }
  return out.join("\n");
}

function renderKeyMetrics(d: Dossier): string {
  // Use the human label, NOT `m.metric` (the snake_case slug). Feeding the slug
  // is what made the chat recite "cap_rate_median, vacancy_rate_median, …" to a
  // customer. The grounding must carry only customer-clean names (CLEAN rule).
  return d.key_metrics
    .map(
      (m: BrainOutputMetric) =>
        `  - ${scrubCaveatTechnical(m.label || m.metric)}: ${m.value}${
          m.source?.citation ? ` [${cleanCitationForDisplay(m.source.citation)}]` : ""
        }`,
    )
    .join("\n");
}

/**
 * Mirror of the report header's DIRECTION_LABEL (app/r/[slug]/page.tsx). The
 * header badge renders DIRECTION_LABEL[direction]; we serialize the SAME string
 * so a click on the Direction/Mixed highlighter lands on context the chat brain
 * can read, with zero value drift between badge and grounding.
 */
const DIRECTION_LABEL: Record<Dossier["direction"], string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  mixed: "Mixed",
  neutral: "Neutral",
};

// Pack labels/conclusions/caveats are written for the Tier-1 "Reporter" audience
// (analyst prose is fine — e.g. permits-swfl's own instructions ask for a
// z-score read) but this text becomes the CONSUMER-facing chat's grounding —
// the Conversation tier, which CLEAN (no jargon) applies to. A prompt-only ban
// on these words lost 3 live tests running: the model recited "z-score" straight
// out of a metric label / conclusion sentence it was told to cite faithfully
// (RULE 1 CITE beats a "don't say this" instruction every time). Scrubbing the
// words out of the grounding text itself — not just asking the model not to say
// them — is the structural fix (see "structural guarantee, not AI virtue").
// Deliberately NOT touching pack `units`/label source fields: those still render
// correctly on /r/* report pages and tier-3 audit, where "z-score" is accurate
// and wanted.
const STATS_JARGON_RE = /\bz-?scores?\b|\bsigma\b|\bstandard deviations?\b/gi;

function scrubStatsJargon(text: string): string {
  return text.replace(STATS_JARGON_RE, "index reading");
}

export function renderBlock(b: GroundingBlock): string {
  const d = b.dossier;
  const parts = [
    `### ${b.label}`,
    `Conclusion: ${sanitizeProse(d.conclusion)}`,
    // Header synthesis badges (Strength / Confidence / Direction) — serialized in
    // the SAME human-facing shape the report header shows: page.tsx renders
    // `${magnitudePct}%`, `${confidencePct}%`, and DIRECTION_LABEL[direction],
    // where pct = Math.round(scalar * 100) (speaker.mts toDisplayBrain). Both the
    // badge and this block derive from the same `--- OUTPUT ---`, so matching the
    // transform keeps them identical. Without these, a click on the Strength /
    // Confidence / Mixed highlighter dead-ends as "not a metric I hold".
    `Direction: ${DIRECTION_LABEL[d.direction]}`,
    `Strength: ${Math.round(d.magnitude * 100)}%`,
    `Confidence: ${Math.round(d.confidence * 100)}%`,
    `Key metrics:\n${renderKeyMetrics(d)}`,
  ];
  const tables = renderDetailTables(d);
  if (tables) parts.push(`Detail rows (every covered area — use these to compare):\n${tables}`);
  // SAME caveat pipeline the report page + canned tier-2 reply already run
  // (refinery/render/speaker.mts renderTier2 / toDisplayBrain) — this live-chat
  // grounding path was the one surface that skipped it and fed d.caveats raw,
  // which is how machine-internal disclosure prose (pack-id leaks, QA notes,
  // "schema-required fallback" mechanics) reached the model verbatim for it to
  // recite back as an excuse. Structural fix, not a "please don't say X"
  // instruction: an unwanted caveat is dropped before the model ever sees it.
  const cleanCaveats = d.caveats
    .map((c) => scrubCaveatTechnical(sanitizeProse(c)))
    .filter(isDisplayableCaveat);
  if (cleanCaveats.length) parts.push(`Caveats: ${cleanCaveats.join("; ")}`);
  if (d.grain_boundary) parts.push(`What we do NOT hold: ${JSON.stringify(d.grain_boundary)}`);
  // Same doctrine as scrubStatsJargon, one leak class over: master's dossier prose
  // names its upstream brains by internal id, the prompt then tells the model to
  // "name the specific datasets we hold" — and the model complies with the only names
  // it has. `sanitizeProse` (above, on conclusion + caveats) maps every id it KNOWS;
  // this runs on the whole joined block, so a metric label or table title carrying a
  // slug is caught too, and an id with no map entry still never reaches the model.
  // Structural fix, not a "please don't say X" instruction: RULE 1 CITE beats a
  // prompt-level ban every time.
  //
  // `scrubVendorSystems` (speaker.mts — the shared root, so this layer and the
  // deterministic speak()/dossier surfaces can never disagree) runs HERE at block level,
  // not only inside `sanitizeProse`, because `renderDetailTables` above passes a table's
  // `title`, each row's `key`/`label`, and every cell through RAW — only the row's source
  // citation is cleaned. So a vendor name in a table title or a categorical cell reaches
  // the model untouched by any per-field scrub. The joined-block pass is the only thing
  // that covers those, which is exactly why the slug + stats scrubs already sit here.
  return scrubBrainSlugs(scrubVendorSystems(scrubStatsJargon(parts.join("\n"))));
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
  // CHARTS directive — the line that, when the report was commercial (cre-swfl) and the user
  // asked to "chart home values", produced "I can't chart that for you / outside this report's
  // scope". Two states: a chart IS being drawn (describe it, never refuse) vs. none available
  // (still never flatly refuse, still never punt to "build it in Excel").
  const chartsLine = input.chartShown
    ? `CHARTS — A chart is ON SCREEN right now, drawn from our live data; its real figures are in the "=== CHART ON SCREEN ===" block below. Describe what the chart shows — its trend and shape — citing ONLY the figures in that block (for an in-between value, say "see the chart"). NEVER say you cannot chart it, cannot visualize it, or that it is "outside this report's scope": it is already drawn. NEVER invent a number that is not in that block — a fabricated figure is worse than a refusal.`
    : `CHARTS — if asked to chart or visualize: NEVER tell the user to build it themselves (no "pull it into Excel / Sheets / Tableau / Python") and NEVER flatly refuse with "I can't chart that" or "that's outside this report's scope." Keep your answer about the numbers; the report shows a chart of its key data, and you can offer to pull a specific view we don't already show.`;
  // The chart's real figures, when one is drawn — the narrator cites these instead of
  // inventing home-value numbers it was never given.
  const chartBlock = input.chartShown
    ? `=== CHART ON SCREEN (cite ONLY these figures) ===\n${input.chartShown}`
    : "";
  // DIRECTION directive — twin of the CHARTS bug above, one level up: a pack caveat
  // disclosing that "direction" is an unmeasured schema fallback (e.g. cre-swfl v1
  // doesn't compute quarter-over-quarter trend) is written for an internal audit
  // trail, not a customer. Feeding it raw into Caveats (below) let the model recite
  // the mechanic back ("schema design", "cannot surface") as if that were an answer
  // — a deflection just like "I can't chart that", never a flat refusal.
  const directionLine =
    "DIRECTION/TREND — if a caveat says a direction or period-over-period trend is a " +
    "schema fallback, unmeasured, or 'v1 does not compute' it: NEVER explain that to the " +
    "user (no 'schema', 'framework', 'fallback label', or any internal-mechanics reasoning). " +
    "Just state the current levels you DO hold for that metric and skip the trend claim " +
    "entirely — never say you 'cannot surface' or 'don't have a read' on something.";
  return [
    "You are the SWFL Data Gulf in-page analyst. The user highlighted something on a live report and asked about it. Lead straight with the substance in plain prose — no 'I'll pull…', no setup sentence, and do NOT echo back what they highlighted (they can see it; skip 'That $22.29 you're looking at is…' openers). Keep it tight: a few sentences for a simple ask, a short paragraph or two at most. Don't define obvious words — if they highlighted 'rising', give the number and what's rising, not a definition of the word. Surface the key point and let the follow-up chips carry the rest.",
    "Three kinds of question; pick the lane and answer in it:",
    "  LANE 1 — about THIS report, our data, or our terms (a metric, the direction / strength / confidence, the freshness token, a term like NNN, 'what's driving this', 'how does this compare'): answer in our voice FROM the grounded blocks below, using your full reasoning to explain, compare and connect them. Define our terms plainly. This is grounded analysis WITH real AI help — never a canned line. Cite the block label for every figure you state.",
    "  LANE 2 — general knowledge or off-topic (a common-word definition, weather, another region, an ordinary answerable like a store's hours): just be a normal, helpful assistant and answer it directly. No lake framing, no offer-to-pull, no pitch.",
    "  LANE 3 — a SWFL data NUMBER finer than the blocks hold (a single-address loss, an unlisted ZIP, a breakdown we don't carry): do NOT invent it. Offer to find it — say we can pull it, or that they can hand the report to their own Claude. An offer, never a fabricated number.",
    "HARD FLOOR (absolute, overrides everything above): every SWFL data number you state must come from a block below. NEVER invent or guess a SWFL figure, component, driver, or breakdown finer than a block provides. A published figure in a block is HELD — state it as held, never as partial or missing. If an authored method block is present, name ONLY the components it lists.",
    "Never dead-end with 'I don't know' or 'not something I hold' for anything shown on this page — it is LANE 1 (grounded), LANE 2 (general), or LANE 3 (offer to find). Pick one; do not refuse.",
    "CLEAN — you are talking to a customer: NEVER output an internal field name, slug, snake_case identifier, brain/metric ID, or any 'the data is held in… / stored in…' phrasing. Use the plain-English label for every figure. No jargon (NNN = triple-net rent, never a place).",
    "FOCUS — answer about exactly what was highlighted. If it names a place (a county like Lee or Collier, a corridor, a town, a ZIP), speak to THAT place using its specific row in the data below — do not fall back to the SWFL-wide aggregate. Match the grain of the highlight.",
    "NATURAL — sound like a person, not a template. Don't mechanically repeat the same count or framing in every answer (not '27 corridors' every time — say 'across our corridors', or name the relevant ones). Vary it.",
    "BUILD — prior questions and answers from this session may be included in the question; build on them, don't repeat what you already said.",
    chartsLine,
    directionLine,
    "ABOUT SWFL DATA GULF — only if asked what the platform/system is (2-3 sentences, precise, never cheesy, never sector-locked): a data-analytics engine for Southwest Florida (Lee + Collier) spanning real estate, permits, the economy, and risk — not one sector. Every answer is grounded in verified local data, which keeps the AI honest and surfaces real patterns across the region. It compounds — the more it's used the sharper its read on SWFL gets, and the more YOU use it the better it works as your data-grounded sidekick: faster answers, simpler workflows, better calls on real deals.",
    "Tag any projection beyond the cited numbers inline with [INFERENCE] and give one falsifying condition.",
    // Rule 5: state the as-of DATE (MM/DD/YYYY), NEVER the raw freshness token. This is
    // the SAME directive the conversation path uses (system-prompt.ts freshnessDirective).
    // The report path historically ordered the model to "Quote this freshness token exactly
    // once: ${token}" — that is the raw-token leak (e.g. "SWFL-7421-v53-20260609") that kept
    // shipping because this path was never migrated and the proof harness never exercised it.
    freshnessDirective(token),
    "",
    input.method ? "=== METHOD ===\n" + renderMethod(input.method) + "\n" : "",
    "=== RULES OF ENGAGEMENT ===",
    input.rules,
    "",
    "=== GEOGRAPHY ===",
    input.gazetteer,
    "",
    chartBlock,
    "=== GROUNDED DATA ===",
    input.blocks.map(renderBlock).join("\n\n"),
  ]
    .filter((s) => s !== "")
    .join("\n");
}
