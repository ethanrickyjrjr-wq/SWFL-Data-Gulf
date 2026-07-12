// lib/concoctions/freshness.ts
//
// The zero-cost-open staleness check: compare each lake binding's cached asOf
// to the source's CURRENT asOf via the def's probeAsOf (metadata-scale query).
// One probe per distinct (dataset, params) pair — a doc with six blocks of one
// dataset costs ONE probe. No loaders beyond probeAsOf, no chart re-renders,
// no AI calls. "Can't refresh" (foreign version / unknown def / bad params) is
// NOT "stale" — those report { stale: false, currentAsOf: null }.
import type { EmailBlock } from "@/lib/email/doc/types";
import { BINDING_VERSION } from "@/lib/email/doc/types";
import { getConcoction } from "./registry";

export interface FreshnessEntry {
  stale: boolean;
  currentAsOf: string | null;
}

function probeKey(
  concoctionId: string,
  params: Record<string, string | number> | undefined,
): string {
  const sorted = Object.fromEntries(
    Object.entries(params ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  );
  return `${concoctionId}::${JSON.stringify(sorted)}`;
}

export async function checkDocFreshness(
  blocks: EmailBlock[],
  deps: { sb: unknown },
): Promise<Record<string, FreshnessEntry>> {
  const result: Record<string, FreshnessEntry> = {};
  const probes = new Map<string, Promise<string | null>>();

  for (const block of blocks) {
    const binding = block.binding;
    if (!binding || binding.lane !== "lake" || !binding.concoctionId) continue;

    if (binding.v !== BINDING_VERSION) {
      result[block.id] = { stale: false, currentAsOf: null };
      continue;
    }
    const def = getConcoction(binding.concoctionId);
    if (!def) {
      result[block.id] = { stale: false, currentAsOf: null };
      continue;
    }

    const key = probeKey(binding.concoctionId, binding.params);
    if (!probes.has(key)) {
      probes.set(
        key,
        (async () => {
          try {
            const parsed = def.params.parse(binding.params ?? {});
            const asOf = await def.probeAsOf(deps.sb, parsed);
            return asOf || null;
          } catch {
            return null; // can't probe → can't refresh, not stale
          }
        })(),
      );
    }
    const currentAsOf = await probes.get(key)!;
    result[block.id] =
      currentAsOf === null
        ? { stale: false, currentAsOf: null }
        : { stale: currentAsOf !== binding.asOf, currentAsOf };
  }
  return result;
}
