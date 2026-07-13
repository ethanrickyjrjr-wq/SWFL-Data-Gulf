import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PackDefinition } from "../types/pack.mts";
import { packCodeChanged } from "./pack-hash.mts";

/**
 * In-memory DAG resolver over the pack registry.
 *
 * The graph is defined by `PackDefinition.input_brains` — every edge points
 * from a downstream pack to its upstream(s). Build order is reverse-postorder
 * over this graph. Cycle detection is three-color DFS; a back-edge throws
 * with the full cycle path so the author can see which input_brains chain
 * forms the loop.
 *
 * NO I/O for the topology operations — they are pure functions over the
 * in-memory PACKS record. `brainStatus()` reads the rendered .md file to
 * answer freshness questions, but that is the only thing on disk.
 */

const BRAINS_DIR = path.join(process.cwd(), "brains");

/**
 * Topologically sort the dependency closure of `targetId`. Result is the
 * full build order: every upstream appears before any pack that consumes it,
 * and `targetId` is the last element. Throws on cycles or missing pack ids.
 */
export function resolveBuildOrder(
  targetId: string,
  PACKS: Record<string, PackDefinition>,
): string[] {
  const visited = new Set<string>(); // fully processed
  const inStack = new Set<string>(); // currently in DFS path
  const order: string[] = [];

  function dfs(id: string, trail: string[]): void {
    if (visited.has(id)) return;
    if (inStack.has(id)) {
      const start = trail.indexOf(id);
      const cycle = [...trail.slice(start), id].join(" → ");
      throw new Error(`DAG: cycle detected — ${cycle}`);
    }
    const pack = PACKS[id];
    if (!pack) {
      const known = Object.keys(PACKS).join(", ") || "(none)";
      throw new Error(`DAG: pack "${id}" not found in registry. Known packs: ${known}`);
    }
    inStack.add(id);
    for (const upstream of pack.input_brains) {
      dfs(upstream.id, [...trail, id]);
    }
    inStack.delete(id);
    visited.add(id);
    order.push(id);
  }

  dfs(targetId, []);
  return order;
}

/**
 * Reverse walk — every pack id that lists `brainId` in its `input_brains`.
 * Used by `--list-consumers` and by future staleness invalidation (when X
 * is rebuilt, downstream consumers may want a heads-up).
 */
export function walkConsumers(brainId: string, PACKS: Record<string, PackDefinition>): string[] {
  return Object.values(PACKS)
    .filter((p) => p.input_brains.some((e) => e.id === brainId))
    .map((p) => p.id)
    .sort();
}

/**
 * Forward walk — every ancestor of `brainId` in the input_brains DAG. The
 * adjoint of `walkConsumers`: where consumers asks "who reads me?", upstream
 * asks "who fed me, transitively?". Used by the attribution engine to
 * enumerate the full provenance closure of a low-confidence brain output.
 *
 * Semantics mirror walkConsumers:
 *   - Tolerant of missing pack ids (unknown root or unknown upstream → skipped).
 *   - Result is alphabetically sorted, deduplicated, and excludes `brainId`
 *     itself.
 *   - Cycle-safe via a visited set (we never re-enter a node, so a back-edge
 *     in the registry does not loop). resolveBuildOrder is still the place
 *     that THROWS on cycles; walkUpstream is read-only telemetry and stays
 *     soft so it works even on a partially-broken registry.
 */
export function walkUpstream(brainId: string, PACKS: Record<string, PackDefinition>): string[] {
  const visited = new Set<string>();

  function visit(id: string): void {
    const pack = PACKS[id];
    if (!pack) return; // unknown id — skip (matches walkConsumers tolerance)
    for (const upstream of pack.input_brains) {
      if (visited.has(upstream.id)) continue;
      visited.add(upstream.id);
      visit(upstream.id);
    }
  }

  visit(brainId);
  visited.delete(brainId); // defensive — a cycle could re-add self
  return Array.from(visited).sort();
}

/** Frontmatter scalar reader — matches the parser in master-source / spec-validator. */
function frontmatterValue(md: string, key: string): string | null {
  const fm = md.match(/^(?:<!--[\s\S]*?-->\s*)?---\n([\s\S]*?)\n---\n/);
  if (!fm) return null;
  for (const line of fm[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    if (line.slice(0, idx).trim() === key) return line.slice(idx + 1).trim();
  }
  return null;
}

export type BrainStatus =
  | { kind: "missing" }
  | { kind: "fresh"; expires_at: string; refined_at: string }
  | { kind: "stale"; expires_at: string; refined_at: string };

/**
 * Read `brains/{brainId}.md` and report freshness. Used by the CLI's DAG
 * walk to decide whether an upstream needs rebuilding before the target.
 *
 *   missing → hard error path (user must build it first, or `--force` triggers a build)
 *   stale   → warn + rebuild; staleness caveat is auto-appended via Stage 4 when not rebuilt
 *   fresh   → skip rebuild (cached output is valid)
 */
export async function brainStatus(brainId: string): Promise<BrainStatus> {
  const filePath = path.join(BRAINS_DIR, `${brainId}.md`);
  let md: string;
  try {
    md = (await readFile(filePath, "utf-8")).replace(/\r\n/g, "\n");
  } catch {
    return { kind: "missing" };
  }
  const refinedAt = frontmatterValue(md, "refined_at");
  const ttlStr = frontmatterValue(md, "ttl_seconds");
  if (!refinedAt || !ttlStr) return { kind: "missing" };

  const ttl = parseInt(ttlStr, 10);
  const refinedMs = Date.parse(refinedAt);
  if (!Number.isFinite(ttl) || !Number.isFinite(refinedMs)) {
    return { kind: "missing" };
  }

  const expiresMs = refinedMs + ttl * 1000;
  const expiresAt = new Date(expiresMs).toISOString().slice(0, 10);

  // CODE CHANGE BEATS THE TTL. A data-age TTL cannot see that the pack was fixed,
  // so a pack change inside the window is skipped as "fresh" forever: the 07/10
  // ZIP-scope fix shipped to main and every daily rebuild since said "housing-swfl
  // is fresh — skip", leaving a 06/29 artifact carrying Bradenton and Sarasota in
  // front of every user for two weeks. `pack_hash` stamps the source the brain was
  // built from; if the pack on disk no longer matches, the brain IS stale no matter
  // how young its data is. Pre-stamp brains return false here (see pack-hash.mts),
  // so merging this can never touch off an unapproved mass rebuild.
  const codeChanged = packCodeChanged(brainId, frontmatterValue(md, "pack_hash"));
  const stale = codeChanged || Date.now() > expiresMs;
  return {
    kind: stale ? "stale" : "fresh",
    expires_at: expiresAt,
    refined_at: refinedAt,
  };
}
