/**
 * Personal Vault — list/search CLI.
 *
 * Read-side companion to vault-capture. Powers both terminal browsing AND the
 * /vault recall slash-command path (via --json).
 *
 * Usage:
 *   bun refinery/tools/vault-list.mts
 *     # most recent 20 active fragments, compact table
 *
 *   bun refinery/tools/vault-list.mts --search="i75"
 *     # ILIKE on insight + context_slug
 *
 *   bun refinery/tools/vault-list.mts --tag=cre_industrial_vacancy
 *     # array-contains filter (single tag)
 *
 *   bun refinery/tools/vault-list.mts --status=all
 *     # include superseded + archived (default: active only)
 *
 *   bun refinery/tools/vault-list.mts --json
 *     # raw JSON for Claude to re-narrate via /vault recall
 *
 *   bun refinery/tools/vault-list.mts --limit=50
 *     # default 20
 *
 * Flags compose; e.g. --search=i75 --tag=cre_industrial_vacancy --json
 */

import { getSupabase } from "../sources/supabase.mts";
import { requireEnv } from "../config/env.mts";

const SCHEMA = "personal_vault";
const TABLE = "vault_fragments";
const DEFAULT_LIMIT = 20;

interface Args {
  search?: string;
  tag?: string;
  status: "active" | "all" | "superseded" | "archived";
  limit: number;
  json: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const map = new Map<string, string>();
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq < 0) {
      map.set(raw.slice(2), "true");
      continue;
    }
    map.set(raw.slice(2, eq), raw.slice(eq + 1));
  }
  const statusRaw = (map.get("status") ?? "active") as Args["status"];
  if (!["active", "all", "superseded", "archived"].includes(statusRaw)) {
    console.error(
      `[vault-list] --status must be one of: active, all, superseded, archived (got "${statusRaw}").`,
    );
    process.exit(1);
  }
  const limitRaw = map.get("limit");
  const limit = limitRaw !== undefined ? Number(limitRaw) : DEFAULT_LIMIT;
  if (Number.isNaN(limit) || limit < 1) {
    console.error(`[vault-list] --limit must be a positive integer.`);
    process.exit(1);
  }
  return {
    search: map.get("search"),
    tag: map.get("tag"),
    status: statusRaw,
    limit,
    json: map.has("json"),
  };
}

interface VaultRow {
  id: string;
  context_slug: string;
  insight: string;
  tags: string[];
  vintage: string;
  revisit_after: string;
  confidence: number;
  status: string;
  superseded_by: string | null;
  source_chat: string | null;
  created_at: string;
  updated_at: string;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function renderTable(rows: readonly VaultRow[]): string {
  if (rows.length === 0) return "(no fragments match)";
  const lines: string[] = [];
  lines.push(
    "vintage    | conf | status     | context_slug                 | tags                              | insight",
  );
  lines.push(
    "-----------+------+------------+------------------------------+-----------------------------------+----------------------------------------------------------------",
  );
  for (const r of rows) {
    const conf = r.confidence.toFixed(2);
    const status = r.status.padEnd(10).slice(0, 10);
    const slug = truncate(r.context_slug, 28).padEnd(28);
    const tags = truncate((r.tags ?? []).slice(0, 2).join(","), 33).padEnd(33);
    const insight = truncate(r.insight, 64);
    lines.push(
      `${r.vintage} | ${conf} | ${status} | ${slug} | ${tags} | ${insight}`,
    );
  }
  lines.push("");
  lines.push(`(${rows.length} fragment${rows.length === 1 ? "" : "s"})`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  requireEnv(["supabaseUrl", "supabaseKey"]);

  const supabase = getSupabase();
  let q = supabase
    .schema(SCHEMA)
    .from(TABLE)
    .select(
      "id, context_slug, insight, tags, vintage, revisit_after, confidence, status, superseded_by, source_chat, created_at, updated_at",
    );

  if (args.status !== "all") {
    q = q.eq("status", args.status);
  }
  if (args.tag !== undefined) {
    // PostgREST array contains: cs => "contains"
    q = q.contains("tags", [args.tag]);
  }
  if (args.search !== undefined && args.search.length > 0) {
    const term = args.search.replace(/%/g, "\\%").replace(/_/g, "\\_");
    // ILIKE OR across insight + context_slug
    q = q.or(`insight.ilike.%${term}%,context_slug.ilike.%${term}%`);
  }

  q = q.order("vintage", { ascending: false }).limit(args.limit);

  const { data, error } = await q;
  if (error) {
    console.error(
      `[vault-list] query failed: ${error.message}\n` +
        `If error is "schema must be one of …", add "${SCHEMA}" to Project Settings → API → Exposed schemas.`,
    );
    process.exit(1);
  }

  const rows = (data ?? []) as VaultRow[];
  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log(renderTable(rows));
  }
}

main().catch((err) => {
  console.error(
    `[vault-list] FAILED: ${err instanceof Error ? err.message : err}`,
  );
  process.exit(1);
});
