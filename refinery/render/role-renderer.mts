/**
 * Stage 5 — Role Renderer.
 *
 * Pure function that takes a canonical BrainOutput (the thin-pipe JSON
 * produced by Stage 4) plus a RoleContext and emits a role-targeted
 * markdown brief. Same numbers, same conclusion, different framing —
 * this is the Mouth/Mind boundary in code.
 *
 * INVARIANTS (the Math-Honest rails for narrative rendering):
 *
 *   1. Numbers are quoted VERBATIM from `output.key_metrics[i].value`.
 *      No rounding for readability. No "approximately." Display formatting
 *      (e.g., 0.4324 → "43.24%") is permitted; semantic compression is not.
 *   2. `conclusion` is rendered verbatim. The renderer does not reword,
 *      summarize, or interpret it.
 *   3. `caveats` are mandatory above the conclusion when non-empty.
 *      Skipping them is the failure mode that destroys "we have receipts."
 *   4. Every metric inline-cites `source.url` + `source.citation` when
 *      provenance is present (P2 coverage is 100% on current brains).
 *   5. Freshness + version + trust_tier are surfaced in the footer so the
 *      receipt chain (narrative → token → canonical OUTPUT → provenance)
 *      is complete.
 *
 * Role lenses select which metrics lead. They do NOT hide metrics —
 * non-lead metrics are still rendered, just lower in the briefing. A CPA
 * tabulates EVERY metric with its trust tier; a CRE broker leads with
 * cre_* / env_* / macro_rate*; a franchise consultant leads with
 * franchise_* / sector_*. The operator view is DAG-order flat.
 *
 * No LLM in the data path. No Sanity/Notion/GoRules dependencies. Pure
 * markdown emission from a typed object.
 */

import type { BrainOutput, BrainOutputMetric } from "../types/brain-output.mts";

export type RoleId = "operator" | "cre-broker" | "franchise-consultant" | "cpa";

export interface RoleContext {
  role: RoleId;
  /**
   * Optional override of the role's default focus metric prefixes. When
   * provided, lead metrics are selected by `metric.startsWith(prefix)`
   * for any prefix in this array (any-match). When absent AND no
   * `category_lookup` resolves the slug, defaults from `ROLE_DEFAULT_FOCUS`
   * apply.
   */
  focus_metric_prefixes?: string[];
  /**
   * Optional SKOS-aware category resolver. When supplied, lead-metric
   * selection prefers `category_lookup(metric.metric) ∈ role's focus
   * categories` over prefix matching. CLI wrappers wire this from
   * `brain-vocabulary.json`'s slug_index → concept.category. Renderer
   * stays pure: caller owns vocab I/O.
   */
  category_lookup?: (slug: string) => string | null;
}

/**
 * Default metric-slug prefixes each role leads with. Fallback used only
 * when `category_lookup` is absent or returns null for a slug. The SKOS
 * categories below (in ROLE_DEFAULT_CATEGORIES) are the preferred axis.
 */
const ROLE_DEFAULT_FOCUS: Record<RoleId, string[]> = {
  operator: [],
  "cre-broker": ["cre_", "env_", "macro_rate", "macro_inflation"],
  "franchise-consultant": ["franchise_", "sector_", "overall_survival"],
  cpa: [],
};

/**
 * SKOS categories each role considers lead-relevant. Mirrors the
 * `category` field on each concept in refinery/vocab/brain-vocabulary.json.
 * A metric whose concept's category appears here is promoted to the lead
 * section; everything else falls to "Additional context".
 */
const ROLE_DEFAULT_CATEGORIES: Record<RoleId, string[]> = {
  operator: [],
  "cre-broker": ["real-estate", "environmental", "macro"],
  "franchise-consultant": ["credit-risk", "qualitative"],
  cpa: [],
};

const ROLE_HEADLINE: Record<RoleId, string> = {
  operator: "Operator Briefing",
  "cre-broker": "CRE Broker Briefing",
  "franchise-consultant": "Franchise Consultant Briefing",
  cpa: "CPA / Audit Briefing",
};

const ROLE_PURPOSE: Record<RoleId, string> = {
  operator:
    "Flat technical read of the brain output in DAG order, suitable for engine operators and producers.",
  "cre-broker":
    "Market-direction read framed for commercial real estate decisions, with flood-veto and rate signals foregrounded.",
  "franchise-consultant":
    "Outcomes-first read framed for franchise opportunity assessment, with survival and sector-credit signals foregrounded.",
  cpa: "Audit-grade read with full per-metric provenance tabulated by trust tier — every value traceable to its source URL.",
};

