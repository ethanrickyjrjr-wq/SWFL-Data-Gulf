#!/usr/bin/env bun
/**
 * brain-catalog — generate the ONE reference for what every brain holds.
 *
 * WHY THIS EXISTS (07/21/2026). The operator's question at the end of a nine-hour
 * outage was "Why are we not reading brains? Why are we reading the fucking lake?"
 * A large part of the answer is that nothing told you what a brain contains. To
 * find out whether `housing-swfl` already holds median sale price by ZIP you had
 * to open a 40 KB markdown file and read a JSON blob by eye — so people wrote a
 * raw `.from()` query instead, which is billed, uncached, and dies when PostgREST
 * does. Brains are local disk reads (`lib/fetch-brain.ts` → `brains/{slug}.md`,
 * memoized): free, and they stayed UP through the outage that killed every page
 * that re-derived from raw tables.
 *
 * READS ONLY COMMITTED ARTIFACTS. Parses `brains/*.md` from disk and the
 * `input_brains` edges out of `refinery/packs/*.mts` + `refinery/config/packs.mts`
 * by regex. It never imports the pack registry (that pulls source connectors which
 * want env vars), never touches the network, never triggers a rebuild — a rebuild
 * is paid Sonnet spend and needs operator approval (RULE 1).
 *
 * Emits:
 *   docs/BRAIN-CATALOG.md    human reference — metric index, per-brain detail, DAG
 *   docs/brain-catalog.json  machine-readable — consumed by the no-raw-read lint
 *
 * Run: bun scripts/brain-catalog.mts [--check]
 *   --check  regenerate in memory and exit non-zero if the committed files are
 *            stale. Used by CI so the catalog cannot silently drift from brains/.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.join(import.meta.dir, "..");
const BRAINS_DIR = path.join(ROOT, "brains");
const PACKS_DIR = path.join(ROOT, "refinery", "packs");
const CONFIG_PACKS = path.join(ROOT, "refinery", "config", "packs.mts");
const OUT_MD = path.join(ROOT, "docs", "BRAIN-CATALOG.md");
const OUT_JSON = path.join(ROOT, "docs", "brain-catalog.json");

/** MM/DD/YYYY — the operator-facing date format (never the raw SWFL-… token). */
export function asOfDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : null;
}

export interface CatalogMetric {
  slug: string;
  label: string;
  units: string | null;
  display_format: string | null;
  source_citation: string | null;
  source_url: string | null;
}

export interface CatalogTable {
  title: string;
  grain: string | null;
  row_count: number;
  columns: string[];
  source_citation: string | null;
}

export interface CatalogBrain {
  brain_id: string;
  scope: string | null;
  version: number | null;
  refined_at: string | null;
  as_of: string | null;
  freshness_token: string | null;
  direction: string | null;
  conclusion: string | null;
  metrics: CatalogMetric[];
  tables: CatalogTable[];
  /** What this brain explicitly does NOT hold — stops a consumer inventing it. */
  not_available: string[];
  upstreams: { id: string; edge_type: string; critical: boolean }[];
  downstreams: string[];
  parse_error: string | null;
}

/**
 * Structural shape of the `--- OUTPUT ---` JSON, as read here.
 *
 * Deliberately a LOCAL, fully-optional mirror rather than an import of
 * `refinery/types/brain-output.mts`: this parses artifacts that were committed
 * by older pack versions, so every field must be allowed to be missing. Binding
 * to the live type would make the catalog fail on exactly the stale brain it
 * most needs to report on.
 */
interface RawBrainOutput {
  direction?: string;
  conclusion?: string;
  key_metrics?: {
    metric?: string;
    label?: string;
    units?: string;
    display_format?: string;
    source?: { citation?: string; url?: string };
  }[];
  detail_tables?: {
    title?: string;
    grain?: string;
    rows?: unknown[];
    columns?: { id?: string; label?: string }[];
    source?: { citation?: string };
  }[];
  grain_boundary?: { not_available?: string[] };
}

/**
 * Pull the `--- OUTPUT ---` JSON out of a brain markdown file.
 *
 * Brace-counting rather than a greedy regex: the OUTPUT block is followed by
 * more prose in some brains, and conclusions legitimately contain `}`. CRLF-safe
 * (this repo has bitten on CRLF parsers before — see feedback_speaker-crlf-fix).
 */
