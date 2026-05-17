/**
 * Constitution registry + loader.
 *
 * Spec: docs/v3-synthesis-spec.md §3.
 *
 * `loadConstitution(domains)` returns a single merged Constitution covering
 * every requested domain. The merge is pure and deterministic:
 *  - `domains`             — union, dedup-preserving input order.
 *  - `relevance_floor`     — minimum (most-permissive floor wins).
 *  - `overrideCascade`     — concat then sort by `priority` DESCENDING, so
 *                             iteration order is evaluation order.
 *  - `absoluteConstraints` — concat.
 *  - `domainHierarchy`     — concat.
 *  - `caveatGenerators`    — concat.
 *
 * Unknown domains throw. The friction is the feature — a typo or a new
 * domain should not silently degrade synthesis.
 *
 * Wiring note: callers (master synthesizer in Stage 4) are added in a later
 * commit. This module is currently authored but un-called.
 */

import type { BrainDomain } from "../types/pack.mts";
import type { Constitution } from "./types.mts";
import { financeConstitution } from "./finance.mts";
import { hospitalityConstitution } from "./hospitality.mts";
import { macroConstitution } from "./macro.mts";
import { realEstateConstitution } from "./real-estate.mts";

/**
 * Domain-keyed registry. `Partial` because not every BrainDomain has a
 * constitution yet — the loader throws on lookup misses with a fixable
 * error pointing at this directory.
 */
const REGISTRY: Partial<Record<BrainDomain, Constitution>> = {
  "real-estate": realEstateConstitution,
  finance: financeConstitution,
  hospitality: hospitalityConstitution,
  macro: macroConstitution,
};

/**
 * Merge any number of Constitutions into one. Pure function — no I/O, no
 * side effects, safe to call repeatedly.
 */
export function loadConstitution(domains: BrainDomain[]): Constitution {
  if (domains.length === 0) {
    throw new Error(
      "loadConstitution: at least one domain is required (got empty array)",
    );
  }

  const resolved: Constitution[] = domains.map((d) => {
    const c = REGISTRY[d];
    if (!c) {
      throw new Error(
        `loadConstitution: no constitution for domain "${d}" — add it to refinery/constitution/`,
      );
    }
    return c;
  });

  const mergedDomains: BrainDomain[] = [];
  const seen = new Set<BrainDomain>();
  for (const c of resolved) {
    for (const d of c.domains) {
      if (!seen.has(d)) {
        seen.add(d);
        mergedDomains.push(d);
      }
    }
  }

  const relevance_floor = Math.min(...resolved.map((c) => c.relevance_floor));

  const overrideCascade = resolved
    .flatMap((c) => c.overrideCascade)
    .slice()
    .sort((a, b) => b.priority - a.priority);

  return {
    domains: mergedDomains,
    relevance_floor,
    absoluteConstraints: resolved.flatMap((c) => c.absoluteConstraints),
    overrideCascade,
    domainHierarchy: resolved.flatMap((c) => c.domainHierarchy),
    caveatGenerators: resolved.flatMap((c) => c.caveatGenerators),
  };
}
