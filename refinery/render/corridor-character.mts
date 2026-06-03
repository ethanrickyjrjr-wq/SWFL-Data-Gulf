/**
 * Corridor character render composer — validates and bundles chart + facts + speculative.
 *
 * Step 4 of the corridor-character generator plan. Reads a `CorridorNormalized` DB row's
 * character fields and validates the `character_chart` field (typed `unknown` in the DB)
 * before casting to a `ChartBlock`.
 *
 * Pattern: simple degrades — no crash on invalid chart, just `chart: null` on output.
 */

import {
  lintChartBlock,
  type ChartBlock,
} from "../validate/chart-block-lint.mts";

/**
 * Result of composing a corridor's character render data.
 * chart is null when character_chart is absent or fails structural lint.
 */
export interface CorridorCharacterRender {
  facts: string | null;
  speculative: string | null;
  chart: ChartBlock | null;
}

/**
 * Composes render data for a corridor from DB row fields.
 * character_chart is typed unknown in the DB row — validate before casting.
 * Degrades silently on invalid chart (no crash, no chart rendered).
 *
 * @param opts.characterFacts - Tier 1/2 facts block or null
 * @param opts.characterSpeculative - Speculative block (carries its own inline disclaimer) or null
 * @param opts.characterChart - The raw chart block from DB (typed unknown), may be null
 * @returns CorridorCharacterRender with chart set to null if validation fails
 */
export function composeCorridorCharacterRender(opts: {
  characterFacts: string | null;
  characterSpeculative: string | null;
  characterChart: unknown;
}): CorridorCharacterRender {
  const { characterFacts, characterSpeculative, characterChart } = opts;

  // Validate structural integrity before casting to ChartBlock.
  // factPackNumbers is null here (structural-only validation — we don't have the fact pack).
  const lint = lintChartBlock(characterChart);
  const chart: ChartBlock | null =
    lint.ok && characterChart !== null ? (characterChart as ChartBlock) : null;

  return {
    facts: characterFacts,
    speculative: characterSpeculative,
    chart,
  };
}