/**
 * Public entry point. Pure function: same `output` + same `ctx` → byte-identical markdown.
 */
export function renderForRole(output: BrainOutput, ctx: RoleContext): string {
  const role = ctx.role;
  const prefixes =
    ctx.focus_metric_prefixes && ctx.focus_metric_prefixes.length > 0
      ? ctx.focus_metric_prefixes
      : ROLE_DEFAULT_FOCUS[role];
  const categories = ROLE_DEFAULT_CATEGORIES[role];

  const { lead, rest } = partitionMetrics(
    output.key_metrics,
    prefixes,
    categories,
    ctx.category_lookup,
  );

  const sections: string[] = [];

  sections.push(renderHeader(output, role));
  sections.push(renderTldr(output));

  if (output.caveats.length > 0) {
    sections.push(renderCaveats(output.caveats));
  }

  sections.push(renderConclusion(output));

  if (role === "cpa") {
    sections.push(renderMetricsTable(output.key_metrics));
  } else {
    sections.push(renderKeyFindings(lead, rest, role));
  }

  sections.push(renderDrivers(output));

  if (output.contradicts.length > 0) {
    sections.push(renderContradictions(output.contradicts));
  }

  sections.push(renderConfidenceBlock(output));
  sections.push(renderFooter(output));

  return sections.join("\n\n") + "\n";
}

function partitionMetrics(
  metrics: readonly BrainOutputMetric[],
  prefixes: readonly string[],
  categories: readonly string[],
  categoryLookup: ((slug: string) => string | null) | undefined,
): { lead: BrainOutputMetric[]; rest: BrainOutputMetric[] } {
  if (prefixes.length === 0 && categories.length === 0) {
    return { lead: [...metrics], rest: [] };
  }
  const lead: BrainOutputMetric[] = [];
  const rest: BrainOutputMetric[] = [];
  for (const m of metrics) {
    const category = categoryLookup ? categoryLookup(m.metric) : null;
    const categoryHit =
      category !== null &&
      categories.length > 0 &&
      categories.includes(category);
    const prefixHit =
      prefixes.length > 0 && prefixes.some((p) => m.metric.startsWith(p));
    if (categoryHit || prefixHit) {
      lead.push(m);
    } else {
      rest.push(m);
    }
  }
  return { lead, rest };
}

function renderHeader(output: BrainOutput, role: RoleId): string {
  return [
    `# ${ROLE_HEADLINE[role]}: ${output.brain_id}`,
    "",
    `_${ROLE_PURPOSE[role]}_`,
  ].join("\n");
}

