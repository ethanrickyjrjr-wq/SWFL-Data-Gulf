#!/usr/bin/env node
/**
 * Hand-name graphify's code communities — WITHOUT paying for `graphify label`.
 *
 * RULE 0.5b R7 says communities get human names. The vendor's answer is
 * `graphify label`, which shells out to a separate LLM backend with its own API
 * key (~41 metered calls at batch 100 for our 4,069 communities). That is the
 * vendor's design, not a requirement: the member lists sit in
 * graphify-out/.graphify_analysis.json in plain text, and naming a cluster from
 * its members is reading, not inference-for-hire.
 *
 * ALSO measured 08/12/2026 and the reason `label --missing-only` is a dead end:
 * all 4,069 communities already carry an auto-label (the biggest node's name --
 * `pack.mts`, `shared.ts`, `$`). None matches the `Community N` placeholder
 * pattern, so --missing-only finds nothing missing and names nothing. A bad
 * label is not a missing one.
 *
 * SCOPE: the 369 communities of size >= 25. They cover 48.1% of code-plane
 * nodes. The other 3,700 are 1,434 singletons plus 2,266 clusters under 25
 * nodes -- naming those is noise, and `label` has no size filter, which is what
 * made the vendor path mostly waste by node count.
 *
 * DURABILITY: .graphify_labels.json re-attaches names by node overlap across
 * re-clustering, so these survive the post-commit rebuild (RULE 0.5b R6).
 *
 *   node scripts/graphify-name-communities.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";

const OUT = "graphify-out";
const ANALYSIS = `${OUT}/.graphify_analysis.json`;
const LABELS = `${OUT}/.graphify_labels.json`;
const MIN_SIZE = 25;
const dryRun = process.argv.includes("--dry-run");

/**
 * Hand-written names for the communities big enough to read individually.
 * Each says the JOB the cluster does, not the biggest file in it. Keyed by
 * community id; the value is what a person scanning GRAPH_REPORT.md needs to
 * see to know whether this is the cluster they're looking for.
 */
const HAND_NAMED = {
  364: "refinery — source adapters",
  3742: "email — lab blocks & preview routes",
  5354: "email — doc build & AI edit routes",
  11: "email — acceptance render scripts",
  90: "deliverable — recipes & shared helpers",
  3761: "refinery — brain-output contract & constitution",
  1134: "email — brand & agent identity tokens",
  1: "refinery — CRE corridor pack & sources",
  1001: "project — items, claim & assemble routes",
  179: "refinery — packs & core SWFL scope",
  93: "refinery — stages & triage agents",
  7: "email — social icons & footer",
  3762: "refinery — leaf packs",
  25: "research — competitor & strategy docs (A)",
  3838: "API — RESO / MLS feed routes",
  19: "charts — components (A)",
  32: "research — competitor & strategy docs (B)",
  389: "deliverable — build & output gating",
  17: "email — send path & API routes",
  4906: "deliverable — templates",
  178: "reports — /r routes & location lib",
  37: "charts — components (B)",
  67: "highlighter & its API routes",
  28: "charts — components (C)",
  58: "assistant — proof scripts & Claude hooks",
  76: "assistant — listings answers",
  64: "reports — /r pages",
  2869: "refinery — packs & sources (B)",
  281: "ingest — shared lib & pipelines",
  52: "refinery — sources (B)",
  263: "charts — components (D)",
  69: "why-this-matters explainers",
  176: "charts + shared UI components",
  87: "listings — buyer lane",
  68: "email — recipes (B)",
  102: "email — export & API",
  3928: "ingest — DuckDB pipelines",
  8: "embeds & charts",
  661: "email — rate limiting & API",
  114: "chat & project assistant",
  3795: "social — posts & scripts",
  4279: "email — recipes (C)",
  65: "ingest — scripts & tests",
  13: "charts — lib & routes",
  512: "ZIP summaries & narratives",
  33: "briefcase",
  70: "ingest — tests",
  56: "project — pages",
  75: "assistant — build lane",
  40: "deliverable — misc",
  84: "ingest — pipeline tests",
  111: "email — recipes (D)",
  172: "ingest — lib tests",
  21: "landing page & highlighter",
  866: "email — recipes (E)",
  1703: "ZIP & welcome surfaces",
  26: "signals & project",
  126: "billing & Stripe",
  35: "email lab",
  79: "engine on/off switch",

  // App plane and non-source clusters. These carry `api_route:` / `brain:` /
  // `slug:` / `package_` style ids rather than file paths, so the directory
  // heuristic below cannot reach them -- and they are among the most useful
  // clusters in the graph (the brain dependency graph lives here).
  95: "skills — what-do-we-have index",
  4122: "package.json — devDependencies",
  166: "package.json — dependencies",
  3833: "brain graph — logistics & labor slugs",
  92: "package.json — scripts",
  225: "Fable5 desk — collection log",
  5793: "lake — DuckDB source & MCP tools",
  88: "session notes — brain MCP evaluation",
  122: "API routes — charts, meter & project actions",
  50: "API routes — contacts & blast",
  1518: "API routes — assistant & brain endpoints",
  119: "brain graph — macro & credit slugs",
  331: "GHA scripts — cron failure classify & heal",
  772: "brain graph — CRE corridor slugs",
  355: "audit & roadmap — deliverable follow-ups",
  168: "API routes — deliverable edit / refresh / revoke",
  290: "CLAUDE.md — rules",
  1065: "API routes — contact sync & Google OAuth",
};

