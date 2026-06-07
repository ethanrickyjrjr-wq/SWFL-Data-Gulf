import { fetchBrain, buildDossier } from "../fetch-brain";
import { BRAIN_CATALOG } from "@/refinery/packs/catalog.mts";
import type { GroundingBlock } from "./grounding";

function labelFor(slug: string): string {
  const entry = BRAIN_CATALOG.find((e) => e.id === slug);
  return entry ? `${entry.scope} (${slug})` : slug;
}

/** Fetch + dossier-ify each reach slug into a labeled grounding block. Tolerant: skips failures. */
export async function fetchReachBlocks(
  slugs: string[],
  opts: { origin?: string },
): Promise<GroundingBlock[]> {
  const blocks: GroundingBlock[] = [];
  for (const slug of slugs) {
    try {
      const { output, freshness_token } = await fetchBrain(slug, {
        tier: 2,
        origin: opts.origin,
      });
      blocks.push({
        label: labelFor(slug),
        dossier: buildDossier(output, freshness_token),
      });
    } catch {
      // missing/broken brain — skip, never abort the answer
    }
  }
  return blocks;
}
