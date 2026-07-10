import { computeCostUsd, SYNTHESIS_MODEL } from "../../refinery/agents/anthropic.mts";
import { NARRATIVE_MAX_TOKENS } from "./prompt";

/**
 * Pre-submit run-cap sizing for the batch bake — a LABELED estimate, never a
 * measurement: chars/4 ≈ input tokens, plus the full output ceiling, priced at
 * BATCH rates via the one cost root (computeCostUsd batch flag). Real spend is
 * logged from returned usage at collection; this only sizes the submission.
 */
export function estimateRequestUsd(promptChars: number): number {
  return computeCostUsd(
    SYNTHESIS_MODEL,
    { input_tokens: Math.ceil(promptChars / 4), output_tokens: NARRATIVE_MAX_TOKENS },
    { batch: true },
  );
}

/** Greedy in-order fit against the cap; dropped items are reported, never silent. */
export function sizeToCap<T extends { promptChars: number }>(
  items: T[],
  capUsd: number,
): { fit: T[]; dropped: T[]; estimatedUsd: number } {
  const fit: T[] = [];
  const dropped: T[] = [];
  let estimatedUsd = 0;
  for (const item of items) {
    const cost = estimateRequestUsd(item.promptChars);
    if (estimatedUsd + cost <= capUsd) {
      fit.push(item);
      estimatedUsd += cost;
    } else {
      dropped.push(item);
    }
  }
  return { fit, dropped, estimatedUsd };
}
