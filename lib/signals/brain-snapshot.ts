/**
 * brain-snapshot — batch-fetches current brain values for all metric items
 * in a project and evaluates which have moved significantly since the snapshot
 * was filed.
 *
 * Server-side only: uses lookupLakeFact (loadParsedBrain disk reads).
 * Called from app/project/[id]/page.tsx before buildProjectDigest.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { ProjectItem } from "@/lib/project/items";
import type { SignificantChange, SignificanceRegistry } from "./types";
import { evaluateChange } from "./change-evaluator";
import { isConfirmed, type ConfirmedValues } from "./confirmed-values";
import { lookupLakeFact } from "@/lib/reconcile/lane1";

let _registry: SignificanceRegistry | null = null;

/**
 * Load and cache the significance registry from ingest/significance-registry.yaml.
 * Parsed once per process; subsequent calls return the cached object.
 */
export function loadSignificanceRegistry(): SignificanceRegistry {
  if (_registry) return _registry;
  const path = join(process.cwd(), "ingest", "significance-registry.yaml");
  const raw = readFileSync(path, "utf-8");
  _registry = parse(raw) as SignificanceRegistry;
  return _registry;
}

/**
 * Batch-fetch current brain values for all metric items, run the significance
 * evaluator on each snapshot→current pair, and return changes that cleared their
 * registry thresholds, ranked by priority desc.
 *
 * @param items     All project items (only kind==="metric" are evaluated)
 * @param registry  Loaded via loadSignificanceRegistry()
 * @param zip       Reserved / legacy. Per-item scope now drives the lookup
 *                  (Gate 1 A2) — the project-level zip is no longer substituted
 *                  for a missing item scope. Retained for call-site compatibility.
 * @param limit     Max results returned (default 5)
 */
export async function computeSignificantChanges(
  items: ProjectItem[],
  registry: SignificanceRegistry,
  zip?: string,
  confirmedValues?: ConfirmedValues,
  limit = 5,
): Promise<SignificantChange[]> {
  const metrics = items.filter(
    (i): i is Extract<ProjectItem, { kind: "metric" }> => i.kind === "metric",
  );
  if (metrics.length === 0) return [];

  // Per-call dedup: cache the Promise so concurrent Promise.all branches that share
  // the same key get the same in-flight request, not N separate disk reads.
  const cache = new Map<string, ReturnType<typeof lookupLakeFact>>();

  const changes: SignificantChange[] = [];

  await Promise.all(
    metrics.map(async (item) => {
      // Gate 1 A1: no metric_slug → can't verify same exact data → silent.
      // The label is NOT a reliable metric identity (a human label like "Median
      // Price" can map to different series; only the slug is stable).
      if (!item.metric_slug) return;
      const slug = item.metric_slug;

      // Phase F F2/F4: a value the user confirmed at THIS exact filed value never
      // re-alerts. A later edit changes item.value → key differs → not suppressed.
      if (isConfirmed(confirmedValues, item.id, item.value)) return;

      // Gate 1 A2: look the metric up at its OWN filed scope — NEVER substitute
      // the project-level zip for a missing/different item scope. Comparing the
      // user's number against a different grain is the exact apples-to-oranges
      // this gate exists to kill (operator: "SAME EXACT DATA … we don't worry
      // unless we know for sure").
      //   zip + scope_value → ZIP-drilled lookup (the one grain lookupLakeFact targets)
      //   explicit non-zip  → headline lookup (no zip); grain is carried by the slug
      //   zip w/o a value   → can't target the ZIP → silent
      //   no scope at all   → unknown grain (legacy pre-3A) → silent; fires again
      //                       once the item is refiled with a scope
      let itemZip: string | undefined;
      if (item.scope_kind === "zip") {
        if (!item.scope_value) return;
        itemZip = item.scope_value;
      } else if (item.scope_kind) {
        itemZip = undefined;
      } else {
        return;
      }

      const key = `${item.report_id}|${slug}|${itemZip ?? ""}`;

      if (!cache.has(key)) {
        cache.set(key, lookupLakeFact(item.report_id, slug, itemZip));
      }
      const fact = await cache.get(key)!;

      if (!fact) return;

      const currentValue = String(fact.value);
      const change = evaluateChange(slug, item.id, item.label, item.value, currentValue, registry);
      if (change) changes.push(change);
    }),
  );

  return changes.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
