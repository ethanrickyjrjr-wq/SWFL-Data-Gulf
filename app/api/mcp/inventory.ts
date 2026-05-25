import { BRAIN_CATALOG } from "@/refinery/packs/catalog.mts";

/**
 * Inventory helpers for the MCP server. Read from the leaf-only
 * `BRAIN_CATALOG` (zero pack imports — see refinery/packs/catalog.mts for
 * the rationale). Pure functions, no side effects.
 */

/** Markdown bullet list of every report — interpolated into the tool description at module load. */
export function buildInventoryMarkdown(): string {
  return BRAIN_CATALOG.map(
    (entry) => `- \`${entry.id}\` (${entry.domain}) — ${entry.scope}`,
  ).join("\n");
}

/** Set of valid report ids for Zod refinement on the `report_id` argument. */
export function buildReportIdSet(): Set<string> {
  return new Set(BRAIN_CATALOG.map((entry) => entry.id));
}

/** Plain list of report ids — used by the GET health check count. */
export function buildReportIdList(): string[] {
  return BRAIN_CATALOG.map((entry) => entry.id);
}