function renderTldr(output: BrainOutput): string {
  const dir = output.direction.toUpperCase();
  const mag = output.magnitude.toFixed(2);
  const overrideNote =
    output.overrides.length > 0
      ? ` — overrides fired: ${output.overrides.map((o) => `\`${o}\``).join(", ")}`
      : "";
  return ["## TL;DR", "", `**${dir}** (magnitude ${mag})${overrideNote}`].join(
    "\n",
  );
}

function renderCaveats(caveats: readonly string[]): string {
  return [
    "## ⚠️ Caveats (read first)",
    "",
    ...caveats.map((c) => `- ${c}`),
  ].join("\n");
}

function renderConclusion(output: BrainOutput): string {
  return ["## Conclusion", "", output.conclusion].join("\n");
}

function renderKeyFindings(
  lead: readonly BrainOutputMetric[],
  rest: readonly BrainOutputMetric[],
  role: RoleId,
): string {
  const parts: string[] = ["## Key Findings", ""];
  if (lead.length === 0 && rest.length === 0) {
    parts.push("_No key metrics emitted by this brain._");
    return parts.join("\n");
  }
  if (lead.length > 0 && role !== "operator") {
    parts.push("### Most relevant to your role");
    parts.push("");
    for (const m of lead) parts.push(renderMetricBullet(m));
    parts.push("");
  }
  if (rest.length > 0) {
    parts.push(
      lead.length > 0 && role !== "operator" ? "### Additional context" : "",
    );
    if (lead.length > 0 && role !== "operator") parts.push("");
    for (const m of rest) parts.push(renderMetricBullet(m));
  } else if (lead.length > 0 && role === "operator") {
    for (const m of lead) parts.push(renderMetricBullet(m));
  }
  return parts.filter((s) => s !== undefined).join("\n");
}

function renderMetricBullet(m: BrainOutputMetric): string {
  const value = formatValue(m);
  const arrow =
    m.direction === "rising" ? "↑" : m.direction === "falling" ? "↓" : "→";
  const cite = m.source
    ? ` _(source: [${truncate(m.source.citation, 120)}](${m.source.url}), T${m.source.tier}, fetched ${m.source.fetched_at})_`
    : " _(no provenance — pre-P2 metric)_";
  return `- **${m.label}** — ${value} ${arrow}${cite}`;
}

function renderMetricsTable(metrics: readonly BrainOutputMetric[]): string {
  if (metrics.length === 0) {
    return "## Audit Trail\n\n_No key metrics emitted by this brain._";
  }
  // CPA view: tabulate everything, sort by trust tier ASC then label.
  const sorted = [...metrics].sort((a, b) => {
    const ta = a.source?.tier ?? 9;
    const tb = b.source?.tier ?? 9;
    if (ta !== tb) return ta - tb;
    return a.label.localeCompare(b.label);
  });
  const rows = sorted.map((m) => {
    const tier = m.source?.tier ?? "—";
    const value = formatValue(m);
    const url = m.source?.url ?? "—";
    const cite = m.source ? truncate(m.source.citation, 80) : "—";
    return `| T${tier} | ${escapePipes(m.label)} | ${value} | ${m.direction} | ${escapePipes(cite)} | ${url} |`;
  });
  return [
    "## Audit Trail (all metrics, by trust tier)",
    "",
    "| Tier | Metric | Value | Direction | Citation | URL |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function renderDrivers(output: BrainOutput): string {
  if (output.drivers.length === 0) {
    return "## Drivers\n\n_No upstream drivers (primary brain)._";
  }
  const lines = output.drivers.map((d) => {
    const tag =
      d.edge_type === "veto"
        ? "**veto**"
        : d.edge_type === "constraint"
          ? "constraint"
          : d.edge_type === "modifier"
            ? "modifier"
            : "input";
    return `- \`${d.brain_id}\` — ${tag}`;
  });
  return ["## Drivers", "", ...lines].join("\n");
}

function renderContradictions(contradicts: readonly string[]): string {
  return [
    "## Contradictions surfaced",
    "",
    ...contradicts.map((c) => `- ${c}`),
  ].join("\n");
}

function renderConfidenceBlock(output: BrainOutput): string {
  return [
    "## Confidence",
    "",
    `- **${output.confidence.toFixed(2)}** (deterministic: trust tier × freshness × upstream propagation)`,
    `- Worst trust tier in chain: T${output.trust_tier}`,
    `- Upstream brains that passed the relevance floor: ${output.upstream_count}`,
  ].join("\n");
}

function renderFooter(output: BrainOutput): string {
  return [
    "---",
    "",
    `_Brain: \`${output.brain_id}\` v${output.version} · refined ${output.refined_at} · relevance half-life ${output.relevance.half_life_hours}h · decay \`${output.relevance.decay_curve}\`_`,
  ].join("\n");
}

function formatValue(m: BrainOutputMetric): string {
  // Verbatim quote: never round. If the raw value reads naturally as a
  // percentage (0 < x < 1 and the slug hints at percentage / rate / ratio
  // / share), surface a percentage rendering ALONGSIDE the raw value
  // rather than replacing it.
  const v = m.value;
  const slug = m.metric.toLowerCase();
  const looksPercent =
    v > 0 && v < 1 && /(pct|percent|rate|ratio|share|coverage)/.test(slug);
  if (looksPercent) {
    return `${v} (${(v * 100).toFixed(2)}%)`;
  }
  return `${v}`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * Convenience: render the same output across all built-in roles. Returns a
 * map keyed by role id. Useful for fixture-rendering all roles in one pass.
 */
export function renderAllRoles(output: BrainOutput): Record<RoleId, string> {
  const roles: RoleId[] = [
    "operator",
    "cre-broker",
    "franchise-consultant",
    "cpa",
  ];
  const out = {} as Record<RoleId, string>;
  for (const role of roles) {
    out[role] = renderForRole(output, { role });
  }
  return out;
}