export function extractOutputJson(md: string): string | null {
  const marker = md.indexOf("--- OUTPUT ---");
  if (marker < 0) return null;
  const start = md.indexOf("{", marker);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < md.length; i++) {
    const ch = md[i]!;
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return md.slice(start, i + 1);
    }
  }
  return null;
}

/** Read one scalar out of the YAML frontmatter block. */
export function frontmatterValue(md: string, key: string): string | null {
  const fm = md.match(/^[\s\S]*?\r?\n---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const body = fm ? fm[1]! : md.slice(0, 2000);
  const m = body.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  return m ? m[1]!.replace(/^["']|["']$/g, "") : null;
}

/**
 * Regex-parse `input_brains: [ { id: "x", edge_type: "input", critical: true }, ]`
 * out of a pack source file. Deliberately NOT an import of the pack registry:
 * importing pulls every source connector, several of which read env at module
 * load and would make catalog generation depend on a populated `.env.local`.
 */
export function parseInputBrains(
  src: string,
): { id: string; edge_type: string; critical: boolean }[] {
  const block = src.match(/input_brains:\s*\[([\s\S]*?)\n\s*\]/);
  if (!block) return [];
  const out: { id: string; edge_type: string; critical: boolean }[] = [];
  const entry = /\{[^}]*?id:\s*["']([a-z0-9-]+)["'][^}]*?\}/g;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(block[1]!)) !== null) {
    const frag = m[0];
    const edge = frag.match(/edge_type:\s*["']([a-z_]+)["']/);
    out.push({
      id: m[1]!,
      edge_type: edge ? edge[1]! : "input",
      critical: /critical:\s*true/.test(frag),
    });
  }
  return out;
}

async function collectEdges(): Promise<Map<string, ReturnType<typeof parseInputBrains>>> {
  const edges = new Map<string, ReturnType<typeof parseInputBrains>>();
  const files: string[] = [];
  for (const f of await readdir(PACKS_DIR)) {
    if (f.endsWith(".mts") && !f.includes(".test.") && f !== "index.mts") {
      files.push(path.join(PACKS_DIR, f));
    }
  }
  files.push(CONFIG_PACKS);
  for (const file of files) {
    let src: string;
    try {
      src = await readFile(file, "utf-8");
    } catch {
      continue;
    }
    const parsed = parseInputBrains(src);
    if (parsed.length === 0) continue;
    // A pack file is named for its brain; config/packs.mts holds the two v1 packs,
    // so attribute by the `brain_id:` in the file instead of the filename.
    const base = path.basename(file, ".mts");
    if (base !== "packs") {
      edges.set(base, parsed);
    } else {
      const idm = src.match(/brain_id:\s*["']([a-z0-9-]+)["']/);
      if (idm) edges.set(idm[1]!, parsed);
    }
  }
  return edges;
}

export async function buildCatalog(): Promise<CatalogBrain[]> {
  const edges = await collectEdges();
  const files = (await readdir(BRAINS_DIR)).filter((f) => f.endsWith(".md")).sort();
  const brains: CatalogBrain[] = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const md = await readFile(path.join(BRAINS_DIR, file), "utf-8");
    const raw = extractOutputJson(md);
    const base: CatalogBrain = {
      brain_id: slug,
      scope: frontmatterValue(md, "scope"),
      version: Number(frontmatterValue(md, "version")) || null,
      refined_at: frontmatterValue(md, "refined_at"),
      as_of: asOfDate(frontmatterValue(md, "refined_at")),
      freshness_token: frontmatterValue(md, "freshness_token"),
      direction: null,
      conclusion: null,
      metrics: [],
      tables: [],
      not_available: [],
      upstreams: edges.get(slug) ?? [],
      downstreams: [],
      parse_error: null,
    };

    if (!raw) {
      // Never throw — one malformed brain must not kill the whole catalog. The
      // error is recorded IN the artifact so it is visible rather than silent.
      base.parse_error = "no parseable --- OUTPUT --- block";
      brains.push(base);
      continue;
    }
    try {
      const o = JSON.parse(raw) as RawBrainOutput;
      base.direction = o.direction ?? null;
      base.conclusion = o.conclusion ?? null;
      base.metrics = (o.key_metrics ?? []).map((m): CatalogMetric => ({
        slug: m.metric ?? "(unnamed)",
        label: m.label ?? "",
        units: m.units ?? null,
        display_format: m.display_format ?? null,
        source_citation: m.source?.citation ?? null,
        source_url: m.source?.url ?? null,
      }));
      base.tables = (o.detail_tables ?? []).map((t): CatalogTable => ({
        title: t.title ?? "(untitled)",
        grain: t.grain ?? null,
        row_count: Array.isArray(t.rows) ? t.rows.length : 0,
        columns: (t.columns ?? []).map((c) => c.label ?? c.id ?? "?"),
        source_citation: t.source?.citation ?? null,
      }));
      base.not_available = o.grain_boundary?.not_available ?? [];
    } catch (err) {
      base.parse_error = `OUTPUT JSON did not parse: ${String(err)}`;
    }
    brains.push(base);
  }

  // Derive downstream edges from the upstream declarations (one direction is
  // authored; the reverse is computed so it can never disagree).
  const byId = new Map(brains.map((b) => [b.brain_id, b]));
  for (const b of brains) {
    for (const up of b.upstreams) {
      byId.get(up.id)?.downstreams.push(b.brain_id);
    }
  }
  for (const b of brains) b.downstreams.sort();
  return brains;
}

function mdEscape(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

export function renderMarkdown(brains: CatalogBrain[]): string {
  const L: string[] = [];
  const live = brains.filter((b) => b.brain_id !== "test-alpha");

  L.push("# BRAIN CATALOG — what every brain already holds");
  L.push("");
  L.push(
    "**GENERATED — do not hand-edit.** Regenerate with `bun run brain-catalog` after any rebuild " +
      "that changes `brains/*.md`. `bun run check:brain-catalog` exits non-zero when this file has " +
      "drifted. NOT yet wired into CI or the pre-push gate — a rebuild lands new `brains/*.md` " +
      "without regenerating this, so treat a stale as-of date here as drift, not as brain state.",
  );
  L.push("");
  L.push(
    'Read this BEFORE writing a raw `.from("…")` query in a page or loader. A brain is a local ' +
      "disk read (`lib/fetch-brain.ts` → `brains/{slug}.md`, memoized in-process): it costs no " +
      "egress, needs no database round-trip, and stays up when PostgREST does not — on 07/21/2026 " +
      "every brain served fine while every page that re-derived from raw tables went blank.",
  );
  L.push("");
  L.push(
    "If the number you need is in the metric index below, read the brain. Query the lake only for " +
      "data that is genuinely NEW — that is what the lake is for.",
  );
  L.push("");
  L.push(`Brains: **${live.length}** · generated from committed artifacts only (no rebuild).`);
  L.push("");

  // ---- Metric index: the "which brain answers this?" lookup ----
  L.push("## Metric index — slug → brain");
  L.push("");
  L.push("Every metric every brain publishes, alphabetical. This is the lookup table.");
  L.push("");
  L.push("| Metric slug | Brain | Label | Units |");
  L.push("|---|---|---|---|");
  const rows: string[] = [];
  for (const b of live) {
    for (const m of b.metrics) {
      rows.push(
        `| \`${m.slug}\` | \`${b.brain_id}\` | ${mdEscape(m.label).slice(0, 90)} | ${m.units ?? "—"} |`,
      );
    }
  }
  rows.sort();
  L.push(...rows);
  L.push("");

  // ---- Detail tables: the per-row grain ----
  L.push("## Detail tables — per-row data already baked into a brain");
  L.push("");
  L.push(
    "These are rows a consumer can look up directly (e.g. one ZIP) with no query. " +
      "`fetchDetailRow(slug, key)` in `lib/fetch-brain.ts` reads one row out of these.",
  );
  L.push("");
  L.push("| Brain | Table | Grain | Rows | Columns |");
  L.push("|---|---|---|---|---|");
  for (const b of live) {
    for (const t of b.tables) {
      L.push(
        `| \`${b.brain_id}\` | ${mdEscape(t.title)} | ${t.grain ?? "—"} | ${t.row_count} | ${mdEscape(t.columns.join(", ")).slice(0, 80)} |`,
      );
    }
  }
  L.push("");

  // ---- The graph ----
  L.push("## The graph");
  L.push("");
  L.push(
    "Edges are `input_brains` declarations parsed from the pack sources. `modifier` / `veto` " +
      "edges are typed differently from plain `input` because they change a downstream call " +
      "rather than just feeding it.",
  );
  L.push("");
  L.push("```mermaid");
  L.push("graph LR");
  for (const b of live) {
    for (const up of b.upstreams) {
      const arrow =
        up.edge_type === "veto" ? "-.->|veto|" : up.edge_type === "modifier" ? "-->|mod|" : "-->";
      L.push(`  ${up.id.replace(/-/g, "_")} ${arrow} ${b.brain_id.replace(/-/g, "_")}`);
    }
  }
  const isolated = live.filter((b) => b.upstreams.length === 0 && b.downstreams.length === 0);
  for (const b of isolated) L.push(`  ${b.brain_id.replace(/-/g, "_")}`);
  L.push("```");
  L.push("");

  // ---- Per-brain detail ----
  L.push("## Per-brain detail");
  L.push("");
  for (const b of live) {
    L.push(`### \`${b.brain_id}\``);
    L.push("");
    if (b.parse_error) {
      L.push(`**UNREADABLE — ${b.parse_error}.** This brain cannot be consumed until it rebuilds.`);
      L.push("");
      continue;
    }
    if (b.scope) L.push(`**Scope.** ${b.scope}`);
    L.push("");
    const bits: string[] = [];
    if (b.as_of) bits.push(`as of ${b.as_of}`);
    if (b.version) bits.push(`v${b.version}`);
    if (b.direction) bits.push(`direction: ${b.direction}`);
    bits.push(`${b.metrics.length} metric${b.metrics.length === 1 ? "" : "s"}`);
    const totalRows = b.tables.reduce((n, t) => n + t.row_count, 0);
    if (totalRows) bits.push(`${totalRows} detail rows`);
    L.push(bits.join(" · "));
    L.push("");
    if (b.upstreams.length) {
      L.push(
        `**Reads:** ${b.upstreams.map((u) => `\`${u.id}\`${u.critical ? " (critical)" : ""}`).join(", ")}`,
      );
      L.push("");
    }
    if (b.downstreams.length) {
      L.push(`**Feeds:** ${b.downstreams.map((d) => `\`${d}\``).join(", ")}`);
      L.push("");
    }
    if (b.metrics.length) {
      L.push("Metrics:");
      L.push("");
      for (const m of b.metrics) {
        L.push(`- \`${m.slug}\` — ${mdEscape(m.label)}${m.units ? ` (${m.units})` : ""}`);
      }
      L.push("");
    }
    if (b.tables.length) {
      L.push("Detail tables:");
      L.push("");
      for (const t of b.tables) {
        L.push(
          `- **${mdEscape(t.title)}** — ${t.row_count} rows at ${t.grain ?? "unstated"} grain`,
        );
      }
      L.push("");
    }
    if (b.not_available.length) {
      // The most-skipped field, and the one that stops a consumer inventing a number.
      L.push(`**Does NOT hold:** ${b.not_available.map(mdEscape).join("; ")}`);
      L.push("");
    }
  }

  return L.join("\n") + "\n";
}

async function main() {
  const check = process.argv.includes("--check");
  const brains = await buildCatalog();
  const md = renderMarkdown(brains);
  const json = JSON.stringify(brains, null, 2) + "\n";

  if (check) {
    const stale: string[] = [];
    for (const [file, want] of [
      [OUT_MD, md],
      [OUT_JSON, json],
    ] as const) {
      const have = await readFile(file, "utf-8").catch(() => null);
      if (have !== want) stale.push(path.relative(ROOT, file));
    }
    if (stale.length) {
      console.error(
        `brain-catalog: STALE — ${stale.join(", ")} no longer matches brains/*.md.\n` +
          "Run `bun scripts/brain-catalog.mts` and commit the result.",
      );
      process.exit(1);
    }
    console.log("brain-catalog: up to date.");
    return;
  }

  await writeFile(OUT_MD, md, "utf-8");
  await writeFile(OUT_JSON, json, "utf-8");
  const metrics = brains.reduce((n, b) => n + b.metrics.length, 0);
  const rows = brains.reduce((n, b) => n + b.tables.reduce((m, t) => m + t.row_count, 0), 0);
  const broken = brains.filter((b) => b.parse_error);
  console.log(
    `brain-catalog: ${brains.length} brains · ${metrics} metrics · ${rows} detail rows -> docs/BRAIN-CATALOG.md`,
  );
  if (broken.length) {
    console.log(`  ${broken.length} unreadable: ${broken.map((b) => b.brain_id).join(", ")}`);
  }
}

if (import.meta.main) await main();