/**
 * Path-prefix -> plain-English area, for the size>=25 communities below the
 * hand-named tier. Derived from the dominant prefix of the member list, so the
 * name is a measurement of where the cluster lives rather than a guess about
 * what it means. Longest prefix wins.
 */
const AREA = [
  ["refinery_sources", "refinery — sources"],
  ["refinery_packs", "refinery — packs"],
  ["refinery_constitution", "refinery — constitution"],
  ["refinery_stages", "refinery — stages"],
  ["refinery_agents", "refinery — agents"],
  ["refinery_validate", "refinery — validators"],
  ["refinery_tools", "refinery — tools"],
  ["refinery_lib", "refinery — lib"],
  ["refinery_types", "refinery — types"],
  ["refinery", "refinery"],
  ["components_email", "email — lab components"],
  ["components_charts", "charts — components"],
  ["components_project", "project — components"],
  ["components_ui", "shared UI components"],
  ["components", "components"],
  ["scripts_email", "email — scripts"],
  ["scripts_social", "social — scripts"],
  ["scripts_stripe", "billing — scripts"],
  ["scripts_prove", "proof scripts"],
  ["scripts", "scripts"],
  ["ingest_duckdb", "ingest — DuckDB pipelines"],
  ["ingest_pipelines", "ingest — pipelines"],
  ["ingest_tests", "ingest — tests"],
  ["ingest_scripts", "ingest — scripts"],
  ["ingest_lib", "ingest — lib"],
  ["ingest", "ingest"],
  ["lib_email", "email"],
  ["lib_deliverable", "deliverable"],
  ["lib_listings", "listings"],
  ["lib_assistant", "assistant"],
  ["lib_narratives", "narratives"],
  ["lib_project", "project"],
  ["lib_social", "social"],
  ["lib_charts", "charts — lib"],
  ["lib_brand", "branding"],
  ["lib_billing", "billing"],
  ["lib_zip", "ZIP surfaces"],
  ["lib_geo", "geo"],
  ["lib_location", "location"],
  ["lib_chat", "chat"],
  ["lib_signals", "signals"],
  ["lib_briefcase", "briefcase"],
  ["lib_highlighter", "highlighter"],
  ["lib_landing", "landing page"],
  ["lib_lab", "email lab"],
  ["lib_export", "export"],
  ["lib_reso", "RESO / MLS feed"],
  ["lib", "lib"],
  ["app_api", "API routes"],
  ["app_project", "project — pages"],
  ["app_email", "email — pages"],
  ["app_social", "social — pages"],
  ["app_embed", "embeds"],
  ["app_welcome", "welcome surface"],
  ["app_r", "reports — /r"],
  ["app", "app"],
  ["research_competitor", "research — competitor & strategy"],
  ["research", "research docs"],
  ["docs", "docs"],
  ["claude_hooks", "Claude hooks"],
  ["claude_skills", "Claude skills"],
  ["claude_session", "session notes"],
  ["claude_rule", "CLAUDE.md — rules"],
  ["claude", "CLAUDE.md"],
  ["database_generated", "generated DB types"],
  // App-plane id shapes -- not file paths, so these are matched as-is.
  ["api_route:", "API routes"],
  ["app_component:", "app components"],
  ["brain:", "brain graph"],
  ["slug:", "brain graph — metric slugs"],
  ["package_devdependencies", "package.json — devDependencies"],
  ["package_dependencies", "package.json — dependencies"],
  ["package_scripts", "package.json — scripts"],
  ["package", "package.json"],
  ["github_scripts", "GHA scripts"],
  ["github", "GitHub workflows"],
  ["tools_lake", "lake tools"],
  ["fable5", "Fable5 desk"],
  ["audit_and", "audit & roadmap"],
];

