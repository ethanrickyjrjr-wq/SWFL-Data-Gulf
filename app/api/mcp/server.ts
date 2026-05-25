import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fetchBrain,
  resolveOrigin,
  BrainNotFoundError,
  BrainBadTierError,
} from "@/lib/fetch-brain";
import { buildInventoryMarkdown, buildReportIdSet } from "./inventory";

/**
 * MCP server callback. Registers the single `swfl_fetch` tool against the
 * server instance `mcp-handler` constructs for each request. Pure registration
 * — the tool handler does the actual fetch + render via `lib/fetch-brain.ts`.
 *
 * Response shape per the v1 plan (`docs/superpowers/plans/2026-05-22-brains-mcp-server-v1/README.md`):
 *
 *   - Two content blocks: a text block (consumed by all clients) and a
 *     `resource` block carrying the structured MCP App payload (Claude
 *     renders as an inline widget; other clients ignore silently).
 *   - `_meta.freshness_token` on every response — verbatim from BrainOutput.
 *   - Tool handler returns `{ content, isError: true }` on failure; NEVER throws.
 *
 * MIME type `application/vnd.anthropic.mcp-app+json` is the v1 design intent
 * for MCP Apps — verify against current Anthropic MCP Apps documentation
 * before locking long-term.
 */

const VALID_REPORT_IDS = buildReportIdSet();
const INVENTORY_MD = buildInventoryMarkdown();

const TOOL_DESCRIPTION = `swfl_fetch — read the Southwest Florida data lake.

This server hosts a library of analyst-grade reports about Southwest Florida (Lee, Collier, Charlotte counties): housing, commercial real estate, permits, traffic, tourism, hurricane risk, sector credit, logistics, and macro context (US, Florida, SWFL). Every numeric claim in a response is followed by a source URL — federal/state agencies, public datasets, or other reports in this same lake. Nothing is invented. This server is read-only.

How to use it. Default behavior: call swfl_fetch with no arguments. You will get the master report at tier 2 — a structured summary with a headline conclusion, key metrics with sources, caveats, a link to the full report page, and a freshness token. Read it first. If the master conclusion points you at a specific upstream report by name, call swfl_fetch again with report_id set to that name. Do not fan out across every upstream; the master already aggregates them.

Tiers.
- tier: 1 — conversational, 2-5 sentences. Use when the user wants a quick read.
- tier: 2 (default) — structured: conclusion + metrics table + caveats.
- tier: 3 — raw audit dump with full citation table and internal identifiers. Use ONLY when the user explicitly asks to audit, verify, or trace sources.

Available reports.
${INVENTORY_MD}

Full structured view. Every response includes a link of the form https://www.swfldatagulf.com/r/{report_id} — point the user there for charts, the full metrics table, or to share the report.`;

export function buildMcpServer(server: McpServer): void {
  server.tool(
    "swfl_fetch",
    TOOL_DESCRIPTION,
    {
      report_id: z
        .string()
        .refine((id) => VALID_REPORT_IDS.has(id), {
          message: `report_id must be one of: ${[...VALID_REPORT_IDS].join(", ")}`,
        })
        .optional()
        .describe(
          "Report to fetch. Omit for the master synthesis (recommended for first-call routing).",
        ),
      tier: z
        .union([z.literal(1), z.literal(2), z.literal(3)])
        .optional()
        .describe(
          "Output detail. 1 = conversational, 2 = structured (default), 3 = audit. Use 3 only when the user explicitly asks to verify or trace sources.",
        ),
    },
    async ({ report_id, tier }) => {
      const slug = report_id ?? "master";
      const t: 1 | 2 | 3 = tier ?? 2;

      try {
        const { text, freshness_token, output } = await fetchBrain(slug, {
          tier: t,
        });
        const origin = resolveOrigin();
        const report_url = `${origin}/r/${slug}`;

        const mcpAppPayload = {
          report_id: slug,
          tier: t,
          freshness_token,
          conclusion: output.conclusion,
          key_metrics: output.key_metrics.map((m) => ({
            label: m.label,
            value: typeof m.value === "string" ? m.value : String(m.value),
            source_url: m.source.url,
          })),
          caveats: output.caveats,
          report_url,
        };

        return {
          content: [
            { type: "text" as const, text },
            {
              type: "resource" as const,
              resource: {
                uri: `swfl://report/${slug}`,
                mimeType: "application/vnd.anthropic.mcp-app+json",
                text: JSON.stringify(mcpAppPayload),
              },
            },
          ],
          _meta: { freshness_token },
        };
      } catch (err) {
        const message =
          err instanceof BrainNotFoundError
            ? `Report not found: "${slug}". Valid ids: ${[...VALID_REPORT_IDS].join(", ")}.`
            : err instanceof BrainBadTierError
              ? (err as Error).message
              : `Unexpected error fetching "${slug}": ${(err as Error).message}`;

        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
        };
      }
    },
  );
}
