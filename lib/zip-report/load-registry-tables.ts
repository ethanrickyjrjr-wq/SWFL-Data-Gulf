// lib/zip-report/load-registry-tables.ts
//
// Turns the ZIP page's loaded ParsedBrains into the flat packId:tableId -> rows
// map lib/zip-report/candidates.ts's registry loop reads. Spec: 2026-07-03
// zip-hero-pool-all-brains §2. Empty-tolerant: a missing brain, a missing table,
// or a pack the registry doesn't reference are all silently omitted — never throws.
import type { ParsedBrain } from "@/refinery/render/speaker.mts";
import { ZIP_METRIC_SOURCES, type RegistryTableData, type ZipDetailRow } from "./candidates";

/** Every distinct (packId, tableId) pair the registry reads from, deduplicated. */
function referencedTables(): { packId: string; tableId: string }[] {
  const seen = new Set<string>();
  const out: { packId: string; tableId: string }[] = [];
  for (const spec of ZIP_METRIC_SOURCES) {
    const k = `${spec.packId}:${spec.tableId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ packId: spec.packId, tableId: spec.tableId });
  }
  return out;
}

export function buildRegistryTableMap(
  brains: Map<string, ParsedBrain | null>,
): Map<string, RegistryTableData> {
  const out = new Map<string, RegistryTableData>();
  for (const { packId, tableId } of referencedTables()) {
    const brain = brains.get(packId);
    if (!brain) continue;
    const table = brain.output.detail_tables?.find((t) => t.id === tableId);
    if (!table || table.rows.length === 0) continue;
    const rows: ZipDetailRow[] = table.rows.map((r) => ({ key: r.key, cells: r.cells }));
    out.set(`${packId}:${tableId}`, {
      rows,
      source: { label: table.source.citation || packId, url: table.source.url },
    });
  }
  return out;
}
