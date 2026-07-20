#!/usr/bin/env node
// Schedule catalog — ONE derived view of everything that runs on a schedule
// (spec docs/superpowers/specs/2026-07-20-schedule-catalog-design.md).
// Authored membership lives in ingest/cadence_registry.yaml (pipelines:/
// not_yet_running:/jobs:); cron expressions are NEVER authored there — this
// script reads them live from .github/workflows/*.yml and vercel.json, so the
// reported schedule cannot drift from what is actually configured.
//
//   node scripts/schedule-catalog.mjs           # full catalog JSON to stdout
//   node scripts/schedule-catalog.mjs --check   # exit 1 + fix snippets if anything is unregistered
//
// Dependency-free on purpose: Gate 10 in .claude/hooks/check-prepush-gate.mjs
// mirrors the cron-detection + snippet logic inline (hooks read committed
// state via `git show HEAD:`, this script reads the working tree — the test
// file pins both shapes).
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Active `- cron:` expressions in a workflow YAML (commented-out lines excluded). */
export function cronLines(workflowYaml) {
  const out = [];
  for (const line of String(workflowYaml).split(/\r?\n/)) {
    const m = /^\s*-\s*cron:\s*["']?([^"'#]+?)["']?\s*(#.*)?$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/** Escape a string for use inside a RegExp source (literal match). */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Is `ref` registered as an actual `workflow:` field value in the registry
 * text — not merely name-dropped in a comment or another entry's `purpose:`
 * prose? Matches a line like `    workflow: <ref>` (optionally followed by a
 * trailing `# comment`), any leading whitespace, multiline mode.
 */
function isRegisteredRef(registryText, ref) {
  const re = new RegExp(`^\\s*workflow:\\s*${escapeRegExp(ref)}\\s*(#.*)?$`, "m");
  return re.test(String(registryText));
}

/** vercel.json crons as registry refs: { ref: "vercel.json#<path>", cron }. */
export function vercelCronRefs(vercelJsonText) {
  try {
    const crons = JSON.parse(vercelJsonText)?.crons ?? [];
    return crons
      .filter((c) => c?.path && c?.schedule)
      .map((c) => ({ ref: `vercel.json#${c.path}`, cron: c.schedule }));
  } catch (e) {
    // Fail OPEN on the return value (empty catalog contribution) but never
    // SILENT — a malformed vercel.json must not make --check report OK while
    // its crons have quietly vanished from the catalog.
    console.warn(
      `schedule-catalog: vercel.json failed to parse, treating as zero Vercel crons — ${e.message}`,
    );
    return [];
  }
}

/**
 * Line-oriented parse of the registry's `jobs:` section. The shape is fixed
 * (2-space list items, 4-space fields — spec 2026-07-20), which is what lets
 * this stay dependency-free; full YAML validation lives in
 * ingest/tests/test_cadence_registry_spine.py.
 */
export function jobsEntries(registryText) {
  const lines = String(registryText).split(/\r?\n/);
  const start = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l));
  if (start === -1) return [];
  const entries = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^[a-z_]+:/.test(l)) break; // next top-level key
    let m = /^  - name:\s*(\S+)/.exec(l);
    if (m) {
      entries.push({ name: m[1] });
      continue;
    }
    m = /^    (workflow|purpose|status|scheduler):\s*(.+?)\s*$/.exec(l);
    if (m && entries.length > 0) entries[entries.length - 1][m[1]] = m[2];
  }
  return entries;
}

/**
 * Merge authored membership with live schedules. Membership requires the ref
 * to appear as an actual `workflow:` field value in the registry (see
 * isRegisteredRef) — a bare mention in a comment or another entry's
 * `purpose:` prose does NOT count. pipelines:/not_yet_running:/jobs: entries
 * all use the same `workflow:` field, so all three sections count.
 */
export function buildCatalog({ registryText, workflows, vercelJsonText }) {
  const rows = [];
  const unregistered = [];
  for (const wf of workflows) {
    const crons = cronLines(wf.text);
    if (crons.length === 0) continue; // dispatch-/CI-only — not a scheduled surface
    const registered = isRegisteredRef(registryText, wf.file);
    if (!registered) unregistered.push(wf.file);
    rows.push({ ref: wf.file, scheduler: "gha", cron: crons, registered });
  }
  for (const v of vercelCronRefs(vercelJsonText)) {
    const registered = isRegisteredRef(registryText, v.ref);
    if (!registered) unregistered.push(v.ref);
    rows.push({ ref: v.ref, scheduler: "vercel", cron: [v.cron], registered });
  }
  const byRef = new Map(jobsEntries(registryText).map((j) => [j.workflow, j]));
  for (const r of rows) {
    const j = byRef.get(r.ref);
    if (j) {
      r.name = j.name;
      if (j.purpose) r.purpose = j.purpose;
      r.status = j.status ?? "live";
    }
  }
  return { rows, unregistered };
}

/** Paste-ready jobs: entry for an unregistered ref (also mirrored in Gate 10). */
export function gate10Snippet(ref) {
  const isVercel = ref.startsWith("vercel.json#");
  const name = isVercel
    ? ref
        .slice("vercel.json#".length)
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : ref.replace(/\.yml$/, "");
  return (
    `  - name: ${name}\n` +
    `    workflow: ${ref}\n` +
    `    purpose: <one line — what this job does>` +
    (isVercel ? `\n    scheduler: vercel` : ``)
  );
}

// ---- CLI --------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const registryText = readFileSync(path.join(root, "ingest", "cadence_registry.yaml"), "utf8");
  const wfDir = path.join(root, ".github", "workflows");
  const workflows = readdirSync(wfDir)
    .filter((f) => f.endsWith(".yml"))
    .map((file) => ({ file, text: readFileSync(path.join(wfDir, file), "utf8") }));
  let vercelJsonText = "{}";
  try {
    vercelJsonText = readFileSync(path.join(root, "vercel.json"), "utf8");
  } catch {
    // no vercel.json — GHA-only catalog
  }
  const catalog = buildCatalog({ registryText, workflows, vercelJsonText });
  if (process.argv.includes("--check")) {
    if (catalog.unregistered.length > 0) {
      console.error(
        `schedule-catalog: ${catalog.unregistered.length} unregistered scheduled surface(s):\n`,
      );
      for (const ref of catalog.unregistered) {
        console.error(`  - ${ref}\n${gate10Snippet(ref)}\n`);
      }
      process.exit(1);
    }
    console.log(
      `schedule-catalog: OK — ${catalog.rows.length} scheduled surfaces, all registered.`,
    );
    process.exit(0);
  }
  console.log(JSON.stringify(catalog, null, 2));
}
