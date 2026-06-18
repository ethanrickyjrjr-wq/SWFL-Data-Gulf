// TEMPORARY PROBE — PROBE FIRST (cardinal ingest rule). Delete after.
// Measures the real cost of the project-feed change-detection cron BEFORE building it:
//   projects to scan · unique live ZIPs · brain load ms · per-ZIP cell read ms · feed query ms.
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { projectScopeSet } from "@/lib/project/project-scope";
import { loadParsedBrain } from "@/lib/fetch-brain";
import { factFromParsedBrain } from "@/lib/reconcile/lane1";

const BRAINS = [
  { report_id: "housing-swfl", slug: "median_sale_price" },
  { report_id: "rentals-swfl", slug: "rent_index_latest" },
];

function ms(t0: number): string {
  return `${(performance.now() - t0).toFixed(1)}ms`;
}

const db = createServiceRoleClient();

// 1. List all projects + items
let t = performance.now();
const { data: projects, error } = await db.from("projects").select("id,user_id,items");
console.log(
  `projects select: ${ms(t)} · error=${error?.message ?? "none"} · count=${projects?.length ?? 0}`,
);

// 2. Build unique ZIP set + zip->users map
const zipUsers = new Map<string, Set<string>>();
let zipScopedProjects = 0;
for (const p of projects ?? []) {
  const items = Array.isArray(p.items) ? p.items : [];
  let scopes;
  try {
    scopes = projectScopeSet(items as never);
  } catch (e) {
    console.log(`  scope derive threw for project ${p.id}: ${(e as Error).message}`);
    continue;
  }
  const zips = scopes.filter((s) => s.scope_kind === "zip").map((s) => s.scope_value);
  if (zips.length) zipScopedProjects++;
  for (const z of zips) {
    if (!zipUsers.has(z)) zipUsers.set(z, new Set());
    zipUsers.get(z)!.add(p.user_id);
  }
}
const uniqueZips = [...zipUsers.keys()];
console.log(`zip-scoped projects: ${zipScopedProjects} · unique live ZIPs: ${uniqueZips.length}`);
console.log(`  ZIPs: ${uniqueZips.slice(0, 30).join(", ")}${uniqueZips.length > 30 ? " …" : ""}`);

// 3. Brain load + per-ZIP cell read timing
for (const b of BRAINS) {
  t = performance.now();
  const brain = await loadParsedBrain(b.report_id);
  const loadMs = ms(t);
  if (!brain) {
    console.log(`brain ${b.report_id}: LOAD FAILED (null) in ${loadMs}`);
    continue;
  }
  t = performance.now();
  let hits = 0;
  const probeZips = uniqueZips.length ? uniqueZips : ["33901", "33908", "33931"];
  for (const z of probeZips) {
    const fact = factFromParsedBrain(b.report_id, brain, b.slug, z);
    if (fact) hits++;
  }
  console.log(
    `brain ${b.report_id}: load ${loadMs} · ${probeZips.length} cell reads in ${ms(t)} · ${hits} hits · token=${brain.freshness_token}`,
  );
}

// 4. Existing project_feed query cost (the prior-row lookup shape)
t = performance.now();
const { data: feedRows, error: fErr } = await db
  .from("project_feed")
  .select("id,user_id,scope_value,dedup_key,payload,created_at")
  .eq("kind", "data-change")
  .order("created_at", { ascending: false })
  .limit(500);
console.log(
  `project_feed data-change select: ${ms(t)} · error=${fErr?.message ?? "none"} · rows=${feedRows?.length ?? 0}`,
);

console.log("\n=== PROBE SUMMARY ===");
console.log(
  `reads per run = ${BRAINS.length} brain loads + ${BRAINS.length}×${uniqueZips.length} cell reads (in-memory)`,
);
console.log(
  `writes per run ≤ ${BRAINS.length} brains × unique(zip,user) pairs — only on a moved value`,
);
