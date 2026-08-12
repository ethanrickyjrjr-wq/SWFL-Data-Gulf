#!/usr/bin/env node
// scripts/graphify-compartments-report.mjs
//
// Reports the compartmentalization metrics of graphify-out/graph.json.
//
// METRIC DEFINITIONS — these are the exact formulas that produced the tables in
// docs/handoff/2026-08-12-graph-compartments-step2-negative-result.md §3 and §4b.
// Do not change them without re-measuring that handoff:
//
//   singleton  = a community whose size is exactly 1 node
//   cross%     = share of edges whose two endpoints sit in DIFFERENT communities
//   code plane = nodes carrying a `community` field (graphify's Leiden output)
//   app plane  = nodes merged in by scripts/graphify-app-nodes.mjs AFTER clustering,
//                which therefore carry NO community field
//
// Pure function of the graph on disk — no LLM call, no network.

import { pathToFileURL } from "node:url";

/**
 * @param {{nodes: Array<object>, links?: Array<object>, edges?: Array<object>}} graph
 */
export function computeCompartmentMetrics(graph) {
  const communityOf = new Map();
  for (const n of graph.nodes) {
    if (n.community !== undefined) communityOf.set(n.id, n.community);
  }

  const sizes = new Map();
  for (const c of communityOf.values()) sizes.set(c, (sizes.get(c) || 0) + 1);

  // An edge with an endpoint that carries no community (i.e. an app-plane node)
  // is EXCLUDED from the denominator, not counted as a cross edge — it has no
  // community to be inside or outside of.
  const crossShare = (edgeList) => {
    let cross = 0;
    let counted = 0;
    for (const e of edgeList ?? []) {
      const s = communityOf.get(e.source);
      const t = communityOf.get(e.target);
      if (s === undefined || t === undefined) continue;
      counted++;
      if (s !== t) cross++;
    }
    return counted ? Math.round((1000 * cross) / counted) / 10 : 0;
  };

  const singletonCommunities = new Set(
    [...sizes.entries()].filter(([, size]) => size === 1).map(([c]) => c),
  );
  const byExt = new Map();
  for (const n of graph.nodes) {
    if (n.community === undefined) continue;
    if (!singletonCommunities.has(n.community)) continue;
    const base = (n.source_file ?? "").split(/[\\/]/).pop() ?? "";
    const dot = base.lastIndexOf(".");
    const ext = dot > 0 ? base.slice(dot) : "(none)";
    byExt.set(ext, (byExt.get(ext) || 0) + 1);
  }

  return {
    nodes: graph.nodes.length,
    codePlaneNodes: communityOf.size,
    appPlaneNodes: graph.nodes.length - communityOf.size,
    links: (graph.links ?? []).length,
    edges: (graph.edges ?? []).length,
    communities: sizes.size,
    singletons: [...sizes.values()].filter((v) => v === 1).length,
    crossPct: crossShare(graph.links),
    crossPctMerged: crossShare(graph.edges),
    singletonsByExtension: [...byExt.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    ),
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
// Not under test by design (see the handoff §4d: "parsing graph.json and
// printing are not" the unit under test — computeCompartmentMetrics is).

// Reference row: the last measured state, docs/handoff/2026-08-12-…-step2-negative-result.md §4b.
// Printed alongside live numbers so drift is visible instead of inferred.
const BASELINE = {
  as_of: "08/12/2026",
  label: "§4b post-SQL-extractor",
  communities: 4069,
  singletons: 1434,
  crossPct: 16.7,
};

async function main() {
  const { readFileSync, statSync } = await import("node:fs");
  const { execSync } = await import("node:child_process");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const graphPath = join(root, "graphify-out", "graph.json");

  let graph;
  try {
    graph = JSON.parse(readFileSync(graphPath, "utf8"));
  } catch (err) {
    console.error(`Cannot read ${graphPath}: ${err.message}`);
    console.error(
      "Graph artifacts are gitignored build products. Rebuild with:\n" +
        "  graphify update . --force && graphify cluster-only . --resolution 1.0 --no-viz && node scripts/graphify-app-nodes.mjs",
    );
    process.exit(1);
  }

  const m = computeCompartmentMetrics(graph);
  const pad = (v, w) => String(v).padStart(w);

  // GUARD — which plane was measured. A reader must never have to assume.
  const merged = m.appPlaneNodes > 0;
  console.log(`graph      ${graphPath}`);
  console.log(`built      ${statSync(graphPath).mtime.toISOString()}`);
  console.log(
    `plane      ${merged ? "MERGED (code + app)" : "CODE PLANE ONLY (app plane not merged)"}`,
  );
  if (!merged) {
    console.log(
      "           ^ node/edge totals here are NOT comparable to any merged figure in\n" +
        "             SESSION_LOG or the handoff. Run node scripts/graphify-app-nodes.mjs.",
    );
  }

  // GUARD — freshness. built_at_commit vs current HEAD.
  const built = graph.built_at_commit;
  if (built) {
    let note = "";
    try {
      const head = execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
      if (head === built) {
        note = " (= HEAD)";
      } else {
        const behind = execSync(`git rev-list --count ${built}..HEAD`, {
          cwd: root,
        })
          .toString()
          .trim();
        note = ` (${behind} commits behind HEAD — rebuild before trusting these numbers)`;
      }
    } catch {
      note = " (could not compare against HEAD)";
    }
    console.log(`commit     ${built.slice(0, 8)}${note}`);
  }

  console.log("");
  console.log(
    `nodes      ${pad(m.nodes, 7)}   code plane ${pad(m.codePlaneNodes, 7)}   app plane ${pad(m.appPlaneNodes, 5)}`,
  );
  console.log(`edges      ${pad(m.edges, 7)}   links (code plane) ${pad(m.links, 7)}`);
  console.log("");
  console.log("COMPARTMENT METRICS — code plane, computed off `links`");
  console.log(
    `  communities        ${pad(m.communities, 7)}   baseline ${pad(BASELINE.communities, 7)}`,
  );
  console.log(
    `  singletons         ${pad(m.singletons, 7)}   baseline ${pad(BASELINE.singletons, 7)}`,
  );
  console.log(
    `  cross-community %  ${pad(m.crossPct.toFixed(1), 7)}   baseline ${pad(BASELINE.crossPct.toFixed(1), 7)}`,
  );
  console.log(`  (baseline = ${BASELINE.label}, measured ${BASELINE.as_of})`);
  console.log("");
  console.log(
    "  READING A DIFFERENCE: Leiden is stochastic here — two runs at identical parameters",
  );
  console.log(
    "  returned 2,842 and 2,836 communities. `communities` and `cross-community %` carry",
  );
  console.log("  roughly +/-0.2% noise; a difference of tens of communities is NOT signal.");
  console.log(
    "  `singletons` is the number that is supposed to be STABLE (it sat at exactly 1,270",
  );
  console.log("  across three resolutions) — any change to it is worth chasing. See");
  console.log("  docs/standards/graph-compartments.md §1.");
  console.log("");
  console.log(
    `  cross-community % over the MERGED \`edges\` array: ${m.crossPctMerged.toFixed(1)}`,
  );
  console.log("  ^ a DIFFERENT number under the same words. Every figure in the handoff's");
  console.log("    §3/§4b tables is the code-plane one above. Do not quote these two together.");

  console.log("");
  console.log("SINGLETONS BY SOURCE-FILE EXTENSION");
  for (const [ext, n] of m.singletonsByExtension.slice(0, 12)) {
    console.log(`  ${ext.padEnd(12)} ${pad(n, 6)}`);
  }
  const shown = m.singletonsByExtension.slice(0, 12).reduce((a, [, n]) => a + n, 0);
  if (shown < m.singletons) {
    console.log(`  ${"(rest)".padEnd(12)} ${pad(m.singletons - shown, 6)}`);
  }
}

// Only run the CLI when invoked directly, never on import from the test.
// pathToFileURL, not string concatenation — on Windows the hand-rolled form
// yields file://C:/... against import.meta.url's file:///C:/... and the CLI
// silently no-ops (hit while building this, 08/12/2026).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