const analysis = JSON.parse(readFileSync(ANALYSIS, "utf-8"));
const labels = JSON.parse(readFileSync(LABELS, "utf-8"));
const communities = analysis.communities;

/** Most common `depth`-segment path prefix across a community's members. */
function dominantPrefix(members, depth) {
  const counts = new Map();
  for (const m of members) {
    const p = String(m).split("_").slice(0, depth).join("_");
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [p, n] of counts) {
    if (n > bestN) {
      best = p;
      bestN = n;
    }
  }
  return { prefix: best, n: bestN };
}

function areaFor(prefix) {
  // Longest match wins, so `refinery_sources` beats bare `refinery`.
  let hit = null;
  for (const [pfx, name] of AREA) {
    if (prefix?.startsWith(pfx) && (!hit || pfx.length > hit[0].length)) hit = [pfx, name];
  }
  return hit?.[1] ?? null;
}

const eligible = Object.entries(communities)
  .map(([id, members]) => ({ id, size: members.length, members }))
  .filter((c) => c.size >= MIN_SIZE)
  .sort((a, b) => b.size - a.size);

// Disambiguate repeats: several distinct clusters legitimately live in the same
// directory, and three communities all called "email" is no better than three
// called `shared.ts`. Suffix them (B), (C), ... in descending size order.
const seen = new Map();
let hand = 0;
let derived = 0;
let skipped = 0;
const changes = [];

for (const c of eligible) {
  if (HAND_NAMED[c.id]) {
    // F3 guard, from docs/superpowers/specs/2026-08-11-graph-compartments-design.md:
    // labels re-attach by node overlap (cli.py:1824), so after a membership shift a
    // stale name can land on the wrong group. The spec's guard is that the label sit
    // next to its dominant folder and purity, "so a wrong name is visibly wrong rather
    // than quietly trusted." The derived names below get that for free; a hand-written
    // name would not, so it is stamped with the same share. If `refinery — source
    // adapters · 31%` ever shows up, the low purity says the name drifted off its group.
    const { n } = dominantPrefix(c.members, 2);
    const share = Math.round((100 * n) / c.size);
    const name = `${HAND_NAMED[c.id]} · ${share}%`;
    seen.set(HAND_NAMED[c.id], (seen.get(HAND_NAMED[c.id]) ?? 0) + 1);
    changes.push([c.id, labels[c.id], name, c.size]);
    hand++;
    continue;
  }
  const { prefix, n } = dominantPrefix(c.members, 2);
  let area = areaFor(prefix) ?? areaFor(dominantPrefix(c.members, 1).prefix);
  if (!area) {
    skipped++;
    continue;
  }
  const share = Math.round((100 * n) / c.size);
  const count = (seen.get(area) ?? 0) + 1;
  seen.set(area, count);
  // The letter is only meaningful past the first; A is implied.
  const suffix = count > 1 ? ` (${String.fromCharCode(64 + count)})` : "";
  const name = `${area}${suffix} · ${share}%`;
  changes.push([c.id, labels[c.id], name, c.size]);
  derived++;
}

for (const [id, , name] of changes) labels[id] = name;

console.log(`communities total        ${Object.keys(communities).length}`);
console.log(`size >= ${MIN_SIZE}                ${eligible.length}`);
console.log(`  hand-written names     ${hand}`);
console.log(`  derived from prefix    ${derived}`);
console.log(`  skipped (no area map)  ${skipped}`);
console.log(`\nfirst 25 renames (id | size | before -> after):`);
for (const [id, before, after, size] of changes.slice(0, 25)) {
  console.log(`  ${id.padStart(5)} | ${String(size).padStart(4)} | ${String(before)} -> ${after}`);
}

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
} else {
  if (existsSync(LABELS)) copyFileSync(LABELS, `${LABELS}.pre-handname.bak`);
  writeFileSync(LABELS, JSON.stringify(labels, null, 2), "utf-8");
  console.log(`\nwrote ${changes.length} names -> ${LABELS} (backup: ${LABELS}.pre-handname.bak)`);
  console.log(
    "GRAPH_REPORT.md picks these up on the next rebuild. Do NOT reach for\n" +
      "`graphify cluster-only` to force it -- graph-compartments.md §2.1 documents that it\n" +
      "drops the app plane, refuses to write on the net node loss, prints a plausible\n" +
      "community count anyway and exits 1, and §2.2 that --force does not override the\n" +
      "refusal on that subcommand. The post-commit hook (RULE 0.5b R6) rebuilds via\n" +
      "`graphify update`, which is the path that actually honors --force.",
  );
}
